import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import Parser from 'rss-parser';
import { SignalSchema } from '../lib/schema';
import { AgentLogger } from './logger';

type Source = {
  id: string;
  kind: 'rss' | 'html';
  url: string;
  signalType: 'regulatory' | 'practitioner';
  maxItems?: number;
};

const SOURCES: Source[] = [
  {
    id: 'eba',
    kind: 'rss',
    url: 'https://www.eba.europa.eu/rss.xml',
    signalType: 'regulatory',
    maxItems: 10
  },
  {
    id: 'esma',
    kind: 'html',
    url: 'https://www.esma.europa.eu/press-news/esma-news',
    signalType: 'regulatory',
    maxItems: 1
  },
  {
    id: 'fatf',
    kind: 'html',
    url: 'https://www.fatf-gafi.org/en/publications.html',
    signalType: 'regulatory',
    maxItems: 1
  },
  {
    id: 'oecd-dac8',
    kind: 'html',
    url: 'https://www.oecd.org/tax/automatic-exchange/crypto-asset-reporting-framework/',
    signalType: 'regulatory',
    maxItems: 1
  }
];

const USER_AGENT =
  process.env.CCF_SCOUT_USER_AGENT ??
  'crypto-compliance-framework-bot/1.0 (+https://example.invalid; contact=security@example.invalid)';

function sha256Short(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function safeFileName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function normalizeDate(input: string | undefined | null): string {
  if (!input) return new Date().toISOString();
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: ac.signal
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
    }

    // Hard cap to keep artifacts bounded.
    return text.slice(0, 200_000);
  } finally {
    clearTimeout(timer);
  }
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runScout(opts: {
  rootDirAbs: string;
  logger: AgentLogger;
  maxSignalsPerRun?: number;
}): Promise<{ createdSignalFiles: string[]; skipped: number; errors: number }> {
  const signalsDirAbs = path.join(opts.rootDirAbs, 'signals');
  await fs.mkdir(signalsDirAbs, { recursive: true });

  const parser = new Parser();

  const maxSignalsPerRun = opts.maxSignalsPerRun ?? Number(process.env.CCF_SCOUT_MAX_SIGNALS ?? 30);
  const requestDelayMs = Number(process.env.CCF_SCOUT_REQUEST_DELAY_MS ?? 1200);
  const timeoutMs = Number(process.env.CCF_SCOUT_TIMEOUT_MS ?? 25_000);

  const createdSignalFiles: string[] = [];
  let skipped = 0;
  let errors = 0;

  for (const source of SOURCES) {
    if (createdSignalFiles.length >= maxSignalsPerRun) break;

    await opts.logger.log({
      agent: 'scout',
      action: 'source.start',
      message: source.url,
      meta: { sourceId: source.id, kind: source.kind }
    });

    try {
      if (source.kind === 'rss') {
        const feed = await parser.parseURL(source.url);
        const items = (feed.items ?? []).slice(0, source.maxItems ?? 10);

        for (const item of items) {
          if (createdSignalFiles.length >= maxSignalsPerRun) break;

          const title = (item.title ?? '').trim() || `Untitled (${source.id})`;
          const summary =
            (item.contentSnippet ?? item.content ?? '').toString().trim().slice(0, 1200) ||
            'No summary available.';
          const link = (item.link ?? source.url).toString();
          const date = normalizeDate((item as any).isoDate ?? item.pubDate ?? (item as any).published);
          const rawContent =
            (item.contentSnippet ?? item.content ?? '').toString().trim().slice(0, 20_000) || summary;

          const signal = SignalSchema.parse({
            title,
            summary,
            source: link,
            date,
            type: source.signalType,
            rawContent
          });

          const base = `${date.slice(0, 10)}_${source.id}_${safeFileName(title)}_${sha256Short(
            `${signal.source}|${signal.title}|${signal.date}`
          )}`;
          const fileAbs = path.join(signalsDirAbs, `${base}.json`);

          try {
            await fs.access(fileAbs);
            skipped += 1;
            continue;
          } catch {
            // continue
          }

          await fs.writeFile(fileAbs, JSON.stringify(signal, null, 2) + '\n', 'utf8');
          createdSignalFiles.push(fileAbs);
          await opts.logger.log({
            agent: 'scout',
            action: 'signal.created',
            message: fileAbs,
            meta: { sourceId: source.id, kind: source.kind, title: signal.title }
          });
        }
      } else {
        const html = await fetchText(source.url, timeoutMs);
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        const title = (titleMatch?.[1] ?? source.id).trim();
        const text = stripHtmlToText(html);
        const summary = text.slice(0, 800) || `Fetched content from ${source.url}`;
        const date = new Date().toISOString();
        const rawContent = text.slice(0, 20_000) || html.slice(0, 20_000);

        const signal = SignalSchema.parse({
          title,
          summary,
          source: source.url,
          date,
          type: source.signalType,
          rawContent
        });

        // Use a content-derived key to avoid creating daily duplicates for slow-changing pages.
        const base = `${source.id}_${sha256Short(`${signal.source}|${rawContent.slice(0, 4000)}`)}`;
        const fileAbs = path.join(signalsDirAbs, `${base}.json`);

        try {
          await fs.access(fileAbs);
          skipped += 1;
        } catch {
          await fs.writeFile(fileAbs, JSON.stringify(signal, null, 2) + '\n', 'utf8');
          createdSignalFiles.push(fileAbs);
          await opts.logger.log({
            agent: 'scout',
            action: 'signal.created',
            message: fileAbs,
            meta: { sourceId: source.id, kind: source.kind, title: signal.title }
          });
        }
      }
    } catch (err) {
      errors += 1;
      await opts.logger.log({
        agent: 'scout',
        action: 'source.error',
        message: String(err),
        meta: { sourceId: source.id, url: source.url }
      });
    }

    await opts.logger.log({
      agent: 'scout',
      action: 'source.done',
      message: source.url,
      meta: { createdSoFar: createdSignalFiles.length }
    });

    await delay(requestDelayMs);
  }

  await opts.logger.log({
    agent: 'scout',
    action: 'run.summary',
    message: `created=${createdSignalFiles.length} skipped=${skipped} errors=${errors}`
  });

  return { createdSignalFiles, skipped, errors };
}
