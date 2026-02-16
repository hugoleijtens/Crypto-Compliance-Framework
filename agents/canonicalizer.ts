import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { FRAMEWORK_SCOPE, CanonicalDraftSchema, SignalSchema, TriageDecisionSchema } from '../lib/schema';
import { openaiChatJson } from '../lib/openai';
import { AgentLogger } from './logger';

function sha256Short(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\/\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^\//, '')
    .replace(/\/$/, '')
    .slice(0, 120);
}

function frontmatterString(data: {
  type: string;
  status: string;
  confidence: string;
  scope: string;
  risk: string;
  lastReviewed: string;
}): string {
  // Stable key ordering.
 return [
    '---',
    `type: ${data.type}`,
    `status: ${data.status}`,
    `confidence: ${data.confidence}`,
    `scope: "${data.scope}"`,
    `risk: ${data.risk}`,
    `lastReviewed: "${data.lastReviewed}"`,
    '---',
    ''
  ].join('\n');
}

function mdxFromDraft(draft: {
  type: string;
  status: string;
  confidence: string;
  risk: string;
  lastReviewed: string;
  canonicalStatement: string;
  definition: string;
  whyItMatters: string;
  failureMode: string;
  scopeNonClaims: string;
  relatedConceptSlugs: string[];
  sources: Array<{ title: string; url: string }>;
}): string {
  const fm = frontmatterString({
    type: draft.type,
    status: draft.status,
    confidence: draft.confidence,
    scope: FRAMEWORK_SCOPE,
    risk: draft.risk,
    lastReviewed: draft.lastReviewed
  });

  const relatedLines = draft.relatedConceptSlugs
    .map((s) => `- [${s}](/framework/${s})`)
    .join('\n');
  const sourceLines = draft.sources.map((s) => `- [${s.title}](${s.url})`).join('\n');

  return (
    fm +
    [
      '## Canonical Statement',
      '',
      draft.canonicalStatement.trim(),
      '',
      '## Definition',
      '',
      draft.definition.trim(),
      '',
      '## Why It Matters',
      '',
      draft.whyItMatters.trim(),
      '',
      '## Failure Mode if Ignored',
      '',
      draft.failureMode.trim(),
      '',
      '## Scope & Non-Claims',
      '',
      draft.scopeNonClaims.trim(),
      '',
      '## Related Concepts',
      '',
      relatedLines,
      '',
      '## Sources',
      '',
      sourceLines,
      ''
    ].join('\n')
  );
}

function canonicalizerSystemPrompt(): string {
  return [
    'You are drafting canonical framework entries for a crypto compliance handbook.',
    '',
    'Write like a standards body:',
    '- Declarative, scoped, non-persuasive tone',
    '- No marketing language',
    '- No future predictions',
    '- No legal advice and no claims of compliance',
    '- No vendor comparisons by name',
    '- No operational thresholds or scoring formulas',
    '',
    'Hard requirements:',
    '- Scope MUST be limited to: "Regulated banking environments in EU/UK"',
    '- Output MUST be valid JSON only (no prose) matching the provided keys',
    '- Provide 2 to 3 relatedConceptSlugs (existing slugs provided)',
    '- Include Scope & Non-Claims content explicitly',
    '',
    'Do not include any client identifiers, personally identifying information, or confidential content.'
  ].join('\n');
}

function canonicalizerUserPrompt(input: {
  signal: unknown;
  proposedSlug: string;
  proposedType: string;
  relatedChoices: string[];
  targetSlug?: string;
}): string {
  return [
    'Draft a new canonical entry from this signal.',
    '',
    `proposedSlug: ${input.proposedSlug}`,
    `proposedType: ${input.proposedType}`,
    input.targetSlug ? `targetSlug (if updating): ${input.targetSlug}` : 'targetSlug (if updating): none',
    '',
    'Existing related entry slugs you may link to:',
    ...input.relatedChoices.map((s) => `- ${s}`),
    '',
    'Signal JSON:',
    JSON.stringify(input.signal, null, 2),
    '',
    'Output JSON keys:',
    '{',
    '  "slug": string,',
    '  "type": one of the framework types,',
    '  "confidence": "high"|"medium"|"low",',
    '  "risk": "low"|"medium",',
    '  "canonicalStatement": string,',
    '  "definition": string,',
    '  "whyItMatters": string,',
    '  "failureMode": string,',
    '  "scopeNonClaims": string,',
    '  "relatedConceptSlugs": [string, string] (2 to 3 items),',
    '  "sources": [{"title": string, "url": string}]',
    '}'
  ].join('\n');
}

async function listContentSlugs(contentDirAbs: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.endsWith('.mdx')) {
        out.push(path.relative(contentDirAbs, full).replace(/\\/g, '/').replace(/\.mdx$/, ''));
      }
    }
  }
  await walk(contentDirAbs);
  return out.sort();
}

async function fileExists(fileAbs: string): Promise<boolean> {
  try {
    await fs.access(fileAbs);
    return true;
  } catch {
    return false;
  }
}

function pickRelated(slugs: string[], preferred?: string[]): string[] {
  const picked: string[] = [];
  const seen = new Set<string>();

  function take(s: string) {
    if (seen.has(s)) return;
    seen.add(s);
    picked.push(s);
  }

  for (const s of preferred ?? []) {
    if (picked.length >= 3) break;
    if (slugs.includes(s)) take(s);
  }

  for (const s of slugs) {
    if (picked.length >= 3) break;
    take(s);
  }

  return picked.slice(0, 3);
}

