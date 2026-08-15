// scripts/lib/landing.mjs — the shared reading layer for generators that
// derive documentation from the registry + the landing page.
//
// Extracted from build-spec.mjs so that every generator gets the SAME
// redaction and the SAME landing-page taxonomy. This matters: the root worker
// serves `assets.directory: "."`, i.e. the whole repo root, so ANY file a
// generator writes (spec/data.js, docs/SURFACES.md, …) is potentially
// internet-facing. Redaction lives here, once, rather than in each script —
// a generator that forgets it is how a work-facing host leaks onto the public
// web.
//
// Exports:
//   REDACT, PUBLIC_HOST, publicHosts, scrubText, scrubEndpoint  — redaction
//   loadRegistry(root)                                          — parsed registry
//   loadCatalogue(root) / saveCatalogue(root, cat)              — catalogue.json
//   loadLanding(root)  -> { P, descMap, html, norm }            — catalogue + <li> prose
//   surfaceResolver(reg) -> { ownerOf, hostToSurface, dirToSurface }
//   describe(surface, {reg, landing})                           — best one-line blurb

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ------------------------------------------------------------- emit/check ---
// Compare-or-write, so every generator can answer "is the artefact on disk
// what I would produce right now?" without writing. preflight needs that
// answer; generators that could only write were the ones nothing could gate,
// which is how io/sites.json, office/surfaces.json, mappa/sites.js and
// orrery/index.html all drifted at once.
//
// `volatile` is a regex for content that legitimately changes every run (a
// generation timestamp) and must be excluded from the comparison.
export function emit(absPath, content, { write = false, volatile: vol = null } = {}) {
  const strip = (s) => (vol ? s.replace(vol, '') : s);
  const current = existsSync(absPath) ? readFileSync(absPath, 'utf8') : null;
  const same = current !== null && strip(current) === strip(content);
  if (write) writeFileSync(absPath, content);
  return { same, existed: current !== null };
}

// ------------------------------------------------------------- redaction ----
// The generated artefacts are INTERNET-FACING and cover the minomobi
// properties only. The repo also carries work-facing referents (the
// ascential.work zone) that must never appear in generated output.
export const REDACT = /ascential/i;
export const PUBLIC_HOST = /(^|\.)(mino\.mobi|minomobi\.com)$/i;

export const publicHosts = (hosts) => hosts.filter((h) => PUBLIC_HOST.test(h) && !REDACT.test(h));

export function scrubText(text) {
  if (!text) return text;
  if (!REDACT.test(text)) return text;
  // drop the sentence/segment containing the term (split on '. ' and ';')
  const cleaned = text
    .split(/(?<=\.)\s+|;\s+/)
    .filter((seg) => !REDACT.test(seg))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || null;
}

export function scrubEndpoint(ep) {
  if (!ep || !REDACT.test(ep)) return ep;
  return ep.split(',').map((s) => s.trim()).filter((s) => !REDACT.test(s)).join(', ');
}

// -------------------------------------------------------------- registry ----
export function loadRegistry(root) {
  return JSON.parse(readFileSync(join(root, 'deploy-registry.json'), 'utf8'));
}

