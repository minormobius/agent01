// deploy-drift.selftest.mjs — the drift classifier (scripts/deploy-drift.mjs).
//   node scripts/deploy-drift.selftest.mjs
//
// Pins the classification, which is the whole judgment of the tool, without needing a git repo:
// every category, and the two readings that actually cost us production time —
//   • a branch thousands of commits "behind main" but IN SYNC on its own paths is `same`, not a finding
//   • a branch with trunk commits and none of its own on those paths is `behind` — the hoop bug

import { classify, pathspec, CATEGORIES, environmentSkip } from './deploy-drift.mjs';

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

// ── the environment guard: red-vs-green in CI turns on this ─────────────────────────────
// A check must fail on a REPO problem, never on how the repo was cloned. Without this guard a
// single-branch checkout reports all 102 surfaces as `missing` and turns a healthy repo red.
ok(environmentSkip({ shallow: true }), 'a shallow clone skips (no merge base to find down there)');
ok(environmentSkip({ haveTrunk: false }), 'no trunk ref skips');
ok(environmentSkip({ absent: 102, total: 102 }), 'a single-branch checkout skips instead of calling every surface missing');
ok(environmentSkip({ absent: 60, total: 102 }), 'most branches absent → the checkout is the problem, not the repo');
ok(!environmentSkip({ absent: 2, total: 102 }), 'a HANDFUL of absent branches is a real finding — do not skip it away');
ok(!environmentSkip({ absent: 0, total: 102 }), 'a healthy full checkout proceeds');
ok(!environmentSkip(), 'defaults proceed');
ok(/fetch-depth/.test(environmentSkip({ absent: 102, total: 102 })), 'the skip reason names the remedy');

console.log((fail ? '✗ ' : '✓ ') + 'deploy-drift.selftest — ' + pass + '/' + (pass + fail) + ' checks');
process.exit(fail ? 1 : 0);
