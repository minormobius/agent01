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
function lastEdit(path) {
  if (!path) return null;
  try {
    const out = execSync(`git log -1 --all --no-merges --format=%cI -- "${path}"`, { cwd: ROOT }).toString().trim();
    return out ? out.slice(0, 10) : null;
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
  const t = lastEdit(repoPath(um[1]));
  if (!t) { missed++; return line; }
  updated++;
  if (/\bt:\s*'/.test(line)) return line.replace(/t:\s*'[^']*'/, `t:'${t}'`);
  // insert t after the a:'...' field
  return line.replace(/(a:\s*'[^']*')/, `$1, t:'${t}'`);
});

console.log(`recency: ${updated} entries got a last-edit date; ${missed} had no resolvable path (kept as-is)`);
if (!dry) { writeFileSync(INDEX, html.slice(0, start) + out.join('\n') + html.slice(end)); console.log('wrote index.html'); }
else console.log('(dry run)');
