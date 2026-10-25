/* Bakes js/response.js: how easily each noble-gas atom polarizes, α(iω) at imaginary frequencies, in 3D and 4D,
   and from it the dispersion coefficient C₆ by Casimir and Polder.
     node games/atom4/tools/response.mjs        # writes js/response.js (a few minutes)

   The coupled response (below): the field distorts each orbital, the distorted cloud pushes back, solved together at
   each imaginary frequency. With the push-back switched off (coupling: false) it is the plain sum over states. Each
   orbital (n, l) is excited into the channels l ± 1; for a full subshell the share going up is (l + d − 2)/(2l + d − 2)
   and down l/(2l + d − 2) (3D: (l + 1)/(2l + 1), l/(2l + 1)), each orbital's ⟨x̂²⟩ being 1/d. The radial Hamiltonians
   are the solver's own potentials on its log grid, in a 150-bohr box. Checks: hydrogen exactly (3D 4.5, 4D 34.805 by
   Dalgarno–Lewis), the Thomas–Reiche–Kuhn sum rule (ω²α → the electron count), and our noble gases' measured α, C₆.

   Then C₆ = (tr T² R⁶ / 2π) ∫₀^∞ α_A(iω) α_B(iω) dω, tr T² R⁶ = d + 3: 3/π in 3D, 7/2π in 4D. */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scf, subshells, potentials, R as GRID, N, H } from "../js/atom.js";
import { TABLE } from "../js/table.js";
import { isNoble } from "../js/periodic.js";

/* imaginary frequencies for the Casimir–Polder integral: ω = a tan θ, Gauss–Legendre in θ */
function gauss(n) { const x = [], w = []; for (let i = 1; i <= n; i++) { let z = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5)), pp = 0; for (let it = 0; it < 100; it++) { let p1 = 1, p2 = 0; for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; } pp = (n * (z * p1 - p2)) / (z * z - 1); const z1 = z; z = z1 - p1 / pp; if (Math.abs(z - z1) < 1e-15) break; } x.push(z); w.push(2 / ((1 - z * z) * pp * pp)); } return { x, w }; }
const QA = 0.6, GQ = gauss(40);
export const OMEGA = GQ.x.map((x) => QA * Math.tan((Math.PI / 4) * (x + 1)));
export const OMEGA_W = GQ.x.map((x, k) => GQ.w[k] * (Math.PI / 4) * QA / Math.cos((Math.PI / 4) * (x + 1)) ** 2);

/* Casimir–Polder, with tr T² R⁶ = d + 3 */
export const c6From = (aA, aB, d) => ((d + 3) / (2 * Math.PI)) * aA.reduce((s, a, k) => s + OMEGA_W[k] * a * aB[k], 0);

/* ---------------------------------------------------------------- the coupled response
   The field's pull distorts each orbital, the distorted cloud makes a field of its own that pushes back, and the two
   are solved together (time-dependent Hartree, each electron's own distortion taken out of what it feels, as in the
   ground state; for helium that is exactly time-dependent Hartree–Fock). A uniform field F along x₁ is the potential
   F r x̂₁; everything stays in that one harmonic, so each potential is a radial function times x̂₁:
     w_i(r) = r + δv(r) − δv_i(r)                the pull felt by orbital i (per unit field)
     X = Σ± (H_{l'} − ε ± iω)⁻¹ P (w_i u₀)          its distortion into channel l' (P: away from occupied orbitals)
     m(r) = Σ_i (o_i/d) share u₀ X               minus the induced cloud's dipole charge, per grid point
     δv(r) = −(d/|S|) Σ_s λ₁(r, s) m(s)          its potential, λ₁ the x̂₁ part of 1/|x − y| (Funk–Hecke)
     α(iω) = Σ_r r m(r)
   λ₁ = (4π/3) r</r>² in 3D; in 4D λ₁ = g₁(min/max)/max, g₁(τ) = 4π ∫₀^π cos φ sin²φ dφ / √(1 + τ² − 2τ cos φ) */
const G1 = new Float64Array(2001);
for (let i = 0; i <= 2000; i++) { const t = i / 2000, M = 2000; let s = 0; for (let k = 0; k <= M; k++) { const p = (Math.PI * k) / M, w = k === 0 || k === M ? 1 : k % 2 ? 4 : 2, q = 1 + t * t - 2 * t * Math.cos(p); s += q > 0 ? (w * Math.cos(p) * Math.sin(p) ** 2) / Math.sqrt(q) : 0; } G1[i] = 4 * Math.PI * ((s * Math.PI) / (3 * M)); }
const g1 = (t) => { const x = t * 2000, i = Math.min(1999, Math.floor(x)), f = x - i; return G1[i] + (G1[i + 1] - G1[i]) * f; };
export const lambda1 = (r, s, d) => { const a = Math.max(r, s), b = Math.min(r, s); return d === 3 ? ((4 * Math.PI) / 3) * (b / (a * a)) : g1(b / a) / a; };
const SPH = { 3: 4 * Math.PI, 4: 2 * Math.PI * Math.PI };
let LAM = null, LAMd = 0;
function dipoleKernel(d) { if (LAMd === d) return LAM; LAM = new Float64Array(N * N); for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) LAM[i * N + j] = (d / SPH[d]) * lambda1(GRID[i], GRID[j], d); LAMd = d; return LAM; }
const matvec = (K, v) => { const o = new Float64Array(N); for (let i = 0; i < N; i++) { let s = 0; const r = i * N; for (let j = 0; j < N; j++) s += K[r + j] * v[j]; o[i] = s; } return o; };

