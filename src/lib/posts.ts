import yaml from 'js-yaml';

export interface Post {
  slug: string;          // URL slug, derived from frontmatter title (Jekyll-compatible)
  title: string;
  description?: string;
  date: string;          // ISO date string
  author?: string;
  image?: string;        // Path on this site, e.g. /assets/images/...
  url: string;           // Internal URL, e.g. /cypherpunk-x-institutional-privacy/
  body: string;          // Markdown body for the detail page renderer
}

// Load every post file from src/posts/ at build time. Frontmatter is parsed
// here; the body is exposed so the [slug].astro detail page can render it.
const rawFiles = import.meta.glob('../posts/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function parseFrontmatter(content: string): { data: any; body: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { data: {}, body: content };
  let data: any = {};
  try { data = yaml.load(m[1]) || {}; } catch { data = {}; }
  return { data, body: content.slice(m[0].length).trim() };
}

// Mirrors Jekyll's default `:title` permalink slugify behaviour so existing
// public URLs (e.g. /cypherpunk-x-institutional-privacy/) keep working.
export function jekyllSlugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const posts: Post[] = Object.entries(rawFiles)
  .map(([_path, raw]) => {
    const { data, body } = parseFrontmatter(raw);
    if (data.published === false) return null;

    const title = data.title || '';
    const slug = jekyllSlugify(title);
    const dateStr = data.date instanceof Date
      ? data.date.toISOString()
      : (typeof data.date === 'string' ? data.date : '');

    return {
      slug,
      title,
      description: data.description,
      date: dateStr,
      author: data.author,
      image: data.image,
      url: `/${slug}/`,
      body,
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

export function getPostBySlug(slug: string): Post | undefined {
  return posts.find(p => p.slug === slug);
}

export function formatPostDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
