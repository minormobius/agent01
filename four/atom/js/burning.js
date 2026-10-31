/* How hot a star's core can get, in d dimensions, no DOM: the classic estimate that sets which burning stages a star of
   given mass reaches. A core contracting under its own gravity heats, as the virial theorem has it, until its electrons'
   degeneracy pressure takes over the support; then it cools. So each mass has a highest central temperature, and above
   the Chandrasekhar mass, where degeneracy can't hold at any density, there is none: the core heats until its burning
   stops paying.

   The core is the gas polytrope of stars.js (index n = d/2, γ = (d + 2)/d), so at radius R its centre has
   ρ_c = M/(M̃ R^d) and P_c = K̃ G M²/(M̃² R^(d+1)) (M̃, K̃ the polytrope's mass and pressure in units G = R = ρ_c = 1).
   The electrons' pressure at zero temperature is exact at any momentum, (2/(2πħ)^d) S_d ∫ (p v/d) p^(d−1) dp up to p_F,
   with n_e = 2V_d p_F^d/(2πħ)^d, and at temperature T the electrons are Fermi–Dirac (relativistic, partly degenerate)
   while the ions are a hot gas: P_c = n_i kT + P_e(n_e, T) sets the central temperature. Splitting P_c instead into cold
   degeneracy plus a hot gas, the textbook shortcut, counts partly degenerate electrons twice and runs too cool near the
   Chandrasekhar mass. The thresholds it gives are checked on our own stars. Masses are in units of this estimate's Chandrasekhar mass (where relativistic degeneracy's
   P ∝ ρ^((d+1)/d) meets P_c ∝ ρ^((d+1)/d) at every R), so G drops out, and the answer is a temperature against M/M_Ch. */
import { polytrope } from "./stars.js";

const SI = { hbar: 1.054571817e-34, c: 2.99792458e8, me: 9.1093837015e-31, mu: 1.66053906660e-27, k: 1.380649e-23 };
const LAW = { 3: "newton", 4: "pinned4" }, SD = { 3: 4 * Math.PI, 4: 2 * Math.PI ** 2 }, VD = { 3: (4 * Math.PI) / 3, 4: Math.PI ** 2 / 2 };
const POLY = {};
const poly = (d) => (POLY[d] ??= polytrope(LAW[d], d / 2, { N: 300 }));
/* the electrons' pressure (Pa, or its d-dimensional kin) at zero temperature, for n_e per m^d */
export function degeneracyPressure(d, ne) {
  const { hbar, c, me } = SI, h = 2 * Math.PI * hbar, pF = h * Math.pow(ne / (2 * VD[d]), 1 / d), N = 400; let s = 0;
  for (let i = 0; i < N; i++) { const p = (pF * (i + 0.5)) / N, v = (p * c * c) / Math.sqrt(p * p * c * c + me * me * c ** 4); s += ((p * v) / d) * p ** (d - 1); }
  return ((2 * SD[d]) / h ** d) * s * (pF / N);
}
/* relativistic degeneracy's P = K_rel n_e^((d+1)/d) */
const Krel = (d) => (2 * Math.PI * SI.hbar * SI.c * Math.pow(2 * VD[d], -1 / d)) / (d + 1);
/* this estimate's Chandrasekhar mass at gravity G (kg), electrons per nucleon 1/mue */
export function chandraMass(d, { G, mue = 2 }) {
  const { M, K } = poly(d), q = (d + 1) / d;
  return Math.pow((Krel(d) * Math.pow(M, 2 - q)) / (K * G * Math.pow(mue * SI.mu, q)), d / (d - 1));
}
/* the electrons as they are at temperature T, relativistic and partly degenerate (Fermi–Dirac): their pressure at
   density n_e. Momentum in units of m_e c, kinetic energy ε = √(1 + x²) − 1, the chemical potential found so the
   density comes out n_e */
