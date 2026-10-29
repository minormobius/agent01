/* Each water's electrostatic potential, from its Hartree–Fock density in the census basis, sampled on shells around
   the molecule (1.4 to 2.2 times each atom's radius, Merz–Kollman style, in any d), and the point charges that best
   reproduce it. A force field's charges should be these, not whatever a fit to pair energies drifts to: the potential
   is the molecule's own, independent of any pair. The potential at C: Σ_A Z_A/|C − R_A| − ∫ρ(r)/|r − C|, the second
   from the density and the one-electron integrals of a unit charge at C.
     node four/atom/tools/esp.mjs [key …] [sites]   # sites: "nuclei" (default) or "lp" (plus lone-pair sites, fitted) */
import { fileURLToPath } from "node:url";
import * as G from "../js/gauss.js";
import { WORLDS, monoOf } from "./forcefield.mjs";
import { hydrideAtoms, basisFor } from "./census.mjs";
import { randomRotation } from "../js/md.js";
import { rng } from "../js/landscape.js";

const RADIUS = { 1: 2.3, 8: 2.9, 9: 2.8, 10: 3.2 }; // bohr, rough van der Waals radii; 4D's heavy atoms reuse the nearest
export function espGrid(key, { nPer = 60, shells = [1.4, 1.6, 1.8, 2.0, 2.2] } = {}) {
  const d = WORLDS[key].d, m = monoOf(key), atoms = hydrideAtoms(m.Z, d, m.R, m.param), n = atoms.reduce((s, a) => s + a.Z, 0) / 2;
  const sh = atoms.flatMap((a, i) => G.shellsFor(a, basisFor(a.Z, d)).map((s) => ({ ...s, atom: i })));
  const one = G.oneElectron(sh, atoms, d), ERI = G.twoElectron(sh, d, one.F), hf = G.hartreeFock(atoms, sh, d, { nAlpha: n, nBeta: n, ints: { one, ERI } });
  const N = one.n, P = Float64Array.from(hf.Pa, (v, k) => v + hf.Pb[k]), rnd = rng(4242), rad = (Z) => RADIUS[Z] ?? 3.2, pts = [];
  for (const f of shells) for (const [ia, a] of atoms.entries()) for (let k = 0; k < nPer; k++) {
    const u = randomRotation(d, rnd)[0], C = a.at.map((x, c) => x + f * rad(a.Z) * u[c]);
    if (atoms.some((b, ib) => ib !== ia && Math.hypot(...C.map((x, c) => x - b.at[c])) < f * rad(b.Z) - 1e-9)) continue; // inside another atom's shell
    const V = G.oneElectron(sh, [{ Z: 1, at: C }], d).V; let phi = 0;
    for (const b of atoms) phi += b.Z / Math.hypot(...C.map((x, c) => x - b.at[c]));
    for (let q = 0; q < N * N; q++) phi += P[q] * V[q]; // V is −⟨μ|1/|r − C||ν⟩
    pts.push({ C, phi });
  }
  return { key, d, atoms, pts, dipole: hf.dipole };
}
/* least-squares charges on given sites (total fixed at 0) for the grid: [charges, rms] */
export function fitCharges(sites, pts) {
  const n = sites.length, A = pts.map((p) => sites.map((s) => 1 / Math.hypot(...p.C.map((x, c) => x - s[c])))), b = pts.map((p) => p.phi);
  // eliminate the last charge (q_n = −Σ others)
  const M = Array.from({ length: n - 1 }, () => new Array(n - 1).fill(0)), r = new Array(n - 1).fill(0);
  A.forEach((row, k) => { const x = row.slice(0, n - 1).map((v) => v - row[n - 1]); for (let i = 0; i < n - 1; i++) { r[i] += x[i] * b[k]; for (let j = 0; j < n - 1; j++) M[i][j] += x[i] * x[j]; } });
  const L = M.map((row, i) => [...row, r[i]]);
  for (let c = 0; c < n - 1; c++) { let p = c; for (let q = c + 1; q < n - 1; q++) if (Math.abs(L[q][c]) > Math.abs(L[p][c])) p = q; [L[p], L[c]] = [L[c], L[p]]; for (let q = c + 1; q < n - 1; q++) { const f = L[q][c] / L[c][c]; for (let k = c; k < n; k++) L[q][k] -= f * L[c][k]; } }
  const x = new Array(n - 1); for (let i = n - 2; i >= 0; i--) { let s = L[i][n - 1]; for (let k = i + 1; k < n - 1; k++) s -= L[i][k] * x[k]; x[i] = s / L[i][i]; }
  const q = [...x, -x.reduce((s, v) => s + v, 0)], rms = Math.sqrt(A.reduce((s, row, k) => s + (row.reduce((t, v, i) => t + v * q[i], 0) - b[k]) ** 2, 0) / pts.length);
  return [q, rms];
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const keys = process.argv.slice(2).filter((a) => WORLDS[a]);
  for (const key of keys.length ? keys : ["3", "4", "4.9"]) {
    const g = espGrid(key), sites = g.atoms.map((a) => a.at), [q, rms] = fitCharges(sites, g.pts), scale = Math.sqrt(g.pts.reduce((s, p) => s + p.phi ** 2, 0) / g.pts.length);
    const dip = sites[0].map((_, c) => sites.reduce((s, x, i) => s + q[i] * x[c], 0));
    console.log(JSON.stringify({ key, points: g.pts.length, nuclei: { q: q.map((v) => +v.toFixed(4)), rms: +rms.toExponential(3), relative: +(rms / scale).toFixed(3), dipole: dip.map((v) => +v.toFixed(3)) }, hfDipole: g.dipole.map((v) => +v.toFixed(3)), kcalPerUnitCharge: +(rms * 627.509).toFixed(2) }));
  }
}
