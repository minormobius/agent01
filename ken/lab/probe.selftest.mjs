/* ken/lab/probe.selftest.mjs — known answers for the attenuation probe.

   The simulation here is the R13 pass on H8, and it corrected the design
   by a factor of six: one chain run does not identify lambda. Every
   number the register quotes for H8 is regenerated and compared, so the
   hypothesis cannot drift from the simulator that priced it. */

import {
  RESIDUES, recall, fitLambda, simulateChain, simulateFit, costToPin,
} from './probe.mjs';
import { HYPOTHESES } from '../graph/hypotheses.mjs';
import { mulberry32 } from '../graph/rng.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log(`  ✗ ${m}`); } };
const near = (a, b, t, m) => ok(Math.abs(a - b) <= t, `${m} (got ${a}, want ${b}±${t})`);
const section = (s) => console.log(`\n${s}`);

// ── 1. a residue must satisfy all four properties ─────────────────────
section('what counts as a residue');

ok(Object.keys(RESIDUES).length === 3, 'three residue kinds are specified');
for (const [key, r] of Object.entries(RESIDUES)) {
  for (const f of ['name', 'how', 'incidental', 'loadBearing', 'scoring', 'guessable']) {
    ok(typeof r[f] === 'string' && r[f].length > 10, `${key} states its ${f}`);
  }
  ok(/set overlap|transcript|tool log/.test(r.scoring),
    `${key} is scored without a judge, so B3 stays off the critical path`);
}

// ── 2. recall is set overlap, and says so when it cannot score ────────
section('recall');

ok(recall(['a', 'b'], ['a', 'b', 'c']).recall === 2 / 3, 'two of three recalled is 0.667');
ok(recall([], ['a', 'b']).recall === 0, 'nothing recalled is 0');
ok(recall(['a', 'a', 'b'], ['a', 'b']).recall === 1, 'duplicates in the report do not inflate it');
ok(recall(['x', 'y'], ['a', 'b']).recall === 0, 'wrong answers score nothing rather than partial credit');
ok(recall(['a'], []) === null, 'an empty truth set cannot be scored and returns null');
ok(recall(['a', 'b', 'c'], ['a']).recall === 1,
  'over-reporting is not penalised here — precision is a separate quantity and is not what lambda needs');

// ── 3. the estimator, including where it refuses ──────────────────────
section('fitting lambda');

// exact data: recall(d) = f + (1-f) lam^(d-1)
{
  const f = 0.2, lam = 0.5;
  const pts = [1, 2, 3, 4, 5, 6].map((d) => ({ depth: d, recall: f + (1 - f) * lam ** (d - 1) }));
  near(fitLambda(pts, f).lambda, lam, 1e-3, 'on exact data the fit returns lambda');
  near(fitLambda(pts.map((p) => ({ ...p })), f).lambda, 0.5, 1e-3, 'and is stable');
}
for (const lam of [0.3, 0.6, 0.9]) {
  const f = 0.15;
  const pts = [1, 2, 3, 4, 5, 6].map((d) => ({ depth: d, recall: f + (1 - f) * lam ** (d - 1) }));
  near(fitLambda(pts, f).lambda, lam, 2e-3, `exact recovery at lambda ${lam}`);
}

// THE FLOOR IS NOT OPTIONAL. Fitting against zero when the floor is real
// inflates lambda, which is the quiet version of the pi failure.
{
  const f = 0.3, lam = 0.4;
  const pts = [1, 2, 3, 4, 5, 6].map((d) => ({ depth: d, recall: f + (1 - f) * lam ** (d - 1) }));
  const right = fitLambda(pts, f).lambda;
  const wrong = fitLambda(pts, 0).lambda;
  near(right, lam, 2e-3, 'with the floor supplied the fit is right');
  ok(wrong > right + 0.15,
    `ignoring a floor of ${f} inflates lambda from ${right} to ${wrong}, which is the failure the floor arm prevents`);
}

// it refuses rather than inventing a number
ok(fitLambda([{ depth: 1, recall: 1 }], 0.2).lambda === null,
  'depth 1 alone carries no information about lambda and the fit says so');
ok(/not identified/.test(fitLambda([{ depth: 1, recall: 1 }], 0.2).reason),
  'and names the reason');
ok(fitLambda([{ depth: 2, recall: 0.1 }, { depth: 3, recall: 0.1 }], 0.2).lambda === null,
  'recall at or below the floor is unusable and returns null rather than a plausible value');
ok(fitLambda([{ depth: 2, recall: 0.5 }], 1.2).lambda === null, 'a floor outside [0,1) is refused');

// ── 4. the simulation that priced H8, and corrected it ────────────────
section('the R13 pass');

