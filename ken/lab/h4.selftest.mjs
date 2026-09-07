/* ken/lab/h4.selftest.mjs — the H4 analysis, pinned.

   Two kinds of check. The statistical machinery is verified against inputs
   whose answer is known by construction. The findings are pinned to the
   committed ledger, so if .github/loop changes, the analysis and the write-up
   both have to be revisited rather than silently drifting. */
import {
  loadRuns, partition, repeatedBeads, orderEffect, globalDrift, hourProfile,
  analyse, INFRA_SECONDS,
} from './h4.mjs';
import { stats } from '../../packages/dataviz/index.mjs';

let checks = 0, failures = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.error(`  ✗ ${m}`); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m} (got ${a}, want ${b}±${tol})`);
const section = (t) => console.log(`\n${t}`);

// ── the machinery, on constructed inputs ──────────────────────────────
section('machinery');
{
  // A bead whose runs halve each step has slope ln(0.5) per position.
  const synth = [];
  for (const bead of ['a', 'b', 'c']) {
    [800, 400, 200, 100].forEach((dur, i) => synth.push({
      turn: synth.length + 1, bead, dur, gateFailed: 0, hourUTC: 12, infra: false,
    }));
  }
  const o = orderEffect(synth, { perms: 2000, seed: 1 });
  near(o.slope, Math.log(0.5), 1e-9, 'a perfect halving gives slope ln(0.5)');
  near(o.perStepRatio, 0.5, 1e-9, 'reported as a ratio of 0.5 per step');
  ok(o.p < 0.01, `a perfect trend is not reproduced by shuffling (p=${o.p})`);
  ok(o.groups === 3 && o.n === 12, 'group and observation counts are reported');
}
{
  // No trend: identical durations everywhere.
  const flat = [];
  for (const bead of ['a', 'b', 'c']) {
    [500, 500, 500].forEach(() => flat.push({
      turn: flat.length + 1, bead, dur: 500, gateFailed: 0, hourUTC: 9, infra: false,
    }));
  }
  const o = orderEffect(flat, { perms: 500, seed: 2 });
  near(o.slope, 0, 1e-12, 'identical durations give a zero slope');
  ok(o.p === 1, 'and a permutation p of exactly 1');
}
{
  // The singular-fit guard: a subset with no gate variation must still fit.
  const rows = Array.from({ length: 30 }, (_, i) => ({
    turn: i + 1, bead: `b${i}`, dur: Math.exp(5 + 0.02 * (i + 1)), gateFailed: 0, hourUTC: 3, infra: false,
  }));
  const d = globalDrift(rows);
  ok(d.gateVaries === false, 'a constant gate column is detected');
  ok(d.gateCoef === null, 'and the gate term is reported as absent rather than as zero');
  near(d.slopePerTurn, 0.02, 1e-9, 'the turn slope is still recovered exactly');
  ok(d.slopeSe >= 0 && Number.isFinite(d.t), 'the fit is non-singular, unlike before the guard');
}
{
  const mixed = Array.from({ length: 30 }, (_, i) => ({
    turn: i + 1, bead: `b${i}`, dur: 400, gateFailed: i % 2, hourUTC: 3, infra: false,
  }));
  ok(globalDrift(mixed).gateVaries === true, 'a varying gate column is kept');
}
ok(hourProfile([{ hourUTC: 5, dur: 1 }, { hourUTC: 5, dur: 3 }], { minN: 2 })[0].median === 2,
   'hourProfile reports a median per hour');
ok(hourProfile([{ hourUTC: 5, dur: 1 }], { minN: 3 }).length === 0, 'thin hours are dropped');

// ── the ledger, as committed ──────────────────────────────────────────
section('the committed ledger');
const runs = loadRuns();
ok(runs.length === 89, `89 runs joined to their work orders (got ${runs.length})`);
ok(runs.every((r) => r.dur > 0), 'every run has a positive duration');

const p = partition(runs);
ok(p.knownInfra === 12, `12 runs are flagged infra by the ledger (got ${p.knownInfra})`);
ok(p.confirmedReal === 32, `32 are flagged not-infra (got ${p.confirmedReal})`);
ok(p.unclassified === 45, `45 predate the flag (got ${p.unclassified})`);
ok(p.suspectedInfra === 5, `5 unclassified runs fall under the ${INFRA_SECONDS}s rule (got ${p.suspectedInfra})`);
ok(p.clean === 72, `72 clean runs remain (got ${p.clean})`);
ok(p.ruleCatches === 11 && p.ruleFalsePositives === 2,
   `the duration rule catches 11 of 12 and misclassifies 2 of 32 (got ${p.ruleCatches}, ${p.ruleFalsePositives})`);

const a = analyse();
near(a.medians.knownInfra, 61.08, 0.01, 'flagged infra failures run about 61s');
near(a.medians.confirmedReal, 596.80, 0.01, 'confirmed real runs about 597s');
ok(a.medians.confirmedReal / a.medians.knownInfra > 9,
   'the two populations differ by nearly a factor of ten in duration');

// ── the findings, pinned ──────────────────────────────────────────────
section('findings');
const groups = repeatedBeads(p.cleanRuns);
ok(groups.length === 7, `7 beads have more than one clean run (got ${groups.length})`);

const o = orderEffect(p.cleanRuns, { perms: 20000, seed: 4242 });
near(o.slope, -0.4736, 0.0005, 'the naive within-bead slope');
near(o.p, 0.01165, 0.0005, 'and its permutation p');

// …which is one bead's doing.
const without = orderEffect(p.cleanRuns.filter((r) => r.bead !== 'lp-16d590'), { perms: 20000, seed: 4242 });
near(without.slope, -0.0955, 0.002, 'dropping lp-16d590 collapses the slope');
ok(without.p > 0.1, `and the effect stops being distinguishable from shuffling (p=${without.p.toFixed(3)})`);
ok(Math.abs(without.slope) < Math.abs(o.slope) / 4,
   'the remaining slope is under a quarter of the headline one');

const d = globalDrift(p.cleanRuns);
near(d.slopePerTurn, 0.01112, 0.0001, 'global drift in log duration per turn');
near(d.t, 3.36, 0.02, 'its t statistic');
const noGate = globalDrift(p.cleanRuns.filter((r) => !r.gateFailed));
near(noGate.slopePerTurn, 0.01651, 0.0001, 'drift is larger among passing runs only');
near(noGate.t, 6.19, 0.02, 'with a larger t');

// the shape: rising then flat, so a single line is the wrong model
const block = (lo) => {
  const b = p.cleanRuns.filter((r) => r.turn >= lo && r.turn < lo + 20);
  return b.length ? Math.round(stats.median(b.map((r) => r.dur))) : null;
};
const medians = [1, 21, 41, 61, 81].map(block);
ok(JSON.stringify(medians) === JSON.stringify([213, 500, 798, 546, 550]),
   `block medians are 213/500/798/546/550 (got ${medians.join('/')})`);
ok(medians[2] > medians[0] * 3, 'duration more than trebles by the third block');
ok(medians[4] < medians[2], 'and then falls back, so the rise is not monotone');

console.log('');
if (failures) { console.error(`✗ H4 analysis FAILED — ${failures} of ${checks} checks`); process.exit(1); }
console.log(`✓ H4 analysis passed — ${checks} checks`);
