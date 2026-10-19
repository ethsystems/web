/**
 * Remark plugin: inline post SVGs that carry CSS animation.
 *
 * An SVG behind <img> is a sealed document. No page script can reach it, so
 * its animation starts on load, often while the figure is still offscreen.
 * Inlined, the observer in src/pages/writeups/[slug].astro can hold it until
 * the figure scrolls into view. Static SVGs stay as <img> and keep Astro's
 * asset pipeline.
 *
 * Runs before Astro's remarkCollectImages, so an inlined file is never
 * emitted as an asset. The alt text moves to aria-label; the SVG root
 * already carries role="img".
 *
 * An inlined SVG shares the page's CSS and id space, so its <style> must
 * scope every selector to the root id and its marker ids must be unique.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { visit, SKIP } from 'unist-util-visit';
import type { Root, Image } from 'mdast';
import type { Plugin } from 'unified';
import type { VFile } from 'vfile';

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// ponytail: Astro's content cache keys on the .md, so an edited SVG shows up
// once the post changes or node_modules/.astro is cleared. Fold the SVG into
// the entry digest if that starts to bite.
export const remarkInlineAnimatedSvg: Plugin<[], Root> = () => (tree: Root, file: VFile) => {
  if (!file.path) return;
  visit(tree, 'image', (node: Image, index, parent) => {
    if (!parent || index === undefined) return;
    if (!/\.svg$/i.test(node.url) || /^([a-z]+:|\/)/i.test(node.url)) return;
    let svg: string;
    try {
      svg = readFileSync(resolve(dirname(file.path), node.url), 'utf8');
    } catch {
      return; // leave it to Astro, which reports the missing file
    }
    if (!svg.includes('@keyframes')) return;
    parent.children[index] = {
      type: 'html',
      value: svg.trim().replace(/^<svg\b/, `<svg aria-label="${escapeAttr(node.alt ?? '')}"`),
    };
    return SKIP;
  });
};
