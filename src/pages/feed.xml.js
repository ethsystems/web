import rss from '@astrojs/rss';
import { getAllPosts } from '../lib/posts';

export async function GET(context) {
  const posts = getAllPosts();
  return rss({
    title: 'IPTF — Institutional Privacy Task Force',
    description: 'Writeups from the Institutional Privacy Task Force on building privacy on Ethereum for institutional use cases.',
    site: context.site,
    items: posts.map(post => ({
      title: post.title,
      description: post.description,
      pubDate: post.date ? new Date(post.date) : new Date(),
      link: post.url,
    })),
    customData: '<language>en-us</language>',
  });
}
