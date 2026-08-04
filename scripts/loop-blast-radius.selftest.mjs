#!/usr/bin/env node
// Tests the contagion firewall (scripts/lib/workflow-triggers.mjs and the
// policy in scripts/loop-blast-radius.mjs).
//
// This is the test that has to be right. Everything else in the loop fails
// visibly — a bad bead is a bad bead. A firewall that under-reports fails
// SILENTLY and is believed, and what it lets through is a workflow that posts
// to real Bluesky accounts or spends the operator's month in a circle.
//
// So every assertion about "does not fire" is paired with a CONTROL that must
// fire, on the same parser and the same inputs. A regression that makes
// `wouldFire` always return false would turn the whole firewall green; it
// cannot pass the controls.
//
// The live-repo section at the end is not a fixture: it runs the real
// extractor over .github/workflows and asserts things known to be true about
// this repo's actual triggers, so a workflow whose shape drifts past the
// extractor is caught here rather than at 3am.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseWorkflowTriggers, wouldFire, loadWorkflows, filterToRegExp, pathMatches, anyMatch,
} from './lib/workflow-triggers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

console.log('\nfilter patterns (GitHub semantics, not shell glob)');
{
  ok('* does not cross a slash', !pathMatches('loop/*', 'loop/a/b'));
  ok('* matches within a segment', pathMatches('loop/*', 'loop/a'));
  ok('** crosses slashes', pathMatches('loop/**', 'loop/a/b/c'));
  ok('** matches one segment too', pathMatches('loop/**', 'loop/a'));
  ok('a bare prefix does not match its children', !pathMatches('loop', 'loop/a'));
  ok('an exact path matches itself', pathMatches('index.html', 'index.html'));
  ok('an exact path does not match a sibling', !pathMatches('index.html', 'index2.html'));
  ok('a dot is literal, not any-char', !pathMatches('a.json', 'axjson'));
  ok('extension globs work', pathMatches('time/posts/**.md', 'time/posts/2026/hello.md'));
  ok('…and reject other extensions', !pathMatches('time/posts/**.md', 'time/posts/2026/hello.txt'));
  ok('? matches exactly one non-slash', pathMatches('a?c', 'abc') && !pathMatches('a?c', 'a/c'));
  ok('regex metacharacters in a path are escaped', pathMatches('a+b/c', 'a+b/c'));
  ok('anchoring is total — no substring matches', !pathMatches('loop/**', 'xloop/a'));
  ok('anyMatch is an OR over patterns', anyMatch(['no/**', 'loop/**'], 'loop/a'));
  ok('filterToRegExp returns a RegExp', filterToRegExp('a/**') instanceof RegExp);
}

console.log('\nextracting triggers — block form');
{
  const wf = parseWorkflowTriggers(`
name: Deploy something

on:
  push:
    branches:
      - 'claude/thing-abc'
      - main
    paths:
      - 'thing/**'
      - '.github/workflows/deploy-thing.yml'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
`, 'deploy-thing.yml');
  ok('the workflow parsed', wf.parsed);
  eq('branches read', wf.push.branches, ['claude/thing-abc', 'main']);
  eq('paths read', wf.push.paths, ['thing/**', '.github/workflows/deploy-thing.yml']);
  ok('sibling events are seen', wf.events.includes('workflow_dispatch'));
  ok('the jobs block does not leak into the trigger block', wf.push.paths.length === 2);
}

console.log('\nextracting triggers — inline form and comments');
{
  const wf = parseWorkflowTriggers(`
on:
  push:
    # a comment that mentions branches: and paths: to bait a naive grep
    branches: ['claude/inline-xyz']
    paths: [ 'a/**', "b/*.js" ]
`, 'inline.yml');
  eq('inline branches', wf.push.branches, ['claude/inline-xyz']);
  eq('inline paths, mixed quoting', wf.push.paths, ['a/**', 'b/*.js']);
}

{
  // The real hazard: this repo's workflows carry long prose comments inside the
  // trigger block (lab-build.yml has ~30 lines of them between `push:` and
  // `branches:`). A parser that stops at the first blank or comment line reads
  // the wrong list, or none.
  const wf = parseWorkflowTriggers(`
on:
  push:
    # THIS IS A MERGE-DAY GUARD.
    #
    # Long explanation with a colon: here, and a list-looking line:
    #   - not-a-branch
    #
    branches:
      - 'claude/real-branch'
    paths:
      - '.github/lab-requests/**'
`, 'prosey.yml');
  eq('prose between push: and branches: is skipped', wf.push.branches, ['claude/real-branch']);
  ok('a commented-out list item is not read as one', !wf.push.branches.includes('not-a-branch'));
  eq('paths still read after the prose', wf.push.paths, ['.github/lab-requests/**']);
}

console.log('\nthe dangerous defaults are null, not empty');
{
  const noPaths = parseWorkflowTriggers(`
on:
  push:
    branches: ['claude/**']
`, 'nopaths.yml');
  eq('an absent paths filter is null', noPaths.push.paths, null);
  ok('CONTROL: and it therefore fires on anything',
    wouldFire(noPaths, 'claude/loop', ['anything/at/all.txt']).fires);

  const noBranches = parseWorkflowTriggers(`
on:
  push:
    paths: ['time/posts/**.md']
`, 'nobranches.yml');
  eq('an absent branches filter is null', noBranches.push.branches, null);
  ok('CONTROL: and it therefore fires from any branch',
    wouldFire(noBranches, 'some/random/branch', ['time/posts/x.md']).fires);

  const bare = parseWorkflowTriggers(`
on:
  push:
  workflow_dispatch:
`, 'bare.yml');
  ok('a bodyless push: fires on everything', wouldFire(bare, 'x', ['y']).fires);

  const noPush = parseWorkflowTriggers(`
on:
  workflow_dispatch:
  schedule:
    - cron: '0 * * * *'
`, 'nopush.yml');
  eq('a workflow with no push trigger has push: null', noPush.push, null);
  ok('…and never fires on a push', !wouldFire(noPush, 'x', ['y']).fires);
}

