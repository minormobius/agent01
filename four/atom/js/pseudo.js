/* ATOM⁴'s pseudopotentials, no DOM: norm-conserving, from the book's own atom, in d = 3 or 4, for js/pw.js.

   The all-electron atom here is js/atom.js's solver with plain local exchange (ε_x = −C_d ρ^(1+1/d), spin-unpolarized,
   no own-share correction: an orbital-by-orbital correction can't be carried into a crystal, so the pseudopotential is
   made with the functional pw.js uses). Each valence channel l is replaced inside rc by Troullier and Martins's
   nodeless u = r^(L+1) e^(p(r)), p even of degree 12, L = l + (d − 3)/2 as everywhere in the book: matching the true
   orbital and four derivatives at rc, holding the same charge inside (norm conservation), and flat at the origin
   (c₂² + c₄(2L + 5) = 0). The screened channel potential follows from the radial equation,
       V_l = ε + (L + 1)p′/r + (p″ + p′²)/2,
   and the valence electrons' Hartree and exchange are taken off to leave the ion's. One channel is kept local; the
   others become Kleinman–Bylander projectors, β = (V_l − V_loc) φ_l with D = 1/⟨φ_l|V_l − V_loc|φ_l⟩.

   Far from the core the ion is −Z_v/r to an electron in ours. In 4D the core's cloud leaks (the shell theorem fails):
   −Z_v/r − S/8r³ − T/64r⁵…, S = Σ⟨r²⟩ and T = Σ⟨r⁴⟩ over the core electrons (tools/salt.mjs's far field). pw.js takes the
   −Z_v/r and −S/8r³ terms analytically and the rest numerically. */
import { solve, kernel, hartree, R, N, H, subshells } from "./atom.js";
import { EXCHANGE, SPHERE } from "./pw.js";

const vx = (rho, d) => -(1 + 1 / d) * EXCHANGE[d] * Math.pow(Math.max(rho, 0), 1 / d);
export const occOf = (d, spec) => { const sh = subshells(d), o = sh.map(() => 0); for (const [n, k] of Object.entries(spec)) o[sh.findIndex((x) => x.name === n)] = k; return o; };
const toRho = (Q, d) => Float64Array.from(Q, (q, j) => q / (H * R[j] * SPHERE[d] * R[j] ** (d - 1)));

/* the all-electron atom with plain local exchange: { V (total potential), es, qs (u² dr per grid point), rho } */
export function aeAtom(Z, spec, d, { iters = 300, mix = 0.3, tol = 1e-10 } = {}) {
  const sh = subshells(d), occ = occOf(d, spec), live = sh.map((_, i) => i).filter((i) => occ[i] > 0), K = kernel(d);
  let Q = null, V = Float64Array.from(R, (r) => -Z / r), es = sh.map(() => 0), qs = sh.map(() => null), last = Infinity;
  for (let it = 0; it < iters; it++) {
    for (const i of live) { const s = solve(V, sh[i].l, sh[i].n - sh[i].l - 1, d); es[i] = s.e; qs[i] = s.q; }
    const Qn = new Float64Array(N); for (const i of live) for (let j = 0; j < N; j++) Qn[j] += occ[i] * qs[i][j];
    Q = Q ? Float64Array.from(Q, (q, j) => (1 - mix) * q + mix * Qn[j]) : Qn;
    const VH = hartree(K, Q), rho = toRho(Q, d); V = Float64Array.from(R, (r, j) => -Z / r + VH[j] + vx(rho[j], d));
    const s = live.reduce((t, i) => t + es[i], 0); if (Math.abs(s - last) < tol) break; last = s;
  }
  return { Z, d, V, es, qs, occ, sh, Q, rho: toRho(Q, d) };
}
/* a radial solve for any potential (no Coulomb point at the origin): js/atom.js's Numerov with the energy bracket set
   from the potential's own minimum */
