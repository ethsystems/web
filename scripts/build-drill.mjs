#!/usr/bin/env node
/**
 * build-drill.mjs
 *
 * Writes src/data/drill.json, the domain > use case > design tree
 * that /drilldown/ walks. Ported from ethsystems/generative-map's
 * build-graph.mjs (pass 5), with the edge reading it depends on.
 *
 * It keeps its own edges rather than reading graph.json: the drilldown
 * needs frontmatter edges graph.json does not draw (a use case's
 * secondary_domain), and graph.json feeds the
 * explorer views, which should not shift under this page.
 *
 * Keys are the lowercased filenames, which are also the site's URL slugs
 * (/patterns/pattern-shielding/).
 */

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join, basename } from "path";
import yaml from "js-yaml";
import { parseFrontmatter, extractSummary, REPO_ROOT, OUTPUT_DIR } from "./build-graph.mjs";

const DIRS = ["patterns", "use-cases", "approaches", "domains", "jurisdictions"];

const toSlug = (v) => String(v).toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Domain fields carry labels ("Funds & Assets", "identity") where the rest carry slugs.
// Mirrors src/lib/domain.ts and scripts/validate-content-refs.mjs: match a domain's id or
// title with punctuation stripped, then these aliases. Add an alias to all three.
const PRIMARY_DOMAIN_ALIASES = {
  identity: "identity-compliance",
  compliance: "identity-compliance",
  funds: "funds-assets",
  civic: "governance",
};
const normKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");

