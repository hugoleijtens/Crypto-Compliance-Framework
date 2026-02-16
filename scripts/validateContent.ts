import path from 'node:path';
import {
  listMdxFiles,
  parseRelatedConceptSlugs,
  readAndParseFrameworkMdxFile,
  slugFromContentPath
} from '../lib/contentUtils';

async function main() {
  const rootDirAbs = process.cwd();
  const contentDirAbs = path.join(rootDirAbs, 'content');

  const files = await listMdxFiles(contentDirAbs);
  if (files.length === 0) {
    throw new Error('No .mdx files found under content/.');
  }

  let ok = 0;
  let failed = 0;

  for (const fileAbs of files.sort()) {
    try {
      await readAndParseFrameworkMdxFile(fileAbs);
      ok += 1;
    } catch (err) {
      failed += 1;
      // eslint-disable-next-line no-console
      console.error(`INVALID: ${path.relative(rootDirAbs, fileAbs)}\n  ${String(err)}`);
    }
  }

  // Cross-entry deterministic checks (published only): ensure Related Concepts links are non-dangling.
  if (failed === 0) {
    const publishedSlugs = new Set<string>();
    const publishedEntries: Array<{ slug: string; fileAbs: string; relatedSlugs: string[] }> = [];

    for (const fileAbs of files.sort()) {
      const parsed = await readAndParseFrameworkMdxFile(fileAbs);
      if (parsed.frontmatterValidated.status !== 'published') continue;

      const slug = slugFromContentPath(contentDirAbs, fileAbs);
      publishedSlugs.add(slug);

      const relatedSlugs = parseRelatedConceptSlugs(parsed.sections['Related Concepts']);
      publishedEntries.push({ slug, fileAbs, relatedSlugs });
    }

    let graphFailed = 0;
    for (const entry of publishedEntries) {
      for (const rel of entry.relatedSlugs) {
        if (rel === entry.slug) {
          graphFailed += 1;
          // eslint-disable-next-line no-console
          console.error(
            `INVALID: ${path.relative(rootDirAbs, entry.fileAbs)}\n  Related Concepts contains self-link: ${rel}`
          );
          continue;
        }
        if (!publishedSlugs.has(rel)) {
          graphFailed += 1;
          // eslint-disable-next-line no-console
          console.error(
            `INVALID: ${path.relative(rootDirAbs, entry.fileAbs)}\n  Related Concepts dangling slug (not published): ${rel}`
          );
        }
      }
    }

    if (graphFailed > 0) failed += graphFailed;
  }

  // eslint-disable-next-line no-console
  console.log(`validate-content: ok=${ok} failed=${failed}`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(String(err));
  process.exit(1);
});
