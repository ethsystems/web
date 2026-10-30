/*
 * /drilldown/ — domain > use case > design, one column per step.
 * Ported from ethsystems/generative-map's /drilldown, without its Ask,
 * Explain and vendor steps. The path lives in the hash (#/domain/use-case/approach/design),
 * so one static page serves every path and plain links keep back, forward and
 * new tabs working.
 *
 * SOURCE: map field — do not alter. Every title, blurb, design and trade-off
 * comes from src/data/drill.json (scripts/build-drill.mjs) as the map writes it,
 * with inline markdown marks (links, emphasis, code) stripped to plain text, the
 * way graph.json summaries are.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import drill from '../../data/drill.json';
import './drilldown.css';

type Rel = 'addresses' | 'recommends' | 'related';
type Crops = Partial<Record<'cr' | 'o' | 'p' | 's', string>>;
type Design = {
  id: string; name: string; summary: string; maturity: string; context: string; crops: Crops;
  patterns: string[]; poc?: string; best: string[]; avoid: string[];
};
type Approach = { designs: Design[]; code: { url: string; description: string }[] };
type UseCase = { domain: string; approaches: { slug: string; rel: Rel }[] };
type Domain = { slug: string; useCases: string[]; also: string[] };
type Entry = { dir: string; title: string; blurb: string; maturity?: string };
export type Writeup = { slug: string; title: string; description: string; date: string; about: string[] };

const DOMAINS = drill.domains as Domain[];
const USE_CASES = drill.useCases as Record<string, UseCase>;
const APPROACHES = drill.approaches as Record<string, Approach>;
const ENTRIES = drill.entries as Record<string, Entry>;
/** Designs by "approach/design", the key a design goes by in the URL and in the columns. */
const DESIGNS = new Map<string, Design & { approach: string }>(
  Object.entries(APPROACHES).flatMap(([a, { designs }]) => designs.map((d) => [`${a}/${d.id}`, { ...d, approach: a }] as const)),
);

const REL: Record<Rel, string> = { addresses: 'addresses it', recommends: 'recommended', related: 'related' };
const CONTEXT: Record<string, string> = { i2i: 'I2I', i2u: 'I2U', both: 'I2I + I2U' };
const KIND: Record<string, string> = {
  patterns: 'pattern', 'use-cases': 'use case', approaches: 'approach',
  domains: 'domain', jurisdictions: 'jurisdiction', vendors: 'vendor',
};

export type Path = { domain?: string; useCase?: string; design?: string };

