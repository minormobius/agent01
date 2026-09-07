#!/usr/bin/env node
// The whole investigation, reproducible end to end.
//
//   node lab/build-tensor.mjs && node lab/experiment.mjs
//
// Three questions, in the order they have to be asked:
//   1. Is there hour-of-day structure at all? (if not, the time mode is inert
//      and TCA cannot beat PCA on daily means by construction)
//   2. Does the decomposition find structure a surrogate cannot? (CP-ALS always
//      returns components; only a null says whether they mean anything)
//   3. Does it predict anything out of sample that a standard model does not?
//      — with factors fit on training folds ONLY. Fitting the decomposition on
//      all days and then cross-validating leaks the test period through the
//      factors and roughly doubles the apparent gain.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpAls, similarity } from './tca.mjs';
import { stats } from '../../packages/dataviz/index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DAY = 86400e3;
const { FEAT, rows } = JSON.parse(readFileSync(join(HERE, 'tensor.json'), 'utf8'));

const byDay = new Map();
for (const r of rows) {
  const d = Math.floor(r.t / DAY);
  if (!byDay.has(d)) byDay.set(d, new Array(24).fill(null));
  byDay.get(d)[new Date(r.t).getUTCHours()] = r;
}
const dayKeys = [...byDay.keys()].sort((a, b) => a - b).filter((d) => byDay.get(d).every(Boolean));
const D = dayKeys.length, F = FEAT.length;
console.log(`tensor: ${F} features x 24 hours x ${D} complete days\n`);

const rng = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// ---- 1. precondition --------------------------------------------------------
// The null must permute hours INDEPENDENTLY PER DAY. One permutation shared
// across days is only a relabelling of the groups, and eta^2 is invariant under
// relabelling — that null reproduces the observed value exactly and looks like
// a passing test when it is measuring nothing.
console.log('=== 1. hour-of-day structure vs a per-day permutation null ===');
console.log('feature      observed eta^2   null max   ratio   trials exceeding   verdict');
const days = dayKeys.map((d) => byDay.get(d));
for (const k of FEAT) {
  const g = Array.from({length: 24}, () => []);
  for (const r of rows) g[new Date(r.t).getUTCHours()].push(r[k]);
  const obs = stats.anova(g).eta2;
  let mx = 0, exceed = 0, TRIALS = 200;
  for (let trial = 0; trial < TRIALS; trial++) {
    const gg = Array.from({length: 24}, () => []);
    days.forEach((day, di) => {
      const rand = rng(trial * 1e6 + di);
      const idx = day.map((_, i) => i);
      for (let i = 23; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      day.forEach((r, i) => gg[idx[i]].push(r[k]));
    });
    const e = stats.anova(gg).eta2;
    mx = Math.max(mx, e);
    if (e >= obs) exceed++;
  }
  // A bare observed/null-max ratio hides marginal cases: a ratio near 2 can sit
  // inside the null's own trial-to-trial spread. The exceedance count is the
  // actual p-value and is what the verdict uses.
  const verdict = exceed === 0 && obs / mx > 3 ? 'real'
                : exceed === 0 ? 'marginal — ratio within null spread'
                : `not distinguishable (p≈${(exceed / TRIALS).toFixed(3)})`;
  console.log(k.padEnd(12) + obs.toExponential(3).padStart(14) + mx.toExponential(2).padStart(12)
    + (obs / mx).toFixed(1).padStart(8) + String(exceed).padStart(15) + '   ' + verdict);
}

// ---- tensor + surrogates ----------------------------------------------------
const raw = Array.from({length: F}, () => Array.from({length: 24}, () => new Float64Array(D)));
for (let f = 0; f < F; f++) for (let h = 0; h < 24; h++) for (let k = 0; k < D; k++) raw[f][h][k] = days[k][h][FEAT[f]];
const X = raw.map((slab) => { const all = []; for (const r of slab) for (const v of r) all.push(v);
  const m = stats.mean(all), s = stats.sd(all) || 1; return slab.map((r) => Float64Array.from(r, (v) => (v - m) / s)); });

const clone = (T) => T.map((s) => s.map((r) => Float64Array.from(r)));
const shuffleDays = (T, seed) => { const Y = clone(T); let c = 0;
  for (let f = 0; f < F; f++) for (let h = 0; h < 24; h++) { const rand = rng(seed * 7919 + (c++));
    for (let k = D - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); const t = Y[f][h][k]; Y[f][h][k] = Y[f][h][j]; Y[f][h][j] = t; } }
  return Y; };
