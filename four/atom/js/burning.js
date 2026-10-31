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
