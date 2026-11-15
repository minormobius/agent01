/* An electron meeting a hydrogen atom in d dimensions, no DOM, and the light the meeting gives off: the free–free
   absorption of neutral hydrogen (ours' H⁻ free–free), which fills a cool photosphere's infrared. Atomic units.
   · Scattering, static exchange: the incoming electron moves in the 1s atom's own field (nucleus and cloud), with exchange
     for the spatially symmetric (singlet) and antisymmetric (triplet) pair, Ψ = ϕ(1)F(2) ± F(1)ϕ(2). Projected on ϕ(1)
     and on a partial wave (u = r^((d−1)/2) × radial part, L = l + (d − 3)/2):
       −½u″ + [L(L+1)/2r² − 1/r + J(r) − k²/2] u ± ∫ K_l(r, r′) u(r′) dr′ ± δ_l0 (2ε₀ − E) φ̃(r) ∫ φ̃ u dr′ = 0,
     φ̃ = the 1s in u-form, J its potential, K_l = φ̃(r) φ̃(r′) a_l(t)/max(r, r′) · λ/(l + λ) with a_l the Gegenbauer
     coefficient of the charge law's 1/|x − y| (hf.js akTable: ours t^l, 4D tabulated), λ = (d − 2)/2. The triplet s-wave
     leaves F's component along ϕ free, so a projector Λφ̃⟨φ̃| pins it. Solved as a dense linear system on a uniform grid
     and matched to free waves (√(πz/2) J_(L+½), Y_(L+½)) for the phase shifts. The atom's polarization (which the static
     field leaves out, and which lowers ours' scattering lengths) is not included: named, not hidden.
   · The momentum-transfer cross-section in d dimensions, spin-averaged (¼ singlet + ¾ triplet):
       σ_mt = 4(2π)^(d−1)/(Ω_d k^(d−1)) Σ_l N_l w₊(l) sin²(δ_l − δ_(l+1)),
     N_l the dimension of degree-l harmonics, w₊ = (l + d − 2)/(2l + d − 2) (ours: (4π/k²) Σ (l + 1) sin²(δ_l − δ_(l+1))).
   · Free–free, the soft-photon limit: a collision changing the velocity by Δv radiates dW/dω = K_rad |Δv|² (ours
     2α/3πc²; 4D the book's dipole rate, 9π/32 of that), summed over collisions with |Δv|² → 2vv′ (the photon's energy
     taken from the electron, E′ = E − ω, σ_mt at √(EE′)), and Kirchhoff with each world's modes gives the net absorption
       κ_ω = n_e n_H ∫ f(E) v · 2vv′ σ_mt K_rad dE · (eˣ − 1)/(c ω · (d − 1)Ω_d ω^(d−1)/(2πc)^d),   x = ω/kT,
     f the d-dimensional Maxwellian. Checked on ours against Bell & Berrington (1987)'s H⁻ free–free table. */
import { akTable } from "./hf.js";

