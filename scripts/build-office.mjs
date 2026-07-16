#!/usr/bin/env node
// build-office.mjs — extract the landing-page project taxonomy (the `var P = [...]`
// array in index.html) into office/surfaces.json, the data that drives the
// fractal-office site map at mino.mobi/office/.
//
// The office page is a Droste/infinite-zoom "office of offices": every project
// is a desk, and a desk's wall is papered with framed posters of its child
// desks. index.html's PROJECTS array is already the curated taxonomy
// (name, url, category, commits, age, parent) — so we read it rather than
// re-derive one. Deterministic; no network.
//
// Usage:
//   node scripts/build-office.mjs            # dry run (prints summary)
//   node scripts/build-office.mjs --write    # write office/surfaces.json

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

// --- Locate and parse the `var P = [ ... ]` taxonomy array --------------------
const marker = html.indexOf('var P = [');
if (marker < 0) throw new Error('could not find `var P = [` in index.html');
const arrStart = html.indexOf('[', marker);
let depth = 0, end = -1;
for (let i = arrStart; i < html.length; i++) {
  const ch = html[i];
  if (ch === '[') depth++;
  else if (ch === ']') { depth--; if (depth === 0) { end = i; break; } }
}
if (end < 0) throw new Error('unbalanced brackets parsing P array');

const body = html.slice(arrStart, end + 1);
// The array is trusted local source (an object-literal list with `//` comment
// dividers). Evaluate it as a JS expression rather than regex-massaging it into
// JSON — that handles comments, single quotes, and trailing commas natively.
let P;
try {
  // eslint-disable-next-line no-new-func
  P = Function(`"use strict"; return (${body});`)();
} catch (e) {
  throw new Error('failed to evaluate the P array: ' + e.message);
}

// --- Normalise ---------------------------------------------------------------
// Each entry: { n, u, c, k, a, t?, b?, p? }. Names are unique within the array
// in practice; if a collision appears, suffix so the tree stays well-formed.
const seen = new Map();
const nodes = P.map((p) => {
  let id = p.n;
  if (seen.has(id)) id = `${id}~${seen.get(id) + 1}`;
  seen.set(p.n, (seen.get(p.n) || 0) + 1);
  return {
    id,
    name: p.n,
    url: p.u,
    cat: p.c || 'misc',
    commits: p.k || 0,
    age: p.a || 'cold',
    parent: p.p || null,
  };
});

// --- Filesystem discovery: give every surface its OWN sub-pages --------------
// The curated PROJECTS array is the spine (categories + the hand-picked wings),
// but a surface like `rind` has a dozen real endpoints on disk (cylinder,
// foamview, walk, ops/…) that were never enumerated there. So for each node
// whose URL resolves to a directory in this repo, we scan it for browsable
// sub-pages (subdirs with an index.html, plus top-level *.html) and graft them
// on — recursively — so you can keep zooming into a surface's actual structure.
// Deterministic (entries sorted); reads the working tree, no network.
const registry = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, 'deploy-registry.json'), 'utf8')); }
  catch { return { surfaces: [] }; }
})();

// host (e.g. "rind.mino.mobi") → repo dir (e.g. "rind"); mino.mobi → "" (root)
const hostDir = new Map([['mino.mobi', ''], ['minomobi.com', ''], ['www.mino.mobi', '']]);
for (const s of registry.surfaces || []) {
  const dir = s.dir === '.' ? '' : (s.dir || '');
  for (const raw of String(s.endpoint || '').split(/[,/]/)) {
    const host = raw.replace(/\(.*?\)/g, '').replace(/^https?:\/\//, '').trim().split('/')[0];
    if (host.includes('.') && !hostDir.has(host)) hostDir.set(host, dir);
  }
}

// dirs that are build output / deps / assets, never a page the visitor browses
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'public', 'coverage', 'src', 'lib',
  'vendor', 'packages', 'deps', 'migrations', 'target', 'bin', 'obj', 'assets',
  'asset', 'img', 'imgs', 'images', 'icons', 'fonts', 'wasm', 'pkg', 'solver',
  'test', 'tests', '__tests__', 'spec', 'e2e', 'cache', 'tmp', 'engine-rs',
  '__pycache__', 'sql', 'schema',
]);
const SKIP_FILE = /(^|[-_.])(selftest|test|spec)\.html?$/i;
const MAX_FS_DEPTH = 3;      // levels below a surface
const MAX_KIDS = 28;         // per node, to keep any one wall legible

