/* Ions, for the gases chapter's salts: the energy to strip bluminium (4D element 15) to Bl³⁺ and for pxygen to take an
   electron, by the same solver as the table (Hartree plus local exchange), with aluminium and oxygen as the check.
   A second electron on an isolated oxide or pxide ion isn't bound in either world (a crystal's charges hold it), so
   it isn't computed here. Prints JSON: node four/atom/tools/ions.mjs */
import { scf, subshells } from "../js/atom.js";
import { fileURLToPath } from "node:url";
const EV = 27.211386;
const occOf = (d, spec) => { const sh = subshells(d), occ = sh.map(() => 0); for (const [n, k] of Object.entries(spec)) occ[sh.findIndex((s) => s.name === n)] = k; return occ; };
const energy = (Z, d, spec) => scf(Z, occOf(d, spec), d, { exchange: true, iters: 200 }).E;
export function ions() {
  const strip = (Z, d, core) => { const E = [{ ...core, "3s": 2, "3p": 1 }, { ...core, "3s": 2 }, { ...core, "3s": 1 }, core].map((c) => energy(Z, d, c)); return [0, 1, 2].map((i) => (E[i + 1] - E[i]) * EV); };
  const grab = (Z, d, full) => (energy(Z, d, { "1s": 2, "2s": 2, "2p": full - 2 }) - energy(Z, d, { "1s": 2, "2s": 2, "2p": full - 1 })) * EV;
  return { Al: strip(13, 3, { "1s": 2, "2s": 2, "2p": 6 }), Bl: strip(15, 4, { "1s": 2, "2s": 2, "2p": 8 }), O: grab(8, 3, 6), Px: grab(10, 4, 8),
    measured: { Al: [5.986, 18.829, 28.448], O: 1.461 } };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(ions()));