/* a channel's radial Hamiltonian on the log grid, as a symmetric tridiagonal matrix: with u = r^½ y and x = ln r,
   −y″ + [(L + ½)² + 2r²V] y = 2ε r² y, symmetrized by √(2r²); eigenvectors z = √2 r y, ∫u² dr = 1 when Σz² = 1 */
function tridiag(V, l, d) {
  const L = l + (d - 3) / 2, Lh2 = (L + 0.5) ** 2, h2 = H * H, dg = new Float64Array(N), off = new Float64Array(N - 1);
  for (let i = 0; i < N; i++) { const W = 2 * GRID[i] * GRID[i]; dg[i] = (2 / h2 + Lh2 + W * V[i]) / W; }
  for (let i = 0; i < N - 1; i++) off[i] = -1 / (h2 * Math.sqrt(4 * GRID[i] * GRID[i] * GRID[i + 1] * GRID[i + 1]));
  return { dg, off };
}
/* (T − e + iω) x = b, complex, by Thomas's algorithm; returns 2 Re x, i.e. the sum over ±iω for real b */
function solveShifted({ dg, off }, e, w, b) {
  const n = dg.length, cr = new Float64Array(n), ci = new Float64Array(n), xr = new Float64Array(n), xi = new Float64Array(n);
  let pr = dg[0] - e, pi = w; // pivot
  let den = pr * pr + pi * pi; cr[0] = (off[0] * pr) / den; ci[0] = (-off[0] * pi) / den; xr[0] = (b[0] * pr) / den; xi[0] = (-b[0] * pi) / den;
  for (let i = 1; i < n; i++) {
    const a = i < n - 1 ? off[i] : 0, lo = off[i - 1];
    pr = dg[i] - e - lo * cr[i - 1]; pi = w - lo * ci[i - 1]; den = pr * pr + pi * pi;
    cr[i] = (a * pr) / den; ci[i] = (-a * pi) / den;
    const rr = b[i] - lo * xr[i - 1], ri = -lo * xi[i - 1];
    xr[i] = (rr * pr + ri * pi) / den; xi[i] = (ri * pr - rr * pi) / den;
  }
  for (let i = n - 2; i >= 0; i--) { const tr = cr[i] * xr[i + 1] - ci[i] * xi[i + 1], ti = cr[i] * xi[i + 1] + ci[i] * xr[i + 1]; xr[i] -= tr; xi[i] -= ti; }
  return Float64Array.from(xr, (v) => 2 * v);
}
/* the eigenvalue of a channel with nr nodes, by Sturm-sequence bisection: exact to rounding. (A whole-matrix QL
   method loses the small eigenvalues here: the diagonal runs to 10¹³ near the nucleus, so its absolute accuracy is
   about 10⁻², which put 4D hydrogen's α 1% low.) Then its eigenvector by inverse iteration */
