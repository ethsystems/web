import yaml from 'js-yaml';

export interface Post {
  slug: string;          // e.g. 2026-03-18-private-crosschain-atomic-swap-part-2
  title: string;
  description?: string;
  date: string;          // ISO date string
  author?: string;
  image?: string;
  url: string;           // Public URL on the live Jekyll blog
}

const BLOG_BASE = 'https://iptf.ethereum.org';

// Load all posts from the Jekyll _posts/ directory at build time. Posts live
// outside the guide/ app at <repo>/_posts/. The Vite glob walks them.
const rawFiles = import.meta.glob('../../../_posts/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function parseFrontmatter(content: string): { data: any; body: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { data: {}, body: content };
  let data: any = {};
  try { data = yaml.load(m[1]) || {}; } catch { data = {}; }
  return { data, body: content.slice(m[0].length).trim() };
}

function fileToSlug(path: string): string {
  const base = path.split('/').pop() || '';
  return base.replace(/\.md$/, '');
}

function jekyllUrlFromSlug(slug: string): string {
  const m = slug.match(/^(\d{4})-(\d{2})-(\d{2})-(.+)$/);
  if (!m) return `${BLOG_BASE}/blog/`;
  const [, y, mo, d, rest] = m;
  return `${BLOG_BASE}/${y}/${mo}/${d}/${rest}/`;
}

const posts: Post[] = Object.entries(rawFiles)
  .map(([path, raw]) => {
    const { data } = parseFrontmatter(raw);
    if (data.published === false) return null;
    const slug = fileToSlug(path);
    const dateStr = data.date instanceof Date
      ? data.date.toISOString()
      : (typeof data.date === 'string' ? data.date : '');
    return {
      slug,
      title: data.title || slug,
      description: data.description,
      date: dateStr,
      author: data.author,
      image: data.image ? `${BLOG_BASE}${data.image}` : undefined,
      url: jekyllUrlFromSlug(slug),
    } as Post;
  })
  .filter(Boolean) as Post[];

posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

export function getRecentPosts(limit = 3): Post[] {
  return posts.slice(0, limit);
}

export function getAllPosts(): Post[] {
  return posts;
}

export function formatPostDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
