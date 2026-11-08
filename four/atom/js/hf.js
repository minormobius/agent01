/* ATOM⁴'s Hartree–Fock atom, no DOM: one radial function per subshell, any dimension D, the pinned 1/r between every
   pair of charges. Paper 1's second table, against which the local-exchange table (atom.js) is bracketed.

   The energy of a configuration is the average over its maximum-spin determinants (each subshell fills one spin
   first, as atom.js does), every subshell's electrons spread evenly over its g = orbitals(l, D) components:
     E = Σ_a q_a h_aa + Σ_{a<b} [q_a q_b F⁰_ab − w_ab S_ab] + Σ_a [J_a F⁰_aa − W_a S_aa]
   with q_aσ the electrons of each spin, w_ab = Σ_σ q_aσ q_bσ / g_a g_b, J_a = q↑q↓ + Σ_σ q_σ(q_σ − 1) g/2(g − 1),
   W_a = Σ_σ q_σ(q_σ − 1)/2g(g − 1), F⁰ the radial Coulomb integral and S_ab = Σ_k B_k(l_a, l_b) G^k_ab the exchange
   summed over every pair of components. For a full or one-electron spin-subshell this is a single determinant's
   energy, so C ³P, N ⁴S, O ³P, Fe ⁵D are reproduced exactly (the published numerical Hartree–Fock limits check it).

   The repulsion's angular expansion in D dimensions: 1/|x − y| = Σ_k A_k(r, s) C_k^λ(x̂·ŷ), λ = (D − 2)/2, with
   A_k(r, s) = a_k(t)/max(r, s), t = min/max and a_k(t) the Gegenbauer coefficient of (1 + t² − 2t cos θ)^(−½)
   (in 3D a_k = t^k, Legendre's; in 4D a_0 is atom.js's κ). The angular weights B_k(l, l') = Σ over components of
   ∫∫ Y_m Y_m' C_k Y_m' Y_m reduce, by the addition theorem, to one integral of three zonal harmonics.

   On the log grid x = ln r every A_k is a kernel in x − y, so each potential ∫A_k(r, s) f(s) ds is a convolution
   (FFT). The radial function is z = r^(1/2) u … in the symmetric form M z = ε z with Σ z² h = 1; kinetic energy by a
   fourth-order difference in x. Each subshell's Fock operator is solved for its lowest root by Davidson iteration,
   preconditioned by its local part, with the lower subshells of the same l projected out. */
import { kTab } from "./kernel.js";

/* ---------------------------------------------------------------- grids, Gegenbauer, kernels */
const SPH = (n) => (2 * Math.PI ** (n / 2)) / gamma(n / 2); // the area of the unit sphere S^(n−1) in R^n
function gamma(x) { if (x === 0.5) return Math.sqrt(Math.PI); if (x === 1) return 1; return (x - 1) * gamma(x - 1); }
function gegen(k, lam, c) { if (k === 0) return 1; let a = 1, b = 2 * lam * c; for (let n = 2; n <= k; n++) { const t = (2 * c * (n + lam - 1) * b - (n + 2 * lam - 2) * a) / n; a = b; b = t; } return b; }
function gaussLegendre(n) { const x = new Float64Array(n), w = new Float64Array(n); for (let i = 0; i < n; i++) { let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5)), dp = 0; for (let it = 0; it < 100; it++) { let p1 = 1, p2 = 0; for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; } dp = (n * (z * p1 - p2)) / (z * z - 1); const dz = p1 / dp; z -= dz; if (Math.abs(dz) < 1e-15) break; } x[i] = z; w[i] = 2 / ((1 - z * z) * dp * dp); } return { x, w }; }
const GL = gaussLegendre(256), GL32 = gaussLegendre(32);
const quadTheta = (f) => { let s = 0; for (let i = 0; i < GL.x.length; i++) { const th = (Math.PI / 2) * (GL.x[i] + 1); s += GL.w[i] * f(th); } return (Math.PI / 2) * s; };
/* the same over [0, π] on intervals growing geometrically from θ = 0: (1 + t² − 2t cos θ)^(−½) has a feature of width
   1 − t there, which a single rule can't resolve as t → 1 */
const quadGraded = (f, width) => { let s = 0, a = 0, b = Math.max(1e-7, width); const seg = (lo, hi) => { let q = 0; for (let i = 0; i < GL32.x.length; i++) q += GL32.w[i] * f(lo + ((hi - lo) / 2) * (GL32.x[i] + 1)); return ((hi - lo) / 2) * q; };
  while (a < Math.PI) { const hi = Math.min(Math.PI, b); s += seg(a, hi); a = hi; b = 2 * hi; } return s; };

