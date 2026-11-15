/* Light absorbed by a hydrogen-like atom in d dimensions, no DOM: the bound–free (photoionization) cross-section of every
   level, from the book's own dipole rate. Atomic units throughout (ħ = m_e = e = 1, lengths in bohr, energies in hartree).

   · The atom. Under the pinned 1/r the radial equation is u″ = [L(L + 1)/r² − 2Z/r − 2E] u with L = l + (d − 3)/2
     (atom.js), so the levels are E = −Z²/2ν², ν = n_r + L + 1 (4D hydrogen: ν = 3/2, 6.05 eV), and the bound radial
     functions are u = r^(L+1) e^(−Zr/ν) L_{n_r}^(2L+1)(2Zr/ν), normalized on the grid. Continuum functions by Numerov,
     energy-normalized (∫ u_E u_E′ dr = δ(E − E′), so u → √(2/πk) sin φ far out, read from the local amplitude).
   · The light. The book's dipole emission rate is Γ = K α ω³ |⟨f|r|i⟩|²/c² (nuclear.js E1RATE: K = 4/3 ours; 3π/8
     through the lens vacuum, ℓ cancelling). Detailed balance against each world's Planck law (d − 1 polarizations,
     modes Ω_d ω^(d−1) dω/(2πc)^d) turns it into an absorption cross-section for an isotropic or beamed field:
         σ(ω) = K α^(4−d) (2π)^d ω^(4−d) |D_E|² / ((d − 1) Ω_d)       (a₀^(d−1), |D_E|² per hartree)
     ours (4π²/3) α ω |D_E|², the textbook result; 4D π³ |D_E|², no α: the lens's c/ℓω coupling makes 4D's light
     ~1/α stronger on atoms, as it does for scattering (mainseq.js sigmaLens).
   · The angles. From l to l ± 1, summed over the final m and the dipole's components, the weights are
     w₊ = (l + d − 2)/(2l + d − 2) and w₋ = l/(2l + d − 2) (ours: (l + 1)/(2l + 1), l/(2l + 1)); they add to 1.
   Checks (selftest): ours' 1s threshold cross-section (6.30 × 10⁻¹⁸ cm²), and the Thomas–Reiche–Kuhn sum
   Σ_f (2ω_f/d)|D_f|² = 1 over bound and continuum states, in both worlds. */
export const ALPHA = 1 / 137.035999084, A0 = 0.529177210903e-10, HARTREE_EV = 27.211386245988;
export const SD = { 3: 4 * Math.PI, 4: 2 * Math.PI * Math.PI };
export const KRATE = { 3: 4 / 3, 4: (3 * Math.PI) / 8 };
export const Lof = (d, l) => l + (d - 3) / 2;
export const nuOf = (d, nr, l) => nr + Lof(d, l) + 1;
export const levelE = (d, Z, nr, l) => (-Z * Z) / (2 * nuOf(d, nr, l) ** 2);
/* how many states share a level: (2 spins) × the dimension of degree-l harmonics on S^(d−1) */
export const harmDim = (d, l) => (d === 3 ? 2 * l + 1 : (l + 1) * (l + 1));
export const wUp = (d, l) => (l + d - 2) / (2 * l + d - 2), wDown = (d, l) => l / (2 * l + d - 2);
const laguerre = (n, a, x) => { if (n === 0) return 1; let p = 1, q = 1 + a - x; for (let k = 1; k < n; k++) { const r = ((2 * k + 1 + a - x) * q - (k + a) * p) / (k + 1); p = q; q = r; } return q; };

