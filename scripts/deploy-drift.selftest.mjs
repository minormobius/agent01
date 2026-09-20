// deploy-drift.selftest.mjs — the drift classifier (scripts/deploy-drift.mjs).
//   node scripts/deploy-drift.selftest.mjs
//
// Pins the classification, which is the whole judgment of the tool, without needing a git repo:
// every category, and the two readings that actually cost us production time —
//   • a branch thousands of commits "behind main" but IN SYNC on its own paths is `same`, not a finding
//   • a branch with trunk commits and none of its own on those paths is `behind` — the hoop bug

import { classify, pathspec, CATEGORIES } from './deploy-drift.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const eq = (got, want, m) => ok(got === want, `${m} — got '${got}', want '${want}'`);

// ── the five categories ──────────────────────────────────────────────────────────────────────
eq(classify({ onRemote: false }), 'missing', 'an owning branch absent from the remote is missing');
eq(classify({ treeDiff: 0, branchCommits: 0, trunkCommits: 0 }), 'same', 'identical trees are in sync');
eq(classify({ treeDiff: 5, branchCommits: 0, trunkCommits: 3 }), 'behind', 'trunk moved, branch did not → behind');
eq(classify({ treeDiff: 5, branchCommits: 2, trunkCommits: 3 }), 'diverged', 'both moved → diverged');
eq(classify({ treeDiff: 5, branchCommits: 2, trunkCommits: 0 }), 'ahead', 'only the branch moved → ahead');
ok(CATEGORIES.length === 5 && new Set(CATEGORIES).size === 5, 'five distinct categories are exported');

// ── the reading that matters most: TREES decide, not commit distance ──────────────────────────
// `canvas` sits 1731 commits behind main and is perfectly in sync on everything it serves. Counting
// commits would have flagged it as the worst offender in the repo; comparing trees says "nothing to do".
eq(classify({ treeDiff: 0, branchCommits: 0, trunkCommits: 1731 }), 'same',
  '1731 commits behind but identical trees on its own paths is NOT a finding');
// and the converse: a tiny number of trunk commits IS a finding when they are this surface's own
eq(classify({ treeDiff: 17, branchCommits: 0, trunkCommits: 2 }), 'behind',
  'two trunk commits on the surface’s own paths IS a finding (the hoop case)');

// ── `missing` outranks everything: a surface whose branch is gone cannot deploy at all ────────
eq(classify({ onRemote: false, treeDiff: 0, branchCommits: 0, trunkCommits: 0 }), 'missing',
  'missing wins even when the trees would otherwise agree');

// ── defaults are the safe reading (an empty call must not invent drift) ───────────────────────
eq(classify(), 'same', 'no evidence → no finding');
eq(classify({}), 'same', 'an empty survey → no finding');

// ── pathspecs: registry globs and bare file paths both survive the trip to git ────────────────
eq(pathspec('hoop/**'), "':(glob)hoop/**'", 'a directory glob becomes a glob pathspec');
eq(pathspec('.github/workflows/deploy-hoop.yml'), "':(glob).github/workflows/deploy-hoop.yml'", 'a bare file path is quoted too');
ok(pathspec('a/**').startsWith("':(glob)") && pathspec('a/**').endsWith("'"), 'pathspecs are quoted for the shell');

console.log((fail ? '✗ ' : '✓ ') + 'deploy-drift.selftest — ' + pass + '/' + (pass + fail) + ' checks');
process.exit(fail ? 1 : 0);
