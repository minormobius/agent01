/* ATOM⁴'s molecules, no DOM: Hartree–Fock on a basis of Cartesian Gaussians, in any number of dimensions, with the
   potential 1/r (the pin). Integrals by McMurchie and Davidson: every Gaussian product is expanded axis by axis in
   Hermite Gaussians (the E coefficients, the same in any dimension), and every 1/r integral reduces to derivatives
   of one function of R², the R tables. Writing 1/r = (2/√π)∫₀^∞ e^(−t²r²) dt and doing the Gaussian integrals in d
   dimensions leaves
       G_n(T) = ∫₀¹ u^(2n) (1 − u²)^((d − 3)/2) e^(−Tu²) du
   in place of Boys's F_n (which it is, in 3D), with the same rule dG_n/dT = −G_{n+1}, so the same recursions:
       ∫ e^(−p|r − P|²) / |r − C| d^d r = (2/√π)(π/p)^(d/2) √p G₀(p|P − C|²)
       (two Gaussian clouds p, q) = (2/√π)(π²/pq)^(d/2) √(pq/(p + q)) G₀(pq/(p + q) |P − Q|²)
   Restricted (closed shells) and unrestricted Hartree–Fock, with DIIS. Atomic units. */

/* ---------------------------------------------------------------- G_n(T), all n ≤ nmax at once */
function gaussLegendre(n) { const x = [], w = []; for (let i = 1; i <= n; i++) { let z = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5)), pp = 0; for (let it = 0; it < 100; it++) { let p1 = 1, p2 = 0; for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; } pp = (n * (z * p1 - p2)) / (z * z - 1); const z1 = z; z = z1 - p1 / pp; if (Math.abs(z - z1) < 1e-15) break; } x.push(z); w.push(2 / ((1 - z * z) * pp * pp)); } return { x, w }; }
const GL = gaussLegendre(64);
export function Gn(T, nmax, d) {
  const out = new Float64Array(nmax + 1), e = (d - 3) / 2;
  if (T < 40) { // u = sin φ: smooth on [0, π/2]
    for (let k = 0; k < GL.x.length; k++) {
      const ph = (Math.PI / 4) * (GL.x[k] + 1), s = Math.sin(ph), c = Math.cos(ph), w = GL.w[k] * (Math.PI / 4) * Math.pow(c, 2 * e + 1) * Math.exp(-T * s * s), s2 = s * s;
      let m = w; for (let n = 0; n <= nmax; n++) { out[n] += m; m *= s2; }
    }
  } else { // the integrand lives within u ≲ 9/√T
    const um = Math.min(1, 9 / Math.sqrt(T));
    for (let k = 0; k < GL.x.length; k++) {
      const u = (um / 2) * (GL.x[k] + 1), u2 = u * u, w = GL.w[k] * (um / 2) * Math.pow(Math.max(0, 1 - u2), e) * Math.exp(-T * u2);
      let m = w; for (let n = 0; n <= nmax; n++) { out[n] += m; m *= u2; }
    }
  }
  return out;
}

/* ---------------------------------------------------------------- basis */
/* every exponent tuple of total degree l in d dimensions (the Cartesian components of a shell) */
export function cartesian(l, d) { const out = []; const rec = (k, left, cur) => { if (k === d - 1) { out.push([...cur, left]); return; } for (let n = left; n >= 0; n--) rec(k + 1, left - n, [...cur, n]); }; rec(0, l, []); return out; }
const dfact = (n) => { let r = 1; for (let k = n; k > 1; k -= 2) r *= k; return r; };
/* a shell: { at, l, exps, coefs }; its functions are its Cartesian components, each normalized */
export function functionsOf(shells, d) {
  const out = [];
  shells.forEach((sh, si) => { for (const n of cartesian(sh.l, d)) out.push({ shell: si, n, norms: sh.exps.map((a) => Math.pow((2 * a) / Math.PI, d / 4) * n.reduce((s, nk) => s * Math.pow(4 * a, nk / 2) / Math.sqrt(dfact(2 * nk - 1)), 1)) }); });
  return out;
}

