#!/usr/bin/env node
// Refresh the `k` (commit count) of every TOP-LEVEL entry in the index.html
// `var P` taxonomy from real git history (git-graph.json's per-top-level-dir
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'index.html');
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

const html = readFileSync(INDEX, 'utf8');
const startTok = 'var P = [';
const start = html.indexOf(startTok);
const end = html.indexOf('\n  ];', start);
const block = html.slice(start, end);
const lines = block.split('\n');

const changes = [];
const out = lines.map(line => {
  const nm = line.match(/n:\s*'([^']+)'/);
  const um = line.match(/u:\s*'([^']+)'/);
  const km = line.match(/k:\s*(\d+)/);
  if (!nm || !um || !km) return line;            // not a data line
  if (/\bp:/.test(line)) return line;            // child entry — leave alone
  const name = nm[1], url = um[1], oldK = +km[1];
  const dir = dirFor(url, name);
  if (dir !== name) return line;                 // name != dir (e.g. torusworld) — skip
  const real = dirCount[dir];
  if (real == null || real === oldK) return line;
  changes.push(`${name}: ${oldK} -> ${real}`);
  return line.replace(/k:\s*\d+/, 'k:' + real);
});

if (changes.length) {
  console.log('Updated commit counts (top-level, from git history):');
  changes.forEach(c => console.log('  ' + c));
} else {
  console.log('No changes — counts already match git history.');
}

if (!dry && changes.length) {
  writeFileSync(INDEX, html.slice(0, start) + out.join('\n') + html.slice(end));
  console.log(`\nWrote ${changes.length} updates to index.html`);
} else if (dry) {
  console.log('\n(dry run — no write)');
}
