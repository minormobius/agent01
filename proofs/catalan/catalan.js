// proofs/catalan/catalan.js — the finite certificates in the 2026 proof that
// Catalan's constant G = Σ (−1)^j/(2j+1)² is irrational, replayed exactly.
//
// The ONE copy of the maths: index.html, search.worker.js and
// catalan.selftest.mjs all import it.
//
// Source: openai/math family 005, "Catalan's constant is irrational"
// (preprints/Catalans-constant-is-irrational-September-24-2026), §§ "An
// exact certificate for the fixed matrices" and "An exact certificate for
// the two barriers". Every table below is transcribed from that source.
//
// The proof compares two bounds on L_N = log|Δ_N|/(48N)² − ½log 2 for
// determinants Δ_N of size 48N: if G were rational, liminf L_N > −2.29084
// (arithmetic, along nonzero Δ_N); unconditionally, limsup L_N ≤
// −2.290939875 (analysis). This module replays the two FINITE certificates
// those bounds rest on: the nonvanishing of three fixed 48×48 rational
// matrices, and the exact real-place barrier certificate.

// ================================================================ rationals ==
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
export const Q = {
  of: (n, d = 1n) => Q.norm(BigInt(n), BigInt(d)),
  norm(n, d) { if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return [n / g, d / g]; },
  add: (a, b) => Q.norm(a[0] * b[1] + b[0] * a[1], a[1] * b[1]),
  sub: (a, b) => Q.norm(a[0] * b[1] - b[0] * a[1], a[1] * b[1]),
  mul: (a, b) => Q.norm(a[0] * b[0], a[1] * b[1]),
  div: (a, b) => Q.norm(a[0] * b[1], a[1] * b[0]),
  neg: (a) => [-a[0], a[1]],
  isZero: (a) => a[0] === 0n,
  sign: (a) => (a[0] > 0n ? 1 : a[0] < 0n ? -1 : 0),
  cmp: (a, b) => Q.sign(Q.sub(a, b)),
  zero: [0n, 1n], one: [1n, 1n],
  /** Exact decimal string "0.85" or "-2.290939875" → rational. */
  dec(s) {
    const neg = s.startsWith('-'); if (neg) s = s.slice(1);
    const [i, f = ''] = s.split('.');
    return Q.norm((neg ? -1n : 1n) * BigInt((i || '0') + f), 10n ** BigInt(f.length));
  },
  toNumber: (a) => Number(a[0] * 10n ** 18n / a[1]) / 1e18,
};

// ============================================== certificate 1: nonvanishing ==
// "An exact certificate for the fixed matrices": every entry of the 49 × 48
// matrix ℬ by rational recurrences, then Gaussian elimination mod 101.

/** Build ℬ exactly over ℚ (rows 0..48, columns 0..47), following the recipe verbatim. */
export function buildB() {
  // m_0 = 2, m_odd = 0, m_i = i m_{i-2}/(i+1)
  const m = [];
  for (let i = 0; i <= 64; i++) m[i] = i === 0 ? Q.of(2) : i % 2 ? Q.zero : Q.div(Q.mul(Q.of(i), m[i - 2]), Q.of(i + 1));
  const km = [Q.zero, Q.of(2)], kp = [Q.zero, Q.zero];
  for (let d = 2; d <= 64; d++) km[d] = Q.div(Q.add(Q.add(Q.mul(Q.of(d - 1), km[d - 2]), m[d - 2]), m[d - 1]), Q.of(d));
  for (let d = 2; d <= 58; d++) kp[d] = Q.div(Q.add(Q.mul(Q.of(d - 2), kp[d - 2]), Q.of(2, d - 1)), Q.of(d - 1));
  // Y_ij = M^0(i,j) on 0 ≤ i ≤ 64, 0 ≤ j ≤ 58
  const Y = Array.from({ length: 65 }, () => new Array(59));
  for (let i = 0; i <= 64; i++) Y[i][0] = km[i];
  for (let j = 0; j <= 58; j++) Y[0][j] = kp[j];
  for (let i = 1; i <= 64; i++) for (let j = 1; j <= 58; j++) Y[i][j] = Q.sub(Y[i - 1][j - 1], Q.div(m[i - 1], Q.of(j)));
  // harmonic-type sums B_i^(d)
  const B1 = [Q.zero], B2 = [Q.zero];
  for (let u = 1; u <= 64; u++) { B1[u] = Q.add(B1[u - 1], Q.of(1, u)); B2[u] = Q.add(B2[u - 1], Q.of(1, u * u)); }
  const threeHalves = Q.of(3, 2);
  const J = Array.from({ length: 65 }, (_, i) => Array.from({ length: 59 }, (_, j) =>
    Q.mul(threeHalves, i === j ? Q.neg(B2[i]) : Q.div(Q.sub(B1[i], B1[j]), Q.of(i - j)))));
  // E_m = t^62 T_m(1/t), I_m = t^62 U_{m-1}(1/t), as integer coefficient arrays
  const poly = (deg) => new Array(65).fill(0n);
  const mono = (k) => { const p = poly(); p[k] = 1n; return p; };
  const step = (prev, prev2) => { const p = poly(); for (let k = 1; k <= 64; k++) p[k - 1] += 2n * prev[k]; if (prev[0] !== 0n) throw new Error('division by t not exact'); for (let k = 0; k <= 64; k++) p[k] -= prev2[k]; return p; };
  const E = [mono(62), mono(61)], I = [poly(), mono(62)];
  for (let k = 2; k <= 44; k++) { E[k] = step(E[k - 1], E[k - 2]); I[k] = step(I[k - 1], I[k - 2]); }
  const times1mt2 = (p) => { const q = poly(); for (let k = 0; k <= 64; k++) { if (!p[k]) continue; q[k] += p[k]; if (k + 1 <= 64) q[k + 1] -= 2n * p[k]; if (k + 2 <= 64) q[k + 2] += p[k]; else if (p[k]) throw new Error('degree overflow'); } return q; };
  const rows = [];
  for (let r = 0; r <= 48; r++) {
    const u = Math.abs(r - 4), sg = BigInt(Math.sign(r - 4));
    const y = times1mt2(E[u]), z = times1mt2(I[u]).map((c) => c * sg);
    let v = [];
    for (let j = 7; j <= 58; j++) {
      let s = Q.zero;
      for (let i = 0; i <= 64; i++) {
        if (y[i]) s = Q.add(s, Q.mul([y[i], 1n], Y[i][j]));
        if (z[i]) s = Q.sub(s, Q.mul([z[i], 1n], J[i][j]));
      }
      v.push(s);
    }
    for (let t = 0; t < 4; t++) v = v.slice(0, -1).map((x, j) => Q.sub(x, v[j + 1]));
    rows.push(v);
  }
  return rows;
}

