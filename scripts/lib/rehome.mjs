// rehome.mjs — the pure half of moving something from one surface to another.
//
// `docs/surface-mitosis.md` describes when a surface should divide and
// `scripts/surface-mitosis.mjs` detects it, but both stop at the diagnosis:
// "It does NOT move anything — the actual division (anaphase) is staged." This
// is anaphase, and it is generic because the shape of the job never changes,
// only the nouns.
//
// WHAT ACTUALLY BREAKS A REHOME, in the order it bites:
//
//   1. **Inbound references you did not know about.** Not the imports inside
//      the thing you are moving — those you are looking at — but the four
//      files elsewhere in an 80-surface repo that point at it. This is the
//      whole reason the job feels risky, and it is completely mechanical.
//   2. **Relative import specifiers.** `../lib/x.js` is a statement about two
//      paths, and moving either end invalidates it. Also completely mechanical:
//      the new specifier is the relative path between the two new locations.
//   3. **The registry, and everything generated from it.** `paths:` globs stop
//      matching, the parent keeps deploying what it no longer owns, the
//      workflow triggers go stale. `preflight --fix` already fixes the derived
//      artefacts; it cannot know your intent for the registry itself.
//   4. **URLs that are already out in the world.** A link posted to Bluesky
//      last month does not care that the file moved.
//
// This file does 1, 2 and 3 as computable transforms and gives 4 to a human,
// because rewriting a bare `/sleuth` across a repo is a substring match
// pretending to be a refactor. `scripts/rehome.mjs` is the CLI over it.

import { dirname, join, posix, relative } from 'node:path';

// ────────────────────────────────────────────────────────────── paths ──

