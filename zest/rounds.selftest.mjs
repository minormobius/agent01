#!/usr/bin/env node
// zest/rounds.selftest.mjs — run: node zest/rounds.selftest.mjs
//
// The scoreboard makes a statistical claim ("you are reading the geometry"), so
// the statistics behind it have to be right. The binomial tail is checked
// against known answers, and the whole scorer is checked against SIMULATED
// players — a guesser must fail to beat chance, a perfect reader must beat it,
// and the false-positive rate of the "you are reading it" verdict must sit at
// the nominal 5%.

import {
  cos, thresholdForFraction, buildRound, scoreRound, binomTailAtLeast,
  comboMultiplier, verdict,
} from './rounds.js';

let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m + (e !== undefined ? '  — ' + e : '')); } };
const approx = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, m, `${a} vs ${b}`);
const section = (s) => console.log('\n' + s);

let seed = 12345;
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

section('§1  the binomial tail, against hand-computable answers');
{
  approx(binomTailAtLeast(1, 1, 0.5), 0.5, 1e-12, 'P(X≥1) for n=1 p=0.5');
  approx(binomTailAtLeast(2, 2, 0.5), 0.25, 1e-12, 'P(X≥2) for n=2 p=0.5');
  approx(binomTailAtLeast(1, 2, 0.5), 0.75, 1e-12, 'P(X≥1) for n=2 p=0.5');
  approx(binomTailAtLeast(3, 3, 1 / 3), 1 / 27, 1e-12, 'P(X≥3) for n=3 p=1/3');
  approx(binomTailAtLeast(5, 10, 0.5), 0.623046875, 1e-12, 'P(X≥5) for n=10 p=0.5');
  approx(binomTailAtLeast(10, 10, 0.3), Math.pow(0.3, 10), 1e-15, 'P(X≥n) is p^n');
  ok(binomTailAtLeast(0, 10, 0.3) === 1, 'P(X≥0) = 1');
  ok(binomTailAtLeast(11, 10, 0.3) === 0, 'P(X≥n+1) = 0');
  ok(binomTailAtLeast(3, 0, 0.3) === 1, 'no trials → no evidence');
  // monotone in k, and never escapes [0,1]
  let mono = true, prev = 2;
  for (let k = 0; k <= 40; k++) {
    const v = binomTailAtLeast(k, 40, 0.37);
    if (v > prev + 1e-12 || v < 0 || v > 1) mono = false;
    prev = v;
  }
  ok(mono, 'the tail is monotone decreasing in k and stays in [0,1]');
  // large n must not underflow into nonsense
  ok(Number.isFinite(binomTailAtLeast(300, 1000, 0.3)), 'survives n = 1000');
}

section('§2  the threshold is a quantile, so rounds are never impossible');
{
  const sims = Array.from({ length: 200 }, (_, i) => i / 200);
  for (const f of [0.1, 0.25, 0.3, 0.5, 0.9]) {
    const tau = thresholdForFraction(sims, f);
    const got = sims.filter((s) => s >= tau).length / sims.length;
    ok(Math.abs(got - f) < 0.02, `τ makes ~${(f * 100).toFixed(0)}% of the pool ripe`, got.toFixed(3));
  }
  ok(thresholdForFraction([], 0.3) === 1, 'an empty pool yields an unreachable τ rather than NaN');
  const flat = new Array(50).fill(0.5);
  ok(Number.isFinite(thresholdForFraction(flat, 0.3)), 'a degenerate pool does not produce NaN');
}

section('§3  round construction: playable, balanced, honest base rate');
{
  const items = Array.from({ length: 120 }, (_, i) => {
    const u = new Float64Array(16);
    for (let d = 0; d < 16; d++) u[d] = Math.sin(i * 0.7 + d) + rng() * 0.6;
    return { id: 'p' + i, unit: u };
  });

  for (let t = 0; t < 40; t++) {
    const r = buildRound(items, { ripeFraction: 0.3, size: 20, rng });
    ok(r.items.length === 20, 'round is the requested size', r.items.length);
    ok(r.ripeCount >= 2 && r.ripeCount <= r.total - 2, 'both kinds are present', `${r.ripeCount}/${r.total}`);
    approx(r.baseRate, r.ripeCount / r.total, 1e-12, 'reported base rate matches the items');
    ok(!r.items.some((x) => x.item.id === r.anchor.id), 'the anchor never falls in its own round');
    ok(r.gap > 0, 'the chosen anchor separates ripe from unripe');
    // every ripe item really is above τ
    ok(r.items.every((x) => x.ripe === (x.sim >= r.tau)), 'ripeness is exactly “sim ≥ τ”');
  }

  ok(buildRound(items, { size: 500, rng }).items.length <= items.length - 1, 'size is capped by the pool');
  let threw = false;
  try { buildRound([{ id: 'a', unit: new Float64Array(4) }], { rng }); } catch { threw = true; }
  ok(threw, 'too small a pool is an error, not a broken round');
}

