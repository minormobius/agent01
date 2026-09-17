// telemetry.selftest.mjs — the stats have to be right, and the claims it
// makes about "personality" have to be withheld when the data can't carry
// them. That second part is what most of this file is about.
//
//   node mega/jev/test/telemetry.selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  newTelemetry, record, series, profile, mean, correlation, SIGNALS, engageAggression,
} from '../telemetry.mjs';
import { makeWorld, newRun, applyAnswers, offlineAnswers } from '../delve.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fix = (n) => JSON.parse(readFileSync(join(here, '..', 'fixtures', n), 'utf8'));

let passed = 0;
const failures = [];
const ok = (c, l) => { c ? passed++ : failures.push(l); };
const near = (a, b, eps, l) => ok(a != null && Math.abs(a - b) < eps, `${l} (got ${a}, want ~${b})`);

// ------------------------------------------------------------------ mean ---
near(mean([1, 2, 3]), 2, 1e-9, 'mean of 1,2,3');
ok(mean([]) === null, 'mean of nothing is null, not NaN');
near(mean([1, null, 3, undefined, NaN]), 2, 1e-9, 'mean ignores missing values');

// ----------------------------------------------------------- correlation ---
// known answers
near(correlation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]), 1, 1e-9, 'perfect positive correlation is 1');
near(correlation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]), -1, 1e-9, 'perfect negative correlation is -1');
ok(correlation([1, 2, 3, 4, 5], [5, 5, 5, 5, 5]) === null, 'a constant series yields null, not NaN');
// REGRESSION, with the exact values that produced a false finding in the UI:
// summing (x-mean)^2 over a constant series leaves ~1e-31 of floating-point
// crumbs, so an `=== 0` variance guard misses and the division reports a
// confident r = 1.00 from data that never moved.
{
  const flatDanger = Array(12).fill(1.2666666666666666);
  const flatWithdraw = Array(12).fill(0.18);
  const health = [1, 0.92, 0.92, 0.83, 0.83, 0.75, 0.75, 0.67, 0.67, 0.58, 0.58, 0.5];
  ok(correlation(flatDanger, flatWithdraw) === null,
    'two dead-flat series report no correlation (not r = 1.00)');
  ok(correlation(health, flatWithdraw) === null,
    'a varying series against a flat one reports no correlation (not r = 0.00)');
  ok(correlation(health, health.map((h) => 1 - h)) === -1,
    'a genuinely anti-correlated pair still reports -1');
  // and the clamp: rounding must never push r outside [-1, 1]
  const a = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
  ok(Math.abs(correlation(a, a)) <= 1, 'a series against itself is clamped to exactly 1');
  ok(correlation(a, a) === 1, 'a series against itself is 1');
}
ok(correlation([1, 2], [1, 2]) === null, 'too few pairs yields null');
// Missing sides are skipped, and the minPairs floor applies to what SURVIVES
// the skip — not to the raw array length.
ok(correlation([1, 2, 3, 4, 5, 6], [1, null, 3, null, 5, 6]) === null,
  'only 4 pairs survive the nulls, so it stays below minPairs and returns null');
near(correlation([1, 2, 3, 4, 5, 6, 7], [1, null, 3, 4, 5, 6, 7]), 1, 1e-9,
  '6 surviving pairs are enough, and the nulls are skipped rather than zero-filled');
{
  // r is invariant to linear rescaling — a real property, cheap to check
  const a = [3, 1, 4, 1, 5, 9, 2, 6];
  const b = [2, 7, 1, 8, 2, 8, 1, 8];
  const r1 = correlation(a, b);
  const r2 = correlation(a.map((x) => x * 10 + 3), b.map((x) => x * 2 - 1));
  near(r1, r2, 1e-9, 'r is invariant under linear rescaling');
  ok(r1 >= -1 && r1 <= 1, 'r stays within [-1, 1]');
}