const P101 = 101n;
const mod = (a) => ((a % P101) + P101) % P101;
const inv101 = (a) => { let r = 1n, b = mod(a), e = P101 - 2n; while (e) { if (e & 1n) r = (r * b) % P101; b = (b * b) % P101; e >>= 1n; } return r; };
/** A rational reduced mod 101 (its denominator must be a unit). */
export const toF101 = (q) => { if (mod(q[1]) === 0n) throw new Error('denominator divisible by 101'); return mod(q[0]) * inv101(q[1]) % P101; };

/**
 * The paper's elimination rule for ℬ₀ + σℬ₁ over 𝔽₁₀₁: returns the pivots
 * and the swaps, in the order the paper records them.
 */
export function pivots101(B, sigma) {
  const R = Array.from({ length: 48 }, (_, i) => B[i].map((x, k) => mod(toF101(x) + BigInt(sigma) * toF101(B[i + 1][k]))));
  const piv = [], swaps = [];
  for (let i = 0; i < 48; i++) {
    if (R[i][i] === 0n) {
      const j = R.findIndex((row, jj) => jj > i && row[i] !== 0n);
      if (j < 0) return { pivots: piv, swaps, singular: true };
      [R[i], R[j]] = [R[j], R[i]]; swaps.push([i, j]);
    }
    const d = R[i][i], di = inv101(d);
    piv.push(Number(d));
    for (let j = i + 1; j < 48; j++) {
      const f = (R[j][i] * di) % P101;
      if (f) for (let k = i; k < 48; k++) R[j][k] = mod(R[j][k] - f * R[i][k]);
    }
  }
  return { pivots: piv, swaps, singular: false };
}

/** Exact determinant over ℚ of ℬ₀ + σℬ₁ (fraction-free Bareiss after clearing row denominators). */
export function detQ(B, sigma) {
  const rows = Array.from({ length: 48 }, (_, i) => B[i].map((x, k) => Q.add(x, Q.mul(Q.of(sigma), B[i + 1][k]))));
  let scale = Q.one;
  const M = rows.map((row) => {
    let l = 1n; for (const x of row) l = (l / gcd(l, x[1])) * x[1];
    scale = Q.mul(scale, Q.of(1n, l));
    return row.map((x) => (x[0] * l) / x[1]);
  });
  const n = 48; let sign = 1n, prev = 1n;
  for (let k = 0; k < n - 1; k++) {
    if (M[k][k] === 0n) {
      const j = M.findIndex((row, jj) => jj > k && row[k] !== 0n);
      if (j < 0) return Q.zero;
      [M[k], M[j]] = [M[j], M[k]]; sign = -sign;
    }
    for (let i = k + 1; i < n; i++) {
      for (let j = k + 1; j < n; j++) M[i][j] = (M[i][j] * M[k][k] - M[i][k] * M[k][j]) / prev;
      M[i][k] = 0n;
    }
    prev = M[k][k];
  }
  return Q.mul(Q.of(sign * M[n - 1][n - 1]), scale);
}