section('§4  the scorer, and the confusion matrix it is built on');
{
  const s = scoreRound([
    { ripe: true, sliced: true }, { ripe: true, sliced: true },
    { ripe: true, sliced: false },
    { ripe: false, sliced: true },
    { ripe: false, sliced: false }, { ripe: false, sliced: false },
  ]);
  ok(s.hits === 2 && s.misses === 1 && s.falseAlarms === 1 && s.correctRejections === 2, 'confusion matrix',
    `${s.hits}/${s.misses}/${s.falseAlarms}/${s.correctRejections}`);
  approx(s.precision, 2 / 3, 1e-12, 'precision = hits / sliced');
  approx(s.recall, 2 / 3, 1e-12, 'recall = hits / ripe');
  approx(s.baseRate, 0.5, 1e-12, 'base rate = ripe / total');
  approx(s.accuracy, 4 / 6, 1e-12, 'accuracy over all decisions');
  approx(s.lift, (2 / 3) / 0.5, 1e-12, 'lift = precision / base rate');

  const none = scoreRound([{ ripe: true, sliced: false }, { ripe: false, sliced: false }]);
  ok(none.pValue === 1 && none.precision === 0, 'slicing nothing is no evidence of anything');
  ok(verdict(none).tone === 'thin', 'and the verdict says so rather than claiming a perfect record');

  const empty = scoreRound([]);
  ok(Number.isFinite(empty.score) && empty.pValue === 1, 'an empty round does not produce NaN');
}

section('§5  SIMULATED PLAYERS — the verdict has to be earned');
{
  const mkPlays = (n, baseRate, skill) => {
    // skill 0 = slices at random; skill 1 = slices exactly the ripe ones.
    const plays = [];
    for (let i = 0; i < n; i++) {
      const ripe = rng() < baseRate;
      const correct = rng() < skill;
      const sliced = correct ? ripe : rng() < 0.4;
      plays.push({ ripe, sliced });
    }
    return plays;
  };

  // A guesser must not be told they are reading the geometry, more than ~5% of
  // the time. That 5% is the significance level, and seeing it come out at the
  // nominal rate is the check that the test is calibrated rather than decorative.
  let falsePositives = 0;
  const TRIALS = 600;
  for (let t = 0; t < TRIALS; t++) {
    const plays = mkPlays(30, 0.3, 0);
    if (scoreRound(plays).beatChance) falsePositives++;
  }
  const rate = falsePositives / TRIALS;
  ok(rate < 0.09, 'a guesser is called out as a guesser (false-positive rate ≈ α)', (rate * 100).toFixed(1) + '%');

  // A perfect reader must be recognised essentially always.
  let detected = 0;
  for (let t = 0; t < 200; t++) {
    const plays = mkPlays(30, 0.3, 1);
    if (scoreRound(plays).beatChance) detected++;
  }
  ok(detected / 200 > 0.95, 'a perfect reader is recognised', (detected / 2).toFixed(1) + '%');

  // And the verdict text must match the verdict flag, always.
  let consistent = true;
  for (let t = 0; t < 300; t++) {
    const s = scoreRound(mkPlays(24, 0.3, rng()));
    const v = verdict(s);
    if (s.sliced >= 4 && s.beatChance && v.tone !== 'read') consistent = false;
    if (s.sliced >= 4 && !s.beatChance && v.tone !== 'chance') consistent = false;
    // Any verdict that makes a claim must show the number behind it. The
    // 'thin' verdict is the one that is allowed to have no number, because
    // refusing to quantify too few slices is the correct answer there.
    if (v.tone !== 'thin' && !/\d/.test(v.text)) consistent = false;
  }
  ok(consistent, 'the words on screen always agree with the arithmetic');
}

section('§6  combo, and cosine');
{
  ok(comboMultiplier(0) === 1 && comboMultiplier(2) === 1, 'no multiplier below a 3 streak');
  ok(comboMultiplier(3) === 2 && comboMultiplier(6) === 3 && comboMultiplier(10) === 4, 'multiplier steps');
  let nonDecreasing = true, prev = 0;
  for (let i = 0; i < 40; i++) { const m = comboMultiplier(i); if (m < prev) nonDecreasing = false; prev = m; }
  ok(nonDecreasing, 'the multiplier never goes down as the streak grows');

  const a = Float64Array.from([1, 0, 0]), b = Float64Array.from([0, 1, 0]);
  approx(cos(a, a), 1, 1e-12, 'cos(a,a) = 1');
  approx(cos(a, b), 0, 1e-12, 'orthogonal vectors read 0');
  approx(cos(a, Float64Array.from([-1, 0, 0])), -1, 1e-12, 'opposed vectors read −1');
  ok(cos(a, new Float64Array(3)) === 0, 'a zero vector is not a divide-by-zero');
  approx(cos(Float64Array.from([2, 0, 0]), a), 1, 1e-12, 'cosine ignores scale');
}

console.log(`\n${fail === 0 ? '✓' : '✗'} zest/rounds — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
