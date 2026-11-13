/* The weak force in d space dimensions, no DOM: Fermi's contact theory written for any d (the roadmap's A1).
   One nucleon turns into the other at a point, emitting or absorbing an electron and a neutrino. With ħ = c = 1:

     dΓ = 2π G_d² |M|² δ(E₀ − E_e − E_ν) d^dp_e/(2π)^d d^dp_ν/(2π)^d     (the nucleus takes the recoil, carries no energy)

   so the coupling G_d has units of mass^−(d−1) (ours G_F, mass⁻²; in 4D mass⁻³), and integrating the massless neutrino
   and the electron's directions leaves

     Γ = G_d² m_e^(2d−1) |M|² Ω_d² f_d(W₀) / (2π)^(2d−1),   f_d(W₀) = ∫₁^W₀ p^(d−2) W (W₀ − W)^(d−1) dW

   (W the electron's total energy and p its momentum in m_e; ours is the textbook G_F² m_e⁵|M|² f/2π³). No Fermi
   function (the outgoing lepton's Coulomb distortion), as the book's p + p leaves it out; on our neutron that costs 7%.
   |M|² is the nucleus's: for the free neutron |V_ud|²(1 + 3g_A²), the axial part counting the three generators of the
   SU(2) that turns the nucleon's spin. In 4D the nucleon is the smallest spinor (two states, one half of SO(4)), so the
   count is the same; g_A belongs to the strong force and is ours (declared).

   The one thing the book must choose is G₄. It is G_F's 4D counterpart, G/√2 = g²/8M_W²; a 4 + 1 gauge coupling g₅²
   is a length, so "the weak force as strong as ours at its own scale" (g₅² M_W = g²) gives G4_REF = G_F/M_W, the
   reference every G₄ here is quoted against. The first minutes need it twice: freeze-out (the neutron–proton rates
   against the expansion) and the neutron's lifetime. */

export const ME = 0.51099895, Q_NP = 1.29333236, HBAR = 6.582119569e-22; // MeV, MeV, MeV s
export const GF = 1.1663788e-11, MW = 80377, GA = 1.2754, VUD2 = 0.94741; // MeV⁻², MeV, —, —
export const G4_REF = GF / MW; // MeV⁻³
export const M2_NEUTRON = VUD2 * (1 + 3 * GA * GA);
const gammaHalf = (d) => (d % 2 === 0 ? [1, 1, 1, 2, 6, 24][d / 2] : (Math.sqrt(Math.PI) * [1, 0.5, 0.75, 1.875][(d - 1) / 2]));
export const omega = (d) => (2 * Math.PI ** (d / 2)) / gammaHalf(d); // the unit sphere's area in d dimensions

/* the lepton phase space f_d(W₀), W₀ = 1 + T₀/m_e (T₀ the electron's kinetic endpoint) */
export function phaseSpace(d, W0, n = 4000) {
  if (!(W0 > 1)) return 0; let f = 0;
  for (let i = 0; i < n; i++) { const W = 1 + ((i + 0.5) / n) * (W0 - 1), p = Math.sqrt(W * W - 1); f += p ** (d - 2) * W * (W0 - W) ** (d - 1); }
  return (f * (W0 - 1)) / n;
}
/* the weak prefactor G² m_e^(2d−1) Ω_d²/(2π)^(2d−1), MeV */
export const prefactor = (d, G) => (G * G * ME ** (2 * d - 1) * omega(d) ** 2) / (2 * Math.PI) ** (2 * d - 1);
/* a decay's rate (s⁻¹) from its kinetic endpoint T₀ (MeV) and nuclear |M|² */
export const decayRate = (d, G, M2, T0) => (prefactor(d, G) * M2 * phaseSpace(d, 1 + T0 / ME)) / HBAR;
/* the free neutron's lifetime, s (endpoint Q − m_e) */
export const neutronLife = (d, G) => 1 / decayRate(d, G, M2_NEUTRON, Q_NP - ME);
/* a measured decay's |M|² in ours, from its half-life and endpoint: what the 4D network carries to 4D (the nucleus's
   part), with 4D's own G and phase space put back in */
export const m2FromHalf = (T0, half) => Math.LN2 / half / ((prefactor(3, GF) * phaseSpace(3, 1 + T0 / ME)) / HBAR);