// The paper's Table "Exact Gaussian pivots … modulo 101"
export const PIVOT_TABLE = {
  0: [60, 68, 62, 79, 47, 32, 69, 57, 30, 72, 35, 66, 43, 20, 85, 48, 88, 4, 77, 54, 60, 79, 26, 68, 83, 39, 40, 65, 1, 68, 78, 24, 15, 98, 32, 22, 94, 9, 99, 10, 15, 75, 4, 2, 25, 53, 90, 79],
  1: [38, 51, 90, 70, 5, 21, 88, 55, 45, 20, 35, 41, 77, 10, 18, 25, 76, 14, 38, 72, 6, 66, 56, 35, 83, 58, 56, 11, 17, 20, 30, 24, 28, 11, 25, 70, 79, 99, 66, 38, 4, 41, 63, 91, 63, 17, 90, 98],
  '-1': [82, 92, 26, 87, 21, 74, 87, 88, 88, 3, 14, 23, 38, 58, 36, 20, 26, 33, 94, 74, 78, 45, 93, 86, 73, 66, 45, 30, 61, 3, 88, 27, 20, 58, 69, 48, 78, 39, 48, 1, 66, 18, 86, 93, 52, 92, 39, 77],
};
export const SWAP_TABLE = { 0: [], 1: [[30, 31], [45, 46]], '-1': [] };

// ============================================ certificate 2: the two barriers ==
// "An exact certificate for the two barriers". Constants from §"real place":
export const ALPHA = Q.of(11, 48), BETA = Q.of(7, 48), GAMMA = Q.of(4, 48), ETA = Q.of(2, 48);
const E8 = 100000000n;
const coef = (k) => Q.of(BigInt(k), E8);

// Trial sequences: finite parts l_1..l_d, and exponential tails (base, a, b).
// For a real base the coefficient of z^k is a·10⁻⁸; for a nonreal base the
// pair (a, b) means r_z = (a − ib)/2·10⁻⁸ with its conjugate.
export const TRIAL = {
  2: {
    d: 10, lambda: '0',
    p: { l: [45559127, -50750856, -6578767, 13970217, 4786184, -4292433, -576704, 1311615, 671564, -346453],
      tails: [['.85', 0, -9338452], ['.94', 0, -2141509], ['0', '.7', -66277922, -31907569], ['0', '.85', -1231651, 6002645], ['.092', '.92', -3225918, 8928234], ['-.092', '.92', -2105536, -9091287]] },
    v: { l: [-23910158, 21152432, -2885110, -11558199, 6485289, 1456821, -1912176, -2263524, 2742210, -1162454],
      tails: [['-.8', 0, 15199211], ['-.96', 0, 4451662], ['.88', 0, 2545398], ['.95', 0, -4932634], ['.984', 0, 11618157], ['0', '.78', 27238714, -38447936], ['0', '.9', -31341084, -30188786], ['0', '.955', -6693542, 11912254], ['0', '.984', 2055213, -21715849]] },
  },
  1: {
    d: 8, lambda: '2.47405979',
    p: { l: [11913521, -79993701, -21956443, 37903579, 10744022, -2073193, 570246, -24939103], tails: [] },
    v: { l: [-89913025, 52874280, 45168341, -30708629, -19269841, 33922112, 9819141, -16992389], tails: [] },
  },
};
// Normalise a tail entry to complex-rational bases z and weights r_z, conjugates expanded.
// Entry shapes: [re, 0, a] for a real base; [re, im, a, b] for a nonreal base.
export function expandTails(tails) {
  const out = [];
  for (const t of tails) {
    if (t.length === 3) out.push({ z: [Q.dec(t[0]), Q.zero], r: [coef(t[2]), Q.zero] });
    else {
      const z = [Q.dec(t[0]), Q.dec(t[1])], a = coef(t[2]), b = coef(t[3]);
      const r = [Q.div(a, Q.of(2)), Q.neg(Q.div(b, Q.of(2)))];          // (a − ib)/2
      out.push({ z, r }, { z: [z[0], Q.neg(z[1])], r: [r[0], Q.neg(r[1])] });
    }
  }
  return out;
}

