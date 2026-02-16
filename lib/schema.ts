import { z } from 'zod';

export const FRAMEWORK_SCOPE = 'Regulated banking environments in EU/UK' as const;
export const MACHINE_SCHEMA_VERSION = '1.3.0' as const;

export const FrameworkTypeSchema = z.enum([
  'principle',
  'definition',
  'journey',
  'failure-pattern',
  'model',
  'regulatory-context',
  'methodology',
  'use-case'
]);

export const FrameworkStatusSchema = z.enum(['draft', 'review', 'published']);
export const FrameworkConfidenceSchema = z.enum(['high', 'medium', 'low']);
export const FrameworkRiskSchema = z.enum(['low', 'medium']);
export const EntryIntentSchema = z.enum(['definition', 'principle', 'interpretation']);
export const JurisdictionSchema = z.enum(['EU', 'UK', 'GLOBAL']);
export const RegimeSchema = z.enum([
  'AMLR',
  'MiCA',
  'TFR',
  'EBA_GUIDANCE',
  'ESMA_GUIDANCE',
  'FATF',
  'OECD_CARF',
  'EU_DAC8'
]);
export const ReferencePolicySchema = z.enum(['EU_ONLY', 'GLOBAL_ONLY', 'EU_AND_GLOBAL']);
export const EntryRiskClassSchema = z.enum([
  'definition_low_risk',
  'regulatory_determination',
  'attribution_ownership',
  'illicitness_signals',
  'decisioning',
  'aggregation_risk'
]);
export const AgentCapabilitySchema = z.enum([
  'terminology_alignment',
  'policy_explanation',
  'report_drafting',
  'control_design',
  'compliance_decision',
  'customer_risk_scoring',
  'regulatory_conclusion',
  'suspicion_determination',
  'sanctions_determination',
  'legal_interpretation'
]);
export const AuthorityTierSchema = z.enum([
  'T0_PRIMARY_LAW',
  'T1_SUPERVISORY_GUIDANCE',
  'T2_INDUSTRY_STANDARD',
  'T3_OPERATIONAL_INTERPRETATION'
]);

export const AgentUsageSchema = z
  .object({
    allowed: z.array(AgentCapabilitySchema).min(1),
    forbidden: z.array(AgentCapabilitySchema).min(1)
  })
  .strict();

export const SourceOverrideSchema = z
  .object({
    enabled: z.boolean(),
    reason: z.string().min(1),
    approvedBy: z.string().min(1),
    approvedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'approvedAt must be YYYY-MM-DD'),
    expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expiresAt must be YYYY-MM-DD').nullable().optional()
  })
  .strict();

export const FrameworkFrontmatterSchema = z
  .object({
    type: FrameworkTypeSchema,
    status: FrameworkStatusSchema,
    entryIntent: EntryIntentSchema.optional(),
    confidence: FrameworkConfidenceSchema,
    scope: z.literal(FRAMEWORK_SCOPE),
    risk: FrameworkRiskSchema,
    jurisdictions: z.array(JurisdictionSchema).min(1).optional(),
    regimes: z.array(RegimeSchema).min(1).optional(),
    referencePolicy: ReferencePolicySchema.optional(),
    citationVerified: z.boolean().optional(),
    agentUsage: AgentUsageSchema.optional(),
    entryRiskClass: EntryRiskClassSchema.optional(),
    prohibitedInferences: z.array(z.string().min(1)).optional(),
    lastReviewed: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'lastReviewed must be YYYY-MM-DD'),
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveFrom must be YYYY-MM-DD')
      .optional(),
    supersedes: z.array(z.string().min(1)).optional(),
    revisionHistory: z
      .array(
        z
          .object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'revisionHistory.date must be YYYY-MM-DD'),
            change: z.string().min(1),
            reviewer: z.string().min(1)
          })
          .strict()
      )
      .optional(),
    sourceOverride: SourceOverrideSchema.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status !== 'published') return;

    if (!value.entryIntent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['entryIntent'],
        message: 'published entries must define entryIntent'
      });
    }
    if (!value.jurisdictions || value.jurisdictions.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jurisdictions'],
        message: 'published entries must define jurisdictions (min 1)'
      });
    }
    if (!value.regimes || value.regimes.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['regimes'],
        message: 'published entries must define regimes (min 1)'
      });
    }
    if (!value.referencePolicy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referencePolicy'],
        message: 'published entries must define referencePolicy'
      });
    }
    if (value.citationVerified !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['citationVerified'],
        message: 'published entries must set citationVerified: true'
      });
    }
    if (!value.agentUsage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['agentUsage'],
        message: 'published entries must define agentUsage.allowed and agentUsage.forbidden'
      });
    }

    if (
      value.entryRiskClass &&
      ['regulatory_determination', 'attribution_ownership', 'illicitness_signals', 'decisioning', 'aggregation_risk'].includes(
        value.entryRiskClass
      )
    ) {
      const count = value.prohibitedInferences?.length ?? 0;
      if (count < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['prohibitedInferences'],
          message:
            'published entries with this entryRiskClass must define at least 2 prohibitedInferences'
        });
      }
    }
  });

