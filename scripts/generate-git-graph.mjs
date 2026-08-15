#!/usr/bin/env node
// Regenerate git-graph.json — the data file consumed by the landing page's
// commit-history visualization (spiral + branch lanes).
//
// Output schema (array of commits, newest-first):
//   { h, p, t, a, d, r, m }
//     h: short hash (7 chars)
//     p: parent short hashes (array)
//     t: unix timestamp (seconds)
//     a: author code — 'C' for Claude, 'H' for human
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
const MAX_COMMITS = 800;

if (existsSync(join(REPO_ROOT, '.git', 'shallow')) && !process.argv.includes('--allow-shallow')) {
  const have = execSync('git rev-list --count HEAD', { cwd: REPO_ROOT }).toString().trim();
  console.error(`REFUSING: this is a shallow clone (${have} commits reachable).`);
  console.error('Regenerating here would truncate git-graph.json rather than refresh it.');
  console.error('Run after `git fetch --unshallow`, or pass --allow-shallow if you mean it.');
  process.exit(1);
}

function sh(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();
}

// Use a delimiter unlikely to appear in commit messages or names.
const SEP = '\x1f';
const FORMAT = ['%h', '%P', '%ct', '%ae', '%D'].join(SEP);

const raw = sh(`git log --all --max-count=${MAX_COMMITS} --format='${FORMAT}'`);
const lines = raw.split('\n').filter(Boolean);

// For each commit, find the directories its changes touched. Batching this
// keeps `git show --stat` cost down vs. one call per commit.
const HASHES = lines.map(l => l.split(SEP)[0]);

function topDirsFor(hash) {
  // --no-merges --no-renames keeps the file list clean. For merges we still
  // want a 'd' value — fall back to whatever changed against the first parent.
  let out;
  try {
    out = sh(`git show --no-merges --name-only --format= ${hash} 2>/dev/null || git show -m --first-parent --name-only --format= ${hash}`);
  } catch {
    return [];
  }
  const dirs = new Set();
  for (const path of out.split('\n')) {
    if (!path) continue;
    const top = path.split('/')[0];
    // Skip dotfiles + obvious non-surface dirs.
    if (top.startsWith('.') || top === 'node_modules') continue;
    dirs.add(top);
  }
  return Array.from(dirs).slice(0, 6);
}

const commits = lines.map(line => {
  const [h, parents, t, email, refs] = line.split(SEP);
  const author = email.includes('claude') ? 'C' : 'H';
  const p = parents.trim() ? parents.trim().split(/\s+/).map(x => x.slice(0, 7)) : [];
  const m = p.length > 1;
  return {
    h,
    p,
    t: parseInt(t, 10),
    a: author,
    d: topDirsFor(h),
    r: refs.trim() || null,
    m,
  };
});

const json = JSON.stringify(commits);

if (process.argv.includes('--write')) {
  const outPath = resolve(REPO_ROOT, 'git-graph.json');
  writeFileSync(outPath, json);
  process.stderr.write(`Wrote ${commits.length} commits to ${outPath}\n`);
} else {
  process.stdout.write(json);
}