// ---- complex-rational polynomials (coefficient arrays of [re, im] rationals) --
const C = {
  add: (a, b) => [Q.add(a[0], b[0]), Q.add(a[1], b[1])],
  sub: (a, b) => [Q.sub(a[0], b[0]), Q.sub(a[1], b[1])],
  mul: (a, b) => [Q.sub(Q.mul(a[0], b[0]), Q.mul(a[1], b[1])), Q.add(Q.mul(a[0], b[1]), Q.mul(a[1], b[0]))],
  re: (q) => [q, Q.zero],
};
const pmul = (p, q) => { const r = Array.from({ length: p.length + q.length - 1 }, () => C.re(Q.zero)); for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) r[i + j] = C.add(r[i + j], C.mul(p[i], q[j])); return r; };
const padd = (p, q) => { const n = Math.max(p.length, q.length), r = []; for (let i = 0; i < n; i++) r.push(C.add(p[i] || C.re(Q.zero), q[i] || C.re(Q.zero))); return r; };
const pscale = (p, c) => p.map((x) => C.mul(x, c));
const prod = (fs) => fs.reduce((a, f) => pmul(a, f), [C.re(Q.one)]);
const R = (q) => C.re(q);
const lin = (c0, c1) => [c0, c1];                                  // c0 + c1 x
/** Chebyshev U_0..U_{d-1} as real polynomials. */
function chebU(d) { const U = [[R(Q.one)], [R(Q.zero), R(Q.of(2))]]; for (let k = 2; k < d; k++) U[k] = padd(pmul([R(Q.zero), R(Q.of(2))], U[k - 1]), pscale(U[k - 2], R(Q.of(-1)))); return U.slice(0, d); }

/**
 * The four derivative-numerator polynomials A_X, A_Y for κ = 2, 1, built
 * exactly from the paper's definitions (Q_X X'_κ and Q_Y Y'_κ). Returns real
 * rational coefficient arrays, after asserting the imaginary parts vanish.
 */
export function numerators(kappa) {
  const T = TRIAL[kappa], d = T.d, lam = Q.dec(T.lambda);
  const P = expandTails(T.p.tails), V = expandTails(T.v.tails);
  const lp = T.p.l.map(coef), lv = T.v.l.map(coef);
  const one = R(Q.one), U = chebU(d);
  // factors 1 − 2xz + z² and 1 − xz
  const cosF = (z) => lin(C.add(one, C.mul(z, z)), C.mul(R(Q.of(-2)), z));
  const powF = (z) => lin(one, C.mul(R(Q.of(-1)), z));
  const fx = R(Q.zero), X1 = [fx, one];                           // x
  const omx = lin(one, R(Q.of(-1)));                              // 1 − x
  const opx2 = [one, R(Q.zero), one];                             // 1 + x²
  const k2 = Q.of(2 * kappa);
  // ---- A_X = Q_X X'
  const qxFactors = [{ k: 'x', p: X1 }, { k: '1-x', p: omx }];
  for (let i = 0; i < 3 - kappa; i++) qxFactors.push({ k: 'opx2', p: opx2 });
  P.forEach((t, i) => qxFactors.push({ k: 'p' + i, p: cosF(t.z) }));
  V.forEach((t, i) => qxFactors.push({ k: 'v' + i, p: powF(t.z) }));
  const without = (fs, keys) => { const rest = [...fs]; for (const key of keys) { const ix = rest.findIndex((f) => f.k === key); if (ix < 0) throw new Error('no factor ' + key); rest.splice(ix, 1); } return prod(rest.map((f) => f.p)); };
  const all = (fs) => prod(fs.map((f) => f.p));
  let AX = [R(Q.zero)];
  AX = padd(AX, pscale(without(qxFactors, ['x']), R(Q.add(ALPHA, Q.mul(Q.of(2), GAMMA)))));
  AX = padd(AX, pscale(without(qxFactors, ['1-x']), R(Q.mul(Q.of(-2), ETA))));
  const cTan = Q.add(Q.of(kappa), Q.mul(Q.of(2), Q.add(Q.add(ALPHA, ETA), GAMMA)));
  AX = padd(AX, pmul(without(qxFactors, ['opx2']), [R(Q.zero), R(Q.neg(cTan))]));
  if (!Q.isZero(lam)) AX = padd(AX, pmul(without(qxFactors, ['opx2', 'opx2']), [R(Q.zero), R(Q.mul(Q.of(-4), lam))]));
  let tpPoly = [R(Q.zero)]; lp.forEach((l, k) => { tpPoly = padd(tpPoly, pscale(U[k], R(l))); });
  AX = padd(AX, pmul(all(qxFactors), pscale(tpPoly, R(Q.neg(k2)))));
  P.forEach((t, i) => { AX = padd(AX, pscale(without(qxFactors, ['p' + i]), C.mul(R(Q.neg(k2)), C.mul(t.r, t.z)))); });
  let hvPoly = []; lv.forEach((l, k) => { hvPoly[k] = R(l); });
  AX = padd(AX, pmul(all(qxFactors), pscale(hvPoly, R(Q.of(-1)))));
  V.forEach((t, i) => { AX = padd(AX, pscale(without(qxFactors, ['v' + i]), C.mul(R(Q.of(-1)), C.mul(t.r, t.z)))); });
  // ---- A_Y = Q_Y Y'
  const qyFactors = [{ k: 'x', p: X1 }, { k: '1-x', p: omx }];
  V.forEach((t, i) => qyFactors.push({ k: 'v' + i, p: cosF(t.z) }));
  let AY = [R(Q.zero)];
  AY = padd(AY, pscale(without(qyFactors, ['x']), R(BETA)));
  AY = padd(AY, pscale(without(qyFactors, ['1-x']), R(Q.neg(GAMMA))));
  let tvPoly = [R(Q.zero)]; lv.forEach((l, k) => { tvPoly = padd(tvPoly, pscale(U[k], R(l))); });
  AY = padd(AY, pmul(all(qyFactors), pscale(tvPoly, R(Q.of(2)))));
  V.forEach((t, i) => { AY = padd(AY, pscale(without(qyFactors, ['v' + i]), C.mul(R(Q.of(2)), C.mul(t.r, t.z)))); });
  const real = (p) => {
    for (const c of p) if (!Q.isZero(c[1])) throw new Error('numerator not real');
    const r = p.map((c) => c[0]);
    while (r.length > 1 && Q.isZero(r[r.length - 1])) r.pop();
    return r;
  };
  return { X: real(AX), Y: real(AY) };
}

