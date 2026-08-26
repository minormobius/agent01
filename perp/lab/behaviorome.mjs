#!/usr/bin/env node
// Two questions, deliberately separated.
//
//   PREDICTION  — do microstructure features forecast anything beyond what
//                 volatility persistence and time-of-day already give you?
//                 Tested directly, no tensor involved.
//   BEHAVIOROME — do the features organise into a small number of reproducible
//                 axes, and does the within-day shape of those axes vary from
//                 day to day the way an aging fish's daily rhythm does?
//
//   node lab/behaviorome.mjs [--agg 1]     # --agg 3 folds 5min slots into 15min
//
// Every out-of-sample number uses blocked CV with all fitting — scalers, PCA,
// tensor factors — done on training folds only. Fitting a decomposition on all
// days and then cross-validating leaks the test period through the factors and
// roughly doubles the apparent gain; that mistake is documented in README.md.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpAls, similarity } from './tca.mjs';
import { stats } from '../../packages/dataviz/index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? +process.argv[i + 1] : d; };
const AGG = arg('agg', 1);

const store = JSON.parse(readFileSync(join(HERE, 'micro.json'), 'utf8'));
const FEAT = store.FEATURES, F = FEAT.length;
const dates = Object.keys(store.days).sort().filter((d) => store.days[d] && store.days[d].every(Boolean));
const RAW_SLOTS = store.days[dates[0]].length;
const S = Math.floor(RAW_SLOTS / AGG);
const D = dates.length;
console.log(`${store.market} ${store.symbol}: ${D} complete days x ${S} slots x ${F} features`);
console.log(`span ${dates[0]} -> ${dates.at(-1)}   slot = ${AGG * 5} min\n`);

// day -> [slot][feature], averaging AGG raw slots together
const day = dates.map((d) => {
  const raw = store.days[d];
  return Array.from({ length: S }, (_, s) => Float64Array.from({ length: F }, (_, f) => {
    let acc = 0; for (let a = 0; a < AGG; a++) acc += raw[s * AGG + a][f];
    return acc / AGG;
  }));
});

// ---------------------------------------------------------------- helpers ---
const flat = (f) => { const o = []; for (let k = 0; k < D; k++) for (let s = 0; s < S; s++) o.push(day[k][s][f]); return o; };
const rng = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const IRV = FEAT.indexOf('rvTick');

