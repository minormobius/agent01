// proofs/mub/mub.js — mutually unbiased bases in ℂ⁶ and order-six complex
// Hadamard matrices. The only copy of the maths: the page, search.worker.js
// and mub.selftest.mjs all import this file.
//
// Two orthonormal bases B, C of ℂᵈ are mutually unbiased when |⟨b,c⟩|² = 1/d
// for every b ∈ B, c ∈ C, with ⟨u,v⟩ = Σⱼ conj(uⱼ)·vⱼ (the paper's convention).

export const D = 6;

// ------------------------------------------------------------- complex ---
// A complex number is [re, im].
export const cx = {
  of: (re, im = 0) => [re, im],
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
  conj: (a) => [a[0], -a[1]],
  abs2: (a) => a[0] * a[0] + a[1] * a[1],
  inv: (a) => { const n = a[0] * a[0] + a[1] * a[1]; return [a[0] / n, -a[1] / n]; },
  cis: (t) => [Math.cos(t), Math.sin(t)],
  arg: (a) => Math.atan2(a[1], a[0]),
};

// ⟨u,v⟩ = Σ conj(uⱼ) vⱼ
export function inner(u, v) {
  let re = 0, im = 0;
  for (let j = 0; j < u.length; j++) { re += u[j][0] * v[j][0] + u[j][1] * v[j][1]; im += u[j][0] * v[j][1] - u[j][1] * v[j][0]; }
  return [re, im];
}

// a small seeded generator (mulberry32), so every search is reproducible
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------- exact ℤ[ζ₁₂] ---
// ζ = e^{iπ/6}. Its minimal polynomial is Φ₁₂ = x⁴ − x² + 1, so an element is
// [a₀, a₁, a₂, a₃] = a₀ + a₁ζ + a₂ζ² + a₃ζ³ with BigInt coefficients.
// i = ζ³, ω = e^{2πi/3} = ζ⁴ = ζ² − 1, √3 = ζ + ζ⁻¹.
export const Z = {
  zero: () => [0n, 0n, 0n, 0n],
  int: (n) => [BigInt(n), 0n, 0n, 0n],
  add: (a, b) => a.map((x, k) => x + b[k]),
  sub: (a, b) => a.map((x, k) => x - b[k]),
  neg: (a) => a.map((x) => -x),
  mul(a, b) {
    const p = new Array(7).fill(0n);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) p[i + j] += a[i] * b[j];
    // reduce with x⁴ = x² − 1 from the top down
    for (let k = 6; k >= 4; k--) { const c = p[k]; if (c) { p[k] = 0n; p[k - 2] += c; p[k - 4] -= c; } }
    return p.slice(0, 4);
  },
  // ζᵏ for any integer k
  pow(k) {
    k = ((k % 12) + 12) % 12;
    let r = Z.int(1); const z = [0n, 1n, 0n, 0n];
    for (let i = 0; i < k; i++) r = Z.mul(r, z);
    return r;
  },
  // complex conjugation: ζ ↦ ζ⁻¹ = ζ¹¹
  conj(a) {
    let r = Z.zero();
    for (let k = 0; k < 4; k++) if (a[k]) r = Z.add(r, Z.mul(Z.int(a[k]), Z.pow(-k)));
    return r;
  },
  isZero: (a) => a.every((x) => x === 0n),
  eq: (a, b) => a.every((x, k) => x === b[k]),
  // |a|², which is real; returned as an element so the caller can test it exactly
  norm: (a) => Z.mul(a, Z.conj(a)),
  toC(a) { let re = 0, im = 0; for (let k = 0; k < 4; k++) { re += Number(a[k]) * Math.cos((k * Math.PI) / 6); im += Number(a[k]) * Math.sin((k * Math.PI) / 6); } return [re, im]; },
};
const I_ = 3, OMEGA = 4;                 // i = ζ³, ω = ζ⁴ as ζ-exponents

