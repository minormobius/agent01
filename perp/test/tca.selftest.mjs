#!/usr/bin/env node
// Known-answer proof for lab/tca.mjs (CP/PARAFAC by alternating least squares).
// Builds tensors from KNOWN factors and checks they come back out, then checks
// that the rank-selection signal (restart reproducibility) peaks at the true
// rank. Without this, a decomposition that silently converges to garbage still
// "works" — CP-ALS always returns something.
import { cpAls, similarity } from '../lab/tca.mjs';

const rng = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const corr = (u, v) => { const n = u.length; let mu = 0, mv = 0;
  for (let i = 0; i < n; i++) { mu += u[i]; mv += v[i]; } mu /= n; mv /= n;
  let c = 0, su = 0, sv = 0;
  for (let i = 0; i < n; i++) { const a = u[i] - mu, b = v[i] - mv; c += a * b; su += a * a; sv += b * b; }
  return c / Math.sqrt(su * sv); };
const col = (M, r) => Float64Array.from(M, (row) => row[r]);

let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) fail++;
};

console.log('tca selftest\n');

const I = 7, J = 24, K = 300, R = 3;
const rand = rng(42);
const At = Array.from({length: I}, (_, i) => Float64Array.from({length: R}, (_, r) => Math.sin(1 + i * (r + 1) * 0.7)));
const Bt = Array.from({length: J}, (_, j) => Float64Array.from({length: R}, (_, r) => Math.cos(2 * Math.PI * (r + 1) * j / J) + 0.4));
const Ct = Array.from({length: K}, (_, k) => Float64Array.from({length: R}, (_, r) => Math.exp(-((k - K * (r + 1) / 4) ** 2) / (2 * (K / 6) ** 2))));

const build = (noise) => Array.from({length: I}, (_, i) => Array.from({length: J}, (_, j) => {
  const row = new Float64Array(K);
  for (let k = 0; k < K; k++) { let v = 0; for (let r = 0; r < R; r++) v += At[i][r] * Bt[j][r] * Ct[k][r]; row[k] = v + noise * (rand() * 2 - 1); }
  return row;
}));

const recovery = (fit) => {
  const used = new Set(); const out = [];
  for (let r = 0; r < R; r++) {
    let best = -1, bs = -1;
    for (let q = 0; q < R; q++) {
      if (used.has(q)) continue;
      const s = Math.abs(corr(col(At, r), col(fit.A, q))) * Math.abs(corr(col(Bt, r), col(fit.B, q))) * Math.abs(corr(col(Ct, r), col(fit.C, q)));
      if (s > bs) { bs = s; best = q; }
    }
    used.add(best); out.push(bs);
  }
  return Math.min(...out);
};

const clean = cpAls(build(0), R, { seed: 7, iters: 600 });
check('noiseless rank-3 tensor is fit exactly', clean.fitR2 > 0.9999, `R² ${clean.fitR2.toFixed(6)}`);
check('noiseless factors are recovered', recovery(clean) > 0.999, `worst component ${recovery(clean).toFixed(5)}`);

const noisy = cpAls(build(0.25), R, { seed: 7, iters: 600 });
check('factors survive heavy noise', recovery(noisy) > 0.99, `worst component ${recovery(noisy).toFixed(4)}`);

// Rank selection: reproducibility across random restarts must peak at the TRUE
// rank and fall away when over-parameterised. This is the signal the analysis
// relies on to choose a rank, so it has to be shown to work on a known answer.
const X = build(0.02);
const sims = {};
for (let r = 1; r <= 5; r++) {
  const fits = [0, 1, 2].map((s) => cpAls(X, r, { seed: 100 + s, iters: 400 }));
  sims[r] = (similarity(fits[0], fits[1]) + similarity(fits[0], fits[2]) + similarity(fits[1], fits[2])) / 3;
}
check('restart reproducibility peaks at the true rank',
  sims[3] > 0.99 && sims[4] < sims[3] && sims[5] < sims[3],
  Object.entries(sims).map(([r, v]) => `R${r}:${v.toFixed(3)}`).join('  '));

console.log(fail ? `\n${fail} FAILED` : '\nall checks passed');
process.exit(fail ? 1 : 0);