const OM = { 3: 4 * Math.PI, 4: 2 * Math.PI * Math.PI }, ALPHA = 1 / 137.035999084, C_AU = 1 / ALPHA;
const harm = (d, l) => (d === 3 ? 2 * l + 1 : (l + 1) * (l + 1)), wUp = (d, l) => (l + d - 2) / (2 * l + d - 2);
const gammaFn = (x) => { const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x)); x -= 1; let a = 0.99999999999980993; const t = x + 7.5; for (let i = 0; i < 8; i++) a += g[i] / (x + i + 1); return Math.sqrt(2 * Math.PI) * t ** (x + 0.5) * Math.exp(-t) * a; };
/* √(πz/2) J_ν(z) and √(πz/2) Y_ν(z) for ν = L + ½: ours half-integer (spherical Bessel, closed form), 4D integer (series and asymptotics) */
function besselJY(nu, z) {
  if (Math.abs(nu - Math.round(nu)) > 0.25) { // spherical: j_l, y_l by upward recurrence from l = 0
    const l = Math.round(nu - 0.5); let j0 = Math.sin(z) / z, j1 = Math.sin(z) / z ** 2 - Math.cos(z) / z, y0 = -Math.cos(z) / z, y1 = -Math.cos(z) / z ** 2 - Math.sin(z) / z;
    if (l === 0) return [z * j0, z * y0]; for (let k = 1; k < l; k++) { const j2 = ((2 * k + 1) / z) * j1 - j0, y2 = ((2 * k + 1) / z) * y1 - y0; j0 = j1; j1 = j2; y0 = y1; y1 = y2; } return [z * j1, z * y1]; }
  // integer order n: J_n by its series (z modest) or Hankel's asymptotic form; Y_n likewise
  const n = Math.round(nu), sq = Math.sqrt((Math.PI * z) / 2);
  if (z > 25) { const mu = 4 * n * n, P = 1 - ((mu - 1) * (mu - 9)) / (2 * (8 * z) ** 2) + ((mu - 1) * (mu - 9) * (mu - 25) * (mu - 49)) / (24 * (8 * z) ** 4), Q = (mu - 1) / (8 * z) - ((mu - 1) * (mu - 9) * (mu - 25)) / (6 * (8 * z) ** 3), ph = z - (n / 2 + 0.25) * Math.PI;
    const f = Math.sqrt(2 / (Math.PI * z)); return [sq * f * (P * Math.cos(ph) - Q * Math.sin(ph)), sq * f * (P * Math.sin(ph) + Q * Math.cos(ph))]; }
  const J = (m) => { let s = 0, t = (z / 2) ** m / gammaFn(m + 1); for (let k = 0; k < 200; k++) { s += t; t *= -(z * z) / 4 / ((k + 1) * (k + m + 1)); if (Math.abs(t) < 1e-17 * Math.abs(s) && k > 5) break; } return s; };
  // Y_n from Y_0, Y_1 (their series with the logarithm) and upward recurrence
  const H = (k) => { let h = 0; for (let i = 1; i <= k; i++) h += 1 / i; return h; }, EG = 0.5772156649015329;
  const Y0 = () => { let s = 0, t = 1; for (let k = 0; k < 200; k++) { s += (k ? (k % 2 ? -1 : 1) : 1) * 0; } let sum = 0; for (let k = 1; k < 200; k++) { const term = ((k % 2 ? 1 : -1) * H(k) * (z / 2) ** (2 * k)) / gammaFn(k + 1) ** 2; sum += term; if (Math.abs(term) < 1e-18 && k > 5) break; } void s; void t; return (2 / Math.PI) * ((Math.log(z / 2) + EG) * J(0) + sum); };
  const Y1 = () => { let sum = 0; for (let k = 0; k < 200; k++) { const term = ((k % 2 ? -1 : 1) * (H(k) + H(k + 1)) * (z / 2) ** (2 * k + 1)) / (gammaFn(k + 1) * gammaFn(k + 2)); sum += term; if (Math.abs(term) < 1e-18 && k > 5) break; } return (2 / Math.PI) * (Math.log(z / 2) + EG) * J(1) - (2 / (Math.PI * z)) - (1 / Math.PI) * sum; };
  let ya = Y0(), yb = Y1(); if (n === 0) return [sq * J(0), sq * ya]; for (let k = 1; k < n; k++) { const yc = ((2 * k) / z) * yb - ya; ya = yb; yb = yc; } return [sq * J(n), sq * yb];
}
/* the 1s atom on the grid, in u-form, and its own potential J(r) = ∫ φ̃(r′)² a₀(t)/max dr′ */
function atom(d, g) {
  const nu = d === 3 ? 1 : 1.5, a0 = akTable(d, 0), L0 = (d - 3) / 2, phi = new Float64Array(g.n + 1); let s = 0;
  for (let i = 1; i <= g.n; i++) { const r = i * g.h; phi[i] = r ** (L0 + 1) * Math.exp(-r / nu); s += phi[i] ** 2; }
  const N = 1 / Math.sqrt(s * g.h); for (let i = 1; i <= g.n; i++) phi[i] *= N;
  const J = new Float64Array(g.n + 1); for (let i = 1; i <= g.n; i++) { let t = 0; const r = i * g.h; for (let j = 1; j <= g.n; j++) { const q = j * g.h, lo = Math.min(r, q), hi = Math.max(r, q); t += phi[j] ** 2 * (a0(lo / hi) / hi); } J[i] = t * g.h; }
  return { nu, eps0: -1 / (2 * nu * nu), phi, J };
}
/* the phase shift of partial wave l at wave number k, singlet (sign +1) or triplet (−1) */
function solveLU(A, b) { const n = b.length; for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    const ac = A[c], pv = ac[c]; for (let r = c + 1; r < n; r++) { const ar = A[r], f = ar[c] / pv; if (f === 0) continue; for (let k = c; k < n; k++) ar[k] -= f * ac[k]; b[r] -= f * b[c]; } }
  const x = new Float64Array(n); for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; } return x; }