export function solveAny(V, l, nr, d) {
  const L = l + (d - 3) / 2, Lh = L + 0.5, f = new Float64Array(N), y = new Float64Array(N), h2 = (H * H) / 12;
  const setF = (e) => { for (let i = 0; i < N; i++) f[i] = 2 * R[i] * R[i] * (V[i] - e) + Lh * Lh; };
  const out = (upto) => { for (let i = 2; i < upto; i++) if (h2 * f[i + 1] > 0.5) { upto = i; break; } y[0] = R[0] ** Lh; y[1] = R[1] ** Lh; let nodes = 0;
    for (let i = 1; i < upto; i++) { y[i + 1] = (2 * y[i] * (1 + 5 * h2 * f[i]) - y[i - 1] * (1 - h2 * f[i - 1])) / (1 - h2 * f[i + 1]); if (y[i + 1] * y[i] < 0) nodes++; if (Math.abs(y[i + 1]) > 1e150) for (let k = 0; k <= i + 1; k++) y[k] *= 1e-150; } return nodes; };
  let lo = Math.min(...V.map((v, i) => v + (L * (L + 1)) / (2 * R[i] * R[i]))) - 0.01, hi = 0;
  for (let it = 0; it < 100; it++) { const e = 0.5 * (lo + hi); setF(e); if (out(N - 1) > nr) hi = e; else lo = e; }
  const e = 0.5 * (lo + hi); setF(e);
  let top = N - 1; while (top > 4 && h2 * f[top] > 0.5) top--; let icl = top - 1; while (icl > 2 && f[icl] > 0) icl--; icl = Math.min(top - 2, icl + 1);
  out(icl); const yin = new Float64Array(N); yin[top] = 0; yin[top - 1] = 1e-30;
  for (let i = top - 1; i > icl; i--) { yin[i - 1] = (2 * yin[i] * (1 + 5 * h2 * f[i]) - yin[i + 1] * (1 - h2 * f[i + 1])) / (1 - h2 * f[i - 1]); if (Math.abs(yin[i - 1]) > 1e150) for (let k = i - 1; k < N; k++) yin[k] *= 1e-150; }
  const s = y[icl] / yin[icl]; for (let i = icl + 1; i < N; i++) y[i] = yin[i] * s;
  let norm = 0; for (let i = 0; i < N; i++) norm += y[i] * y[i] * R[i] * R[i]; norm = Math.sqrt(norm * H);
  return { e, u: Float64Array.from(y, (v, i) => (v * Math.sqrt(R[i])) / norm) }; // u = r^½ y, ∫u² dr = 1
}
/* the outermost-region u of a solved orbital (positive past its last node): √(q/dr) */
const uOf = (q) => Float64Array.from(q, (v, i) => Math.sqrt(Math.max(v, 0) / (H * R[i])));
/* derivatives on the log grid, in r (five points in x = ln r) */
function derivs(f, i) {
  const d1x = (-f[i + 2] + 8 * f[i + 1] - 8 * f[i - 1] + f[i - 2]) / (12 * H), d2x = (-f[i + 2] + 16 * f[i + 1] - 30 * f[i] + 16 * f[i - 1] - f[i - 2]) / (12 * H * H), r = R[i];
  return [f[i], d1x / r, (d2x - d1x) / (r * r)];
}
const gridAt = (rc) => Math.round(Math.log(rc / R[0]) / H);

