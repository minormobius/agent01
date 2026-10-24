/* ATOM⁴'s forces between molecules, no DOM: a classical force field, term by term, for four dimensions with the
   force pinned at 1/r (the lens vacuum: statics are exactly 1/r, acting at once). Atomic units throughout.

   The tool is Fourier: the pinned potential is 1/r = FT of 4π²/|k|³ in 4D. A charge distribution with transform ρ̃(k)
   meets another through ρ̃_A ρ̃_B 4π²/|k|³. A neutral atom's ρ̃ starts at S k²/8, where S = Σ⟨r²⟩ over its electrons
   (the cloud's form factor is 1 − k²⟨r²⟩/2d, d = 4). So two neutral atoms meet through (π² S_A S_B / 16)|k|, and
   the inverse transform of |k| in 4D is −3/(4π² R⁵): an attraction −3 S_A S_B / 64 R⁵, between any two atoms,
   with no fluctuation and no polarization. In 3D the same step gives k⁴ · 4π/k² = 4π k², which is local (a contact
   term), so it vanishes at any distance: Newton's shell theorem. The 1/R⁵ here is the shell theorem's failure,
   felt between neutral atoms. */
import { J1 } from "../../lumen4/js/optics.js";

/* S = Σ⟨r²⟩ over every electron of an atom, from the solver's orbitals */
export const sumR2 = (el) => el.orb.reduce((s, o) => s + o.o * o.r2, 0);

/* the permanent attraction of two neutral, spherical atoms, from the shell theorem's failure: −B/R⁵ */
export const permanentB = (SA, SB, d = 4) => (d === 4 ? (3 * SA * SB) / 64 : 0);

/* the polarizabilities that set C₆ are not computed: the solver keeps every atom spherical, so it can't be pushed
   lopsided by a field. (Unsöld's closure estimate from its orbitals misses our own neon's α by a factor of 5.6) */
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
