#!/usr/bin/env node
// score.mjs — rubric for the `inpac-race` brief.
//
//   node bakeoff/briefs/inpac-race/score.mjs <entry-dir> [--json] [--no-capture]
//
// THIS DELIBERATELY DOES NOT PRODUCE A SCORE OUT OF 100.
//
// The previous brief asked "fix this function", and a single number was the
// right answer. This one asks for a game that looks good, and a single number
// would be a lie: it would rank whoever best satisfied a checklist, which is
// the opposite of the thing being measured. Worse, it would launder a taste
// judgement through arithmetic and come out looking objective.
//
// So there are three tiers and they never add up:
//
//   GATE      binary, machine-checkable. Does it boot, draw, animate, honour
//             the autostart contract, and is the interior gravity actually
//             fixed? Fail any and the entry is out — a beautiful racer you
//             fall through the floor of is not a racer.
//
//   SKELETON  counted, machine-checkable. The four primitives that make it a
//             race and keep entries comparable. Reported as n/4, never summed
//             with anything.
//
//   TASTE     not scored here at all. Filmstrip, live arena iframe, NOTES.md,
//             and an anonymised judge panel — see bakeoff/judge.mjs. A human
//             ranks it.
//
// The gravity checks are imported wholesale from the inpac-gravity brief
// rather than restated, so there is exactly one definition of "the physics is
// right" in this repo.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scoreField } from '../inpac-gravity/score.mjs';

// Physics checks that gate the race. `speed` is dropped — it belonged to a
// brief about a hot inner loop, and a race entry may legitimately spend its
// budget elsewhere. The rest are the difference between a floor and a trap.
const GATING_PHYSICS = ['sign', 'direction', 'uniformity', 'finite', 'symmetry'];

export const GATE = [
  ['boots', 'loads with no uncaught errors'],
  ['draws', 'puts something on screen'],
  ['animated', 'the page is demonstrably alive (frames move, or the clock runs)'],
  ['autostart', 'honours ?autostart=1 with no input'],
  ['physics', 'interior gravity pulls you onto the wall, everywhere'],
];

export const SKELETON = [
  ['clock', 'a race clock that advances'],
  ['laps', 'a circuit: lap and laps exposed, laps ≥ 1'],
  ['best', 'a best time in the state contract'],
  ['intact', 'still a real page: render loop, uses field.mjs, not gutted'],
];

function integrity(entryDir) {
  const htmlPath = join(entryDir, 'index.html');
  if (!existsSync(htmlPath)) return { passed: false, detail: 'index.html missing' };
  const html = readFileSync(htmlPath, 'utf8');
  const problems = [];
  if (!/field\.mjs/.test(html)) problems.push('never references field.mjs');
  if (!/<canvas|getContext|requestAnimationFrame/.test(html)) problems.push('lost its render loop');
  if (html.length < 20_000) problems.push(`shrank to ${html.length} bytes — gutted, not built`);
  return {
    passed: problems.length === 0,
    detail: problems.length ? problems.join('; ') : `${html.length} bytes`,
  };
}

async function physics(entryDir) {
  const modPath = join(entryDir, 'field.mjs');
  if (!existsSync(modPath)) {
    return { passed: false, detail: 'field.mjs not found — the brief requires the interior field extracted into it' };
  }
  let mod;
  try { mod = await import(pathToFileURL(modPath).href + `?t=${Date.now()}`); }
  catch (e) { return { passed: false, detail: `field.mjs failed to import: ${e.message}` }; }

  const field = mod.field ?? mod.default;
  if (typeof field !== 'function') return { passed: false, detail: 'field.mjs exports no `field` function' };

  let res;
  try { res = scoreField(field); }
  catch (e) { return { passed: false, detail: `field() blew up: ${e.message}` }; }

  const failed = GATING_PHYSICS.filter((k) => !res.checks[k]?.passed);
  return {
    passed: failed.length === 0,
    detail: failed.length
      ? failed.map((k) => `${k}: ${res.checks[k].detail}`).join(' | ')
      : 'gravity is correct at every interior sample, all three geometries',
    subChecks: Object.fromEntries(GATING_PHYSICS.map((k) => [k, res.checks[k]?.passed ?? false])),
  };
}