// ---------------------------------------------- three bases (the lower bound)
// The paper's Lemma (tensor-product construction, Klappenecker–Rötteler):
//   A₀ = I₂, A₁ = (1/√2)[[1, 1], [1, −1]], A₂ = (1/√2)[[1, 1], [i, −i]]
//   F = (1/√3)(ω^{jk}), D = diag(1, ω, ω), B₀ = I₃, B₁ = F, B₂ = DF
//   U_r = A_r ⊗ B_r, whose columns form the r-th basis.
// Every entry of √2·A_r (r ≥ 1) and √3·B_r (r ≥ 1) is a power of ζ, so each basis
// is stored exactly as U_r = M_r / √k_r with M_r a matrix of ζ-exponents
// (null = 0) and k_r ∈ {1, 6}.
function kron(a, b) {        // matrices of ζ-exponents, null for 0
  const n = a.length, m = b.length, out = [];
  for (let i = 0; i < n * m; i++) {
    out.push([]);
    for (let j = 0; j < n * m; j++) {
      const x = a[Math.floor(i / m)][Math.floor(j / m)], y = b[i % m][j % m];
      out[i].push(x === null || y === null ? null : (x + y) % 12);
    }
  }
  return out;
}
export function tensorBases() {
  const A = [[[0, null], [null, 0]], [[0, 0], [0, 6]], [[0, 0], [I_, I_ + 6]]];          // ζ⁶ = −1
  const F = [0, 1, 2].map((j) => [0, 1, 2].map((k) => (OMEGA * j * k) % 12));
  const DF = F.map((row, j) => row.map((e) => (e + (j === 0 ? 0 : OMEGA)) % 12));
  const B = [[[0, null, null], [null, 0, null], [null, null, 0]], F, DF];
  return [0, 1, 2].map((r) => ({ exps: kron(A[r], B[r]), k: r === 0 ? 1 : 6 }));
}
// numeric columns of U_r: vectors[j] = column j
export function basisVectors(b) {
  const s = 1 / Math.sqrt(b.k);
  return b.exps[0].map((_, j) => b.exps.map((row) => (row[j] === null ? [0, 0] : cx.cis((row[j] * Math.PI) / 6).map((x) => x * s))));
}
// Exact check of every inner product among the three bases.
// For bases r, s: ⟨u_i, v_j⟩ = (M_r* M_s)_{ij} / √(k_r k_s), so
// |⟨u_i,v_j⟩|² = |m|² / (k_r k_s) with m ∈ ℤ[ζ₁₂] computed exactly.
export function exactCheck(bases = tensorBases()) {
  const el = (e) => (e === null ? Z.zero() : Z.pow(e));
  const rows = [];
  for (let r = 0; r < bases.length; r++) for (let s = r; s < bases.length; s++) {
    const Mr = bases[r].exps, Ms = bases[s].exps, kk = BigInt(bases[r].k * bases[s].k);
    let ok = 0, total = 0;
    for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) {
      let m = Z.zero();
      for (let t = 0; t < D; t++) m = Z.add(m, Z.mul(Z.conj(el(Mr[t][i])), el(Ms[t][j])));
      const n2 = Z.norm(m);
      // want |⟨⟩|² = δ_ij when r = s and 1/6 when r ≠ s, i.e. |m|² = kk·want
      const want = r === s ? (i === j ? Z.int(kk) : Z.zero()) : (kk % 6n === 0n ? Z.int(kk / 6n) : null);
      total++;
      if (want && Z.eq(n2, want)) ok++;
    }
    rows.push({ r, s, ok, total });
  }
  return rows;
}

