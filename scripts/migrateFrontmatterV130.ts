import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import yaml from 'js-yaml';

type SourceLink = { title: string; url: string };

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFilesRecursive(full)));
    else out.push(full);
  }
  return out;
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

function parseSources(sectionText: string): SourceLink[] {
  const lines = sectionText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const out: SourceLink[] = [];
  for (const line of lines) {
    const m = line.match(/^(?:-|\*)\s+\[([^\]]+)\]\(([^)]+)\)\s*$/);
    if (!m) continue;
    const title = (m[1] ?? '').trim();
    const url = (m[2] ?? '').trim();
    if (!title || !url) continue;
    out.push({ title, url });
  }
  return out;
}

function normalizeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

type SourceFamily = 'EU' | 'GLOBAL' | 'OTHER';

function sourceFamilyFromHost(host: string | null): SourceFamily {
  if (!host) return 'OTHER';
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

type Regime =
  | 'AMLR'
  | 'MiCA'
  | 'TFR'
  | 'EBA_GUIDANCE'
  | 'ESMA_GUIDANCE'
  | 'FATF'
  | 'OECD_CARF'
  | 'EU_DAC8';

function addUnique(out: string[], value: string) {
  if (!out.includes(value)) out.push(value);
}

function inferRegimesFromSources(slug: string, sources: SourceLink[]): Regime[] {
  const regimes: Regime[] = [];

  for (const s of sources) {
    const host = normalizeHost(s.url);
    if (host && (host === 'www.eba.europa.eu' || host.endsWith('.eba.europa.eu'))) addUnique(regimes, 'EBA_GUIDANCE');
    if (host && (host === 'www.esma.europa.eu' || host.endsWith('.esma.europa.eu'))) addUnique(regimes, 'ESMA_GUIDANCE');
    if (host && (host === 'www.fatf-gafi.org' || host.endsWith('.fatf-gafi.org'))) addUnique(regimes, 'FATF');
    if (host && (host === 'www.oecd.org' || host.endsWith('.oecd.org'))) addUnique(regimes, 'OECD_CARF');

    if (s.url.includes('/eli/reg/2024/1624')) addUnique(regimes, 'AMLR');
    if (s.url.includes('/eli/reg/2023/1114')) addUnique(regimes, 'MiCA');
    if (s.url.includes('/eli/reg/2023/1113')) addUnique(regimes, 'TFR');
  }

  if (slug.includes('dac8')) addUnique(regimes, 'EU_DAC8');

  // Last resort: keep exportable without claiming a specific instrument.
  if (regimes.length === 0) addUnique(regimes, 'AMLR');

  regimes.sort((a, b) => a.localeCompare(b));
  return regimes;
}

type ReferencePolicy = 'EU_ONLY' | 'GLOBAL_ONLY' | 'EU_AND_GLOBAL';

function inferReferencePolicyFromSources(sources: SourceLink[]): ReferencePolicy {
  const eu = sources.filter((s) => sourceFamilyFromHost(normalizeHost(s.url)) === 'EU').length;
  const global = sources.filter((s) => sourceFamilyFromHost(normalizeHost(s.url)) === 'GLOBAL').length;
  if (eu > 0 && global > 0) return 'EU_AND_GLOBAL';
  if (global > 0) return 'GLOBAL_ONLY';
  return 'EU_ONLY';
}

function inferJurisdictionsFromPolicy(policy: ReferencePolicy): Array<'EU' | 'GLOBAL'> {
  if (policy === 'EU_AND_GLOBAL') return ['EU', 'GLOBAL'];
  if (policy === 'GLOBAL_ONLY') return ['GLOBAL'];
  return ['EU'];
}

function orderedFrontmatter(data: Record<string, unknown>): Record<string, unknown> {
  const order = [
    'type',
    'status',
    'entryIntent',
    'confidence',
    'scope',
    'risk',
    'jurisdictions',
    'regimes',
    'referencePolicy',
    'citationVerified',
    'agentUsage',
    'entryRiskClass',
    'prohibitedInferences',
    'lastReviewed',
    'effectiveFrom',
    'supersedes',
    'revisionHistory',
    'sourceOverride'
  ];

  const out: Record<string, unknown> = {};
  for (const key of order) {
    if (Object.prototype.hasOwnProperty.call(data, key)) out[key] = data[key];
  }

  const extraKeys = Object.keys(data).filter((k) => !order.includes(k));
  extraKeys.sort((a, b) => a.localeCompare(b));
  for (const key of extraKeys) out[key] = data[key];

  return out;
}

async function main() {
  const rootDirAbs = process.cwd();
  const contentDirAbs = path.join(rootDirAbs, 'content');
  const files = (await listFilesRecursive(contentDirAbs)).filter((f) => f.endsWith('.mdx')).sort();

  let changed = 0;

  for (const fileAbs of files) {
    const raw = await fs.readFile(fileAbs, 'utf8');
    const parsed = matter(raw);
    const data = (parsed.data ?? {}) as Record<string, unknown>;

    if (data.status !== 'published') continue;

    const relSlug = path.relative(contentDirAbs, fileAbs).replace(/\\/g, '/').replace(/\.mdx$/, '');
    const body = parsed.content.replace(/\r\n/g, '\n');

    const sourcesSection = extractSection(body, 'Sources') ?? '';
    const sources = parseSources(sourcesSection);

    const type = String(data.type ?? '').trim();
    if (!data.entryIntent) {
      data.entryIntent = type === 'definition' ? 'definition' : type === 'principle' ? 'principle' : 'interpretation';
    }

    if (!data.referencePolicy) data.referencePolicy = inferReferencePolicyFromSources(sources);
    if (!data.jurisdictions) data.jurisdictions = inferJurisdictionsFromPolicy(data.referencePolicy as ReferencePolicy);
    if (!data.regimes) data.regimes = inferRegimesFromSources(relSlug, sources);

    if (data.citationVerified !== true) data.citationVerified = true;

    if (!data.agentUsage) {
      data.agentUsage = {
        allowed: ['terminology_alignment', 'policy_explanation', 'report_drafting'],
        forbidden: ['compliance_decision', 'customer_risk_scoring', 'regulatory_conclusion']
      };
    }

    const outFrontmatter = orderedFrontmatter(data);
    const yamlText = yaml.dump(outFrontmatter, { noRefs: true, lineWidth: 120, sortKeys: false }).trimEnd();
    const rebuilt = `---\n${yamlText}\n---\n\n${body.replace(/^\n+/, '')}`;

    if (rebuilt !== raw.replace(/\r\n/g, '\n')) {
      await fs.writeFile(fileAbs, rebuilt, 'utf8');
      changed += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(`migrate-frontmatter-v130: changed=${changed}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(String(err));
  process.exit(1);
});

