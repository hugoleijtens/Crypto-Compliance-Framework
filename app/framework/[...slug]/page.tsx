import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { allFrameworkEntries } from 'contentlayer/generated';
import { useMDXComponent } from 'next-contentlayer2/hooks';
import type React from 'react';
import { absoluteUrl, SITE_NAME } from '../../../lib/site';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function visibleStatuses(): Set<string> {
  const mode = process.env.CCF_VISIBILITY ?? 'published';
  if (mode === 'all') return new Set(['draft', 'review', 'published']);
  if (mode === 'review') return new Set(['review', 'published']);
  return new Set(['published']);
}

function getEntryBySlug(slug: string) {
  return allFrameworkEntries.find((entry) => entry.slug === slug);
}

function compactText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function generateStaticParams() {
  const allowed = visibleStatuses();
  return allFrameworkEntries
    .filter((e) => allowed.has(e.status))
    .map((e) => ({ slug: e.slug.split('/') }));
}

export function generateMetadata({
  params
}: {
  params: {
    slug: string[];
  };
}): Metadata {
  const slug = params.slug.join('/');
  const entry = getEntryBySlug(slug);
  if (!entry) return {};

  const isPublished = entry.status === 'published';
  const title = `${compactText(entry.canonicalStatement || entry.slug)} | ${SITE_NAME}`;
  const description = compactText(entry.definition || entry.canonicalStatement || entry.slug).slice(0, 220);

  return {
    title,
    description,
    alternates: {
      canonical: `/framework/${entry.slug}`
    },
    robots: isPublished ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: 'article',
      title,
      description,
      url: absoluteUrl(`/framework/${entry.slug}`)
    },
    twitter: {
      card: 'summary',
      title,
      description
    }
  };
}

export default function FrameworkEntryPage({
  params
}: {
  params: {
    slug: string[];
  };
}) {
  const slug = params.slug.join('/');
  const entry = getEntryBySlug(slug);
  if (!entry) notFound();

  const allowed = visibleStatuses();
  if (!allowed.has(entry.status)) notFound();

  const MDX = useMDXComponent(entry.body.code);

  const requiredToc = [
    'Canonical Statement',
    'Definition',
    'Why It Matters',
    'Failure Mode if Ignored',
    'Scope & Non-Claims',
    'Related Concepts',
    'Sources'
  ];

  const components = {
    h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => {
      const text = typeof props.children === 'string' ? props.children : '';
      const id = slugify(text);
      return <h2 id={id} className="scroll-mt-24" {...props} />;
    },
    a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
      const href = props.href ?? '';
      const isInternal = href.startsWith('/');
      if (isInternal) {
        return <Link href={href}>{props.children}</Link>;
      }
      return <a rel="noreferrer" target="_blank" {...props} />;
    }
  };

  type Entry = (typeof allFrameworkEntries)[number];
  const relatedEntries: Entry[] = (entry.related ?? [])
    .map((s: string) => allFrameworkEntries.find((e) => e.slug === s))
    .filter((x: Entry | undefined): x is Entry => Boolean(x));

  const techArticleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: compactText(entry.canonicalStatement || entry.slug),
    description: compactText(entry.definition || entry.canonicalStatement || entry.slug),
    inLanguage: 'en',
    dateModified: new Date(entry.lastReviewed).toISOString(),
    url: absoluteUrl(`/framework/${entry.slug}`),
    about: [
      'Crypto compliance',
      'AML',
      'CDD',
      'Source of Funds',
      'Source of Wealth',
      'Regulated banking environments in EU/UK'
    ],
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: absoluteUrl('/')
    }
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: absoluteUrl('/')
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Framework',
        item: absoluteUrl('/')
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: compactText(entry.canonicalStatement || entry.slug),
        item: absoluteUrl(`/framework/${entry.slug}`)
      }
    ]
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(techArticleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <aside className="space-y-6">
        <div className="rounded-lg bg-white/40 p-5 shadow-hairline">
          <div className="font-mono text-xs text-ink-subtle">Table of contents</div>
          <ul className="mt-3 space-y-1 text-sm">
            {requiredToc.map((h) => (
              <li key={h}>
                <a href={`#${slugify(h)}`}>{h}</a>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg bg-white/40 p-5 shadow-hairline">
          <div className="font-mono text-xs text-ink-subtle">Metadata</div>
          <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-ink-subtle">Slug</dt>
            <dd className="font-mono text-xs">{entry.slug}</dd>

            <dt className="text-ink-subtle">Type</dt>
            <dd>{entry.type}</dd>

            <dt className="text-ink-subtle">Status</dt>
            <dd>
              <span className="rounded bg-white/60 px-2 py-0.5 font-mono text-xs shadow-hairline">
                {entry.status}
              </span>
            </dd>

            <dt className="text-ink-subtle">Confidence</dt>
            <dd>{entry.confidence}</dd>

            <dt className="text-ink-subtle">Risk</dt>
            <dd>{entry.risk}</dd>

            <dt className="text-ink-subtle">Scope</dt>
            <dd>{entry.scope}</dd>

            <dt className="text-ink-subtle">Last reviewed</dt>
            <dd>{new Date(entry.lastReviewed).toISOString().slice(0, 10)}</dd>
          </dl>
        </div>

        {relatedEntries.length > 0 ? (
          <div className="rounded-lg bg-white/40 p-5 shadow-hairline">
            <div className="font-mono text-xs text-ink-subtle">Related entries</div>
            <ul className="mt-3 space-y-1 text-sm">
              {relatedEntries.map((r) => (
                <li key={r!.slug}>
                  <Link href={r!.url}>{r!.canonicalStatement || r!.slug}</Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>

      <article className="prose prose-slate max-w-none rounded-lg bg-white/40 p-6 shadow-hairline prose-a:text-accent prose-headings:font-semibold prose-h2:scroll-mt-24">
        <MDX components={components} />
      </article>
    </div>
  );
}