/* Troullier–Martins for one channel: from the all-electron V, ε and u (outer region), rc → { p coefficients, u_ps, V_scr } */
export function tmChannel(V, e, u, l, d, rc) {
  const L = l + (d - 3) / 2, ic = gridAt(rc), r = R[ic];
  // p and its derivatives at rc: p = ln(u/r^(L+1)); p′ from u′; p″, p‴, p⁗ from the radial equation through V
  const lu = Float64Array.from(u, (v, i) => Math.log(Math.max(v, 1e-300)) - (L + 1) * Math.log(R[i])), [P0, P1] = derivs(lu, ic), [, V1, V2] = derivs(V, ic), V0 = V[ic];
  const P2 = 2 * (V0 - e) - (2 * (L + 1) * P1) / r - P1 * P1;
  const P3 = 2 * V1 + (2 * (L + 1) * P1) / (r * r) - (2 * (L + 1) * P2) / r - 2 * P1 * P2;
  const P4 = 2 * V2 - (4 * (L + 1) * P1) / r ** 3 + (4 * (L + 1) * P2) / (r * r) - (2 * (L + 1) * P3) / r - 2 * P2 * P2 - 2 * P1 * P3;
  let normAE = 0; for (let i = 0; i <= ic; i++) normAE += u[i] * u[i] * R[i] * H * (i === 0 || i === ic ? 0.5 : 1);
  const pows = [0, 6, 8, 10, 12];
  const coeffs = (c2) => { const c4 = -(c2 * c2) / (2 * L + 5); // the matching conditions, linear in c0, c6 … c12 once c2 and c4 are set
    const rhs = [P0 - c2 * r * r - c4 * r ** 4, P1 - 2 * c2 * r - 4 * c4 * r ** 3, P2 - 2 * c2 - 12 * c4 * r * r, P3 - 24 * c4 * r, P4 - 24 * c4];
    const A = [0, 1, 2, 3, 4].map((k) => pows.map((n) => (k > n ? 0 : (fall(n, k) * r ** (n - k)))));
    const x = gauss5(A, rhs); return x && { c: [x[0], c2, c4, x[1], x[2], x[3], x[4]] }; };
  const pOf = (c, x) => c[0] + c[1] * x * x + c[2] * x ** 4 + c[3] * x ** 6 + c[4] * x ** 8 + c[5] * x ** 10 + c[6] * x ** 12;
  const normPS = (c) => { let s = 0; for (let i = 0; i <= ic; i++) s += R[i] ** (2 * L + 2) * Math.exp(2 * pOf(c, R[i])) * R[i] * H * (i === 0 || i === ic ? 0.5 : 1); return s; };
  // c₂ by the norm: scan, then bisect the root nearest zero
  const g = (c2) => { const k = coeffs(c2); return k ? Math.log(normPS(k.c) / normAE) : NaN; }; let best = null;
  for (let a = -6; a < 6; a += 0.01) { const fa = g(a), fb = g(a + 0.01); if (isFinite(fa) && isFinite(fb) && fa * fb <= 0) { let lo = a, hi = a + 0.01; for (let it = 0; it < 60; it++) { const m = (lo + hi) / 2; if (g(lo) * g(m) <= 0) hi = m; else lo = m; } const c2 = (lo + hi) / 2; if (!best || Math.abs(c2) < Math.abs(best)) best = c2; } }
  if (best == null) throw new Error(`TM: no norm-conserving solution for l = ${l} at rc = ${rc}`);
  const { c } = coeffs(best), up = new Float64Array(N), Vs = new Float64Array(N);
  for (let i = 0; i < N; i++) { const x = R[i]; if (i > ic) { up[i] = u[i]; Vs[i] = V[i]; continue; }
    const p = pOf(c, x), p1 = 2 * c[1] * x + 4 * c[2] * x ** 3 + 6 * c[3] * x ** 5 + 8 * c[4] * x ** 7 + 10 * c[5] * x ** 9 + 12 * c[6] * x ** 11, p2 = 2 * c[1] + 12 * c[2] * x * x + 30 * c[3] * x ** 4 + 56 * c[4] * x ** 6 + 90 * c[5] * x ** 8 + 132 * c[6] * x ** 10;
    up[i] = x ** (L + 1) * Math.exp(p); Vs[i] = e + ((L + 1) * p1) / x + (p2 + p1 * p1) / 2; }
  return { l, rc, e, c, u: up, Vscr: Vs, ic };
}
function fall(n, k) { let f = 1; for (let i = 0; i < k; i++) f *= n - i; return f; }
function gauss5(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[p], M[c]] = [M[c], M[p]]; if (Math.abs(M[c][c]) < 1e-300) return null; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } } return M.map((r, i) => r[n] / r[i]); }

/* a pseudopotential: Z, the all-electron core and valence (specs as js/atom.js's subshell names), one rc per valence
   channel, the local channel; an unoccupied channel (for the local part, typically) is solved at the energy `eUnbound`
   … here simply taken from a slightly ionized reference: pass it as a valence entry with occupation 0 and its own
   configuration in `refs` is not needed when it is bound in the reference, which the specs below arrange */
