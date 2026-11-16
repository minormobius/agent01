/* OPAL's Rosseland mean opacity for our world (no DOM): measured input, not the book's own physics. The tables are
   generated atom/js/opaldata.js (fusion/tools/opal.mjs, from MESA's distribution of OPAL, Iglesias & Rogers 1996, above
   log T 3.75 and Ferguson et al. 2005 below, at Asplund et al. 2009's mixture: MIST v1.2's opacities).
     · In each (Z, X) table, log κ on (log T, log R), R = ρ/T6³ in g/cm³: Catmull–Rom cubics both ways (C¹, so a
       Newton solve through it doesn't meet kinks); log R outside the table is held at its edge.
     · Low and high T blended over log T 3.80–3.88 (MESA's bounds), smoothly.
     · Between tables: linear in X and in Z (log κ). X past 0.95 and Z past 0.03 are held at the edge.
   kappa(ρ [kg/m³], T [K], X, Z) → m²/kg. */
import { OPAL } from "./opaldata.js";

const fam = (f) => ({ T: f.logT, R: f.logR, nR: f.logR.length, tabs: f.tabs.map((b) => { const u = Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); return new Int16Array(u.buffer); }) });
const HI = fam(OPAL.hi), LO = fam(OPAL.lo), ZS = OPAL.Z, XS = OPAL.X, NX = XS.length;
const BLO = 3.8, BHI = 3.88;

function locate(ax, x) { // index i with ax[i] ≤ x < ax[i+1] (clamped) and the fraction
  const n = ax.length; if (x <= ax[0]) return [0, 0]; if (x >= ax[n - 1]) return [n - 2, 1];
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ax[m] <= x) lo = m; else hi = m; }
  return [lo, (x - ax[lo]) / (ax[lo + 1] - ax[lo])];
}
/* Catmull–Rom on a non-uniform axis: values at i−1..i+2, slopes by centred differences (one-sided at the ends) */
function cr(ax, i, t, get) {
  const n = ax.length, x0 = ax[i], x1 = ax[i + 1], h = x1 - x0, f0 = get(i), f1 = get(i + 1);
  const s0 = i > 0 ? (f1 - get(i - 1)) / (x1 - ax[i - 1]) : (f1 - f0) / h, s1 = i + 2 < n ? (get(i + 2) - f0) / (ax[i + 2] - x0) : (f1 - f0) / h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * f0 + (t3 - 2 * t2 + t) * h * s0 + (-2 * t3 + 3 * t2) * f1 + (t3 - t2) * h * s1;
}
function table(F, k, lT, lR) {
  const tab = F.tabs[k], [i, u] = locate(F.T, lT), [j, v] = locate(F.R, Math.min(Math.max(lR, F.R[0]), F.R[F.nR - 1]));
  return cr(F.T, i, u, (ii) => cr(F.R, j, v, (jj) => tab[ii * F.nR + jj] / 1000));
}
function family(F, lT, lR, X, Z) {
  const [iz, tz] = locate(ZS, Math.min(Math.max(Z, 0), ZS[ZS.length - 1])), [ix, tx] = locate(XS, Math.min(Math.max(X, 0), XS[NX - 1]));
  const at = (z, x) => table(F, z * NX + x, lT, lR);
  const row = (z) => at(z, ix) * (1 - tx) + at(z, ix + 1) * tx;
  return row(iz) * (1 - tz) + row(iz + 1) * tz;
}
/* log₁₀ κ in cm²/g */
export function logKappa(rho, T, X, Z) {
  const lT = Math.log10(T), lR = Math.log10(rho / 1000) - 3 * lT + 18;
  if (lT >= BHI) return family(HI, lT, lR, X, Z);
  if (lT <= BLO) return family(LO, lT, lR, X, Z);
  const w = 0.5 - 0.5 * Math.cos((Math.PI * (lT - BLO)) / (BHI - BLO));
  return family(LO, lT, lR, X, Z) * (1 - w) + family(HI, lT, lR, X, Z) * w;
}
export const kappa = (rho, T, X, Z) => 0.1 * 10 ** logKappa(rho, T, X, Z);
export const kappaOPAL = (comp) => (rho, T) => kappa(rho, T, comp.X, comp.Z);
export const RANGE = { logT: [LO.T[0], HI.T[HI.T.length - 1]], logR: [HI.R[0], HI.R[HI.nR - 1]], Z: [ZS[0], ZS[ZS.length - 1]], X: [XS[0], XS[NX - 1]] };
