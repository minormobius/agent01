#!/usr/bin/env node
// Populate/update a `t` field (last-edit date, YYYY-MM-DD) on every entry in the
// index.html `var P` taxonomy, from git history. The landing colour scale (age:
// this week / last week / 2+ weeks) derives from `t` at render time, so the
// colours always reflect when a surface was actually last touched.
//
// CAVEAT: like the count refresh, recency is only as complete as the local
// clone's refs. A surface last edited on an un-fetched branch will look older
// than it is. Run in CI after `git fetch --all` for full accuracy.
//
// Usage: node scripts/refresh-landing-recency.mjs [--dry]

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'index.html');
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

const html = readFileSync(INDEX, 'utf8');
const start = html.indexOf('var P = [');
const end = html.indexOf('\n  ];', start);
const block = html.slice(start, end);

let updated = 0, missed = 0;
const out = block.split('\n').map(line => {
  const um = line.match(/u:\s*'([^']+)'/);
  if (!um || !/n:\s*'/.test(line)) return line;
  const d = dates(repoPath(um[1]));
  if (!d) { missed++; return line; }
  updated++;
  let nl = line;
  // last-edit `t` (insert after a:'…')
  nl = /\bt:\s*'/.test(nl) ? nl.replace(/t:\s*'[^']*'/, `t:'${d.t}'`)
                           : nl.replace(/(a:\s*'[^']*')/, `$1, t:'${d.t}'`);
  // birth `b` (insert after t:'…')
  nl = /\bb:\s*'/.test(nl) ? nl.replace(/b:\s*'[^']*'/, `b:'${d.b}'`)
                           : nl.replace(/(t:\s*'[^']*')/, `$1, b:'${d.b}'`);
  return nl;
});

console.log(`recency: ${updated} entries got a last-edit date; ${missed} had no resolvable path (kept as-is)`);
if (!dry) { writeFileSync(INDEX, html.slice(0, start) + out.join('\n') + html.slice(end)); console.log('wrote index.html'); }
else console.log('(dry run)');
