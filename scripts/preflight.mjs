#!/usr/bin/env node
// preflight.mjs — the one command to run before pushing a merge candidate.
//
// WHY THIS EXISTS: this repo has good generators and a good registry lint, but
// until now nothing ran them. There were zero `pull_request`-triggered
// workflows — every check lived inside a deploy workflow, i.e. it ran AFTER the
// decision to ship. So a merge candidate's only gate was whoever remembered to
// run things by hand, and each assembled candidate turned up the same class of
// gap: a feature branch that appended itself to a workflow's `branches:` list
// (breaking the one-owner invariant), a new surface with no landing-page entry,
// a new surface with no spec family, a generated file left stale.
//
// Every one of those is mechanically detectable. They're all checks below.
//
// Usage:
//   node scripts/preflight.mjs            # check everything, exit non-zero on any failure
//   node scripts/preflight.mjs --fix      # regenerate what's stale, then re-check
//   node scripts/preflight.mjs --quick    # skip the selftest sweep (slow part)

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { loadRegistry, loadLanding, loadCurated, surfaceResolver } from './lib/landing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fix = process.argv.includes('--fix');
const quick = process.argv.includes('--quick');

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

function run(script, args = []) {
  try {
    const out = execFileSync('node', [join(ROOT, 'scripts', script), ...args], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
  }
}

const lastLine = (s) => (s || '').trim().split('\n').filter(Boolean).pop() || '';

// ------------------------------------------------------- 1. the invariants --
console.log('\nregistry');
{
  const r = run('lint-deploy-registry.mjs');
  record('registry invariant', r.ok, r.ok ? '' : lastLine(r.out));
}

// -------------------------------------------- 2. generated files are current --
// Each of these is a file a human/Claude can leave stale by hand-editing its
// source. --fix regenerates; without it, drift is a failure.
console.log('\ngenerated artefacts in sync');
const GENERATED = [
  { name: 'workflow triggers',      script: 'gen-deploy-triggers.mjs',      write: ['--write'] },
  { name: 'landing surface map',    script: 'gen-surface-map.mjs',          write: ['--write'] },
  { name: 'search catalogue',       script: 'generate-search-catalog.mjs',  write: [] },
  { name: 'docs/SURFACES.md index', script: 'gen-surface-index.mjs',        write: ['--write'] },
  { name: 'per-surface docs exist', script: 'gen-surface-docs.mjs',         write: ['--write'] },
  { name: 'dataviz copies',         script: 'sync-dataviz.mjs',             write: ['--write'] },
];
for (const g of GENERATED) {
  if (!existsSync(join(ROOT, 'scripts', g.script))) { record(g.name, false, 'script missing'); continue; }
  let r = run(g.script, ['--check']);
  if (!r.ok && fix) {
    run(g.script, g.write);
    r = run(g.script, ['--check']);
  }
  record(g.name, r.ok, r.ok ? '' : lastLine(r.out));
}
{
  // spec/data.js has no --check (it embeds the HEAD commit, so it always
  // differs); regenerate it under --fix and just prove it builds otherwise.
  const r = run('build-spec.mjs', fix ? ['--write'] : []);
  record('spec builds', r.ok, r.ok ? lastLine(r.out).trim() : lastLine(r.out));
}

// ------------------------------------------ 3. registration completeness ----
// The gaps that keep showing up when a feature branch half-registers itself.
console.log('\nregistration completeness');
{
  const reg = loadRegistry(ROOT);
  const landing = loadLanding(ROOT);
  const curated = loadCurated(ROOT);
  const resolver = surfaceResolver(reg);

  // Every surface must be DISCOVERABLE. A visitor-facing surface earns a
  // landing-page entry; a headless backend (no page of its own) is covered by
  // its capsule in spec/curated.js instead. Neither = invisible to the landing
  // page, the search bot and the spec — which is how `human` shipped in a
  // merge candidate with no catalogue entry at all.
  const owned = new Set(landing.P.map((p) => resolver.ownerOf(p.u)).filter(Boolean));
  const capsules = curated.descOverrides || {};
  const invisible = reg.surfaces
    .filter((s) => !owned.has(s.surface) && !capsules[s.surface])
    .map((s) => `${s.surface} (${s.type})`);
  record('every surface is discoverable', invisible.length === 0,
    invisible.length
      ? `${invisible.join(', ')} — add to index.html var P, or a capsule in spec/curated.js if headless`
      : '');

  // every surface has a spec family
  const fams = curated.families || {};
  const noFam = reg.surfaces.filter((s) => !fams[s.surface]).map((s) => s.surface);
  record('every surface has a spec family', noFam.length === 0,
    noFam.length ? `missing: ${noFam.join(', ')} — add to spec/curated.js families` : '');

  // registry prose stays short — the long form belongs in <dir>/CLAUDE.md
  const fat = reg.surfaces
    .filter((s) => (s.note || '').length > 1200)
    .map((s) => `${s.surface} (${s.note.length}c)`);
  record('registry notes stay short', fat.length === 0,
    fat.length ? `move prose to <dir>/CLAUDE.md: ${fat.join(', ')}` : '');

  // every surface's dir actually exists
  const ghosts = reg.surfaces.filter((s) => s.dir && !existsSync(join(ROOT, s.dir))).map((s) => s.surface);
  record('every surface dir exists', ghosts.length === 0, ghosts.join(', '));
}

// ------------------------------------------------------ 4. no leaked hosts --
// The root worker serves `assets.directory: "."`, so generated files are
// internet-facing. Redaction lives in scripts/lib/landing.mjs; verify it held.
console.log('\nredaction');
{
  const PUBLISHED = ['docs/SURFACES.md', 'spec/data.js', 'functions/search.js'];
  const leaked = PUBLISHED.filter((f) => existsSync(join(ROOT, f))
    && /ascential/i.test(readFileSync(join(ROOT, f), 'utf8')));
  record('no work-facing hosts in generated output', leaked.length === 0, leaked.join(', '));
}

// ------------------------------------------------------------ 5. selftests --
// The repo carries 182 *.selftest.mjs outside the hoop/v* snapshots — too many
// to sweep on every push. So by DEFAULT we run only the ones under directories
// this branch actually touched (vs origin/main), which is the right scope both
// locally and on a PR. `--all-tests` forces the full sweep.
if (!quick) {
  const all = process.argv.includes('--all-tests');
  const SKIP = /(^|\/)(node_modules|hoop\/v\d+|\.git)(\/|$)/;
  const found = [];
  (function walk(dir, depth = 0) {
    if (depth > 4) return;
    let entries; try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e);
      const rel = relative(ROOT, p);
      if (SKIP.test(rel)) continue;
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p, depth + 1);
      else if (e.endsWith('.selftest.mjs')) found.push(rel);
    }
  })(ROOT);

  let scope = found, scopeLabel = 'all';
  if (!all) {
    let changedDirs = null;
    for (const base of ['origin/main', 'main']) {
      try {
        // no `...HEAD`: diff the WORKING TREE against the base, so uncommitted
        // edits count too — locally that's the whole point.
        const out = execFileSync('git', ['diff', '--name-only', base],
          { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        // Documentation-only changes cannot affect a node selftest, and every
        // surface now carries a <dir>/CLAUDE.md — so counting .md edits would
        // run a surface's whole suite every time someone writes a sentence
        // about it. Scope on code.
        const files = out.split('\n').filter(Boolean).filter((f) => !/\.md$/i.test(f));
        changedDirs = new Set(files.map((f) => f.split('/')[0]));
        break;
      } catch { /* try next base */ }
    }
    if (changedDirs) {
      scope = found.filter((f) => changedDirs.has(f.split('/')[0]));
      scopeLabel = `changed dirs: ${[...changedDirs].filter((d) => found.some((f) => f.startsWith(d + '/'))).join(', ') || 'none'}`;
    }
  }

  console.log(`\nselftests (${scope.length} of ${found.length} — ${scopeLabel}; --all-tests for every one)`);
  let pass = 0; const failed = [];
  for (const f of scope) {
    try {
      execFileSync('node', [f], { cwd: ROOT, stdio: 'ignore', timeout: 120000 });
      pass++;
    } catch { failed.push(f); }
  }
  record(`selftests (${scope.length} run)`, failed.length === 0,
    failed.length ? `failing: ${failed.join(', ')}` : `${pass} passed`);
}

// ---------------------------------------------------------------- verdict ---
const bad = results.filter((r) => !r.ok);
console.log('');
if (!bad.length) {
  console.log(`✓ preflight passed — ${results.length} checks\n`);
  process.exit(0);
}
console.error(`✗ preflight FAILED — ${bad.length} of ${results.length} checks:`);
for (const b of bad) console.error(`    ${b.name}${b.detail ? ` — ${b.detail}` : ''}`);
console.error(fix ? '' : '\n  many of these self-heal: node scripts/preflight.mjs --fix\n');
process.exit(1);