export const REQUIRED_SECTIONS = [
  'Canonical Statement',
  'Definition',
  'Why It Matters',
  'Failure Mode if Ignored',
  'Scope & Non-Claims',
  'Related Concepts',
  'Sources'
] as const;

export const MachineSchemaVersionSchema = z.literal(MACHINE_SCHEMA_VERSION);

export const MachineSourceLinkSchema = z
  .object({
    title: z.string().min(1),
    url: z.string().url()
  })
  .strict();

export const MachineGeneratedFromSchema = z
  .object({
    commitSha: z.string().min(1).nullable(),
    commitShaSource: z.enum(['git', 'CCF_COMMIT_SHA', 'VERCEL_GIT_COMMIT_SHA', 'GITHUB_SHA', 'unknown']),
    commitTime: z.string().min(1).nullable(),
    commitTimeSource: z.enum(['git', 'CCF_COMMIT_TIME', 'generatedAt_fallback', 'unknown']),
    dirty: z.boolean(),
    exportStatuses: z.array(FrameworkStatusSchema).min(1)
  })
  .strict();

export const InterpretationBoundarySchema = z
  .object({
    doesNotProvideLegalAdvice: z.literal(true),
    requiresHumanValidation: z.literal(true),
    prohibitedInferences: z.array(z.string().min(1))
  })
  .strict();

export const AuthorityTierDetailSchema = z
  .object({
    level: z.number().int().min(1).max(4),
    meaning: z.string().min(1),
    allowedAgentUsage: z.array(AgentCapabilitySchema),
    forbiddenAgentUsage: z.array(AgentCapabilitySchema)
  })
  .strict();

export const ConflictPolicySchema = z
  .object({
    precedence: z
      .array(z.enum(['EU_PRIMARY_LAW', 'EU_SUPERVISORY_GUIDANCE', 'FRAMEWORK_CANONICAL_ENTRY']))
      .min(1),
    ifUnclear: z.literal('defer_to_human')
  })
  .strict();

export const MachinePoliciesSchema = z
  .object({
    conflictPolicy: ConflictPolicySchema
  })
  .strict();