function sturmEigenvalue({ dg, off }, k, lo, hi) {
  const count = (x) => { let c = 0, q = dg[0] - x; if (q < 0) c++; for (let i = 1; i < dg.length; i++) { q = dg[i] - x - (off[i - 1] * off[i - 1]) / (q || 1e-300); if (q < 0) c++; } return c; };
  for (let it = 0; it < 200; it++) { const m = 0.5 * (lo + hi); if (count(m) > k) hi = m; else lo = m; if (hi - lo < 1e-14 * Math.max(1, Math.abs(m))) break; }
  return 0.5 * (lo + hi);
}
function eigenvector(T, nr, Z) {
  const lam = sturmEigenvalue(T, nr, -Z * Z * 4, 0);
  let v = Float64Array.from({ length: N }, (_, i) => 1 + 0.01 * Math.sin(i));
  for (let it = 0; it < 4; it++) { const x = solveShifted(T, lam + 1e-10, 0, v); let s = 0; for (const t of x) s += t * t; s = Math.sqrt(s); v = Float64Array.from(x, (t) => t / s); }
  let nodes = 0; for (let i = 1; i < N; i++) if (v[i] * v[i - 1] < 0 && Math.abs(v[i]) + Math.abs(v[i - 1]) > 1e-8) nodes++;
  return { e: lam, z: v, nodes };
}
export function coupledAlpha(Z, d, { exchange = true, occ: occIn = null, omegas = [0, ...OMEGA], coupling = true } = {}) {
  const sh = subshells(d), el = TABLE[d][Z - 1], occ = occIn || sh.map((s) => (el.orb.find((o) => o.s === s.name) || { o: 0 }).o);
  const g = scf(Z, occ, d, { iters: 80, exchange }), Vs = potentials(Z, occ, g.qs, d, { exchange }), K = dipoleKernel(d);
  // each occupied orbital, its channels, and the occupied orbitals there to project out (all in its own potential)
  const parts = [];
  sh.forEach((s, i) => {
    if (!occ[i]) return;
    const home = eigenvector(tridiag(Vs[i], s.l, d), s.n - s.l - 1, Z), chans = [];
    for (const [lp, share] of [[s.l + 1, (s.l + d - 2) / (2 * s.l + d - 2)], [s.l - 1, s.l / (2 * s.l + d - 2)]]) {
      if (lp < 0 || share === 0) continue;
      const T = tridiag(Vs[i], lp, d), occs = sh.map((t, k) => (t.l === lp && occ[k] ? eigenvector(T, t.n - lp - 1, Z).z : null)).filter(Boolean);
      chans.push({ T, share, occs });
    }
    parts.push({ i, o: occ[i], e: home.e, z0: home.z, chans });
  });
  const project = (v, occs) => { for (const q of occs) { let c = 0; for (let k = 0; k < N; k++) c += q[k] * v[k]; for (let k = 0; k < N; k++) v[k] -= c * q[k]; } return v; };
  return omegas.map((w) => {
    let dv = new Float64Array(N), own = parts.map(() => new Float64Array(N)), alpha = 0;
    for (let it = 0; it < 200; it++) {
      const m = new Float64Array(N), mi = parts.map(() => new Float64Array(N));
      parts.forEach((p, pi) => {
        for (const c of p.chans) {
          const b = project(Float64Array.from(p.z0, (z, k) => z * (GRID[k] + dv[k] - own[pi][k])), c.occs), X = project(solveShifted(c.T, p.e, w, b), c.occs);
          for (let k = 0; k < N; k++) { const v = (p.o / d) * c.share * p.z0[k] * X[k]; m[k] += v; mi[pi][k] += v / p.o; }
        }
      });
      let a = 0; for (let k = 0; k < N; k++) a += GRID[k] * m[k];
      if (!coupling) return a;
      // the distortion is −(H − ε)⁻¹(w u₀), so the cloud's change is −m, and its potential −Λm: it pushes back
      const dvNew = matvec(K, m).map((v) => -v), ownNew = mi.map((x) => matvec(K, x).map((v) => -v)), mixw = 0.5;
      for (let k = 0; k < N; k++) dv[k] = mixw * dvNew[k] + (1 - mixw) * dv[k];
      own = own.map((o, pi) => Float64Array.from(o, (v, k) => mixw * ownNew[pi][k] + (1 - mixw) * v));
      if (Math.abs(a - alpha) < 1e-7 * Math.abs(a)) { alpha = a; break; }
      alpha = a;
    }
    return alpha;
  });
}

/* the bake: every noble gas, and hydrogen, in both worlds, by the coupled response; the sum-rule check at ω = 300 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = { 3: [], 4: [] }, t0 = Date.now();
  for (const d of [3, 4]) for (const el of TABLE[d].filter((e) => e.Z === 1 || isNoble(e, d))) {
    const al = coupledAlpha(el.Z, d, { omegas: [0, 300, ...OMEGA] }), a = al.slice(2);
    out[d].push({ Z: el.Z, a0: +al[0].toPrecision(6), fsum: +(300 * 300 * al[1]).toPrecision(5), a: a.map((v) => +v.toPrecision(6)), c6: +c6From(a, a, d).toPrecision(6) });
    process.stderr.write(`${d}D ${el.Z}: α ${al[0].toFixed(3)}, ω²α(300) ${(300 * 300 * al[1]).toFixed(3)}, C₆ ${c6From(a, a, d).toFixed(2)}  ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
  }
  writeFileSync(new URL("../js/response.js", import.meta.url), `/* Generated by tools/response.mjs: α(iω) on OMEGA for hydrogen and the noble gases (coupled response, Hartree + local exchange), static α, ω²α at ω = 300 (→ the electron count), and C₆. Do not edit. */\nexport const OMEGA = ${JSON.stringify(OMEGA.map((w) => +w.toPrecision(8)))};\nexport const OMEGA_W = ${JSON.stringify(OMEGA_W.map((w) => +w.toPrecision(8)))};\nexport const RESPONSE = ${JSON.stringify(out)};\n`);
  console.log(`baked in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
