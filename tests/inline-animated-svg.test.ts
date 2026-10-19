import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { VFile } from 'vfile';
import { remarkInlineAnimatedSvg } from '../src/plugins/remark-inline-animated-svg';

const dir = mkdtempSync(join(tmpdir(), 'inline-svg-'));
writeFileSync(join(dir, 'anim.svg'), '<svg role="img"><style>@keyframes on{}</style></svg>\n');
writeFileSync(join(dir, 'static.svg'), '<svg role="img"></svg>\n');

function firstInline(md: string) {
  const file = new VFile({ path: join(dir, 'post.md'), value: md });
  const tree = unified().use(remarkParse).parse(file);
  unified().use(remarkInlineAnimatedSvg).runSync(tree, file);
  return (tree.children[0] as any).children[0];
}

describe('remarkInlineAnimatedSvg', () => {
  it('inlines an animated SVG and moves the alt text to aria-label', () => {
    const node = firstInline('![A "quoted" step](anim.svg)');
    expect(node.type).toBe('html');
    expect(node.value).toBe('<svg aria-label="A &quot;quoted&quot; step" role="img"><style>@keyframes on{}</style></svg>');
  });

  it('leaves static SVGs and missing files as images', () => {
    expect(firstInline('![x](static.svg)').type).toBe('image');
    expect(firstInline('![x](missing.svg)').type).toBe('image');
  });
});
