#!/usr/bin/env node
// Regenerate git-graph.json — the data file consumed by the landing page's
// commit-history visualization (spiral + branch lanes).
//
// Output schema (array of commits, newest-first):
//   { h, p, t, a, d, r, m }
//     h: short hash (7 chars)
//     p: parent short hashes (array)
//     t: unix timestamp (seconds)
//     a: actor — 'agent' | 'loop' | 'bot' | 'human' (lib/gitlog.mjs)
//     d: top-level directories touched (array)
//     r: refs at this commit (string, or null)
//     m: is_merge (boolean)
//
// Usage: node scripts/generate-git-graph.mjs > git-graph.json
//        (or: node scripts/generate-git-graph.mjs --write)
//        (--allow-shallow to override the shallow-clone refusal below)
//
// SHALLOW CLONES. This reads `git log --all`, so its output is only as complete
// as the clone it runs in. In a shallow or single-branch checkout — an agent
// sandbox, or a CI job with the default actions/checkout fetch-depth of 1 —
// `git log` returns a fraction of the history, and regenerating here would
// replace a full graph with a truncated one and report success. The landing
// page would then show a commit history that simply stops. So: refuse to write
// from a shallow clone unless explicitly overridden.

import { execSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_COMMITS = 2000;

if (existsSync(join(REPO_ROOT, '.git', 'shallow')) && !process.argv.includes('--allow-shallow')) {
  const have = execSync('git rev-list --count HEAD', { cwd: REPO_ROOT }).toString().trim();
  console.error(`REFUSING: this is a shallow clone (${have} commits reachable).`);
  console.error('Regenerating here would truncate git-graph.json rather than refresh it.');
  console.error('Run after `git fetch --unshallow`, or pass --allow-shallow if you mean it.');
  process.exit(1);
}

import { readCommits } from './lib/gitlog.mjs';

// Newest N commits. The landing page draws these as a spiral, so this is a
// payload budget, not a claim about the repo's size — at ~93 bytes a commit,
// the whole 5,800-commit history would be a ~540 KB fetch on a landing page.
// Full-history analysis lives in stats/ (scripts/build-git-stats.mjs), which
// reads everything and ships pre-aggregated rollups instead.

const commits = readCommits({ merges: true, max: MAX_COMMITS, cwd: REPO_ROOT }).map((c) => ({
  h: c.h,
  p: c.p,
  t: c.t,
  a: c.actor,           // agent | loop | bot | human — see lib/gitlog.mjs
  d: c.dirs.filter((d) => !d.startsWith('.')).slice(0, 6),
  r: c.refs,
  m: c.merge,
}));

const json = JSON.stringify(commits);

if (process.argv.includes('--write')) {
  const outPath = resolve(REPO_ROOT, 'git-graph.json');
  writeFileSync(outPath, json);
  const by = {};
  for (const c of commits) by[c.a] = (by[c.a] || 0) + 1;
  process.stderr.write(`Wrote ${commits.length} commits to ${outPath}\n`);
  process.stderr.write(`  ${Object.entries(by).map(([k, v]) => `${k}:${v}`).join('  ')}\n`);
} else {
  process.stdout.write(json);
}