// ---------------------------------------- the standard–Fourier pair (Grassl)
// F₆ = (e^{2πi jk/6}). A vector x with |xⱼ| = 1 is unbiased to the standard
// basis (after scaling by 1/√6); it is unbiased to F₆/√6 as well exactly when
// |Σₖ e^{2πi jk/6} xₖ|² = 6 for every j. Fixing x₀ = 1 leaves five phases and
// five independent equations (Parseval makes the sixth redundant).
export function fourierMatrix(d = D) {
  return Array.from({ length: d }, (_, j) => Array.from({ length: d }, (_, k) => cx.cis((2 * Math.PI * j * k) / d)));
}
function grasslResidual(th) {
  const x = [[1, 0], ...th.map(cx.cis)], r = [], J = [];
  for (let j = 0; j < D; j++) {
    let re = 0, im = 0; const dre = [], dim = [];
    for (let k = 0; k < D; k++) {
      const [c, s] = cx.cis((2 * Math.PI * j * k) / D), a = x[k][0] * c - x[k][1] * s, b = x[k][0] * s + x[k][1] * c;
      re += a; im += b; if (k > 0) { dre.push(-b); dim.push(a); }
    }
    r.push(re * re + im * im - D); J.push(dre.map((v, i) => 2 * re * v + 2 * im * dim[i]));
  }
  return [r, J];
}
// least squares by the normal equations (tiny systems only)
function lsq(J, r, lam = 1e-12) {
  const m = J[0].length, A = [];
  for (let a = 0; a < m; a++) {
    A.push([]);
    for (let b = 0; b < m; b++) { let s = a === b ? lam : 0; for (const row of J) s += row[a] * row[b]; A[a].push(s); }
    let s = 0; J.forEach((row, i) => { s += row[a] * r[i]; }); A[a].push(s);
  }
  for (let c = 0; c < m; c++) {
    let p = c; for (let q = c + 1; q < m; q++) if (Math.abs(A[q][c]) > Math.abs(A[p][c])) p = q;
    [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-300) return null;
    for (let q = 0; q < m; q++) if (q !== c) { const f = A[q][c] / A[c][c]; for (let k = c; k <= m; k++) A[q][k] -= f * A[c][k]; }
  }
  return A.map((row, i) => row[m] / row[i]);
}
const wrap = (t) => { const u = t % (2 * Math.PI); return u < 0 ? u + 2 * Math.PI : u; };
// Random-start Gauss–Newton. Returns the distinct solutions with x₀ = 1 as unit-modulus
// vectors (not yet scaled by 1/√6), polished until every residual is below 1e−13.
export function grasslVectors({ starts = 2000, seed = 1, onProgress } = {}) {
  const rnd = rng(seed), found = new Map();
  let firstFull = null;
  for (let it = 0; it < starts; it++) {
    let th = Array.from({ length: D - 1 }, () => rnd() * 2 * Math.PI), res = Infinity;
    for (let s = 0; s < 60; s++) {
      const [r, J] = grasslResidual(th);
      res = Math.max(...r.map(Math.abs));
      if (res < 1e-13) break;
      const dx = lsq(J, r); if (!dx) break;
      th = th.map((t, i) => t - dx[i]);
    }
    if (res < 1e-13) {
      th = th.map(wrap);
      const key = th.map((t) => { const c = cx.cis(t); return Math.round(c[0] * 1e6) + ':' + Math.round(c[1] * 1e6); }).join(',');
      if (!found.has(key)) { found.set(key, { th, res }); if (found.size === 48 && firstFull === null) firstFull = it + 1; }
    }
    if (onProgress && (it + 1) % 100 === 0) onProgress(it + 1, found.size);
  }
  const sols = [...found.values()].sort((a, b) => { for (let i = 0; i < a.th.length; i++) if (Math.abs(a.th[i] - b.th[i]) > 1e-9) return a.th[i] - b.th[i]; return 0; });
  return { vectors: sols.map((s) => [[1, 0], ...s.th.map(cx.cis)]), phases: sols.map((s) => s.th), maxResidual: Math.max(0, ...sols.map((s) => s.res)), starts, firstFull };
}

// The paper's Stage C, on one fixed pair. Make the unit vectors v/√6 the vertices of two
// graphs: an 𝒪 edge for an orthogonal pair, a 𝒰 edge for an unbiased pair. A further
// basis is a 6-clique in 𝒪; two further mutually unbiased bases would be two disjoint
// 6-cliques with all 36 cross edges in 𝒰.
export function stageC(vectors, tol = 1e-9) {
  const n = vectors.length, ov = [];
  for (let i = 0; i < n; i++) { ov.push([]); for (let j = 0; j < n; j++) ov[i].push(cx.abs2(inner(vectors[i], vectors[j])) / (D * D)); }
  const O = ov.map((row, i) => row.map((x, j) => i !== j && x < tol));
  const U = ov.map((row, i) => row.map((x, j) => i !== j && Math.abs(x - 1 / D) < tol));
  let maxErr = 0, margin = Infinity; const values = new Map();
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const x = ov[i][j];
    if (O[i][j]) maxErr = Math.max(maxErr, x);
    else if (U[i][j]) maxErr = Math.max(maxErr, Math.abs(x - 1 / D));
    else margin = Math.min(margin, x, Math.abs(x - 1 / D));
    const key = O[i][j] ? '0' : U[i][j] ? '1/6' : x.toFixed(6);
    values.set(key, (values.get(key) || 0) + 1);
  }
  const cliques = [];
  (function grow(c, cand) {
    if (c.length === D) { cliques.push(c); return; }
    for (const v of cand) grow([...c, v], cand.filter((w) => w > v && O[v][w]));
  })([], [...Array(n).keys()]);
  const pairs = [];
  for (let a = 0; a < cliques.length; a++) for (let b = a + 1; b < cliques.length; b++) {
    let cross = 0; const disjoint = cliques[a].every((x) => !cliques[b].includes(x));
    for (const x of cliques[a]) for (const y of cliques[b]) if (U[x][y]) cross++;
    pairs.push({ a, b, disjoint, cross });
  }
  return { n, ov, O, U, maxErr, margin, values: [...values.entries()], degrees: O.map((r) => r.filter(Boolean).length), cliques, pairs, full: pairs.filter((p) => p.disjoint && p.cross === 36).length };
}