// ---------------------------------------------------------------- record ---
const world = makeWorld(fix('dungeon-seed7-s.json'), fix('content-seed7-s-roll1.json'));
{
  const tel = newTelemetry();
  const run = newRun(world, { seed: 2 });
  record(tel, {
    tick: 0, run, world, latencyMs: 180, source: 'typesafe', inputTokens: 1200,
    answers: {
      move: { type: 'choice', choice: 'to_88', probabilities: {}, confidence: 0.9 },
      danger: { type: 'score', score: 1.5, probabilities: {} },
      engage: { type: 'choice', choice: 'melee', probabilities: { melee: 0.7, shoot: 0.2, avoid: 0.1 }, confidence: 0.8 },
      take_loot: { type: 'noul', noul: 0.8 },
      withdraw: { type: 'noul', noul: 0.1 },
    },
  });
  const s = tel.samples[0];
  ok(s.danger === 1.5 && s.confidence === 0.9, 'answers are recorded verbatim');
  ok(s.take_loot === 0.8 && s.withdraw === 0.1, 'every noul is kept');
  ok(Math.abs(s.aggression - 0.9) < 1e-9,
    'aggression is the probability mass on acting (melee + shoot), read off the typed distribution');
  ok(s.engage === 'melee', 'the engage pick itself is kept alongside the derived scalar');
  ok(s.health === run.maxHp && s.depth === 0, 'world truth is recorded alongside');
  ok(s.source === 'typesafe' && s.latencyMs === 180, 'provenance and latency are kept');

  // a tick with NO answers must not poison the series with NaN
  record(tel, { tick: 1, run, world, answers: {} });
  const s2 = series(tel);
  ok(s2.danger[1] === null, 'a missing answer records null, not undefined or NaN');
  ok(mean(s2.danger) === 1.5, 'means skip the null rather than dividing by it');
}

// ---------------------------------------------------------------- series ---
{
  const tel = newTelemetry();
  const run = newRun(world, { seed: 3 });
  for (let t = 0; t < 6; t++) {
    const resp = offlineAnswers(world, run);
    record(tel, { tick: t, run, world, answers: resp.answers, inputTokens: 100 });
    applyAnswers(world, run, resp.answers);
  }
  const s = series(tel);
  ok(s.tick.length === 6, 'one sample per tick');
  for (const sig of SIGNALS) {
    ok(Array.isArray(s[sig.key]) && s[sig.key].length === 6, `series carries ${sig.key}`);
  }
  ok(s.tick.every((v, i) => i === 0 || v >= s.tick[i - 1]), 'ticks are non-decreasing');
  ok(s.health.every((v) => v >= 0 && v <= run.maxHp), 'health series stays in range');
  ok(s.danger.every((v) => v === null || (v >= 0 && v <= 3)), 'danger stays on its declared scale');
  for (const k of ['aggression', 'take_loot', 'withdraw', 'confidence']) {
    ok(s[k].every((v) => v === null || (v >= 0 && v <= 1)), `${k} stays within 0..1`);
  }
  ok(s.level.every((v) => v === null || v >= 1), 'level never drops below 1');
}

// ------------------------------------------------- the derived aggression ---
// `engage` is a choice, so "how aggressive" has to be derived from the typed
// distribution rather than read off a noul. It must never invent a number.
{
  ok(engageAggression(null) === null, 'no engage answer yields null, not 0');
  // 0.6 + 0.3 is 0.8999999999999999 in binary floating point, so compare with
  // a tolerance rather than ===. Rounding inside the implementation would
  // throw away precision that the means and correlations want.
  near(engageAggression({ choice: 'melee', probabilities: { melee: 0.6, shoot: 0.3, avoid: 0.1 } }), 0.9, 1e-9,
    'aggression sums melee and shoot');
  ok(engageAggression({ choice: 'avoid', probabilities: { melee: 0, avoid: 1 } }) === 0,
    'pure avoidance is zero');
  ok(engageAggression({ choice: 'shoot' }) === 1, 'with no distribution it falls back to the pick');
  ok(engageAggression({ choice: 'avoid' }) === 0, 'the fallback reads avoid as zero');
  ok(engageAggression({ choice: 'melee', probabilities: {} }) === 0,
    'an empty distribution sums to zero rather than NaN');
}