/** Repo-relative, forward-slashed, no leading `./` — the one spelling. */
export function tidy(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

/**
 * A registry `paths:` glob as a RegExp.
 *
 * The registry uses exactly three forms — `photo/**`, `photo/*.js` and a bare
 * path — so this is deliberately not a general globber. `**` crosses
 * separators, `*` does not; anything else is a literal.
 */
export function globToRegExp(glob) {
  const g = tidy(glob);
  let out = '';
  for (let i = 0; i < g.length; i++) {
    if (g[i] === '*' && g[i + 1] === '*') {
      if (g[i + 2] === '/') {
        out += '(?:.*/)?';           // `**/` — any number of leading segments
        i += 2;
      } else if (out.endsWith('/')) {
        // A trailing `/**` must match the directory itself AND every depth
        // below it, while never matching a sibling that merely starts the same
        // way: `photo/**` covers `photo/src/App.jsx` and not `photograph/a.js`.
        // Eating the slash back is what makes both true at once.
        out = `${out.slice(0, -1)}(?:/.*)?`;
        i += 1;
      } else {
        out += '.*';
        i += 1;
      }
    } else if (g[i] === '*') {
      out += '[^/]*';                // one segment only
    } else {
      out += g[i].replace(/[.+^${}()|[\]\\?]/, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

/** Does any of a surface's globs claim this path? */
export function pathMatches(globs, path) {
  const p = tidy(path);
  return (globs || []).some((g) => globToRegExp(g).test(p));
}

/**
 * The surface that owns a path, or null.
 *
 * `dir` is checked before `paths` because a surface's globs can be broader than
 * its directory (several list a sibling's file), and the directory is the
 * stronger claim. The root surface (`dir: "."`) is only ever the fallback — it
 * claims everything, so it must be considered last or it wins every time.
 */
export function ownerOf(surfaces, path) {
  const p = tidy(path);
  const real = (surfaces || []).filter((s) => s.dir && s.dir !== '.');
  const byDir = real
    .filter((s) => p === tidy(s.dir) || p.startsWith(`${tidy(s.dir)}/`))
    .sort((a, b) => tidy(b.dir).length - tidy(a.dir).length)[0];
  if (byDir) return byDir;
  const byGlob = real.find((s) => pathMatches(s.paths, p));
  if (byGlob) return byGlob;
  // The root surface writes its dir as "." and its glob matches everything, so
  // it can only ever be the fallback — considered in order it would own every
  // file in the repo and make every import look local.
  return (surfaces || []).find((s) => ['', '.'].includes(tidy(s.dir))) || null;
}

// ─────────────────────────────────────────────────────────── the moves ──

/**
 * Where each source file lands.
 *
 * `sources` are repo-relative files (the CLI expands directories). A source's
 * path *below its common root* is preserved, so moving `photo/src/lib` into
 * `x/src` gives `x/src/lib/...` rather than flattening thirty files into one
 * directory. The common root is computed from the sources themselves, which is
 * what makes "move these five scattered files" and "move this tree" the same
 * operation.
 */
export function planMoves(sources, destDir, { base } = {}) {
  const files = [...new Set((sources || []).map(tidy))].filter(Boolean).sort();
  if (!files.length) return [];
  const root = base !== undefined ? tidy(base) : commonDir(files);
  const dest = tidy(destDir);
  return files.map((from) => {
    const rest = root && from.startsWith(`${root}/`) ? from.slice(root.length + 1) : basename(from);
    return { from, to: posix.join(dest, rest) };
  });
}

/** The deepest directory containing every path. */
export function commonDir(paths) {
  const parts = paths.map((p) => tidy(p).split('/').slice(0, -1));
  if (!parts.length) return '';
  let out = parts[0];
  for (const p of parts.slice(1)) {
    let i = 0;
    while (i < out.length && i < p.length && out[i] === p[i]) i++;
    out = out.slice(0, i);
  }
  return out.join('/');
}

const basename = (p) => tidy(p).split('/').pop();

// ───────────────────────────────────────────────────────────── imports ──

/**
 * Every relative module specifier in a source file, with where it sits.
 *
 * Covers the four spellings this repo actually uses — `from '…'`, bare
 * `import '…'`, dynamic `import('…')` and `require('…')` — and only *relative*
 * ones. A bare specifier is a package and an absolute one is a URL path served
 * by a worker; neither moves when a file does.
 */
export function findRelativeImports(source) {
  const out = [];
  const re = /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]*)\1/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    // The match always ends `"<spec>"`, so the opening quote is that far back
    // from the end — safer than searching forwards for the quote character.
    out.push({ spec: m[2], quote: m[1], index: m.index + m[0].length - (m[2].length + 2) });
  }
  return out;
}

/** Resolve a relative specifier against the file that wrote it. */
export function resolveSpec(importerPath, spec) {
  return tidy(posix.normalize(posix.join(posix.dirname(tidy(importerPath)), spec)));
}

/** The specifier `fromFile` should use to reach `toFile`. Always explicit. */
export function relSpecifier(fromFile, toFile) {
  const rel = relative(dirname(tidy(fromFile)), tidy(toFile)).replace(/\\/g, '/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/**
 * Rewrite one file's relative imports for a set of moves.
 *
 * Handles both directions at once, which is the point: a file that moves has to
 * re-reach everything that stayed, and a file that stayed has to re-reach
 * everything that moved. `moved` maps old path → new path; `importerNew` is
 * where this file ends up (equal to `importerOld` when it does not move).
 *
 * Returns `{ text, edits }` — edits are reported even when the text is
 * unchanged, so a plan can show them before anything is written.
 */
export function retargetImports(source, importerOld, importerNew, moved) {
  const map = new Map(Object.entries(moved || {}).map(([k, v]) => [tidy(k), tidy(v)]));
  const found = findRelativeImports(source);
  const edits = [];
  let text = '';
  let cursor = 0;

  for (const hit of found) {
    const target = resolveSpec(importerOld, hit.spec);
    const targetNew = map.get(target) ?? target;
    const want = relSpecifier(importerNew, targetNew);
    if (want !== hit.spec) {
      edits.push({ from: hit.spec, to: want, target, targetNew });
      const open = hit.index;                       // index of the opening quote
      const close = open + 1 + hit.spec.length;     // index of the closing quote
      text += source.slice(cursor, open + 1) + want;
      cursor = close;
    }
  }
  text += source.slice(cursor);
  return { text, edits };
}

// ─────────────────────────────────────────────────────────────── URLs ──

/**
 * A matcher for "somewhere out there, this address is written down".
 *
 * Reported, never rewritten. `/sleuth` is a substring of somebody's prose and a
 * rehoming tool that silently edits prose is worse than one that hands you a
 * list. The list is the deliverable.
 *
 * A plain substring is far too loose for that list to be worth reading: the
 * first version of this matched `/threads/list` in an unrelated worker and
 * "thread" in four docs, and 77 hits that are mostly noise get skimmed, which
 * is the same as not having them. So the path must be followed by something
 * that ends it — a quote, a slash, whitespace, `#`, `?`, `)` — and never by a
 * word character or a hyphen.
 */
export function urlPattern({ endpoint, path }) {
  const p = `/${tidy(path).replace(/^\/+/, '')}`;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alts = [`#${esc(p)}`, esc(p)];
  if (endpoint) alts.unshift(`${esc(endpoint)}(?:#)?${esc(p)}`);
  return new RegExp(`(?:${alts.join('|')})(?![\\w-])`);
}

/** Every address form for a set of public paths, as one matcher each. */
export function urlPatterns({ endpoint, paths }) {
  return (paths || []).filter(Boolean).map((path) => ({
    path,
    re: urlPattern({ endpoint, path }),
  }));
}

// ─────────────────────────────────────────────────────────── registry ──

/**
 * The registry after a move: the source surface stops claiming what left, and
 * the destination starts.
 *
 * Only ever *narrows* the parent by adding negative knowledge — it appends the
 * destination's glob to the destination and, when the whole of a `dir` moved,
 * leaves the parent's `dir/**` alone (it still owns the rest). A parent whose
 * every path moved is flagged for a human rather than deleted: retiring a
 * surface detaches a domain, which is dashboard-only.
 */
export function registryAfterMove(registry, { moves, toSurface }) {
  const next = JSON.parse(JSON.stringify(registry));
  const dest = next.surfaces.find((s) => s.surface === toSurface);
  if (!dest) throw new Error(`no surface named "${toSurface}" in the registry`);

  const landed = (moves || []).map((m) => tidy(m.to));
  const notes = [];
  for (const to of landed) {
    if (pathMatches(dest.paths, to)) continue;
    const glob = `${tidy(dest.dir)}/**`;
    if (!dest.paths.includes(glob)) {
      dest.paths.push(glob);
      notes.push(`${dest.surface}: paths += ${glob}`);
    }
  }
  return { registry: next, notes };
}

// ────────────────────────────────────────────────────── the stub page ──

/**
 * A forwarding address for a URL that has already been shared.
 *
 * Generalised from `scripts/lab-redirect-stub.mjs`, whose reasoning holds for
 * every surface and not just the lab: a page rather than a 301, because a real
 * redirect means a worker carrying a map of every rename forever — state, in
 * the component that is better without it. A stub is self-describing, and
 * deleting the directory deletes the rule.
 *
 * What it has to get right, because not breaking things is the entire point:
 * `canonical` so search engines follow rather than index two pages; `og:` tags,
 * because the link ALREADY POSTED points here and a card rendering as bare text
 * is the visible half of the breakage; a visible link, because meta-refresh is
 * not guaranteed and a dead end with no way forward is worse than a slow one;
 * and `noindex` on the stub itself.
 */
export function redirectHtml({ to, title, note }) {
  const url = String(to || '').trim();
  if (!/^https?:\/\/|^\//.test(url)) throw new Error(`redirect target must be a URL or a path: ${to}`);
  const label = url.replace(/^https?:\/\//, '');
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>moved — ${esc(title || label)}</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${esc(url)}">
<meta http-equiv="refresh" content="0; url=${esc(url)}">
<meta property="og:title" content="${esc(title || 'this page has moved')}">
<meta property="og:description" content="It lives at ${esc(label)} now.">
<main style="max-width:32rem;margin:20vh auto;padding:0 1.5rem;text-align:center;font:16px/1.6 system-ui,sans-serif">
  <h1 style="font-size:1.3rem">this moved</h1>
  <p>It lives at <a href="${esc(url)}">${esc(label)}</a> now.</p>
${note ? `  <p style="opacity:.6;font-size:.85em">${esc(note)}</p>\n` : ''}</main>
<script>location.replace(${JSON.stringify(url)});</script>
`;
}