// --------------------------------------------- the search for a fourth basis
// Numerical evidence only, in the spirit of Butterley–Hall (2007) and
// Brierley–Weigert (2008). Basis 0 is the standard basis. Bases 1..k−1 are free
// complex d × d matrices whose columns are pushed towards being orthonormal and
// unbiased by minimising
//   f = Σ_r Σ_{j≤l} w·|⟨x_j,x_l⟩ − δ_jl|² + Σ_r Σ_ij (|x_ij|² − 1/d)² + Σ_{r<t} Σ_jl (|⟨x_j,y_l⟩|² − 1/d)²
// with Adam. f = 0 exactly at a family of k mutually unbiased bases.
export function mubObjective(d, k, x, g) {
  const B = k - 1, idx = (r, i, j, c) => (((r * d + i) * d + j) << 1) + c;
  if (g) g.fill(0);
  let f = 0;
  for (let r = 0; r < B; r++) for (let j = 0; j < d; j++) for (let l = j; l < d; l++) {
    let re = 0, im = 0;
    for (let i = 0; i < d; i++) { const a = x[idx(r, i, j, 0)], b = x[idx(r, i, j, 1)], c = x[idx(r, i, l, 0)], e = x[idx(r, i, l, 1)]; re += a * c + b * e; im += a * e - b * c; }
    const dr = re - (j === l ? 1 : 0), w = j === l ? 1 : 2;
    f += w * (dr * dr + im * im);
    if (g) for (let i = 0; i < d; i++) {
      const a = x[idx(r, i, j, 0)], b = x[idx(r, i, j, 1)], c = x[idx(r, i, l, 0)], e = x[idx(r, i, l, 1)];
      g[idx(r, i, j, 0)] += 2 * w * (dr * c + im * e); g[idx(r, i, j, 1)] += 2 * w * (dr * e - im * c);
      g[idx(r, i, l, 0)] += 2 * w * (dr * a - im * b); g[idx(r, i, l, 1)] += 2 * w * (dr * b + im * a);
    }
  }
  for (let r = 0; r < B; r++) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) {
    const a = x[idx(r, i, j, 0)], b = x[idx(r, i, j, 1)], q = a * a + b * b - 1 / d;
    f += q * q;
    if (g) { g[idx(r, i, j, 0)] += 4 * q * a; g[idx(r, i, j, 1)] += 4 * q * b; }
  }
  for (let r = 0; r < B; r++) for (let t = r + 1; t < B; t++) for (let j = 0; j < d; j++) for (let l = 0; l < d; l++) {
    let re = 0, im = 0;
    for (let i = 0; i < d; i++) { const a = x[idx(r, i, j, 0)], b = x[idx(r, i, j, 1)], c = x[idx(t, i, l, 0)], e = x[idx(t, i, l, 1)]; re += a * c + b * e; im += a * e - b * c; }
    const q = re * re + im * im - 1 / d;
    f += q * q;
    if (g) for (let i = 0; i < d; i++) {
      const a = x[idx(r, i, j, 0)], b = x[idx(r, i, j, 1)], c = x[idx(t, i, l, 0)], e = x[idx(t, i, l, 1)];
      g[idx(r, i, j, 0)] += 4 * q * (re * c + im * e); g[idx(r, i, j, 1)] += 4 * q * (re * e - im * c);
      g[idx(t, i, l, 0)] += 4 * q * (re * a - im * b); g[idx(t, i, l, 1)] += 4 * q * (re * b + im * a);
    }
  }
  return f;
}
export function mubSearch(d, k, { steps = 12000, seed = 1, every = 100, onProgress } = {}) {
  const rnd = rng(seed), n = (k - 1) * d * d * 2;
  const x = Float64Array.from({ length: n }, () => rnd() * 2 - 1), g = new Float64Array(n), m = new Float64Array(n), v = new Float64Array(n);
  let lr = 0.02, f = Infinity, b1 = 1, b2 = 1;
  const trace = [];
  for (let it = 1; it <= steps; it++) {
    f = mubObjective(d, k, x, g);
    b1 *= 0.9; b2 *= 0.999;
    for (let p = 0; p < n; p++) {
      m[p] = 0.9 * m[p] + 0.1 * g[p]; v[p] = 0.999 * v[p] + 0.001 * g[p] * g[p];
      x[p] -= (lr * (m[p] / (1 - b1))) / (Math.sqrt(v[p] / (1 - b2)) + 1e-12);
    }
    if (it % 2000 === 0) lr *= 0.5;
    if (it % every === 0) { trace.push([it, f]); if (onProgress) onProgress(it, f); }
  }
  f = mubObjective(d, k, x, null);
  return { d, k, f, trace, x };
}