/* ---------------------------------------------------------------- Hermite expansion (one axis) */
/* E^{ij}_t for t = 0 … i + j, for exponents a, b and separation X = A − B */
function hermite(i, j, a, b, X) {
  const p = a + b, q = (a * b) / p, E = []; // E[i][j][t]
  for (let ii = 0; ii <= i; ii++) { E.push([]); for (let jj = 0; jj <= j; jj++) E[ii].push(new Float64Array(ii + jj + 1)); }
  E[0][0][0] = Math.exp(-q * X * X);
  const g = (ii, jj, t) => (t < 0 || t > ii + jj ? 0 : E[ii][jj][t]);
  for (let ii = 1; ii <= i; ii++) for (let t = 0; t <= ii; t++) E[ii][0][t] = g(ii - 1, 0, t - 1) / (2 * p) - ((q * X) / a) * g(ii - 1, 0, t) + (t + 1) * g(ii - 1, 0, t + 1);
  for (let ii = 0; ii <= i; ii++) for (let jj = 1; jj <= j; jj++) for (let t = 0; t <= ii + jj; t++) E[ii][jj][t] = g(ii, jj - 1, t - 1) / (2 * p) + ((q * X) / b) * g(ii, jj - 1, t) + (t + 1) * g(ii, jj - 1, t + 1);
  return E;
}

/* ---------------------------------------------------------------- the R tables: derivatives of G₀ */
const BASE = 13; // packed Hermite indices: t₁ + BASE t₂ + BASE² t₃ + …; enough for L ≤ 12
const TUPLES = {}; // per (d, L): the tuples with |t| ≤ L, by total, with their recursion's parents, compactly indexed
function tuples(d, L) {
  const key = d * 100 + L; if (TUPLES[key]) return TUPLES[key];
  const list = [], at = new Int32Array(BASE ** d).fill(-1);
  for (let tot = 0; tot <= L; tot++) for (const t of cartesian(tot, d)) { at[t.reduce((s, v, k) => s + v * BASE ** k, 0)] = list.length; list.push(t); }
  const k = new Int32Array(list.length), tk = new Int32Array(list.length), m1 = new Int32Array(list.length), m2 = new Int32Array(list.length), tot = new Int32Array(list.length);
  list.forEach((t, c) => {
    const idx = t.reduce((s, v, q) => s + v * BASE ** q, 0), kk = t.findIndex((v) => v > 0);
    tot[c] = t.reduce((s, v) => s + v, 0); k[c] = kk; tk[c] = kk >= 0 ? t[kk] : 0;
    m1[c] = kk >= 0 ? at[idx - BASE ** kk] : -1; m2[c] = kk >= 0 && t[kk] >= 2 ? at[idx - 2 * BASE ** kk] : -1;
  });
  const pk = Int32Array.from(list, (t) => t.reduce((s, v, q) => s + v * BASE ** q, 0));
  return (TUPLES[key] = { size: list.length, at, k, tk, m1, m2, tot, pk });
}
/* R^{(0)}_t for all |t| ≤ L, at exponent α and separation X (length d): compact array, looked up through tuples(d, L).at */
function rTable(alpha, X, L, d) {
  const T = tuples(d, L), R2 = X.reduce((s, v) => s + v * v, 0), G = Gn(alpha * R2, L, d);
  let next = null;
  for (let n = L; n >= 0; n--) {
    const cur = new Float64Array(T.size); cur[0] = Math.pow(-2 * alpha, n) * G[n];
    for (let c = 1; c < T.size && T.tot[c] <= L - n; c++) cur[c] = (T.m2[c] >= 0 ? (T.tk[c] - 1) * next[T.m2[c]] : 0) + X[T.k[c]] * next[T.m1[c]];
    next = cur;
  }
  return next;
}

