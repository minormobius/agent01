/* ken/lab/equivalence.selftest.mjs — known answers for the exchange rate.

   The model is four lines of algebra, so most of what follows is checkable
   by hand and is written that way: closed forms first, then the claims WP3
   makes about the parameter space, then the R13 pass on H9.

   The claim this file exists to defend is the one that would be easiest to
   fudge: that an unattended chain has a floor and a directed one does not.
   It is asserted at both ends and in the middle. */

import {
  survival, residue, density, exchangeRate, curve, grid, bandFor,
  PARAMETERS, ILLUSTRATIVE, DIRECTED_LAMBDA,
} from '../graph/equivalence.mjs';
import { seededRun, estimate, simulateSeeded, costLadder, verdictOf, VERDICTS } from './seeded.mjs';
import { HYPOTHESES } from '../graph/hypotheses.mjs';
import { mulberry32 } from '../graph/rng.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log(`  ✗ ${m}`); } };
const near = (a, b, t, m) => ok(Math.abs(a - b) <= t, `${m} (got ${a}, want ${b}±${t})`);
const section = (s) => console.log(`\n${s}`);

// ── 1. survival, against closed forms ─────────────────────────────────
section('survival');

ok(survival(0, { q: 0.5, lambda: 0.6 }) === 1, 'a defect with nothing downstream survives with certainty');
near(survival(1, { q: 0.4, lambda: 0.6 }), 0.6, 1e-12, 'one downstream turn: 1 - q');
near(survival(2, { q: 0.4, lambda: 0.5 }), 0.6 * 0.8, 1e-12, 'two turns: (1-q)(1-q lambda)');
near(survival(3, { q: 0.5, lambda: 0.5 }), 0.5 * 0.75 * 0.875, 1e-12, 'three turns, by hand');
// at lambda = 1 every chance is worth the same, so it is a plain geometric
for (const m of [1, 3, 7]) {
  near(survival(m, { q: 0.3, lambda: 1 }), 0.7 ** m, 1e-12, `lambda = 1 gives (1-q)^${m}`);
}
// at lambda = 0 only the immediate successor can see anything at all
near(survival(9, { q: 0.4, lambda: 0 }), 0.6, 1e-12, 'lambda = 0: only the next turn ever gets a chance');

ok(survival(4, { q: 0.5, lambda: 0.6 }) < survival(3, { q: 0.5, lambda: 0.6 }), 'survival falls with more turns');
let threw = 0;
for (const bad of [{ q: 1.4, lambda: 0.5 }, { q: 0.5, lambda: -0.1 }, { q: NaN, lambda: 0.5 }]) {
  try { survival(2, bad); } catch { threw++; }
}
ok(threw === 3, 'a rate outside [0,1] is refused rather than clamped');

// ── 2. THE FLOOR. The paper's central asymmetry. ──────────────────────
section('the floor');

ok(residue({ q: 0.5, lambda: 1 }) === 0, 'AT LAMBDA 1 THERE IS NO FLOOR — a directed chain can reach zero');
for (const lambda of [0.1, 0.4, 0.6, 0.9, 0.99]) {
  const f = residue({ q: 0.5, lambda });
  ok(f > 0, `AT LAMBDA ${lambda} THE FLOOR IS POSITIVE (${f}) — an unattended chain cannot`);
  ok(f < 1, `and under 1 at lambda ${lambda}`);
}
// the floor rises as either rate falls: less context, or a weaker gate
ok(residue({ q: 0.5, lambda: 0.3 }) > residue({ q: 0.5, lambda: 0.8 }), 'a lossier handoff leaves a higher floor');
ok(residue({ q: 0.3, lambda: 0.6 }) > residue({ q: 0.7, lambda: 0.6 }), 'a weaker gate leaves a higher floor');
ok(residue({ q: 0, lambda: 0.6 }) === 1, 'a gate that catches nothing removes nothing');
// lambda = 0: the product is a single factor, so the floor is exactly 1 - q
near(residue({ q: 0.35, lambda: 0 }), 0.65, 1e-9, 'at lambda 0 the floor is exactly 1 - q');
// density converges DOWN to the floor and never crosses it
{
  const args = { q: 0.45, lambda: 0.6 };
  const f = residue(args);
  const ds = [1, 2, 5, 10, 40, 200].map((n) => density(n, args));
  ok(ds.every((d, i) => i === 0 || d < ds[i - 1]), 'density falls monotonically with chain length');
  ok(ds.every((d) => d >= f - 1e-9), 'and never goes under the floor');
  ok(ds[ds.length - 1] - f < 0.02, 'and approaches it');
  ok(density(1, args) === 1, 'one turn has had no chances, so its density is r itself');
}

// ── 3. the exchange rate, including where it does not exist ───────────
section('the exchange rate');

