#!/usr/bin/env node
// lab-name-site.selftest.mjs — the step that decides a site's permanent URL.
//
//   node scripts/lab-name-site.selftest.mjs
//
// scripts/site-name.selftest.mjs covers the naming FUNCTION. This covers the
// thing lab-build.yml actually runs: title extraction from a real page, the
// collision set that comes off the publish branch, and the contract the YAML
// depends on — one line on stdout, always a usable slug, never a non-zero exit
// for a page it cannot name.
//
// The last of those is the one worth a test. This step runs after the gates and
// before the commit, on a build that has already succeeded; a crash here throws
// away a finished site over a cosmetic decision.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { titleOf } from './lab-name-site.mjs';

let pass = 0, fail = 0;
const ck = (cond, msg) => { if (cond) pass++; else { fail++; console.error(`  ✗ ${msg}`); } };
const eq = (a, b, msg) => ck(a === b, `${msg}\n      expected: ${JSON.stringify(b)}\n      actual:   ${JSON.stringify(a)}`);

const SCRIPT = new URL('./lab-name-site.mjs', import.meta.url).pathname;

/** Run it exactly as the workflow does: taken slugs on stdin, slug on stdout. */
function run(html, current, taken = [], { omitIndex = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'labname-'));
  try {
    if (!omitIndex) writeFileSync(join(dir, 'index.html'), html);
    const out = execFileSync('node', [SCRIPT, '--dir', dir, '--current', current], {
      input: taken.join('\n'), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    // The workflow reads this with $( ), which eats the trailing newline —
    // but only one line may ever be printed, so assert that here.
    ck(out.split('\n').filter(Boolean).length === 1, `exactly one line of stdout, got ${JSON.stringify(out)}`);
    return out.trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- title extraction ------------------------------------------------------
eq(titleOf('<!doctype html><title>Bottomless — a fractal</title>'), 'Bottomless — a fractal', 'a bare title');
eq(titleOf('<head>\n  <title>\n    Shoal\n  </title>\n</head>'), 'Shoal', 'newlines and indentation collapse');
eq(titleOf('<title lang="en">Concourse</title>'), 'Concourse', 'attributes on the tag');
eq(titleOf('<p>no title here</p>'), '', 'no title is empty, not a throw');
eq(titleOf(''), '', 'empty input');
eq(titleOf(null), '', 'null input');
// og:title comes AFTER <title> in every page the kit produces, and matching it
// instead would name the site after a meta tag the agent copies from the title.
eq(titleOf('<title>Real</title><meta property="og:title" content="Other">'), 'Real', 'the <title>, not og:title');

// --- the whole step, as the workflow calls it ------------------------------
eq(run('<title>Bottomless — a fractal that never runs out of zoom</title>', 'actually-let'), 'bottomless',
   'the placeholder gives way to the name the agent chose');
eq(run('<title>Shoal</title>', 'shoal'), 'shoal', 'a site already called the right thing keeps its name');

// COLLISIONS COME OFF DISK. lab/www/ on the publish branch is every path the
// domain serves — including retired names that are redirect stubs now, which is
// exactly what the registry would not know about.
eq(run('<title>Bottomless — a fractal</title>', 'actually-let', ['bottomless']), 'bottomless-2',
   'a taken name takes a suffix rather than clobbering a live path');
eq(run('<title>Bottomless</title>', 'actually-let',
       ['bottomless', 'bottomless-2', 'bottomless-3', 'bottomless-4', 'bottomless-5',
        'bottomless-6', 'bottomless-7', 'bottomless-8', 'bottomless-9']), 'actually-let',
   'when every candidate is taken it keeps the placeholder rather than inventing');

// THE SITE'S OWN DIRECTORY IS IN THE TAKEN SET on any build that has published
// before, and it must not read as a collision with itself.
eq(run('<title>Shoal</title>', 'shoal', ['shoal', '_kit']), 'shoal',
   'a site does not collide with its own directory');

// --- never take down a finished build --------------------------------------
eq(run('<p>nothing</p>', 'keep-me'), 'keep-me', 'a page with no title keeps the placeholder');
eq(run('', 'keep-me', [], { omitIndex: true }), 'keep-me', 'no index.html at all still prints a slug');
eq(run('<title>moved — /elsewhere/</title>', 'old-path'), 'old-path',
   'a redirect stub is never renamed — moving it breaks the link it exists to keep');
eq(run('<title>admin</title>', 'some-site'), 'some-site', 'a RESERVED name is refused, placeholder stands');
eq(run('<title>Tetris — falling blocks</title>', 'block-game'), 'block-game',
   'a trademark in the title never reaches the URL');
eq(run('<title>日本語</title>', 'fallback-name'), 'fallback-name', 'a title with no slug in it keeps the placeholder');

// Usage error is the ONLY non-zero exit, and it has to be, or a typo in the
// YAML would look like "this site has no name".
let usageFailed = false;
try {
  execFileSync('node', [SCRIPT, '--dir', '/nowhere'], { input: '', encoding: 'utf8', stdio: 'pipe' });
} catch (e) { usageFailed = e.status === 2; }
ck(usageFailed, 'missing --current exits 2');

// --- against the real estate ----------------------------------------------
// Not a fixture: every published site, named by the function that would name
// the next one. It is here to make the blast radius visible in the test output
// rather than in production.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
const www = new URL('../lab/www/', import.meta.url).pathname;
if (existsSync(www)) {
  const dirs = readdirSync(www, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^[a-z0-9][a-z0-9-]*$/.test(d.name)).map((d) => d.name);
  const taken = new Set(dirs);
  let changed = 0, stubs = 0;
  for (const name of dirs) {
    const page = join(www, name, 'index.html');
    if (!existsSync(page)) continue;
    const title = titleOf(readFileSync(page, 'utf8'));
    if (/^\s*moved\b/i.test(title)) { stubs++; continue; }
    const out = run(readFileSync(page, 'utf8'), name, [...taken]);
    if (out !== name) changed++;
    ck(/^[a-z0-9][a-z0-9-]{0,30}$/.test(out), `${name} → ${out} is a usable path segment`);
  }
  console.log(`  · ${dirs.length} live sites: ${changed} would be renamed, ${stubs} redirect stubs left alone`);
}

console.log(fail ? `✗ lab-name-site: ${fail} failed, ${pass} passed` : `✓ lab-name-site — ${pass} passed`);
process.exit(fail ? 1 : 0);