/** Descartes count on (b, c): sign variations of (1+t)^d A((b+ct)/(1+t)). */
export function variations(A, b, c) {
  const d = A.length - 1, binom = (n, k) => { if (k < 0 || k > n) return 0n; let r = 1n; for (let i = 0; i < k; i++) r = (r * BigInt(n - i)) / BigInt(i + 1); return r; };
  const a = [];
  for (let h = 0; h <= d; h++) {
    let s = Q.zero;
    for (let j = 0; j <= d; j++) for (let k = 0; k <= j; k++) {
      const bin = binom(j, k) * binom(d - j, h - k);
      if (!bin) continue;
      s = Q.add(s, Q.mul(A[j], Q.mul(Q.mul(qpow(b, j - k), qpow(c, k)), [bin, 1n])));
    }
    a.push(s);
  }
  const signs = a.map(Q.sign).filter((x) => x !== 0);
  let v = 0; for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) v++;
  return v;
}
const qpow = (q, e) => { let r = Q.one; for (let i = 0; i < e; i++) r = Q.mul(r, q); return r; };
/** N_A(s) = Σ A_j (10^10)^{d0−j} s^j, the paper's integer-scaled sign probe (up to a positive factor). */
export function signAt(A, s) {
  const d = A.length - 1, T = 10n ** 10n;
  let lcm = 1n; for (const a of A) lcm = (lcm / gcd(lcm, a[1])) * a[1];
  let acc = 0n;
  for (let j = 0; j <= d; j++) acc += ((A[j][0] * lcm) / A[j][1]) * T ** BigInt(d - j) * BigInt(s) ** BigInt(j);
  return acc > 0n ? 1 : acc < 0n ? -1 : 0;
}