// ============================================================================
// 1. the feature catalogue itself — what is actually in the behaviorome
// ============================================================================
console.log('=== 1. the catalogue: each feature, and its time-of-day structure ===');
console.log('feature         mean      sd    intraday eta^2   null max   verdict');
const cols = FEAT.map((_, f) => flat(f));
for (let f = 0; f < F; f++) {
  const g = Array.from({ length: S }, () => []);
  for (let k = 0; k < D; k++) for (let s = 0; s < S; s++) g[s].push(day[k][s][f]);
  const obs = stats.anova(g).eta2;
  let mx = 0;
  for (let trial = 0; trial < 40; trial++) {           // permute slots WITHIN each day
    const gg = Array.from({ length: S }, () => []);
    for (let k = 0; k < D; k++) {
      const rand = rng(trial * 1e6 + k);
      const idx = Array.from({ length: S }, (_, i) => i);
      for (let i = S - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      for (let s = 0; s < S; s++) gg[idx[s]].push(day[k][s][f]);
    }
    mx = Math.max(mx, stats.anova(gg).eta2);
  }
  console.log(FEAT[f].padEnd(13) + stats.mean(cols[f]).toFixed(4).padStart(9) + stats.sd(cols[f]).toFixed(4).padStart(8)
    + obs.toFixed(4).padStart(15) + mx.toFixed(4).padStart(11)
    + (obs > mx * 3 ? '   strong' : obs > mx ? '   weak' : '   none'));
}

// ============================================================================
// 2. PREDICTION — next-slot realised volatility, the high-rate question
// ============================================================================
// Flatten to a slot series. Benchmark is everything cheap: persistence at three
// horizons plus a time-of-day term, which is what the intraday seasonal already
// gives you for free. Microstructure has to beat THAT, not beat nothing.
const rawDay = dates.map((d) => store.days[d].map((r) => Float64Array.from(r)));
const seq = [];
for (let k = 0; k < D; k++) for (let s = 0; s < RAW_SLOTS; s++) seq.push({ k, s, v: rawDay[k][s] });
const N = seq.length;
const lrv = seq.map((x) => Math.log(1e-12 + x.v[IRV]));
const tod = Array.from({ length: RAW_SLOTS }, (_, s) => {
  const vals = []; for (let k = 0; k < D; k++) vals.push(Math.log(1e-12 + rawDay[k][s][IRV]));
  return stats.mean(vals);
});
const back = (i, w) => { let a = 0, n = 0; for (let j = Math.max(0, i - w + 1); j <= i; j++) { a += lrv[j]; n++; } return a / n; };

function blockedCV(build, label, folds = 5) {
  const out = [];
  for (let fo = 0; fo < folds; fo++) {
    const lo = Math.floor(fo * (N - 1) / folds), hi = Math.floor((fo + 1) * (N - 1) / folds);
    const trX = [], trY = [], teX = [], teY = [];
    for (let i = RAW_SLOTS; i < N - 1; i++) {          // skip the first day (lookback)
      const x = build(i), y = lrv[i + 1];
      if (i >= lo && i < hi) { teX.push(x); teY.push(y); } else { trX.push(x); trY.push(y); }
    }
    const m = stats.ols(trX, trY), ybar = stats.mean(trY);
    let ss = 0, tt = 0;
    teX.forEach((x, i) => { let p = m.beta[0]; for (let j = 0; j < x.length; j++) p += m.beta[j + 1] * x[j];
      ss += (teY[i] - p) ** 2; tt += (teY[i] - ybar) ** 2; });
    out.push(1 - ss / tt);
  }
  console.log('  ' + label.padEnd(46) + stats.mean(out).toFixed(4).padStart(8) + '   ' + out.map((v) => v.toFixed(3)).join(' '));
  return stats.mean(out);
}

// Sanity: order-flow imbalance must track the CONTEMPORANEOUS return strongly.
// If the maker flag were being read backwards this correlation flips sign, and
// every signed feature downstream would be quietly wrong.
const IOFI = FEAT.indexOf('ofi'), IRET = FEAT.indexOf('ret');
const ofiS = seq.map((x) => x.v[IOFI]), retS = seq.map((x) => x.v[IRET]);
console.log('\n=== 2a. sanity: is trade signing correct? ===');
console.log(`  corr(OFI_t, return_t)      ${stats.correlation(ofiS, retS).toFixed(4)}   <- must be strongly POSITIVE`);
console.log(`  corr(OFI_t, return_{t+1})  ${stats.correlation(ofiS.slice(0, -1), retS.slice(1)).toFixed(4)}   <- the tradable one`);

console.log(`\n=== 2b. predicting NEXT SLOT log realised vol (n=${N.toLocaleString()}), blocked CV ===`);
const bench = (i) => [lrv[i], back(i, 12), back(i, RAW_SLOTS), tod[seq[i].s]];
const b0 = blockedCV((i) => [lrv[i]], 'persistence only (last slot)');
const b1 = blockedCV(bench, 'benchmark: 3 horizons + time-of-day');
const others = FEAT.map((_, f) => f).filter((f) => f !== IRV);
const b2 = blockedCV((i) => [...bench(i), ...others.map((f) => seq[i].v[f])], 'benchmark + all microstructure features');
console.log(`\n  microstructure gain over benchmark: ${(b2 - b1).toFixed(4)} R^2`);

// which single features carry it
console.log('\n  marginal contribution of each feature (added alone to the benchmark):');
const marg = others.map((f) => ({ f, g: blockedCV((i) => [...bench(i), seq[i].v[f]], `  + ${FEAT[f]}`) - b1 }));
marg.sort((a, b) => b.g - a.g);
console.log('\n  ranked: ' + marg.map((m) => `${FEAT[m.f]} ${m.g >= 0 ? '+' : ''}${m.g.toFixed(4)}`).join('   '));

// Direction, for completeness. Volatility is predictable; sign generally is not,
// and saying so explicitly is worth more than leaving it unasked.
console.log('\n=== 2c. predicting NEXT SLOT return (direction), same protocol ===');
const savedLrv = lrv.slice();
for (let i = 0; i < N; i++) lrv[i] = seq[i].v[IRET];
blockedCV((i) => [seq[i].v[IOFI], seq[i].v[IRET]], 'OFI + last return -> next return');
blockedCV((i) => others.map((f) => seq[i].v[f]), 'all microstructure features -> next return');
for (let i = 0; i < N; i++) lrv[i] = savedLrv[i];

// ============================================================================
// 3. BEHAVIOROME — low-dimensional structure across feature x slot x day
// ============================================================================
const X = Array.from({ length: F }, (_, f) => {
  const m = stats.mean(cols[f]), sd = stats.sd(cols[f]) || 1;
  return Array.from({ length: S }, (_, s) => Float64Array.from({ length: D }, (_, k) => (day[k][s][f] - m) / sd));
});
const clone = (T) => T.map((a) => a.map((r) => Float64Array.from(r)));
const shufDays = (T, seed) => { const Y = clone(T); let c = 0;
  for (let f = 0; f < F; f++) for (let s = 0; s < S; s++) { const rand = rng(seed * 7919 + (c++));
    for (let k = D - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); const t = Y[f][s][k]; Y[f][s][k] = Y[f][s][j]; Y[f][s][j] = t; } }
  return Y; };
