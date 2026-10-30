import { test, expect } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildDrill } from '../scripts/build-drill.mjs';

// Runs against the content submodule: every slug the drilldown links to must be
// an entry with a page on the site, and every use case sits under one domain.
test('the drilldown tree only names entries the map carries, and places each use case once', () => {
  const drill = buildDrill();
  const kind = (s) => drill.entries[s]?.dir;
  const placed = drill.domains.flatMap((d) => d.useCases);
  expect(new Set(placed).size).toBe(placed.length);
  expect(placed.sort()).toEqual(Object.keys(drill.useCases).sort());
  for (const d of drill.domains) for (const s of [d.slug, ...d.useCases, ...d.also]) {
    expect(kind(s), s).toBeTruthy();
    expect(drill.entries[s].blurb, s).toBeTruthy();
  }
  for (const [slug, a] of Object.entries(drill.approaches)) {
    expect(kind(slug)).toBe('approaches');
    for (const d of a.designs) {
      expect(d.summary, `${slug}/${d.id}`).toBeTruthy();
      for (const p of d.patterns) expect(kind(p)).toBe('patterns');
    }
  }
});

test('domains resolve by label or alias, CRLF files parse, and a broken yaml block drops only its design', () => {
  const root = mkdtempSync(join(tmpdir(), 'drill-'));
  const put = (dir, file, text) => {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, file), text);
  };
  try {
    for (const d of ['patterns', 'jurisdictions']) mkdirSync(join(root, d));
    put('domains', 'identity-compliance.md', '---\ntitle: "Domain: Identity & Compliance"\n---\n\n## TLDR\n- First **bullet**.\n- Second bullet.\n');
    put('use-cases', 'private-kyc.md', '---\ntitle: Private KYC\nprimary_domain: identity\n---\n\n## Intent\n\nProve it.\n'.replace(/\n/g, '\r\n'));
    const design = (name, yaml) => `### ${name}\n\n**Summary:** ${name} summary.\n\n\`\`\`yaml\n${yaml}\n\`\`\`\n\n`;
    put('approaches', 'approach-kyc.md', [
      '---\ntitle: "Approach: KYC"\nuse_case: private-kyc\n---\n\n## Approaches\n\n',
      design('Good', 'maturity: pilot'),
      design('Broken', 'maturity: [unclosed'),
    ].join('').replace(/\n/g, '\r\n'));

    const drill = buildDrill(root);
    expect(drill.domains.find((d) => d.slug === 'identity-compliance').useCases).toEqual(['private-kyc']);
    expect(drill.entries['identity-compliance'].blurb).toBe('First bullet.');
    expect(drill.useCases['private-kyc'].approaches).toEqual([{ slug: 'approach-kyc', rel: 'addresses' }]);
    expect(drill.approaches['approach-kyc'].designs.map((d) => [d.name, d.maturity])).toEqual([['Good', 'pilot']]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