/* ---------------------------------------------------------------- one-electron integrals */
/* for a pair of functions (and a pair of primitives): the Hermite expansion over d axes as packed (index, coef) */
function pairExpansion(fa, fb, A, B, a, b, d) {
  let terms = [[0, 1]];
  for (let k = 0; k < d; k++) {
    const E = hermite(fa.n[k], fb.n[k], a, b, A[k] - B[k])[fa.n[k]][fb.n[k]], nt = [];
    for (const [idx, c] of terms) for (let t = 0; t < E.length; t++) if (E[t] !== 0) nt.push([idx + t * BASE ** k, c * E[t]]);
    terms = nt;
  }
  return terms;
}
export function oneElectron(shells, atoms, d) {
  const F = functionsOf(shells, d), n = F.length, S = new Float64Array(n * n), T = new Float64Array(n * n), V = new Float64Array(n * n), M = Array.from({ length: d }, () => new Float64Array(n * n));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    const fa = F[i], fb = F[j], sa = shells[fa.shell], sb = shells[fb.shell], A = sa.at, B = sb.at;
    let s = 0, t = 0, v = 0; const m = new Float64Array(d);
    sa.exps.forEach((a, ia) => sb.exps.forEach((b, ib) => {
      const p = a + b, c = sa.coefs[ia] * sb.coefs[ib] * fa.norms[ia] * fb.norms[ib], P = A.map((x, k) => (a * x + b * B[k]) / p);
      // overlap and kinetic, axis by axis
      const S1 = [], T1 = [], X1 = [];
      for (let k = 0; k < d; k++) {
        const i0 = fa.n[k], j0 = fb.n[k], E = hermite(i0, j0 + 2, a, b, A[k] - B[k]), sq = Math.sqrt(Math.PI / p), ov = (jj) => (jj < 0 ? 0 : E[i0][jj][0] * sq);
        S1.push(ov(j0)); T1.push(-2 * b * b * ov(j0 + 2) + b * (2 * j0 + 1) * ov(j0) - 0.5 * j0 * (j0 - 1) * ov(j0 - 2));
        X1.push((E[i0][j0][1] || 0) * sq + P[k] * ov(j0)); // ⟨i|x|j⟩ about the origin
      }
      const Sp = S1.reduce((x, y) => x * y, 1); s += c * Sp;
      for (let k = 0; k < d; k++) { let prod = T1[k]; for (let q = 0; q < d; q++) if (q !== k) prod *= S1[q]; t += c * prod; let mp = X1[k]; for (let q = 0; q < d; q++) if (q !== k) mp *= S1[q]; m[k] += c * mp; }
      // nuclear attraction
      const terms = pairExpansion(fa, fb, A, B, a, b, d), L = fa.n.reduce((x, y) => x + y, 0) + fb.n.reduce((x, y) => x + y, 0), pre = (2 / Math.sqrt(Math.PI)) * Math.pow(Math.PI / p, d / 2) * Math.sqrt(p);
      for (const at of atoms) { const R = rTable(p, P.map((x, k) => x - at.at[k]), L, d), lk = tuples(d, L).at; let sum = 0; for (const [idx, cf] of terms) sum += cf * R[lk[idx]]; v -= c * at.Z * pre * sum; }
    }));
    S[i * n + j] = S[j * n + i] = s; T[i * n + j] = T[j * n + i] = t; V[i * n + j] = V[j * n + i] = v;
    for (let k = 0; k < d; k++) M[k][i * n + j] = M[k][j * n + i] = m[k];
  }
  return { F, n, S, T, V, M };
}