const ECONST = (d) => ((2 * SD[d]) / (2 * Math.PI * SI.hbar) ** d) * (SI.me * SI.c) ** d;
export function electronPressure(d, ne, T) {
  const th = (SI.k * T) / (SI.me * SI.c ** 2), A = ECONST(d), N = 120;
  const integ = (mu, wantP) => { const emax = Math.max(mu, 0) + 60 * th, xmax = Math.sqrt((emax + 1) ** 2 - 1); let s = 0;
    for (let i = 0; i < N; i++) { const x = (xmax * (i + 0.5)) / N, e = Math.sqrt(1 + x * x) - 1, z = (e - mu) / th, f = z > 700 ? 0 : 1 / (Math.exp(z) + 1); s += (wantP ? (x * x) / (d * Math.sqrt(1 + x * x)) : 1) * x ** (d - 1) * f; }
    return s * (xmax / N); };
  const target = ne / A; let lo = -200 * th - 1, hi = 50; // μ in units of m_e c²
  for (let it = 0; it < 46; it++) { const m = (lo + hi) / 2; if (integ(m, false) < target) lo = m; else hi = m; }
  return A * SI.me * SI.c ** 2 * integ((lo + hi) / 2, true);
}
/* the central temperature (K) of a core of mass M (kg) at radius R (m): P_c = n_i kT + P_e(n_e, T), solved for T
   (−Infinity where the electrons alone, cold, already exceed P_c) */
export function coreT(d, M, R, { G, mue = 2, mui = 4 }) {
  const { M: Mt, K: Kt } = poly(d), rho = M / (Mt * R ** d), Pc = (Kt * G * M * M) / (Mt * Mt * R ** (d + 1)), ne = rho / (mue * SI.mu), ni = rho / (mui * SI.mu);
  if (degeneracyPressure(d, ne) >= Pc) return -Infinity;
  const P = (T) => ni * SI.k * T + electronPressure(d, ne, T); let lo = 1e3, hi = 1e13;
  for (let it = 0; it < 34; it++) { const m = Math.sqrt(lo * hi); if (P(m) < Pc) lo = m; else hi = m; }
  return Math.sqrt(lo * hi);
}
/* the highest central temperature a core of mass m × M_Ch reaches as it contracts (Infinity at or above M_Ch) */
export function maxCoreT(d, m, { mue = 2, mui = 4, G = 1e-10 } = {}) {
  if (m >= 1) return Infinity;
  const Mch = chandraMass(d, { G, mue }), M = m * Mch, { M: Mt } = poly(d);
  // scan the radius through the electrons' Compton density, where the maximum lies, then refine
  const Rc = Math.pow(M / (Mt * mue * SI.mu * (SI.me * SI.c / SI.hbar) ** d), 1 / d), T = (R) => coreT(d, M, R, { G, mue, mui });
  let best = -Infinity, bR = Rc; for (let i = -12; i <= 18; i++) { const R = Rc * Math.pow(10, i / 6), t = T(R); if (t > best) { best = t; bR = R; } }
  let lo = bR / 1.5, hi = bR * 1.5; for (let it = 0; it < 24; it++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (T(a) > T(b)) hi = b; else lo = a; }
  return Math.max(best, T((lo + hi) / 2));
}
/* the core mass (× M_Ch) whose highest temperature is T (K): below it a stage at T never lights */
export function massFor(d, T, opts = {}) {
  let lo = 1e-4, hi = 0.9999; if (maxCoreT(d, hi, opts) < T) return 1;
  for (let it = 0; it < 26; it++) { const m = Math.sqrt(lo * hi); if (maxCoreT(d, m, opts) < T) lo = m; else hi = m; } return Math.sqrt(lo * hi);
}
/* A zone burning hydrogen and helium together at one temperature, as a small network: protons, helium-4s and nuclei by
   charge Z ≥ 4 (even Z at mass 2Z, odd Z at 2Z + 1). Positron decays are taken as instant, so a proton capture onto even
   Z is three captures there and onto odd Z one, as in our carbon–nitrogen–oxygen cycle's path (4D's element 8 at mass 16
   takes three protons to element 9 at mass 19, and a fourth makes pxygen-20). Reactions: proton + proton (two protons
   used, half a helium-4 made, as our chain), helium-4 + helium-4 → beryllium-8, a proton or a helium-4 onto each Z. Every
   one is two-body, so at fixed temperature the path doesn't depend on density: the clock is s = ∫ n_b ⟨σv⟩_pp dt and
   each rate is a ratio to proton–proton's (rp[Z], ra[Z], raa). Nuclei pushed past Zmax stay at Zmax. Backward Euler with
   Newton's method, since the rates span sixty orders of magnitude. Steps grow by `grow` (1.15 puts s_half within 5%, the compositions within a percent). Runs until the hydrogen falls to `until` of its start;
   returns abundances per baryon, s then and s when half the hydrogen was gone. */
