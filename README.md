# Crypto Compliance Framework (Vendor-Neutral)

A production-oriented, deterministic knowledge site and content pipeline for crypto compliance framework entries.

**🚀 Ready to Deploy?** See [HOW_TO_DEPLOY.md](./HOW_TO_DEPLOY.md) for quick deployment instructions.

## Goals

- Publish a canonical handbook-style website (Next.js 14, App Router)
- Store canonical entries as MDX with strict schema and required body structure
- Continuously monitor external + internal signals
- Draft new canonical entries via an agent pipeline
- Enforce safety/compliance guardrails
- Require human approval before publishing
- Maintain an audit trail via Git + agent logs
- Expose a machine-readable JSON interface for AI retrieval

## Repository structure

- `app/`: Next.js site
- `content/`: MDX framework entries (source of truth)
- `machine-interface/`: generated JSON exports + schema (source of truth for machine exports)
- `public/machine-interface/`: static copies served by Next.js
- `agents/`: multi-agent pipeline modules
- `scripts/`: entrypoints for pipeline + validation + exports
- `signals/`: captured signals (scout output + manual inputs)
- `triage/`: triage decisions (create/update/ignore)
- `audit/`: append-only agent logs + run summaries

## Content schema (strict)

All MDX files under `content/` MUST have frontmatter. Minimum fields:

```yaml
type: principle | definition | journey | failure-pattern | model | regulatory-context | methodology | use-case
status: draft | review | published
entryIntent: definition | principle | interpretation
confidence: high | medium | low
scope: "Regulated banking environments in EU/UK"
risk: low | medium
jurisdictions: [EU | UK | GLOBAL]
regimes: [AMLR | MiCA | TFR | EBA_GUIDANCE | ESMA_GUIDANCE | FATF | OECD_CARF | EU_DAC8]
referencePolicy: EU_ONLY | GLOBAL_ONLY | EU_AND_GLOBAL
citationVerified: true | false
agentUsage:
  allowed: [ ... ]
  forbidden: [ ... ]
lastReviewed: "YYYY-MM-DD"
```

For `status: published`, validation enforces that the metadata above is present, and that citations match `referencePolicy`.

Body MUST include these headings in this exact order:

- `## Canonical Statement`
- `## Definition`
- `## Why It Matters`
- `## Failure Mode if Ignored`
- `## Scope & Non-Claims`
- `## Related Concepts`
- `## Sources`

Validation runs in CI and locally.

## Machine interface

Static JSON exports (generated from `status: published` entries by default):

- `/machine-interface/canonical-definitions.json`
- `/machine-interface/framework-schema.json`
- `/machine-interface/framework-graph.json`
- `/machine-interface/change-log.json`

Generate/update exports:

```sh
npm run generate:machine
```

Notes:

- `canonical-definitions.json` includes rich per-entry metadata (frontmatter fields, related slugs, sources, summaries) and a deterministic `contentHash`.
- Validation enforces that published entries have parseable `Related Concepts` and `Sources`, and that related slugs are non-dangling within the published set.
- `canonical-definitions.json` schema version `1.3.0` adds agent-safety + filtering + traceability fields: `entryIntent`, `jurisdictions`, `regimes`, `agentUsage`, `referencePolicy`, `citationVerified`, `embeddingHint`, `interpretationBoundary`, `authorityTierDetail`, and `policies.conflictPolicy`.

## Indexing & authority signals

This repository includes deterministic crawl/index artifacts and source-governance checks:

- `/robots.txt` generated from `app/robots.ts`
- `/sitemap.xml` generated from `app/sitemap.ts` and includes:
  - top-level pages (`/`, `/governance`, `/machine-interface`)
  - all published framework entries
  - machine JSON endpoints under `/machine-interface/*.json`
- Canonical metadata + page-level metadata on homepage, framework pages, and machine-interface page
- JSON-LD for homepage (`WebSite`, `DefinedTermSet`), framework pages (`TechArticle`, `BreadcrumbList`), and machine interface (`Dataset`)

Published entry source policy:

- `Related Concepts`: 2..3 internal framework links
- `Sources`: 2..5 links
- At least 2 source links must resolve to primary domains (unless a structured `sourceOverride` is present):
  - `eur-lex.europa.eu`
  - `ec.europa.eu`
  - `commission.europa.eu`
  - `esma.europa.eu`
  - `eba.europa.eu`
  - `fatf-gafi.org`
  - `oecd.org`
