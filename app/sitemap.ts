import type { MetadataRoute } from 'next';
import { allFrameworkEntries } from 'contentlayer/generated';
import { absoluteUrl } from '../lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), lastModified: now },
    { url: absoluteUrl('/governance'), lastModified: now },
    { url: absoluteUrl('/machine-interface'), lastModified: now },
    { url: absoluteUrl('/machine-interface/canonical-definitions.json'), lastModified: now },
    { url: absoluteUrl('/machine-interface/framework-schema.json'), lastModified: now },
    { url: absoluteUrl('/machine-interface/framework-graph.json'), lastModified: now },
    { url: absoluteUrl('/machine-interface/change-log.json'), lastModified: now }
  ];

  const frameworkPages: MetadataRoute.Sitemap = allFrameworkEntries
    .filter((entry) => entry.status === 'published')
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((entry) => ({
      url: absoluteUrl(entry.url),
      lastModified: entry.lastReviewed ? new Date(entry.lastReviewed) : now
    }));

  return [...staticPages, ...frameworkPages];
}