/* ---------------------------------------------------------------- two-electron integrals, (ij|kl), unique ones */
export const pairIndex = (i, j) => (i >= j ? (i * (i + 1)) / 2 + j : (j * (j + 1)) / 2 + i);
export function twoElectron(shells, d, F) {
  const n = F.length, np = (n * (n + 1)) / 2, ERI = new Float64Array((np * (np + 1)) / 2);
  const first = []; F.forEach((f, i) => { if (first[f.shell] === undefined) first[f.shell] = i; });
  const signOf = (idx) => { let s = 0; for (let k = 0; k < d; k++) { s += idx % BASE; idx = Math.floor(idx / BASE); } return s % 2 ? -1 : 1; };
  // shell pairs: per primitive pair, the exponent, centre and every component pair's Hermite expansion
  const pairs = [];
  for (let a = 0; a < shells.length; a++) for (let b = 0; b <= a; b++) {
    const sa = shells[a], sb = shells[b], na = cartesian(sa.l, d).length, nb = cartesian(sb.l, d).length, prims = [];
    sa.exps.forEach((x, ia) => sb.exps.forEach((y, ib) => {
      const p = x + y, comps = [];
      for (let u = 0; u < na; u++) for (let v = 0; v < nb; v++) {
        const i = first[a] + u, j = first[b] + v; if (a === b && j > i) continue;
        const c = sa.coefs[ia] * sb.coefs[ib] * F[i].norms[ia] * F[j].norms[ib], terms = pairExpansion(F[i], F[j], sa.at, sb.at, x, y, d);
        comps.push({ ij: pairIndex(i, j), terms: terms.map(([idx, cf]) => [idx, cf * c]), ket: terms.map(([idx, cf]) => [idx, cf * c * signOf(idx)]) });
      }
      prims.push({ p, P: sa.at.map((q, k) => (x * q + y * sb.at[k]) / p), comps });
    }));
    pairs.push({ L: sa.l + sb.l, prims });
  }
  // one quartet of shell pairs: an R table per primitive quartet, contracted bra first through every ket tuple
  const quartet = (A, B, write) => {
    const Lt = A.L + B.L, T = tuples(d, Lt), TK = tuples(d, B.L), out = new Map();
    for (const x of A.prims) for (const y of B.prims) {
      const p = x.p, q = y.p, al = (p * q) / (p + q), R = rTable(al, x.P.map((v, k) => v - y.P[k]), Lt, d), pre = (2 / Math.sqrt(Math.PI)) * Math.pow((Math.PI * Math.PI) / (p * q), d / 2) * Math.sqrt(al);
      for (const ca of x.comps) {
        const X = new Float64Array(TK.size);
        for (const [i1, c1] of ca.terms) for (let c2 = 0; c2 < TK.size; c2++) X[c2] += c1 * R[T.at[i1 + TK.pk[c2]]];
        for (const cb of y.comps) { if (A === B && cb.ij > ca.ij) continue; let sum = 0; for (const [i2, c2] of cb.ket) sum += c2 * X[TK.at[i2]]; const key = pairIndex(ca.ij, cb.ij); out.set(key, (out.get(key) || 0) + pre * sum); }
      }
    }
    if (write) for (const [key, v] of out) ERI[key] = v;
    return out;
  };
  // Schwarz screening: the largest (ij|ij) in each shell pair
  const bound = pairs.map((A) => { let m = 0; for (const [key, v] of quartet(A, A, false)) { const c = A.prims[0].comps.find((cc) => pairIndex(cc.ij, cc.ij) === key); if (c) m = Math.max(m, Math.abs(v)); } return Math.sqrt(m); });
  for (let a = 0; a < pairs.length; a++) for (let b = 0; b <= a; b++) if (bound[a] * bound[b] >= 1e-12) quartet(pairs[a], pairs[b], true);
  return ERI;
}

/* ---------------------------------------------------------------- linear algebra (small dense, symmetric) */
export function jacobiEigen(Ain, n) { // eigenvalues ascending, vectors as columns
  const A = Float64Array.from(Ain), V = new Float64Array(n * n); for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] ** 2; if (off < 1e-26) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = A[p * n + q]; if (Math.abs(apq) < 1e-300) continue;
      const th = (A[q * n + q] - A[p * n + p]) / (2 * apq), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k * n + p], akq = A[k * n + q]; A[k * n + p] = c * akp - s * akq; A[k * n + q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p * n + k], aqk = A[q * n + k]; A[p * n + k] = c * apk - s * aqk; A[q * n + k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k * n + p], vkq = V[k * n + q]; V[k * n + p] = c * vkp - s * vkq; V[k * n + q] = s * vkp + c * vkq; }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => A[i * n + i] - A[j * n + j]);
  return { values: order.map((i) => A[i * n + i]), vectors: Float64Array.from({ length: n * n }, (_, k) => V[Math.floor(k / n) * n + order[k % n]]) };
}
const mm = (A, B, n, m, k) => { const C = new Float64Array(n * k); for (let i = 0; i < n; i++) for (let l = 0; l < m; l++) { const a = A[i * m + l]; if (a) for (let j = 0; j < k; j++) C[i * k + j] += a * B[l * k + j]; } return C; };
const tr = (A, n, m) => { const B = new Float64Array(n * m); for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) B[j * n + i] = A[i * m + j]; return B; };
function solveLinear(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[p], M[c]] = [M[c], M[p]]; if (Math.abs(M[c][c]) < 1e-14) return null; for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } } const x = new Array(n).fill(0); for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; } return x; }