// ------------------------------------------------------- landing taxonomy ---
export function norm(u) {
  return String(u).replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function decode(s) {
  return s
    .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”').replace(/&ldquo;/g, '“')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

// ------------------------------------------------------------- catalogue ----
// catalogue.json is the SOURCE OF TRUTH for the site catalogue. index.html's
// `var P` is generated from it (scripts/gen-landing-catalogue.mjs), so read
// this rather than regex-parsing the HTML — which is what nine scripts each
// used to do, with their own copy of the parser and their own bugs.
export function loadCatalogue(root) {
  return JSON.parse(readFileSync(join(root, 'catalogue.json'), 'utf8'));
}

// Canonical field order for a catalogue entry, so a script that adds a field
// to an existing entry doesn't leave the file in a different shape than one
// that wrote it from scratch.
export const CATALOGUE_KEYS = ['n', 'u', 'c', 'k', 'a', 't', 'b', 'p', 'surface'];

export function orderEntry(e) {
  const out = {};
  for (const k of CATALOGUE_KEYS) if (e[k] !== undefined) out[k] = e[k];
  for (const k of Object.keys(e)) if (!(k in out)) out[k] = e[k]; // keep anything new
  return out;
}

export function saveCatalogue(root, cat) {
  const next = { ...cat, entries: cat.entries.map(orderEntry) };
  writeFileSync(join(root, 'catalogue.json'), JSON.stringify(next, null, 2) + '\n');
}

// Path glob for catalogue.json's `notListed` rules. `*` matches inside one
// path segment; `**` matches one or more whole segments when it ends a
// pattern, and zero or more in the middle.
//
// Built segment-wise on purpose. The first version of this did a flat string
// replace and silently matched NOTHING for the common trailing-`**` case,
// which made the coverage gate report success while checking nothing — the
// exact failure mode the gate exists to prevent.
export function pathGlob(glob) {
  const segs = glob.split('/');
  let re = '';
  segs.forEach((s, i) => {
    const last = i === segs.length - 1;
    if (s === '**') {
      re += last ? '[^/]+(?:/[^/]+)*' : '(?:[^/]+/)*';
      return;
    }
    re += s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    if (!last) re += '/';
  });
  return new RegExp('^' + re.replace(/\/{2,}/g, '/') + '$');
}

// The landing-page view: the catalogue entries plus the curated <li> blocks.
// The <li> descriptions are still hand-written in index.html — they are prose
// about each site, not catalogue data — so those are still read from the HTML.
export function loadLanding(root) {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const P = loadCatalogue(root).entries;

  const descMap = new Map();
  for (const m of html.matchAll(/<li>\s*<div class="name-row">([\s\S]*?)<\/div>\s*<div class="desc">([\s\S]*?)<\/div>\s*<\/li>/g)) {
    const href = (m[1].match(/href="([^"]+)"/) || [])[1];
    if (!href) continue;
    const tags = [...m[1].matchAll(/<span class="tag">([^<]+)<\/span>/g)].map((t) => t[1]);
    const desc = decode(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    descMap.set(norm(href), { desc, tags });
  }
  return { P, descMap, html, norm };
}

// ------------------------------------------------------- surface resolution --
// Map a landing-page URL back to the surface that owns it.
export function surfaceResolver(reg) {
  const hostToSurface = new Map();
  const dirToSurface = new Map();
  for (const s of reg.surfaces) {
    for (const raw of String(s.endpoint || '').split(',')) {
      const host = raw.replace(/\(.*?\)/g, '').trim().split(/[\s/]+/)[0];
      if (host && host.includes('.')) hostToSurface.set(host, s.surface);
    }
    for (const d of [s.dir, ...(s.dirs || [])]) if (d && d !== '.') dirToSurface.set(d, s.surface);
  }
  // the landing hosts belong to root
  for (const h of ['mino.mobi', 'minomobi.com', 'www.mino.mobi']) {
    if (!hostToSurface.has(h)) hostToSurface.set(h, 'root');
  }
  function ownerOf(url) {
    const u = norm(url);
    const host = u.split('/')[0];
    const surf = hostToSurface.get(host);
    if (!surf) return null;
    if (surf !== 'root') return surf;
    const seg = u.split('/')[1];
    if (seg && dirToSurface.has(seg)) return dirToSurface.get(seg);
    return 'root';
  }
  return { ownerOf, hostToSurface, dirToSurface };
}

// ----------------------------------------------------------- curated layer --
// spec/curated.js is the hand-authored half of the spec (families + description
// capsules for headless surfaces the landing catalogue doesn't list). It's a
// browser file (`window.SPEC_CURATED = …`), so evaluate it behind a shim.
export function loadCurated(root) {
  try {
    const src = readFileSync(join(root, 'spec', 'curated.js'), 'utf8');
    const shim = { window: {} };
    // eslint-disable-next-line no-new-func
    Function('window', `"use strict"; ${src}`)(shim.window);
    return shim.window.SPEC_CURATED || {};
  } catch {
    return {};
  }
}

// ------------------------------------------------------------- description --
// The best available one-liner for a surface, in priority order:
//   1. its landing-page curated description (freshest — it ships to visitors)
//   2. its spec/curated.js capsule (hand-written, covers headless workers)
//   3. the first sentence of its registry note
// Always redacted, always capped.
export function describe(s, { landing, resolver, curated, cap = 200 } = {}) {
  let text = null;

  if (landing && resolver) {
    for (const p of landing.P) {
      if (resolver.ownerOf(p.u) !== s.surface) continue;
      const host = norm(p.u).split('/')[0];
      const isHome = norm(p.u) === host;
      const d = landing.descMap.get(norm(p.u))?.desc;
      if (d && (isHome || !text)) { text = d; if (isHome) break; }
    }
  }
  if (!text) text = curated?.descOverrides?.[s.surface]?.trim() || null;
  if (!text) text = (s.note || '').trim() || null;
  if (!text) return '';

  text = scrubText(text) || '';
  if (text.length <= cap) return text.replace(/\s+/g, ' ').trim();
  const cut = text.slice(0, cap).match(/^(.*[.;])\s/s);
  const short = (cut ? cut[1] : text.slice(0, cap)).replace(/\s+/g, ' ').trim();
  return short.replace(/[.;,]$/, '') + '…';
}
