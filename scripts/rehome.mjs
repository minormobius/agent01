#!/usr/bin/env node
// rehome.mjs — move code from one surface to another, and say what that breaks.
//
//   node scripts/rehome.mjs <path…>                     # what is this tangled in?
//   node scripts/rehome.mjs <path…> --to <surface>      # plan the move
//   node scripts/rehome.mjs <path…> --to <surface> --apply
//
//   --into <subdir>   land under <dest>/<subdir> instead of at its root
//   --url <path>      the public path this was served at (else guessed from
//                     the filename), for finding addresses already in the wild
//   --keep <path>     do not drag this along; it is shared with the parent and
//                     wants vendoring or duplicating, not moving (repeatable)
//   --stub <url>      leave a forwarding page where an index.html used to be
//
// `docs/surface-mitosis.md` says when a surface should divide and
// `surface-mitosis.mjs` detects it; both stop at the diagnosis. This is the
// staged execution they hand off to — anaphase — and it is generic on purpose:
// the shape of the job never changes, only the nouns.
//
// IT PLANS BY DEFAULT AND WRITES NOTHING WITHOUT `--apply`, because the two
// interesting outputs are things you want to read before anything happens:
//
//   THE CLOSURE — what else has to come. Follow the relative imports out of
//   what you named and you get the set that actually has to travel with it.
//   This is the mitosis doc's "cleavage plane" made concrete: if the closure
//   keeps growing until it is the whole surface, there is no clean plane and
//   the answer is refactor, not move. You want to know that before the git mv.
//
//   THE INBOUND EDGE — what points back. Every file outside the move that
//   imports into it, and every URL in the repo that names the old address.
//   Imports it retargets (a relative specifier is a computable statement about
//   two paths). URLs it only reports: `/sleuth` is a substring of somebody's
//   prose, and a tool that silently edits prose is worse than one that hands
//   you a list.
//
// What it will not do, because these are judgement and not mechanism: choose
// the destination, invent an endpoint (`curl -sI` it first — see the repo
// CLAUDE.md), write a new surface's wrangler.jsonc, or decide that a React
// route can be a page. It names each of those instead.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findRelativeImports, ownerOf, planMoves, redirectHtml, registryAfterMove,
  resolveSpec, retargetImports, tidy, urlPatterns,
} from './lib/rehome.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = join(ROOT, 'deploy-registry.json');

const CODE = /\.(m?js|cjs|jsx|ts|tsx)$/;
const TEXTUAL = /\.(m?js|cjs|jsx|ts|tsx|html|css|json|jsonc|md|yml|yaml|svg)$/;

// ─────────────────────────────────────────────────────────────── args ──

function parseArgs(argv) {
  const out = { sources: [], to: null, into: '', apply: false, stub: null, urls: [], keep: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--to') out.to = argv[++i];
    else if (a === '--into') out.into = argv[++i];
    else if (a === '--stub') out.stub = argv[++i];
    else if (a === '--url') out.urls.push(argv[++i]);
    else if (a === '--keep') out.keep.push(tidy(argv[++i]));
    else if (a === '--apply') out.apply = true;
    else if (a.startsWith('--')) { console.error(`unknown flag ${a}`); process.exit(2); }
    else out.sources.push(tidy(a));
  }
  return out;
}

// ──────────────────────────────────────────────────────── the file set ──

/** Tracked files only. Untracked build output is not somebody's dependency. */
function trackedFiles() {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })
    .split('\n').map(tidy).filter(Boolean);
}

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** A path, expanded: a directory becomes every tracked file beneath it. */
function expand(all, source) {
  const p = tidy(source);
  if (existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isDirectory()) {
    return all.filter((f) => f.startsWith(`${p}/`));
  }
  return all.includes(p) ? [p] : [];
}

/**
 * Everything reachable from `seed` by relative import, restricted to files the
 * same surface owns.
 *
 * The restriction is the point: an import that leaves the surface is already a
 * cross-surface dependency and following it would drag the repo in. Those get
 * reported instead.
 */
function closure(all, seed, surfaceDir, keep = []) {
  const inSurface = (p) => !surfaceDir || p === surfaceDir || p.startsWith(`${surfaceDir}/`);
  const held = new Set(keep);
  const seen = new Set(seed.filter((f) => !held.has(f)));
  const queue = [...seen];
  const escapes = [];
  const shared = new Map();

  while (queue.length) {
    const file = queue.shift();
    if (!CODE.test(file) || !all.includes(file)) continue;
    let src;
    try { src = read(file); } catch { continue; }
    for (const hit of findRelativeImports(src)) {
      const target = resolveSpec(file, hit.spec);
      const resolved = resolveFile(all, target);
      if (!resolved) continue;
      // `--keep` marks a boundary: the file is used on both sides, so it does
      // not travel. Recording who wanted it is the useful half — that list is
      // the argument for vendoring it rather than moving it.
      if (held.has(resolved)) {
        shared.set(resolved, [...(shared.get(resolved) || []), file]);
        continue;
      }
      if (!inSurface(resolved)) { escapes.push({ from: file, to: resolved, spec: hit.spec }); continue; }
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      queue.push(resolved);
    }
  }
  return { files: [...seen].sort(), escapes, shared };
}

