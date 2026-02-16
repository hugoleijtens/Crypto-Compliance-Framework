import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { FrameworkFrontmatterSchema, REQUIRED_SECTIONS } from './schema';

export type ParsedFrameworkMdx = {
  frontmatter: unknown;
  frontmatterValidated: ReturnType<typeof FrameworkFrontmatterSchema.parse>;
  rawBody: string;
  sections: Record<(typeof REQUIRED_SECTIONS)[number], string>;
};

type MarkdownLink = { title: string; url: string };

export const PRIMARY_SOURCE_DOMAINS = [
  'eur-lex.europa.eu',
  'ec.europa.eu',
  'commission.europa.eu',
  'esma.europa.eu',
  'eba.europa.eu',
  'fatf-gafi.org',
  'oecd.org'
] as const;

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(full)));
      continue;
    }
    out.push(full);
  }
  return out;
}

export async function listMdxFiles(contentDirAbs: string): Promise<string[]> {
  const all = await listFilesRecursive(contentDirAbs);
  return all.filter((f) => f.endsWith('.mdx'));
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSection(rawBody: string, heading: string): string | null {
  const re = new RegExp(
    `^##\\s+${escapeRegExp(heading)}\\s*\\n([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`,
    'm'
  );
  const m = rawBody.match(re);
  if (!m) return null;
  return m[1].trim();
}

function parseMarkdownLinkBulletList(sectionText: string): MarkdownLink[] {
  const lines = sectionText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const out: MarkdownLink[] = [];

  for (const line of lines) {
    const m = line.match(/^(?:-|\*)\s+\[([^\]]+)\]\(([^)]+)\)\s*$/);
    if (!m) {
      throw new Error(
        `Invalid list item. Expected bullet markdown link like "- [Title](url)". Got: ${line}`
      );
    }
    const title = (m[1] ?? '').trim();
    const url = (m[2] ?? '').trim();
    if (!title || !url) throw new Error(`Invalid markdown link (empty title or url): ${line}`);
    out.push({ title, url });
  }

  return out;
}

export function parseRelatedConceptSlugs(sectionText: string): string[] {
  const links = parseMarkdownLinkBulletList(sectionText);

  const slugs: string[] = [];
  for (const link of links) {
    if (!link.url.startsWith('/framework/')) {
      throw new Error(`Related Concepts must link to internal /framework/... URLs. Got: ${link.url}`);
    }
    const slug = link.url.slice('/framework/'.length).replace(/^\/+/, '').replace(/\/+$/, '');
    if (!slug) throw new Error(`Invalid /framework/ link (empty slug): ${link.url}`);
    slugs.push(slug);
  }

  // Deterministic, stable ordering for export + hashing.
  slugs.sort((a, b) => a.localeCompare(b));

  // Deduplicate deterministically.
  const deduped: string[] = [];
  for (const s of slugs) {
    if (deduped[deduped.length - 1] === s) continue;
    deduped.push(s);
  }

  return deduped;
}

export function parseSources(sectionText: string): MarkdownLink[] {
  const links = parseMarkdownLinkBulletList(sectionText);

  for (const link of links) {
    let u: URL;
    try {
      u = new URL(link.url);
    } catch {
      throw new Error(`Invalid source URL: ${link.url}`);
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error(`Source URLs must be http(s). Got: ${link.url}`);
    }
  }

  return links;
}

function isPrimarySourceUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return PRIMARY_SOURCE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

type SourceFamily = 'EU' | 'GLOBAL' | 'OTHER';

function sourceFamilyFromUrl(url: string): SourceFamily {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'OTHER';
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'eur-lex.europa.eu' ||
    host.endsWith('.eur-lex.europa.eu') ||
    host === 'ec.europa.eu' ||
    host.endsWith('.ec.europa.eu') ||
    host === 'commission.europa.eu' ||
    host.endsWith('.commission.europa.eu') ||
    host === 'www.eba.europa.eu' ||
    host.endsWith('.eba.europa.eu') ||
    host === 'www.esma.europa.eu' ||
    host.endsWith('.esma.europa.eu')
  ) {
    return 'EU';
  }
  if (
    host === 'www.fatf-gafi.org' ||
    host.endsWith('.fatf-gafi.org') ||
    host === 'www.oecd.org' ||
    host.endsWith('.oecd.org')
  ) {
    return 'GLOBAL';
  }
  return 'OTHER';
}

