/* ATOM⁴'s forces between molecules, no DOM: a classical force field, term by term, for four dimensions with the
   force pinned at 1/r (the lens vacuum: statics are exactly 1/r, acting at once). Atomic units throughout.

   The tool is Fourier: the pinned potential is 1/r = FT of 4π²/|k|³ in 4D. A charge distribution with transform ρ̃(k)
   meets another through ρ̃_A ρ̃_B 4π²/|k|³. A neutral atom's ρ̃ starts at S k²/8, where S = Σ⟨r²⟩ over its electrons
   (the cloud's form factor is 1 − k²⟨r²⟩/2d, d = 4). So two neutral atoms meet through (π² S_A S_B / 16)|k|, and
   the inverse transform of |k| in 4D is −3/(4π² R⁵): an attraction −3 S_A S_B / 64 R⁵, between any two atoms,
   with no fluctuation and no polarization. In 3D the same step gives k⁴ · 4π/k² = 4π k², which is local (a contact
   term), so it vanishes at any distance: Newton's shell theorem. The 1/R⁵ here is the shell theorem's failure,
   felt between neutral atoms. */
import { J1 } from "../../lumen/js/optics.js";

/* S = Σ⟨r²⟩ over every electron of an atom, from the solver's orbitals */
export const sumR2 = (el) => el.orb.reduce((s, o) => s + o.o * o.r2, 0);

/* the permanent attraction of two neutral, spherical atoms, from the shell theorem's failure: −B/R⁵ */
export const permanentB = (SA, SB, d = 4) => (d === 4 ? (3 * SA * SB) / 64 : 0);

/* the polarizabilities that set C₆ are computed by tools/response.mjs (the coupled response) into js/response.js */
/* dispersion (London): two fluctuating dipoles meet through T = (δ − 3R̂R̂)/R³, the same in any dimension because
   the potential is 1/r. Second order gives −C₆/R⁶ with C₆ = (tr T²R⁶ / 4) α_A α_B E_A E_B /(E_A + E_B). tr T²R⁶ is
   (−2)² from along R̂ plus 1 for each of the d − 1 directions across: 6 in 3D (London's 3/2), 7 in 4D (7/4) */
export const traceT2 = (d) => 4 + (d - 1);
export const londonC6 = (aA, aB, EA, EB, d) => (traceT2(d) / 4) * aA * aB * ((EA * EB) / (EA + EB));
/* where the permanent R⁻⁵ attraction and dispersion's R⁻⁶ are equal: beyond it, the R⁻⁵ wins */
export const crossover = (B, C6) => C6 / B;
/* our noble gases, measured, as Lennard-Jones fits (ε in hartree, σ in bohr): for scale beside 4D's */
export const MEASURED_LJ = { Ne: { eps: 42 * 3.1668e-6, sigma: 5.20 }, Ar: { eps: 120 * 3.1668e-6, sigma: 6.43 } };
export const lj = (R, { eps, sigma }) => 4 * eps * ((sigma / R) ** 12 - (sigma / R) ** 6);

/* repulsion: the clouds' overlap, which falls as exp(−βR) because a bound orbital decays as exp(−√(2I) r) in any
   dimension (the decay depends only on the energy). Lennard-Jones's r⁻¹² was a convenience in our world too */
export const bornMayerBeta = (I) => 2 * Math.sqrt(2 * I);

/* the pair potential the molecular-dynamics view will use, with A from a fit or a measured distance */
export const pair = (R, { A, beta, B, C6 }) => A * Math.exp(-beta * R) - B / R ** 5 - C6 / R ** 6;

/* the exact interaction of two neutral model atoms in 4D, each a point charge Z and a Gaussian cloud (σ per
   axis, ⟨r²⟩ = 4σ² per electron): U(R) = (Z²/R) ∫₀^∞ (1 − e^(−k²σ²/2))² J₁(kR) dk / k, the 4D Hankel transform of
   ρ̃² 4π²/k³. For checking −3S²/64R⁵ with nothing assumed */
export function gaussianPairExact(R, Z, sigma, M = 40000) {
  const a = (sigma * sigma) / 2, kmax = 14 / sigma, h = kmax / M; let s = 0;
  // 1 − 2e^(−ak²) + e^(−2ak²): the 1 is the two nuclei, whose part integrates to exactly 1
  for (let i = 1; i <= M; i++) { const k = i * h, w = i === M ? 1 : i % 2 ? 4 : 2, f = (-2 * Math.exp(-a * k * k) + Math.exp(-2 * a * k * k)) * J1(k * R) / k; s += w * f; }
  const f0 = -0.5 * R; // the integrand's limit at k → 0: (−2 + 1) · (kR/2) / k
  s += f0; return (Z * Z / R) * (1 + (s * h) / 3);
}

/* screening by a salt: ions answer a potential locally, ρ_ind = −λφ (Debye–Hückel), so φ̃ = ρ̃/(|k|³/4π² + λ).
   In 3D the same step gives 1/(k²/4π + λ), analytic in k², and an exponential. Here the |k|³ is not analytic:
   φ̃ = 1/λ − |k|³/(4π²λ²) + …, and the |k|³ term leaves a tail −C/(4π²λ² r⁷), with C = FT⁻¹[|k|³] r⁷ = 45/(4π²).
   Past a few screening lengths a charge looks faintly the opposite sign, and fades as r⁻⁷, not exponentially */