// determinism, since the register quotes these
{
  const a = simulateFit({ trials: 300, seed: 4 });
  const b = simulateFit({ trials: 300, seed: 4 });
  ok(a.median === b.median && a.width === b.width, 'the simulation is deterministic in its seed');
  ok(simulateFit({ trials: 300, seed: 5 }).median !== a.median, 'and a different seed moves it');
}

/* THE CORRECTION. H8's first version claimed one chain run. It does not
   identify lambda: 6% of single-chain replications fail outright and the
   interval is nearly as wide as the parameter. */
{
  const one = simulateFit({ k: 10, chains: 1, trials: 1500, seed: 11 });
  ok(one.width > 0.3, `one chain gives a 95% width above 0.3 (got ${one.width})`);
  ok(one.unidentified > 20, `and fails to identify lambda in ${one.unidentified} of 1500 replications`);

  const six = simulateFit({ k: 40, chains: 6, floorK: 240, trials: 1500, seed: 13 });
  ok(six.width < 0.22, `six chains at k=40 reach a width under 0.22 (got ${six.width})`);
  ok(six.unidentified === 0, 'and always identify it');
  ok(Math.abs(six.bias) < 0.03, `with bias under 0.03 (got ${six.bias})`);
}

/* DEPTH BEYOND SIX HURTS, which is the opposite of what a geometric fit
   would suggest. Recall reaches the floor and the extra points are noise
   that drags the slope. */
{
  const d6 = simulateFit({ k: 20, chains: 3, depth: 6, floorK: 60, trials: 1500, seed: 9 });
  const d12 = simulateFit({ k: 20, chains: 3, depth: 12, floorK: 60, trials: 1500, seed: 9 });
  ok(d12.width > d6.width, `depth 12 is WIDER than depth 6 (${d12.width} against ${d6.width})`);
  ok(d12.bias > d6.bias + 0.03, `and more biased (${d12.bias} against ${d6.bias})`);
}

/* THE INSTRUMENT IS BIASED UPWARD AT LOW LAMBDA and precise at high
   lambda. That asymmetry is the honest characterisation and it is what
   makes H8 a threshold test rather than an estimator. */
{
  const low = simulateFit({ lambda: 0.2, k: 20, chains: 3, floorK: 60, trials: 1500, seed: 7 });
  const high = simulateFit({ lambda: 0.95, k: 20, chains: 3, floorK: 60, trials: 1500, seed: 7 });
  ok(low.bias > 0.1, `at true lambda 0.2 the estimate is biased up by ${low.bias}`);
  ok(low.unidentified > 100, `and ${low.unidentified} of 1500 replications fail to identify it`);
  ok(high.width < 0.1, `at true lambda 0.95 the width is ${high.width}`);
  ok(Math.abs(high.bias) < 0.02, 'and it is nearly unbiased there');
  ok(high.width < low.width / 3, 'the instrument is far sharper at the high end than the low');
}

// what it does well: ruling out the regime where skips are worthless
for (const lambda of [0.3, 0.5, 0.7]) {
  const s = simulateFit({ lambda, k: 20, chains: 3, depth: 8, floorK: 60, trials: 1500, seed: 21 });
  ok(s.hi < 0.9, `true lambda ${lambda}: the interval excludes 0.9, so "skips are worthless" is refutable`);
}

// costToPin returns a ladder and names the first design that gets there
{
  const c = costToPin({ target: 0.25 });
  ok(c.rows.length >= 5, 'the cost ladder tries several designs');
  ok(c.rows.every((r, i) => i === 0 || r.turns > c.rows[i - 1].turns), 'ordered by turns');
  ok(c.enough === null || c.enough.width <= 0.25, 'and the named design meets the target if one does');
}

// ── 5. the register quotes the simulator ──────────────────────────────
section('H8 agrees with what priced it');

ok(/THIRTY-SIX TURNS/.test(HYPOTHESES.H8.cost), 'H8 states thirty-six turns rather than one');
ok(/0\.36/.test(HYPOTHESES.H8.cost), 'and quotes the single-chain width');
ok(/0\.19/.test(HYPOTHESES.H8.cost), 'and the six-chain width');
ok(/HURTS/.test(HYPOTHESES.H8.cost), 'and records that depth beyond six hurts');
ok(/no brief anywhere names the residue/.test(HYPOTHESES.H8.requires),
  'H8 requires that no brief names the residue, which is the pi failure');
ok(HYPOTHESES.H8.refutedBy.some((r) => /floor arm scores as well/.test(r)),
  'and loses if the floor arm scores as well as the descendants');
ok(HYPOTHESES.H8.predicts.some((p) => /floor is well above zero/.test(p[0])),
  'and predicts a non-zero floor, since no real residue is unguessable');

console.log(`\n${fail === 0 ? '✓' : '✗'} probe ${fail === 0 ? 'passed' : 'FAILED'} — ${fail === 0 ? pass : `${fail} of ${pass + fail}`} checks`);
process.exit(fail === 0 ? 0 : 1);
