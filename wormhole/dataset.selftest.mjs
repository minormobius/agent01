// wormhole dataset selftest — run before touching dataset.js / stats.js:
//   node wormhole/dataset.selftest.mjs
//
// The load-bearing guarantee: the REPORTED numbers are COMPUTED FROM the
// fabricated data. This test recomputes statistics from data.points etc. and
// checks they match data.reported — i.e. the paper's figures really are its
// evidence. Also exercises the stats primitives (OLS, correlation) on data with
// a known answer.

import "./engine.js";
import "./stats.js";
import "./dataset.js";
const W = globalThis.WORMHOLE;
const ST = globalThis.WORMHOLE_STATS;
const D = globalThis.WORMHOLE_DATA;

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error("  ✗ " + msg); } }
function approx(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + " (got " + a + " vs " + b + ")"); }

// ---- stats primitives on a known case ----
{
  const x = [1, 2, 3, 4, 5], y = [2, 4, 6, 8, 10]; // perfect line y = 2x
  approx(ST.correlation(x, y), 1, 1e-9, "correlation of a perfect line is 1");
  const fit = ST.ols(x.map(v => [v]), y);
  approx(fit.beta[1], 2, 1e-6, "OLS recovers slope 2");
  approx(fit.beta[0], 0, 1e-6, "OLS recovers intercept 0");
  approx(fit.r2, 1, 1e-9, "OLS R² is 1 for a perfect fit");
  approx(ST.median([3, 1, 2]), 2, 1e-9, "median");
  approx(ST.quantile([1, 2, 3, 4], 0.5), 2.5, 1e-9, "quantile 0.5");
  ok(Math.abs(ST.normalCdf(0) - 0.5) < 1e-6, "normalCdf(0) = 0.5");
  ok(Math.abs(ST.normalQuantile(0.5)) < 1e-6, "normalQuantile(0.5) = 0");
}

// ---- dataset determinism ----
for (const id of ["1.f", "42.f", "42.r3", "999.r7"]) {
  ok(JSON.stringify(D.build(id)) === JSON.stringify(D.build(id)), `dataset ${id} deterministic`);
}

// ---- the coherence guarantee, across many papers ----
for (const id of ["1.f", "7.f", "42.f", "88.r2", "500.f", "1234.r5", "9.r1"]) {
  const d = D.build(id);
  const xs = d.points.map(p => p.x), ys = d.points.map(p => p.y);

  // reported r equals the correlation of the plotted points
  const rActual = ST.correlation(xs, ys);
  approx(Math.abs(rActual), parseFloat(d.reported.r.replace(/^\./, "0.")), 0.02, `${id}: reported r matches data`);

  // reported slope equals the OLS slope of the plotted points
  const slope = ST.ols(xs.map(x => [x]), ys).beta[1];
  approx(slope, parseFloat(d.reported.beta), 0.02, `${id}: reported β₁ matches OLS slope`);
  ok(Math.sign(slope) === Math.sign(rActual), `${id}: slope and r agree in sign`);

  // CI string brackets the slope
  const m = d.reported.ci.match(/\[(-?[\d.]+), (-?[\d.]+)\]/);
  ok(m && parseFloat(m[1]) <= slope + 1e-6 && slope - 1e-6 <= parseFloat(m[2]), `${id}: slope inside reported CI`);

  // table: 3 subsets, 5 columns, per-subset N sums to total N, means match the data
  ok(d.reported.table.rows.length === 3, `${id}: table has 3 subset rows`);
  ok(d.reported.table.rows.every(row => row.length === 5), `${id}: table rows have 5 cells`);
  const nSum = d.reported.table.rows.reduce((a, row) => a + parseInt(row[1], 10), 0);
  ok(nSum === d.N, `${id}: subset Ns sum to total N`);
  d.bySubset.forEach((b, gi) => {
    approx(ST.mean(b.values), parseFloat(d.reported.table.rows[gi][2]), 0.01, `${id}: subset ${gi} mean matches table`);
  });

  // correlation matrix: square, symmetric, unit diagonal, in [-1,1]
  const M = d.corr.matrix, n = M.length;
  ok(n === 5 && M.every(row => row.length === 5), `${id}: 5×5 correlation matrix`);
  for (let i = 0; i < n; i++) {
    approx(M[i][i], 1, 1e-9, `${id}: corr diagonal ${i} is 1`);
    for (let j = 0; j < n; j++) {
      approx(M[i][j], M[j][i], 1e-9, `${id}: corr symmetric (${i},${j})`);
      ok(M[i][j] >= -1.0001 && M[i][j] <= 1.0001, `${id}: corr in range (${i},${j})`);
    }
  }

  // waterfall variance shares sum to ~100%
  const wsum = d.waterfallItems.reduce((a, it) => a + it.value, 0);
  approx(wsum, 100, 1.0, `${id}: waterfall shares sum to 100%`);

  // forest: 4 rows, each lo <= est <= hi
  ok(d.forestRows.length === 4, `${id}: 4 forest rows`);
  ok(d.forestRows.every(r => r.lo <= r.est + 1e-9 && r.est <= r.hi + 1e-9), `${id}: forest CIs bracket estimates`);
}

if (failures === 0) {
  console.log("✓ wormhole dataset selftest passed");
  process.exit(0);
} else {
  console.error(`\n✗ ${failures} check(s) failed`);
  process.exit(1);
}
