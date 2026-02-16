import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Governance',
  description: 'Publication governance, review cadence, and audit policy for the framework.',
  alternates: {
    canonical: '/governance'
  }
};

export default function GovernancePage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Governance</h1>
        <p className="max-w-3xl text-sm text-ink-subtle">
          The framework is designed for deterministic, auditable publishing in regulated banking environments in the
          EU/UK.
        </p>
      </div>

      <section className="rounded-lg bg-white/40 p-5 shadow-hairline">
        <h2 className="text-sm font-semibold">Ownership model</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-subtle">
          <li>Agent pipeline may draft and update entries as working artifacts.</li>
          <li>Only human reviewers can move an entry to published status.</li>
          <li>Published changes require pull request review and explicit approval.</li>
        </ul>
      </section>

      <section className="rounded-lg bg-white/40 p-5 shadow-hairline">
        <h2 className="text-sm font-semibold">Review cadence</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-subtle">
          <li>Signals are monitored continuously by scheduled pipeline runs.</li>
          <li>Published entries carry a <span className="font-mono">lastReviewed</span> date.</li>
          <li>Review timing is risk-proportionate and governed by human change control.</li>
        </ul>
      </section>

      <section className="rounded-lg bg-white/40 p-5 shadow-hairline">
        <h2 className="text-sm font-semibold">Publish criteria</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-subtle">
          <li>Mandatory frontmatter and required section order must pass validation.</li>
          <li>
            Published entries must define <span className="font-mono">entryIntent</span>,{' '}
            <span className="font-mono">jurisdictions</span>, <span className="font-mono">regimes</span>,{' '}
            <span className="font-mono">referencePolicy</span>, <span className="font-mono">agentUsage</span>, and{' '}
            <span className="font-mono">citationVerified: true</span>.
          </li>
          <li>Published entries must include 2 to 3 related concepts.</li>
          <li>Published entries must include 2 to 5 sources, including at least 2 primary sources.</li>
          <li>
            Entries using high-inference risk classes (including <span className="font-mono">aggregation_risk</span>)
            must define at least two prohibited inferences.
          </li>
        </ul>
      </section>

      <section className="rounded-lg bg-white/40 p-5 shadow-hairline">
        <h2 className="text-sm font-semibold">Authority tiering</h2>
        <p className="mt-3 text-sm text-ink-subtle">
          Authority tier is derived automatically from cited primary instruments and cannot be manually set.
        </p>
      </section>

      <section className="rounded-lg bg-white/40 p-5 shadow-hairline">
        <h2 className="text-sm font-semibold">Changelog policy</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-subtle">
          <li>Content and machine-interface changes are versioned in Git history.</li>
          <li>
            The machine interface includes <span className="font-mono">change-log.json</span> as a best-effort
            summary.
          </li>
          <li>Each published entry exposes deterministic hashes and provenance metadata.</li>
        </ul>
      </section>

      <section className="rounded-lg bg-white/40 p-5 shadow-hairline">
        <h2 className="text-sm font-semibold">Non-claims</h2>
        <p className="mt-3 text-sm text-ink-subtle">
          This framework does not provide legal advice, does not interpret legal obligations, and does not claim that
          any entry or process guarantees regulatory compliance.
        </p>
      </section>
    </div>
  );
}