/* a_k(t) tabulated on t ∈ [0, 1] (2000 intervals, linear), and the angular weights B_k(l, l') */
const AK = {};
function akTable(D, k) {
  const key = `${D}:${k}`; if (AK[key]) return AK[key];
  const lam = (D - 2) / 2, NT = 4000, tab = new Float64Array(NT + 1);
  if (D === 3) for (let i = 0; i <= NT; i++) tab[i] = (i / NT) ** k;
  else if (D === 4 && k === 0) for (let i = 0; i <= NT; i++) tab[i] = kTab(i / NT); // atom.js's κ itself
  else {
    const norm = quadTheta((th) => gegen(k, lam, Math.cos(th)) ** 2 * Math.sin(th) ** (D - 2));
    for (let i = 0; i <= NT; i++) { const t = i / NT; tab[i] = quadGraded((th) => gegen(k, lam, Math.cos(th)) * Math.sin(th) ** (D - 2) / Math.sqrt((1 - t) ** 2 + 4 * t * Math.sin(th / 2) ** 2 || 1e-300), (1 - t) / 4) / norm; }
  }
  return (AK[key] = (t) => { const x = t * NT, i = Math.min(NT - 1, Math.floor(x)), f = x - i; return tab[i] + (tab[i + 1] - tab[i]) * f; });
}
export function angularB(D, l1, l2, k) {
  const lam = (D - 2) / 2, S1 = SPH(D), S2 = SPH(D - 1), Z = (l) => (c) => ((l + lam) / (lam * S1)) * gegen(l, lam, c);
  const z1 = Z(l1), z2 = Z(l2), z3 = Z(k);
  const sum = S1 * S2 * quadTheta((th) => { const c = Math.cos(th); return z1(c) * z2(c) * z3(c) * Math.sin(th) ** (D - 2); });
  return S1 * (lam / (k + lam)) * sum;
}
export const degeneracy = (l, D) => (D === 3 ? 2 * l + 1 : (l + 1) * (l + 1));

/* ---------------------------------------------------------------- FFT (radix 2) for the convolutions */
function fftPlan(M) {
  const rev = new Uint32Array(M), bits = Math.log2(M); for (let i = 0; i < M; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
  const cos = new Float64Array(M / 2), sin = new Float64Array(M / 2); for (let i = 0; i < M / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / M); sin[i] = Math.sin((2 * Math.PI * i) / M); }
  return { M, rev, cos, sin };
}
function fft(P, re, im, inv) {
  const { M, rev, cos, sin } = P;
  for (let i = 0; i < M; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let size = 2; size <= M; size *= 2) {
    const half = size / 2, step = M / size;
    for (let s = 0; s < M; s += size) for (let j = 0; j < half; j++) {
      const wr = cos[j * step], wi = inv ? sin[j * step] : -sin[j * step], a = s + j, b = a + half;
      const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
    }
  }
  if (inv) for (let i = 0; i < M; i++) { re[i] /= M; im[i] /= M; }
}

/* ---------------------------------------------------------------- the radial setting: grid, kinetic, kernels */
export function setting(D, Z, { r0 = null, rmax = 150, h = 0.02 } = {}) {
  const rmin = r0 ?? 1e-11, N = Math.ceil(Math.log(rmax / rmin) / h) + 1;
  const r = Float64Array.from({ length: N }, (_, i) => rmin * Math.exp(i * h));
  let M = 1; while (M < 2 * N) M *= 2;
  const plan = fftPlan(M), kern = {};
  const kernel = (k) => { // the FFT of G_k(d) = a_k(e^(−|d|)) · (d ≥ 0 ? 1 : e^d), d = (i − j)h, placed for a linear convolution
    if (kern[k]) return kern[k];
    const a = akTable(D, k), re = new Float64Array(M), im = new Float64Array(M);
    for (let m = 0; m < N; m++) re[m] = a(Math.exp(-m * h));
    for (let m = 1; m < N; m++) re[M - m] = a(Math.exp(-m * h)) * Math.exp(-m * h);
    fft(plan, re, im, false); return (kern[k] = { re, im });
  };
  const bufR = new Float64Array(M), bufI = new Float64Array(M);
  /* W_k[f](r_i) = ∫ A_k(r_i, s) f(s) ds with f given per grid point as a density in x (f_j h is its share) */
  const conv = (k, f, out = new Float64Array(N)) => {
    const K = kernel(k); bufR.fill(0); bufI.fill(0); for (let j = 0; j < N; j++) bufR[j] = f[j];
    fft(plan, bufR, bufI, false);
    for (let i = 0; i < M; i++) { const a = bufR[i], b = bufI[i]; bufR[i] = a * K.re[i] - b * K.im[i]; bufI[i] = a * K.im[i] + b * K.re[i]; }
    fft(plan, bufR, bufI, true);
    for (let i = 0; i < N; i++) out[i] = (bufR[i] * h) / r[i];
    return out;
  };
  // the kinetic operator −½ R⁻¹ D₂ R⁻¹ in the symmetric z form: D₂ fourth order in x, zero beyond the ends
  const c = [-1 / 12, 4 / 3, -5 / 2, 4 / 3, -1 / 12].map((v) => v / (h * h));
  const kin = (z, out) => { for (let i = 0; i < N; i++) { let s = 0; for (let d = -2; d <= 2; d++) { const j = i + d; if (j >= 0 && j < N) s += c[d + 2] * (z[j] / r[j]); } out[i] = (-0.5 * s) / r[i]; } return out; };
  return { D, Z, N, r, h, M, conv, kin, c };
}

