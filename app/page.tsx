import type { Metadata } from 'next';
import Link from 'next/link';
import { allFrameworkEntries } from 'contentlayer/generated';
import { absoluteUrl, SITE_NAME } from '../lib/site';

export const metadata: Metadata = {
  title: 'Continuous Crypto Compliance Framework',
  description:
    'Deterministic framework entries for crypto compliance in regulated banking environments in the EU/UK.',
  alternates: {
    canonical: '/'
  }
};

function visibleStatuses(): Set<string> {
  const mode = process.env.CCF_VISIBILITY ?? 'published';
  if (mode === 'all') return new Set(['draft', 'review', 'published']);
  if (mode === 'review') return new Set(['review', 'published']);
  return new Set(['published']);
}

export default function HomePage() {
  const allowed = visibleStatuses();
  const entries = allFrameworkEntries
    .filter((e) => allowed.has(e.status))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const bySection = entries.reduce<Record<string, typeof entries>>((acc, e) => {
    (acc[e.section] ??= []).push(e);
    return acc;
  }, {});
  const publishedDefinitionUrls = entries
    .filter((entry) => entry.type === 'definition')
    .slice(0, 12)
    .map((entry) => absoluteUrl(entry.url));

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: absoluteUrl('/'),
    inLanguage: 'en',
    description:
      'A deterministic, auditable framework for crypto compliance content in regulated banking environments in the EU/UK.'
  };

  const definedTermSetJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: `${SITE_NAME} Canonical Definitions`,
    url: absoluteUrl('/machine-interface/canonical-definitions.json'),
    hasDefinedTerm: publishedDefinitionUrls
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1.3fr_0.7fr]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(definedTermSetJsonLd) }}
      />
      <section className="space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">Continuous Crypto Compliance Framework</h1>
          <p className="text-ink-subtle">
            A deterministic knowledge base for controlled, repeatable writing about crypto compliance topics in scope for
            regulated banking environments in the EU/UK.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-lg bg-white/40 p-5 shadow-hairline">
            <h2 className="text-sm font-semibold">What this is</h2>
            <ul className="mt-3 list-disc pl-5 text-sm text-ink-subtle">
              <li>A canonical set of entries with mandatory structure.</li>
              <li>A content pipeline that monitors signals and drafts updates.</li>
              <li>A machine-readable interface for retrieval and tooling.</li>
            </ul>
          </div>
          <div className="rounded-lg bg-white/40 p-5 shadow-hairline">
            <h2 className="text-sm font-semibold">What this is not</h2>
            <ul className="mt-3 list-disc pl-5 text-sm text-ink-subtle">
              <li>Legal advice or legal interpretation.</li>
              <li>Vendor evaluation or product guidance.</li>
              <li>Thresholds, scoring formulas, or operational playbooks.</li>
            </ul>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Governance model</h2>
          <div className="rounded-lg bg-white/40 p-5 text-sm text-ink-subtle shadow-hairline">
            <ol className="list-decimal space-y-1 pl-5">
              <li>Agents scout and triage external and internal signals.</li>
              <li>
                Agents draft entries as <span className="font-mono">status: draft</span>.
              </li>
              <li>
                A safety gate may promote drafts to <span className="font-mono">status: review</span>.
              </li>
              <li>
                A human reviewer publishes by editing the entry to <span className="font-mono">status: published</span> in a
                PR.
              </li>
            </ol>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Intended audience</h2>
          <p className="text-sm text-ink-subtle">
            Compliance, risk, audit, financial crime, and engineering teams building or operating crypto-related
            capabilities in regulated banking environments in the EU/UK.
          </p>
        </div>
      </section>

      <aside className="space-y-6">
        <div className="rounded-lg bg-white/40 p-5 shadow-hairline">
          <h2 className="text-sm font-semibold">Machine interface</h2>
          <p className="mt-2 text-sm text-ink-subtle">
            Canonical data exports are available under <span className="font-mono">/machine-interface</span>.
          </p>
          <div className="mt-3 text-sm">
            <Link href="/machine-interface">Open machine interface</Link>
          </div>
        </div>

        <div className="rounded-lg bg-white/40 p-5 shadow-hairline">
          <h2 className="text-sm font-semibold">Visible entries</h2>
          <div className="mt-3 space-y-4">
            {Object.keys(bySection)
              .sort()
              .map((section) => (
                <div key={section} className="space-y-2">
                  <div className="font-mono text-xs text-ink-subtle">{section}</div>
                  <ul className="space-y-1 text-sm">
                    {bySection[section].map((e) => (
                      <li key={e.slug}>
                        <Link href={e.url}>{e.canonicalStatement || e.slug}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