export function phaseShift(d, l, k, sign, { R = d === 3 ? 30 : 40, h = 0.03, at = null } = {}) {
  const g = { n: Math.round(R / h), h }, A = at ?? atom(d, g), L = l + (d - 3) / 2, lam = (d - 2) / 2, al = akTable(d, l), E = A.eps0 + (k * k) / 2, n = g.n;
  // unknowns u_1 … u_n; rows 1 … n−1 the equation (central differences), row n: u_n = 1
  const M = Array.from({ length: n }, () => new Float64Array(n)), b = new Float64Array(n), ph = A.phi;
  for (let i = 1; i < n; i++) { const r = i * g.h, row = M[i - 1];
    row[i - 1] += 1 / (g.h * g.h) + (L * (L + 1)) / (2 * r * r) - 1 / r + A.J[i] - (k * k) / 2; if (i > 1) row[i - 2] += -0.5 / (g.h * g.h); row[i] += -0.5 / (g.h * g.h);
    if (ph[i] > 1e-12) for (let j = 1; j <= n; j++) { if (ph[j] < 1e-12) continue; const q = j * g.h, lo = Math.min(r, q), hi = Math.max(r, q);
      let K = ((ph[i] * ph[j] * al(lo / hi)) / hi) * (lam / (l + lam)); if (l === 0) K += (2 * A.eps0 - E) * ph[i] * ph[j]; K *= sign; if (l === 0 && sign < 0) K += 10 * ph[i] * ph[j]; row[j - 1] += K * g.h; } }
  M[n - 1][n - 1] = 1; b[n - 1] = 1;
  const u = solveLU(M, b), un = u[n - 1], du = (3 * u[n - 1] - 4 * u[n - 2] + u[n - 3]) / (2 * g.h), z = k * R, dz = 1e-5;
  const [f, gg] = besselJY(L + 0.5, z), [f2, g2] = besselJY(L + 0.5, z + dz), [f1, g1] = besselJY(L + 0.5, z - dz), fp = (f2 - f1) / (2 * dz), gp = (g2 - g1) / (2 * dz);
  // u = a f − b y (y = Y-type); tanδ = −b/a in the convention u ~ sin(z − Lπ/2 + δ): f ~ sin, y ~ −cos
  const tanD = (du * f - k * un * fp) / (du * gg - k * un * gp); return Math.atan(tanD);
}
export { atom as ehAtom };
/* σ_mt(E), spin-averaged, at electron energy E (hartree), from partial waves 0 … lmax */
export function sigmaMT(d, E, { lmax = 3, at = null, R, h } = {}) {
  const k = Math.sqrt(2 * E), dl = (sgn) => Array.from({ length: lmax + 2 }, (_, l) => (l <= lmax ? phaseShift(d, l, k, sgn, { at, R, h }) : 0));
  const sum = (dd) => { let s = 0; for (let l = 0; l <= lmax; l++) s += harm(d, l) * wUp(d, l) * Math.sin(dd[l] - dd[l + 1]) ** 2; return s; };
  const C = (4 * (2 * Math.PI) ** (d - 1)) / (OM[d] * k ** (d - 1)), s1 = dl(+1), s3 = dl(-1);
  return { E, k, singlet: s1, triplet: s3, sigma: C * (0.25 * sum(s1) + 0.75 * sum(s3)) };
}
/* free–free on neutral hydrogen: κ_ω/(n_e n_H) (a₀^(2d−1), net of stimulated emission) at photon energy w and kT (hartree),
   from a σ_mt table (E, σ) */
export function ffCoef(d, w, kT, tab) {
  const Krad = (2 * ALPHA) / (3 * Math.PI * C_AU * C_AU) * (d === 4 ? (9 * Math.PI) / 32 : 1), mode = ((d - 1) * OM[d] * w ** (d - 1)) / (2 * Math.PI * C_AU) ** d;
  const sig = (E) => { const xs = tab.E, ys = tab.sigma; if (E <= xs[0]) return ys[0]; if (E >= xs[xs.length - 1]) return ys[ys.length - 1]; let i = 0; while (xs[i + 1] < E) i++; const f = Math.log(E / xs[i]) / Math.log(xs[i + 1] / xs[i]); return ys[i] * (1 - f) + ys[i + 1] * f; };
  const norm = 1 / (gammaFn(d / 2) * kT ** (d / 2)); let s = 0; const NQ = 400, lo = Math.log(w * 1.0001), hi = Math.log(w + 60 * kT);
  for (let q = 0; q <= NQ; q++) { const E = Math.exp(lo + ((hi - lo) * q) / NQ), Ep = E - w, v = Math.sqrt(2 * E), vp = Math.sqrt(2 * Math.max(Ep, 0)), c = q === 0 || q === NQ ? 1 : q % 2 ? 4 : 2;
    s += c * E * norm * E ** (d / 2 - 1) * Math.exp(-E / kT) * v * 2 * v * vp * sig(Math.sqrt(E * Math.max(Ep, 1e-30))); }
  s *= (hi - lo) / (3 * NQ); return (s * Krad * Math.expm1(w / kT)) / (C_AU * w * mode);
}
