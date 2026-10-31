/* A star on the main sequence in d dimensions, no DOM: hydrostatic balance, mass, energy and its transport (light, or
   stirring where light can't carry it, at the adiabatic gradient 2/(d + 2): 2/5 ours, 1/3 in 4D), solved by shooting
   from the centre and from the surface to meet at a fitting mass (Kippenhahn & Weigert, ch. 12), Newton on the four
   unknowns ln P_c, ln T_c, ln R, ln L. SI units throughout: in d dimensions a density is kg/m^d, an opacity m^(d−1)/kg.
   The gas: ions ideal (n k T in any d), electrons Fermi–Dirac and relativistic (burning.js's, tabulated), light
   u = a T^(d+1) pressing u/d. The surface: the photosphere at optical depth 2/3, its temperature set by L = S_d R^(d−1)
   σ_d T_eff^(d+1) (σ_d c a: 1/4 ours, 2/(3π) in 4D, a hemisphere's mean slant).
   Gravity: Newton in 3D. Pinned 1/r in 4D has no shell theorem, so g at each radius comes from the whole profile, the
   shell kernel k(min/max)/max (stars.js); it enters as f(m) = g r²/(G m), dimensionless so that a frozen f rescales with
   the star, recomputed from each solved profile until it settles. Near the centre f ∝ 1/r ∝ m^(−1/4) (a uniform core,
   where g ∝ r while m ∝ r⁴). From 1/r²-with-the-mass-inside, a stepping stone that converges easily, the pinned law is
   reached by blending the two in steps (`toPinned`). */
import { kTab } from "./kernel.js";
import { electronPressure } from "./burning.js";

export const SI = { hbar: 1.054571817e-34, c: 2.99792458e8, me: 9.1093837015e-31, mu: 1.66053906660e-27, k: 1.380649e-23, MeV: 1.602176634e-13 };
export const SD = { 3: 4 * Math.PI, 4: 2 * Math.PI ** 2 };
const ZETA = { 4: Math.PI ** 4 / 90, 5: 1.0369277551, 6: Math.PI ** 6 / 945 }, FACT = { 3: 6, 4: 24, 5: 120 };
/* light in d dimensions (d − 1 polarizations): u = a T^(d+1), and the flux out of a surface σ T^(d+1) */
export const aRad = (d) => ((d - 1) * SD[d] * FACT[d] * ZETA[d + 1] * SI.k ** (d + 1)) / (2 * Math.PI * SI.hbar * SI.c) ** d;
export const sigmaSB = (d) => SI.c * aRad(d) * (d === 3 ? 0.25 : 2 / (3 * Math.PI));
export const muOf = ({ X, Y, Z }) => 1 / (2 * X + 0.75 * Y + 0.5 * Z);
export const gradAd = (d) => 2 / (d + 2);

