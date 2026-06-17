/*
 * /blog/rss.xml — RSS 2.0 feed for the blog.
 *
 * Source: the `posts` content collection (same as /blog/index.astro and
 * /blog/[slug].astro). Mirrors the index page exactly — published-only via
 * isPublished(), newest-first, slug via jekyllSlugify(title) — so the feed
 * stays in lockstep with the live blog.
 *
 * Each post's hero `image` is attached as an <enclosure> (RSS 2.0 media):
 * the absolute URL plus the byte length and MIME type the spec requires.
 * The byte length is read from the file under public/ at build time. Any
 * post without an image, or whose file is missing / has an unknown type, is
 * emitted without an enclosure rather than failing the build.
 *
 * @astrojs/rss resolves relative `link`/enclosure URLs against `context.site`
 * (astro.config.mjs `site`). Trailing slashes are baked into post links to
 * match the site's `trailingSlash: 'always'`.
 */
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { jekyllSlugify } from '../../lib/jekyllSlug';
import { isPublished } from '../../lib/posts';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

/**
 * Build an RSS <enclosure> for a post's hero image. Images are static assets
 * served from public/, so the on-disk path is public + the public-root URL.
 * Returns undefined (no enclosure) when there's no image, the file is missing,
 * or the extension isn't a known image type.
 */
function imageEnclosure(image: string | undefined, site: URL) {
  if (!image) return undefined;
  const type = MIME_BY_EXT[path.extname(image).toLowerCase()];
  if (!type) return undefined;
  const filePath = path.join(process.cwd(), 'public', image);
  let length: number;
  try {
    length = fs.statSync(filePath).size;
  } catch {
    return undefined;
  }
  return { url: new URL(image, site).toString(), length, type };
}

export async function GET(context: APIContext) {
  const site = context.site!;
  const all = await getCollection('posts');
  const items = all
    .filter((p) => isPublished(p))
    .map((p) => {
      const pubDate =
        p.data.date instanceof Date ? p.data.date : new Date(p.data.date);
      return {
        title: p.data.title,
        description: p.data.description ?? '',
        pubDate,
        link: `/blog/${jekyllSlugify(p.data.title)}/`,
        enclosure: imageEnclosure(p.data.image, site),
      };
    })
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return rss({
    title: 'IPTF Blog',
    description:
      'Field notes from the Institutional Privacy Task Force on building privacy on Ethereum for institutional use cases.',
    site,
    items,
  });
}