export const ftPowerConst = (a, d = 4) => (Math.pow(2 * Math.PI, -d) * Math.pow(Math.PI, d / 2) * Math.pow(2, d + a) * gamma((d + a) / 2)) / gamma(-a / 2);
export const saltTail = (lambda) => -ftPowerConst(3) / (4 * Math.PI * Math.PI * lambda * lambda);
export function gamma(x) { // Lanczos, with reflection for x < ½
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  x -= 1; let a = c[0]; const t = x + g + 0.5; for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

/* twisting about a bond: each end's other bonds, seen across the bond, are a regular simplex of the space across it
   (a triangle in 3D, a tetrahedron in 4D). twistEnergy sums a soft repulsion 1/r⁶ over the pairs across the bond,
   for the far end turned by g, a rotation of the across-space */
export function twistEnergy(nearDirs, farDirs, g, gap) {
  let e = 0;
  for (const a of nearDirs) for (const b of farDirs) { const gb = g.map((r) => r.reduce((s, v, k) => s + v * b[k], 0)); let d2 = gap * gap; for (let i = 0; i < a.length; i++) d2 += (a[i] - gb[i]) ** 2; e += 1 / d2 ** 3; }
  return e;
}

/* the other bonds at the two ends of one bond, as directions in the space across it (d − 1 dimensions): each end's
   d other bonds, projected across, are a regular simplex there (a triangle in 3D, a tetrahedron in 4D); the far
   end starts inverted through the bond, which is staggered */
import { simplex } from "./polytopes.js";
export function bondEnds(d) {
  const e = simplex(d), e0 = e[0], perp = (v) => { const k = v.reduce((s, x, i) => s + x * e0[i], 0); return v.map((x, i) => x - k * e0[i]); }, B = [];
  for (let a = 0; a < d && B.length < d - 1; a++) { let u = perp(e0.map((_, i) => (i === a ? 1 : 0))); for (const b of B) { const k = u.reduce((s, x, i) => s + x * b[i], 0); u = u.map((x, i) => x - k * b[i]); } const n = Math.hypot(...u); if (n > 1e-6) B.push(u.map((x) => x / n)); }
  const near = e.slice(1).map((v) => { const p = perp(v); return B.map((b) => b.reduce((s, x, i) => s + x * p[i], 0)); });
  return { near, staggered: near.map((v) => v.map((x) => -x)) };
}

/* ---------------------------------------------------------------- two atoms, computed (tools/pairs.mjs → js/pairs.js):
   Gordon–Kim on the solver's frozen clouds. These turn the baked curves into the page's numbers */
/* Tang–Toennies damping for dispersion: f₆(x) = 1 − e^(−x) Σ_{k≤6} x^k/k! (x = βR), so −C₆f₆/R⁶ stays finite close in */
export function tangToennies6(x) { let s = 0, t = 1; for (let k = 0; k <= 6; k++) { if (k) t *= x / k; s += t; } return 1 - Math.exp(-x) * s; }
/* a baked pair's total, interpolated (hartree); RS is its grid of separations */
export function pairCurve(RS, p) { const tot = p.es.map((v, i) => v + p.kin[i] + p.exch[i]), h = RS[1] - RS[0]; return (R) => { const i = Math.min(RS.length - 2, Math.max(0, Math.floor((R - RS[0]) / h))), u = (R - RS[i]) / h; return tot[i] * (1 - u) + tot[i + 1] * u; }; }
export function minimum(f, a = 3, b = 15) { let best = [a, Infinity]; for (let R = a; R <= b + 1e-9; R += 0.01) { const v = f(R); if (v < best[1]) best = [R, v]; } return { R: best[0], E: best[1] }; }
/* the force field's repulsion for the molecular-dynamics view: A e^(−βR) fitted (log-linear) to what's left of the
   computed curve once the permanent −B/R⁵ is added back, over 3.5 to 6 bohr where it's positive */
export function fitRepulsion(RS, p, B) {
  const tot = p.es.map((v, i) => v + p.kin[i] + p.exch[i]), xs = [], ys = [];
  RS.forEach((R, i) => { const v = tot[i] + B / R ** 5; if (R >= 3.5 && R <= 6 && v > 0) { xs.push(R); ys.push(Math.log(v)); } });
  const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  const beta = -xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / xs.reduce((s, v) => s + (v - mx) ** 2, 0);
  return { A: Math.exp(my + beta * mx), beta };
}
/* our noble gases, measured (atomic units): dispersion C₆, and the well's place and depth */
export const MEASURED = { 1: { alpha: 4.5, C6: 6.499 }, 2: { alpha: 1.383, C6: 1.46, R: 5.6, eps: 0.95 / 27211.386 }, 10: { alpha: 2.67, C6: 6.38, R: 5.84, eps: 3.6 / 27211.386 }, 18: { alpha: 11.08, C6: 64.3, R: 7.1, eps: 10.3 / 27211.386 }, 36: { alpha: 16.8, C6: 129.6, R: 7.6, eps: 14.4 / 27211.386 } };
/* the method, end to end, makes our measured wells 1.4 to 1.8 times too deep; a 4D depth is read as depth/1.8 … depth */
export const OVERBIND = 1.8;
/* a full pair: the computed curve (frozen clouds, Gordon–Kim) plus dispersion, damped by Tang–Toennies with the
   repulsion's own β */
export function fullPair(RS, p, B, C6) { const f = pairCurve(RS, p), { beta } = fitRepulsion(RS, p, B); return (R) => f(R) - (tangToennies6(beta * R) * C6) / R ** 6; }
/* our noble gases boil at about 0.7 ε/k (neon 0.65, argon 0.73, krypton 0.70): a corresponding-states rule */
export const boilK = (eps) => 0.7 * eps * 315775.02;