export const MachineInterfaceEntrySchema = z
  .object({
    slug: z.string().min(1),
    type: FrameworkTypeSchema,
    status: FrameworkStatusSchema,
    entryIntent: EntryIntentSchema,
    canonicalStatement: z.string().min(1),
    definition: z.string().min(1),
    scope: z.literal(FRAMEWORK_SCOPE),
    confidence: FrameworkConfidenceSchema,
    risk: FrameworkRiskSchema,
    jurisdictions: z.array(JurisdictionSchema).min(1),
    regimes: z.array(RegimeSchema).min(1),
    referencePolicy: ReferencePolicySchema,
    citationVerified: z.boolean(),
    agentUsage: AgentUsageSchema,
    embeddingHint: z.string().min(1),
    lastReviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'lastReviewed must be YYYY-MM-DD'),
    canonicalUrl: z.string().min(1),
    relatedSlugs: z.array(z.string().min(1)).max(3),
    sources: z.array(MachineSourceLinkSchema).max(5),
    sourceAuthorityCount: z.number().int().min(0),
    sourceDomains: z.array(z.string().min(1)),
    prohibitedInferences: z.array(z.string().min(1)),
    interpretationBoundary: InterpretationBoundarySchema,
    authorityTier: AuthorityTierSchema,
    authorityTierDetail: AuthorityTierDetailSchema,
    authorityBasis: z
      .object({
        tierDrivers: z.array(z.string().min(1)),
        referenceCountByTier: z
          .object({
            T0_PRIMARY_LAW: z.number().int().min(0),
            T1_SUPERVISORY_GUIDANCE: z.number().int().min(0),
            T2_INDUSTRY_STANDARD: z.number().int().min(0),
            T3_OPERATIONAL_INTERPRETATION: z.number().int().min(0)
          })
          .strict()
      })
      .strict(),
    whyItMattersSummary: z.string().min(1),
    failureModeSummary: z.string().min(1),
    scopeNonClaimsSummary: z.string().min(1),
    source: z
      .object({
        contentPath: z.string().min(1)
      })
      .strict(),
    contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/, 'contentHash must be sha256:<hex>')
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === 'published') {
      if (value.relatedSlugs.length < 2 || value.relatedSlugs.length > 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['relatedSlugs'],
          message: 'published entries must have 2..3 relatedSlugs'
        });
      }
      if (value.sources.length < 2 || value.sources.length > 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sources'],
          message: 'published entries must have 2..5 sources'
        });
      }
      if (value.sourceAuthorityCount < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sourceAuthorityCount'],
          message: 'published entries must have sourceAuthorityCount >= 2'
        });
      }
      if (value.citationVerified !== true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['citationVerified'],
          message: 'published entries must have citationVerified: true'
        });
      }
    }
  });

export const CanonicalDefinitionsJsonSchema = z
  .object({
    schemaVersion: MachineSchemaVersionSchema,
    generatedAt: z.string().min(1),
    generatedFrom: MachineGeneratedFromSchema,
    policies: MachinePoliciesSchema,
    entries: z.array(MachineInterfaceEntrySchema)
  })
  .strict();

export const FrameworkGraphNodeSchema = z
  .object({
    slug: z.string().min(1),
    type: FrameworkTypeSchema,
    status: FrameworkStatusSchema,
    confidence: FrameworkConfidenceSchema,
    risk: FrameworkRiskSchema,
    lastReviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'lastReviewed must be YYYY-MM-DD')
  })
  .strict();

export const FrameworkGraphEdgeSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    kind: z.literal('related-concept')
  })
  .strict();

export const FrameworkGraphJsonSchema = z
  .object({
    schemaVersion: MachineSchemaVersionSchema,
    generatedAt: z.string().min(1),
    nodes: z.array(FrameworkGraphNodeSchema),
    edges: z.array(FrameworkGraphEdgeSchema)
  })
  .strict();

export const SignalSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1),
    source: z.string().min(1),
    date: z.string().min(1),
    type: z.enum(['regulatory', 'practitioner']),
    rawContent: z.string().min(1)
  })
  .strict();

export const TriageDecisionSchema = z
  .object({
    signalFile: z.string().min(1),
    action: z.enum(['create', 'update', 'ignore']),
    reason: z.string().min(1),
    category: z.enum([
      'principles',
      'definitions',
      'compliance-journey',
      'analysis-models',
      'failure-patterns',
      'regulatory-context',
      'methodology',
      'use-cases'
    ]),
    proposed: z
      .object({
        type: FrameworkTypeSchema,
        slug: z.string().min(1)
      })
      .optional(),
    targetSlug: z.string().min(1).optional()
  })
  .strict();

export const CanonicalDraftSchema = z
  .object({
    slug: z.string().min(1),
    type: FrameworkTypeSchema,
    confidence: FrameworkConfidenceSchema,
    risk: FrameworkRiskSchema,
    canonicalStatement: z.string().min(1),
    definition: z.string().min(1),
    whyItMatters: z.string().min(1),
    failureMode: z.string().min(1),
    scopeNonClaims: z.string().min(1),
    relatedConceptSlugs: z.array(z.string().min(1)).min(2).max(3),
    sources: z
      .array(
        z
          .object({
            title: z.string().min(1),
            url: z.string().url()
          })
          .strict()
      )
      .min(1)
      .max(5)
  })
  .strict();
