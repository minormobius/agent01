/* How far a periodic table can go, no DOM: the innermost electron round a nucleus of charge Z, by Dirac's equation in d
   dimensions of space. Its radial form is our own with the spin–orbit number κ_d = ±(j + (d − 2)/2) in place of ±(j + ½)
   (units ħ = c = m = 1, lengths in Compton wavelengths):
       G′ = −(κ/r) G + (E + 1 − V) F,     F′ = (κ/r) F − (E − 1 − V) G.
   The innermost level has κ = −(d − 1)/2: −1 ours, −3/2 in 4D. Round a point nucleus its energy is √(κ² − (Zα)²)/|κ|, so
   it fails at Zα = |κ|: Z = 137 ours, 205 in 4D. Its non-relativistic limit −(Zα)²/2κ² is js/atom.js's 4D hydrogen,
   −Z²/2(3/2)². A nucleus with size softens the pull inside it, and the level instead dives into the negative continuum
   (E = −1) at a higher Z: ours near 170, which is the check. The 4D nucleus's potential comes from js/kernel.js's shell
   kernel (pinned 1/r, no shell theorem).

   groundLevel shoots outward on a log grid: below the level G stays node-free, past it it crosses once; the negative
   continuum is kept out of the bracket. */
import { k4 } from "./kernel.js";

export const ALPHA = 1 / 137.035999, COMPTON = 386.159; // fm
/* a uniform ball's potential at r, radius R, charge Zα: Newton's in 3D, the shell kernel's in pinned 4D */
function ballPot(d, Za, R) {
  if (d === 3) return (r) => (r >= R ? -Za / r : (-Za * (3 - (r * r) / (R * R))) / (2 * R));
  const n = 400, M = 400, tab = Array.from({ length: M + 1 }, (_, i) => {
    const r = (1.5 * R * i) / M; let s = 0;
    for (let j = 0; j < n; j++) { const q = (R * (j + 0.5)) / n, w = ((4 * q ** 3) / R ** 4) * (R / n), lo = Math.min(r, q), hi = Math.max(r, q); s += hi > 0 ? (w * k4(lo / hi)) / hi : 0; }
    return -Za * s;
  });
  return (r) => { if (r >= 1.5 * R) return -Za / r; const x = (r / (1.5 * R)) * M, i = Math.min(M - 1, Math.floor(x)), f = x - i; return tab[i] * (1 - f) + tab[i + 1] * f; };
}
function shoot(E, kap, V, rmax) {
  const N = 6000, r0 = 1e-7, h = Math.log(rmax / r0) / N; let r = r0, G = r ** Math.abs(kap), F = 0, nodes = 0;
  const f = (r, G, F) => [-(kap / r) * G + (E + 1 - V(r)) * F, (kap / r) * F - (E - 1 - V(r)) * G];
  for (let i = 0; i < N; i++) {
    const dr = r * (Math.exp(h) - 1), a = f(r, G, F), b = f(r + dr / 2, G + (dr / 2) * a[0], F + (dr / 2) * a[1]), c = f(r + dr / 2, G + (dr / 2) * b[0], F + (dr / 2) * b[1]), e = f(r + dr, G + dr * c[0], F + dr * c[1]);
    const Gn = G + (dr / 6) * (a[0] + 2 * b[0] + 2 * c[0] + e[0]), Fn = F + (dr / 6) * (a[1] + 2 * b[1] + 2 * c[1] + e[1]);
    if (Gn * G < 0) nodes++; G = Gn; F = Fn; r += dr; const m = Math.hypot(G, F); if (m > 1e100) { G /= m; F /= m; }
  }
  return nodes;
}
/* the innermost level's energy (units of mc², rest mass included) for charge Z and a nucleus of radius Rfm (0: a point);
   −Infinity once it has dived */
export function groundLevel(d, Z, Rfm) {
  const kap = -(d - 1) / 2, Za = Z * ALPHA, V = Rfm > 0 ? ballPot(d, Za, Rfm / COMPTON) : (r) => -Za / r;
  const below = (E) => shoot(E, kap, V, Math.min(600, 40 / Math.sqrt(Math.max(1e-8, 1 - E * E)))) === 0;
  let lo = -0.99999, hi = 0.99999; if (!below(lo)) return -Infinity;
  for (let it = 0; it < 60; it++) { const m = (lo + hi) / 2; if (below(m)) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/* the Z at which the innermost level reaches −mc², for nuclei of radius r0 A^(1/d) with A = AperZ · Z */
export function criticalZ(d, { r0 = d === 3 ? 1.2 : 1.0, AperZ = 2.5, lo = d === 3 ? 140 : 206, hi = d === 3 ? 260 : 600, iters = 26 } = {}) {
  const R = (Z) => r0 * Math.pow(AperZ * Z, 1 / d);
  for (let it = 0; it < iters; it++) { const Z = (lo + hi) / 2; if (groundLevel(d, Z, R(Z)) > -0.99998) lo = Z; else hi = Z; }
  return (lo + hi) / 2;
}
