#!/usr/bin/env node
// take-ownership.mjs — move surfaces' deploy ownership to the current branch, only when it is safe.
//
//   node scripts/take-ownership.mjs <surface> [<surface> ...]           # check only: say what would happen
//   node scripts/take-ownership.mjs <surface> [<surface> ...] --write   # move the ones that pass
//
// Moving a surface's registry `branch` makes THIS branch's tree what its next deploy publishes, and
// Workers Static Assets replaces the whole manifest. So a handover is safe only when the current
// owner holds nothing on the surface's paths that this branch lacks. That is the one guard, checked
// per surface against the owner's real branch:
//
//   git log HEAD..origin/<owner> -- <paths>   must be EMPTY
//
// Every commit the owner has on those paths must already be reachable from HEAD. That covers both
// ways a handover loses work: a file the live site has that this tree deleted, and a newer edit
// the owner made that never reached trunk.
//
// A merge candidate SQUASHES branches, so an owner's commit is often not reachable even though its
// content landed. So a commit that fails the history test gets a second one, per file it touched:
// the owner's version of the file must appear somewhere in HEAD's history (it landed, and maybe
// moved on since), or be a generated artefact that preflight --fix rebuilds anyway. Anything else
// is work only the owner has, and the surface is refused; merge it first. A surface whose owner
// branch no longer exists is taken (there is nothing to lose).
//
// With --write it rewrites only the `branch` (and prepends a dated line to `status`) of each
// passing entry, preserving the registry's formatting, then regenerates the workflow triggers.
// It never pushes, and it never touches the owner's branch. The push that follows deploys each
// surface whose workflow lists its own file in `paths:`; dispatch the rest and verify each host.
//
// This is the command the operator's permission rule approves (CLAUDE.md, "Taking ownership").
// Exit 0 = every named surface passed (or was already owned); 1 = something was refused.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REG = join(ROOT, 'deploy-registry.json');

/** The decision for one surface, as a pure function of what git said. */
export function decide({ owner, me, ownerExists, ownerOnlyCommits, unlandedFiles = [] }) {
  if (owner === me) return { take: false, why: 'already owned here' };
  if (!ownerExists) return { take: true, why: `owner branch ${owner} is gone; nothing to lose` };
  if (unlandedFiles.length) {
    return { take: false, refused: true, why: `${owner} holds work this branch lacks, in ${unlandedFiles.length} file(s): ${unlandedFiles.slice(0, 4).join(', ')} — merge it first` };
  }
  if (ownerOnlyCommits.length) {
    return { take: true, why: `${ownerOnlyCommits.length} unmerged-looking commit(s) on ${owner}, but every file they touched already landed here (squashed)` };
  }
  return { take: true, why: `${owner}'s work on these paths is all in this branch` };
}

/** Artefacts preflight --fix regenerates (CLAUDE.md, "Generated vs hand-edited"): an owner's copy is never work. */
export const GENERATED = new Set(['docs/SURFACES.md', 'docs/BACKENDS.md', 'rethink/data.js', 'functions/search.js',
  'io/sites.json', 'office/surfaces.json', 'mappa/sites.js', 'orrery/index.html', 'spec/data.js', 'og.png', 'og.svg',
  'git-graph.json', 'stats/data.json']);

