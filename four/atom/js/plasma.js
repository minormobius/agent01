/* A stellar plasma under the lens vacuum, in any d (no DOM; atomic units, the pinned potential q₁q₂/r).
   Weak (Debye–Hückel) screening: a nucleus's cloud of neighbours lowers the barrier by the potential the cloud makes at
   the nucleus, so a fusion rate gains f = e^H, H = −q₁ φ_ind(0)/kT, with the bare kernel G(k) and κ̃ = Σ n_j q_j²/kT:
       φ_ind(0) = −q ∫ d^dk/(2π)^d G²κ̃/(1 + Gκ̃)
   ours, G = 4π/k², gives Debye's −q√(4πκ̃); pinned 4D, G = 4π²/|k|³, gives −q (4π²)^{4/3} κ̃^{1/3}/(12√3 π).
   Resistive decay: the vector potential a current makes is 4πJ/(c²k²) in ours and 4π²J/(c²|k|³) in pinned 4D, so with
   J = σE a field of scale L = 1/k decays at c²k²/4πσ (ours) and c²k³/4π²σ (4D). Electron–ion momentum transfer off
   Z/r: θ = 2b₀/b with b₀ = Z/v²; σ_tr = 4πb₀² ln(λ/b₀) in ours (Spitzer's logarithm), 8πb₀²λ in 4D (impact
   parameters fill a 3D plane: the integral grows linearly to the screening length λ). */
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