console.log('\nfailing towards "yes"');
{
  const unknown = { file: 'weird.yml', events: [], push: null, parsed: false };
  const r = wouldFire(unknown, 'claude/loop', ['loop/a']);
  ok('an unparseable workflow is treated as firing', r.fires);
  ok('…and says why', /could not be parsed/.test(r.why));
}

console.log('\npaths-ignore');
{
  const wf = parseWorkflowTriggers(`
on:
  push:
    branches: ['claude/x']
    paths-ignore:
      - '**.md'
`, 'ignore.yml');
  ok('a doc-only push is filtered out', !wouldFire(wf, 'claude/x', ['docs/a.md']).fires);
  ok('CONTROL: a code push survives paths-ignore', wouldFire(wf, 'claude/x', ['src/a.js']).fires);
}

console.log('\nbranch filters');
{
  const wf = parseWorkflowTriggers(`
on:
  push:
    branches: ['claude/**', main]
    paths: ['loop/**']
`, 'branchy.yml');
  ok('a glob branch matches a nested name', wouldFire(wf, 'claude/loop-graph-x', ['loop/a']).fires);
  ok('CONTROL: a non-matching branch does not fire', !wouldFire(wf, 'other/branch', ['loop/a']).fires);
  ok('a matching branch with a non-matching path does not fire',
    !wouldFire(wf, 'claude/loop-graph-x', ['elsewhere/a']).fires);
}

console.log('\nthe live repo — the extractor against real workflows');
{
  const wfs = loadWorkflows(ROOT);
  ok('workflows were found', wfs.length > 50, `${wfs.length}`);
  eq('every real workflow parses', wfs.filter((w) => !w.parsed).map((w) => w.file), []);
  ok('most of them are push-triggered', wfs.filter((w) => w.push).length > 100);

  // THE DETONATOR. CLAUDE.md: a push to main under time/posts/**.md posts to
  // real Bluesky accounts. Its trigger carries NO branch filter, so it is armed
  // from every branch — which is the single most important fact this firewall
  // exists to know. If this assertion ever fails, either the workflow changed
  // or the extractor stopped reading it; both need a human.
  const bsky = wfs.find((w) => w.file === 'post-to-bluesky.yml');
  if (!bsky) { failed++; console.log('  ✗ post-to-bluesky.yml not found — has it moved?'); }
  else {
    eq('post-to-bluesky.yml still has no branch filter', bsky.push.branches, null);
    ok('CONTROL: it would fire from the loop branch if the loop ever wrote a post',
      wouldFire(bsky, 'claude/loop-graph-ticketing-surface-7qxu7c', ['time/posts/2026/oops.md']).fires);
    ok('…and does not fire on the loop\'s actual writes',
      !wouldFire(bsky, 'claude/loop-graph-ticketing-surface-7qxu7c', ['loop/index.html', '.github/loop/beads.jsonl']).fires);
  }

  // preflight is SUPPOSED to wake on every claude/** push — it is the one
  // listener the loop wants. Assert it, so "nothing fires" can never pass.
  const pre = wfs.find((w) => w.file === 'preflight.yml');
  ok('preflight.yml wakes on a loop commit (it is meant to)',
    pre && wouldFire(pre, 'claude/loop-graph-ticketing-surface-7qxu7c', ['loop/index.html']).fires);

  // A deploy workflow must NOT wake from another surface's branch. This is the
  // one-owning-branch invariant, seen from the firewall's side.
  const lab = wfs.find((w) => w.file === 'deploy-lab.yml');
  ok('deploy-lab does not wake from the loop branch',
    lab && !wouldFire(lab, 'claude/loop-graph-ticketing-surface-7qxu7c', ['lab/www/x/index.html']).fires);
  ok('CONTROL: deploy-lab does wake from its own branch with its own paths',
    lab && wouldFire(lab, 'claude/lab-www', ['lab/www/x/index.html']).fires);
}

console.log('\nthe policy check agrees with the config on disk');
{
  const cfgPath = join(ROOT, '.github', 'loop', 'config.json');
  if (!existsSync(cfgPath)) { failed++; console.log('  ✗ .github/loop/config.json missing'); }
  else {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    ok('the loop is disabled by default', cfg.enabled === false);
    ok('it declares a single literal branch', typeof cfg.branch === 'string' && !cfg.branch.includes('*'));
    ok('it declares its write paths', Array.isArray(cfg.writes) && cfg.writes.length > 0);
    ok('it declares what it may wake', Array.isArray(cfg.mayWake));

    // The loop must not claim write access to anything outside its own tree.
    // A `writes` entry of '**' would make the firewall vacuous.
    ok('no write pattern is repo-wide',
      cfg.writes.every((w) => w !== '**' && w !== '*' && !w.startsWith('**')), JSON.stringify(cfg.writes));

    // And the declared listeners must not include a known-dangerous workflow.
    // This list is the "stays on" column of CLOSED-LOOP.md §4, as an assertion.
    const FORBIDDEN = [/^post-to-bluesky/, /^publish-/, /^sync-/, /^illustrate/, /^bisk-/, /^ideas-post/];
    const armed = cfg.mayWake.filter((w) => FORBIDDEN.some((re) => re.test(w)));
    eq('no publishing or posting workflow is declared wakeable', armed, []);
  }
}

console.log('');
if (failed) { console.log(`✗ loop blast-radius selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ loop blast-radius selftest passed\n');