// The paper's root-count table and brackets
export const DESCARTES = [
  { kappa: 2, fn: 'X', deg: 36, points: ['-1', '0', '1'], counts: [9, 9] },
  { kappa: 2, fn: 'Y', deg: 24, points: ['0', '.25', '.5', '.75', '1'], counts: [5, 2, 2, 6] },
  { kappa: 1, fn: 'X', deg: 13, points: ['-1', '-.5', '0', '.5', '1'], counts: [1, 1, 2, 1] },
  { kappa: 1, fn: 'Y', deg: 9, points: ['0', '1'], counts: [5] },
];
export const BRACKETS = {
  '2X': [-9601109148, -8942317572, -7608305633, -6503394794, -5185864065, -4015634158, -3108806646, -2067921826, -1589849496, 1531948062, 2072448179, 3208186484, 4381119427, 5851354199, 7269030693, 8390277402, 9332614564, 9709786219],
  '2Y': [176402802, 330649406, 764952882, 1227250753, 2149465998, 3048189112, 4322699096, 5564757994, 6801929373, 8031988371, 8877037851, 9577761832, 9838463999, 9972727815, 9992037196],
  '1X': [-9917299785, -2259572153, 2543808026, 4437270259, 6348298970],
  '1Y': [532669786, 2504239325, 5701738806, 7966939383, 9454490138],
};
// Table "Certified rational upper bounds at every candidate evaluation point"
export const VALUE_TABLE = [
  [2, 'X', -9601109148, 'B', '-0.984034048775'], [2, 'X', -8942317572, 'B', '-0.984375363807'], [2, 'X', -7608305633, 'B', '-0.984034052640'],
  [2, 'X', -6503394794, 'B', '-0.984105522615'], [2, 'X', -5185864065, 'B', '-0.984034053414'], [2, 'X', -4015634158, 'B', '-0.984092061375'],
  [2, 'X', -3108806646, 'B', '-0.984034037901'], [2, 'X', -2067921826, 'B', '-0.984364031075'], [2, 'X', -1589849496, 'B', '-0.984034038450'],
  [2, 'X', 1531948062, 'B', '-0.984033385315'], [2, 'X', 2072448179, 'B', '-0.984776982913'], [2, 'X', 3208186484, 'B', '-0.984034026898'],
  [2, 'X', 4381119427, 'B', '-0.984264010107'], [2, 'X', 5851354199, 'B', '-0.984034029391'], [2, 'X', 7269030693, 'B', '-0.984245044505'],
  [2, 'X', 8390277402, 'B', '-0.984034016294'], [2, 'X', 9332614564, 'B', '-0.984567630027'], [2, 'X', 9709786219, 'B', '-0.984033926884'],
  [2, 'X', -10000000000, 'P', '-0.986727371546'],
  [2, 'Y', 176402802, 'B', '-1.608946411646'], [2, 'Y', 330649406, 'B', '-1.609949505120'], [2, 'Y', 764952882, 'B', '-1.608960295828'],
  [2, 'Y', 1227250753, 'B', '-1.609094597854'], [2, 'Y', 2149465998, 'B', '-1.608960426500'], [2, 'Y', 3048189112, 'B', '-1.608992193672'],
  [2, 'Y', 4322699096, 'B', '-1.608960428486'], [2, 'Y', 5564757994, 'B', '-1.608979509517'], [2, 'Y', 6801929373, 'B', '-1.608960430478'],
  [2, 'Y', 8031988371, 'B', '-1.608990548812'], [2, 'Y', 8877037851, 'B', '-1.608960429811'], [2, 'Y', 9577761832, 'B', '-1.609055802895'],
  [2, 'Y', 9838463999, 'B', '-1.608960412835'], [2, 'Y', 9972727815, 'B', '-1.609694899071'], [2, 'Y', 9992037196, 'B', '-1.608958123669'],
  [2, 'Y', 2500000000, 'P', '-1.608973617030'], [2, 'Y', 5000000000, 'P', '-1.608971701898'], [2, 'Y', 7500000000, 'P', '-1.608976908052'],
  [1, 'X', -9917299785, 'B', '-2.778491531574'], [1, 'X', -2259572153, 'B', '-1.324666731948'], [1, 'X', 2543808026, 'B', '-1.324655807046'],
  [1, 'X', 4437270259, 'B', '-1.352236629957'], [1, 'X', 6348298970, 'B', '-1.324666329425'], [1, 'X', -10000000000, 'P', '-2.775818077526'],
  [1, 'X', -5000000000, 'P', '-1.544057819905'], [1, 'X', 5000000000, 'P', '-1.347557680876'],
  [1, 'Y', 532669786, 'B', '-1.428286151250'], [1, 'Y', 2504239325, 'B', '-1.515602647362'], [1, 'Y', 5701738806, 'B', '-1.428335732372'],
  [1, 'Y', 7966939383, 'B', '-1.465686164672'], [1, 'Y', 9454490138, 'B', '-1.428335358167'],
];
export const NORM_TABLE = { 2: '.778415976284', 1: '.931985203901' };
export const CUTOFFS = { 2: { norm: '.77844', X: '-.98399', Y: '-1.60890' }, 1: { norm: '.9321', X: '-1.3244', Y: '-1.4280' } };

