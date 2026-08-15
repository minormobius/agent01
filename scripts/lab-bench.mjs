#!/usr/bin/env node
// lab-bench.mjs — run the code the agent wrote, and hand back the numbers.
//
//   node scripts/lab-bench.mjs lab/www/<name> [--budget=<ms>]
//
// THE PROBLEM THIS SOLVES, and it has a name and a date. @minormobius asked
// honeyflow-chess for "a headless play tester and tune defaults so that a pawn
// advancing two barely pulls neighboring pawns forward one". The agent built the
// tester — lab/www/honeyflow-chess/headless-test.mjs, a real sweep harness — and
// then could not run it. Its NOTE.txt:
//
//   "Built the headless tester at headless-test.mjs. No shell here to run it, so
//    DRAG and the streamline knobs are raised by reasoning, not measurement."
//
// So DRAG went 0.4 → 1.0 by argument. The build was not wrong; it was
// UNMEASURED, and nothing in the pipeline could tell the difference.
//
// WHY NOT JUST GIVE IT A SHELL. Because `node whatever.mjs` on the runner is
// arbitrary code execution with the job's environment — the OAuth token, the
// API key, and everything listening on localhost. The secret scan only inspects
// PUBLISHED FILES (docs/LAB-FACTORY.md §11.6 rows 1-2), so a process that can
// open a socket is a channel no gate here will ever see. Bash also un-mitigates
// row 7: with no shell, prompt injection cannot reach git or the network no
// matter how persuasive it is.
//
// WHY THIS IS DIFFERENT, and the distinction is the whole design. The tenant's
// code already executes on every build — lab-smoke.mjs loads index.html in
// headless Chrome. What contains it is not that the agent didn't launch it: it
// is that a BROWSER has no credentials, no filesystem, and a connect-src naming
// seven hosts. This reuses that exact sandbox, from lib/headless.mjs, for a
// second page. No new trust surface: bench.html is walked by
// lab-content-gate.mjs like every other .html in the directory.
//
// THE CONTRACT, which the brief states to the agent:
//
//   1. Write <dir>/bench.html. It runs, it measures, it writes results into the
//      DOM as <div data-labbench="...">, and it stops.
//   2. When it has written everything, it appends <div data-labbench="done">.
//   3. This prints those lines. lab-build.yml hands them to a tuning pass.
//
// (2) IS NOT CEREMONY. Chrome dumps the DOM when the virtual-time budget runs
// out whether the page finished or not, so a sweep cut off at result 4 of 40
// looks exactly like a sweep that found 4 results. Every silent-truncation bug
// in this repo has had that shape. No `done` marker means the report says so.
//
// A BENCH IS INFORMATION, NEVER A VERDICT. This exits 0 when it worked and 2
// when it could not run. It never exits 1, and lab-build.yml never fails a build
// on it. A measurement that can fail a build becomes a thing agents write to
// pass rather than to learn from, and the smoke test already owns "is it
// broken?".

import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { serveTenant, findChrome, chromeArgs, runChrome } from './lib/headless.mjs';

const dir = process.argv[2];
const budgetArg = process.argv.slice(3).find((a) => a.startsWith('--budget='));

if (!dir) {
  console.error('usage: node scripts/lab-bench.mjs <tenant-dir> [--budget=<ms>]');
  process.exit(2);
}

const ci = Boolean(process.env.GITHUB_ACTIONS);
const warn = (m) => console.log(ci ? `::warning::${m}` : `  ! ${m}`);

// NO bench.html IS THE NORMAL CASE, NOT A FAILURE. Most sites never need one.
// Exit quietly so the step is free on the builds that do not use it.
if (!existsSync(join(dir, 'bench.html'))) {
  console.log(`  · no ${dir}/bench.html — nothing to measure`);
  process.exit(0);
}

/** VIRTUAL TIME AND WALL TIME ARE DIFFERENT CLOCKS, and confusing them is the
 *  easy way to write a bench that reports half a sweep.
 *
 *  --virtual-time-budget fast-forwards TIMERS: a setTimeout chain that would
 *  take 30s of wall clock completes almost instantly, and Chrome dumps once the
 *  budget is spent. It does NOT speed up synchronous computation — a solver
 *  grinding through 40 parameter values costs real CPU seconds, and the virtual
 *  clock is paused while it does.
 *
 *  So both limits are generous and they defend different things: the virtual
 *  budget bounds timer-driven work, and the wall timeout is the backstop that
 *  stops a runaway animation loop or an accidental `while(true)` from holding a
 *  build open. */
