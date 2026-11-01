/* A salt, computed: two closed-shell ions from the table's solver, their meeting by Gordon and Kim's electron gas on
   their frozen clouds (as tools/pairs.mjs does for like atoms, here for unlike ones and charged), and the crystal's
   energy by the Madelung sum plus every pair's short-range rest. Our sodium fluoride is the check; 4D's counterpart
   is todium gluoride, To⁺G⁻, both ions with oeon's twelve electrons, on the 4D alternating lattice (the one the
   molecular-dynamics Ewald is checked on: Madelung constant 1.8393991).
     node four/atom/tools/salt.mjs bake   # → js/saltdata.js: NaF and To⁺G⁻, MgO and Ng²⁺Px²⁻ (Watson-held anions), densities
     node four/atom/tools/salt.mjs        # prints the baked JSON */
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { scf, subshells, kernel, hartree, R as GRID, N, H } from "../js/atom.js";
import { GAS } from "./pairs.mjs";
import { kTab } from "../js/kernel.js";

const EV = 27.211386, SPHERE = { 3: 4 * Math.PI, 4: 2 * Math.PI * Math.PI };
/* an ion: its charge per grid point Q, density ρ, the electrons' potential ψ (exact at the grid points), net charge */
/* an ion; a doubly charged anion isn't bound alone (our O²⁻ neither), so `watson` = { q, R } holds it in a shell of
   charge q at radius R, the standard stand-in for the crystal round it (its potential on an electron −q k(r, R), the
   shell kernel: 1/max ours, k(min/max)/max in 4D) */
