#!/usr/bin/env node
// Populate/update the `t` field (last-edit date, YYYY-MM-DD) on every entry in
// catalogue.json, from git history. The landing colour scale (age:
// this week / last week / 2+ weeks) derives from `t` at render time, so the
// colours always reflect when a surface was actually last touched.
//
// CAVEAT: like the count refresh, recency is only as complete as the local
// clone's refs. A surface last edited on an un-fetched branch will look older
// than it is. Run in CI after `git fetch --all` for full accuracy.
//
// Usage: node scripts/refresh-landing-recency.mjs [--dry]

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadCatalogue, saveCatalogue } from './lib/landing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dry = process.argv.includes('--dry');
const OVERRIDE = { empath: 'empathy', bake: 'bakery', ai: 'ai-edu' };

function repoPath(url) {
  let m = url.match(/mino\.mobi\/(.+?)\/?$/);
  if (m) return m[1].replace(/\/+$/, '');
  m = url.match(/^https:\/\/([^.]+)\.mino\.mobi(?:\/(.+?))?\/?$/);
  if (m) { const label = OVERRIDE[m[1]] || m[1]; return m[2] ? label + '/' + m[2].replace(/\/+$/, '') : label; }
  return null;
}
function dates(path) {
  if (!path) return null;
  try {
    const out = execSync(`git log --all --no-merges --format=%cI -- "${path}"`, { cwd: ROOT }).toString().trim();
    if (!out) return null;
    const lines = out.split('\n');
    return { t: lines[0].slice(0, 10), b: lines[lines.length - 1].slice(0, 10) };  // newest, oldest
  } catch { return null; }
}

// Update the catalogue, then re-project it into index.html. This used to do
// line-by-line string surgery on the `var P` literal; writing the source and
// regenerating the projection is what keeps the two from drifting apart.
const cat = loadCatalogue(ROOT);

let updated = 0, missed = 0;
for (const e of cat.entries) {
  const d = dates(repoPath(e.u));
  if (!d) { missed++; continue; }
  updated++;
  e.t = d.t;
  e.b = d.b;
}

console.log(`recency: ${updated} entries got a last-edit date; ${missed} had no resolvable path (kept as-is)`);
if (dry) { console.log('(dry run)'); process.exit(0); }

saveCatalogue(ROOT, cat);
console.log('wrote catalogue.json');
execSync('node scripts/gen-landing-catalogue.mjs --write', { cwd: ROOT, stdio: 'inherit' });