/* ---------------------------------------------------------------- Hartree–Fock */
/* J and K from density matrices, J_ij = Σ P_kl (ij|kl) and K_ik = Σ P_jl (ij|kl), in one pass over the unique
   integrals: each stands for up to eight orderings, so it is weighted by ½ per coincidence (i = j, k = l, ij = kl),
   spread to four slots, and the results symmetrized */
function coulombExchange(ERI, Ps, n) {
  const np = (n * (n + 1)) / 2, I = new Int32Array(np), Jn = new Int32Array(np), Pt = new Float64Array(n * n);
  for (let i = 0, c = 0; i < n; i++) for (let j = 0; j <= i; j++, c++) { I[c] = i; Jn[c] = j; }
  for (const P of Ps) for (let k = 0; k < n * n; k++) Pt[k] += P[k];
  const Ja = new Float64Array(n * n), Ka = Ps.map(() => new Float64Array(n * n)), [P0, P1] = Ps, [K0, K1] = Ka, two = Ps.length === 2;
  let q = 0;
  for (let ij = 0; ij < np; ij++) {
    const i = I[ij], j = Jn[ij], wij = i === j ? 0.5 : 1;
    for (let kl = 0; kl <= ij; kl++, q++) {
      let v = ERI[q]; if (v === 0) continue;
      const k = I[kl], l = Jn[kl]; v *= wij * (k === l ? 0.5 : 1) * (kl === ij ? 0.5 : 1);
      Ja[i * n + j] += 4 * Pt[k * n + l] * v; Ja[k * n + l] += 4 * Pt[i * n + j] * v;
      K0[i * n + k] += 2 * P0[j * n + l] * v; K0[j * n + k] += 2 * P0[i * n + l] * v; K0[i * n + l] += 2 * P0[j * n + k] * v; K0[j * n + l] += 2 * P0[i * n + k] * v;
      if (two) { K1[i * n + k] += 2 * P1[j * n + l] * v; K1[j * n + k] += 2 * P1[i * n + l] * v; K1[i * n + l] += 2 * P1[j * n + k] * v; K1[j * n + l] += 2 * P1[i * n + k] * v; }
    }
  }
  const sym = (A) => { const B = new Float64Array(n * n); for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) B[a * n + b] = 0.5 * (A[a * n + b] + A[b * n + a]); return B; };
  return { J: sym(Ja), Ks: Ka.map(sym) };
}
/* Hartree–Fock for atoms (array of { Z, at }) on shells. nAlpha, nBeta electrons; restricted when equal and
   restricted is asked. Returns the energy, orbital energies, densities, and the dipole moment */
