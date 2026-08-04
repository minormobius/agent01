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

import { execFileSync, spawnSync } from 'node:child_process';
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

// -------------------------------------------- 4b. workflow shell parses -----
// EVERY `run:` BLOCK IS A SHELL SCRIPT NOBODY EVER PARSES. GitHub does not
// check them; YAML validity says nothing about the shell inside; and the only
// way to find a quoting bug has been to burn a real run — which is expensive
// when the run is somebody's website request and the failure arrives as "that
// one didn't make it" in their replies.
//
// Found the hard way: lab-build.yml's brief step used the `'"'"'` idiom, which
// escapes an apostrophe inside a SINGLE-quoted string, inside a DOUBLE-quoted
// one — where an apostrophe is already literal. It opened an unterminated quote
// that swallowed the next line. It sat there through several green runs because
// the block was only reached when a requester was present, and the first request
// from a real person was the first one to have one.
//
// `bash -n` is a parse, not an execution: nothing runs, nothing is installed.
console.log('\nworkflow shell');
{
  // A targeted extractor rather than a YAML dependency. Workflows here are
  // regular: `run: |` opens a block scalar that continues while indentation
  // exceeds the key's, and anything else on the line is a one-liner. The block
  // COUNT is reported so a silently-broken extractor shows up as a suspiciously
  // small number rather than a quiet pass.
  const runBlocks = (text) => {
    const out = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*)run:\s*(\S.*)?$/);
      if (!m) continue;
      const indent = m[1].length;
      if (m[2] && !/^[|>]/.test(m[2])) { out.push(m[2]); continue; }
      const body = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === '') { body.push(''); continue; }
        const ind = lines[j].match(/^\s*/)[0].length;
        if (ind <= indent) break;
        body.push(lines[j]);
      }
      out.push(body.join('\n'));
    }
    return out;
  };

  const wfDir = join(ROOT, '.github', 'workflows');
  const bad = [];
  let blocks = 0;
  for (const f of existsSync(wfDir) ? readdirSync(wfDir) : []) {
    if (!/\.ya?ml$/.test(f)) continue;
    for (const raw of runBlocks(readFileSync(join(wfDir, f), 'utf8'))) {
      // ${{ }} is interpolated by Actions before bash ever sees it. Substitute a
      // harmless token so this checks OUR syntax, not expression syntax.
      const script = raw.replace(/\$\{\{[^}]*\}\}/g, 'X');
      if (!script.trim()) continue;
      blocks++;
      const r = spawnSync('bash', ['-n'], { input: script, encoding: 'utf8' });
      if (r.status !== 0) bad.push(`${f}: ${lastLine(r.stderr)}`);
    }
  }
  record(`workflow shell parses (${blocks} run blocks)`, bad.length === 0, bad.join('; '));

  // ---- and: `'\"'\"'` must not appear at all ----
  //
  // `bash -n` PROVES PARSEABILITY, NOT CORRECTNESS, and I over-claimed it. The
  // check above was added after `'"'"'` — the idiom for escaping an apostrophe
  // inside a SINGLE-quoted string — appeared inside a DOUBLE-quoted one and
  // opened an unterminated quote. It was verified against that instance and
  // announced as covering the class.
  //
  // It does not. Four hours later the same idiom went into the same file again,
  // and this time the quotes happened to BALANCE across the block: it parsed
  // cleanly, preflight passed, and the step died at runtime with
  //
  //     line 150: when: command not found        (exit 127)
  //
  // taking two strangers' builds with it. Syntactically valid, semantically
  // shredded — text after the mangled quote was handed to the shell as commands.
  //
  // So the rule is now the sequence itself, which is exact and cheap: inside a
  // double-quoted string an apostrophe is ALREADY literal, so this idiom is
  // never needed there, and there is currently no legitimate use anywhere in
  // this repo. If one ever arises it can be argued for then; until then, twice
  // written and twice wrong is enough evidence.
  const idiom = [];
  for (const f of existsSync(wfDir) ? readdirSync(wfDir) : []) {
    if (!/\.ya?ml$/.test(f)) continue;
    for (const raw of runBlocks(readFileSync(join(wfDir, f), 'utf8'))) {
      const line = raw.split('\n').findIndex((l) => l.includes(`'"'"'`));
      if (line !== -1) idiom.push(`${f}: \`'"'"'\` on line ${line + 1} of a run block — inside "..." an apostrophe is already literal; just write it`);
    }
  }
  record(`no '"'"' quote-escape idiom in run blocks`, idiom.length === 0, idiom.join('; '));

  // ---- and: a block that reads an exit code must have turned -e off ----
  //
  // GitHub runs every `run:` block as `bash -e {0}`. `set -uo pipefail` — the
  // idiom used across this repo to mean "I will check the codes myself" — DOES
  // NOT cancel that: it adds -u and pipefail and leaves -e exactly as it was.
  // So the first command that fails ends the step, and every line after it is
  // unreachable.
  //
  // lab-build.yml's smoke step was built entirely on that assumption: an
  // exit-code ladder, a "2 means could-not-check, publish unverified" branch,
  // and a whole repair pass in which a second agent is handed the browser's
  // error report. None of it could ever execute. The step could only pass or
  // hard-fail, and it hard-failed on its first real run — costing a published
  // page and putting "that one didn't make it" in a stranger's replies.
  //
  // The tell is mechanical: the block captures `$?` or `${PIPESTATUS[...]}` and
  // never says `set +e`. That is checkable, so it is checked.
  const dead = [];
  for (const f of existsSync(wfDir) ? readdirSync(wfDir) : []) {
    if (!/\.ya?ml$/.test(f)) continue;
    for (const raw of runBlocks(readFileSync(join(wfDir, f), 'utf8'))) {
      // COMMENTS ARE NOT CODE. First cut of this check tested the raw block, so
      // the comment explaining why `set +e` matters satisfied it — the check
      // passed with the fix deliberately removed. Verified by removing it.
      const code = raw.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n');
      if (!/(^|\s)\w+=\$\?|\$\{PIPESTATUS\[/.test(code)) continue;
      if (!/(^|\s)set\s+\+e\b/.test(code)) {
        const line = code.split('\n').find((l) => /=\$\?|\$\{PIPESTATUS\[/.test(l))?.trim().slice(0, 60);
        dead.push(`${f}: "${line}" is unreachable under \`bash -e\` — add \`set +e\``);
      }
    }
  }
  record('exit-code ladders are reachable', dead.length === 0, dead.join('; '));

  // ---- `git diff-tree HEAD` needs a parent commit to diff against ----
  //
  // actions/checkout defaults to a DEPTH-1 clone, in which HEAD has no parent —
  // so `git diff-tree -r HEAD` prints nothing at all. It does not error. It
  // reports "no files changed", which reads as a legitimate answer.
  //
  // publish-lexicons.yml gated publishing on exactly that, in a job with the
  // default checkout. The run went green, the publish step was skipped, and
  // NOTHING WAS PUBLISHED — the commit that bumped the marker was in the diff
  // the whole time. Reproduced afterwards with `git clone --depth 1`: 0 lines,
  // where depth 2 gives 5. lab-build.yml already had `fetch-depth: 2` on its
  // select job for this reason, which is what makes it a class of bug rather
  // than an incident.
  //
  // Checked per FILE rather than per job: a workflow that diffs HEAD anywhere
  // and never asks for depth is the shape that fails.
  const shallow = [];
  for (const f of existsSync(wfDir) ? readdirSync(wfDir) : []) {
    if (!/\.ya?ml$/.test(f)) continue;
    const src = readFileSync(join(wfDir, f), 'utf8');
    const usesDiffTree = runBlocks(src).some((raw) => {
      const code = raw.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n');
      return /git\s+diff-tree[^\n]*\bHEAD\b/.test(code);
    });
    if (!usesDiffTree) continue;
    // SCAN THE CONFIG, NOT THE PROSE. First cut matched `fetch-depth:` anywhere
    // in the file — which this very workflow's own ERROR MESSAGE contains
    // ("Set 'fetch-depth: 2' on actions/checkout"), so the check passed with the
    // fix deliberately removed. Same trap as the `set +e` check's comments.
    // Strip run blocks and comments first; what is left is YAML.
    let config = src;
    for (const raw of runBlocks(src)) config = config.replace(raw, '');
    config = config.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n');
    const depths = [...config.matchAll(/fetch-depth:\s*(\d+)/g)].map((m) => Number(m[1]));
    // 0 means "everything" and is fine; anything else must be at least 2.
    if (!depths.some((d) => d === 0 || d >= 2)) {
      shallow.push(`${f}: uses \`git diff-tree HEAD\` but no checkout sets fetch-depth >= 2 (depth 1 has no parent, so the diff is silently empty)`);
    }
  }
  record('diff-tree jobs check out a parent commit', shallow.length === 0, shallow.join('; '));

  // ---- a push trigger without `branches:` fires on EVERY branch ----
  //
  // A `paths:`-only push trigger fires on any branch that first *receives* the
  // file — which is exactly what a merge candidate does, and then again when it
  // is merged to main. bsky-hello.yml learned this the hard way and carries the
  // lesson in a comment; the two bake-off sentinels (bakeoff/RUN, which starts a
  // paid harness x model matrix, and bakeoff/PUBLISH, which republishes a run)
  // were written afterwards and did not inherit the guard. Assembling them into
  // a merge candidate for the first time would have started a full paid run
  // nobody asked for, and merging that candidate would have started a second.
  //
  // So: every push trigger must name its branches, unless it is on the list
  // below of ones that are meant to fire from anywhere. Adding to that list is
  // a deliberate act — the question to answer first is "what happens when a
  // merge candidate carries this path for the first time?"
  const UNGUARDED_ON_PURPOSE = new Map([
    // The publishing pair. These fire from any branch BY DESIGN: content is
    // authored on a feature branch and the push is the publish. They are also
    // the sharpest edge in the repo — see the danger zones in CLAUDE.md — and a
    // merge candidate must never carry a file under these paths.
    ['post-to-bluesky.yml', 'posts time/posts/**.md to the live Bluesky accounts'],
    ['publish-whtwnd.yml', 'publishes time/entries/**.md to WhiteWind'],
    // Pure recomputation of a committed artefact from its own source. No spend,
    // no publish, no deploy; safe to re-run wherever the source lands.
    ['anchor-cosines.yml', 'recomputes a committed data file'],
    ['build-cult-basis.yml', 'rebuilds a committed data file'],
    // Prints "set"/"not set" for provider keys. Spends nothing, deploys
    // nothing, and being push-triggered from anywhere is the entire point:
    // an agent session cannot dispatch a workflow, but it can push.
    ['secrets-doctor.yml', 'zero-token secret-presence check'],
  ]);
  const unguarded = [];
  for (const f of existsSync(wfDir) ? readdirSync(wfDir) : []) {
    if (!/\.ya?ml$/.test(f)) continue;
    let config = readFileSync(join(wfDir, f), 'utf8');
    for (const raw of runBlocks(config)) config = config.replace(raw, '');
    config = config.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n');
    // The `push:` mapping runs until the next key at its own indent.
    const push = config.match(/^([ \t]*)push:[ \t]*\n([\s\S]*?)(?=^\1\S|\Z)/m);
    if (!push) continue;
    if (/^\s+branches(-ignore)?:/m.test(push[2])) continue;
    if (UNGUARDED_ON_PURPOSE.has(f)) continue;
    unguarded.push(`${f}: push trigger has no \`branches:\` — it fires on every branch, including this merge candidate and main`);
  }
  record('push triggers name their branches', unguarded.length === 0, unguarded.join('; '));

  // ---- the ideas ledgers are written through one script, not three loops ----
  //
  // pull, review and post all commit .github/ideas/ and all push to the same
  // branch, so all three race. All three used to carry a copy of the same retry
  // loop, and the copy was broken in two ways that only showed under load:
  //
  //   for attempt in 1 2 3 4; do
  //     git push && break || { git pull --rebase --autostash; sleep …; }
  //   done
  //
  // A textual rebase cannot merge a JSONL ledger, and `run:` blocks are
  // `bash -e {0}` with errexit NOT suspended inside the `{ … }` on the right of an
  // `||` — so the first CONFLICT killed the step with the rebase half-applied and
  // attempts 2-4 never ran (run 30500800107, a whole review's work lost). And had
  // the loop survived, a fourth failed push would have ended it with `sleep`
  // returning 0: green, having pushed nothing, on a runner about to be deleted.
  //
  // The fix is scripts/ideas-push.sh plus `merge=union` in .gitattributes, and it
  // only works if EVERY writer uses it — one workflow keeping its own loop puts
  // the conflict back for all of them. Verified against bash, not assumed:
  // `bash -e` exits 1 on the failing recovery and 0 on an exhausted loop.
  const ledgerWriters = ['ideas-pull.yml', 'ideas-review.yml', 'ideas-post.yml'];
  const rogue = [];
  for (const f of ledgerWriters) {
    const p = join(wfDir, f);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf8');
    const code = runBlocks(src)
      .map((raw) => raw.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n'))
      .join('\n');
    if (/\bgit\s+push\b/.test(code) || /\bgit\s+pull\b/.test(code)) {
      rogue.push(`${f}: pushes the ideas ledgers itself — call scripts/ideas-push.sh instead`);
    } else if (!/scripts\/ideas-push\.sh/.test(code)) {
      rogue.push(`${f}: writes .github/ideas/ but never calls scripts/ideas-push.sh`);
    }
  }
  if (existsSync(join(ROOT, '.gitattributes'))) {
    const attrs = readFileSync(join(ROOT, '.gitattributes'), 'utf8');
    if (!/\.github\/ideas\/\*\.jsonl\s+merge=union/.test(attrs)) {
      rogue.push('.gitattributes: `.github/ideas/*.jsonl merge=union` is gone, so a rebase can conflict again');
    }
  } else {
    rogue.push('.gitattributes is missing — the ideas ledgers lose their union merge');
  }
  record('the ideas ledgers have exactly one writer', rogue.length === 0, rogue.join('; '));

  // ---- the smoke test's CSP must BE the production CSP ----
  //
  // lab-smoke.mjs serves tenant pages under a copy of lab/www/_headers' policy,
  // and the copy is the whole point: a smoke test under a LAXER policy than
  // production is worse than none, because it certifies pages the real site will
  // break. Two files, one value, kept in step by a comment saying "kept
  // byte-identical on purpose" — which is not a mechanism.
  //
  // It nearly drifted the first time it mattered: adding 'wasm-unsafe-eval' to
  // enable WebAssembly needs BOTH edits, and doing only the header would have
  // made every wasm page fail smoke while working in production; doing only the
  // smoke test would have passed pages the browser then refuses to run.
  // THREE copies, not two. lab/www/worker.js carries its own — it covers the
  // responses Static Assets does not serve directly (404s, /.well-known/*), and
  // its comment says "the two must be kept identical". This check originally
  // compared only _headers against lab-smoke.mjs, and the worker's copy had
  // ALREADY drifted by the time anyone looked: no 'wasm-unsafe-eval', no
  // host.bsky.network. A drift check that covers two of three copies is how the
  // third one drifts.
  const headersFile = join(ROOT, 'lab', 'www', '_headers');
  const copies = [
    ['scripts/lab-smoke.mjs', join(ROOT, 'scripts', 'lab-smoke.mjs')],
    ['lab/www/worker.js', join(ROOT, 'lab', 'www', 'worker.js')],
  ];
  if (existsSync(headersFile)) {
    const live = (readFileSync(headersFile, 'utf8')
      .split('\n').find((l) => /^\s*Content-Security-Policy:/i.test(l)) ?? '')
      .replace(/^\s*Content-Security-Policy:\s*/i, '').trim();
    const norm = (s) => s.split(';').map((d) => d.trim()).filter(Boolean).sort().join(' | ');
    const bad = [];
    for (const [label, file] of copies) {
      if (!existsSync(file)) continue;
      const block = (readFileSync(file, 'utf8').match(/CSP = \[([\s\S]*?)\]\.join/) ?? [])[1] ?? '';
      const copy = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]).join('; ');
      if (!copy) { bad.push(`${label}: could not read its CSP array`); continue; }
      if (norm(live) !== norm(copy)) bad.push(`${label} differs:\n      live: ${live}\n      copy: ${copy}`);
    }
    record(`CSP is identical in all ${copies.length + 1} places`, Boolean(live) && bad.length === 0,
      !live ? 'no CSP found in lab/www/_headers' : bad.join('; '));
  }
}

// ------------------------------------------------------------ 5. selftests --
// The repo carries 182 *.selftest.mjs outside the hoop/v* snapshots — too many
// to sweep on every push. So by DEFAULT we run only the ones under directories
// this branch actually touched (vs origin/main), which is the right scope both
// locally and on a PR. `--all-tests` forces the full sweep.
if (!quick) {
  const all = process.argv.includes('--all-tests');
  // hoop-archive is the frozen hoop museum — its selftests ran when that code
  // was live; sweeping a museum on every push buys nothing.
  const SKIP = /(^|\/)(node_modules|hoop\/v\d+|hoop-archive|\.git)(\/|$)/;
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
  // SHOW WHAT A FAILING TEST SAID. This used to be `stdio: 'ignore'`, so a red
  // sweep reported a FILENAME and nothing else — and the selftests worth having
  // are the ones whose output is the diagnosis. Chasing one of them across
  // sandbox and runner, with two node versions and with and without a browser,
  // cost an afternoon that the test's own first line would have ended: it is
  // environment-dependent failures, the ones you cannot reproduce where you
  // are, that most need their output, and those are exactly the ones where CI
  // is the only place it exists.
  //
  // Captured, not inherited: 90 passing tests' chatter would bury the result.
  // Only failures print, tail only, and `timeout` is called out by name because
  // a killed test otherwise looks identical to one that failed an assertion.
  for (const f of scope) {
    try {
      execFileSync('node', [f], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
      pass++;
    } catch (e) {
      failed.push(f);
      const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.split('\n').filter(Boolean);
      const why = e.signal === 'SIGTERM' ? `killed after 120s — it hung` : `exit ${e.status ?? '?'}`;
      console.log(`  ✗ ${f} (${why})`);
      for (const line of out.slice(-25)) console.log(`      ${line}`);
      if (!out.length) console.log('      (no output)');
    }
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
