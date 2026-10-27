/* Stars, no DOM: whether a ball of gas can hold itself together by its own gravity, and whether its core can light.
   Gravity is open in this universe (chapter 1). Three laws are compared: ours (Newton, 1/r in 3D), 4D under Gauss's
   law (1/r²), and 4D pinned at 1/r the way the force between charges is (gravity through the same lens).

   A star is a polytrope here: pressure P = K ρ^(1 + 1/n), the adiabat of a gas with γ = 1 + 1/n (n = 3/2 for our
   monatomic gas, n = d/2 in d dimensions: 2 in 4D). Hydrostatic balance makes the enthalpy h = (n + 1)K ρ^(1/n) plus
   the gravitational potential Φ the same everywhere inside, so the star is found by the self-consistent field
   (Hachisu's iteration): guess ρ, find Φ, set ρ ∝ (C − Φ)^n with C = Φ at the surface, repeat. Units: G = 1, the
   radius 1 and the central density 1. Φ comes from the shell kernel, a thin shell's potential at any radius: 1/max in
   3D (Newton's shell theorem), 1/max² for 4D Gauss (its shell theorem), and k(min/max)/max pinned in 4D, which has no
   shell theorem (js/atom.js k4): outer layers pull inner ones inward rather than cancelling. */
import { k4 } from "./atom.js";

export const LAWS = {
  newton: { d: 3, degree: 1, kernel: (r, s) => 1 / Math.max(r, s) },
  gauss4: { d: 4, degree: 2, kernel: (r, s) => 1 / Math.max(r, s) ** 2 },
  pinned4: { d: 4, degree: 1, kernel: (r, s) => k4(Math.min(r, s) / Math.max(r, s)) / Math.max(r, s) },
};
const AREA = { 3: 4 * Math.PI, 4: 2 * Math.PI * Math.PI };

/* the self-consistent polytrope of index n under a law; N radial cells */
export function polytrope(lawKey, n, { N = 400, iters = 400, tol = 1e-11 } = {}) {
  const law = LAWS[lawKey], { d } = law, dr = 1 / N, r = Float64Array.from({ length: N }, (_, i) => (i + 0.5) * dr);
  const shellV = Float64Array.from(r, (x) => AREA[d] * x ** (d - 1) * dr), Kmat = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) Kmat[i * N + j] = law.kernel(r[i], r[j]);
  const surf = Float64Array.from({ length: N }, (_, j) => law.kernel(1, r[j])); // a shell's potential at the surface
  let rho = Float64Array.from(r, (x) => 1 - x * x), phi = new Float64Array(N), K = 0, C = 0, change = 1, it = 0;
  for (; it < iters && change > tol; it++) {
    for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N; j++) s += Kmat[i * N + j] * rho[j] * shellV[j]; phi[i] = -s; }
    C = 0; for (let j = 0; j < N; j++) C -= surf[j] * rho[j] * shellV[j];
    const hc = C - (phi[0] + (phi[0] - phi[1]) / 2); // extrapolated to the centre
    K = hc / (n + 1); change = 0;
    for (let i = 0; i < N; i++) { const h = Math.max(0, C - phi[i]), v = (h / hc) ** n; change = Math.max(change, Math.abs(v - rho[i])); rho[i] = 0.5 * rho[i] + 0.5 * v; }
  }
  // the bookkeeping: mass, mean density, gravitational energy W = ½∫ρΦ, thermal Π = ∫P dV
  let M = 0, W = 0, Pi = 0; for (let i = 0; i < N; i++) { const m = rho[i] * shellV[i]; M += m; W += 0.5 * m * phi[i]; Pi += K * rho[i] ** (1 + 1 / n) * shellV[i]; }
  const vol = AREA[d] / d, gamma = 1 + 1 / n;
  return { law: lawKey, d, n, r: Array.from(r), rho: Array.from(rho), phi: Array.from(phi), K, M, W, Pi, iters: it, converged: change <= tol,
    centralOverMean: 1 / (M / vol),
    virial: (d * Pi - law.degree * -W) / (law.degree * -W), // d∫P dV = degree × |W| in equilibrium: this is the error
    energy: Pi / (gamma - 1) + W, // total, thermal plus gravitational
    bound: (Pi / (gamma - 1) + W) / W }; // E/W: positive is bound (E < 0), zero is marginal
}