// --------------------------------------------------- the profile's honesty ---
// This is the part that matters. The profile must refuse to characterise a
// run it cannot support, and must never emit NaN into the UI.
{
  const empty = profile(newTelemetry());
  ok(empty.n === 0, 'an empty run reports n = 0');
  ok(/too few/i.test(empty.caveat), 'an empty run says outright that it is too few');
  ok(/not enough/i.test(empty.summary), 'an empty run refuses to summarise');
  ok(empty.findings.length === 0, 'no correlations are claimed from nothing');
  ok(empty.traits.every((t) => t.value === null || Number.isFinite(t.value)),
    'no trait is NaN on an empty run');
  ok(!JSON.stringify(empty).includes('NaN'), 'nothing in an empty profile serialises as NaN');
}
{
  // 4 decisions: still below the bar for both the summary and any correlation
  const tel = newTelemetry();
  const run = newRun(world, { seed: 4 });
  for (let t = 0; t < 4; t++) {
    const resp = offlineAnswers(world, run);
    record(tel, { tick: t, run, world, answers: resp.answers });
    applyAnswers(world, run, resp.answers);
  }
  const p = profile(tel);
  ok(p.n === 4, 'n is the sample count');
  ok(/too few/i.test(p.caveat), '4 decisions is still declared too few');
  ok(/not enough/i.test(p.summary), 'no summary sentence is offered at n = 4');
  ok(p.findings.length === 0, 'no correlation is reported below minPairs');
}
{
  // a long run: now it may speak, but must still carry n and the caveat
  const tel = newTelemetry();
  const run = newRun(world, { seed: 7 });
  for (let t = 0; t < 40 && run.status === 'delving'; t++) {
    const resp = offlineAnswers(world, run);
    record(tel, { tick: t, run, world, answers: resp.answers, latencyMs: 150 + t, inputTokens: 1000 });
    applyAnswers(world, run, resp.answers);
  }
  const p = profile(tel);
  ok(p.n >= 8, `the long run produced enough samples (${p.n})`);
  ok(/this run/i.test(p.caveat), 'the caveat scopes the claim to this run');
  ok(!/not enough/i.test(p.summary), 'a summary is offered once there is data');
  ok(p.summary.includes(String(p.n)), 'the summary states how many decisions it is based on');
  ok(p.traits.every((t) => t.n === p.n), 'every trait carries its sample size');
  ok(p.traits.every((t) => t.value === null || (t.value >= 0 && t.value <= 1)),
    'every trait is normalised to 0..1');
  ok(p.traits.every((t) => typeof t.band === 'string' && t.band !== ''), 'every trait has a band word');
  ok(p.median_latency_ms !== null, 'median latency is computed');
  ok(p.total_input_tokens > 0, 'input tokens are totalled');
  ok(!JSON.stringify(p).includes('NaN'), 'no NaN reaches the UI');
  for (const f of p.findings) {
    ok(f.r >= -1 && f.r <= 1, `finding ${f.key}: r within [-1,1]`);
    ok(f.text.includes(f.r.toFixed(2)), `finding ${f.key}: the text quotes the r it is based on`);
  }
}
{
  // a trait whose signal never varies must not produce a correlation claim
  const tel = newTelemetry();
  const run = newRun(world, { seed: 9 });
  for (let t = 0; t < 12; t++) {
    record(tel, {
      tick: t, run, world,
      answers: {
        move: { type: 'choice', choice: 'hold', probabilities: {}, confidence: 0.5 },
        danger: { type: 'score', score: 1, probabilities: {} },
        engage: { type: 'choice', choice: 'avoid', probabilities: { melee: 0.5, avoid: 0.5 }, confidence: 0.5 },
        take_loot: { type: 'noul', noul: 0.5 },
        withdraw: { type: 'noul', noul: 0.5 }, // dead flat
      },
    });
  }
  const p = profile(tel);
  ok(p.findings.every((f) => f.key !== 'self_preservation'),
    'a flat withdraw signal yields no self-preservation claim');
}

if (failures.length) {
  console.error(`✗ telemetry selftest: ${failures.length} failure(s) of ${passed + failures.length}\n`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`✓ telemetry selftest: ${passed} checks passed`);
