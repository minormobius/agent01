/* The 1/r kernel averaged over a 3-sphere, no DOM, no imports: the potential at radius r of a thin spherical shell of
   radius s carrying unit charge (or mass) in 4D, under the pinned 1/r, is k(min/max)/max. In 3D Newton's shell theorem
   makes it 1/max; in 4D there's no shell theorem, so it depends on the ratio, with k(0) = 1 and k(1) = 8/3π. The atom
   solver's electron clouds, the stars' layers and the fields' shells all use it. */
/* k(t): the 1/r kernel averaged over a 3-sphere, t = min/max of the two radii (Simpson in θ) */
export function k4(t) {
  if (t === 0) return 1;
  const M = 400; let s = 0;
  for (let i = 0; i <= M; i++) { const th = (Math.PI * i) / M, w = i === 0 || i === M ? 1 : i % 2 ? 4 : 2, d2 = 1 + t * t - 2 * t * Math.cos(th); s += d2 > 0 ? (w * Math.sin(th) ** 2) / Math.sqrt(d2) : 0; }
  return ((s * Math.PI) / (3 * M)) * (2 / Math.PI);
}
const KT = new Float64Array(2001); for (let i = 0; i <= 2000; i++) KT[i] = k4(i / 2000);
export const kTab = (t) => { const x = t * 2000, i = Math.min(1999, Math.floor(x)), f = x - i; return KT[i] + (KT[i + 1] - KT[i]) * f; };
/* the same average for a law 1/r^η (paper 1's bracket of the pinned law, η = 0.5 and 1.5): a shell of radius s felt at
   r gives kη(min/max)/max^η, kη(t) = (2/π)∫₀^π sin²θ (1 + t² − 2t cos θ)^(−η/2) dθ, kη(0) = 1. η = 1 is k4. Tabulated
   per η on 2001 points, Simpson on 2000 intervals (the integrand at t = 1 goes as θ^(2−η), integrable for η < 3) */
export function k4eta(t, eta, M = 2000) {
  if (t === 0) return 1;
  let s = 0;
  for (let i = 0; i <= M; i++) { const th = (Math.PI * i) / M, w = i === 0 || i === M ? 1 : i % 2 ? 4 : 2, d2 = 1 + t * t - 2 * t * Math.cos(th); s += d2 > 0 ? w * Math.sin(th) ** 2 * Math.pow(d2, -eta / 2) : 0; }
  return ((s * Math.PI) / (3 * M)) * (2 / Math.PI);
}
const KET = {};
export const kEtaTab = (eta) => { if (!KET[eta]) { const T = new Float64Array(2001); for (let i = 0; i <= 2000; i++) T[i] = k4eta(i / 2000, eta); KET[eta] = T; } const T = KET[eta];
  return (t) => { const x = t * 2000, i = Math.min(1999, Math.floor(x)), f = x - i; return T[i] + (T[i + 1] - T[i]) * f; }; };