const VIRTUAL_BUDGET = Number(budgetArg?.split('=')[1]) || 30000;
const WALL_TIMEOUT = 120000;

/** The report goes into a model's context, so it is bounded — and when it is
 *  cut, it SAYS it was cut. */
const MAX_LINES = 200;
const MAX_LINE = 300;
const MAX_TOTAL = 8000;

const site = serveTenant(dir);
const chrome = findChrome();

if (!chrome) {
  warn(`no Chrome on this machine — ${dir}/bench.html was NOT run, so nothing it would have measured is known`);
  process.exit(2);
}

const port = await site.listen();
const profile = mkdtempSync(join(tmpdir(), 'labbench-'));

const run = await runChrome(chrome, [
  ...chromeArgs({ profile, virtualTimeBudget: VIRTUAL_BUDGET }),
  '--dump-dom', `http://127.0.0.1:${port}/bench.html`,
], { timeoutMs: WALL_TIMEOUT });

site.close();

const dom = run.stdout || '';

// SAME THREE-OUTCOME RULE AS THE SMOKE TEST. "Could not measure" must never
// read as "measured nothing", and when it fails it says everything it knows —
// an earlier version of lab-smoke.mjs discarded stderr and two wrong diagnoses
// followed it.
if (!dom.includes('<html')) {
  let version = '(unknown)';
  try { version = execFileSync(chrome, ['--version'], { encoding: 'utf8' }).trim(); } catch { /* ignore */ }
  warn(`THE BENCH DID NOT RUN — Chrome returned no DOM for ${dir}/bench.html.`);
  warn(`browser: ${chrome} — ${version}`);
  warn(`exit=${run.status} stdout=${dom.length}B server-hits=${site.hits}`
    + `${run.timedOut ? ` (killed after ${WALL_TIMEOUT}ms)` : ''}`);
  const e = String(run.error?.message || run.stderr || '').trim().split('\n').slice(-3).join(' | ');
  if (e) warn(`error: ${e.slice(0, 300)}`);
  process.exit(2);
}

const unescape = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();

const results = [];
let done = false;
for (const m of dom.matchAll(/<div data-labbench="([^"]*)"[^>]*>([\s\S]*?)<\/div>/g)) {
  const label = unescape(m[1]);
  const body = unescape(m[2]);
  if (label === 'done') { done = true; continue; }
  results.push(`${label}${body ? `: ${body}` : ''}`.slice(0, MAX_LINE));
}

// The bench page is a page, so it can break like one — and its errors come back
// through the collector lib/headless.mjs already injects. Report them: a bench
// that threw on line 3 explains an empty result list far better than silence.
const faults = [];
for (const m of dom.matchAll(/<div data-labsmoke="([a-z]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
  faults.push(`[${m[1]}] ${unescape(m[2])}`.slice(0, MAX_LINE));
}

console.log('');
if (faults.length) {
  warn(`${dir}/bench.html reported ${faults.length} problem(s) while running:`);
  for (const f of faults.slice(0, 20)) console.log(`      ${f}`);
}

/** A MACHINE-READABLE COUNT, so lab-build.yml never has to guess from prose
 *  whether there is anything to tune from. Grepping the human report for
 *  "result(s)" would also match the sentence saying there were none. */
const marker = (n) => console.log(`BENCH_RESULTS=${n}`);

if (!results.length) {
  warn(`${dir}/bench.html ran but wrote no <div data-labbench="..."> results.`
    + ` Nothing was measured. Check the contract in lab/www/CLAUDE.md.`);
  marker(0);
  process.exit(0);
}

let total = 0;
let shown = 0;
console.log(`  · bench: ${dir}/bench.html reported ${results.length} result(s)`);
for (const r of results.slice(0, MAX_LINES)) {
  if (total + r.length > MAX_TOTAL) break;
  console.log(`      ${r}`);
  total += r.length;
  shown++;
}

// NEVER TRUNCATE IN SILENCE. A short list that looks complete is the failure
// this whole file exists to stop.
if (shown < results.length) {
  warn(`report truncated — showed ${shown} of ${results.length} results`
    + ` (caps: ${MAX_LINES} lines, ${MAX_TOTAL} chars). The rest were measured and discarded here.`);
}

if (!done) {
  warn(`${dir}/bench.html never wrote <div data-labbench="done">, so it was probably CUT OFF`
    + ` after ${VIRTUAL_BUDGET}ms of virtual time${run.timedOut ? ` and ${WALL_TIMEOUT}ms of wall clock` : ''}.`
    + ` Treat the ${results.length} result(s) above as a partial sweep, not a complete one.`);
}

marker(results.length);
process.exit(0);