// url → repo dir (or null if unresolvable / a file / a hash route)
function resolveDir(url) {
  if (!url || url.includes('#')) return null;
  const u = url.replace(/^https?:\/\//, '');
  const slash = u.indexOf('/');
  const host = slash < 0 ? u : u.slice(0, slash);
  let path = slash < 0 ? '' : u.slice(slash + 1);
  path = path.replace(/[?].*$/, '').replace(/\/+$/, '');
  if (!hostDir.has(host)) return null;
  if (/\.html?$/i.test(path)) return null;            // already a file endpoint
  const dir = [hostDir.get(host), path].filter(Boolean).join('/');
  if (!dir) return null;                              // never scan the repo root
  const abs = join(ROOT, dir);
  return (existsSync(abs) && statSync(abs).isDirectory()) ? dir : null;
}

function scanDir(dir) {
  let entries;
  try { entries = readdirSync(join(ROOT, dir), { withFileTypes: true }); }
  catch { return []; }
  const out = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name.toLowerCase())) continue;
      if (existsSync(join(ROOT, dir, e.name, 'index.html'))) out.push({ seg: e.name, dir: true });
    } else if (/\.html?$/i.test(e.name) && e.name.toLowerCase() !== 'index.html' && !SKIP_FILE.test(e.name)) {
      out.push({ seg: e.name, dir: false });
    }
  }
  return out;
}

const byUrl = new Set(nodes.map((n) => n.url && n.url.replace(/^https?:\/\//, '').replace(/\/+$/, '')));
let discovered = 0;
function graft(node, dir, depth) {
  if (depth > MAX_FS_DEPTH) return;
  const kids = scanDir(dir);
  let added = 0;
  for (const k of kids) {
    if (added >= MAX_KIDS) break;
    const childDir = `${dir}/${k.seg}`;
    const base = node.url.replace(/\/+$/, '');
    const url = k.dir ? `${base}/${k.seg}/` : `${base}/${k.seg}`;
    const key = url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (byUrl.has(key)) {                              // already curated — recurse under it if a dir
      if (k.dir) { const ex = nodes.find((n) => n.url && n.url.replace(/^https?:\/\//, '').replace(/\/+$/, '') === key); if (ex) graft(ex, childDir, depth + 1); }
      continue;
    }
    byUrl.add(key);
    const child = {
      id: `${node.id}/${k.seg}`,
      name: k.seg.replace(/\.html?$/i, ''),
      url,
      cat: node.cat,
      commits: 0,
      age: node.age,
      parent: node.id,
      discovered: true,
    };
    nodes.push(child);
    added++; discovered++;
    if (k.dir) graft(child, childDir, depth + 1);
  }
}
// snapshot the curated list first — graft() mutates `nodes`
for (const node of [...nodes]) {
  const dir = resolveDir(node.url);
  if (dir) graft(node, dir, 1);
}

// Order categories by a curated priority, then by first appearance.
const CAT_ORDER = [
  'bluesky', 'atproto', 'games', 'game', 'tools', 'tool', 'science', 'math',
  'read', 'reading', 'art', 'data', 'sim', 'infra', 'misc',
];
const catFirst = new Map();
nodes.forEach((n, i) => { if (!catFirst.has(n.cat)) catFirst.set(n.cat, i); });
const cats = [...catFirst.keys()].sort((a, b) => {
  const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib);
  return catFirst.get(a) - catFirst.get(b);
});

const out = {
  $comment: 'GENERATED by scripts/build-office.mjs from the PROJECTS (`var P`) array in index.html. Do not hand-edit — edit index.html and re-run `node scripts/build-office.mjs --write`.',
  generatedFrom: 'index.html:var P',
  root: { name: 'mino.mobi', url: 'https://mino.mobi' },
  categories: cats,
  nodes,
};

// --- Summary + write ---------------------------------------------------------
const catCounts = {};
for (const n of nodes) catCounts[n.cat] = (catCounts[n.cat] || 0) + 1;
const withParent = nodes.filter((n) => n.parent).length;
console.log(`office: ${nodes.length} nodes, ${cats.length} categories, ${withParent} nested`);
console.log('categories:', cats.map((c) => `${c}(${catCounts[c]})`).join(' '));

if (write) {
  const dest = join(ROOT, 'office', 'surfaces.json');
  writeFileSync(dest, JSON.stringify(out, null, 1) + '\n');
  console.log('wrote', dest);
} else {
  console.log('(dry run — pass --write to emit office/surfaces.json)');
}
