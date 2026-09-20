#!/usr/bin/env node
// deploy-drift.mjs — IS ANY SURFACE SHIPPING SOMETHING OTHER THAN TRUNK?
//
//   node scripts/deploy-drift.mjs             # the report
//   node scripts/deploy-drift.mjs --check     # preflight form: one summary line, fails only on a real break
//   node scripts/deploy-drift.mjs --strict    # exit non-zero if ANY surface has drifted
//   node scripts/deploy-drift.mjs --json      # machine-readable
//   node scripts/deploy-drift.mjs --surface hoop   # one surface, with the file list
//
// WHY THIS EXISTS. `main` does not deploy; a surface ships from its owning branch. So a branch
// that forked from trunk and never came back keeps deploying the tree it had on the day it forked,
// silently, from green runs — and Workers Static Assets republishes the WHOLE manifest, so the
// files trunk added simply are not there. That is not hypothetical: on 2026-09-18 `hoop` was found
// shipping a tree ~5300 lines behind trunk (statblock.js and its worker endpoint, rindmap.js,
// reactions.html, the mystery.js rewrite, fixtures) — a month of merged work that had never reached
// production, with nothing anywhere reporting it.
//
// THE MEASUREMENT. "Behind main by N commits" is the wrong question and wildly alarmist: nearly all
// of those N are other surfaces' work, and a branch 1731 commits behind can be perfectly in sync on
// everything it actually serves. The right question is per surface, over its OWN registry `paths:`:
//
//   does the owning branch's tree differ from trunk's there, and which side moved?
//
//   same      trees match on its paths — in sync, however far "behind" the branch looks
//   behind    trunk has commits there, the branch has none  → SHIPPING STALE CODE. The hoop case.
//   diverged  both sides have commits there                 → needs judgment, not a script
//   ahead     only the branch has commits there             → unmerged work, not a deploy problem
//   missing   the owning branch is gone from the remote      → that surface CANNOT deploy at all
//
// Only `missing` is an error: it is unambiguously broken. `behind` is a backlog, reported as a count
// the way catalogue-coverage reports its pending endpoints — making it fatal would paint preflight
// red across the repo for a condition no single commit caused. Use --strict to gate a cleanup pass.
//
// Read-only. Needs the remote branches and full history: a shallow clone cannot see a merge base, and
// reports "unrelated histories" where there is simply a truncated one — so it SKIPS loudly there
// rather than inventing a finding (the same rule build-git-stats follows).

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const CHECK = has('--check'), STRICT = has('--strict'), JSON_OUT = has('--json');
const ONE = val('--surface');
const TRUNK = process.env.DRIFT_TRUNK || 'origin/main';