const shuffleHours = (T, seed) => { const Y = clone(T); let c = 0;
  for (let f = 0; f < F; f++) for (let k = 0; k < D; k++) { const rand = rng(seed * 104729 + (c++));
    const cv = Array.from({length: 24}, (_, h) => Y[f][h][k]);
    for (let h = 23; h > 0; h--) { const j = Math.floor(rand() * (h + 1)); [cv[h], cv[j]] = [cv[j], cv[h]]; }
    for (let h = 0; h < 24; h++) Y[f][h][k] = cv[h]; }
  return Y; };

// ---- 2. rank sweep against both surrogates ----------------------------------
console.log('\n=== 2. rank sweep vs surrogates (R^2, and restart reproducibility) ===');
console.log('R    observed  day-shuf  hour-shuf   sim(obs)');
const RANKS = [1, 2, 3, 4, 5, 6];
const nd = shuffleDays(X, 1), nh = shuffleHours(X, 2);
for (const R of RANKS) {
  const fits = [0, 1, 2, 3].map((s) => cpAls(X, R, { seed: 1000 + s * 31 + R, iters: 220 }));
  const best = fits.reduce((a, b) => a.err < b.err ? a : b);
  let sim = 0, n = 0;
  for (let i = 0; i < fits.length; i++) for (let j = i + 1; j < fits.length; j++) { sim += similarity(fits[i], fits[j]); n++; }
  const a = cpAls(nd, R, { seed: 500 + R, iters: 220 }), b = cpAls(nh, R, { seed: 600 + R, iters: 220 });
  console.log(String(R).padEnd(5) + best.fitR2.toFixed(4).padStart(8) + a.fitR2.toFixed(4).padStart(10)
    + b.fitR2.toFixed(4).padStart(11) + (sim / n).toFixed(3).padStart(11));
}

// ---- 3. out-of-sample prediction, no leakage --------------------------------
const slice = (k) => Array.from({length: F}, (_, f) => Float64Array.from({length: 24}, (_, h) => days[k][h][FEAT[f]]));
const rv = Array.from({length: D}, (_, k) => { let s = 0; for (let h = 0; h < 24; h++) s += days[k][h].absret ** 2; return Math.log(Math.sqrt(s)); });

// project one day onto FIXED factors: least squares for the R-vector
function project(Y, A, B) {
  const R = A[0].length;
  const G = Array.from({length: R}, () => new Float64Array(R));
  for (let a = 0; a < R; a++) for (let b = 0; b < R; b++) {
    let ga = 0, gb = 0;
    for (let f = 0; f < A.length; f++) ga += A[f][a] * A[f][b];
    for (let h = 0; h < B.length; h++) gb += B[h][a] * B[h][b];
    G[a][b] = ga * gb;
  }
  const rhs = new Float64Array(R);
  for (let f = 0; f < A.length; f++) for (let h = 0; h < B.length; h++) { const v = Y[f][h]; if (!v) continue;
    for (let r = 0; r < R; r++) rhs[r] += v * A[f][r] * B[h][r]; }
  const M = Array.from({length: R}, (_, i) => { const row = new Float64Array(R + 1);
    for (let j = 0; j < R; j++) row[j] = G[i][j] + (i === j ? 1e-8 : 0); row[R] = rhs[i]; return row; });
  for (let c = 0; c < R; c++) {
    let p = c; for (let r = c + 1; r < R; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) continue;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j <= R; j++) M[c][j] /= d;
    for (let r = 0; r < R; r++) { if (r === c) continue; const f2 = M[r][c]; if (!f2) continue;
      for (let j = 0; j <= R; j++) M[r][j] -= f2 * M[c][j]; }
  }
  return Float64Array.from({length: R}, (_, r) => M[r][R]);
}