- `authorityTier` is always computed from cited sources and cannot be set in frontmatter.
- `referencePolicy` is enforced for published entries:
  - `EU_ONLY`: >=2 EU sources
  - `GLOBAL_ONLY`: >=2 GLOBAL sources
  - `EU_AND_GLOBAL`: >=1 EU and >=1 GLOBAL source
- High-inference risk classes (`regulatory_determination`, `attribution_ownership`, `illicitness_signals`, `decisioning`, `aggregation_risk`) must include at least 2 `prohibitedInferences` when `status: published`.

Post-deploy verification checklist:

```sh
curl -sS https://crypto-compliance-framework.vercel.app/robots.txt
curl -sS https://crypto-compliance-framework.vercel.app/sitemap.xml
curl -sS https://crypto-compliance-framework.vercel.app/framework/definitions/crypto-exposure | head
curl -sS https://crypto-compliance-framework.vercel.app/machine-interface/canonical-definitions.json | head
```

Recommended webmaster registration:

- Add the production domain to Google Search Console.
- Add the production domain to Bing Webmaster Tools.
- Submit `https://crypto-compliance-framework.vercel.app/sitemap.xml` to both consoles.

## New content templates

Use the new structure templates:

- Local JSON intake template: `public/templates/article-input-template.json`
- Local MDX canonical template: `public/templates/canonical-entry-template.mdx`

Published template URLs:

- `/templates/article-input-template.json`
- `/templates/canonical-entry-template.mdx`

`authorityTier` is derived automatically by the pipeline and must not be set manually in frontmatter.

## Agent pipeline

Pipeline stages:

1. `scout` (`agents/scout.ts`)
   - Fetches predefined RSS feeds and URLs (EBA + ESMA + FATF + OECD DAC8)
   - Writes `signals/*.json`
   - Rate-limited and bounded output

2. `triage` (`agents/triage.ts`)
   - Deduplicates and decides: create / update / ignore
   - Writes `triage/*.json`

3. `canonicalizer` (`agents/canonicalizer.ts`)
   - Uses OpenAI API (env configured)
   - Writes draft MDX entries under `content/**`
   - Never publishes

4. `safetyGate` (`agents/safetyGate.ts`)
   - Rejects drafts with prohibited content (legal advice phrasing, vendor mentions, thresholds/scoring, identifiers, compliance claims)
   - Promotes safe drafts from `status: draft` to `status: review`
   - Stores rejection reasons in logs (status remains draft)

Run locally:

```sh
npm run pipeline
```

### Manual signals

You can add your own signal files under `signals/` (must match the signal JSON schema in `lib/schema.ts`). The triage step will pick them up.

## Human approval and publishing

Publishing is a manual action:

- Open a PR
- Review proposed MDX changes
- Set `status: published` explicitly in the entry frontmatter
- Merge

Agents never set `status: published`.

## Environment variables

Copy `.env.example` to `.env` and set:

- `OPENAI_API_KEY` (required for canonicalizer)
- Optional: `OPENAI_MODEL`, `OPENAI_BASE_URL`, `OPENAI_TIMEOUT_MS`

### Traceability on Vercel

`generatedFrom.commitSha` and `generatedFrom.commitTime` in the machine interface are best-effort.

For Vercel CLI deployments (which do not upload `.git`), pass build-time metadata:

```sh
vercel deploy --prod \\
  -b CCF_COMMIT_SHA=\"$(git rev-parse HEAD)\" \\
  -b CCF_COMMIT_TIME=\"$(git show -s --format=%cI HEAD)\"
```

## Development

```sh
npm install
npm run dev
```

## CI

- `.github/workflows/build.yml`: validates schema, generates machine JSON, builds the site
- `.github/workflows/pipeline.yml`: runs daily, executes the pipeline, and opens a PR if changes exist

## Deployment

This is a standard Next.js 14 app, deployed to Vercel.

### Quick Start

The application is configured for automatic deployment to Vercel via GitHub integration. See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

### Local Development

- Build: `npm run build`
- Run: `npm run start`
- Governance page: `/governance`

### Vercel Setup

1. Connect your GitHub repository to Vercel
2. Configure environment variables (see [DEPLOYMENT.md](./DEPLOYMENT.md))
3. Deploy automatically on push to `main` branch

If you want a fully static deployment, generate the machine-interface JSON into `public/` (already done by `generate:machine`) and configure your hosting to serve the built output appropriately.
