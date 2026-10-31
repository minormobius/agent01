/* Bakes js/pairs.js: the interaction of two like atoms (noble gases), in 3D and 4D, by Gordon and Kim's electron-gas
   model on the solver's own atoms. Each atom keeps its own cloud (frozen); the pair's energy is
     the exact electrostatics of the two clouds and nuclei (with the dimension's own kernel), plus
     the extra kinetic energy of the overlap, ∫ t(ρA + ρB) − t(ρA) − t(ρB), with t the free electron gas's, plus
     the same for exchange.
   Correlation is left out (as in the solver). Dispersion is not in it: the page adds it separately where known.
     node four/atom/tools/pairs.mjs           # writes js/pairs.js (about a minute) */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scf, subshells, kernel, hartree, kTab, R as GRID, N, H } from "../js/atom.js";
import { TABLE } from "../js/table.js";
import { isNoble } from "../js/periodic.js";

/* the free electron gas, two spins, in d dimensions (atomic units). Kinetic: t = (d/(d+2)) ρ k_F²/2 with
   ρ = 2 V_d k_F^d/(2π)^d. Exchange with the 1/r kernel: −¼∫|γ|²/r, γ/ρ = Γ(d/2+1)(2/x)^(d/2) J_{d/2}(x):
   3D −(3/4)(3/π)^(1/3) ρ^(4/3) (Dirac's), 4D −16/(15√π) ρ^(5/4) (Weber–Schafheitlin, ∫J₂²/x² = 4/15π) */
export const GAS = {
  3: { t: (r) => 0.3 * Math.pow(3 * Math.PI * Math.PI, 2 / 3) * Math.pow(r, 5 / 3), x: (r) => -0.75 * Math.cbrt(3 / Math.PI) * Math.pow(r, 4 / 3) },
  4: { t: (r) => ((4 * Math.PI) / 3) * Math.pow(r, 1.5), x: (r) => (-16 / (15 * Math.sqrt(Math.PI))) * Math.pow(r, 1.25) },
};
const SPHERE = { 3: 4 * Math.PI, 4: 2 * Math.PI * Math.PI }; // the area of the unit sphere round a point

/* one atom from the table, re-solved: its charge per grid point Q (summing to Z exactly), its volume density ρ, and
   its electrons' potential ψ, all on the solver's log grid */
export function atomFields(Z, d) {
  const el = TABLE[d][Z - 1], sh = subshells(d), occ = sh.map((s) => (el.orb.find((o) => o.s === s.name) || { o: 0 }).o);
  const g = scf(Z, occ, d, { iters: 80, exchange: true }), Q = new Float64Array(N);
  sh.forEach((s, i) => { if (occ[i]) for (let j = 0; j < N; j++) Q[j] += occ[i] * g.qs[i][j]; });
  const psi = hartree(kernel(d), Q), rho = Float64Array.from(Q, (q, j) => q / (H * GRID[j]) / (SPHERE[d] * GRID[j] ** (d - 1)));
  return { Z, d, Q, rho, psi, E: g.E };
}
/* the electrons' potential anywhere, exactly: each grid point's charge is a thin shell, felt as 1/max(r, s) in 3D
   and k(min/max)/max in 4D */
function psiAt(A, x) {
  let s = 0; const { Q, d } = A;
  for (let j = 0; j < N; j++) { if (!Q[j]) continue; const a = Math.max(x, GRID[j]), b = Math.min(x, GRID[j]); s += Q[j] * (d === 3 ? 1 / a : kTab(b / a) / a); }
  return s;
}
/* linear interpolation on the log grid (densities only: no cancellation rides on them) */
function at(f, r) { const x = Math.log(r / GRID[0]) / H; if (x <= 0) return f[0]; if (x >= N - 1) return 0; const j = Math.floor(x), u = x - j; return f[j] * (1 - u) + f[j + 1] * u; }
/* Gauss–Legendre nodes on [−1, 1] */
function gauss(n) { const x = [], w = []; for (let i = 1; i <= n; i++) { let z = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5)), pp = 0; for (let it = 0; it < 100; it++) { let p1 = 1, p2 = 0; for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; } pp = (n * (z * p1 - p2)) / (z * z - 1); const z1 = z; z = z1 - p1 / pp; if (Math.abs(z - z1) < 1e-15) break; } x.push(z); w.push(2 / ((1 - z * z) * pp * pp)); } return { x, w }; }
const GL = gauss(64);