const sh = (c) => { try { return execSync(c, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const lines = (c) => { const o = sh(c); return o ? o.split('\n').filter(Boolean) : []; };

// ── the classification, pure so the selftest can pin it without a git repo ──────────────────────
export const CATEGORIES = ['missing', 'behind', 'diverged', 'ahead', 'same'];
export function classify({ onRemote = true, treeDiff = 0, branchCommits = 0, trunkCommits = 0 } = {}) {
  if (!onRemote) return 'missing';
  if (!treeDiff) return 'same';                       // trees agree — nothing ships stale
  if (trunkCommits > 0 && branchCommits === 0) return 'behind';
  if (trunkCommits > 0 && branchCommits > 0) return 'diverged';
  return 'ahead';
}
// registry glob → git pathspec. `hoop/**` and a bare file path both work.
export const pathspec = (p) => `':(glob)${p}'`;

// Can this checkout answer the question at all? Returns a reason to SKIP, or null to proceed.
// A check must fail on a REPO problem, never on how the repo was cloned — so a shallow clone (no
// merge base to find), a missing trunk, or a single-branch checkout (trunk visible, siblings not,
// which would report every surface as `missing`) all skip loudly. A handful of absent branches is
// a genuine finding and proceeds.
export function environmentSkip({ shallow = false, haveTrunk = true, trunk = 'origin/main', absent = 0, total = 0 } = {}) {
  if (shallow) return 'shallow clone, needs `git fetch --unshallow`';
  if (!haveTrunk) return `no ${trunk} — fetch the remote branches`;
  if (total && absent > total / 2) return `this checkout cannot see sibling branches (${absent}/${total} owning branches absent) — needs the remote branches, e.g. actions/checkout fetch-depth: 0`;
  return null;
}

export function surveyOne(surface, remoteBranches) {
  const br = 'origin/' + surface.branch;
  if (!remoteBranches.has(br)) return { surface: surface.surface, branch: surface.branch, category: 'missing' };
  const ps = surface.paths.map(pathspec).join(' ');
  const treeFiles = lines(`git diff --name-only ${br} ${TRUNK} -- ${ps}`);
  const branchCommits = lines(`git rev-list ${TRUNK}..${br} -- ${ps}`).length;
  const trunkCommits = lines(`git rev-list ${br}..${TRUNK} -- ${ps}`).length;
  const row = {
    surface: surface.surface, branch: surface.branch, endpoint: surface.endpoint || null,
    treeDiff: treeFiles.length, branchCommits, trunkCommits, files: treeFiles,
  };
  row.category = classify({ onRemote: true, treeDiff: row.treeDiff, branchCommits, trunkCommits });
  // a pure fast-forward is the cheapest possible repair, so say when one is available
  row.fastForward = row.category === 'behind'
    && sh(`git merge-base --is-ancestor ${br} ${TRUNK} && echo yes`) === 'yes';
  return row;
}

export function survey() {
  const reg = JSON.parse(readFileSync(join(ROOT, 'deploy-registry.json'), 'utf8'));
  const remoteBranches = new Set(lines('git branch -r --format="%(refname:short)"'));
  const rows = [];
  for (const s of reg.surfaces || []) {
    if (!s.branch || !(s.paths || []).length) continue;     // unmanaged / pathless — not a deploy
    if (ONE && s.surface !== ONE) continue;
    rows.push(surveyOne(s, remoteBranches));
  }
  return rows;
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  // Can we see what we need? A shallow clone has no merge base to find, and a sandbox that fetched
  // one branch has no siblings to compare against. Either way: say so, don't guess.
  const shallow = existsSync(join(ROOT, '.git', 'shallow'));
  const haveTrunk = !!sh(`git rev-parse --verify -q ${TRUNK}`);
  let why = environmentSkip({ shallow, haveTrunk, trunk: TRUNK });
  const rows = why ? [] : survey();
  if (!why && rows.length) {
    why = environmentSkip({ absent: rows.filter((r) => r.category === 'missing').length, total: rows.length });
  }
  if (why) {
    if (JSON_OUT) console.log(JSON.stringify({ skipped: why }, null, 2));
    else console.log(`deploy drift: SKIPPED — ${why}`);
    process.exit(0);                                    // never a finding we cannot stand behind
  }

  const by = (c) => rows.filter((r) => r.category === c);
  const [missing, behind, diverged, ahead, same] = CATEGORIES.map(by);

  if (JSON_OUT) { console.log(JSON.stringify({ trunk: TRUNK, rows }, null, 2)); process.exit(missing.length ? 1 : 0); }

  if (CHECK) {
    // one line preflight can parse; the detail rides on a passing check unless something is broken
    console.log(`surfaces ${rows.length} · same ${same.length} · behind ${behind.length} · diverged ${diverged.length} · ahead ${ahead.length} · missing ${missing.length}`);
    for (const m of missing) console.log(`  ✗ ${m.surface}: owning branch '${m.branch}' is not on the remote — it cannot deploy`);
    process.exit(missing.length || (STRICT && (behind.length || diverged.length)) ? 1 : 0);
  }

  const w = Math.max(8, ...rows.map((r) => r.surface.length));
  const row = (r) => `  ${r.surface.padEnd(w)} ${String(r.trunkCommits).padStart(5)} ${String(r.branchCommits).padStart(6)}  ${r.fastForward ? 'ff ' : '   '} ${r.branch}`;
  console.log(`trunk: ${TRUNK} · ${rows.length} deploying surfaces\n`);
  if (missing.length) {
    console.log(`MISSING OWNING BRANCH — cannot deploy at all (${missing.length})`);
    for (const r of missing) console.log(`  ✗ ${r.surface.padEnd(w)} ${r.branch}`);
    console.log('');
  }
  console.log(`BEHIND TRUNK on their own paths — shipping stale code (${behind.length})`);
  console.log(`  ${'SURFACE'.padEnd(w)} ${'TRUNK'.padStart(5)} ${'BRANCH'.padStart(6)}   FF  OWNING BRANCH`);
  for (const r of behind.sort((a, b) => b.trunkCommits - a.trunkCommits)) console.log(row(r));
  console.log(`\nDIVERGED — both sides moved, needs judgment (${diverged.length})`);
  for (const r of diverged.sort((a, b) => b.trunkCommits - a.trunkCommits)) console.log(row(r));
  console.log(`\nAHEAD ONLY — unmerged work, not a deploy problem (${ahead.length}): ${ahead.map((r) => r.surface).join(' ') || '—'}`);
  console.log(`\nIN SYNC on their own paths (${same.length}): ${same.map((r) => r.surface).join(' ') || '—'}`);
  const ffable = behind.filter((r) => r.fastForward).length;
  console.log(`\n${ffable} of the ${behind.length} behind are a pure fast-forward (\`ff\` above):`);
  console.log('  git push origin ' + TRUNK + ':<owning-branch>   — no merge commit, no conflict, BUT it fires that surface\'s deploy.');
  console.log('  Stage them; verify each run binds its custom domain. The rest need an ordinary merge.');
  if (diverged.length) console.log(`\nFor a diverged surface, \`--surface <name>\` lists the files that differ — often the branch is\nsimply AHEAD and trunk's commits were merge candidates of its own earlier work (hoop reads this way).`);
  if (ONE && rows[0]?.files?.length) { console.log(`\nfiles differing for ${ONE} (${rows[0].files.length}):`); for (const f of rows[0].files.slice(0, 40)) console.log('  ' + f); }
  process.exit(missing.length || (STRICT && (behind.length || diverged.length)) ? 1 : 0);
}