/** Rewrite only `branch` (+ a status note) of the named entries, keeping every other line as-is. */
export function rewriteRegistry(raw, moves, date) {
  const reg = JSON.parse(raw);
  for (const [name, { from, to }] of Object.entries(moves)) {
    const s = reg.surfaces.find((x) => x.surface === name);
    s.branch = to;
    s.status = `OWNERSHIP (${date}): taken by ${to} from ${from} with scripts/take-ownership.mjs (no work of the old owner lost). ` + (s.status || '');
  }
  // JSON.stringify re-escapes nothing the original had as literal text, but the original may use
  // \u escapes; map each regenerated line back to its original spelling where the content matches.
  // Compare without a trailing comma: adding `status` after a field gives that line one.
  const dec = (l) => l.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/,$/, '');
  const orig = new Map(raw.split('\n').map((l) => [dec(l), l.replace(/,$/, '')]));
  return (JSON.stringify(reg, null, 2) + '\n').split('\n')
    .map((l) => { const o = orig.get(dec(l)); return o === undefined ? l : o + (l.endsWith(',') ? ',' : ''); }).join('\n');
}

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const names = args.filter((a) => !a.startsWith('--'));
  if (!names.length) { console.error('usage: take-ownership.mjs <surface>... [--write]'); process.exit(2); }
  if (git('rev-parse', '--is-shallow-repository') === 'true') {
    console.error('shallow clone: the history check would lie. Run `git fetch --unshallow` first.'); process.exit(2);
  }
  const me = git('rev-parse', '--abbrev-ref', 'HEAD');
  const raw = readFileSync(REG, 'utf8');
  const reg = JSON.parse(raw);
  const moves = {};
  let refused = 0;
  for (const name of names) {
    const s = reg.surfaces.find((x) => x.surface === name);
    if (!s) { console.log(`✗ ${name}: no such surface in the registry`); refused++; continue; }
    const owner = s.branch;
    let ownerExists = true, ownerOnlyCommits = [], unlandedFiles = [];
    if (owner !== me) {
      try { git('fetch', '-q', 'origin', owner); } catch { ownerExists = false; }
      if (ownerExists) {
        const paths = (s.paths || [`${s.dir}/**`]).map((p) => `:(glob)${p}`);
        const log = git('log', '--format=%h %s', `HEAD..origin/${owner}`, '--', ...paths);
        ownerOnlyCommits = log ? log.split('\n') : [];
        if (ownerOnlyCommits.length) {
          const touched = [...new Set(git('log', '--format=', '--name-only', `HEAD..origin/${owner}`, '--', ...paths).split('\n').filter(Boolean))];
          for (const f of touched) {
            if (GENERATED.has(f)) continue;
            let blob = null;
            try { blob = git('rev-parse', `origin/${owner}:${f}`); } catch { /* the owner deleted it */ }
            if (!blob) { try { git('cat-file', '-e', `HEAD:${f}`); unlandedFiles.push(`${f} (deleted by owner)`); } catch {} continue; }
            let here = null;
            try { here = git('rev-parse', `HEAD:${f}`); } catch {}
            if (here === blob) continue;
            if (git('log', '-1', '--format=%h', `--find-object=${blob}`, 'HEAD', '--', f)) continue; // landed, then moved on
            unlandedFiles.push(f);
          }
        }
      }
    }
    const d = decide({ owner, me, ownerExists, ownerOnlyCommits, unlandedFiles });
    if (d.refused) { console.log(`✗ ${name}: REFUSED — ${d.why}`); refused++; continue; }
    if (!d.take) { console.log(`· ${name}: ${d.why}`); continue; }
    console.log(`${write ? '✓' : '~'} ${name}: ${write ? 'taken' : 'would take'} from ${owner} — ${d.why}`);
    moves[name] = { from: owner, to: me };
  }
  if (write && Object.keys(moves).length) {
    writeFileSync(REG, rewriteRegistry(raw, moves, new Date().toISOString().slice(0, 10)));
    execFileSync('node', [join(ROOT, 'scripts/gen-deploy-triggers.mjs'), '--write'], { cwd: ROOT, stdio: 'inherit' });
    console.log(`\n${Object.keys(moves).length} surface(s) now owned by ${me}. Run \`node scripts/preflight.mjs --fix\`, commit, push; then deploy and verify each host.`);
  } else if (!write) {
    console.log(`\ncheck only — ${Object.keys(moves).length} would move. Add --write to apply.`);
  }
  process.exit(refused ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
