import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { SignalSchema, TriageDecisionSchema } from '../lib/schema';
import { AgentLogger } from './logger';

function sha256Short(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 12);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 70);
}

const KEYWORDS = [
  'crypto',
  'crypto-asset',
  'digital asset',
  'virtual asset',
  'stablecoin',
  'token',
  'wallet',
  'travel rule',
  'transfer of funds',
  'mica',
  'aml',
  'cft',
  'sanctions',
  'fatf',
  'dac8',
  'casps',
  'vasp'
];

function isRelevant(text: string): boolean {
  const lower = text.toLowerCase();
  return KEYWORDS.some((k) => lower.includes(k));
}

function pickCategoryAndType(text: string): {
  category:
    | 'principles'
    | 'definitions'
    | 'compliance-journey'
    | 'analysis-models'
    | 'failure-patterns'
    | 'regulatory-context'
    | 'methodology'
    | 'use-cases';
  type:
    | 'principle'
    | 'definition'
    | 'journey'
    | 'failure-pattern'
    | 'model'
    | 'regulatory-context'
    | 'methodology'
    | 'use-case';
} {
  const lower = text.toLowerCase();

  if (lower.includes('definition') || lower.includes('glossary') || lower.includes('terminology')) {
    return { category: 'definitions', type: 'definition' };
  }
  if (
    lower.includes('consultation') ||
    lower.includes('guideline') ||
    lower.includes('regulation') ||
    lower.includes('directive') ||
    lower.includes('policy statement')
  ) {
    return { category: 'regulatory-context', type: 'regulatory-context' };
  }
  if (lower.includes('model') || lower.includes('typology') || lower.includes('pattern') || lower.includes('risk')) {
    return { category: 'analysis-models', type: 'model' };
  }
  if (lower.includes('incident') || lower.includes('breach') || lower.includes('enforcement')) {
    return { category: 'failure-patterns', type: 'failure-pattern' };
  }
  if (lower.includes('method') || lower.includes('workflow') || lower.includes('evidence')) {
    return { category: 'methodology', type: 'methodology' };
  }
  if (lower.includes('use case') || lower.includes('case study')) {
    return { category: 'use-cases', type: 'use-case' };
  }

  return { category: 'principles', type: 'principle' };
}

export async function runTriage(opts: {
  rootDirAbs: string;
  logger: AgentLogger;
}): Promise<{ createdTriageFiles: string[]; ignored: number; errors: number }> {
  const signalsDirAbs = path.join(opts.rootDirAbs, 'signals');
  const triageDirAbs = path.join(opts.rootDirAbs, 'triage');
  const contentDirAbs = path.join(opts.rootDirAbs, 'content');

  await fs.mkdir(triageDirAbs, { recursive: true });

  const signalFiles = (await fs.readdir(signalsDirAbs)).filter((f) => f.endsWith('.json'));

  const existingContentFiles = await collectContentSlugs(contentDirAbs);

  const createdTriageFiles: string[] = [];
  let ignored = 0;
  let errors = 0;

  for (const fileName of signalFiles) {
    const signalFileAbs = path.join(signalsDirAbs, fileName);
    const triageFileAbs = path.join(triageDirAbs, fileName);

    try {
      await fs.access(triageFileAbs);
      continue; // already triaged
    } catch {
      // continue
    }

    try {
      const raw = await fs.readFile(signalFileAbs, 'utf8');
      const signal = SignalSchema.parse(JSON.parse(raw));

      const haystack = `${signal.title}\n${signal.summary}\n${signal.rawContent}`;
      if (!isRelevant(haystack)) {
        const decision = TriageDecisionSchema.parse({
          signalFile: `signals/${fileName}`,
          action: 'ignore',
          reason: 'No relevant crypto compliance keywords detected.',
          category: 'principles'
        });
        await fs.writeFile(triageFileAbs, JSON.stringify(decision, null, 2) + '\n', 'utf8');
        createdTriageFiles.push(triageFileAbs);
        await opts.logger.log({
          agent: 'triage',
          action: 'decision',
          message: `${decision.action}: ${decision.signalFile}`,
          meta: { category: decision.category, reason: decision.reason }
        });
        ignored += 1;
        continue;
      }

      const { category, type } = pickCategoryAndType(haystack);

      const proposedBase = slugify(signal.title) || `signal-${sha256Short(signal.source)}`;
      const proposedSlug = `${category}/${proposedBase}`;

      // Heuristic update: if we already have a slug with high token overlap, request update.
      const match = findClosestSlug(proposedSlug, Array.from(existingContentFiles));
      const action = match ? 'update' : 'create';

      const reason =
        action === 'update'
          ? `Potential overlap with existing entry: ${match}`
          : 'Relevant signal with no close match found.';

      const decision = TriageDecisionSchema.parse({
        signalFile: `signals/${fileName}`,
        action,
        reason,
        category,
        proposed: { type, slug: action === 'create' ? proposedSlug : `${proposedSlug}--update` },
        ...(action === 'update' ? { targetSlug: match } : {})
      });

      await fs.writeFile(triageFileAbs, JSON.stringify(decision, null, 2) + '\n', 'utf8');
      createdTriageFiles.push(triageFileAbs);
      await opts.logger.log({
        agent: 'triage',
        action: 'decision',
        message: `${decision.action}: ${decision.signalFile}`,
        meta: {
          category: decision.category,
          reason: decision.reason,
          proposed: decision.proposed,
          targetSlug: decision.targetSlug
        }
      });
    } catch (err) {
      errors += 1;
      await opts.logger.log({
        agent: 'triage',
        action: 'triage.error',
        message: String(err),
        meta: { fileName }
      });
    }
  }

  await opts.logger.log({
    agent: 'triage',
    action: 'run.summary',
    message: `created=${createdTriageFiles.length} ignored=${ignored} errors=${errors}`
  });

  return { createdTriageFiles, ignored, errors };
}

async function collectContentSlugs(contentDirAbs: string): Promise<Set<string>> {
  const out = new Set<string>();
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile() && e.name.endsWith('.mdx')) {
        const rel = path.relative(contentDirAbs, full).replace(/\\/g, '/').replace(/\.mdx$/, '');
        out.add(rel);
      }
    }
  }
  await walk(contentDirAbs);
  return out;
}

function tokens(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((t) => t.length >= 4)
  );
}

function findClosestSlug(proposed: string, existing: string[]): string | undefined {
  const t = tokens(proposed);
  let best: { slug: string; score: number } | undefined;

  for (const ex of existing) {
    const exT = tokens(ex);
    let overlap = 0;
    for (const tok of t) if (exT.has(tok)) overlap += 1;

    const score = overlap / Math.max(1, Math.min(t.size, exT.size));
    if (!best || score > best.score) best = { slug: ex, score };
  }

  if (!best) return undefined;
  return best.score >= 0.65 ? best.slug : undefined;
}
