import type { Metadata } from 'next';
import Link from 'next/link';
import { absoluteUrl } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Machine Interface',
  description: 'Machine-readable canonical exports for deterministic AI retrieval and audit support.',
  alternates: {
    canonical: '/machine-interface'
  }
};

const exports = [
  {
    name: 'canonical-definitions.json',
    path: '/machine-interface/canonical-definitions.json',
    description: 'Published canonical statements and definitions for retrieval.'
  },
  {
    name: 'framework-schema.json',
    path: '/machine-interface/framework-schema.json',
    description: 'Deterministic schema describing framework entries.'
  },
  {
    name: 'framework-graph.json',
    path: '/machine-interface/framework-graph.json',
    description: 'Graph export (nodes/edges) derived from Related Concepts links.'
  },
  {
    name: 'change-log.json',
    path: '/machine-interface/change-log.json',
    description: 'Recent content-related Git history (best effort).'
  }
];

export default function MachineInterfacePage() {
  const datasetJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Crypto Compliance Framework Machine Interface',
    description: 'Published canonical framework entries, schema, graph, and change-log exports.',
    url: absoluteUrl('/machine-interface'),
    distribution: exports.map((item) => ({
      '@type': 'DataDownload',
      name: item.name,
      encodingFormat: 'application/json',
      contentUrl: absoluteUrl(item.path)
    }))
  };

  return (
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }}
      />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Machine interface</h1>
        <p className="max-w-3xl text-sm text-ink-subtle">
          This endpoint set is designed for deterministic AI retrieval. It is generated from entries with
          <span className="mx-1 font-mono">status: published</span>.
        </p>
      </div>

      <div className="rounded-lg bg-white/40 p-5 shadow-hairline">
        <ul className="space-y-4">
          {exports.map((e) => (
            <li key={e.name} className="space-y-1">
              <div className="font-mono text-xs text-ink-subtle">{e.name}</div>
              <div className="text-sm">
                <Link href={e.path}>{e.path}</Link>
              </div>
              <div className="text-sm text-ink-subtle">{e.description}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg bg-white/40 p-5 text-sm text-ink-subtle shadow-hairline">
        <p className="font-semibold text-ink">Notes</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Draft and review content is intentionally excluded from the machine export by default.</li>
          <li>Publishing is a human action via pull request and explicit status change.</li>
        </ul>
      </div>
    </div>
  );
}