{
  const r = exchangeRate();
  ok(r.n === 7, `the illustrative point costs 7 unattended turns (got ${r.n})`);
  ok(r.reachable && r.reason === null, 'and is reachable');
  ok(r.floor < r.target, 'because the floor is under the target');
}
{
  // both rates low: the floor sits above what three directed turns reach
  const r = exchangeRate({ lambda: 0.2, g: 0.3 });
  ok(r.n === null, 'at lambda 0.2 and g 0.3 NO number of unattended turns suffices');
  ok(r.reachable === false, 'and it says so structurally rather than by running out of patience');
  ok(/no number of turns/.test(r.reason), 'and names why');
  ok(r.floor > r.target, 'the floor is above the target, which is the whole reason');
}
// a gate as good as the person, with no loss, must need exactly as many turns
{
  const r = exchangeRate({ lambda: 1, g: 0.6, h: 0.6, directedTurns: 4 });
  ok(r.n === 4, `matched rates and no attenuation cost exactly the directed count (got ${r.n})`);
}
// more directed turns to match is never cheaper
{
  const ns = [1, 2, 3, 4, 5].map((d) => exchangeRate({ directedTurns: d }).n);
  ok(ns.every((n, i) => i === 0 || n === null || ns[i - 1] === null || n >= ns[i - 1]),
    `matching more directed turns never costs fewer unattended ones (${ns.join(', ')})`);
}
// monotone in each rate, which is what makes the boundary a curve
{
  const better = exchangeRate({ lambda: 0.6, g: 0.6 }).n;
  const worse = exchangeRate({ lambda: 0.6, g: 0.4 }).n;
  ok(better < worse, `a better gate needs fewer turns (${better} against ${worse})`);
  ok(exchangeRate({ lambda: 0.9, g: 0.45 }).n < exchangeRate({ lambda: 0.3, g: 0.45 }).n,
    'and so does a better handoff');
}

// ── 4. WP3's claims about the space ───────────────────────────────────
section('what the paper says about the parameter space');

{
  /* THE HEADLINE: a third of the plausible space is unreachable. WP3
     quotes 30.5% and the sweep here is the one it quotes. */
  let never = 0, total = 0;
  for (let i = 1; i <= 19; i++) {
    for (let j = 1; j <= 19; j++) {
      total++;
      const lambda = Number((i * 0.05).toFixed(2)), g = Number((j * 0.05).toFixed(2));
      if (!exchangeRate({ lambda, g }).reachable) never++;
    }
  }
  ok(total === 361, 'the sweep is 19 by 19');
  ok(never === 110, `110 of 361 cells are never (got ${never})`);
  near(never / total, 0.305, 5e-4, 'which is the 30.5% WP3 quotes');
}
{
  /* WHY SIX FEELS RIGHT, tested rather than adopted: six is a claim about
     the catch rate and says almost nothing about attenuation. */
  const b = bandFor();
  ok(b.gRange[0] === 0.3 && b.gRange[1] === 0.7,
    `the five-to-seven band spans g from 0.30 to 0.70 (got ${b.gRange.join(' to ')})`);
  ok(b.lambdaRange[0] <= 0.05 && b.lambdaRange[1] >= 0.95,
    'and essentially the whole range of lambda');
  const six = b.hits.filter((x) => x.n === 6);
  const gs = six.map((x) => x.g);
  ok(Math.min(...gs) === 0.35 && Math.max(...gs) === 0.65,
    `exactly six spans g from 0.35 to 0.65 (got ${Math.min(...gs)} to ${Math.max(...gs)})`);
  ok(new Set(six.map((x) => x.lambda)).size > 10, 'across many values of lambda');
}
{
  // the substitution WP3 turns into an engineering claim
  ok(exchangeRate({ lambda: 0.4, g: 0.35 }).n === null, 'g 0.35 at lambda 0.4 is never');
  ok(exchangeRate({ lambda: 0.8, g: 0.35 }).n === 8,
    'THE SAME GATE at lambda 0.8 costs 8 turns — briefing rescues a weak gate');
}
{
  const g = grid();
  ok(g.length === 5 && g[0].cells.length === 5, 'the published grid is 5 by 5');
  ok(g.some((r) => r.cells.some((c) => c.n === null)), 'and it contains never cells, which is the point');
}
{
  const c = curve({ upTo: 10 });
  ok(c.rows.length === 10 && c.rows[0].automated === 1 && c.rows[0].directed === 1,
    'both arms start at density 1, having had no chances');
  ok(c.rows.every((r) => r.directed <= r.automated + 1e-12),
    'the directed arm is never worse at equal length, since h > g and its context does not decay');
  ok(c.rows[9].automated - c.floor < c.rows[3].automated - c.floor,
    'and the unattended arm is closing on its floor rather than on zero');
}

ok(DIRECTED_LAMBDA === 1, 'the directed arm is idealised at lambda 1, which the limits section states');
ok(PARAMETERS.length === 4 && PARAMETERS.some((p) => /CANCELS/.test(p.standing)),
  'the parameter table records that r cancels');
ok(PARAMETERS.filter((p) => /^nothing/.test(p.standing)).length === 2,
  'and that two of the three live parameters have no instrument at all');