export async function scoreEntry(entryDir, opts = {}) {
  const dir = resolve(entryDir);
  const record = { entryDir: dir, gate: { passed: false, checks: {} }, skeleton: { passed: 0, of: SKELETON.length, checks: {} }, capture: null, notes: null, error: null };

  const notesPath = join(dir, 'NOTES.md');
  if (existsSync(notesPath)) record.notes = readFileSync(notesPath, 'utf8');

  // Everything about liveness comes from one browser session; running it twice
  // would double the slowest part of the whole pipeline for no new evidence.
  let cap = null;
  if (opts.capture !== false) {
    try {
      const { capture } = await import('../../capture.mjs');
      cap = await capture(dir, opts.captureOut);
    } catch (e) {
      record.error = `capture failed to run: ${e.message}`;
    }
  }
  record.capture = cap;

  // A BROWSER THAT NEVER LAUNCHED IS NOT A FAILING ENTRY. If Playwright is
  // missing or Chromium cannot start, every check below goes false and the run
  // reads as "all twelve entries are dead" — the single most misleading result
  // this rig could produce. Flag it as a harness failure so the report says so
  // instead of blaming the agents.
  if (cap && cap.error && !cap.frames.some((f) => f.readable)) {
    record.harnessFailure = `capture never ran: ${cap.error}`;
    record.error = record.harnessFailure;
  }

  const phys = await physics(dir);
  const intact = integrity(dir);

  const g = record.gate.checks;
  g.boots = cap
    ? { passed: !!cap.ok && cap.pageErrors.length === 0, detail: cap.pageErrors[0] || cap.error || 'clean load' }
    : { passed: false, detail: 'not captured' };
  g.draws = cap ? { passed: !!cap.drew, detail: cap.drew ? 'frame has real tonal variation' : 'frame is a flat field of one colour' } : { passed: false, detail: 'not captured' };
  g.animated = cap
    ? {
        passed: !!cap.alive,
        detail: `${((cap.changedFrac || 0) * 100).toFixed(3)}% of pixels moved (peak Δ${cap.maxFrameDelta})`
          + `; race clock ${cap.clockAdvanced ? 'advancing' : 'not advancing'}`,
      }
    : { passed: false, detail: 'not captured' };
  g.autostart = cap
    ? { passed: !!cap.autostarted, detail: cap.autostarted ? 'running with no input' : 'never reported running — ?autostart=1 not honoured, or no __inpacState()' }
    : { passed: false, detail: 'not captured' };
  g.physics = phys;

  record.gate.passed = GATE.every(([k]) => g[k]?.passed);

  const s = record.skeleton.checks;
  const states = (cap?.states || []).filter((x) => !x.missing && !x.threw && !x.badShape);
  const last = states[states.length - 1] || {};
  s.clock = cap
    ? { passed: !!cap.clockAdvanced, detail: cap.clockAdvanced ? 'timeMs advances between frames' : 'timeMs never advanced' }
    : { passed: false, detail: 'not captured' };
  s.laps = {
    passed: typeof last.laps === 'number' && last.laps >= 1 && typeof last.lap === 'number',
    detail: states.length ? `lap=${last.lap} laps=${last.laps}` : 'no state readings',
  };
  s.best = {
    passed: states.length > 0 && (typeof last.bestMs === 'number' || last.bestMs === null),
    // Whether the best time is CORRECT needs a completed lap, which needs
    // someone to actually play. Presence in the contract is what is checkable.
    detail: states.length ? `bestMs=${last.bestMs}` : 'no state readings',
  };
  s.intact = intact;

  record.skeleton.passed = SKELETON.filter(([k]) => s[k]?.passed).length;

  for (const [k, label] of GATE) if (g[k]) g[k].label = label;
  for (const [k, label] of SKELETON) if (s[k]) s[k].label = label;

  return record;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) { console.error('usage: score.mjs <entry-dir> [--json] [--no-capture]'); process.exit(2); }
  const rec = await scoreEntry(dir, {
    capture: !args.includes('--no-capture'),
    // run-cell.sh points this at the cell's output dir so the filmstrip lands
    // beside the entry and travels with the artifact into the arena.
    captureOut: process.env.BAKEOFF_CAPTURE_OUT || undefined,
  });
  if (args.includes('--json')) { console.log(JSON.stringify(rec, null, 2)); }
  else {
    console.log(`\n  ${dir}`);
    console.log(`\n  GATE — ${rec.gate.passed ? 'PASS' : 'FAIL'} (all five required)`);
    for (const [k, label] of GATE) {
      const c = rec.gate.checks[k];
      console.log(`   ${c?.passed ? '✓' : '✗'} ${k.padEnd(10)} ${label}`);
      if (c?.detail) console.log(`       ${c.detail}`);
    }
    console.log(`\n  SKELETON — ${rec.skeleton.passed}/${rec.skeleton.of}`);
    for (const [k, label] of SKELETON) {
      const c = rec.skeleton.checks[k];
      console.log(`   ${c?.passed ? '✓' : '✗'} ${k.padEnd(10)} ${label}`);
      if (c?.detail) console.log(`       ${c.detail}`);
    }
    console.log(`\n  TASTE — not scored here. Arena + judge panel + NOTES.md.`);
    console.log(rec.notes ? `  NOTES.md: ${rec.notes.trim().split('\n')[0].slice(0, 70)}…` : '  NOTES.md: (none written)');
    if (rec.error) console.log(`\n  ERROR: ${rec.error}`);
    console.log();
  }
}
