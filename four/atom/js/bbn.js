/* The universe's first minutes in d dimensions, no DOM: what the hot early universe leaves behind as it cools through
   nuclear temperatures. A reduced network, the standard first estimate, written for any d:

   · photons: n_γ = (d − 1) S_d Γ(d) ζ(d) T^d / (2π)^d (2ζ(3)/π² ours, π²/40 in 4D; ħ = c = 1), baryons n_b = η n_γ;
   · neutrons: frozen out of balance with protons at T_f, X_f = 1/(1 + e^(Q/T_f)), then decaying with lifetime τ;
   · the deuterium bottleneck (Saha): deuterons outnumber the neutrons they come from once
     X_p η n_γ (3/4) (4πħ²/m T)^(d/2) e^(B/T) = 1, which sets T_D; every neutron left then ends in helium-4, Y = 2 X_n(t_D);
   · past helium, the captures computed in nuclear.js, two helium-4s → beryllium-8 (E2) and a proton on a helium-4 →
     mass 5 (E1), integrated from T_D down a hundredfold as the universe cools, each using up helium-4 (protons, far more
     numerous, are taken as unused). What mass 5 and beryllium-8 do next isn't in it: the network stops there.

   What the book hasn't fixed enters as parameters, each ours by default: the weak force (T_f = 0.8 MeV, τ = 879 s), the
   baryons per photon η, and the expansion clock t(T) = t₁ (1 MeV/T)^q, q = (d + 1)/2 if the expansion rate goes as the
   square root of radiation's energy density (T^(d+1)), as ours does (t₁ = 1.32 s). Gravity's law would fix q and t₁. */
const HC = 197.327, MN = 938.92, Q = 1.2933, C_FM = 2.99792458e23; // MeV fm, MeV, MeV, fm/s
const SD = { 3: 4 * Math.PI, 4: 2 * Math.PI ** 2 }, GAMMA = { 3: 2, 4: 6 }, ZETA = { 3: 1.2020569031595942, 4: Math.PI ** 4 / 90 }, GHALF = { 3: Math.sqrt(Math.PI) / 2, 4: 1 };
export const OURS = { Tf: 0.8, tau: 879.4, eta: 6.1e-10, t1: 1.32 };
/* photons per fm^d at T (MeV) */
export const photons = (d, T) => (((d - 1) * SD[d] * GAMMA[d] * ZETA[d]) / (2 * Math.PI) ** d) * (T / HC) ** d;
/* the temperature at which the deuterium bottleneck breaks, for deuteron binding B (MeV) */
export function bottleneck(d, B, eta, Xp = 0.87) {
  if (!(B > 0)) return 0;
  const f = (T) => Math.log(Xp * eta * photons(d, T) * 0.75) + (d / 2) * Math.log((4 * Math.PI * HC * HC) / (MN * T)) + B / T;
  let lo = 1e-6, hi = 2; for (let i = 0; i < 200; i++) { const m = Math.sqrt(lo * hi); if (f(m) > 0) lo = m; else hi = m; } return Math.sqrt(lo * hi);
}
/* ⟨σv⟩ at T from a table of σv (fm^(d−1) c) against relative energy E (MeV), log–log between points, nothing outside */
export function thermal(d, T, table) {
  const { E, sv } = table, n = 400, Emin = E[0], Emax = E[E.length - 1], at = (x) => { if (x < Emin || x > Emax) return 0; let i = 0; while (i < E.length - 2 && E[i + 1] < x) i++; if (!(sv[i] > 0 && sv[i + 1] > 0)) return 0; const f = Math.log(x / E[i]) / Math.log(E[i + 1] / E[i]); return Math.exp(Math.log(sv[i]) * (1 - f) + Math.log(sv[i + 1]) * f); };
  let s = 0; const a = Math.log(Emin), b = Math.log(Math.min(Emax, 80 * T)); if (b <= a) return 0;
  for (let k = 0; k < n; k++) { const x = Math.exp(a + ((b - a) * (k + 0.5)) / n); s += at(x) * x ** (d / 2) * Math.exp(-x / T) * ((b - a) / n); } // dE = x dln x
  return s / (GHALF[d] * T ** (d / 2));
}
/* the first minutes: helium-4's mass fraction Y, and the mass fractions made past it */
export function firstMinutes({ d, B, eta = OURS.eta, t1 = OURS.t1, q = (d + 1) / 2, Tf = OURS.Tf, tau = OURS.tau, aa = null, pa = null }) {
  const TD = bottleneck(d, B, eta), t = (T) => t1 * Math.pow(T, -q), Xf = 1 / (1 + Math.exp(Q / Tf));
  if (!(TD > 0)) return { TD: 0, tD: Infinity, Y: 0, X5: 0, X8: 0, Yleft: 0, f5: 0 };
  const tD = t(TD), Y = Math.min(1, 2 * Xf * Math.exp(-tD / tau)), Yp = 1 - Y;
  // from T_D down a hundredfold, cooling: each helium-4 meets protons (abundant, barely used up) and other helium-4s
  let Ya = Y / 4, Y5 = 0, Y8 = 0; const n = 600, lo = Math.log(TD / 100), hi = Math.log(TD);
  for (let k = n - 1; k >= 0; k--) { const T = Math.exp(lo + ((hi - lo) * (k + 0.5)) / n), dt = q * t(T) * ((hi - lo) / n), nb = eta * photons(d, T);
    const rp = pa ? nb * Yp * thermal(d, T, pa) * C_FM : 0, ra = aa ? nb * Ya * thermal(d, T, aa) * C_FM : 0, lost = Ya * (1 - Math.exp(-(rp + ra) * dt));
    Y5 += (rp + ra > 0 ? (rp / (rp + ra)) * lost : 0); Y8 += (rp + ra > 0 ? (ra / (rp + ra)) * lost / 2 : 0); Ya -= lost; }
  return { TD, tD, Y, X5: 5 * Y5, X8: 8 * Y8, Yleft: 4 * Ya, f5: Y > 0 ? (5 * Y5) / (1.25 * Y) : 0 };
}