/* The virial theorem, exactly: for a potential of degree −k (1/r^k), d∫P dV = k|W| in balance, and a gas with
   γ has thermal energy ∫P dV/(γ − 1), so E = W (1 − k/(d(γ − 1))). A star is bound (E < 0, and it heats as it
   loses energy, which is how it lights and regulates itself) if γ > 1 + k/d: 4/3 ours, 5/4 pinned 4D, 3/2 Gauss 4D */
export const energyOverW = (d, gamma, k) => 1 - k / (d * (gamma - 1));
export const criticalGamma = (d, k) => 1 + k / d;
export const gasGamma = (d) => (d + 2) / d; // a monatomic gas (chapter 12)
export const radiationGamma = (d) => (d + 1) / d; // a gas of light: P = u/d

/* Lighting it: two nuclei tunnel through their 1/r repulsion (bare point charges, so the pinned force is ours exactly).
   What 4D changes is the radial equation's built-in centrifugal term: with L = l + (d − 3)/2, Langer's WKB uses
   (L + ½)² ħ²/2μr², which is ¼ ours for an s-wave and 1 in 4D. The thermal rate ∝ ∫ exp(−E/kT − G(E)) dE, with
   G(E) = (2/ħ) ∫ √(2μ(V − E)) dr from the nuclear radius to the turning point. Nuclear units: MeV, fm. */
export const HBARC = 197.327, E2 = 1.439964, KB_MEV = 8.617333e-11; // MeV fm, e² in MeV fm, MeV per kelvin
export function gamow(E, { Z1 = 1, Z2 = 1, mu = 469.459, rn = 2, d = 3, l = 0, langer = true } = {}) { // mu in MeV/c²
  const L = l + (d - 3) / 2, cent = langer ? ((L + 0.5) ** 2 * HBARC * HBARC) / (2 * mu) : 0, V = (x) => (Z1 * Z2 * E2) / x + cent / (x * x);
  if (V(rn) <= E) return 0;
  let lo = rn, hi = (Z1 * Z2 * E2) / E + 10; while (V(hi) > E) hi *= 2; // the turning point, by bisection
  for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; if (V(m) > E) lo = m; else hi = m; }
  const n = 4000; let s = 0; // substitute x = rn + (rt − rn) sin²θ to tame the square root at the turning point
  for (let k = 0; k < n; k++) { const th = ((k + 0.5) / n) * (Math.PI / 2), x = rn + (lo - rn) * Math.sin(th) ** 2, dx = (lo - rn) * 2 * Math.sin(th) * Math.cos(th) * (Math.PI / 2 / n); s += Math.sqrt(Math.max(0, 2 * mu * (V(x) - E))) * dx; }
  return (2 * s) / HBARC;
}
/* log of the thermal tunnelling rate at T kelvin (up to the nuclear factor, the same in both worlds by assumption) */
export function logRate(T, opts = {}) {
  const kT = KB_MEV * T, n = 600, Emax = 60 * kT; let best = -Infinity; const vals = [];
  for (let k = 1; k <= n; k++) { const E = (k / n) * Emax, v = -E / kT - gamow(E, opts); vals.push(v); if (v > best) best = v; }
  return best + Math.log(vals.reduce((s, v) => s + Math.exp(v - best), 0) * (Emax / n));
}
/* the temperature a 4D core needs to tunnel as often as a 3D one does at T3 */
export function matchingTemperature(T3, opts = {}) {
  const target = logRate(T3, { ...opts, d: 3 }); let lo = T3 * 0.5, hi = T3 * 4;
  for (let k = 0; k < 60; k++) { const m = Math.sqrt(lo * hi); if (logRate(m, { ...opts, d: 4 }) < target) lo = m; else hi = m; }
  return Math.sqrt(lo * hi);
}
/* how much of the inward pull at each radius comes from the mass outside it: zero with a shell theorem, not without */
export function outerPull(p) {
  const law = LAWS[p.law], N = p.r.length, dr = 1 / N, AREAd = AREA[p.d], out = [];
  for (let i = 1; i < N - 1; i += 1) {
    const at = (x) => { let tot = 0, outer = 0; for (let j = 0; j < N; j++) { const m = p.rho[j] * AREAd * p.r[j] ** (p.d - 1) * dr, v = -m * law.kernel(x, p.r[j]); tot += v; if (p.r[j] > p.r[i]) outer += v; } return [tot, outer]; };
    const h = dr / 4, [t1, o1] = at(p.r[i] - h), [t2, o2] = at(p.r[i] + h); // the outer shells held fixed while x moves
    out.push([p.r[i], (o2 - o1) / (t2 - t1)]);
  }
  return out;
}