/* the pair at separation R, split into its parts (hartree). Everything is summed over the solver's own grid points,
   so the charges are exact: the electrostatics is a cancellation between terms of size Z²/R, and an interpolated
   density loses enough charge to swamp the answer */
export function pairEnergy(A, R) {
  const { Z, d, Q, rho } = A, gas = GAS[d], meas = (th) => (d === 3 ? 2 * Math.PI * Math.sin(th) : 4 * Math.PI * Math.sin(th) ** 2);
  let elel = 0, kin = 0, exch = 0;
  for (let j = 0; j < N; j++) {
    const r = GRID[j]; if (r > 40) break;
    // A's electrons on the sphere of radius r, in B's electrons' potential (averaged over that sphere)
    if (Q[j] > 1e-13) { let s = 0; for (let k = 0; k < GL.x.length; k++) { const th = (Math.PI / 2) * (GL.x[k] + 1), dist = Math.sqrt(r * r + R * R - 2 * r * R * Math.cos(th)); s += GL.w[k] * meas(th) * psiAt(A, dist); } elel += Q[j] * ((s * (Math.PI / 2)) / SPHERE[d]); }
    // the overlap's kinetic and exchange energy: twice the half of space nearer A (r cos θ < R/2); volume H r^d per point
    const ra = rho[j], c0 = Math.min(1, R / (2 * r)), th0 = Math.acos(c0), span = Math.PI - th0; let sk = 0, sx = 0;
    for (let k = 0; k < GL.x.length; k++) {
      const th = th0 + (span / 2) * (GL.x[k] + 1), dist = Math.sqrt(r * r + R * R - 2 * r * R * Math.cos(th)), rb = at(rho, dist), m = GL.w[k] * meas(th);
      if (rb <= 0 && ra <= 0) continue;
      sk += m * (gas.t(ra + rb) - gas.t(ra) - gas.t(rb)); sx += m * (gas.x(ra + rb) - gas.x(ra) - gas.x(rb));
    }
    const vol = H * r ** d; kin += 2 * sk * (span / 2) * vol; exch += 2 * sx * (span / 2) * vol;
  }
  const es = (Z * Z) / R - 2 * Z * psiAt(A, R) + elel;
  return { es, kin, exch, total: es + kin + exch };
}

export const RS = Array.from({ length: 49 }, (_, i) => 3 + i * 0.25); // 3 … 15 bohr

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = { 3: [], 4: [] }, t0 = Date.now();
  for (const d of [3, 4]) for (const el of TABLE[d].filter((e) => isNoble(e, d))) {
    const A = atomFields(el.Z, d), rows = RS.map((R) => pairEnergy(A, R));
    out[d].push({ Z: el.Z, es: rows.map((p) => +p.es.toExponential(5)), kin: rows.map((p) => +p.kin.toExponential(5)), exch: rows.map((p) => +p.exch.toExponential(5)) });
    process.stderr.write(`${d}D ${el.Z} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
  }
  writeFileSync(new URL("../js/pairs.js", import.meta.url), `/* Generated by tools/pairs.mjs: two like noble-gas atoms, Gordon–Kim on the solver's frozen clouds, hartree, at RS (bohr). Do not edit. */\nexport const RS = ${JSON.stringify(RS)};\nexport const PAIRS = ${JSON.stringify(out)};\n`);
  console.log(`baked ${out[3].length} + ${out[4].length} pairs in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