/** A specifier may omit nothing in this repo, but be forgiving about it. */
function resolveFile(all, target) {
  if (all.includes(target)) return target;
  for (const ext of ['.js', '.mjs', '.jsx', '.ts', '.tsx']) {
    if (all.includes(target + ext)) return target + ext;
  }
  for (const idx of ['/index.js', '/index.jsx', '/index.mjs']) {
    if (all.includes(target + idx)) return target + idx;
  }
  return null;
}

// ─────────────────────────────────────────────────────────── the plan ──

function buildPlan(opts) {
  const registry = JSON.parse(read('deploy-registry.json'));
  const all = trackedFiles();

  const named = opts.sources.flatMap((s) => expand(all, s));
  if (!named.length) throw new Error(`nothing tracked matched: ${opts.sources.join(', ')}`);

  const from = ownerOf(registry.surfaces, named[0]);
  const fromDir = from ? tidy(from.dir) : '';
  const { files: moveSet, escapes, shared } = closure(all, named, fromDir, opts.keep);
  const extra = moveSet.filter((f) => !named.includes(f));

  // A file in the move set that something OUTSIDE it still imports is shared,
  // whether or not anyone said so. Detecting it beats making the caller guess
  // which of thirty files two sides both need — that guess is the reason a
  // rehome ends with a surface importing across a boundary.
  const moveSetIndex = new Set(moveSet);
  const alsoUsedBy = new Map();
  for (const file of all) {
    if (!CODE.test(file) || moveSetIndex.has(file)) continue;
    let src;
    try { src = read(file); } catch { continue; }
    for (const hit of findRelativeImports(src)) {
      const target = resolveFile(all, resolveSpec(file, hit.spec));
      if (target && moveSetIndex.has(target)) {
        alsoUsedBy.set(target, [...(alsoUsedBy.get(target) || []), file]);
      }
    }
  }

  const dest = opts.to ? registry.surfaces.find((s) => s.surface === opts.to) : null;
  if (opts.to && !dest) throw new Error(`no surface named "${opts.to}" — see deploy-registry.json`);
  const destDir = dest ? tidy(join(tidy(dest.dir), opts.into || '')) : null;

  const moves = destDir ? planMoves(moveSet, destDir) : [];
  const movedMap = Object.fromEntries(moves.map((m) => [m.from, m.to]));
  const moving = new Set(moves.map((m) => m.from));

  // Import edits, in both directions: files that travel have to re-reach what
  // stayed, and files that stayed have to re-reach what travelled.
  const rewrites = [];
  for (const file of all) {
    if (!CODE.test(file)) continue;
    const importsIntoSet = !moving.has(file);
    let src;
    try { src = read(file); } catch { continue; }
    if (importsIntoSet && !findRelativeImports(src).some(
      (h) => moving.has(resolveFile(all, resolveSpec(file, h.spec)) || ''))) continue;
    const after = movedMap[file] || file;
    const { text, edits } = retargetImports(src, file, after, movedMap);
    if (edits.length) rewrites.push({ file, after, text, edits });
  }

  // An edit whose two ends land in different surfaces is not a fixed import;
  // it is a cross-surface source dependency, which no build here can satisfy.
  const crossings = [];
  for (const r of rewrites) {
    for (const e of r.edits) {
      const a = ownerOf(registry.surfaces, r.after);
      const b = ownerOf(registry.surfaces, e.targetNew);
      if (a && b && a.surface !== b.surface) {
        crossings.push({ file: r.after, spec: e.to, from: a.surface, to: b.surface });
      }
    }
  }

  // URLs naming the old address. Reported only.
  //
  // `--url` is the honest way to say what the public path was; guessing it from
  // the filename is a heuristic that happens to be right for a route called
  // Sleuth.jsx and wrong for anything whose file and address disagree.
  const publicPaths = opts.urls.length
    ? opts.urls.map((u) => tidy(u).replace(/^\/+/, ''))
    : [...new Set(named.map(publicPathOf).filter(Boolean))];
  const patterns = urlPatterns({ endpoint: from?.endpoint, paths: publicPaths });
  const urlHits = patterns.length ? grepPatterns(all, patterns, moving) : [];

  const registryPatch = dest ? registryAfterMove(registry, { moves, toSurface: dest.surface }) : null;

  return {
    from, dest, destDir, named, extra, moves, escapes, shared, alsoUsedBy, rewrites,
    crossings, urlHits, patterns, registryPatch, registry,
  };
}