// ---- high-precision evaluation (fixed point, 10^-60) ----------------------
// The paper bounds each value with an interval rational calculation; here
// every logarithm and argument is computed to 60 digits, so the result can
// be compared with the paper's 12-decimal upper bounds directly.
const SC = 10n ** 60n;
const fx = (q) => (q[0] * SC) / q[1];                                     // rational → fixed
const fmul = (a, b) => (a * b) / SC;
const fdiv = (a, b) => (a * SC) / b;
function atanhSeries(q) { let s = 0n, p = q, q2 = fmul(q, q); for (let j = 1n; ; j += 2n) { const t = p / j; if (t === 0n) break; s += t; p = fmul(p, q2); } return 2n * s; }
const LN2 = atanhSeries(fdiv(SC, 3n * SC));                               // log 2 = 2 atanh(1/3)
/** log of a positive fixed-point number. */
export function flog(x) {
  if (x <= 0n) throw new Error('log of nonpositive');
  let m = 0n; while (x >= 2n * SC) { x /= 2n; m++; } while (x < SC) { x *= 2n; m--; }
  return m * LN2 + atanhSeries(fdiv(x - SC, x + SC));
}
function atanSeries(t) { let s = 0n, p = t, t2 = fmul(t, t), sg = 1n; for (let j = 1n; ; j += 2n) { const term = p / j; if (term === 0n) break; s += sg * term; sg = -sg; p = fmul(p, t2); } return s; }
const PI4 = atanSeries(SC / 2n) + atanSeries(SC / 3n);                    // π/4 = atan ½ + atan ⅓ (the paper's identity)
/** Principal argument of a + ib (fixed-point inputs), by octant rotation as in the paper. */
export function farg(a, b) {
  if (a === 0n && b === 0n) throw new Error('arg of 0');
  let k = Math.round(Math.atan2(Number(b), Number(a)) / (Math.PI / 4));
  if (k === -4) k = 4;
  let x = a, y = b;
  for (let i = 0; i < Math.abs(k); i++) [x, y] = k > 0 ? [x + y, y - x] : [x - y, x + y];  // rotate by ∓π/4 (scaled)
  return BigInt(k) * PI4 + atanSeries(fdiv(y, x));
}
/** Re(c · Log w) for complex rationals c, w. */
function reCLog(c, w) {
  const wr = fx(w[0]), wi = fx(w[1]);
  const lnmod = flog(fmul(wr, wr) + fmul(wi, wi)) / 2n;
  const ar = wi === 0n ? (wr > 0n ? 0n : 4n * PI4) : farg(wr, wi);
  return fmul(fx(c[0]), lnmod) - fmul(fx(c[1]), ar);
}
const chebT = (d, x) => { const T = [Q.one, x]; for (let k = 2; k <= d; k++) T[k] = Q.sub(Q.mul(Q.mul(Q.of(2), x), T[k - 1]), T[k - 2]); return T; };

/** T(u, x) and S(u, x) of the paper, at a rational x, to 60 digits (fixed point). */
function TS(u, d, x) {
  const l = u.l.map(coef), tails = expandTails(u.tails), Tk = chebT(d, x);
  let Texact = Q.zero, Sexact = Q.zero, xk = Q.one;
  for (let k = 1; k <= d; k++) { xk = Q.mul(xk, x); Texact = Q.add(Texact, Q.div(Q.mul(l[k - 1], Tk[k]), Q.of(k))); Sexact = Q.add(Sexact, Q.div(Q.mul(l[k - 1], xk), Q.of(k))); }
  let Tf = fx(Texact), Sf = fx(Sexact);
  for (const { z, r } of tails) {
    // 1 − 2xz + z²  and  1 − xz  (complex rationals)
    const zz = C.mul(z, z), w1 = C.add(C.sub(R(Q.one), C.mul(R(Q.mul(Q.of(2), x)), z)), zz);
    const w2 = C.sub(R(Q.one), C.mul(R(x), z));
    Tf -= reCLog(r, w1) / 2n;
    Sf -= reCLog(r, w2);
  }
  return { T: Tf, S: Sf };
}
const flogQ = (q) => flog(fx(q));

/** X_κ(x) and Y_κ(x) at a rational x, fixed point. */
export function barrier(kappa, fn, x) {
  const T = TRIAL[kappa], d = T.d;
  if (fn === 'Y') {
    return fmul(fx(BETA), flogQ(x)) + fmul(fx(GAMMA), flogQ(Q.sub(Q.one, x))) + 2n * TS(T.v, d, x).T;
  }
  const absx = Q.sign(x) < 0 ? Q.neg(x) : x, x2 = Q.mul(x, x), opx2 = Q.add(Q.one, x2);
  const W = fmul(fx(Q.add(ALPHA, Q.mul(Q.of(2), GAMMA))), flogQ(absx))
    + fmul(fx(Q.mul(Q.of(2), ETA)), flogQ(Q.sub(Q.one, x)))
    - fmul(fx(Q.add(Q.of(kappa, 2), Q.add(ALPHA, Q.add(ETA, GAMMA)))), flogQ(opx2));
  const D = Q.sub(Q.mul(Q.of(2), GAMMA), Q.div(Q.mul(Q.of(2), x2), opx2));
  const lam = Q.dec(T.lambda);
  return W + fx(Q.mul(lam, D)) - BigInt(2 * kappa) * TS(T.p, d, x).T - TS(T.v, d, x).S;
}
/** ‖u‖²_* from the paper's finite formula. */
export function norm2(u, d) {
  const l = u.l.map(coef), tails = expandTails(u.tails);
  let exact = Q.zero;
  for (let k = 1; k <= d; k++) {
    let cross = [Q.zero, Q.zero];
    for (const { z, r } of tails) { let zk = R(Q.one); for (let i = 0; i < k; i++) zk = C.mul(zk, z); cross = C.add(cross, C.mul(r, zk)); }
    if (!Q.isZero(cross[1]) && tails.length) { /* conjugate pairs make it real */ }
    exact = Q.add(exact, Q.div(Q.add(Q.mul(l[k - 1], l[k - 1]), Q.mul(Q.mul(Q.of(2), l[k - 1]), cross[0])), Q.of(k)));
  }
  let f = fx(exact);
  for (const a of tails) for (const b of tails) f -= reCLog(C.mul(a.r, b.r), C.sub(R(Q.one), C.mul(a.z, b.z)));
  return f;
}
export const normCombo = (kappa) => { const T = TRIAL[kappa]; return BigInt(kappa) * norm2(T.p, T.d) + norm2(T.v, T.d) / 2n; };
export const fixedToNumber = (f) => Number(f / 10n ** 40n) / 1e20;
export const fixedToString = (f, digits = 15) => { const neg = f < 0n; let a = neg ? -f : f; const s = (a / 10n ** BigInt(60 - digits)).toString().padStart(digits + 1, '0'); return (neg ? '-' : '') + s.slice(0, -digits) + '.' + s.slice(-digits); };
/** Compare a fixed-point value with a decimal-string upper bound: bound − value, as a fixed-point number. */
export const marginTo = (bound, f) => fx(Q.dec(bound)) - f;