// ----------------------------------------- order-six complex Hadamard matrices
// IsHadamard H: every |H_ij|² = 1 and H*H = 6I (the Lean definition).
export function hadamardError(H) {
  let e = 0;
  for (const row of H) for (const z of row) e = Math.max(e, Math.abs(cx.abs2(z) - 1));
  for (let a = 0; a < D; a++) for (let b = 0; b < D; b++) {
    let re = 0, im = 0;                     // (H*H)_ab = Σ_k conj(H_ka) H_kb
    for (let k = 0; k < D; k++) { re += H[k][a][0] * H[k][b][0] + H[k][a][1] * H[k][b][1]; im += H[k][a][0] * H[k][b][1] - H[k][a][1] * H[k][b][0]; }
    e = Math.max(e, Math.hypot(re - (a === b ? D : 0), im));
  }
  return e;
}
export const square = (H) => H.map((row) => row.map((z) => cx.mul(z, z)));

// Tao's cubic matrix T = (ω^{t_ij}), exponents as in the Lean `taoExponent` (2 for −1).
export const TAO_EXPONENT = [
  [0, 0, 0, 0, 0, 0],
  [0, 0, 1, 2, 2, 1],
  [0, 1, 0, 1, 2, 2],
  [0, 2, 1, 0, 1, 2],
  [0, 2, 2, 1, 0, 1],
  [0, 1, 2, 2, 1, 0],
];
export const tao = () => TAO_EXPONENT.map((row) => row.map((e) => cx.cis((2 * Math.PI * e) / 3)));

// The two-parameter affine Fourier family F₆⁽²⁾(a, b) (Tadej–Życzkowski catalogue):
// F₆ with phase e^{ia} on entries (odd row, column ≡ 1 mod 3) and e^{ib} on (odd row, column ≡ 2 mod 3).
export function fourierFamily(a = 0, b = 0) {
  const F = fourierMatrix(D);
  return F.map((row, i) => row.map((z, j) => (i % 2 === 1 && j % 3 === 1 ? cx.mul(z, cx.cis(a)) : i % 2 === 1 && j % 3 === 2 ? cx.mul(z, cx.cis(b)) : z)));
}

