/* Each water's static polarizability, by finite field on its Hartree–Fock ground state in the census's basis (the
   basis every pair energy of the force field was computed in, so the polarizable model and its data agree). A uniform
   field F along axis k adds F·x_k to every electron's one-electron energy; the energy's curvature is the polarizability,
   α_kk = −(E(F) + E(−F) − 2E(0))/F² (the field's linear term on the nuclei cancels in that difference). The pinned
   1/r makes a field a force per charge, q/r², in any d, so α is a length³ in both worlds.
     node four/atom/tools/polarize.mjs [key …]    # JSON: per key, α along each axis, its mean, and the dipole */
import { fileURLToPath } from "node:url";
import * as G from "../js/gauss.js";
import { WORLDS, monoOf } from "./forcefield.mjs";
import { hydrideAtoms, basisFor } from "./census.mjs";

export function polarizability(key, { F = 0.002, plus = "" } = {}) {
  const d = WORLDS[key].d, m = monoOf(key), atoms = hydrideAtoms(m.Z, d, m.R, m.param), n = atoms.reduce((s, a) => s + a.Z, 0) / 2;
  const shells = atoms.flatMap((a, i) => G.shellsFor(a, basisFor(a.Z, d, plus)).map((s) => ({ ...s, atom: i })));
  const one = G.oneElectron(shells, atoms, d), ERI = G.twoElectron(shells, d, one.F);
  const E = (k, f) => { const V = k < 0 ? one.V : Float64Array.from(one.V, (v, i) => v + f * one.M[k][i]); const r = G.hartreeFock(atoms, shells, d, { nAlpha: n, nBeta: n, ints: { one: { ...one, V }, ERI } }); if (!r.converged) throw new Error(`not converged: key ${key} axis ${k} field ${f}`); return r; };
  const e0 = E(-1, 0), axes = Array.from({ length: d }, (_, k) => -(E(k, F).E + E(k, -F).E - 2 * e0.E) / (F * F));
  return { key, d, atoms: atoms.map((a) => ({ Z: a.Z, at: a.at.map((x) => +x.toFixed(5)) })), axes: axes.map((v) => +v.toFixed(4)), mean: +(axes.reduce((s, v) => s + v, 0) / d).toFixed(4), dipole: e0.dipole?.map((v) => +v.toFixed(5)) };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) for (const key of process.argv.length > 2 ? process.argv.slice(2) : Object.keys(WORLDS).filter((k) => ["3", "4", "4.9"].includes(k))) console.log(JSON.stringify(polarizability(key)));