export function hartreeFock(atoms, shells, d, { nAlpha, nBeta, maxIter = 200, tol = 1e-9, ints = null, guess = null } = {}) {
  const one = ints?.one || oneElectron(shells, atoms, d), { n, S, T, V, M } = one, ERI = ints?.ERI || twoElectron(shells, d, one.F);
  const H = Float64Array.from(T, (t, k) => t + V[k]);
  let Enuc = 0; for (let a = 0; a < atoms.length; a++) for (let b = 0; b < a; b++) Enuc += (atoms[a].Z * atoms[b].Z) / Math.hypot(...atoms[a].at.map((x, k) => x - atoms[b].at[k]));
  // canonical orthogonalization (drops near-dependent combinations)
  const se = jacobiEigen(S, n), keep = se.values.map((v, i) => [v, i]).filter(([v]) => v > 1e-7), m = keep.length, X = new Float64Array(n * m);
  keep.forEach(([v, i], c) => { for (let r = 0; r < n; r++) X[r * m + c] = se.vectors[r * n + i] / Math.sqrt(v); });
  const Xt = tr(X, n, m);
  const diagFock = (Fm) => { const Fp = mm(mm(Xt, Fm, m, n, n), X, m, n, m), e = jacobiEigen(Fp, m); return { eps: e.values, C: mm(X, e.vectors, n, m, m) }; };
  const density = (C, k) => { const P = new Float64Array(n * n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let o = 0; o < k; o++) s += C[i * m + o] * C[j * m + o]; P[i * n + j] = s; } return P; };
  let Pa, Pb; if (guess) { Pa = guess.Pa; Pb = guess.Pb; } else { const g = diagFock(H); Pa = density(g.C, nAlpha); Pb = density(g.C, nBeta); }
  const hist = [], errs = []; let E = 0, prevE = Infinity, res = null;
  for (let it = 0; it < maxIter; it++) {
    const { J, Ks } = coulombExchange(ERI, [Pa, Pb], n), Fa = Float64Array.from(H, (h, k) => h + J[k] - Ks[0][k]), Fb = Float64Array.from(H, (h, k) => h + J[k] - Ks[1][k]);
    E = Enuc; for (let k = 0; k < n * n; k++) E += 0.5 * (Pa[k] * (H[k] + Fa[k]) + Pb[k] * (H[k] + Fb[k]));
    // DIIS on the commutators FPS − SPF of both spins
    const comm = (Fm, P) => { const A = mm(mm(Fm, P, n, n, n), S, n, n, n); const B = mm(mm(S, P, n, n, n), Fm, n, n, n); return Float64Array.from(A, (x, k) => x - B[k]); };
    const err = [...comm(Fa, Pa), ...comm(Fb, Pb)]; hist.push([Fa, Fb]); errs.push(err); if (hist.length > 8) { hist.shift(); errs.shift(); }
    let Fua = Fa, Fub = Fb;
    if (hist.length > 1) {
      const k = hist.length, B = Array.from({ length: k + 1 }, (_, i) => Array.from({ length: k + 1 }, (_, j) => (i === k || j === k ? (i === j ? 0 : -1) : errs[i].reduce((s, x, q) => s + x * errs[j][q], 0))));
      const c = solveLinear(B, [...new Array(k).fill(0), -1]);
      if (c) { Fua = new Float64Array(n * n); Fub = new Float64Array(n * n); for (let i = 0; i < k; i++) for (let q = 0; q < n * n; q++) { Fua[q] += c[i] * hist[i][0][q]; Fub[q] += c[i] * hist[i][1][q]; } }
    }
    const ga = diagFock(Fua), gb = diagFock(Fub);
    Pa = density(ga.C, nAlpha); Pb = density(gb.C, nBeta); res = { epsA: ga.eps, epsB: gb.eps, Ca: ga.C, Cb: gb.C };
    const maxErr = Math.max(...err.map(Math.abs));
    if (Math.abs(E - prevE) < tol && maxErr < 1e-5) break;
    prevE = E;
  }
  const dip = Array.from({ length: d }, (_, k) => { let s = 0; for (const a of atoms) s += a.Z * a.at[k]; for (let q = 0; q < n * n; q++) s -= (Pa[q] + Pb[q]) * M[k][q]; return s; });
  return { E, epsA: res.epsA, epsB: res.epsB, Pa, Pb, dipole: dip, n, converged: Math.abs(E - prevE) < 1e-6 };
}

/* ---------------------------------------------------------------- bases: even-tempered, the same recipe in any dimension */
export const evenTempered = (a0, ratio, count) => Array.from({ length: count }, (_, k) => a0 * ratio ** k);
export function shellsFor(atom, recipe) { // recipe: [[l, exponents], …]
  return recipe.flatMap(([l, exps]) => exps.map((a) => ({ at: atom.at, l, exps: [a], coefs: [1] })));
}