// the electrons' pressure, tabulated in ln n_e and ln T (bilinear in the logs; outside the table, ideal)
const EOS = {};
function peTable(d) {
  if (EOS[d]) return EOS[d];
  const lx = d === 3 ? [Math.log(1e24), Math.log(1e36)] : [Math.log(1e30), Math.log(1e50)], ly = [Math.log(1e3), Math.log(3e9)], NI = 140, NJ = 80, tab = [];
  for (let i = 0; i <= NI; i++) { const ne = Math.exp(lx[0] + ((lx[1] - lx[0]) * i) / NI), row = []; for (let j = 0; j <= NJ; j++) row.push(Math.log(electronPressure(d, ne, Math.exp(ly[0] + ((ly[1] - ly[0]) * j) / NJ)))); tab.push(row); }
  return (EOS[d] = (ne, T) => { const x = ((Math.log(ne) - lx[0]) / (lx[1] - lx[0])) * NI, y = ((Math.log(T) - ly[0]) / (ly[1] - ly[0])) * NJ;
    if (x < 0 || x >= NI || y < 0 || y >= NJ) return ne * SI.k * T; const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j;
    return Math.exp(tab[i][j] * (1 - u) * (1 - v) + tab[i + 1][j] * u * (1 - v) + tab[i][j + 1] * (1 - u) * v + tab[i + 1][j + 1] * u * v); });
}
export const electronP = (d, ne, T) => peTable(d)(ne, T);
/* the density at pressure P and temperature T (NaN where light alone presses harder) */
export function rhoOf(d, P, T, comp) {
  const Pg = P - (aRad(d) * T ** (d + 1)) / d; if (!(Pg > 0)) return NaN;
  const ye = (1 + comp.X) / 2, yi = comp.X + comp.Y / 4 + comp.Z / 14, pe = peTable(d), Pof = (rho) => (rho / SI.mu) * yi * SI.k * T + pe((rho / SI.mu) * ye, T);
  const r0 = (Pg * muOf(comp) * SI.mu) / (SI.k * T); let lo = r0 * 1e-3, hi = r0 * 1.0000001; if (Pof(hi) < Pg) return r0;
  for (let it = 0; it < 36; it++) { const m = Math.sqrt(lo * hi); if (Pof(m) < Pg) lo = m; else hi = m; } return Math.sqrt(lo * hi);
}

/* opacities. Ours: electron scattering 0.02(1 + X) m²/kg and Kramers' free–free and bound–free (guillotine factor 10).
   4D, through the lens vacuum: a free electron in light of frequency ω scatters σ = (3π³/4) r_e² c/ω (the book's dipole
   rate (3π/8) α ω³ |D|² with the lens's push c/ℓω, ℓ cancelling; r_e our classical radius, α being ours), a 3-volume
   falling as 1/ω; its Rosseland mean over 4D light, ⟨ω⟩ = 6ζ(6)/ζ(5) kT/ħ, so κ ∝ 1/T. Absorption by free electrons
   (free–free) is kappaFF4 below */
export const kappaOurs = (comp) => (rho, T) => { const r = rho / 1000; return 0.02 * (1 + comp.X) + 0.1 * (3.68e22 * (1 - comp.Z) * (1 + comp.X) * r * T ** -3.5 + 4.34e24 * comp.Z * (1 + comp.X) * r * T ** -3.5); };
const RE = 2.8179403262e-15, XBAR = (6 * ZETA[6]) / ZETA[5];
export const sigmaLens = (T) => ((3 * Math.PI ** 3) / 4) * RE * RE * ((SI.hbar * SI.c) / (XBAR * SI.k * T));
export const kappaLens4 = (comp) => (rho, T) => sigmaLens(T) * ((1 + comp.X) / (2 * SI.mu));
/* 4D free–free absorption. An electron passing an ion of charge Z on a near-straight line feels the pinned pull Zαħc/r²
   (ours exactly) and, through the lens vacuum, radiates dW/dω = (3αħ/16c²)|a(ω)|² (the book's dipole rate, 9π/32 of
   Larmor's for the same motion), |a(ω)|² = (2Zαħc/(m b v))² x²(K₀² + K₁²), x = ωb/v. In 4D the impact parameters fill a
   3-volume, 4πb² db, so the sum over passes converges with no logarithm: ∫x²(K₀² + K₁²) dx = π²/8. Over 4D's speeds, with
   a photon no dearer than the electron's energy ((1 + x) e^(−x), x = ħω/kT), and by detailed balance against 4D's
   blackbody: κ_ω = n_e Σn_iZ² π⁵ α³ ħ² c³ (1 + x)(1 − e^(−x)) / (m² ω⁵) per length. With scattering ∝ 1/ω the
   Rosseland mean depends only on their ratio, A/B = Σn_iZ² (4π²/3) α (ħc/kT)⁴, tabulated once. The same classical
   reasoning in 3D gives our free–free at the Sun's centre about half of Kramers' (the photon carries much of the
   electron's energy where the mean weighs most), so `ff` scales it: 1 classical, the band 0.5–2 */
