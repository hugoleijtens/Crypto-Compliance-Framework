import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import {
  CanonicalDefinitionsJsonSchema,
  FrameworkStatusSchema,
  FrameworkGraphJsonSchema,
  MACHINE_SCHEMA_VERSION,
  MachineInterfaceEntrySchema
} from '../lib/schema';
import {
  listMdxFiles,
  PRIMARY_SOURCE_DOMAINS,
  parseFrameworkMdx,
  parseRelatedConceptSlugs,
  parseSources,
  slugFromContentPath
} from '../lib/contentUtils';

const execFileAsync = promisify(execFile);

async function gitHeadCommitTime(rootDirAbs: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['show', '-s', '--format=%cI', 'HEAD'], {
      cwd: rootDirAbs
    });
    const value = stdout.trim();
    return value || null;
  } catch {
    return null;
  }
}

async function gitHeadCommitSha(rootDirAbs: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: rootDirAbs });
    const value = stdout.trim();
    return value || null;
  } catch {
    return null;
  }
}

type CommitShaSource = 'git' | 'CCF_COMMIT_SHA' | 'VERCEL_GIT_COMMIT_SHA' | 'GITHUB_SHA' | 'unknown';
type CommitTimeSource = 'git' | 'CCF_COMMIT_TIME' | 'generatedAt_fallback' | 'unknown';

async function resolveCommitSha(rootDirAbs: string): Promise<{ value: string | null; source: CommitShaSource }> {
  const fromGit = await gitHeadCommitSha(rootDirAbs);
  if (fromGit) return { value: fromGit, source: 'git' };

  const fromCcf = (process.env.CCF_COMMIT_SHA ?? '').trim();
  if (fromCcf) return { value: fromCcf, source: 'CCF_COMMIT_SHA' };

  const fromVercel = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').trim();
  if (fromVercel) return { value: fromVercel, source: 'VERCEL_GIT_COMMIT_SHA' };

  const fromGithub = (process.env.GITHUB_SHA ?? '').trim();
  if (fromGithub) return { value: fromGithub, source: 'GITHUB_SHA' };

  return { value: null, source: 'unknown' };
}

async function resolveCommitTime(rootDirAbs: string): Promise<{ value: string | null; source: Exclude<CommitTimeSource, 'generatedAt_fallback'> }> {
  const fromGit = await gitHeadCommitTime(rootDirAbs);
  if (fromGit) return { value: fromGit, source: 'git' };

  const fromCcf = (process.env.CCF_COMMIT_TIME ?? '').trim();
  if (fromCcf) return { value: fromCcf, source: 'CCF_COMMIT_TIME' };

  return { value: null, source: 'unknown' };
}

async function gitIsDirty(rootDirAbs: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: rootDirAbs });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function firstParagraph(section: string): string {
  return section.split(/\n\s*\n/)[0]?.trim() ?? '';
}

function clampText(input: string, maxChars: number): string {
  const s = input.replace(/\s+/g, ' ').trim();
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars).trim();
}

function sortedUniqueStrings(values: string[]): string[] {
  const cleaned = values
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0)
    .sort((a, b) => a.localeCompare(b));

  const out: string[] = [];
  for (const v of cleaned) {
    if (out[out.length - 1] === v) continue;
    out.push(v);
  }
  return out;
}

function firstSentence(input: string): string {
  const s = input.replace(/\s+/g, ' ').trim();
  if (!s) return '';

  // Deterministic heuristic: first terminator followed by whitespace.
  const m = s.match(/^(.+?[.!?])\s+/);
  if (m?.[1]) return m[1].trim();

  return s;
}

function deriveEmbeddingHint(definition: string, canonicalStatement: string): string {
  const candidate = firstSentence(definition) || firstSentence(canonicalStatement) || definition || canonicalStatement;
  return clampText(candidate, 240);
}

