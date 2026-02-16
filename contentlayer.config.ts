import { defineDocumentType, makeSource } from 'contentlayer2/source-files';
import remarkGfm from 'remark-gfm';

const TYPES = [
  'principle',
  'definition',
  'journey',
  'failure-pattern',
  'model',
  'regulatory-context',
  'methodology',
  'use-case'
] as const;

const STATUSES = ['draft', 'review', 'published'] as const;
const CONFIDENCE = ['high', 'medium', 'low'] as const;
const RISK = ['low', 'medium'] as const;
const ENTRY_INTENT = ['definition', 'principle', 'interpretation'] as const;
const JURISDICTIONS = ['EU', 'UK', 'GLOBAL'] as const;
const REGIMES = [
  'AMLR',
  'MiCA',
  'TFR',
  'EBA_GUIDANCE',
  'ESMA_GUIDANCE',
  'FATF',
  'OECD_CARF',
  'EU_DAC8'
] as const;
const REFERENCE_POLICY = ['EU_ONLY', 'GLOBAL_ONLY', 'EU_AND_GLOBAL'] as const;
const ENTRY_RISK_CLASS = [
  'definition_low_risk',
  'regulatory_determination',
  'attribution_ownership',
  'illicitness_signals',
  'decisioning',
  'aggregation_risk'
] as const;

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSection(raw: string, heading: string): string | null {
  // Level-2 headings are mandated by the framework schema.
  const re = new RegExp(
    `^##\\s+${escapeRegExp(heading)}\\s*\\n([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`,
    'm'
  );
  const m = raw.match(re);
  if (!m) return null;

  const content = m[1].trim();
  if (!content) return '';

  // First paragraph only for index surfaces.
  return content.split(/\n\s*\n/)[0]?.trim() ?? '';
}

function extractRelated(raw: string): string[] {
  const related = extractSection(raw, 'Related Concepts');
  if (!related) return [];

  const slugs = new Set<string>();
  const linkRe = /\[[^\]]+\]\(\s*(\/framework\/[^\s)]+)\s*\)/g;
  for (const match of related.matchAll(linkRe)) {
    const href = match[1];
    const cleaned = href.replace(/^\/framework\//, '').replace(/\/$/, '');
    if (cleaned) slugs.add(cleaned);
  }

  return Array.from(slugs);
}

export const FrameworkEntry = defineDocumentType(() => ({
  name: 'FrameworkEntry',
  filePathPattern: '**/*.mdx',
  contentType: 'mdx',
  fields: {
    type: {
      type: 'enum',
      options: [...TYPES],
      required: true
    },
    status: {
      type: 'enum',
      options: [...STATUSES],
      required: true
    },
    confidence: {
      type: 'enum',
      options: [...CONFIDENCE],
      required: true
    },
    scope: {
      type: 'string',
      required: true
    },
    risk: {
      type: 'enum',
      options: [...RISK],
      required: true
    },
    entryIntent: {
      type: 'enum',
      options: [...ENTRY_INTENT],
      required: false
    },
    jurisdictions: {
      type: 'list',
      of: { type: 'enum', options: [...JURISDICTIONS] },
      required: false
    },
    regimes: {
      type: 'list',
      of: { type: 'enum', options: [...REGIMES] },
      required: false
    },
    referencePolicy: {
      type: 'enum',
      options: [...REFERENCE_POLICY],
      required: false
    },
    citationVerified: {
      type: 'boolean',
      required: false
    },
    agentUsage: {
      type: 'json',
      required: false
    },
    entryRiskClass: {
      type: 'enum',
      options: [...ENTRY_RISK_CLASS],
      required: false
    },
    prohibitedInferences: {
      type: 'list',
      of: { type: 'string' },
      required: false
    },
    lastReviewed: {
      type: 'date',
      required: true
    },
    effectiveFrom: {
      type: 'date',
      required: false
    },
    supersedes: {
      type: 'list',
      of: { type: 'string' },
      required: false
    },
    revisionHistory: {
      type: 'json',
      required: false
    },
    sourceOverride: {
      type: 'json',
      required: false
    }
  },
  computedFields: {
    slug: {
      type: 'string',
      resolve: (doc) => doc._raw.flattenedPath
    },
    url: {
      type: 'string',
      resolve: (doc) => `/framework/${doc._raw.flattenedPath}`
    },
    section: {
      type: 'string',
      resolve: (doc) => doc._raw.flattenedPath.split('/')[0] ?? 'framework'
    },
    canonicalStatement: {
      type: 'string',
      resolve: (doc) => extractSection(doc.body.raw, 'Canonical Statement') ?? ''
    },
    definition: {
      type: 'string',
      resolve: (doc) => extractSection(doc.body.raw, 'Definition') ?? ''
    },
    related: {
      type: 'list',
      of: { type: 'string' },
      resolve: (doc) => extractRelated(doc.body.raw)
    }
  }
}));

export default makeSource({
  contentDirPath: 'content',
  documentTypes: [FrameworkEntry],
  onUnknownDocuments: 'fail',
  onExtraFieldData: 'fail',
  onMissingOrIncompatibleData: 'fail',
  fieldOptions: {
    // The framework requires a `type` frontmatter field; avoid conflicts with Contentlayer's
    // system-level "document type name" field by renaming that internal field.
    typeFieldName: '_docType'
  },
  mdx: {
    remarkPlugins: [remarkGfm]
  }
});