/* banded (pentadiagonal) solve of (T_loc − θ) t = b: T_loc = kinetic + diag(dg); for the Davidson preconditioner */
function bandSolve(S, dg, theta, b) {
  const { N, r, c } = S, a = Array.from({ length: 5 }, () => new Float64Array(N));
  for (let i = 0; i < N; i++) for (let d = -2; d <= 2; d++) { const j = i + d; if (j < 0 || j >= N) continue; a[d + 2][i] = (-0.5 * c[d + 2]) / (r[i] * r[j]); }
  for (let i = 0; i < N; i++) a[2][i] += dg[i] - theta;
  // Gaussian elimination without pivoting (diagonally dominant enough as a preconditioner); bands l2, l1, d, u1, u2
  const x = Float64Array.from(b), L2 = a[0], L1 = a[1], Dg = a[2], U1 = a[3], U2 = a[4];
  for (let i = 0; i < N; i++) {
    if (Math.abs(Dg[i]) < 1e-12) Dg[i] = 1e-12;
    if (i + 1 < N) { const m = L1[i + 1] / Dg[i]; L1[i + 1] = 0; Dg[i + 1] -= m * U1[i]; if (i + 2 < N) U1[i + 1] -= m * U2[i]; x[i + 1] -= m * x[i]; }
    if (i + 2 < N) { const m = L2[i + 2] / Dg[i]; L2[i + 2] = 0; L1[i + 2] -= m * U1[i]; Dg[i + 2] -= m * U2[i]; x[i + 2] -= m * x[i]; }
  }
  for (let i = N - 1; i >= 0; i--) { let s = x[i]; if (i + 1 < N) s -= U1[i] * x[i + 1]; if (i + 2 < N) s -= U2[i] * x[i + 2]; x[i] = s / Dg[i]; }
  return x;
}

/* ---------------------------------------------------------------- Davidson: the lowest root of a symmetric operator */
function smallEigen(A, n) { // Jacobi; returns the lowest eigenpair of the n × n symmetric A (row-major)
  const a = Float64Array.from(A), v = new Float64Array(n * n); for (let i = 0; i < n; i++) v[i * n + i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] ** 2; if (off < 1e-26) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = a[p * n + q]; if (Math.abs(apq) < 1e-30) continue;
      const th = (a[q * n + q] - a[p * n + p]) / (2 * apq), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
      for (let k = 0; k < n; k++) { const akp = a[k * n + p], akq = a[k * n + q]; a[k * n + p] = cs * akp - sn * akq; a[k * n + q] = sn * akp + cs * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p * n + k], aqk = a[q * n + k]; a[p * n + k] = cs * apk - sn * aqk; a[q * n + k] = sn * apk + cs * aqk; }
      for (let k = 0; k < n; k++) { const vkp = v[k * n + p], vkq = v[k * n + q]; v[k * n + p] = cs * vkp - sn * vkq; v[k * n + q] = sn * vkp + cs * vkq; }
    }
  }
  let m = 0; for (let i = 1; i < n; i++) if (a[i * n + i] < a[m * n + m]) m = i;
  return { theta: a[m * n + m], s: Array.from({ length: n }, (_, i) => v[i * n + m]) };
}
function davidson(S, apply, precondDiag, start, project, { tol = 1e-9, maxIter = 60, maxSub = 14 } = {}) {
  const { N, h } = S, dot = (a, b) => { let s = 0; for (let i = 0; i < N; i++) s += a[i] * b[i]; return s * h; };
  const orth = (t, V) => { for (let pass = 0; pass < 2; pass++) for (const v of V) { const d = dot(v, t); for (let i = 0; i < N; i++) t[i] -= d * v[i]; } const n = Math.sqrt(dot(t, t)); if (n < 1e-14) return null; for (let i = 0; i < N; i++) t[i] /= n; return t; };
  let V = [], AV = [], x = null, ax = null, theta = 0;
  const v0 = orth(project(Float64Array.from(start)), []); V.push(v0); AV.push(apply(v0));
  for (let it = 0; it < maxIter; it++) {
    const n = V.length, G = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { const g = 0.5 * (dot(V[i], AV[j]) + dot(V[j], AV[i])); G[i * n + j] = g; G[j * n + i] = g; }
    const e = smallEigen(G, n); theta = e.theta;
    x = new Float64Array(N); ax = new Float64Array(N); for (let k = 0; k < n; k++) for (let i = 0; i < N; i++) { x[i] += e.s[k] * V[k][i]; ax[i] += e.s[k] * AV[k][i]; }
    const res = Float64Array.from(ax, (v, i) => v - theta * x[i]), rn = Math.sqrt(dot(res, res));
    if (rn < tol) break;
    let t = project(bandSolve(S, precondDiag, theta, res));
    if (n >= maxSub) { V = [x]; AV = [ax]; }
    t = orth(t, V); if (!t) break; V.push(t); AV.push(apply(t));
  }
  return { z: x, eps: theta };
}

