// Self-test for the linear-algebra kernel. Run: node biome/cycles/test/linalg.selftest.mjs
// The stability verdict rests on these routines, so they're checked against matrices with
// known spectra (diagonal, triangular, rotation, companion) and inverse/identity round-trips.
import { inverse, matMul, matVec, identity, transpose, eigSymmetric, eigGeneral, spectralAbscissa } from '../sim/linalg.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`✓  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`✗  ${name}${extra ? '  — ' + extra : ''}`); }
};
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * (1 + Math.abs(b));
// match a computed spectrum to an expected one (as {re,im}) up to ordering
function spectrumMatches(got, want, tol = 1e-6) {
  if (got.length !== want.length) return false;
  const used = new Array(got.length).fill(false);
  return want.every((w) => {
    const i = got.findIndex((g, k) => !used[k] && Math.abs(g.re - w.re) < tol && Math.abs(g.im - w.im) < tol);
    if (i < 0) return false; used[i] = true; return true;
  });
}

// ── inverse / matMul ─────────────────────────────────────────────────────────
{
  const A = [[4, 7], [2, 6]];
  const Ai = inverse(A);
  const I = matMul(A, Ai);
  ok('A·A⁻¹ = I (2×2)', near(I[0][0], 1) && near(I[1][1], 1) && near(I[0][1], 0) && near(I[1][0], 0));

  const B = [[2, 0, 1], [1, 3, 2], [1, 0, 2]];
  const Bi = inverse(B);
  const J = matMul(B, Bi);
  ok('A·A⁻¹ = I (3×3)', [0, 1, 2].every((i) => [0, 1, 2].every((j) => near(J[i][j], i === j ? 1 : 0))));

  let threw = false; try { inverse([[1, 2], [2, 4]]); } catch { threw = true; }
  ok('singular matrix throws', threw);

  ok('matVec works', (() => { const y = matVec([[1, 2], [3, 4]], [5, 6]); return y[0] === 17 && y[1] === 39; })());
}

// ── symmetric eigenvalues ────────────────────────────────────────────────────
{
  // [[2,1],[1,2]] → eigenvalues 3, 1
  const e = eigSymmetric([[2, 1], [1, 2]]);
  ok('symmetric 2×2 eigenvalues {3,1}', near(e[0], 3) && near(e[1], 1), `[${e.map((x) => x.toFixed(3))}]`);
  // diagonal → the diagonal, sorted
  const d = eigSymmetric([[5, 0, 0], [0, -2, 0], [0, 0, 1]]);
  ok('symmetric diagonal eigenvalues sorted desc', near(d[0], 5) && near(d[1], 1) && near(d[2], -2));
  // trace is preserved
  const M = [[4, 1, 0], [1, 3, 1], [0, 1, 2]];
  const sum = eigSymmetric(M).reduce((a, b) => a + b, 0);
  ok('symmetric eigenvalues sum to trace', near(sum, 9), `Σλ=${sum.toFixed(4)}`);
}

// ── general (non-symmetric) eigenvalues ──────────────────────────────────────
{
  // diagonal
  ok('general: diagonal → diagonal entries', spectrumMatches(
     eigGeneral([[3, 0, 0], [0, -1, 0], [0, 0, 7]]),
     [{ re: 3, im: 0 }, { re: -1, im: 0 }, { re: 7, im: 0 }]));

  // upper triangular → eigenvalues are the diagonal
  ok('general: upper-triangular → diagonal', spectrumMatches(
     eigGeneral([[2, 5, 1], [0, 3, 9], [0, 0, -4]]),
     [{ re: 2, im: 0 }, { re: 3, im: 0 }, { re: -4, im: 0 }]));

  // rotation [[0,-1],[1,0]] → ±i (purely imaginary — the oscillation case)
  ok('general: rotation → ±i (complex pair)', spectrumMatches(
     eigGeneral([[0, -1], [1, 0]]), [{ re: 0, im: 1 }, { re: 0, im: -1 }]),
     JSON.stringify(eigGeneral([[0, -1], [1, 0]])));

  // damped oscillator [[-0.5,-1],[1,-0.5]] → -0.5 ± i
  ok('general: damped oscillator → -0.5 ± i', spectrumMatches(
     eigGeneral([[-0.5, -1], [1, -0.5]]), [{ re: -0.5, im: 1 }, { re: -0.5, im: -1 }]),
     JSON.stringify(eigGeneral([[-0.5, -1], [1, -0.5]]).map((e) => `${e.re.toFixed(2)}${e.im >= 0 ? '+' : ''}${e.im.toFixed(2)}i`)));

  // companion matrix of (λ-1)(λ-2)(λ-3) = λ³-6λ²+11λ-6 → eigenvalues 1,2,3
  const comp = [[6, -11, 6], [1, 0, 0], [0, 1, 0]];
  ok('general: companion matrix → roots {1,2,3}', spectrumMatches(
     eigGeneral(comp), [{ re: 1, im: 0 }, { re: 2, im: 0 }, { re: 3, im: 0 }], 1e-4),
     eigGeneral(comp).map((e) => e.re.toFixed(3)).join(','));

  // trace invariance on a random-ish 4×4
  const R = [[1, 2, -1, 0], [0.5, -2, 1, 1], [3, 0, 1, -2], [-1, 1, 0, 2]];
  const trace = R.reduce((s, r, i) => s + r[i], 0);
  const sumRe = eigGeneral(R).reduce((s, e) => s + e.re, 0);
  ok('general: Σ Re(λ) = trace (4×4)', near(sumRe, trace, 1e-6), `Σ=${sumRe.toFixed(4)} vs tr=${trace}`);
}

// ── spectral abscissa (the stability quantity) ───────────────────────────────
{
  ok('spectralAbscissa picks the rightmost real part',
     near(spectralAbscissa([[-0.5, -1], [1, -0.5]]), -0.5),
     `α=${spectralAbscissa([[-0.5, -1], [1, -0.5]]).toFixed(3)}`);
  ok('a stable matrix has α < 0, an unstable one α > 0',
     spectralAbscissa([[-2, 0], [0, -3]]) < 0 && spectralAbscissa([[1, 0], [0, -3]]) > 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