/** The paper's final arithmetic: −11/16·(.693146) + norm + X + Y + .000048, exactly. */
export function finalBound(kappa) {
  const c = CUTOFFS[kappa];
  return [Q.mul(Q.of(-11, 16), Q.dec('.693146')), Q.dec(c.norm), Q.dec(c.X), Q.dec(c.Y), Q.dec('.000048')].reduce(Q.add);
}
export const LOWER = '-2.29084';           // arithmetic barrier (cited: needs the prime number theorem)
export const UPPER = '-2.290939875';       // real-place barrier (replayed here)

// ===================================================== G to many digits ====
/**
 * Catalan's constant two independent ways, to `digits` digits:
 *  (a) Ramanujan: G = (π/8)·log(2+√3) + (3/8)·Σ (n!)²/((2n)!(2n+1)²)
 *  (b) the defining alternating series, accelerated by Cohen–Rodriguez
 *      Villegas–Zagier (Algorithm 1), which converges like 5.83^−n.
 */
export function catalanDigits(digits = 50) {
  const S = 10n ** BigInt(digits + 12);
  const mul = (a, b) => (a * b) / S, div = (a, b) => (a * S) / b;
  const atanInv = (k) => { let s = 0n, p = S / k, sg = 1n, k2 = k * k; for (let j = 1n; p; j += 2n) { s += (sg * p) / j; sg = -sg; p /= k2; } return s; };
  const pi = 4n * (4n * atanInv(5n) - atanInv(239n));
  let r = S * 2n; for (let i = 0; i < 400; i++) { const nr = (r + div(3n * S, r)) / 2n; if (nr === r) break; r = nr; }   // √3
  const y = 2n * S + r;                                                    // 2 + √3
  let m = 0n, x = y; while (x >= 2n * S) { x /= 2n; m++; }
  const ath = (q) => { let s = 0n, p = q, q2 = mul(q, q); for (let j = 1n; p; j += 2n) { s += p / j; p = mul(p, q2); } return 2n * s; };
  const ln2 = ath(div(S, 3n * S)), lny = m * ln2 + ath(div(x - S, x + S));
  let sum = 0n, t = S;                                                     // t = (n!)²/(2n)!
  for (let n = 0n; t; n++) { sum += t / ((2n * n + 1n) ** 2n); t = (t * (n + 1n) * (n + 1n)) / ((2n * n + 1n) * (2n * n + 2n)); }
  const a = mul(pi, lny) / 8n + (3n * sum) / 8n;
  // (b) CVZ acceleration of Σ (−1)^k a_k, a_k = 1/(2k+1)²
  const n = Math.ceil((digits + 12) * 1.31) + 4;
  let d = 3n * S + r * 2n * 2n;                                            // d = (3+√8)^n via (3+2√2)
  let sq2 = S; for (let i = 0; i < 400; i++) { const nr = (sq2 + div(2n * S, sq2)) / 2n; if (nr === sq2) break; sq2 = nr; }
  let base = 3n * S + 2n * sq2, dn = S; for (let i = 0; i < n; i++) dn = mul(dn, base);
  d = (dn + div(S, dn)) / 2n;
  let b = -S, c = -d, s = 0n;
  for (let k = 0; k < n; k++) {
    c = b - c;
    s += c / ((2n * BigInt(k) + 1n) ** 2n);
    b = (b * BigInt(2 * (k + n) * (k - n))) / BigInt((2 * k + 1) * (k + 1));
  }
  const bval = div(s, d);
  const cut = (v) => (v / 10n ** 12n).toString();
  const fmt = (v) => { const str = cut(v).padStart(digits + 1, '0'); return str.slice(0, -digits) + '.' + str.slice(-digits); };
  return { ramanujan: fmt(a), cvz: fmt(bval) };
}