/* the neutron → proton rate per neutron in the hot early universe (s⁻¹): n + ν → p + e⁻ and n + e⁺ → p + ν̄, the
   leptons thermal at T (MeV) and Pauli-blocked, the electron's mass kept (it slows the rates near freeze-out, as in
   ours). The crossed decay's own phase space: each channel K Ω_d² ∫ p_ν^(d−1) p_e^(d−2) E_e f(in)(1 − f(out)) dE,
   energy kept (E_e = E_ν + Q, or E_ν = E_e + Q); the electron's d^dp = Ω p^(d−2) E dE */
export function npRate(d, G, T, M2 = M2_NEUTRON) {
  const fd = (E) => 1 / (Math.exp(E / T) + 1), pe = (E) => Math.sqrt(Math.max(0, E * E - ME * ME)), n = 4000, Emax = 60 * T + Q_NP + ME; let s = 0;
  for (let i = 0; i < n; i++) { const E = ((i + 0.5) / n) * Emax;
    const Ee = E + Q_NP; s += E ** (d - 1) * fd(E) * pe(Ee) ** (d - 2) * Ee * (1 - fd(Ee)); // n + ν → p + e⁻ (E the neutrino's)
    if (E > ME) { const Ev = E + Q_NP; s += pe(E) ** (d - 2) * E * fd(E) * Ev ** (d - 1) * (1 - fd(Ev)); } } // n + e⁺ → p + ν̄ (E the positron's)
  s *= Emax / n;
  return ((G * G * M2 * omega(d) ** 2) / (2 * Math.PI) ** (2 * d - 1) * s) / HBAR;
}
/* freeze-out: where that rate falls to the expansion rate H = 1/(q t), t = t₁ (1 MeV/T)^q (bbn.js's clock) */
export function freezeOut(d, G, { t1 = 1.32, q = (d + 1) / 2, M2 = M2_NEUTRON } = {}) {
  const H = (T) => T ** q / (q * t1);
  let lo = 1e-4, hi = 1e6; for (let i = 0; i < 200; i++) { const m = Math.sqrt(lo * hi); if (npRate(d, G, m, M2) > H(m)) hi = m; else lo = m; }
  return Math.sqrt(lo * hi);
}
/* the neutrons left when the weak rates fall behind the expansion: dX/dt = −Γ_np X + Γ_pn (1 − X), Γ_pn = Γ_np e^(−Q/T)
   (detailed balance, leptons massless and thermal), integrated as the universe cools from equilibrium until the rates
   are a thousandth of the expansion's (the free neutron's decay is left to bbn.js, which applies it from freeze-out to
   the deuterium bottleneck). Returns the frozen neutron fraction and the freeze-out temperature it is equivalent to,
   T_f = Q/ln(1/X − 1), which is what bbn.js's firstMinutes takes */
export function neutronFraction(d, G, { t1 = 1.32, q = (d + 1) / 2, M2 = M2_NEUTRON } = {}) {
  const t = (T) => t1 * T ** -q, Tf0 = freezeOut(d, G, { t1, q, M2 });
  let T = Tf0 * 30, X = 1 / (1 + Math.exp(Q_NP / T)); const r = 0.995;
  while (T > Tf0 / 30) { const Tn = T * r, dt = t(Tn) - t(T), Tm = Math.sqrt(T * Tn), g = npRate(d, G, Tm, M2), gb = g * Math.exp(-Q_NP / Tm), Xeq = gb / (g + gb);
    X = Xeq + (X - Xeq) * Math.exp(-(g + gb) * dt); T = Tn; }
  return { X, Tf: Q_NP / Math.log(1 / X - 1), Tnaive: Tf0 };
}
/* the ratio of the weak factor in p + p (or any decay) in d dimensions to ours, at the same nuclear part and endpoint T₀:
   [G_d² m_e^(2d−1) Ω_d² f_d / (2π)^(2d−1)] / [G_F² m_e⁵ Ω_3² f_3 / (2π)⁵]. The book's p + p and β decays carry ours'
   weak factor; this is what 4D's own weak force multiplies them by */
export const weakRatio = (d, G, T0) => (prefactor(d, G) * phaseSpace(d, 1 + T0 / ME)) / (prefactor(3, GF) * phaseSpace(3, 1 + T0 / ME));
