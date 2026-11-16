/* Plasma screening in d dimensions (no DOM): ours (3D, Gauss's 1/r) and 4D under the pinned 1/r, whose pair
   potential's transform is 4π²αħc/k³ (ours 4παħc/k²). For the nuclear rates of a star's core and the gas's pressure.
     · Debye–Hückel: ε(k) = 1 + (Σ n z²/kT) U(k), so k_D² = 4παħc Σn z²/kT (ours), k_D³ = 4π²αħc Σn z²/kT (4D); the sum
       runs over ions and electrons (z = 1), electrons taken as non-degenerate (an upper bound on their share).
     · Weak screening: a pair is pulled together by the screening cloud's potential at the nucleus,
       H_w = −ΔU(0) = Z₁Z₂ ∫dᵈk/(2π)ᵈ [U − U_screened] = C_d Z₁Z₂ αħc k_D, C₃ = 1 (Salpeter), C₄ = π/(3√3) = 0.6046.
     · Strong screening (few particles in a screening ball): the ion-sphere model, each nucleus inside a ball of its
       own Z electrons, E(Z) = −c_d Z² αħc/a_Z with a_Z from n_e (ours (4π/3)a³n_e = Z; 4D (π²/2)a⁴n_e = Z), and
       H_s = E(Z₁) + E(Z₂) − E(Z₁ + Z₂). c₃ = 9/10; c₄ from the book's 4D shell kernel k(r_</r_>)/r_> (atom/js/kernel.js).
     · The rate takes exp(H/kT) with H = min(H_w, H_s): weak screening where it holds, the ion sphere where weak
       screening would overshoot (the usual bridge; Salpeter 1954, Graboske et al. 1973 in ours).
     · The pressure's Coulomb term, by the virial for a degree −1 pair potential, ΔP = u/d: Debye–Hückel's energy
       density (ours −kT k_D³/8π; 4D (4/3) f with f = (kT/16π²) k_D⁴ I₄, I₄ = ∫u³[ln(1 + u⁻³) − u⁻³]du), or the ion
       spheres' Σ n_Z E(Z), whichever is smaller in size. */
import { kTab } from "./kernel.js";

const HBAR = 1.054571817e-34, C = 2.99792458e8, ALPHA = 7.2973525693e-3, KB = 1.380649e-23, AHC = ALPHA * HBAR * C;
export const CW = { 3: 1, 4: Math.PI / (3 * Math.sqrt(3)) };
/* c_d: a unit charge at the centre of a unit ball holding a unit charge of the other sign spread evenly */
export const CIS = (() => { const n = 4000, w = (r) => 4 * r ** 3, h = 1 / n; let e = 0;
  for (let i = 0; i < n; i++) { const r = (i + 0.5) * h; e -= (w(r) * h) / r; }
  let s = 0; for (let i = 0; i < n; i++) { const r1 = (i + 0.5) * h; for (let j = 0; j < n; j += 4) { const r2 = (j + 2) * h, lo = Math.min(r1, r2), hi = Math.max(r1, r2); s += w(r1) * h * w(r2) * 4 * h * (kTab(lo / hi) / hi); } }
  return { 3: 0.9, 4: -(e + 0.5 * s) }; })();
const I4 = (() => { let s = 0; for (let i = 0; i < 400000; i++) { const u = (i + 0.5) * 1e-4; s += u ** 3 * (Math.log1p(u ** -3) - u ** -3) * 1e-4; } return s; })();
/* the plasma at T with number densities: ions [[n, Z], …] (per m^d), electrons n_e */
export function plasma(d, T, ions, ne) {
  const kT = KB * T, nz2 = ions.reduce((t, [n, z]) => t + n * z * z, 0) + ne;
  const kD = d === 3 ? Math.sqrt((4 * Math.PI * AHC * nz2) / kT) : Math.cbrt((4 * Math.PI ** 2 * AHC * nz2) / kT);
  const aZ = (Z) => (d === 3 ? Math.cbrt((3 * Z) / (4 * Math.PI * ne)) : ((2 * Z) / (Math.PI ** 2 * ne)) ** 0.25), E = (Z) => (-CIS[d] * Z * Z * AHC) / aZ(Z);
  const Hw = (Z1, Z2) => CW[d] * Z1 * Z2 * AHC * kD, Hs = (Z1, Z2) => E(Z1) + E(Z2) - E(Z1 + Z2);
  const H = (Z1, Z2) => Math.min(Hw(Z1, Z2), Hs(Z1, Z2));
  const uDH = d === 3 ? (-kT * kD ** 3) / (8 * Math.PI) : (4 / 3) * ((kT / (16 * Math.PI ** 2)) * kD ** 4 * I4), uIS = ions.reduce((t, [n, z]) => t + n * E(z), 0);
  const u = -Math.min(-uDH, -uIS);
  return { kT, kD, perBall: d === 3 ? ((4 * Math.PI) / 3) * ne * kD ** -3 : ((Math.PI ** 2) / 2) * ne * kD ** -4, Hw, Hs, H, f: (Z1, Z2) => Math.exp(H(Z1, Z2) / kT), uDH, uIS, dP: u / d };
}