// Card text, not markdown: links keep their words, emphasis and code marks go.
const plain = (md) => md.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\*\*|`/g, "").trim();

export function buildDrill(repoRoot = REPO_ROOT) {
  // ─── nodes ───
  const nodes = [];
  const bySlug = new Map();
  for (const dir of DIRS) {
    for (const file of readdirSync(join(repoRoot, dir)).sort()) {
      if (!file.endsWith(".md") || file.startsWith("_") || file === "README.md") continue;
      const slug = basename(file, ".md").toLowerCase();
      // The section and list regexes below expect LF.
      const raw = readFileSync(join(repoRoot, dir, file), "utf8").replace(/\r\n?/g, "\n");
      const { data: fm, body } = parseFrontmatter(raw);
      const node = {
        slug, dir, fm, body,
        title: String(fm.title ?? slug).replace(/^(Pattern|Approach|Use Case|Vendor|Domain|Jurisdiction):\s*/i, ""),
        // The same summary graph.json carries (Intent, What it is, …). A domain's TLDR is a list,
        // which that would join into one line with " - " between bullets, so take its first bullet.
        blurb: plain(/^## TLDR[ \t]*\n+- (.+)/m.exec(body)?.[1] ?? "") || extractSummary(body),
        maturity: fm.maturity,
      };
      nodes.push(node);
      bySlug.set(slug, node);
    }
  }

  const domainIds = new Set();
  const domainKeyToId = new Map();
  for (const n of nodes.filter((n) => n.dir === "domains")) {
    domainIds.add(n.slug);
    domainKeyToId.set(normKey(n.slug), n.slug);
    domainKeyToId.set(normKey(n.title), n.slug);
  }
  const resolveDomain = (raw) => {
    if (!raw) return null;
    const k = normKey(raw);
    if (domainKeyToId.has(k)) return domainKeyToId.get(k);
    const aliasId = PRIMARY_DOMAIN_ALIASES[k];
    return aliasId && domainIds.has(aliasId) ? aliasId : null;
  };

  // ─── edges, both directions; only which docs touch matters here ───
  const near0 = Object.fromEntries(nodes.map((n) => [n.slug, []]));
  const recommends = new Set();
  const addEdge = (from, to, type) => {
    if (!to) return;
    const t = toSlug(to);
    if (!bySlug.has(t) || t === from) return;
    near0[from].push(t);
    near0[t].push(from);
    if (type === "recommends") recommends.add(`${from}|${t}`).add(`${t}|${from}`);
  };
  const resolveHref = (href) => {
    if (/^https?:/.test(href)) return null;
    const file = href.split("#")[0].split("/").pop();
    if (!file?.endsWith(".md")) return null;
    const slug = basename(file, ".md").toLowerCase();
    return bySlug.has(slug) ? slug : null;
  };
  for (const { slug, fm, body } of nodes) {
    if (fm.use_case) addEdge(slug, fm.use_case);
    for (const v of [
      fm.related_use_cases, fm.primary_patterns, fm.supporting_patterns, fm.jurisdictions, fm.see_also,
    ].flat().filter(Boolean)) addEdge(slug, v);
    for (const d of [fm.primary_domain, fm.secondary_domain].flat()) addEdge(slug, resolveDomain(d));
    const rel = fm.related_patterns;
    if (rel && typeof rel === "object" && !Array.isArray(rel)) {
      for (const p of Object.values(rel).flat().filter(Boolean)) addEdge(slug, p);
    } else {
      for (const p of [rel].flat().filter((v) => typeof v === "string")) addEdge(slug, p);
    }
    for (const sub of [fm.sub_patterns].flat().filter(Boolean)) if (sub?.pattern) addEdge(slug, sub.pattern);
    // Body prose carries most cross-references.
    let section = "";
    for (const line of body.split("\n")) {
      const heading = /^##\s+(.+)/.exec(line);
      if (heading) { section = heading[1].trim().toLowerCase(); continue; }
      for (const [, , href] of line.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
        const t = resolveHref(href);
        if (t) addEdge(slug, t, !section.includes("see also") && section.includes("recommended approach") ? "recommends" : "");
      }
    }
  }

  // ─── the three steps: domain, use case, design ───
  // A design is one "### " subsection under an approach doc's "## Approaches", with its own
  // yaml block.
  const of = (dir) => nodes.filter((n) => n.dir === dir);
  const near = (slug, dir) => [...new Set(near0[slug])].filter((s) => bySlug.get(s).dir === dir);
  const RANK = { addresses: 0, recommends: 1, related: 2 };
  const POCS = "https://github.com/ethsystems/pocs/blob/master/";

  function designsOf(a) {
    const section = /^## Approaches[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(a.body)?.[1] ?? "";
    return section.split(/^### /m).slice(1).map((chunk) => {
      const name = chunk.slice(0, chunk.indexOf("\n")).trim();
      let meta;
      try {
        meta = yaml.load(/```yaml\n([\s\S]*?)```/.exec(chunk)?.[1] ?? "") ?? {};
      } catch (err) {
        // Upstream content: warn and drop the design rather than fail the deploy.
        console.warn(`  ${a.slug}: "${name}" has a yaml block that does not parse, so /drilldown/ skips it (${err.message.split("\n")[0]})`);
        return null;
      }
      const list = (label) =>
        (new RegExp(`\\*\\*${label}:\\*\\*[ \\t]*\\n(?:[ \\t]*\\n)?((?:[ \\t]*- .*\\n?)+)`).exec(chunk)?.[1] ?? "")
          .split("\n").map((l) => plain(l.replace(/^\s*- /, ""))).filter(Boolean);
      const patterns = [meta.uses_patterns].flat().filter(Boolean).map(toSlug).filter((p) => bySlug.get(p)?.dir === "patterns");
      return {
        id: toSlug(name), name,
        summary: plain(/\*\*Summary:\*\*\s*(.+)/.exec(chunk)?.[1] ?? ""),
        maturity: meta.maturity ?? "", context: meta.context ?? "", crops: meta.crops ?? {},
        patterns,
        ...(meta.poc_spec && { poc: POCS + meta.poc_spec }),
        best: list("Works best when"), avoid: list("Avoid when"),
      };
    }).filter(Boolean);
  }

  const useCases = Object.fromEntries(
    of("use-cases").map((u) => {
      const approaches = near(u.slug, "approaches").map((a) => {
        const rel = toSlug(bySlug.get(a).fm.use_case ?? "") === u.slug ? "addresses"
          : recommends.has(`${u.slug}|${a}`) ? "recommends" : "related";
        return { slug: a, rel };
      });
      approaches.sort((x, y) => RANK[x.rel] - RANK[y.rel]);
      return [u.slug, { domain: resolveDomain(u.fm.primary_domain) ?? "", approaches }];
    }),
  );

  const domains = of("domains")
    .map((d) => {
      const own = of("use-cases").filter((u) => useCases[u.slug].domain === d.slug).map((u) => u.slug);
      return { slug: d.slug, useCases: own, also: near(d.slug, "use-cases").filter((s) => !own.includes(s)) };
    })
    .sort((a, b) => b.useCases.length - a.useCases.length || a.slug.localeCompare(b.slug));

  const approaches = Object.fromEntries(
    of("approaches").map((a) => {
      const designs = designsOf(a);
      if (!designs.length) console.warn(`  ${a.slug}: no "### " designs under "## Approaches", so /drilldown skips it`);
      const code = [a.fm.open_source_implementations].flat().filter((c) => c?.url)
        .map(({ url, description }) => ({ url, description: description ?? "" }));
      return [a.slug, { designs, code }];
    }),
  );

  const entries = Object.fromEntries(
    nodes.map(({ slug, dir, title, blurb, maturity }) => [slug, { dir, title, blurb, ...(maturity && { maturity }) }]),
  );
  return { domains, useCases, approaches, entries };
}

const isMain = process.argv[1] && import.meta.filename === process.argv[1];
if (isMain) {
  const drill = buildDrill();
  writeFileSync(join(OUTPUT_DIR, "drill.json"), JSON.stringify(drill));
  const designs = Object.values(drill.approaches).reduce((n, a) => n + a.designs.length, 0);
  console.log(`Drilldown built: ${drill.domains.length} domains, ${Object.keys(drill.useCases).length} use cases, ${designs} designs`);
}