/* ---------------------------------------------------------------- the Hartree–Fock atom
   occ: [{ n, l, q }] the configuration (q electrons in subshell nl), spins by Hund's rule within each subshell.
   start: [{ z }] or a function giving each subshell's initial radial function (default: the bare nucleus's, screened).
   Returns the total energy, each subshell's orbital energy and radial function z (Σ z² h = 1), and convergence. */
export function hfAtom(D, Z, occ, { iters = 200, tol = 1e-9, mix: mix0 = 1, grid = {}, verbose = false, guess = null } = {}) {
  let mix = mix0; // the step: damped automatically whenever the energy rises (an oscillating field)
  const S = guess?.S ?? setting(D, Z, grid), { N, r, h } = S, dot = (a, b) => { let s = 0; for (let i = 0; i < N; i++) s += a[i] * b[i]; return s * h; };
  const sub = occ.filter((o) => o.q > 0).map((o) => { const g = degeneracy(o.l, D), up = Math.min(o.q, g); return { ...o, g, up, dn: o.q - up, L: o.l + (D - 3) / 2 }; });
  sub.sort((a, b) => a.l - b.l || a.n - b.n);
  const nS = sub.length, Bk = new Map(), Bget = (l1, l2) => { const key = `${l1},${l2}`; if (!Bk.has(key)) { const out = []; for (let k = Math.abs(l1 - l2); k <= l1 + l2; k += 2) { const b = angularB(D, l1, l2, k); if (Math.abs(b) > 1e-12) out.push([k, b]); } Bk.set(key, out); } return Bk.get(key); };
  const Jw = (a) => a.up * a.dn + (a.g > 1 ? ((a.up * (a.up - 1) + a.dn * (a.dn - 1)) * a.g) / (2 * (a.g - 1)) : 0);
  const Ww = (a) => (a.g > 1 ? (a.up * (a.up - 1) + a.dn * (a.dn - 1)) / (2 * a.g * (a.g - 1)) : 0);
  const wab = (a, b) => (a.up * b.up + a.dn * b.dn) / (a.g * b.g);
  // the start: hydrogen-like functions in the bare nucleus, made orthonormal within each l
  let z = guess?.z ? guess.z.map((v) => Float64Array.from(v)) : sub.map((a) => { const ze = Z / (a.n + (D - 3) / 2), nr = a.n - a.l - 1; return Float64Array.from(r, (x) => { let p = 1; for (let k = 0; k < nr; k++) p *= x * ze - (k + 1) * 1.7; return p * x ** (a.L + 1) * Math.exp(-ze * x) * Math.sqrt(x); }); });
  const gramSchmidt = () => { for (let i = 0; i < nS; i++) { for (let j = 0; j < i; j++) if (sub[j].l === sub[i].l) { const d = dot(z[j], z[i]); for (let k = 0; k < N; k++) z[i][k] -= d * z[j][k]; } const nn = Math.sqrt(dot(z[i], z[i])); for (let k = 0; k < N; k++) z[i][k] /= nn; } };
  gramSchmidt();
  const nucCent = (a) => Float64Array.from(r, (x) => ((a.L + 0.5) ** 2) / (2 * x * x) - Z / x);
  let E = 0, prev = Infinity, eps = new Float64Array(nS), converged = false, it = 0;
  const energy = (V) => {
    let e1 = 0; const tmp = new Float64Array(N);
    for (let a = 0; a < nS; a++) { S.kin(z[a], tmp); const nc = nucCent(sub[a]); let s = 0; for (let i = 0; i < N; i++) s += z[a][i] * (tmp[i] + nc[i] * z[a][i]); e1 += sub[a].q * s * h; }
    let eJ = 0, eK = 0;
    for (let a = 0; a < nS; a++) for (let b = a; b < nS; b++) {
      let F0 = 0; for (let i = 0; i < N; i++) F0 += z[a][i] * z[a][i] * V[b][i]; F0 *= h;
      const prod = Float64Array.from(z[a], (v, i) => v * z[b][i]); let Sab = 0;
      for (const [k, B] of Bget(sub[a].l, sub[b].l)) { const W = S.conv(k, prod); let G = 0; for (let i = 0; i < N; i++) G += prod[i] * W[i]; Sab += B * G * h; }
      if (a === b) { eJ += Jw(sub[a]) * F0; eK += Ww(sub[a]) * Sab; } else { eJ += sub[a].q * sub[b].q * F0; eK += wab(sub[a], sub[b]) * Sab; }
    }
    return e1 + eJ - eK;
  };
  for (it = 0; it < iters; it++) {
    const V = z.map((zb) => S.conv(0, Float64Array.from(zb, (v) => v * v))); // each subshell's own Hartree potential (per electron)
    for (let a = 0; a < nS; a++) {
      const A = sub[a], nc = nucCent(A), loc = new Float64Array(N);
      for (let i = 0; i < N; i++) { let v = nc[i]; for (let b = 0; b < nS; b++) v += (b === a ? (2 * Jw(A)) / A.q : sub[b].q) * V[b][i]; loc[i] = v; }
      const xc = sub.map((B, b) => [b, b === a ? (2 * Ww(A)) / A.q : wab(A, B) / A.q, Bget(A.l, B.l)]).filter(([, c]) => c > 0);
      const lower = []; for (let b = 0; b < a; b++) if (sub[b].l === A.l) lower.push(z[b]);
      const project = (v) => { for (const w of lower) { const d = dot(w, v); for (let i = 0; i < N; i++) v[i] -= d * w[i]; } return v; };
      const tmp = new Float64Array(N), prod = new Float64Array(N);
      const apply = (v0) => {
        const v = project(Float64Array.from(v0)), out = S.kin(v, new Float64Array(N));
        for (let i = 0; i < N; i++) out[i] += loc[i] * v[i];
        for (const [b, cc, ks] of xc) { for (let i = 0; i < N; i++) prod[i] = z[b][i] * v[i]; for (const [k, B] of ks) { S.conv(k, prod, tmp); for (let i = 0; i < N; i++) out[i] -= cc * B * z[b][i] * tmp[i]; } }
        project(out); for (let i = 0; i < N; i++) out[i] += 10 * (v0[i] - v[i]); // the projected-out directions pushed far up
        return out;
      };
      const res = davidson(S, apply, loc, z[a], project, { tol: Math.max(1e-10, Math.min(1e-6, Math.abs(E - prev) * 10)) });
      let zn = res.z; if (dot(zn, z[a]) < 0) for (let i = 0; i < N; i++) zn[i] = -zn[i];
      if (mix < 1) { for (let i = 0; i < N; i++) zn[i] = mix * zn[i] + (1 - mix) * z[a][i]; project(zn); const nn = Math.sqrt(dot(zn, zn)); for (let i = 0; i < N; i++) zn[i] /= nn; }
      z[a] = zn; eps[a] = res.eps;
    }
    gramSchmidt();
    E = energy(z.map((zb) => S.conv(0, Float64Array.from(zb, (v) => v * v))));
    if (verbose) console.log(`  it ${it}: E ${E.toFixed(9)}`);
    if (Math.abs(E - prev) < tol && it > 2) { converged = true; break; }
    if (E > prev + 1e-7) mix = Math.max(0.25, mix * 0.6);
    prev = E;
  }
  return { E, converged, iterations: it + 1, subshells: sub.map((a, i) => ({ name: `${a.n}${"spdfgh"[a.l]}`, n: a.n, l: a.l, q: a.q, eps: eps[i], z: z[i] })), S };
}