function deterministicDraftFallback(input: {
  slug: string;
  type: string;
  relatedConceptSlugs: string[];
  sourceUrl: string;
  title: string;
}): string {
  const mdx = mdxFromDraft({
    type: input.type,
    status: 'draft',
    confidence: 'low',
    risk: 'medium',
    lastReviewed: todayIso(),
    canonicalStatement: `This entry is a draft placeholder for: ${input.title}.`,
    definition: 'This draft requires canonicalization via the configured LLM provider.',
    whyItMatters: 'Signals were detected that may require a new or updated canonical entry.',
    failureMode: 'If this topic is not captured canonically, teams may diverge in terminology and control intent.',
    scopeNonClaims:
      'Scoped to regulated banking environments in the EU/UK. This framework does not provide legal advice and does not claim regulatory compliance.',
    relatedConceptSlugs: input.relatedConceptSlugs.slice(0, 3),
    sources: [{ title: 'Signal source', url: input.sourceUrl }]
  });

  return mdx;
}

export async function runCanonicalizer(opts: {
  rootDirAbs: string;
  logger: AgentLogger;
}): Promise<{ createdDraftFiles: string[]; skipped: number; errors: number }> {
  const triageDirAbs = path.join(opts.rootDirAbs, 'triage');
  const signalsDirAbs = path.join(opts.rootDirAbs, 'signals');
  const contentDirAbs = path.join(opts.rootDirAbs, 'content');

  const triageFiles = (await fs.readdir(triageDirAbs)).filter((f) => f.endsWith('.json')).sort();
  const contentSlugs = await listContentSlugs(contentDirAbs);

  const maxDrafts = Number(process.env.CCF_MAX_DRAFTS_PER_RUN ?? 3);

  const createdDraftFiles: string[] = [];
  let skipped = 0;
  let errors = 0;

  for (const triageFileName of triageFiles) {
    if (createdDraftFiles.length >= maxDrafts) break;

    const triageFileAbs = path.join(triageDirAbs, triageFileName);
    const triage = TriageDecisionSchema.parse(JSON.parse(await fs.readFile(triageFileAbs, 'utf8')));

    if (triage.action === 'ignore') {
      skipped += 1;
      continue;
    }

    const signalFileAbs = path.join(opts.rootDirAbs, triage.signalFile);
    const signal = SignalSchema.parse(JSON.parse(await fs.readFile(signalFileAbs, 'utf8')));

    const proposed = triage.proposed;
    if (!proposed) {
      skipped += 1;
      continue;
    }

    const baseSlug = safeSlug(proposed.slug);
    const isUpdate = triage.action === 'update';

    const finalSlug =
      isUpdate || baseSlug.endsWith('--update')
        ? `${baseSlug.replace(/--update$/, '')}--update-${todayIso()}`
        : baseSlug;

    const mdxFileAbs = path.join(contentDirAbs, `${finalSlug}.mdx`);
    if (await fileExists(mdxFileAbs)) {
      skipped += 1;
      continue;
    }

    await fs.mkdir(path.dirname(mdxFileAbs), { recursive: true });

    const relatedChoices = pickRelated(contentSlugs, triage.targetSlug ? [triage.targetSlug] : undefined);

    await opts.logger.log({
      agent: 'canonicalizer',
      action: 'draft.start',
      message: finalSlug,
      meta: { triageFile: triageFileName, source: signal.source }
    });

    try {
      let mdx: string;

      if (process.env.OPENAI_API_KEY) {
        const draftJson = await openaiChatJson<unknown>([
          { role: 'system', content: canonicalizerSystemPrompt() },
          {
            role: 'user',
            content: canonicalizerUserPrompt({
              signal,
              proposedSlug: finalSlug,
              proposedType: proposed.type,
              relatedChoices,
              targetSlug: triage.targetSlug
            })
          }
        ]);

        const draft = CanonicalDraftSchema.parse(draftJson);

        // Enforce slug and type deterministically.
        const normalized = {
          ...draft,
          slug: finalSlug,
          type: proposed.type
        };

        mdx = mdxFromDraft({
          type: normalized.type,
          status: 'draft',
          confidence: normalized.confidence,
          risk: normalized.risk,
          lastReviewed: todayIso(),
          canonicalStatement: normalized.canonicalStatement,
          definition: normalized.definition,
          whyItMatters: normalized.whyItMatters,
          failureMode: normalized.failureMode,
          scopeNonClaims: normalized.scopeNonClaims,
          relatedConceptSlugs: normalized.relatedConceptSlugs,
          sources: normalized.sources
        });
      } else {
        mdx = deterministicDraftFallback({
          slug: finalSlug,
          type: proposed.type,
          relatedConceptSlugs: relatedChoices.slice(0, 3),
          sourceUrl: signal.source,
          title: signal.title
        });
      }

      await fs.writeFile(mdxFileAbs, mdx.endsWith('\n') ? mdx : mdx + '\n', 'utf8');

      createdDraftFiles.push(mdxFileAbs);

      await opts.logger.log({
        agent: 'canonicalizer',
        action: 'draft.created',
        message: mdxFileAbs,
        meta: { slug: finalSlug }
      });
    } catch (err) {
      errors += 1;
      await opts.logger.log({
        agent: 'canonicalizer',
        action: 'draft.error',
        message: String(err),
        meta: { slug: finalSlug, triageFile: triageFileName, hash: sha256Short(String(err)) }
      });
    }
  }

  await opts.logger.log({
    agent: 'canonicalizer',
    action: 'run.summary',
    message: `created=${createdDraftFiles.length} skipped=${skipped} errors=${errors}`
  });

  return { createdDraftFiles, skipped, errors };
}