export function burnNetwork({ rp, ra, raa, Zmax, Yp = 0.75, Ya = 0.0625, seeds = {}, until = 1e-3, smax = 1e9, grow = 1.15 }) {
  const n = Zmax - 1, iZ = (Z) => Z - 2, m = (Z) => (Z % 2 ? 1 : 3); // 0 protons, 1 helium-4s, then Z
  let Y = new Float64Array(n); Y[0] = Yp; Y[1] = Ya; for (const [Z, v] of Object.entries(seeds)) Y[iZ(+Z)] = v;
  const f = new Float64Array(n), J = Array.from({ length: n }, () => new Float64Array(n));
  const rhs = (Y) => { f.fill(0); for (const r of J) r.fill(0);
    f[0] -= Y[0] * Y[0]; f[1] += (Y[0] * Y[0]) / 4; J[0][0] -= 2 * Y[0]; J[1][0] += Y[0] / 2;
    const w = (raa * Y[1] * Y[1]) / 2; f[1] -= 2 * w; f[iZ(4)] += w; J[1][1] -= 2 * raa * Y[1]; J[iZ(4)][1] += raa * Y[1];
    for (let Z = 4; Z < Zmax; Z++) { const i = iZ(Z), y = Y[i];
      for (const [k, x, to, use] of [[rp[Z] / m(Z), 0, Math.min(Z + 1, Zmax), m(Z)], [ra[Z], 1, Math.min(Z + 2, Zmax), 1]]) { const j = iZ(to);
        f[i] -= k * Y[x] * y; f[j] += k * Y[x] * y; f[x] -= use * k * Y[x] * y;
        J[i][x] -= k * y; J[i][i] -= k * Y[x]; J[j][x] += k * y; J[j][i] += k * Y[x]; J[x][x] -= use * k * y; J[x][i] -= use * k * Y[x]; } } };
  const solve = (A, b) => { const N = b.length; for (let c = 0; c < N; c++) { let p = c; for (let r = c + 1; r < N; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = c + 1; r < N; r++) { const q = A[r][c] / A[c][c]; if (!q) continue; for (let k = c; k < N; k++) A[r][k] -= q * A[c][k]; b[r] -= q * b[c]; } }
    const x = new Float64Array(N); for (let r = N - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < N; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; } return x; };
  let s = 0, ds = 1e-12, shalf = null;
  while (Y[0] > until * Yp && s < smax) {
    const X = Float64Array.from(Y);
    for (let it = 0; it < 30; it++) { rhs(X); const A = J.map((r, i) => r.map((v, j) => (i === j ? 1 : 0) - ds * v)), dx = solve(A, Array.from(X, (v, i) => -(v - Y[i] - ds * f[i])));
      let mx = 0; for (let i = 0; i < n; i++) { X[i] = Math.max(0, X[i] + dx[i]); mx = Math.max(mx, Math.abs(dx[i])); } if (mx < 1e-13) break; }
    if (shalf === null && X[0] < Yp / 2) shalf = s + (ds * (Y[0] - Yp / 2)) / (Y[0] - X[0]);
    Y = X; s += ds; ds *= grow; }
  const Z = {}; for (let z = 4; z <= Zmax; z++) Z[z] = Y[iZ(z)];
  return { s, shalf, Yp: Y[0], Ya: Y[1], Z };
}