type AuthorityTier = 'T0_PRIMARY_LAW' | 'T1_SUPERVISORY_GUIDANCE' | 'T2_INDUSTRY_STANDARD' | 'T3_OPERATIONAL_INTERPRETATION';

function authorityTierDetailFromTier(tier: AuthorityTier): {
  level: number;
  meaning: string;
  allowedAgentUsage: string[];
  forbiddenAgentUsage: string[];
} {
  const baseForbidden = ['compliance_decision', 'customer_risk_scoring', 'regulatory_conclusion'];
  const baseAllowed = ['terminology_alignment', 'policy_explanation', 'report_drafting'];

  switch (tier) {
    case 'T0_PRIMARY_LAW':
      return {
        level: 1,
        meaning: 'Derived directly from EU primary law sources (EUR-Lex/ec.europa.eu/commission.europa.eu).',
        allowedAgentUsage: baseAllowed,
        forbiddenAgentUsage: baseForbidden
      };
    case 'T1_SUPERVISORY_GUIDANCE':
      return {
        level: 2,
        meaning: 'Derived from supervisory guidance sources (EBA/ESMA/FATF).',
        allowedAgentUsage: baseAllowed,
        forbiddenAgentUsage: baseForbidden
      };
    case 'T2_INDUSTRY_STANDARD':
      return {
        level: 3,
        meaning: 'Derived from industry standards sources (e.g., OECD).',
        allowedAgentUsage: baseAllowed,
        forbiddenAgentUsage: baseForbidden
      };
    case 'T3_OPERATIONAL_INTERPRETATION':
    default:
      return {
        level: 4,
        meaning: 'Operational interpretation with limited authority; requires human validation.',
        allowedAgentUsage: baseAllowed,
        forbiddenAgentUsage: baseForbidden
      };
  }
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function canonicalHashPayload(value: {
  slug: string;
  type: string;
  status: string;
  entryIntent: string;
  confidence: string;
  risk: string;
  jurisdictions: string[];
  regimes: string[];
  referencePolicy: string;
  citationVerified: boolean;
  agentUsage: { allowed: string[]; forbidden: string[] };
  embeddingHint: string;
  lastReviewed: string;
  canonicalStatement: string;
  definition: string;
  relatedSlugs: string[];
  sources: Array<{ title: string; url: string }>;
  sourceAuthorityCount: number;
  sourceDomains: string[];
  prohibitedInferences: string[];
  authorityTier: 'T0_PRIMARY_LAW' | 'T1_SUPERVISORY_GUIDANCE' | 'T2_INDUSTRY_STANDARD' | 'T3_OPERATIONAL_INTERPRETATION';
  authorityTierDetail: {
    level: number;
    meaning: string;
    allowedAgentUsage: string[];
    forbiddenAgentUsage: string[];
  };
  authorityBasis: {
    tierDrivers: string[];
    referenceCountByTier: {
      T0_PRIMARY_LAW: number;
      T1_SUPERVISORY_GUIDANCE: number;
      T2_INDUSTRY_STANDARD: number;
      T3_OPERATIONAL_INTERPRETATION: number;
    };
  };
}): string {
  // Key ordering is deterministic by construction; we avoid pretty printing.
  const payload = {
    slug: value.slug,
    type: value.type,
    status: value.status,
    entryIntent: value.entryIntent,
    confidence: value.confidence,
    risk: value.risk,
    jurisdictions: [...value.jurisdictions].sort((a, b) => a.localeCompare(b)),
    regimes: [...value.regimes].sort((a, b) => a.localeCompare(b)),
    referencePolicy: value.referencePolicy,
    citationVerified: value.citationVerified,
    agentUsage: {
      allowed: [...value.agentUsage.allowed].sort((a, b) => a.localeCompare(b)),
      forbidden: [...value.agentUsage.forbidden].sort((a, b) => a.localeCompare(b))
    },
    embeddingHint: value.embeddingHint,
    lastReviewed: value.lastReviewed,
    canonicalStatement: value.canonicalStatement,
    definition: value.definition,
    relatedSlugs: [...value.relatedSlugs].sort((a, b) => a.localeCompare(b)),
    sources: value.sources,
    sourceAuthorityCount: value.sourceAuthorityCount,
    sourceDomains: [...value.sourceDomains].sort((a, b) => a.localeCompare(b)),
    prohibitedInferences: [...value.prohibitedInferences].sort((a, b) => a.localeCompare(b)),
    authorityTier: value.authorityTier,
    authorityTierDetail: value.authorityTierDetail,
    authorityBasis: value.authorityBasis
  };
  return `sha256:${sha256Hex(JSON.stringify(payload))}`;
}

function normalizeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isPrimaryHost(host: string): boolean {
  return PRIMARY_SOURCE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function sourceTierFromHost(host: string | null): AuthorityTier {
  if (!host) return 'T3_OPERATIONAL_INTERPRETATION';
  if (host === 'eur-lex.europa.eu' || host.endsWith('.eur-lex.europa.eu')) return 'T0_PRIMARY_LAW';
  if (host === 'ec.europa.eu' || host.endsWith('.ec.europa.eu')) return 'T0_PRIMARY_LAW';
  if (host === 'commission.europa.eu' || host.endsWith('.commission.europa.eu')) return 'T0_PRIMARY_LAW';
  if (host === 'www.eba.europa.eu' || host.endsWith('.eba.europa.eu')) return 'T1_SUPERVISORY_GUIDANCE';
  if (host === 'www.esma.europa.eu' || host.endsWith('.esma.europa.eu')) return 'T1_SUPERVISORY_GUIDANCE';
  if (host === 'www.fatf-gafi.org' || host.endsWith('.fatf-gafi.org')) return 'T1_SUPERVISORY_GUIDANCE';
  if (host === 'www.oecd.org' || host.endsWith('.oecd.org')) return 'T2_INDUSTRY_STANDARD';
  return 'T3_OPERATIONAL_INTERPRETATION';
}

function deriveAuthority(sources: Array<{ title: string; url: string }>): {
  authorityTier: AuthorityTier;
  authorityBasis: {
    tierDrivers: string[];
    referenceCountByTier: {
      T0_PRIMARY_LAW: number;
      T1_SUPERVISORY_GUIDANCE: number;
      T2_INDUSTRY_STANDARD: number;
      T3_OPERATIONAL_INTERPRETATION: number;
    };
  };
} {
  const counts = {
    T0_PRIMARY_LAW: 0,
    T1_SUPERVISORY_GUIDANCE: 0,
    T2_INDUSTRY_STANDARD: 0,
    T3_OPERATIONAL_INTERPRETATION: 0
  };

  const drivers = new Set<string>();

  for (const source of sources) {
    const host = normalizeHost(source.url);
    const tier = sourceTierFromHost(host);
    counts[tier] += 1;
    if (tier !== 'T3_OPERATIONAL_INTERPRETATION' && host) drivers.add(host);
  }

  const authorityTier: AuthorityTier =
    counts.T0_PRIMARY_LAW > 0
      ? 'T0_PRIMARY_LAW'
      : counts.T1_SUPERVISORY_GUIDANCE > 0
        ? 'T1_SUPERVISORY_GUIDANCE'
        : counts.T2_INDUSTRY_STANDARD > 0
          ? 'T2_INDUSTRY_STANDARD'
          : 'T3_OPERATIONAL_INTERPRETATION';

  return {
    authorityTier,
    authorityBasis: {
      tierDrivers: Array.from(drivers).sort((a, b) => a.localeCompare(b)),
      referenceCountByTier: counts
    }
  };
}

async function writeIfChanged(fileAbs: string, content: string) {
  try {
    const existing = await fs.readFile(fileAbs, 'utf8');
    if (existing === content) return;
  } catch {
    // ignore
  }
  await fs.mkdir(path.dirname(fileAbs), { recursive: true });
  await fs.writeFile(fileAbs, content, 'utf8');
}

export async function generateMachineJson(opts?: { rootDirAbs?: string }) {
  const rootDirAbs = opts?.rootDirAbs ?? process.cwd();
  const contentDirAbs = path.join(rootDirAbs, 'content');

  const statusesRaw = (process.env.CCF_MACHINE_EXPORT_STATUSES ?? 'published')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowedStatuses = new Set(statusesRaw.map((s) => FrameworkStatusSchema.parse(s)));

  const files = (await listMdxFiles(contentDirAbs)).sort();

  const entries: Array<ReturnType<typeof MachineInterfaceEntrySchema.parse>> = [];

	for (const fileAbs of files) {
    const source = await fs.readFile(fileAbs, 'utf8');
    const parsed = parseFrameworkMdx(source);

    if (!allowedStatuses.has(parsed.frontmatterValidated.status)) continue;

    const slug = slugFromContentPath(contentDirAbs, fileAbs);

    const canonicalStatement = firstParagraph(parsed.sections['Canonical Statement']);
    const definition = firstParagraph(parsed.sections['Definition']);

    const whyItMattersSummary = firstParagraph(parsed.sections['Why It Matters']);
    const failureModeSummary = firstParagraph(parsed.sections['Failure Mode if Ignored']);
    const scopeNonClaimsSummary = firstParagraph(parsed.sections['Scope & Non-Claims']);

	    const relatedSlugs = parseRelatedConceptSlugs(parsed.sections['Related Concepts']);
	    const sourcesParsed = parseSources(parsed.sections['Sources']);

	    const prohibitedInferences = (parsed.frontmatterValidated.prohibitedInferences ?? []).slice();
	    prohibitedInferences.sort((a, b) => a.localeCompare(b));

	    const interpretationBoundary = {
	      doesNotProvideLegalAdvice: true as const,
	      requiresHumanValidation: true as const,
	      prohibitedInferences
	    };

	    const entryIntent =
	      parsed.frontmatterValidated.entryIntent ??
	      (parsed.frontmatterValidated.type === 'definition'
	        ? 'definition'
	        : parsed.frontmatterValidated.type === 'principle'
	          ? 'principle'
	          : 'interpretation');

	    const jurisdictions = sortedUniqueStrings(parsed.frontmatterValidated.jurisdictions ?? ['EU']);
	    const regimes = sortedUniqueStrings(parsed.frontmatterValidated.regimes ?? ['AMLR']);
	    const referencePolicy = parsed.frontmatterValidated.referencePolicy ?? 'EU_ONLY';
	    const citationVerified = parsed.frontmatterValidated.citationVerified ?? false;
	    const agentUsageRaw = parsed.frontmatterValidated.agentUsage ?? {
	      allowed: ['terminology_alignment', 'policy_explanation', 'report_drafting'],
	      forbidden: ['compliance_decision', 'customer_risk_scoring', 'regulatory_conclusion']
	    };
	    const agentUsage = {
	      allowed: sortedUniqueStrings(agentUsageRaw.allowed),
	      forbidden: sortedUniqueStrings(agentUsageRaw.forbidden)
	    };
	    const embeddingHint = deriveEmbeddingHint(definition, canonicalStatement);
    const sourceDomains = Array.from(
      new Set(sourcesParsed.map((source) => normalizeHost(source.url)).filter((host): host is string => Boolean(host)))
    ).sort((a, b) => a.localeCompare(b));
    const sourceAuthorityCount = sourcesParsed
      .map((source) => normalizeHost(source.url))
      .filter((host): host is string => Boolean(host))
      .filter((host) => isPrimaryHost(host)).length;
    const { authorityTier, authorityBasis } = deriveAuthority(sourcesParsed);

    const canonicalUrl = `/framework/${slug}`;
    const contentPath = path.relative(rootDirAbs, fileAbs).replace(/\\/g, '/');

	    const contentHash = canonicalHashPayload({
	      slug,
	      type: parsed.frontmatterValidated.type,
	      status: parsed.frontmatterValidated.status,
	      entryIntent,
	      confidence: parsed.frontmatterValidated.confidence,
	      risk: parsed.frontmatterValidated.risk,
	      jurisdictions,
	      regimes,
	      referencePolicy,
	      citationVerified,
	      agentUsage,
	      embeddingHint,
	      lastReviewed: parsed.frontmatterValidated.lastReviewed,
	      canonicalStatement,
	      definition,
	      relatedSlugs,
	      sources: sourcesParsed,
	      sourceAuthorityCount,
	      sourceDomains,
	      prohibitedInferences,
	      authorityTier,
	      authorityTierDetail: authorityTierDetailFromTier(authorityTier),
	      authorityBasis
	    });

	    const entry = MachineInterfaceEntrySchema.parse({
	      slug,
	      type: parsed.frontmatterValidated.type,
	      status: parsed.frontmatterValidated.status,
	      entryIntent,
	      canonicalStatement,
	      definition,
	      scope: parsed.frontmatterValidated.scope,
	      confidence: parsed.frontmatterValidated.confidence,
	      risk: parsed.frontmatterValidated.risk,
	      jurisdictions,
	      regimes,
	      referencePolicy,
	      citationVerified,
	      agentUsage,
	      embeddingHint,
	      lastReviewed: parsed.frontmatterValidated.lastReviewed,
	      canonicalUrl,
	      relatedSlugs,
	      sources: sourcesParsed,
	      sourceAuthorityCount,
	      sourceDomains,
	      prohibitedInferences,
	      interpretationBoundary,
	      authorityTier,
	      authorityTierDetail: authorityTierDetailFromTier(authorityTier),
	      authorityBasis,
	      whyItMattersSummary,
	      failureModeSummary,
	      scopeNonClaimsSummary,
      source: { contentPath },
      contentHash
    });

    entries.push(entry);
  }

  entries.sort((a, b) => a.slug.localeCompare(b.slug));

  const dirty = await gitIsDirty(rootDirAbs);
  const commitShaResolved = await resolveCommitSha(rootDirAbs);
  const commitTimeResolved = await resolveCommitTime(rootDirAbs);

  const generatedAt = dirty
    ? new Date().toISOString()
    : (commitTimeResolved.value ?? new Date().toISOString());

  const commitTime = commitTimeResolved.value ?? generatedAt;
  const commitTimeSource: CommitTimeSource =
    commitTimeResolved.value ? commitTimeResolved.source : 'generatedAt_fallback';

  const out = CanonicalDefinitionsJsonSchema.parse({
    schemaVersion: MACHINE_SCHEMA_VERSION,
    generatedAt,
    generatedFrom: {
      commitSha: commitShaResolved.value,
      commitShaSource: commitShaResolved.source,
      commitTime,
      commitTimeSource,
      dirty,
      exportStatuses: Array.from(allowedStatuses)
    },
    policies: {
      conflictPolicy: {
        precedence: ['EU_PRIMARY_LAW', 'EU_SUPERVISORY_GUIDANCE', 'FRAMEWORK_CANONICAL_ENTRY'],
        ifUnclear: 'defer_to_human'
      }
    },
    entries
  });

  const json = JSON.stringify(out, null, 2) + '\n';

  await writeIfChanged(path.join(rootDirAbs, 'machine-interface', 'canonical-definitions.json'), json);
  await writeIfChanged(path.join(rootDirAbs, 'public', 'machine-interface', 'canonical-definitions.json'), json);

  // Copy schema as-is for static serving.
  const schemaAbs = path.join(rootDirAbs, 'machine-interface', 'framework-schema.json');
  const schemaPublicAbs = path.join(rootDirAbs, 'public', 'machine-interface', 'framework-schema.json');
  const schemaText = await fs.readFile(schemaAbs, 'utf8');
  await writeIfChanged(schemaPublicAbs, schemaText);

  await generateFrameworkGraph({ rootDirAbs, generatedAt, entries });
  await generateChangeLog({ rootDirAbs, generatedAt });

  // eslint-disable-next-line no-console
  console.log(
    `generate-machine-json: entries=${entries.length} statuses=${Array.from(allowedStatuses).join(',')}`
  );
}

async function generateFrameworkGraph(opts: {
  rootDirAbs: string;
  generatedAt: string;
  entries: Array<ReturnType<typeof MachineInterfaceEntrySchema.parse>>;
}) {
  const allowed = new Set(opts.entries.map((e) => e.slug));

  const nodes = opts.entries.map((e) => ({
    slug: e.slug,
    type: e.type,
    status: e.status,
    confidence: e.confidence,
    risk: e.risk,
    lastReviewed: e.lastReviewed
  }));

  const edges: Array<{ from: string; to: string; kind: 'related-concept' }> = [];
  for (const e of opts.entries) {
    for (const to of e.relatedSlugs) {
      if (!allowed.has(to)) {
        if (e.status === 'published') {
          throw new Error(
            `framework-graph: published entry has dangling related slug not in export set: from=${e.slug} to=${to}`
          );
        }
        continue;
      }
      edges.push({ from: e.slug, to, kind: 'related-concept' });
    }
  }

  const out = FrameworkGraphJsonSchema.parse({
    schemaVersion: MACHINE_SCHEMA_VERSION,
    generatedAt: opts.generatedAt,
    nodes,
    edges
  });

  const json = JSON.stringify(out, null, 2) + '\n';
  await writeIfChanged(path.join(opts.rootDirAbs, 'machine-interface', 'framework-graph.json'), json);
  await writeIfChanged(path.join(opts.rootDirAbs, 'public', 'machine-interface', 'framework-graph.json'), json);
}

async function generateChangeLog(opts: { rootDirAbs: string; generatedAt: string }) {
  const rootDirAbs = opts.rootDirAbs;
  const maxCommits = Number(process.env.CCF_CHANGELOG_MAX_COMMITS ?? 50);

  type CommitRow = { sha: string; date: string; subject: string };

  let commits: CommitRow[] = [];

  try {
    const { stdout } = await execFileAsync(
      'git',
      [
        'log',
        `-n`,
        String(maxCommits),
        '--date=iso-strict',
        '--pretty=format:%H|%cI|%s',
        '--',
        'content',
        'machine-interface'
      ],
      { cwd: rootDirAbs }
    );

    commits = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [sha, date, subject] = line.split('|');
        return { sha, date, subject };
      })
      .filter((c) => c.sha && c.date && c.subject);
  } catch {
    commits = [];
  }

  if (commits.length === 0) {
    const sha =
      (process.env.VERCEL_GIT_COMMIT_SHA ?? '').trim() ||
      (process.env.GITHUB_SHA ?? '').trim() ||
      (process.env.CCF_COMMIT_SHA ?? '').trim();
    const subject =
      (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? '').trim() ||
      (process.env.VERCEL_GIT_COMMIT_REF ?? '').trim() ||
      'commit metadata unavailable';
    if (sha) commits = [{ sha, date: opts.generatedAt, subject }];
  }

  const out = {
    generatedAt: opts.generatedAt,
    commits
  };

  const json = JSON.stringify(out, null, 2) + '\n';
  await writeIfChanged(path.join(rootDirAbs, 'machine-interface', 'change-log.json'), json);
  await writeIfChanged(path.join(rootDirAbs, 'public', 'machine-interface', 'change-log.json'), json);
}

// If executed directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  generateMachineJson().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(String(err));
    process.exit(1);
  });
}