const R_TCA = 4, folds = 5, n = D - 1;
const res = { base: [], har: [], harTca: [], harPca: [] };
for (let fo = 0; fo < folds; fo++) {
  const lo = Math.floor(fo * n / folds), hi = Math.floor((fo + 1) * n / folds);
  const trIdx = [], teIdx = [];
  for (let k = 0; k < n; k++) (k >= lo && k < hi ? teIdx : trIdx).push(k);

  const mu = new Float64Array(F), sd = new Float64Array(F);
  for (let f = 0; f < F; f++) { const all = []; for (const k of trIdx) for (let h = 0; h < 24; h++) all.push(slice(k)[f][h]);
    mu[f] = stats.mean(all); sd[f] = stats.sd(all) || 1; }
  const z = (k) => Array.from({length: F}, (_, f) => Float64Array.from(slice(k)[f], (v) => (v - mu[f]) / sd[f]));

  const Xtr = Array.from({length: F}, () => Array.from({length: 24}, () => new Float64Array(trIdx.length)));
  trIdx.forEach((k, i) => { const zk = z(k); for (let f = 0; f < F; f++) for (let h = 0; h < 24; h++) Xtr[f][h][i] = zk[f][h]; });
  const fit = cpAls(Xtr, R_TCA, { seed: 900 + fo, iters: 300 });
  const C = Array.from({length: n}, (_, k) => project(z(k), fit.A, fit.B));

  const dm = (k) => { const zk = z(k); return Array.from({length: F}, (_, f) => { let s = 0; for (let h = 0; h < 24; h++) s += zk[f][h]; return s / 24; }); };
  const pc = stats.pca(trIdx.map((k) => [...dm(k)]));
  const projPca = (k) => { const v = dm(k);
    return pc.loadings[0].map((_, p) => { let s = 0; for (let f = 0; f < F; f++) s += v[f] * pc.loadings[f][p]; return s; }).slice(0, 3); };

  const mean = (a, b) => { let s = 0, m = 0; for (let i = Math.max(0, a); i <= b; i++) { s += rv[i]; m++; } return s / m; };
  const har = (k) => [rv[k], mean(k - 4, k), mean(k - 21, k)];
  const run = (cols) => {
    const trX = trIdx.map(cols), trY = trIdx.map((k) => rv[k + 1]);
    const teX = teIdx.map(cols), teY = teIdx.map((k) => rv[k + 1]);
    const m = stats.ols(trX, trY), ybar = stats.mean(trY);
    let ss = 0, tt = 0;
    teX.forEach((x, i) => { let p = m.beta[0]; for (let j = 0; j < x.length; j++) p += m.beta[j + 1] * x[j];
      ss += (teY[i] - p) ** 2; tt += (teY[i] - ybar) ** 2; });
    return 1 - ss / tt;
  };
  res.base.push(run((k) => [rv[k]]));
  res.har.push(run(har));
  res.harTca.push(run((k) => [...har(k), ...C[k]]));
  res.harPca.push(run((k) => [...har(k), ...projPca(k)]));
}
console.log('\n=== 3. next-day log realised vol, 5-fold blocked CV, factors fit on train only ===');
for (const [k, label] of [['base', 'today log realised vol'], ['har', 'HAR-RV (daily+weekly+monthly)'],
                          ['harPca', 'HAR-RV + PCA-on-daily-means (3 PC)'], ['harTca', 'HAR-RV + TCA day-factors']]) {
  console.log('  ' + label.padEnd(38) + stats.mean(res[k]).toFixed(4).padStart(8) + '   ' + res[k].map((v) => v.toFixed(3)).join(' '));
}
const wins = res.harTca.filter((v, i) => v > res.har[i]).length;
console.log(`\nTCA gain over HAR-RV: ${(stats.mean(res.harTca) - stats.mean(res.har)).toFixed(4)} R^2 (${wins}/${folds} folds)`);
console.log(`PCA gain over HAR-RV: ${(stats.mean(res.harPca) - stats.mean(res.har)).toFixed(4)} R^2`);
