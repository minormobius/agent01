// Node smoke test for the S-curve planner. Run: node tjs/gantry/js/scurve.test.mjs
// Verifies, across many randomized and degenerate cases, that the analytic
// evaluator's endpoint matches the commanded distance and that the realized
// velocity/acceleration/jerk never exceed the limits (within tolerance).
import { planAxis, makeEvaluator, planMove } from './scurve.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); fails++; } };

function checkAxis(dist, V, A, J, label) {
  const prof = planAxis(dist, V, A, J);
  const ev = makeEvaluator(prof);
  const N = 4000;
  let maxV = 0, maxA = 0, maxJ = 0, last = 0;
  for (let i = 0; i <= N; i++) {
    const t = (prof.T * i) / N;
    const s = ev(t);
    maxV = Math.max(maxV, Math.abs(s.v));
    maxA = Math.max(maxA, Math.abs(s.a));
    maxJ = Math.max(maxJ, Math.abs(s.j));
    last = s.p;
  }
  const tol = 1e-3;
  ok(Math.abs(last - dist) < 1e-4 * Math.max(1, Math.abs(dist)) + 1e-6, `${label}: endpoint ${last} != ${dist}`);
  ok(maxV <= V * (1 + tol) + 1e-6, `${label}: vmax exceeded ${maxV} > ${V}`);
  ok(maxA <= A * (1 + tol) + 1e-6, `${label}: amax exceeded ${maxA} > ${A}`);
  ok(maxJ <= J * (1 + tol) + 1e-6, `${label}: jmax exceeded ${maxJ} > ${J}`);
  // Continuity in v and a at every internal segment boundary: the left and
  // right limits must agree (the analytic evaluator chains state, so a mismatch
  // would mean a duration/formula bug). delta scales with the local rates.
  let tb = 0;
  for (const seg of prof.segs) {
    tb += seg.dur;
    if (tb <= 1e-6 || tb >= prof.T - 1e-6) continue;
    const d = 1e-9;
    const lo = ev(tb - d), hi = ev(tb + d);
    // Samples are 2d apart, so v legitimately changes by ~a*2d and a by ~j*2d.
    // A genuine formula discontinuity would be orders of magnitude larger.
    const dv = Math.abs(hi.v - lo.v), da = Math.abs(hi.a - lo.a);
    ok(dv < A * 4 * d + 1e-7, `${label}: velocity discontinuity ${dv} at t=${tb}`);
    ok(da < J * 4 * d + 1e-6, `${label}: acceleration discontinuity ${da} at t=${tb}`);
  }
}

console.log('S-curve single-axis cases:');
checkAxis(200, 300, 3000, 60000, 'long move (cruises)');
checkAxis(5, 300, 3000, 60000, 'short move (no V, no A)');
checkAxis(40, 300, 3000, 60000, 'medium (A reached, no cruise)');
checkAxis(-150, 250, 2000, 40000, 'negative move');
checkAxis(0, 300, 3000, 60000, 'zero move');
checkAxis(1e-3, 300, 3000, 60000, 'tiny move');

// Randomized fuzz.
let seed = 12345;
const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let i = 0; i < 300; i++) {
  const dist = (rng() - 0.5) * 1000;
  const V = 10 + rng() * 500;
  const A = 100 + rng() * 5000;
  const J = 1000 + rng() * 100000;
  checkAxis(dist, V, A, J, `fuzz#${i}`);
}

// Multi-axis synchronization: all axes must finish at the same total time T.
console.log('Multi-axis synchronization:');
const move = planMove([
  { key: 'X', distance: 200, vmax: 300, amax: 3000, jmax: 60000 },
  { key: 'Y', distance: 50, vmax: 300, amax: 3000, jmax: 60000 },
  { key: 'Z1', distance: 10, vmax: 100, amax: 1500, jmax: 30000 },
]);
for (const key of ['X', 'Y', 'Z1']) {
  ok(Math.abs(move.profiles[key].T - move.T) < 1e-3, `axis ${key} not synchronized (${move.profiles[key].T} vs ${move.T})`);
  const ev = move.evaluators[key];
  const end = ev(move.T).p;
  const want = { X: 200, Y: 50, Z1: 10 }[key];
  ok(Math.abs(end - want) < 1e-3, `axis ${key} endpoint ${end} != ${want}`);
}
ok(move.bottleneck === 'X', `bottleneck should be X, got ${move.bottleneck}`);

console.log(fails === 0 ? '\nALL PASS ✓' : `\n${fails} FAILURE(S) ✗`);
process.exit(fails === 0 ? 0 : 1);