/** The hash is the path. Segments past the first one the map does not carry are dropped. */
export function parse(hash: string): Path {
  // Slugs are [a-z0-9-], so nothing needs decoding; a segment that is not one matches nothing.
  const [a, b, c, d] = hash.replace(/^#/, '').toLowerCase().split('/').filter(Boolean);
  const domain = DOMAINS.find((x) => x.slug === a);
  if (!domain) return {};
  if (![...domain.useCases, ...domain.also].includes(b)) return { domain: a };
  const design = `${c}/${d}`;
  if (!USE_CASES[b].approaches.some((x) => x.slug === c) || !DESIGNS.has(design)) return { domain: a, useCase: b };
  return { domain: a, useCase: b, design };
}

const href = (...slugs: (string | undefined)[]) => `#/${slugs.filter(Boolean).join('/')}`;
/** The entry's own page on this site. */
const pageOf = (slug: string) => `/${ENTRIES[slug].dir}/${slug}/`;
const title = (slug: string) => ENTRIES[slug].title;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** A word in the path: a design by its own name, anything else by its map title. */
const nameOf = (key: string) => DESIGNS.get(key)?.name ?? title(key);

const AXES = [['cr', 'CR', 'Censorship resistance'], ['o', 'O', 'Open source'], ['p', 'P', 'Privacy'], ['s', 'S', 'Security']] as const;
/** 3 is the top rating on every axis, 0 is none. */
const RANK: Record<string, number> = { high: 3, full: 3, yes: 3, medium: 2, partial: 2, low: 1, no: 1, none: 0 };
const TONE = ['low', 'low', 'med', 'full'];

function CropsFact({ c }: { c: Crops }) {
  const axes = AXES.filter(([k]) => c[k]);
  if (!axes.length) return null;
  return (
    <div className="kb-fact kb-crops">
      <dt>CROPS</dt>
      <dd>
        {axes.map(([k, code, name]) => {
          const r = RANK[c[k]!] ?? 0;
          return (
            <div key={k} className="kb-crops-axis">
              <span className="kb-crops-name"><abbr title={name}>{code}</abbr>{name}</span>
              <span className="kb-crops-val">{c[k]}</span>
              <span className={`kb-crops-meter tone-${TONE[r]}`} aria-hidden="true">
                {[1, 2, 3].map((i) => <i key={i} className={i <= r ? 'on' : undefined} />)}
              </span>
            </div>
          );
        })}
      </dd>
    </div>
  );
}

type Row = { key: string; to: string; meta: string; faint?: boolean; group?: string };

function Column({ step, rows, from, picked, hint, onPoint }: {
  step: string; rows: Row[] | null; from: string; picked?: string; hint: string;
  onPoint: (key: string | null) => void;
}) {
  return (
    <section className="dd-col" aria-label={step} data-open={rows ? '' : undefined} onMouseLeave={() => onPoint(null)}>
      <header className="dd-col-head">
        <span className="dd-step">{step}</span>
        {rows && <span className="kb-refs-n">{rows.length}</span>}
      </header>
      {/* Keyed on the picks upstream, so a column fades its rows in again when its contents change. */}
      {rows?.length ? (
        <ul key={from}>
          {rows.map((r, i) => (
            <li key={r.key} style={{ '--i': i } as CSSProperties}>
              {r.group && <p className="dd-col-group">{r.group}</p>}
              <a href={r.to} className="dd-row" aria-current={r.key === picked ? 'true' : undefined}
                // A mouse or the keyboard only: on touch, a preview that changes the page on the first tap eats the click.
                onPointerEnter={(e) => e.pointerType === 'mouse' && onPoint(r.key)} onFocus={(e) => e.currentTarget.matches(':focus-visible') && onPoint(r.key)} onBlur={() => onPoint(null)}>
                <span className="dd-row-t">{nameOf(r.key)}</span>
                <span className={`dd-row-m${r.faint ? ' is-faint' : ''}`}>{r.meta}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dd-col-empty" key={from}>{hint}</p>
      )}
    </section>
  );
}

function Group({ label, n, children }: { label: string; n?: number; children: ReactNode }) {
  return (
    <section className="kb-refs">
      <p className="section-tag">{label}{n !== undefined && <span className="kb-refs-n">{n}</span>}</p>
      {children}
    </section>
  );
}

// How alike two sets of map slugs are: shared over all the two name (Jaccard), so a broad set that
// happens to share one slug ranks under a close one.
function likeness(a: string[], b: string[]): number {
  const shared = a.filter((s) => b.includes(s)).length;
  return shared ? shared / (a.length + b.length - shared) : 0;
}

// At most three: the posts whose patterns are most like the design's, newest first among equals (sort
// is stable). A post that shares none shows only when none does, as at a use case, where there are no
// patterns to go by.
function Writeups({ all, slugs, patterns = [] }: { all: Writeup[]; slugs: string[]; patterns?: string[] }) {
  const ranked = all
    .filter((w) => w.about.some((s) => slugs.includes(s)))
    .map((w) => ({ w, like: likeness(patterns, w.about.filter((s) => s.startsWith('pattern-'))) }))
    .sort((a, b) => b.like - a.like);
  const close = ranked.filter((r) => r.like > 0);
  const found = (close.length ? close : ranked).slice(0, 3).map(({ w }) => w);
  if (!found.length) return null;
  return (
    <Group label="Written up" n={found.length}>
      {found.map((w) => (
        <a key={w.slug} className="kb-writeup" href={`/writeups/${w.slug}/`}>
          <h3>{w.title}</h3>
          <p className="kb-writeup-desc">{w.description}</p>
          <p className="kb-writeup-meta">
            <time dateTime={w.date}>{w.date}</time>
            <span className="kb-writeup-go">Read the writeup <span className="arr">→</span></span>
          </p>
        </a>
      ))}
    </Group>
  );
}

// A list of map entries, each linking to its page on this site.
function EntryLinks({ slugs }: { slugs: string[] }) {
  return (
    <ul className="dd-paths">
      {slugs.map((s) => (
        <li key={s}>
          <a href={pageOf(s)}><b>{title(s)}</b><span>{ENTRIES[s].blurb}</span><span className="arr">→</span></a>
        </li>
      ))}
    </ul>
  );
}

function DesignDetail({ design, useCase, writeups }: { design: string; useCase: string; writeups: Writeup[] }) {
  const d = DESIGNS.get(design)!;
  const a = APPROACHES[d.approach];
  return (
    <>
      <dl className="kb-facts">
        <div className="kb-fact"><dt>Maturity</dt><dd>{d.maturity}</dd></div>
        <div className="kb-fact"><dt>Context</dt><dd>{CONTEXT[d.context] ?? d.context}</dd></div>
        <CropsFact c={d.crops} />
      </dl>
      {(d.best.length > 0 || d.avoid.length > 0) && (
        <div className="dd-trade">
          <section>
            <p className="section-tag">Works best when</p>
            <ul>{d.best.map((t) => <li key={t}>{t}</li>)}</ul>
          </section>
          <section>
            <p className="section-tag">Avoid when</p>
            <ul>{d.avoid.map((t) => <li key={t}>{t}</li>)}</ul>
          </section>
        </div>
      )}
      <Group label="Patterns it uses" n={d.patterns.length}>
        <ul className="dd-chips">
          {d.patterns.map((p) => (
            <li key={p}><a href={pageOf(p)} className="chip chip--neutral">{title(p)}</a></li>
          ))}
        </ul>
      </Group>
      {(d.poc || a.code.length > 0) && (
        <Group label="Built and open source" n={(d.poc ? 1 : 0) + a.code.length}>
          <ul className="dd-paths">
            {d.poc && (
              <li>
                <a href={d.poc}><b>EthSystems starter kit</b><span>{d.poc.replace(/^.*\/pocs\/blob\/master\//, '')}</span><span className="arr">↗</span></a>
              </li>
            )}
            {a.code.map((c) => (
              <li key={c.url}>
                <a href={c.url}><b>{c.url.replace(/^https:\/\/github\.com\//, '')}</b><span>{c.description}</span><span className="arr">↗</span></a>
              </li>
            ))}
          </ul>
        </Group>
      )}
      <Writeups all={writeups} slugs={[d.approach, useCase]} patterns={d.patterns} />
    </>
  );
}

// The deepest pick, read in full under the columns.
function Detail({ path, writeups }: { path: Path; writeups: Writeup[] }) {
  const here = path.design ?? path.useCase ?? path.domain;
  if (!here) {
    return (
      <div className="dd-detail">
        <Group label="Across every domain">
          <EntryLinks slugs={DOMAINS.filter((d) => !d.useCases.length).map((d) => d.slug)} />
        </Group>
      </div>
    );
  }
  const d = here === path.design ? DESIGNS.get(here)! : null;
  const slug = d ? d.approach : here;
  const e = ENTRIES[slug];
  // Every entry on the path has its own page here, deepest first.
  const onSite = [path.design && DESIGNS.get(path.design)!.approach, path.useCase, path.domain]
    .filter((s): s is string => !!s);
  return (
    <div className="dd-detail" key={here}>
      <header className="dd-head">
        <p className="dd-head-kind">
          <span className="kb-kind" data-dir={e.dir}>{d ? 'design' : KIND[e.dir] ?? e.dir}</span>
          {d && <span className="dd-head-from">in {e.title}</span>}
          {!d && e.maturity && <span className="chip chip--success">{e.maturity}</span>}
        </p>
        <h2>{d ? d.name : e.title}</h2>
        <p className="lede">{d ? d.summary : e.blurb}</p>
        <p className="dd-acts">
          {onSite.map((s, i) => (
            <a key={s} className={`btn ${i ? 'ghost' : 'primary'}`} href={pageOf(s)}>
              Read the {KIND[ENTRIES[s].dir]} <span className="arr">→</span>
            </a>
          ))}
        </p>
      </header>
      {d && <DesignDetail design={here} useCase={path.useCase!} writeups={writeups} />}
      {here === path.useCase && <Writeups all={writeups} slugs={[here]} />}
    </div>
  );
}

const STEPS = ['Domain', 'Use case', 'Design'];
const LABELS = ['domain', 'use case', 'design'];
// Spelled out, because "use case" takes "a" despite its vowel.
const A_LABEL = ['a domain', 'a use case', 'a design'];

const bare = (useCase?: string) => !!useCase && !USE_CASES[useCase].approaches.some((a) => APPROACHES[a.slug].designs.length);
type Ghost = { slot: number; key: string } | null;

// The path written out above the columns. Pointing at a row writes it into its blank in grey.
function Line({ path, ghost }: { path: Path; ghost: Ghost }) {
  const at = [path.domain, path.useCase, path.design];
  const open = at.findIndex((s) => !s);
  // Marks a sentence the clamp cut, so pointing at it shows the rest.
  const box = useRef<HTMLDivElement>(null);
  const measure = useCallback(() => {
    // The whole copy against the clamped one, as the labels under the blanks add to a scroll height.
    const [p, full] = box.current?.querySelectorAll<HTMLElement>('.sn-sentence') ?? [];
    if (p) box.current!.toggleAttribute('data-clamped', full.offsetHeight > p.clientHeight + 1);
  }, []);
  useLayoutEffect(measure);
  // Again when the width changes, or a face loads late (the italic loads on the first hover).
  useEffect(() => {
    const ro = new ResizeObserver(measure);
    ro.observe(box.current!);
    document.fonts.addEventListener('loadingdone', measure);
    return () => { ro.disconnect(); document.fonts.removeEventListener('loadingdone', measure); };
  }, [measure]);
  // The copy shown past the clamp is plain text: nothing in it to tab to or click.
  const sentence = (ghost: Ghost, copy = false) => {
    const shown = at.map((s, i) => (ghost?.slot === i ? ghost.key : s));
    const word = (slot: number) => {
      const stale = ghost && slot > ghost.slot ? ' is-stale' : '';
      if (ghost?.slot === slot) return <span className="sn-ghost" key={ghost.key}>{nameOf(ghost.key)}</span>;
      const v = at[slot];
      if (v && copy) return <span key={v} className={`sn-word${stale}`}>{nameOf(v)}</span>;
      if (v) return <a key={v} href={href(...at.slice(0, slot + 1))} className={`sn-word${stale}`}>{nameOf(v)}</a>;
      return (
        <span className={`sn-blank${stale}`} data-open={slot === open || undefined}>
          <span className="sn-label">{LABELS[slot]}</span>
        </span>
      );
    };
    return (
      <p className="sn-sentence">
        {/* Glued, so a comma never starts a line. */}
        In <span className="sn-glue">{word(0)},</span> {word(1)}
        {bare(shown[1]) ? <> has no mapped design yet.</> : <> can be built with <span className="sn-glue">{word(2)}.</span></>}
      </p>
    );
  };
  const acts = bare(path.useCase) && (
    <p className="sn-acts">
      <a className="btn primary lg" href={pageOf(path.useCase!)}>
        Read the use case<span className="sn-cta-name">: {title(path.useCase!)}</span> <span className="arr">→</span>
      </a>
    </p>
  );
  return (
    <header className="sn">
      {/* One height at every path, so a pick or a hovered name never moves the columns. */}
      <div className="sn-box" ref={box} tabIndex={-1}>
        {sentence(ghost)}
        <div className="sn-full" aria-hidden>{sentence(ghost, true)}</div>
      </div>
      {/* Always there, so a pick that brings the action in does not move the columns. */}
      {acts || <p className="sn-acts" />}
    </header>
  );
}

/** The current hash, kept in step with back, forward and every link. */
function useHash() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function Drilldown({ writeups }: { writeups: Writeup[] }) {
  const hash = useHash();
  const path = parse(hash);
  const { domain, useCase, design } = path;
  const [ghost, setGhost] = useState<Ghost>(null);
  useEffect(() => setGhost(null), [hash]);

  const d = DOMAINS.find((x) => x.slug === domain);
  const columns: (Row[] | null)[] = [
    DOMAINS.filter((x) => x.useCases.length).map((x) => ({
      key: x.slug, to: href(x.slug), meta: plural(x.useCases.length, 'use case'),
    })),
    d
      ? [...d.useCases, ...d.also].map((u, i) => {
          const n = USE_CASES[u].approaches.reduce((s, a) => s + APPROACHES[a.slug].designs.length, 0);
          return {
            key: u, to: href(domain, u), meta: n ? plural(n, 'design') : 'no design yet', faint: !n,
            group: i === d.useCases.length ? 'Also touches' : undefined,
          };
        })
      : null,
    // Designs, grouped under the approach doc that lays them out.
    useCase
      ? USE_CASES[useCase].approaches.flatMap((a) =>
          APPROACHES[a.slug].designs.map((x, i) => ({
            key: `${a.slug}/${x.id}`, to: href(domain, useCase, a.slug, x.id),
            meta: [x.maturity, CONTEXT[x.context]].filter(Boolean).join(' · '),
            group: i === 0 ? `${title(a.slug)} · ${REL[a.rel]}` : undefined,
          })),
        )
      : null,
  ];
  const picks = [domain, useCase, design];
  // The column the reader is about to pick from. On a phone the strip slides it into view.
  const next = columns.filter(Boolean).length - 1;
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = strip.current;
    const col = el?.children[next] as HTMLElement | undefined;
    if (el && col && el.scrollWidth > el.clientWidth) el.scrollTo({ left: col.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  }, [next]);

  const hint = (i: number) =>
    i === 2 && bare(useCase) ? 'No mapped design yet.' : i === next + 1 ? `Pick ${A_LABEL[i - 1]} first` : '';

  return (
    <div className="dd">
      <Line path={path} ghost={ghost} />
      <div className="dd-cols" ref={strip}>
        {columns.map((rows, i) => (
          <Column
            key={STEPS[i]}
            step={STEPS[i]}
            rows={rows}
            from={picks.slice(0, i).join('/')}
            picked={picks[i]}
            hint={hint(i)}
            onPoint={(key) => setGhost(key ? { slot: i, key } : null)}
          />
        ))}
      </div>
      <Detail path={path} writeups={writeups} />
    </div>
  );
}