/* the partial core (Louie, Froyen and Cohen's nonlinear core correction): exchange isn't linear in the density, so
   taking the valence's off by itself leaves an error that grows as the valence leaves (a fully ionized cation is off by
   ~0.5 eV). The core's density is kept for the exchange, the true one outside r₀ and a smooth a + br² + cr⁴ inside
   (value, slope and curvature matched at r₀, the radius where the core's density falls to the valence's) */
function partialCore(rhoc, rhov) {
  let i0 = 5; while (i0 < N - 3 && !(rhoc[i0] < rhov[i0] && R[i0] > 0.05)) i0++; // first crossing, outward from the nucleus
  const r0 = R[i0], [f0, f1, f2] = derivs(rhoc, i0), c = (f2 - f1 / r0) / (8 * r0 * r0), b = f1 / (2 * r0) - 2 * c * r0 * r0, a = f0 - b * r0 * r0 - c * r0 ** 4;
  return { r0, rho: Float64Array.from(R, (r, j) => (j >= i0 ? rhoc[j] : Math.max(0, a + b * r * r + c * r ** 4))) };
}
export function makePseudo({ Z, d, core, valence, rc, local, nlcc = false }) {
  const spec = { ...core, ...valence }, ae = aeAtom(Z, spec, d), sh = ae.sh, chans = {};
  const zc = Object.values(core).reduce((a, b) => a + b, 0), Zv = Z - zc;
  for (const [name, occ] of Object.entries(valence)) { const i = sh.findIndex((s) => s.name === name), s = sh[i];
    const u = ae.qs[i] ? uOf(ae.qs[i]) : null; if (!u) throw new Error(`channel ${name} not solved`);
    chans[s.l] = { ...tmChannel(ae.V, ae.es[i], u, s.l, d, rc[s.l]), occ, name }; }
  // descreen by the valence pseudo-density's Hartree and exchange
  const Qv = new Float64Array(N); for (const ch of Object.values(chans)) for (let j = 0; j < N; j++) Qv[j] += ch.occ * ch.u[j] * ch.u[j] * R[j] * H;
  const VHv = hartree(kernel(d), Qv), rhov = toRho(Qv, d);
  const Qc = new Float64Array(N); for (const [name] of Object.entries(core)) { const i = sh.findIndex((s) => s.name === name); for (let j = 0; j < N; j++) Qc[j] += ae.occ[i] * ae.qs[i][j]; }
  const pc = nlcc ? partialCore(toRho(Qc, d), rhov) : { r0: 0, rho: new Float64Array(N) };
  for (const ch of Object.values(chans)) ch.Vion = Float64Array.from(ch.Vscr, (v, j) => v - VHv[j] - vx(rhov[j] + pc.rho[j], d));
  // the core's moments (its leaked field in 4D)
  let S = 0, T = 0; for (const [name] of Object.entries(core)) { const i = sh.findIndex((s) => s.name === name); for (let j = 0; j < N; j++) { S += ae.occ[i] * ae.qs[i][j] * R[j] ** 2; T += ae.occ[i] * ae.qs[i][j] * R[j] ** 4; } }
  const loc = chans[local], Vloc = loc.Vion;
  const proj = Object.values(chans).filter((ch) => ch.l !== local).map((ch) => { const dV = Float64Array.from(ch.Vion, (v, j) => v - Vloc[j]);
    let den = 0; for (let j = 0; j < N; j++) den += ch.u[j] * dV[j] * ch.u[j] * R[j] * H; // ⟨φ|δV|φ⟩ (u = r^((d−1)/2) R, so ∫ u² dr is the norm)
    return { l: ch.l, D: 1 / den, chi: Float64Array.from(ch.u, (v, j) => (v * dV[j]) / R[j] ** ((d - 1) / 2)) }; }); // radial β(r) = δV R(r)
  return { Z, Zv, d, S, T, c: d === 4 ? S / 8 : 0, Vloc, chans, proj, ae, rhov, rhoc: pc.rho, rcore: pc.r0 };
}

