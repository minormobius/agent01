/* The stars' plasma under the lens vacuum: how much the free charges in a core speed up fusion (Salpeter's screening),
   and how frozen a star's magnetic field is. Atomic units throughout (the pinned potential q₁q₂/r, as the atom solver's).
   Screening (weak, Debye–Hückel): each charge's cloud of neighbours lowers the barrier at the nucleus by the potential its
   screening cloud makes there, so a rate gains f = e^H with H = −q₁ φ_ind(0)/kT. With the bare kernel G(k) and
   κ̃ = Σ n_j q_j²/kT, φ_ind(0) = −q ∫ d^dk/(2π)^d G²κ̃/(1 + Gκ̃):
     ours, G = 4π/k²:          φ_ind(0) = −q √(4πκ̃)  (Debye's κ_D; Salpeter's weak screening, the check)
     4D pinned, G = 4π²/|k|³:  φ_ind(0) = −q (4π²)^{4/3} κ̃^{1/3} / (12√3 π)
   finite, though the screened potential keeps a power-law tail (|k|³ isn't smooth in k²), and growing as κ̃^{1/3}, not
   κ̃^{1/2}. Electrons are counted fully (nondegenerate) and not at all (fully degenerate): the band.
   Frozen flux: with the lens vacuum's μ(k) the vector potential a current makes is A = 4πJ/(c²k²) in ours and
   4π²J/(c²|k|³) in 4D (the same pinning as the charges' potential, and the same 1/c² between magnetism and electricity),
   so Ohm's law J = σE makes a field of scale L = 1/k decay at c²k²/4πσ in ours and c²k³/4π²σ in 4D: an effective
   diffusivity η = c²/4πσ against c²/(4π²σL), and a magnetic Reynolds number vL/η growing as L in ours and L² in 4D.
   σ = n_e τ (Drude), τ from electron–ion momentum transfer: the small-angle deflection off Z/r is θ = 2b₀/b
   (b₀ = Z/v², the same pinned force in both worlds), so σ_tr = ∫ 2b₀²/b² dA over the plane of impact parameters: 2π b db
   in ours, giving 4πb₀² ln(λ/b₀) (Spitzer's logarithm), and 4π b² db in 4D, giving 8πb₀²λ, linear in the cutoff: 4D's
   collisions are set by the screening length λ itself (ours √(1/4πκ̃), 4D (4π²κ̃)^(−1/3), where the screening sets in).
     node four/atom/tools/plasma.mjs      → js/plasmadata.js (the Sun as the check, 4D's Sun-long stars at each G) */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { rhoOf, SI } from "../js/mainseq.js";
import { screeningH, screeningLength, transportCross, diffusivity } from "../js/plasma.js";