const ROSS4 = (() => { const W = (x) => (x ** 5 * Math.exp(x)) / (Math.exp(x) - 1) ** 2, F = (x) => ((1 + x) * (1 - Math.exp(-x))) / x ** 5, E = (x) => 1 / x, xs = [];
  for (let x = 0.01; x < 45; x += 0.01) xs.push(x); const num = xs.reduce((t, x) => t + W(x), 0), lr = [], g = [];
  for (let l = -8; l <= 14; l += 0.05) { const r = 10 ** l; lr.push(l); g.push(Math.log(num / xs.reduce((t, x) => t + W(x) / (r * F(x) + E(x)), 0))); }
  return (r) => { const l = Math.log10(Math.max(r, 1e-8)); if (l >= 14) return Math.exp(g.at(-1)) * r / 1e14; const i = Math.min(lr.length - 2, Math.floor((l + 8) / 0.05)), f = (l - lr[i]) / 0.05; return Math.exp(g[i] * (1 - f) + g[i + 1] * f); }; })();
export const kappaFF4 = (comp, ff = 1) => (rho, T) => { const nz = (rho / SI.mu) * (comp.X + comp.Y), ne = (rho / SI.mu) * ((1 + comp.X) / 2), x0 = (SI.hbar * SI.c) / (SI.k * T);
  const B = ne * ((3 * Math.PI ** 3) / 4) * RE * RE * x0, r = ff * nz * ((4 * Math.PI ** 2) / 3) * (1 / 137.035999) * x0 ** 4; return (B * ROSS4(r)) / rho; };

/* integrate y = [ln r, ln P, ln T, L] in m (RK4, step doubling) */
function integrate(rhs, m0, m1, y0, { tol = 1e-6, h0 } = {}) {
  const sgn = Math.sign(m1 - m0); let m = m0, y = y0.slice(), h = Math.abs(h0 ?? (m1 - m0) * 1e-6) * sgn, guard = 0; const path = [[m, y.slice()]];
  const step = (m, y, h) => { const k1 = rhs(m, y), k2 = rhs(m + h / 2, y.map((v, i) => v + (h / 2) * k1[i])), k3 = rhs(m + h / 2, y.map((v, i) => v + (h / 2) * k2[i])), k4 = rhs(m + h, y.map((v, i) => v + h * k3[i])); return y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])); };
  while (sgn * (m1 - m) > 0 && guard++ < 200000) {
    if (sgn * (m + h - m1) > 0) h = m1 - m;
    const a = step(m, y, h), b = step(m + h / 2, step(m, y, h / 2), h / 2);
    if (a.some((v) => !isFinite(v)) || b.some((v) => !isFinite(v))) { h /= 4; if (Math.abs(h) < 1e-30 * Math.abs(m1 - m0)) return { y: null, path }; continue; }
    const err = Math.max(...a.map((v, i) => Math.abs(v - b[i]) / (i === 3 ? Math.abs(b[3]) + Math.abs(y0[3] || 0) * 1e-6 + 1e-300 : 1)));
    if (err > tol && Math.abs(h) > 1e-14 * Math.abs(m1 - m0)) { h /= 2; continue; }
    m += h; y = b; path.push([m, y.slice()]); if (err < tol / 32) h *= 2;
  }
  return { y, path };
}
function solve4(A, b) { const n = 4; A = A.map((r) => r.slice()); b = b.slice();
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]]; for (let r = c + 1; r < n; r++) { const q = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= q * A[c][k]; b[r] -= q * b[c]; } }
  const x = Array(n).fill(0); for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; } return x; }

/* one star: opts { d, M (kg), G, comp {X, Y, Z}, eps(ρ, T) W/kg, kappa(ρ, T), f(m) gravity factor (else g = G m/r²),
   fit (fitting mass ÷ M, 0.5) }, guess [ln P_c, ln T_c, ln R, ln L]. Returns ok, the unknowns, and the profile */