/** `photo/src/components/Sleuth.jsx` → `sleuth`, best effort. */
function publicPathOf(file) {
  const base = file.split('/').pop().replace(/\.[a-z]+$/i, '');
  return /^[A-Za-z][A-Za-z0-9-]*$/.test(base) ? base.toLowerCase() : null;
}

function grepPatterns(all, patterns, skip) {
  const hits = [];
  for (const file of all) {
    if (!TEXTUAL.test(file) || skip.has(file)) continue;
    let src;
    try { src = read(file); } catch { continue; }
    if (src.length > 2_000_000) continue;
    src.split('\n').forEach((line, i) => {
      for (const p of patterns) {
        if (p.re.test(line)) {
          hits.push({ file, line: i + 1, path: p.path, text: line.trim().slice(0, 100) });
          break;
        }
      }
    });
  }
  return hits;
}

// ───────────────────────────────────────────────────────────── output ──

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function report(plan, opts) {
  const { from, dest, destDir, named, extra, moves, escapes, rewrites, crossings, urlHits } = plan;

  console.log(`\n${bold('rehome')} ${opts.apply ? '— applying' : dim('— plan only; add --apply to write')}`);
  console.log(`  from  ${from ? `${from.surface} (${from.endpoint})` : 'unknown surface'}`);
  console.log(`  to    ${dest ? `${dest.surface} (${dest.endpoint}) → ${destDir}/` : dim('(no --to; reference report only)')}`);

  console.log(`\n${bold('the closure')} — what has to travel`);
  console.log(`  ${named.length} named, ${extra.length} pulled in by import`);
  for (const f of extra) console.log(`    + ${f}`);
  if (extra.length > named.length * 3) {
    console.log(dim('    the closure is much larger than what you named — read it before moving.'));
    console.log(dim('    a plane that keeps widening is not a plane (docs/surface-mitosis.md).'));
  }

  if (plan.alsoUsedBy?.size) {
    console.log(`\n${bold('still wanted where it is')} — in the move set, but imported from outside it`);
    for (const [file, users] of plan.alsoUsedBy) {
      console.log(`    ${file}`);
      for (const u of users.slice(0, 4)) console.log(`      ${dim(`← ${u}`)}`);
      if (users.length > 4) console.log(dim(`      ← …and ${users.length - 4} more`));
    }
    console.log(dim('    each of these is a --keep candidate: moving it makes the parent import'));
    console.log(dim('    across a surface boundary, which no build here can satisfy.'));
  }

  if (plan.shared?.size) {
    console.log(`\n${bold('held back')} — shared with ${from ? from.surface : 'the parent'}, so not moved`);
    for (const [file, wanters] of plan.shared) {
      console.log(`    ${file}  ${dim(`wanted by ${wanters.length} moving file(s)`)}`);
    }
    console.log(dim('    a file both sides need is a vendoring job, not a move (scripts/sync-dataviz.mjs).'));
  }

  if (escapes.length) {
    console.log(`\n${bold('leaves the surface')} — imports that already cross a boundary`);
    for (const e of escapes.slice(0, 12)) console.log(`    ${e.from}  →  ${e.to}`);
  }

  if (moves.length) {
    console.log(`\n${bold('moves')} (${moves.length})`);
    for (const m of moves.slice(0, 40)) console.log(`    ${m.from}\n      → ${m.to}`);
    if (moves.length > 40) console.log(dim(`    … and ${moves.length - 40} more`));
  }

  const staying = rewrites.filter((r) => r.file === r.after);
  const travelling = rewrites.filter((r) => r.file !== r.after);
  console.log(`\n${bold('imports to retarget')} — ${travelling.length} in files that move, ${staying.length} in files that stay`);
  for (const r of [...staying, ...travelling].slice(0, 20)) {
    for (const e of r.edits.slice(0, 4)) console.log(`    ${r.file}  ${e.from} → ${e.to}`);
  }

  if (crossings.length) {
    console.log(`\n${bold('⚠ cross-surface imports the move would create')} (${crossings.length})`);
    for (const c of crossings.slice(0, 12)) {
      console.log(`    ${c.file}  imports ${c.spec}   ${c.from} → ${c.to}`);
    }
    console.log(dim('    no build here can satisfy these: each surface builds from its own dir.'));
    console.log(dim('    either move the other end too, or vendor it (see scripts/sync-dataviz.mjs).'));
  }

  if (urlHits.length) {
    const byFile = new Map();
    for (const h of urlHits) byFile.set(h.file, [...(byFile.get(h.file) || []), h]);
    console.log(`\n${bold('URLs naming the old address')} — ${urlHits.length} in ${byFile.size} file(s) ${dim('· reported, never rewritten')}`);
    let shown = 0;
    for (const [file, hs] of byFile) {
      if (shown++ >= 18) { console.log(dim(`    … and ${byFile.size - 18} more file(s)`)); break; }
      const lines = hs.map((h) => h.line).slice(0, 6).join(', ');
      console.log(`    ${file}${dim(`:${lines}${hs.length > 6 ? '…' : ''}`)}`);
    }
  }

  if (plan.registryPatch?.notes.length) {
    console.log(`\n${bold('registry')}`);
    for (const n of plan.registryPatch.notes) console.log(`    ${n}`);
  }

  const manual = manualSteps(plan);
  if (manual.length) {
    console.log(`\n${bold('needs a human')}`);
    for (const m of manual) console.log(`    • ${m}`);
  }
  console.log('');
}