export function ion(Z, d, spec, { watson = null } = {}) {
  const sh = subshells(d), occ = sh.map(() => 0); for (const [n, k] of Object.entries(spec)) occ[sh.findIndex((s) => s.name === n)] = k;
  const vext = watson ? Float64Array.from(GRID, (r) => { const a = Math.min(r, watson.R), b = Math.max(r, watson.R); return (-watson.q * (d === 3 ? 1 : kTab(a / b))) / b; }) : null;
  const g = scf(Z, occ, d, { iters: 300, exchange: true, vext }), Q = new Float64Array(N);
  sh.forEach((s, i) => { if (occ[i]) for (let j = 0; j < N; j++) Q[j] += occ[i] * g.qs[i][j]; });
  const psi = hartree(kernel(d), Q), rho = Float64Array.from(Q, (q, j) => q / (H * GRID[j]) / (SPHERE[d] * GRID[j] ** (d - 1)));
  return { Z, d, Q, rho, psi, E: g.E, converged: g.converged, q: Z - occ.reduce((s, o) => s + o, 0) };
}
/* ψ between grid points: cubic (Catmull–Rom) in log r, so the Z²/R cancellation survives; beyond the grid, the far form */
function psiAt(A, r) {
  const x = Math.log(r / GRID[0]) / H, j = Math.floor(x);
  if (j < 1) return A.psi[0];
  if (j >= N - 2) return A.psi[N - 1] * GRID[N - 1] / r;
  const u = x - j, p0 = A.psi[j - 1], p1 = A.psi[j], p2 = A.psi[j + 1], p3 = A.psi[j + 2];
  return p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0)));
}
function at(f, r) { const x = Math.log(r / GRID[0]) / H; if (x <= 0) return f[0]; if (x >= N - 1) return 0; const j = Math.floor(x), u = x - j; return f[j] * (1 - u) + f[j + 1] * u; }
function gauss(n) { const x = [], w = []; for (let i = 1; i <= n; i++) { let z = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5)), pp = 0; for (let it = 0; it < 100; it++) { let p1 = 1, p2 = 0; for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; } pp = (n * (z * p1 - p2)) / (z * z - 1); const z1 = z; z = z1 - p1 / pp; if (Math.abs(z - z1) < 1e-15) break; } x.push(z); w.push(2 / ((1 - z * z) * pp * pp)); } return { x, w }; }
const GL = gauss(64);
const meas = (d, th) => (d === 3 ? 2 * Math.PI * Math.sin(th) : 4 * Math.PI * Math.sin(th) ** 2);
/* the overlap's kinetic and exchange energy over the half of space nearer A, in A's coordinates */
function halfOverlap(A, B, R) {
  const gas = GAS[A.d]; let kin = 0, exch = 0;
  for (let j = 0; j < N; j++) {
    const r = GRID[j]; if (r > 40) break; const ra = A.rho[j]; if (ra < 1e-14) continue;
    const c0 = Math.min(1, R / (2 * r)), th0 = Math.acos(c0), span = Math.PI - th0; let sk = 0, sx = 0;
    for (let k = 0; k < GL.x.length; k++) { const th = th0 + (span / 2) * (GL.x[k] + 1), dist = Math.sqrt(r * r + R * R - 2 * r * R * Math.cos(th)), rb = at(B.rho, dist), m = GL.w[k] * meas(A.d, th); if (rb <= 0) continue; sk += m * (gas.t(ra + rb) - gas.t(ra) - gas.t(rb)); sx += m * (gas.x(ra + rb) - gas.x(ra) - gas.x(rb)); }
    const vol = H * r ** A.d; kin += sk * (span / 2) * vol; exch += sx * (span / 2) * vol;
  }
  return { kin, exch };
}
/* two ions R apart: everything but their point charges' q_A q_B / R, which the Madelung sum carries */
export function shortRange(A, B, R) {
  let elel = 0;
  for (let j = 0; j < N; j++) { const r = GRID[j]; if (r > 60) break; if (A.Q[j] < 1e-13) continue; let s = 0; for (let k = 0; k < GL.x.length; k++) { const th = (Math.PI / 2) * (GL.x[k] + 1), dist = Math.sqrt(r * r + R * R - 2 * r * R * Math.cos(th)); s += GL.w[k] * meas(A.d, th) * psiAt(B, dist); } elel += A.Q[j] * s * (Math.PI / 2) / SPHERE[A.d]; }
  const es = (A.Z * B.Z) / R - A.Z * psiAt(B, R) - B.Z * psiAt(A, R) + elel, h1 = halfOverlap(A, B, R), h2 = halfOverlap(B, A, R);
  return es - (A.q * B.q) / R + h1.kin + h2.kin + h1.exch + h2.exch;
}
/* the alternating lattice (rock salt in 3D), nearest neighbours a apart: energy per ion pair, from free ions */
export const MADELUNG = { 3: 1.7475646, 4: 1.8393991 };
export function saltEnergy(d, a, f, M = 24, qq = 1) {
  // expanding cubes, the boundary weighted by Evjen's halves so every cube stays neutral: in 4D an ion's cloud leaks
  // a −S/8R³ field (the shell theorem's failure), and its alternating sum converges only like the Madelung sum does
  let s = 0; const n = Array(d).fill(-M);
  for (;;) { let r2 = 0, w = 1, odd = 0; for (const v of n) { r2 += v * v; odd += v; if (v === M || v === -M) w *= 0.5; }
    if (r2) { const r = a * Math.sqrt(r2); s += w * ((odd & 1) ? f.pm(r) : 0.5 * (f.pp(r) + f.mm(r))); }
    let i = 0; while (i < d && n[i] === M) { n[i] = -M; i++; } if (i === d) break; n[i]++; }
  return (-qq * MADELUNG[d]) / a + s; // qq = |q₊q₋|: 1 for To⁺G⁻, 4 for Ng²⁺Px²⁻
}
/* the three short-range curves, tabulated every 0.05 bohr (every 0.25 put the minimum on a kink of the linear
   interpolation, quantizing the spacing), computed out to RM, and past it the clouds' far field, exactly, from their moments.
   In 4D a spherical cloud's charge transforms as q + S k²/8 − T k⁴/192 (S = Σ⟨r²⟩, T = Σ⟨r⁴⟩ over its electrons)
   and the pinned force as 4π²/|k|³, so two ions meet, past their point charges, as
     (q_A S_B + q_B S_A)/8R³ − 3 S_A S_B/64R⁵ + (q_A T_B + q_B T_A)/64R⁵ + …
   The first is each ion's charge in the other's leaked field, alternating in sign across the crystal; the second is
   the forces chapter's permanent pull. In 3D the shell theorem holds and nothing is left. Using the exact form
   matters: a numerical tail with a hair of the wrong sign would sum to anything over 4D's r³ shells */