export function star(opts, guess) {
  const { d, M, G, comp, eps, kappa } = opts, S = SD[d], a = aRad(d), gad = gradAd(d), mf = (opts.fit ?? 0.5) * M, ff = opts.f ?? null;
  const rhs = (m, y) => { const r = Math.exp(y[0]), P = Math.exp(y[1]), T = Math.exp(y[2]), L = y[3], rho = rhoOf(d, P, T, comp);
    if (!(rho > 0)) return [NaN, NaN, NaN, NaN];
    const g = (G * Math.max(m, 1e-300) * (ff ? ff(m) : 1)) / (r * r), dPdm = -g / (S * r ** (d - 1)), dTdmRad = (-d * kappa(rho, T) * L) / (SI.c * (d + 1) * a * T ** d * S * S * r ** (2 * (d - 1)));
    const nab = Math.min((dTdmRad * P) / (T * dPdm), gad); return [1 / (S * r ** d * rho), dPdm / P, (nab * dPdm) / P, eps(rho, T)]; };
  const centre = (lnPc, lnTc) => { const Pc = Math.exp(lnPc), Tc = Math.exp(lnTc), rhoc = rhoOf(d, Pc, Tc, comp), m0 = 1e-8 * M, r0 = Math.pow((d * m0) / (S * rhoc), 1 / d);
    const P0 = ff ? Pc - (rhoc * ((G * m0 * ff(m0)) / (r0 * r0)) * r0) / 2 : Pc - (G * rhoc * rhoc * S * r0 ** (d - 1)) / (d * (d - 1)); return { m0, y: [Math.log(r0), Math.log(P0), lnTc, eps(rhoc, Tc) * m0] }; };
  const surface = (lnR, lnL) => { const R = Math.exp(lnR), L = Math.exp(lnL), Te = Math.pow(L / (S * R ** (d - 1) * sigmaSB(d)), 1 / (d + 1)), g = (G * M) / (R * R);
    let P = 1; for (let i = 0; i < 30; i++) { const rho = rhoOf(d, P, Te, comp) || 1e-30; P = ((2 / 3) * g) / kappa(rho, Te) + (a * Te ** (d + 1)) / d; } return [lnR, Math.log(P), Math.log(Te), L]; };
  const resid = (p) => { const c = centre(p[0], p[1]), out = integrate(rhs, c.m0, mf, c.y), inn = integrate(rhs, M, mf, surface(p[2], p[3]), { h0: -1e-10 * M });
    if (!out.y || !inn.y) return null; return { r: [out.y[0] - inn.y[0], out.y[1] - inn.y[1], out.y[2] - inn.y[2], (out.y[3] - inn.y[3]) / Math.exp(p[3])], out, inn }; };
  let p = guess.slice(), R0 = resid(p), it = 0;
  for (; it < 60 && R0; it++) {
    const n0 = Math.hypot(...R0.r); if (n0 < 1e-6) break;
    const J = [0, 1, 2, 3].map((j) => { const q = p.slice(); q[j] += 1e-5; const Rq = resid(q); return Rq ? Rq.r.map((v, i) => (v - R0.r[i]) / 1e-5) : null; });
    if (J.some((x) => !x)) return { ok: false, p, why: "jacobian", it };
    const dx = solve4([0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => J[j][i])), R0.r.map((v) => -v)); let next = null;
    for (let lam = 1; lam > 1e-4; lam /= 2) { const q = p.map((v, i) => v + lam * Math.max(-1, Math.min(1, dx[i]))), Rq = resid(q); if (Rq && Math.hypot(...Rq.r) < n0) { p = q; next = Rq; break; } }
    if (!next) return { ok: false, p, why: "stalled", it, res: n0 }; R0 = next;
  }
  if (!R0) return { ok: false, p, why: "integration", it };
  const prof = [...R0.out.path, ...R0.inn.path.slice().reverse()].map(([m, y]) => ({ m, r: Math.exp(y[0]), P: Math.exp(y[1]), T: Math.exp(y[2]), L: y[3] }));
  return { ok: Math.hypot(...R0.r) < 1e-5, it, p, Pc: Math.exp(p[0]), Tc: Math.exp(p[1]), R: Math.exp(p[2]), L: Math.exp(p[3]), prof, res: Math.hypot(...R0.r) };
}
export const teff = (d, s) => Math.pow(s.L / (SD[d] * s.R ** (d - 1) * sigmaSB(d)), 1 / (d + 1));