// ── 5. the instrument, and the R13 pass that changed its outcome ──────
section('seeded defects');

{
  // with no attenuation and a perfect gate, one turn removes everything
  const r = seededRun({ k: 10, q: 1, lambda: 1, turns: 1, rng: () => 0 });
  ok(r.removals === 10 && r.live === 0, 'a certain gate removes every seed on the first pass');
  const none = seededRun({ k: 10, q: 0.5, lambda: 0.6, turns: 4, rng: () => 0.999 });
  ok(none.removals === 0 && none.live === 10, 'and an unlucky run removes none');
  ok(none.exposure > 0, 'exposure accrues even when nothing is caught, which is what makes the estimate honest');
}
{
  // the estimator recovers q on a long run
  const rng = mulberry32(3);
  let removals = 0, exposure = 0;
  for (let i = 0; i < 400; i++) {
    const s = seededRun({ k: 30, q: 0.45, lambda: 0.6, turns: 5, rng });
    removals += s.removals; exposure += s.exposure;
  }
  near(estimate({ removals, exposure }), 0.45, 0.02, 'pooled over many runs the estimator recovers g');
  ok(estimate({ removals: 0, exposure: 0 }) === null, 'and refuses when nothing was exposed');
}
{
  const a = simulateSeeded({ trials: 300, seed: 8 });
  const b = simulateSeeded({ trials: 300, seed: 8 });
  ok(a.median === b.median && a.verdictAccuracy === b.verdictAccuracy, 'the simulation is deterministic in its seed');
  ok(simulateSeeded({ trials: 300, seed: 9 }).median !== a.median, 'and a different seed moves it');
}
{
  ok(VERDICTS.length === 3, 'three verdicts, because a number is not one the programme can act on');
  ok(verdictOf(null) === 'never' && verdictOf(6) === 'six suffices' && verdictOf(7) === 'more than six',
    'and they partition at the six-turn budget');
}

/* THE R13 RESULT: the three-way verdict is attainable near the boundary
   and the exchange rate itself is not, at the same cost. WP3's Table 4 is
   this ladder and its prose quotes these two cells. */
{
  const L = costLadder();
  const big = L.rows[L.rows.length - 1];
  ok(big.k === 40 && big.runs === 6 && big.turns === 36, 'the largest design is 40 seeds over 6 chains, 36 turns');
  ok(big.easyVerdict === 1, `far from the boundary that design is always right (got ${big.easyVerdict})`);
  ok(big.hardVerdict > 0.95, `near it, still right on the band ${big.hardVerdict} of the time`);
  ok(big.hardNumeric < 0.45,
    `but right on the RATE only ${big.hardNumeric} of the time, which is why the outcome is the band`);
  ok(big.hardVerdict > big.hardNumeric * 2, 'the band is more than twice as attainable as the number');
  ok(L.rows.every((r, i) => i === 0 || r.hardWidth <= L.rows[i - 1].hardWidth),
    'and precision on g does improve monotonically, so the failure is not the estimator');
}
{
  // more seeds per chain beats more chains, which is the probe's lesson again
  const seedsUp = simulateSeeded({ k: 40, runs: 6, turns: 5, trials: 1200, seed: 23 });
  const runsUp = simulateSeeded({ k: 10, runs: 24, turns: 5, trials: 1200, seed: 23 });
  ok(seedsUp.turnsSpent < runsUp.turnsSpent, '36 turns against 144');
  ok(seedsUp.width < runsUp.width * 2.2,
    `and 40x6 at ${seedsUp.width} is within reach of 10x24 at ${runsUp.width} for a quarter of the turns`);
}

// ── 6. H9 agrees with what priced it ──────────────────────────────────
section('H9');

ok(HYPOTHESES.H9 && HYPOTHESES.H9.owner === '/wp3', 'H9 is registered and owned by WP3');
ok(/SEVENTY-TWO TURNS/.test(HYPOTHESES.H9.cost), 'H9 states seventy-two turns');
ok(/CHANGED THE OUTCOME RATHER THAN THE PRICE/.test(HYPOTHESES.H9.cost),
  'and records that the simulation changed what it reports rather than what it costs');
ok(/announced|inferable/.test(HYPOTHESES.H9.refutedBy.join(' ')),
  'and loses if the seeds were announced, which is the hunting-rate failure');
ok(/no brief names them/.test(HYPOTHESES.H9.requires), 'H9 requires unannounced seeds');
ok(/H8 runs first/.test(HYPOTHESES.H9.requires), 'and requires lambda first, since g is estimated by discounting with it');
ok(HYPOTHESES.H9.predicts.some((p) => /better tools moves g/.test(p[0])),
  'and predicts that tool upgrades move g and leave lambda alone, which is falsifiable');

console.log(`\n${fail === 0 ? '✓' : '✗'} equivalence ${fail === 0 ? 'passed' : 'FAILED'} — ${fail === 0 ? pass : `${fail} of ${pass + fail}`} checks`);
process.exit(fail === 0 ? 0 : 1);