/* d-dimensional radial Bessel factors j_l^(d)(x) = Γ(d/2)(2/x)^(d/2−1) J_(l+d/2−1)(x), j_0 = the sphere-averaged plane wave */
function besselJ(nu, x) { // integer nu ≥ 0 (4D) by series below x ≈ nu + 8, else downward-safe upward recurrence from J0, J1
  if (x < 1e-12) return nu === 0 ? 1 : 0;
  if (x < 8) { let s = 0, t = (x / 2) ** nu / fact(nu); for (let k = 0; k < 60; k++) { s += t; t *= -(x * x) / (4 * (k + 1) * (k + 1 + nu)); if (Math.abs(t) < 1e-17 * Math.abs(s)) break; } return s; }
  // past 8: J₀ and J₁ by the standard rational forms of their amplitude and phase (Abramowitz–Stegun 9.4.3, 9.4.6),
  // then upward recurrence, stable for x > ν
  let j0 = largeJ(0, x), j1 = largeJ(1, x); if (nu === 0) return j0; for (let n = 1; n < nu; n++) { const j2 = ((2 * n) / x) * j1 - j0; j0 = j1; j1 = j2; } return j1;
}
function largeJ(n, x) { const z = 8 / x, y = z * z;
  if (n === 0) { const xx = x - 0.785398164, p = 1 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6))), q = -0.1562499995e-1 + y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 - y * 0.934935152e-7))); return Math.sqrt(0.636619772 / x) * (Math.cos(xx) * p - z * Math.sin(xx) * q); }
  const xx = x - 2.356194491, p = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6))), q = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6))); return Math.sqrt(0.636619772 / x) * (Math.cos(xx) * p - z * Math.sin(xx) * q); }
function fact(n) { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; }
export function jl(d, l, x) {
  if (d === 3) { if (x < 1e-3) return l === 0 ? 1 - (x * x) / 6 : l === 1 ? x / 3 : (x * x) / 15; const s = Math.sin(x), c = Math.cos(x); return l === 0 ? s / x : l === 1 ? s / (x * x) - c / x : (3 / (x * x) - 1) * (s / x) - (3 * c) / (x * x); }
  if (x < 1e-8) return l === 0 ? 1 : 0; return (2 / x) * besselJ(l + 1, x);
}
/* a radial function's d-dimensional transform with the channel's Bessel factor: S_d ∫ r^(d−1) f(r) j_l(qr) dr */
export function hankel(d, l, f, q, upto = N) { let s = 0; for (let i = 0; i < upto; i++) s += R[i] ** d * f[i] * jl(d, l, q * R[i]) * H; return SPHERE[d] * s; }
/* the species pw.js takes: the local part's transform (its long-range −Z_v/r and, in 4D, −c/r³ analytic), α Z, and the
   projectors' transforms, tabulated on q and interpolated */
export function forPW(ps, { qmax = 30, dq = 0.01 } = {}) {
  const { d, Zv, c } = ps, fsr = Float64Array.from(R, (r, j) => ps.Vloc[j] + Zv / r + (d === 4 ? c / r ** 3 : 0)); // short-ranged
  let upto = N; while (upto > 1 && R[upto - 1] > 40) upto--;
  const nq = Math.ceil(qmax / dq) + 1, tab = (fn) => Float64Array.from({ length: nq }, (_, k) => fn(k * dq)), interp = (T) => (q) => { const x = q / dq, k = Math.min(nq - 2, Math.floor(x)), u = x - k; return x >= nq - 1 ? 0 : T[k] * (1 - u) + T[k + 1] * u; };
  const vs = tab((q) => hankel(d, 0, fsr, q, upto)), vsr = interp(vs);
  const K = (q) => (d === 3 ? (4 * Math.PI) / (q * q) : (4 * Math.PI * Math.PI) / (q * q * q)), Kc = (q) => (4 * Math.PI * Math.PI) / q; // FT of 1/r, and of 1/r³ in 4D
  const projs = ps.proj.map((p) => { const T = tab((q) => hankel(d, p.l, p.chi, q, upto)); return { l: p.l, D: p.D, beta: interp(T) }; });
  const rc0 = ps.rhoc && ps.rhoc.some((v) => v > 0) ? interp(tab((q) => hankel(d, 0, ps.rhoc, q, upto))) : null; // the partial core's transform
  return { Z: Zv, c, S: ps.S, T: ps.T, alphaZ: vs[0], vloc: (q) => vsr(q) - Zv * K(q) - (d === 4 ? c * Kc(q) : 0), proj: projs, rhoc: rc0 };
}