export function parseFrameworkMdx(source: string): ParsedFrameworkMdx {
  const parsed = matter(source);
  if (
    parsed.data &&
    typeof parsed.data === 'object' &&
    Object.prototype.hasOwnProperty.call(parsed.data, 'authorityTier')
  ) {
    throw new Error(
      'Invalid frontmatter key: authorityTier is derived automatically and cannot be set manually.'
    );
  }
  const frontmatter = parsed.data;
  const frontmatterValidated = FrameworkFrontmatterSchema.parse(frontmatter);

  const rawBody = parsed.content.replace(/\r\n/g, '\n');

  // Enforce deterministic section structure: level-2 headings must be exactly the required list in order.
  const foundH2: string[] = [];
  const h2Re = /^##\s+(.+?)\s*$/gm;
  for (const match of rawBody.matchAll(h2Re)) {
    foundH2.push((match[1] ?? '').trim());
  }
  const expectedH2 = [...REQUIRED_SECTIONS];
  const foundJoined = foundH2.join(' | ');
  const expectedJoined = expectedH2.join(' | ');
  if (foundJoined !== expectedJoined) {
    throw new Error(
      `Invalid section structure. Expected: ${expectedJoined}. Found: ${foundJoined || '(none)'}`
    );
  }

  const sections: Record<(typeof REQUIRED_SECTIONS)[number], string> = {} as never;
  for (const sectionName of REQUIRED_SECTIONS) {
    const content = extractSection(rawBody, sectionName);
    if (content === null) throw new Error(`Missing required section content: "${sectionName}"`);
    sections[sectionName] = content;
  }

  // Deterministic parsing requirements for machine exports: only enforce strictness for published entries.
  if (frontmatterValidated.status === 'published') {
    const relatedSlugs = parseRelatedConceptSlugs(sections['Related Concepts']);
    if (relatedSlugs.length < 2 || relatedSlugs.length > 3) {
      throw new Error(`Published entries must have 2..3 Related Concepts links. Found: ${relatedSlugs.length}`);
    }

    const sources = parseSources(sections['Sources']);
    if (sources.length < 2 || sources.length > 5) {
      throw new Error(`Published entries must have 2..5 Sources links. Found: ${sources.length}`);
    }

    // Reference policy enforcement: ensure EU/GLOBAL coverage intent without forcing artificial citations.
    const euCount = sources.filter((s) => sourceFamilyFromUrl(s.url) === 'EU').length;
    const globalCount = sources.filter((s) => sourceFamilyFromUrl(s.url) === 'GLOBAL').length;
    switch (frontmatterValidated.referencePolicy) {
      case 'EU_ONLY': {
        if (euCount < 2) {
          throw new Error(`Published entries with referencePolicy=EU_ONLY must include >=2 EU sources. Found: ${euCount}`);
        }
        break;
      }
      case 'GLOBAL_ONLY': {
        if (globalCount < 2) {
          throw new Error(
            `Published entries with referencePolicy=GLOBAL_ONLY must include >=2 GLOBAL sources. Found: ${globalCount}`
          );
        }
        break;
      }
      case 'EU_AND_GLOBAL': {
        if (euCount < 1 || globalCount < 1) {
          throw new Error(
            `Published entries with referencePolicy=EU_AND_GLOBAL must include >=1 EU source and >=1 GLOBAL source. Found EU=${euCount} GLOBAL=${globalCount}`
          );
        }
        break;
      }
      default: {
        // Schema requires referencePolicy for published; keep a defensive check here.
        throw new Error('Published entries must define referencePolicy.');
      }
    }

    const primarySourceCount = sources.filter((source) => isPrimarySourceUrl(source.url)).length;
    const overrideEnabled = frontmatterValidated.sourceOverride?.enabled === true;
    if (!overrideEnabled && primarySourceCount < 2) {
      throw new Error(
        `Published entries must include at least 2 primary sources (${PRIMARY_SOURCE_DOMAINS.join(', ')}). Found: ${primarySourceCount}`
      );
    }
  }

  return { frontmatter, frontmatterValidated, rawBody, sections };
}

export async function readAndParseFrameworkMdxFile(fileAbs: string): Promise<ParsedFrameworkMdx> {
  const source = await fs.readFile(fileAbs, 'utf8');
  return parseFrameworkMdx(source);
}

export function slugFromContentPath(contentDirAbs: string, fileAbs: string): string {
  const rel = path.relative(contentDirAbs, fileAbs);
  return rel.replace(/\\/g, '/').replace(/\.mdx$/, '');
}