const shufSlots = (T, seed) => { const Y = clone(T); let c = 0;
  for (let f = 0; f < F; f++) for (let k = 0; k < D; k++) { const rand = rng(seed * 104729 + (c++));
    const cv = Array.from({ length: S }, (_, s) => Y[f][s][k]);
    for (let s = S - 1; s > 0; s--) { const j = Math.floor(rand() * (s + 1)); [cv[s], cv[j]] = [cv[j], cv[s]]; }
    for (let s = 0; s < S; s++) Y[f][s][k] = cv[s]; }
  return Y; };

console.log('\n=== 3. behaviorome: rank sweep vs surrogates ===');
console.log('R    observed  day-shuf  slot-shuf   restart similarity');
const nd = shufDays(X, 1), ns = shufSlots(X, 2);
const RANKS = [1, 2, 3, 4, 5, 6];
let bestFits = {};
for (const R of RANKS) {
  const fits = [0, 1, 2].map((s) => cpAls(X, R, { seed: 400 + s * 13 + R, iters: 120 }));
  const best = fits.reduce((a, b) => a.err < b.err ? a : b);
  bestFits[R] = best;
  let sim = 0, n = 0;
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { sim += similarity(fits[i], fits[j]); n++; }
  const a = cpAls(nd, R, { seed: 700 + R, iters: 120 }), b = cpAls(ns, R, { seed: 800 + R, iters: 120 });
  console.log(String(R).padEnd(5) + best.fitR2.toFixed(4).padStart(8) + a.fitR2.toFixed(4).padStart(10)
    + b.fitR2.toFixed(4).padStart(11) + (sim / n).toFixed(3).padStart(20));
}

const R_SHOW = 4, fit = bestFits[R_SHOW];
console.log(`\n=== the ${R_SHOW} axes (feature loadings) ===`);
console.log('feature      ' + Array.from({ length: R_SHOW }, (_, r) => `axis${r + 1}`.padStart(9)).join(''));
FEAT.forEach((f, i) => console.log(f.padEnd(13) + Array.from({ length: R_SHOW }, (_, r) => fit.A[i][r].toFixed(3).padStart(9)).join('')));
console.log('\naxis   within-day shape                          day-mode lag-1 AC');
for (let r = 0; r < R_SHOW; r++) {
  const b = fit.B.map((x) => x[r]);
  const pk = b.indexOf(Math.max(...b)), tr = b.indexOf(Math.min(...b));
  const hh = (s) => `${String(Math.floor(s * AGG * 5 / 60)).padStart(2, '0')}:${String((s * AGG * 5) % 60).padStart(2, '0')}`;
  const c = fit.C.map((x) => x[r]);
  const flatness = stats.sd(b) / (Math.abs(stats.mean(b)) || 1e-9);
  console.log(`  ${r + 1}    peak ${hh(pk)}  trough ${hh(tr)}  flatness ${flatness.toFixed(2).padStart(6)}` +
    `        ${stats.correlation(c.slice(0, -1), c.slice(1)).toFixed(3).padStart(8)}`);
}

// ============================================================================
// 4. THE MARKET CLOCK — the closest analogue to the paper's headline
// ============================================================================
// Bedbrook et al. build a "behavioural clock" that reads a fish's age off its
// daily movement. The chart analogue: can you date a day from how it traded?
//
// Held-out days are contiguous blocks AND a purge margin either side is dropped
// from training, so a test day never has its immediate neighbours in the
// training set. Without the purge, day-to-day persistence alone dates a day
// almost perfectly and the test measures nothing.
console.log('\n=== 4. the market clock: predicting a day\'s DATE from how it traded ===');
const PURGE = 7, CFOLD = 5, R_CLOCK = 4;