/** The judgement this tool refuses to fake. */
function manualSteps(plan) {
  const out = [];
  const { dest, moves, from, urlHits } = plan;
  if (!dest) { out.push('pick a destination surface (--to), or a new one — see the repo CLAUDE.md, "Adding a surface"'); return out; }

  const pages = moves.filter((m) => /\.html$/.test(m.to));
  const components = moves.filter((m) => /\.(jsx|tsx)$/.test(m.to));
  if (components.length && !pages.length) {
    out.push(`${components.length} component${components.length === 1 ? '' : 's'} and no page — `
      + `${dest.surface} needs a shell that renders ${components[0].to.split('/').pop()}`);
  }
  if (urlHits.length) out.push(`${urlHits.length} URL reference${urlHits.length === 1 ? '' : 's'} to rewrite or leave a stub for (--stub)`);
  if (from && dest && from.branch !== dest.branch) {
    out.push(`different owning branches (${from.branch} → ${dest.branch}) — `
      + 'the move lands on this branch; the destination only deploys from its own');
  }
  out.push('run `node scripts/preflight.mjs --fix` after applying, and read the diff');
  return out;
}

// ────────────────────────────────────────────────────────────── apply ──

function apply(plan, opts) {
  const { moves, rewrites, registryPatch } = plan;

  for (const m of moves) {
    mkdirSync(dirname(join(ROOT, m.to)), { recursive: true });
    execFileSync('git', ['mv', m.from, m.to], { cwd: ROOT });
  }
  console.log(`  ✓ moved ${moves.length} file(s) with git mv (history preserved)`);

  for (const r of rewrites) {
    const at = join(ROOT, r.after);
    if (!existsSync(at)) continue;
    writeFileSync(at, r.text);
  }
  console.log(`  ✓ retargeted imports in ${rewrites.length} file(s)`);

  if (registryPatch?.notes.length) {
    writeFileSync(REGISTRY, `${JSON.stringify(registryPatch.registry, null, 2)}\n`);
    console.log(`  ✓ deploy-registry.json: ${registryPatch.notes.join('; ')}`);
  }

  if (opts.stub) {
    for (const m of moves.filter((x) => /index\.html$/.test(x.from))) {
      const at = join(ROOT, m.from);
      mkdirSync(dirname(at), { recursive: true });
      writeFileSync(at, redirectHtml({ to: opts.stub, note: 'This page was rehomed.' }));
      console.log(`  ✓ stub left at ${m.from} → ${opts.stub}`);
    }
  }

  console.log('\n  now: node scripts/preflight.mjs --fix   (then read the diff)\n');
}

// ──────────────────────────────────────────────────────────────── main ──

const opts = parseArgs(process.argv.slice(2));
if (!opts.sources.length) {
  console.error('usage: node scripts/rehome.mjs <path…> [--to <surface>] [--into <subdir>]');
  console.error('                                 [--url <public-path>] [--stub <url>] [--apply]');
  console.error('       with no --to it reports the closure and the inbound references, and writes nothing.');
  process.exit(2);
}

let plan;
try {
  plan = buildPlan(opts);
} catch (err) {
  console.error(`✗ ${err.message}`);
  if (process.env.REHOME_DEBUG) console.error(err.stack);
  process.exit(1);
}

report(plan, opts);
if (opts.apply) {
  if (!opts.to) { console.error('✗ --apply needs --to'); process.exit(2); }
  apply(plan, opts);
}
