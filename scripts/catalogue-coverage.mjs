#!/usr/bin/env node
/**
 * Assert that every reachable endpoint in this repo is accounted for.
 *
 * THE PROBLEM THIS EXISTS TO SOLVE. The root worker serves
 * `assets.directory: "."`, so every directory holding an index.html is a live
 * URL. The catalogue (catalogue.json, projected into index.html's `var P`) is
 * hand-curated, so it only ever listed the endpoints somebody remembered to
 * add — it covered a fraction of what was actually reachable, and nothing
 * measured the difference.
 *
 * So: crawl the repo for reachable endpoints, subtract the ones the catalogue
 * lists, and subtract the ones catalogue.json's `notListed` rules explicitly
 * declare. Anything left over is an endpoint that is live on the internet and
 * that nobody has made a decision about — which is a failure.
 *
 * `notListed` rules carry a `kind`, and the distinction is the point:
 *   internal — build output, source dirs, generated run data. Not destinations.
 *   content  — real pages, but pages WITHIN a listed site (chapters, exhibits,
 *              problem sets, in-game routes). Deliberately not on the landing.
 *   pending  — a genuine sub-site that arguably belongs in the catalogue and
 *              is not there yet. This is the backlog, and it is counted on
 *              every run so it stays visible instead of rotting silently.
 *
 * Usage:
 *   node scripts/catalogue-coverage.mjs           # full report
 *   node scripts/catalogue-coverage.mjs --check   # exit 1 on undeclared endpoints
 *   node scripts/catalogue-coverage.mjs --pending # print the backlog only
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { loadRegistry, surfaceResolver, norm } from './lib/landing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const pendingOnly = process.argv.includes('--pending');

// Never descended into: not part of any deployed surface.
const SKIP_ALWAYS = new Set(['.git', 'node_modules', '.wrangler', 'target', '.venv', '__pycache__']);

// .assetsignore is what the root worker actually drops from its upload, so
// those paths are genuinely not reachable and must not be demanded here.
function assetsIgnored() {
  const f = join(ROOT, '.assetsignore');
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.replace(/\/+$/, ''));
}

// ------------------------------------------------------------------ crawl --
function crawl() {
  const ignored = assetsIgnored();
  const out = [];
  (function walk(abs) {
    let ents;
    try { ents = readdirSync(abs, { withFileTypes: true }); } catch { return; }
    const rel = relative(ROOT, abs) || '(root)';
    if (ents.some((e) => e.isFile() && e.name === 'index.html')) out.push(rel);
    for (const e of ents) {
      if (!e.isDirectory() || SKIP_ALWAYS.has(e.name)) continue;
      const childRel = relative(ROOT, join(abs, e.name));
      if (ignored.some((ig) => childRel === ig || childRel.startsWith(ig + '/'))) continue;
      walk(join(abs, e.name));
    }
  })(ROOT);
  return out.sort();
}

// ------------------------------------------------------------ url -> path --
// Map a catalogue URL back to the repo directory that serves it, so a crawled
// path and a catalogue entry can be compared.
function pathMapper() {
  const reg = loadRegistry(ROOT);
  const { hostToSurface } = surfaceResolver(reg);
  const dirOf = new Map(reg.surfaces.map((s) => [s.surface, s.dir]));
  return function repoPath(u) {
    const n = norm(u);
    const host = n.split('/')[0];
    const rest = n.split('/').slice(1).join('/').replace(/\.html$/, '').replace(/\/+$/, '');
    if (/^(www\.)?mino\.mobi$|^minomobi\.com$/.test(host)) return rest || '(root)';
    const surf = hostToSurface.get(host);
    if (!surf) return null;
    const d = dirOf.get(surf);
    if (d === undefined) return null;
    const base = d === '.' ? '' : d;
    return [base, rest].filter(Boolean).join('/') || '(root)';
  };
}

// ------------------------------------------------------------------ globs --
// `*` matches inside one path segment. `**` matches one or more whole segments
// when it ends a pattern, and zero or more in the middle. Built segment-wise:
// a flat string-replace version of this silently matched nothing for the
// common trailing-`**` case, which made the gate look green while it was
// checking nothing.
function globToRe(glob) {
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

// ------------------------------------------------------------------- main --
const cat = JSON.parse(readFileSync(join(ROOT, 'catalogue.json'), 'utf8'));
const repoPath = pathMapper();

const listed = new Set();
for (const e of cat.entries) {
  const p = repoPath(e.u);
  if (p) listed.add(p);
}

const rules = (cat.notListed || []).map((r) => ({ ...r, re: globToRe(r.glob) }));
const reachable = crawl();

const buckets = { listed: [], internal: [], content: [], pending: [], undeclared: [] };
const ruleHits = new Map();

for (const p of reachable) {
  if (listed.has(p)) { buckets.listed.push(p); continue; }
  const hit = rules.find((r) => r.re.test(p));
  if (!hit) { buckets.undeclared.push(p); continue; }
  ruleHits.set(hit.glob, (ruleHits.get(hit.glob) || 0) + 1);
  (buckets[hit.kind] || buckets.undeclared).push(p);
}

if (pendingOnly) {
  console.log(`catalogue backlog — ${buckets.pending.length} reachable sub-sites not yet listed\n`);
  for (const p of buckets.pending) console.log('  ' + p);
  process.exit(0);
}

console.log(`reachable endpoints: ${reachable.length}`);
console.log(`  listed in catalogue : ${buckets.listed.length}`);
console.log(`  internal (declared) : ${buckets.internal.length}`);
console.log(`  content  (declared) : ${buckets.content.length}`);
console.log(`  pending  (backlog)  : ${buckets.pending.length}`);
console.log(`  UNDECLARED          : ${buckets.undeclared.length}`);

// A rule that matches nothing is either a typo or a leftover from a deleted
// directory. Either way it is a lie about what is being checked, so it fails.
const dead = rules.filter((r) => !ruleHits.has(r.glob));
if (dead.length) {
  console.log(`\nrules matching nothing (${dead.length}) — typo or leftover, remove them:`);
  for (const r of dead) console.log(`  ${r.glob}`);
}

if (buckets.undeclared.length) {
  console.log(`\n${buckets.undeclared.length} reachable endpoint(s) nobody has decided about:`);
  for (const p of buckets.undeclared.slice(0, 40)) console.log('  ' + p);
  if (buckets.undeclared.length > 40) console.log(`  ... +${buckets.undeclared.length - 40} more`);
  console.log('\nAdd each to catalogue.json - either as an `entries` row (it should be');
  console.log('listed) or as a `notListed` rule with a kind and a reason.');
}

if (check && (dead.length || buckets.undeclared.length)) process.exit(1);
if (check) console.log('\nOK - every reachable endpoint is listed or declared');