/* the radial grid: uniform, r = i h */
export function grid(rmax, h) { const n = Math.ceil(rmax / h), r = new Float64Array(n + 1); for (let i = 0; i <= n; i++) r[i] = i * h; return { r, h, n }; }
export function bound(d, Z, nr, l, g) {
  const L = Lof(d, l), nu = nuOf(d, nr, l), u = new Float64Array(g.n + 1); let s = 0;
  for (let i = 1; i <= g.n; i++) { const r = g.r[i], x = (2 * Z * r) / nu; u[i] = Math.exp((L + 1) * Math.log(r) - (Z * r) / nu) * laguerre(nr, 2 * L + 1, x); s += u[i] * u[i]; }
  const N = 1 / Math.sqrt(s * g.h); for (let i = 1; i <= g.n; i++) u[i] *= N; return { E: (-Z * Z) / (2 * nu * nu), u };
}
/* the energy-normalized continuum at E > 0 */
export function continuum(d, Z, l, E, g) {
  const L = Lof(d, l), f = (r) => (L * (L + 1)) / (r * r) - (2 * Z) / r - 2 * E, u = new Float64Array(g.n + 1), h2 = (g.h * g.h) / 12;
  u[1] = g.h ** (L + 1); u[2] = (2 * g.h) ** (L + 1) * (1 + (Z * g.h) / (L + 1)); // r^(L+1)(1 − Zr/(L+1))⁻¹, near enough to start
  let f0 = f(g.r[1]), f1 = f(g.r[2]);
  for (let i = 2; i < g.n; i++) { const f2 = f(g.r[i + 1]); u[i + 1] = (2 * u[i] * (1 + 5 * h2 * f1) - u[i - 1] * (1 - h2 * f0)) / (1 - h2 * f2); f0 = f1; f1 = f2;
    if (Math.abs(u[i + 1]) > 1e250) { for (let j = 0; j <= i + 1; j++) u[j] *= 1e-250; } }
  // amplitude from the last stretch: A² = u² + (u′/k)², k the local wave number (WKB: u = A √(k∞/k) sin φ)
  let A2 = 0, m = 0; const kInf = Math.sqrt(2 * E);
  for (let i = g.n - 400; i < g.n; i += 7) { const r = g.r[i], k = Math.sqrt(-f(r)), du = (u[i + 1] - u[i - 1]) / (2 * g.h); A2 += (u[i] * u[i] + (du * du) / (k * k)) * (k / kInf); m++; }
  const s = Math.sqrt(2 / (Math.PI * kInf)) / Math.sqrt(A2 / m); for (let i = 0; i <= g.n; i++) u[i] *= s; return { E, k: kInf, u };
}
export function dipole(ua, ub, g) { let s = 0; for (let i = 1; i <= g.n; i++) s += ua[i] * ub[i] * g.r[i]; return s * g.h; }
/* σ(ω) of level (n_r, l) at photon energy ω (hartree), a₀^(d−1); the continuum's grid reaches rmax */
export function sigmaBF(d, Z, nr, l, w, { rmax, h = 0.004 } = {}) {
  const Ei = levelE(d, Z, nr, l), E = w + Ei; if (E <= 0) return 0;
  const k = Math.sqrt(2 * E), R = rmax ?? Math.max(160, (60 * 2 * Math.PI) / k + 4 * nuOf(d, nr, l) ** 2), g = grid(R, h), b = bound(d, Z, nr, l, g); let D2 = 0;
  for (const [lf, wt] of [[l + 1, wUp(d, l)], [l - 1, wDown(d, l)]]) { if (lf < 0 || wt === 0) continue; const I = dipole(b.u, continuum(d, Z, lf, E, g).u, g); D2 += wt * I * I; }
  return (KRATE[d] * ALPHA ** (4 - d) * (2 * Math.PI) ** d * w ** (4 - d) * D2) / ((d - 1) * SD[d]);
}
/* the Thomas–Reiche–Kuhn sum for level (n_r, l): bound–bound to n_r′ < nb, then the continuum (log grid in E to Emax) */
export function trk(d, Z, nr, l, { nb = 40, rmax = 4000, h = 0.02, Emax = 400, nE = 160 } = {}) {
  const g = grid(rmax, h), b = bound(d, Z, nr, l, g); let bb = 0, bf = 0;
  for (const [lf, wt] of [[l + 1, wUp(d, l)], [l - 1, wDown(d, l)]]) { if (lf < 0 || wt === 0) continue;
    for (let n2 = 0; n2 < nb; n2++) { const f = bound(d, Z, n2, lf, g), I = dipole(b.u, f.u, g); bb += ((2 * (f.E - b.E)) / d) * wt * I * I; }
    // continuum: ∫ dE (2(E − E_i)/d) w |I(E)|², E on a log grid (Simpson in ln E)
    const gc = grid(Math.max(600, rmax / 4), 0.004), bc = bound(d, Z, nr, l, gc), lo = Math.log(1e-4), hi = Math.log(Emax); let s = 0;
    for (let j = 0; j <= nE; j++) { const E = Math.exp(lo + ((hi - lo) * j) / nE), I = dipole(bc.u, continuum(d, Z, lf, E, gc).u, gc), c = j === 0 || j === nE ? 1 : j % 2 ? 4 : 2;
      s += c * E * ((2 * (E - bc.E)) / d) * wt * I * I; }
    bf += (s * (hi - lo)) / (3 * nE); }
  return { bb, bf, total: bb + bf };
}
