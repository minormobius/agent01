/* A stellar plasma under the lens vacuum, in any d (no DOM; atomic units, the pinned potential q₁q₂/r).
   Weak (Debye–Hückel) screening: a nucleus's cloud of neighbours lowers the barrier by the potential the cloud makes at
   the nucleus, so a fusion rate gains f = e^H, H = −q₁ φ_ind(0)/kT, with the bare kernel G(k) and κ̃ = Σ n_j q_j²/kT:
       φ_ind(0) = −q ∫ d^dk/(2π)^d G²κ̃/(1 + Gκ̃)
   ours, G = 4π/k², gives Debye's −q√(4πκ̃); pinned 4D, G = 4π²/|k|³, gives −q (4π²)^{4/3} κ̃^{1/3}/(12√3 π).
   Resistive decay: the vector potential a current makes is 4πJ/(c²k²) in ours and 4π²J/(c²|k|³) in pinned 4D, so with
   J = σE a field of scale L = 1/k decays at c²k²/4πσ (ours) and c²k³/4π²σ (4D). Electron–ion momentum transfer off
   Z/r: θ = 2b₀/b with b₀ = Z/v²; σ_tr = 4πb₀² ln(λ/b₀) in ours (Spitzer's logarithm), 8πb₀²λ in 4D (impact
   parameters fill a 3D plane: the integral grows linearly to the screening length λ). */
import { shellPotential } from "./fields.js";
export const C_AU = 137.035999;
export const kernelC = (d) => (d === 3 ? 4 * Math.PI : 4 * Math.PI * Math.PI); // G(k) = c/k^(d−1)
/* the screening cloud's potential at the nucleus, per unit charge (negative) */
export const inducedPotential = (d, kappa) => (d === 3 ? -Math.sqrt(4 * Math.PI * kappa) : -((4 * Math.PI ** 2) ** (4 / 3) * Math.cbrt(kappa)) / (12 * Math.sqrt(3) * Math.PI));
export const screeningH = (d, Z1Z2, kappa, kT) => (-Z1Z2 * inducedPotential(d, kappa)) / kT;
/* the length where screening sets in: G(k)κ̃ = 1 */
export const screeningLength = (d, kappa) => (d === 3 ? 1 / Math.sqrt(4 * Math.PI * kappa) : Math.pow(4 * Math.PI ** 2 * kappa, -1 / 3));
/* electron–ion momentum-transfer cross-section at speed v off charge Z, screening length lam */
export function transportCross(d, Z, v, lam) { const b0 = Z / (v * v); return d === 3 ? 4 * Math.PI * b0 * b0 * Math.max(1, Math.log(lam / b0)) : 8 * Math.PI * b0 * b0 * Math.max(lam, b0); }
/* a field of scale L: its effective diffusivity c²/4πσ (ours) or c²/(4π²σL) (4D) */
export const diffusivity = (d, sigma, L) => (d === 3 ? (C_AU * C_AU) / (4 * Math.PI * sigma) : (C_AU * C_AU) / (4 * Math.PI ** 2 * sigma * L));
/* Strong screening (Salpeter's ion spheres): each nucleus sits in its own neutral sphere of electrons (n_e V_d a^d = Z,
   V_d the unit ball's volume) and two fusing nuclei merge theirs, so H = [E(Z₁) + E(Z₂) − E(Z₁ + Z₂)]/kT, with E(Z) the
   sphere's electrostatic energy: the point charge in the uniform ball's centre potential plus the ball's own energy.
   Ours: E = −0.9 Z²/a (the check); pinned 4D: the ball's centre potential is (4/3)Z/a and its own energy is computed from
   the 4D shell potential (no shell theorem), giving E = e_is Z²/a with a ∝ Z^{1/4}, so E ∝ Z^{7/4} (ours Z^{5/3}). */
const ISCOEF = {};
export function ionSphereCoef(d) { // E = coef × Z²/a for a unit-radius sphere's charge Z
  if (ISCOEF[d]) return ISCOEF[d];
  const M = 400, p = (s) => d * s ** (d - 1), centre = d === 3 ? 1.5 : 4 / 3; let self = 0; // ⟨1/|r − r'|⟩ over the ball, by shells
  for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) { const s = (i + 0.5) / M, t = (j + 0.5) / M; self += p(s) * p(t) * shellPotential(s, t, d); }
  self /= M * M;
  return (ISCOEF[d] = -centre + 0.5 * self);
}
export const unitBall = (d) => (d === 3 ? (4 * Math.PI) / 3 : (Math.PI * Math.PI) / 2);
export function strongH(d, Z1, Z2, n_e, kT) {
  const ae = Math.pow(1 / (n_e * unitBall(d)), 1 / d), E = (Z) => (ionSphereCoef(d) * Z * Z) / (ae * Math.pow(Z, 1 / d));
  return (E(Z1) + E(Z2) - E(Z1 + Z2)) / kT;
}