// A random Hadamard matrix: Gauss–Newton from random phases on the 25 entries
// outside the first row and column, solving H H* = 6I (the 15 off-diagonal
// row products, real and imaginary parts). Converges to points across the whole
// solution set, including, now and then, the isolated cubic class.
function hadamardFromPhases(ph) {
  return Array.from({ length: D }, (_, i) => Array.from({ length: D }, (_, j) => cx.cis(i && j ? ph[(i - 1) * 5 + j - 1] : 0)));
}
export function randomHadamard(rnd = Math.random, { tries = 50 } = {}) {
  for (let t = 0; t < tries; t++) {
    let ph = Array.from({ length: 25 }, () => rnd() * 2 * Math.PI);
    for (let s = 0; s < 80; s++) {
      const h = hadamardFromPhases(ph), r = [], J = [];
      for (let a = 0; a < D; a++) for (let b = a + 1; b < D; b++) {
        let re = 0, im = 0; const gr = new Array(25).fill(0), gi = new Array(25).fill(0);
        for (let k = 0; k < D; k++) {
          const [x1, y1] = h[a][k], [x2, y2] = h[b][k], pr = x1 * x2 + y1 * y2, pi = y1 * x2 - x1 * y2;
          re += pr; im += pi;
          if (a && k) { gr[(a - 1) * 5 + k - 1] -= pi; gi[(a - 1) * 5 + k - 1] += pr; }
          if (b && k) { gr[(b - 1) * 5 + k - 1] += pi; gi[(b - 1) * 5 + k - 1] -= pr; }
        }
        r.push(re, im); J.push(gr, gi);
      }
      if (Math.max(...r.map(Math.abs)) < 1e-13) return h;
      const dx = lsq(J, r, 1e-9); if (!dx) break;
      ph = ph.map((p, i) => p - dx[i]);
    }
  }
  return null;
}

// Charges: the Lean `permuteCharge π alpha = alpha ∘ π` with alpha = (1,1,1,−1,−1,−1).
// They are exactly the 20 vectors with three +1 and three −1; we index them by the
// set of +1 rows.
export function charges() {
  const out = [];
  for (let a = 0; a < D; a++) for (let b = a + 1; b < D; b++) for (let c = b + 1; c < D; c++) {
    const plus = [a, b, c]; out.push({ plus, a: Array.from({ length: D }, (_, i) => (plus.includes(i) ? 1 : -1)) });
  }
  return out;
}
// g H a = 6⁻¹ · Σ_k ∏_i (H i k)^(a i), as in the Lean `g` and `character`
export function gValue(H, a) {
  let s = [0, 0];
  for (let k = 0; k < D; k++) {
    let p = [1, 0];
    for (let i = 0; i < D; i++) { const z = H[i][k], e = a[i]; for (let t = 0; t < Math.abs(e); t++) p = cx.mul(p, e > 0 ? z : cx.inv(z)); }
    s = cx.add(s, p);
  }
  return [s[0] / D, s[1] / D];
}
// exact |6·g|² for a matrix whose entries are ζ₁₂-powers (given as exponents mod 12)
export function gExact(exps, a) {
  let s = Z.zero();
  for (let k = 0; k < D; k++) { let e = 0; for (let i = 0; i < D; i++) e += a[i] * exps[i][k]; s = Z.add(s, Z.pow(e)); }
  return Z.norm(s);
}
export const TAO_ZETA = TAO_EXPONENT.map((row) => row.map((e) => (4 * e) % 12));        // ω = ζ⁴
export const F6_ZETA = [0, 1, 2, 3, 4, 5].map((j) => [0, 1, 2, 3, 4, 5].map((k) => (2 * j * k) % 12));  // e^{2πi/6} = ζ²

// Dephase (first row and column all 1), then ask whether every entry is a cube root of
// unity. By the Butson classification the paper cites (Lampio–Östergård–Szöllősi 2020),
// order-six Hadamard matrices with cube-root entries form one class: Tao's.
export function dephase(H) {
  return H.map((row, i) => row.map((z, j) => cx.mul(cx.mul(z, cx.inv(H[i][0])), cx.mul(cx.inv(H[0][j]), H[0][0]))));
}
export function isCubic(H, tol = 1e-9) {
  return dephase(H).every((row) => row.every((z) => { const t = cx.arg(z) / ((2 * Math.PI) / 3); return Math.abs(t - Math.round(t)) < tol; }));
}

// The Lean `Equivalent`: K i j = u i · H (r i) (c j) · v j, with permutations r, c and unit phases u, v.
export function randomEquivalent(H, rnd = Math.random) {
  const perm = () => { const p = [0, 1, 2, 3, 4, 5]; for (let i = 5; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; };
  const r = perm(), c = perm(), u = r.map(() => cx.cis(rnd() * 2 * Math.PI)), v = c.map(() => cx.cis(rnd() * 2 * Math.PI));
  return H.map((_, i) => H.map((__, j) => cx.mul(cx.mul(u[i], H[r[i]][c[j]]), v[j])));
}
