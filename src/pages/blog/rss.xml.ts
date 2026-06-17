/*
 * /blog/rss.xml — RSS 2.0 feed for the blog.
 *
 * Source: the `posts` content collection (same as /blog/index.astro and
 * /blog/[slug].astro). Mirrors the index page exactly — published-only via
 * isPublished(), newest-first, slug via jekyllSlugify(title) — so the feed
 * stays in lockstep with the live blog.
 *
 * @astrojs/rss resolves each relative `link` against `context.site`
 * (astro.config.mjs `site`) to emit absolute URLs. Trailing slashes are
 * baked into the link to match the site's `trailingSlash: 'always'`.
 */
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { jekyllSlugify } from '../../lib/jekyllSlug';
import { isPublished } from '../../lib/posts';

export async function GET(context: APIContext) {
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
      };
    })
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return rss({
    title: 'IPTF Blog',
    description:
      'Field notes from the Institutional Privacy Task Force on building privacy on Ethereum for institutional use cases.',
    site: context.site!,
    items,
  });
}