function project(Y, A, B) {
  const R = A[0].length;
  const G = Array.from({ length: R }, () => new Float64Array(R));
  for (let a = 0; a < R; a++) for (let b = 0; b < R; b++) {
    let ga = 0, gb = 0;
    for (let f = 0; f < A.length; f++) ga += A[f][a] * A[f][b];
    for (let h = 0; h < B.length; h++) gb += B[h][a] * B[h][b];
    G[a][b] = ga * gb;
  }
  const rhs = new Float64Array(R);
  for (let f = 0; f < A.length; f++) for (let h = 0; h < B.length; h++) { const v = Y[f][h]; if (!v) continue;
    for (let r = 0; r < R; r++) rhs[r] += v * A[f][r] * B[h][r]; }
  const M = Array.from({ length: R }, (_, i) => { const row = new Float64Array(R + 1);
    for (let j = 0; j < R; j++) row[j] = G[i][j] + (i === j ? 1e-8 : 0); row[R] = rhs[i]; return row; });
  for (let c = 0; c < R; c++) {
    let p = c; for (let r = c + 1; r < R; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) continue;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j <= R; j++) M[c][j] /= d;
    for (let r = 0; r < R; r++) { if (r === c) continue; const f2 = M[r][c]; if (!f2) continue;
      for (let j = 0; j <= R; j++) M[r][j] -= f2 * M[c][j]; }
  }
  return Float64Array.from({ length: R }, (_, r) => M[r][R]);
}

const clockRes = { tca: [], means: [] }, errs = { tca: [], means: [] };
for (let fo = 0; fo < CFOLD; fo++) {
  const lo = Math.floor(fo * D / CFOLD), hi = Math.floor((fo + 1) * D / CFOLD);
  const te = [], tr = [];
  for (let k = 0; k < D; k++) {
    if (k >= lo && k < hi) te.push(k);
    else if (k < lo - PURGE || k >= hi + PURGE) tr.push(k);
  }
  const mu = new Float64Array(F), sg = new Float64Array(F);
  for (let f = 0; f < F; f++) { const a = []; for (const k of tr) for (let s = 0; s < S; s++) a.push(day[k][s][f]);
    mu[f] = stats.mean(a); sg[f] = stats.sd(a) || 1; }
  const zk = (k) => Array.from({ length: F }, (_, f) => Float64Array.from({ length: S }, (_, s) => (day[k][s][f] - mu[f]) / sg[f]));

  const Xtr = Array.from({ length: F }, () => Array.from({ length: S }, () => new Float64Array(tr.length)));
  tr.forEach((k, i) => { const z = zk(k); for (let f = 0; f < F; f++) for (let s = 0; s < S; s++) Xtr[f][s][i] = z[f][s]; });
  const cf = cpAls(Xtr, R_CLOCK, { seed: 3000 + fo, iters: 200 });

  const run = (cols, key) => {
    const m = stats.ols(tr.map(cols), tr.map((k) => k)), ybar = stats.mean(tr.map((k) => k));
    // Clip to the training range. A clock has a bounded dial; without this a
    // single extrapolating block can predict day -400 and drive the mean R^2
    // to -20 while the other folds sit near +0.8.
    const tlo = Math.min(...tr), thi = Math.max(...tr);
    let ss = 0, tt = 0; const ae = [];
    te.forEach((k) => { const x = cols(k); let p = m.beta[0];
      for (let j = 0; j < x.length; j++) p += m.beta[j + 1] * x[j];
      p = Math.max(tlo, Math.min(thi, p));
      ss += (k - p) ** 2; tt += (k - ybar) ** 2; ae.push(Math.abs(k - p)); });
    clockRes[key].push(1 - ss / tt);
    errs[key].push(stats.median(ae));
  };
  run((k) => [...project(zk(k), cf.A, cf.B)], 'tca');
  run((k) => { const z = zk(k); return Array.from({ length: F }, (_, f) => { let a = 0; for (let s = 0; s < S; s++) a += z[f][s]; return a / S; }); }, 'means');
}
console.log(`  span is ${D} days; a useless clock scores R^2 <= 0 and errs by ~${(D / 4).toFixed(0)} days`);
const rep = (key, label) => console.log(`  ${label.padEnd(28)} R^2 mean ${stats.mean(clockRes[key]).toFixed(3).padStart(7)}  median ${stats.median(clockRes[key]).toFixed(3).padStart(6)}   median err ${stats.mean(errs[key]).toFixed(1).padStart(5)} days`);
rep('means', 'daily feature means -> date');
rep('tca',   'TCA day-factors -> date');
console.log(`  per fold (TCA): ${clockRes.tca.map((v) => v.toFixed(2)).join('  ')}`);
console.log(`  per fold (means): ${clockRes.means.map((v) => v.toFixed(2)).join('  ')}`);
