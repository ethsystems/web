// JSON-LD structured data builders (schema.org). Kept separate from
// site.ts so layouts/pages can import just the shape they render
// without pulling in unrelated nav/footer config.
import { site } from './site';

export const organizationId = `${site.domain}/#organization`;
const websiteId = `${site.domain}/#website`;

/** Sitewide Organization + WebSite graph. Emitted on every page via BaseLayout. */
export function siteGraphSchema() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: site.name,
        url: `${site.domain}/`,
        logo: `${site.domain}/icon-maskable.png`,
        sameAs: [site.x, site.linkedin, site.github],
      },
      {
        '@type': 'WebSite',
        '@id': websiteId,
        url: `${site.domain}/`,
        name: site.name,
        publisher: { '@id': organizationId },
      },
    ],
  };
}

interface FaqEntryLike {
  q: string;
  a: string[];
}
interface FaqCategoryLike {
  questions: FaqEntryLike[];
}

/** FAQPage schema from the shared faqCategories dataset (src/data/faq.ts). */
export function faqPageSchema(categories: FaqCategoryLike[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: categories.flatMap((cat) =>
      cat.questions.map((entry) => ({
        '@type': 'Question',
        name: entry.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: entry.a.join(' '),
        },
      })),
    ),
  };
}

/** BlogPosting schema for a single writeup. `date` is the already-normalized YYYY-MM-DD string. */
export function blogPostingSchema(opts: {
  title: string;
  description?: string;
  date: string;
  authors?: string;
  image?: string;
  url: string;
}) {
  const authorNames = (opts.authors ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: opts.title,
    description: opts.description,
    datePublished: opts.date,
    url: opts.url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': opts.url },
    ...(authorNames.length > 0 && {
      author: authorNames.map((name) => ({ '@type': 'Person', name })),
    }),
    ...(opts.image && { image: new URL(opts.image, `${site.domain}/`).toString() }),
    publisher: { '@id': organizationId },
  };
}