const RM = 14;
const moments = (A) => { let S = 0, T = 0; for (let j = 0; j < N; j++) { S += A.Q[j] * GRID[j] ** 2; T += A.Q[j] * GRID[j] ** 4; } return { S, T }; };
export function far(A, B, R) {
  if (A.d === 3) return 0;
  const a = (A.m ??= moments(A)), b = (B.m ??= moments(B));
  return (A.q * b.S + B.q * a.S) / (8 * R ** 3) - (3 * a.S * b.S) / (64 * R ** 5) + (A.q * b.T + B.q * a.T) / (64 * R ** 5);
}
function curves(cat, an, lo = 2.6, step = 0.05) {
  const Rs = []; for (let R = lo; R <= RM + 1e-9; R += step) Rs.push(R);
  const pairs = { pm: [cat, an], pp: [cat, cat], mm: [an, an] }, out = { T: {}, seam: {} };
  for (const [k, [A, B]] of Object.entries(pairs)) {
    const v = Rs.map((R) => shortRange(A, B, R)), fz = (R) => far(A, B, R);
    out.T[k] = v; out.seam[k] = { computed: v.at(-1), far: fz(RM) };
    out[k] = (r) => { if (r >= RM) return fz(r); const x = (r - lo) / step, i = Math.max(0, Math.min(Rs.length - 2, Math.floor(x))), u = x - i; return v[i] * (1 - u) + v[i + 1] * u; };
  }
  return out;
}
export function salt(d, cat, an) {
  const f = curves(cat, an); let b = { a: 0, E: Infinity };
  const M = d === 3 ? 30 : 12, qq = Math.abs(cat.q * an.q), E = (a, m = M) => saltEnergy(d, a, f, m, qq);
  for (let a = 2.6; a <= 7; a += 0.1) { const e = E(a, M / 2); if (e < b.E) b = { a, E: e }; } // coarse, on half-size cubes
  let lo = b.a - 0.1, hi = b.a + 0.1; const g = (Math.sqrt(5) - 1) / 2; // then golden sections to a thousandth of a bohr
  let x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo), f1 = E(x1), f2 = E(x2);
  while (hi - lo > 1e-3) { if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - g * (hi - lo); f1 = E(x1); } else { lo = x1; x1 = x2; f1 = f2; x2 = lo + g * (hi - lo); f2 = E(x2); } }
  b = { a: (lo + hi) / 2, E: E((lo + hi) / 2) };
  // the same-sign R⁻⁵ pull converges only as 1/M over cubes M wide, so the last two cubes are extrapolated (Richardson)
  const conv = [M / 2, M, 2 * M].map((m) => -E(b.a, m) * EV);
  return { a: b.a, U: 2 * conv[2] - conv[1], conv, seam: f.seam };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // `bake` → js/saltdata.js: the two simple salts, and the two with doubly charged ions (our MgO the check, 4D's nagnesium
  // pxide Ng²⁺Px²⁻, both ions with oeon's twelve electrons), each anion held by a Watson shell at a/M (inside it the
  // Madelung potential), iterated with the spacing; densities on the alternating lattice, each ion a cell of side a
  // (masses: ours measured, 4D's element Z at 2Z, odd ones at 2Z + 1). Without `bake`, prints the baked JSON
  if (process.argv[2] !== "bake") { console.log(JSON.stringify((await import("../js/saltdata.js")).SALT)); process.exit(0); }
  const t0 = Date.now(), out = {}, BOHR = 5.29177210903e-11, U = 1.66053906660e-27;
  const ne3 = { "1s": 2, "2s": 2, "2p": 6 }, ne4 = { "1s": 2, "2s": 2, "2p": 8 };
  const density = (d, a, Ac, Aa) => ((Ac + Aa) * U) / (2 * (a * BOHR) ** d);
  for (const [key, d, Zc, Za, core, Ac, Aa] of [["NaF", 3, 11, 9, ne3, 22.98977, 18.998403], ["ToG", 4, 13, 11, ne4, 27, 23]]) {
    const cat = ion(Zc, d, core), an = ion(Za, d, core);
    // the atoms, for what it takes to make the ions: the cation's ionization and the anion's affinity
    const sh = subshells(d), top = d === 3 ? 6 : 8, catAtom = ion(Zc, d, { ...core, "3s": 1 }), anAtom = ion(Za, d, { ...core, "2p": top - 1 });
    const r = salt(d, cat, an);
    out[key] = { ...r, cohesive: r.U - (cat.E - catAtom.E) * EV + (anAtom.E - an.E) * EV, converged: [cat.converged, an.converged, catAtom.converged, anAtom.converged], IE: (cat.E - catAtom.E) * EV, EA: (anAtom.E - an.E) * EV, density: density(d, r.a, Ac, Aa) };
    process.stderr.write(`${key} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
  }
  for (const [key, d, Zc, Za, core, Ac, Aa] of [["MgO", 3, 12, 8, ne3, 24.305, 15.999], ["NgPx", 4, 14, 10, ne4, 28, 20]]) {
    let a = d === 3 ? 4.0 : 3.6, r = null, R = null;
    for (let it = 0; it < 5; it++) { R = a / MADELUNG[d]; r = salt(d, ion(Zc, d, core), ion(Za, d, core, { watson: { q: 2, R } })); if (Math.abs(r.a - a) < 0.005) break; a = r.a; }
    out[key] = { ...r, watson: R, density: density(d, r.a, Ac, Aa) };
    process.stderr.write(`${key} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
  }
  out.measured = { NaF: { a: 4.38, U: 9.6, density: 2558 }, MgO: { a: 3.98, U: 39.9, density: 3580 } };
  writeFileSync(new URL("../js/saltdata.js", import.meta.url), `// generated by four/atom/tools/salt.mjs bake — salts, ours and 4D, their spacing, lattice energy and density\nexport const SALT = ${JSON.stringify(out)};\n`);
  console.log(JSON.stringify(out));
}
