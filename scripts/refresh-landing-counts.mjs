#!/usr/bin/env node
// Refresh the `k` (commit count) of every TOP-LEVEL entry in catalogue.json
// from real git history (git-graph.json's per-top-level-dir
// commit counts). Only updates an entry when its name matches its own
// top-level dir (so sub-pages like torusworld=clock/scape are left alone).
// Children (entries with `p:`) keep their hand-allocated counts.
//
// CAVEAT: needs a FULL clone (all branches fetched). In a shallow / single-
// branch checkout, surfaces built on un-fetched feature branches get
// undercounted (e.g. rite shows ~8 instead of ~42). Run this in CI after
// `git fetch --all`, not from a partial sandbox checkout.
//
// Usage: node scripts/refresh-landing-counts.mjs [--dry]

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadCatalogue, saveCatalogue } from './lib/landing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dry = process.argv.includes('--dry');

// Full-history per-top-level-dir commit counts (all branches, no merges).
// Lifetime counts, not the capped git-graph window — a node is sized by how
// much it was built, total.
const dirCount = {};
{
  const raw = execSync('git log --all --no-merges --name-only --format=%x01', {
    cwd: ROOT, maxBuffer: 256 * 1024 * 1024,
  }).toString();
  for (const blk of raw.split('\x01')) {
    const dirs = new Set();
    for (const line of blk.split('\n')) {
      const f = line.trim();
      if (!f) continue;
      dirs.add(f.includes('/') ? f.slice(0, f.indexOf('/')) : f);
    }
    for (const d of dirs) dirCount[d] = (dirCount[d] || 0) + 1;
  }
}

const OVERRIDE = { empath: 'empathy', bake: 'bakery' }; // subdomain label -> dir

function dirFor(url, name) {
  let m = url.match(/mino\.mobi\/([^\/]+)\//);
  if (m) return m[1];
  m = url.match(/^https:\/\/([^.]+)\.mino\.mobi/);
  if (m) return OVERRIDE[m[1]] || m[1];
  return name;
}

// Update the catalogue, then re-project it into index.html. This used to
// rewrite the `var P` literal line by line; writing the source and
// regenerating the projection is what keeps the two from drifting apart.
const cat = loadCatalogue(ROOT);

const changes = [];
for (const e of cat.entries) {
  if (e.p) continue;                              // child entry — leave alone
  if (e.k === undefined) continue;
  const dir = dirFor(e.u, e.n);
  if (dir !== e.n) continue;                      // name != dir (e.g. torusworld) — skip
  const real = dirCount[dir];
  if (real == null || real === e.k) continue;
  changes.push(`${e.n}: ${e.k} -> ${real}`);
  e.k = real;
}

if (changes.length) {
  console.log('Updated commit counts (top-level, from git history):');
  changes.forEach((c) => console.log('  ' + c));
} else {
  console.log('No changes — counts already match git history.');
}

if (dry) { console.log('\n(dry run — no write)'); process.exit(0); }
if (!changes.length) process.exit(0);

saveCatalogue(ROOT, cat);
console.log(`\nWrote ${changes.length} updates to catalogue.json`);
execSync('node scripts/gen-landing-catalogue.mjs --write', { cwd: ROOT, stdio: 'inherit' });