const here = path.dirname(new URL(import.meta.url).pathname);
const BOHR = 5.29177210903e-11, AUT = 2.4188843265857e-17, HARTREE_K = 315775.02, C = 137.035999;
const toAU = { n: (perM, d) => perM * BOHR ** d, L: (m) => m / BOHR, T: (K) => K / HARTREE_K };
export function plasma(d, { rho, T, X, Y, Rstar, v }) {
  const n_e = toAU.n((rho * (X + Y / 2)) / SI.mu, d), n_p = toAU.n((rho * X) / SI.mu, d), n_a = toAU.n((rho * Y) / (4 * SI.mu), d), kT = toAU.T(T);
  const kAll = (n_e + n_p + 4 * n_a) / kT, kIons = (n_p + 4 * n_a) / kT;
  const H = (Z1Z2, k) => screeningH(d, Z1Z2, k, kT);
  // the electrons' Fermi energy against kT (a free gas of spin ½ in d dims): n = 2 V_d k_F^d/(2π)^d
  const Vd = d === 3 ? (4 * Math.PI) / 3 : Math.PI ** 2 / 2, kF = Math.pow((n_e * (2 * Math.PI) ** d) / (2 * Vd), 1 / d), degeneracy = (kF * kF) / 2 / kT;
  // screening length, collision rate, conductivity (electrons at the thermal speed √(d kT))
  const lam = screeningLength(d, kAll), vth = Math.sqrt(d * kT), nuOf = (Z, nI) => nI * vth * transportCross(d, Z, vth, lam);
  const nu = nuOf(1, n_p) + nuOf(2, n_a), sigma = n_e / nu, L = toAU.L(Rstar);
  const eta = diffusivity(d, sigma, L); // bohr²/au time
  const etaSI = (eta * BOHR * BOHR) / AUT, decayYears = (Rstar * Rstar) / etaSI / 3.156e7, Rm = (v * Rstar) / etaSI;
  return { n_e, kT, degeneracy, lam: lam * BOHR, H: { pp: [H(1, kIons), H(1, kAll)], aa: [H(4, kIons), H(4, kAll)], heavy100: [H(100, kIons), H(100, kAll)] }, sigma, etaSI, decayYears, Rm };
}
const out = { ours: null, four: [] };
{ // the Sun's centre: 1.5e8 kg/m³, 15.7 MK, X 0.34 Y 0.64 (the evolved centre; the zero-age one is X 0.7)
  out.ours = { label: "the Sun's centre", ...plasma(3, { rho: 1.5e5, T: 1.57e7, X: 0.34, Y: 0.64, Rstar: 6.96e8, v: 100 }) };
}
const { MAINSEQ } = await import("../js/mainseqdata.js");
for (const G of [1e-14, 1e-17, 1e-20]) {
  const run = MAINSEQ.runs.find((x) => Math.abs(x.Grel / G - 1) < 1e-6 && x.rnp === 1 && x.ff === 1); if (!run) continue;
  const rows = run.rows.filter((r) => r.life), sunlong = rows.reduce((b, r) => (Math.abs(Math.log(r.life / 1e10)) < Math.abs(Math.log(b.life / 1e10)) ? r : b)), light = rows[0], heavy = rows.at(-1);
  for (const [label, r] of [["Sun-long", sunlong], ["lightest", light], ["heaviest", heavy]]) {
    const comp = { X: 0.75, Y: 0.25, Z: 0 }, rho = rhoOf(4, r.Pc, r.Tc, comp);
    out.four.push({ G, label, m: r.m, Tc: r.Tc, rho, ...plasma(4, { rho, T: r.Tc, X: 0.75, Y: 0.25, Rstar: r.R, v: 100 }) });
  }
}
const f = (x) => x.toExponential(2), band = ([a, b]) => `${Math.exp(a).toFixed(3)}–${Math.exp(b).toFixed(3)}`;
const line = (o) => `screening of p+p ×${band(o.H.pp)}, α+α ×${band(o.H.aa)}, Z₁Z₂ = 100: H ${o.H.heavy100[0].toFixed(2)}–${o.H.heavy100[1].toFixed(2)}${o.H.heavy100[1] > 1 ? " (strong: the weak formula fails)" : ""}; electrons E_F/kT ${o.degeneracy.toFixed(2)}; screening length ${f(o.lam)} m; η ${f(o.etaSI)} m²/s at the star's own scale, a field decays in ${f(o.decayYears)} years, Rm ${f(o.Rm)} at 100 m/s`;
console.log(`${out.ours.label}: ${line(out.ours)}`);
for (const o of out.four) console.log(`4D G ${o.G}, ${o.label} (${o.m.toFixed(2)} M_Ch, ${(o.Tc / 1e6).toFixed(1)} MK, ${f(o.rho)} kg/m⁴): ${line(o)}`);
writeFileSync(path.join(here, "../js/plasmadata.js"), `/* Generated by tools/plasma.mjs; do not edit. Stellar cores' plasma under the lens vacuum: weak (Debye–Hückel) screening
   exponents H for proton + proton, helium-4 + helium-4 and Z₁Z₂ = 100, electrons uncounted and counted (the band); the
   electrons' Fermi energy over kT; the screening length (m); the magnetic diffusivity at the star's radius (m²/s), a
   field's resistive decay time there (years) and the magnetic Reynolds number at 100 m/s. ours: the Sun's centre, the check. */
export const PLASMA = ${JSON.stringify(out)};
`);
