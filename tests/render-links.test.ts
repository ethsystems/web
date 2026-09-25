import { describe, it, expect } from 'vitest';
import { renderMarkdown, resolveHref } from '../src/lib/render';
import { inlineMd } from '../src/lib/inlineMarkdown';

function href(md: string): string {
  const m = renderMarkdown(md).match(/<a href="([^"]*)"/);
  return m ? m[1] : '';
}

describe('renderMarkdown link rewriting', () => {
  it('rewrites folder links to the collection index route', () => {
    // Regression: use-cases/private-stablecoins.md links the whole folder.
    // Shipped verbatim it resolved to /use-cases/jurisdictions/ (404).
    expect(href('see [jurisdiction](../jurisdictions/)')).toBe('/jurisdictions/');
    expect(href('[Vendors](../vendors/)')).toBe('/vendors/');
    expect(href('[Patterns](./patterns/)')).toBe('/patterns/');
    expect(href('[RFPs](../rfps/)')).toBe('/rfps/');
  });

  it('leaves non-collection relative paths untouched', () => {
    expect(href('[spec](../scripts/)')).toBe('../scripts/');
    expect(href('[deep](../a/b/)')).toBe('../a/b/');
  });

  it('still rewrites .md card links', () => {
    expect(href('[MiCA](../jurisdictions/eu-MiCA.md)')).toBe('/jurisdictions/eu-mica/');
  });

  it('leaves absolute and external links untouched', () => {
    expect(href('[EIP](https://eips.ethereum.org/EIPS/eip-5564)')).toBe(
      'https://eips.ethereum.org/EIPS/eip-5564',
    );
    expect(href('[map](/map/)')).toBe('/map/');
  });

  it('routes root map documents to their GitHub source', () => {
    expect(resolveHref('CONTRIBUTING.md#crops-evaluation')).toBe(
      'https://github.com/ethsystems/map/blob/master/CONTRIBUTING.md#crops-evaluation',
    );
  });

});

describe('inlineMd link rewriting', () => {
  it('renders glossary definition links', () => {
    expect(
      inlineMd('See [RFC 9497](https://www.rfc-editor.org/rfc/rfc9497.html).'),
    ).toContain('href="https://www.rfc-editor.org/rfc/rfc9497.html"');

    expect(
      inlineMd('See [Pattern](patterns/pattern-verifiable-attestation.md).'),
    ).toContain('<a href="/patterns/pattern-verifiable-attestation/">Pattern</a>');

    expect(
      inlineMd('See [CROPS](CONTRIBUTING.md#crops-evaluation).'),
    ).toContain(
      'href="https://github.com/ethsystems/map/blob/master/CONTRIBUTING.md#crops-evaluation"',
    );
  });

  it('rewrites map hrefs in frontmatter strings', () => {
    // Regression: pattern-page `post_quantum.mitigation` shipped verbatim.
    expect(inlineMd('See [Post-Quantum Threats](../domains/post-quantum.md).')).toContain(
      '<a href="/domains/post-quantum/">Post-Quantum Threats</a>',
    );
    // `rfps` has a route but no graph node type, so resolveMdHref() misses it.
    expect(inlineMd('[Private Reads](../rfps/rfp-private-reads.md)')).toContain(
      '<a href="/rfps/rfp-private-reads/">Private Reads</a>',
    );
  });

  it('keeps internal links in-tab and external links _blank', () => {
    expect(inlineMd('[x](../domains/custody.md)')).not.toContain('target="_blank"');
    expect(inlineMd('[x](https://example.com)')).toContain('target="_blank"');
  });
});