/* pinned-4D gravity from a solved profile: Φ(r) = −G Σ k(min/max)/max dm, g = dΦ/dr inward; as f(m) = g r²/(G m) */
export function pinnedF(prof) {
  const n = prof.length, rs = prof.map((p) => p.r), dm = prof.map((p, i) => (i ? p.m - prof[i - 1].m : p.m)), R = rs[n - 1];
  const phi = (r) => { let s = 0; for (let j = 0; j < n; j++) { const a = Math.min(r, rs[j]), b = Math.max(r, rs[j]); s += (kTab(a / b) / b) * dm[j]; } return -s; };
  const pts = prof.filter((p) => p.r > 0.02 * R && p.m > 0).map((p) => { const h = 0.004 * R; return { m: p.m, f: (((phi(p.r + h) - phi(p.r - h)) / (2 * h)) * p.r * p.r) / p.m }; });
  return (m) => { if (m <= pts[0].m) return pts[0].f * Math.pow(pts[0].m / Math.max(m, 1e-300 * pts[0].m), 0.25); if (m >= pts[pts.length - 1].m) return pts[pts.length - 1].f;
    let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].m < m) lo = mid; else hi = mid; } const t = (m - pts[lo].m) / (pts[hi].m - pts[lo].m || 1); return pts[lo].f * (1 - t) + pts[hi].f * t; };
}
/* from a star solved with g = G m/r² to the pinned law: blend f = 1 − w + w f_pinned, w up in adaptive steps, then
   settle (recompute f from each solution) until ln L moves less than 10⁻³ */
export function toPinned(opts, s0) {
  let s = s0, w = 0, dw = 0.1, settle = 0, f = null;
  for (let guard = 0; guard < 120; guard++) {
    const wt = Math.min(1, w + dw), fp = pinnedF(s.prof), fw = (m) => 1 - wt + wt * fp(m), t = star({ ...opts, f: fw }, s.p);
    if (!t.ok) { dw /= 2; if (dw < 0.004) return { ...s, ok: false, why: `pinned blend stalled at ${w.toFixed(3)}` }; continue; }
    const dL = Math.abs(Math.log(t.L / s.L)); s = t; f = fw; w = wt; dw = Math.min(0.25, dw * 1.5);
    if (w === 1 && (++settle > 20 || dL < 1e-3)) return { ...s, f, dL };
  }
  return { ...s, ok: false, why: "pinned blend ran out" };
}
/* the next star along a sequence, pinned: gravity carried as f(m/M) from the last, settled (damped) */
export function nextPinned(opts, guess, fq) {
  const { M } = opts; let s = null, f = (m) => fq(m / M);
  // each pass's gravity is the mean of the last and the new profile's, which damps the swing a steep opacity gives it
  for (let k = 0; k < 30; k++) { const t = star({ ...opts, f }, s ? s.p : guess); if (!t.ok) return s ? { ...s, ok: false, why: t.why } : t;
    if (s && Math.abs(Math.log(t.L / s.L)) < 1e-3) return { ...t, f, dL: Math.abs(Math.log(t.L / s.L)) }; s = t; const fo = f, fn = pinnedF(t.prof); f = (m) => 0.5 * (fo(m) + fn(m)); }
  return { ...s, f, ok: false, why: "gravity didn't settle" };
}
