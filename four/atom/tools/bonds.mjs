/* Is it a hydrogen problem? The same heavy atom bonded to hydrogen and to its row's last-but-one element (gluorine in 4D,
   fluorine in ours), by atomization energies: geometry by Hartree–Fock (bond lengths and the angle relaxed), energy by
   MP2 on it, the atoms by unrestricted Hartree–Fock and MP2 in their own bases, cores frozen.
     node four/atom/tools/bonds.mjs mol <name>    one molecule (cached)
     node four/atom/tools/bonds.mjs bake          → js/bondsdata.js, the mean bonds
   molecules: ours CH4, CH3F, H2O, OF2, HF, F2 (the checks: measured atomization energies), 4D DH5, DH4Gl (darbon,
   element 7, five bonds), PxH2 (Xater), PxGl2, GlH, Gl2.
   Bonds: X–H = AE(XHₙ)/n; X–F or X–Gl on darbon or carbon = AE(XHₙ₋₁L) − (n − 1)·(X–H) (a whole DGl₅ would be six heavy
   4D atoms, past the sandbox and the runner's memory); on pxygen or oxygen AE(XL₂)/2; H–L = AE(HL); L–L = AE(L₂).
   Cache $TMPDIR/atom4-bonds */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import * as G from "../js/gauss.js";
import { basisFor, directions, minimize1 } from "./census.mjs";
import { minimize2 } from "./molecules.mjs";

const DIR = path.join(process.env.TMPDIR || os.tmpdir(), "atom4-bonds"); mkdirSync(DIR, { recursive: true });
const here = path.dirname(new URL(import.meta.url).pathname), [cmd, name] = process.argv.slice(2), EV = 27.211386, PLUS = "dp";
/* each molecule: dimension, centre X, its ligands (the first may differ), shape; measured atomization (eV, no zero point) */
export const MOLS = {
  CH4: { d: 3, X: 6, L: [1, 1, 1, 1], shape: "fixed", AE: 18.19 }, CH3F: { d: 3, X: 6, L: [9, 1, 1, 1], shape: "fixed", AE: 18.32 },
  H2O: { d: 3, X: 8, L: [1, 1], shape: "bent", AE: 10.09 }, OF2: { d: 3, X: 8, L: [9, 9], shape: "bent", AE: 4.07 },
  HF: { d: 3, X: 9, L: [1], shape: "one", AE: 6.12 }, F2: { d: 3, X: 9, L: [9], shape: "one", AE: 1.66 },
  DH5: { d: 4, X: 7, L: [1, 1, 1, 1, 1], shape: "fixed" }, DH4Gl: { d: 4, X: 7, L: [11, 1, 1, 1, 1], shape: "fixed" },
  PxH2: { d: 4, X: 10, L: [1, 1], shape: "bent" }, PxGl2: { d: 4, X: 10, L: [11, 11], shape: "bent" },
  GlH: { d: 4, X: 11, L: [1], shape: "one" }, Gl2: { d: 4, X: 11, L: [11], shape: "one" },
};
/* the atoms' ground spins (α, β): Hund's rule on the solved configuration */
const SPIN = { 3: { 1: [1, 0], 6: [4, 2], 8: [5, 3], 9: [5, 4] }, 4: { 1: [1, 0], 7: [5, 2], 10: [6, 4], 11: [6, 5] } };
const R0 = { 3: { 1: 1.9, 9: 2.6 }, 4: { 1: 2.9, 11: 3.3 } };
function atomsOf(M, R1, R2, param) {
  const u = directions(M.L.length, M.d, param), z = new Array(M.d).fill(0);
  return [{ Z: M.X, at: z }, ...M.L.map((Z, i) => ({ Z, at: u[i].map((x) => x * (i === 0 && M.L[0] !== M.L[M.L.length - 1] ? R2 : R1)) }))];
}
function energy(atoms, d, mp2 = false) {
  const sh = atoms.flatMap((a, k) => G.shellsFor(a, basisFor(a.Z, d, PLUS)).map((s) => ({ ...s, atom: k }))), one = G.oneElectron(sh, atoms, d), ERI = G.twoElectron(sh, d, one.F);
  const ne = atoms.reduce((t, a) => t + a.Z, 0), r = G.hartreeFock(atoms, sh, d, { nAlpha: ne / 2, nBeta: ne / 2, ints: { one, ERI } });
  return { hf: r.E, mp2: mp2 ? r.E + G.mp2(r, ERI, { frozen: atoms.filter((a) => a.Z > 2).length }).E2 : null, ok: r.converged, n: one.n };
}
function atomE(Z, d) {
  const f = path.join(DIR, `atom-${d}-${Z}.json`); if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  const at = [{ Z, at: new Array(d).fill(0) }], sh = G.shellsFor(at[0], basisFor(Z, d, PLUS)).map((s) => ({ ...s, atom: 0 })), one = G.oneElectron(sh, at, d), ERI = G.twoElectron(sh, d, one.F), [na, nb] = SPIN[d][Z];
  const r = G.hartreeFock(at, sh, d, { nAlpha: na, nBeta: nb, ints: { one, ERI } }), o = { hf: r.E, mp2: r.E + (Z > 1 ? G.ump2(r, ERI, { frozen: Z > 2 ? 1 : 0 }).E2 : 0), ok: r.converged };
  writeFileSync(f, JSON.stringify(o)); return o;
}
if (cmd === "mol") {
  const M = MOLS[name]; if (!M) throw new Error(`no molecule ${name}`);
  const f = path.join(DIR, `${name}.json`); if (existsSync(f)) { console.log(readFileSync(f, "utf8")); process.exit(0); }
  const t0 = Date.now(), lig = M.L[M.L.length - 1], mixed = M.L[0] !== lig, Ra = R0[M.d][lig] ?? 2.5, Rb = R0[M.d][M.L[0]] ?? 2.5;
  let R1 = Ra, R2 = Rb, param = M.d === 3 ? 104 : 120;
  const E = (a, b, p) => energy(atomsOf(M, a, b, p), M.d).hf;
  if (M.shape === "bent") { const m = minimize2((x, y) => E(x, x, y), Ra, param, 0.08, 4, 4, 3, 30); R1 = m.x; param = m.y; }
  else if (mixed) { const m = minimize2((x, y) => E(x, y, 0), Ra, Rb, 0.08, 0.08, 4, 3, 30); R1 = m.x; R2 = m.y; }
  else R1 = minimize1((x) => E(x, x, 0), Ra, 0.08);
  const atoms = atomsOf(M, R1, R2, param), e = energy(atoms, M.d, true), parts = [M.X, ...M.L].map((Z) => atomE(Z, M.d));
  const AE = { hf: (parts.reduce((t, p) => t + p.hf, 0) - e.hf) * EV, mp2: (parts.reduce((t, p) => t + p.mp2, 0) - e.mp2) * EV };
  const out = { name, d: M.d, R: +R1.toFixed(4), R2: mixed ? +R2.toFixed(4) : null, param: M.shape === "bent" ? +param.toFixed(2) : null, n: e.n, ok: e.ok && parts.every((p) => p.ok), AE, measured: M.AE ?? null, s: (Date.now() - t0) / 1000 };
  writeFileSync(f, JSON.stringify(out)); console.log(JSON.stringify(out));
} else if (cmd === "bake") {
  const get = (k) => (existsSync(path.join(DIR, `${k}.json`)) ? JSON.parse(readFileSync(path.join(DIR, `${k}.json`), "utf8")) : null), out = { molecules: {}, bonds: {} };
  for (const k of Object.keys(MOLS)) { const m = get(k); if (m) out.molecules[k] = m; }
  const mol = out.molecules, bond = (label, f, meas) => { try { const v = f("mp2"), h = f("hf"); out.bonds[label] = { mp2: +v.toFixed(3), hf: +h.toFixed(3), measured: meas == null ? null : +meas.toFixed(3) }; } catch { /* not computed yet */ } };
  const ae = (k, w) => { if (!mol[k]) throw 0; return mol[k].AE[w]; }, meas = (k) => MOLS[k].AE;
  bond("C–H", (w) => ae("CH4", w) / 4, meas("CH4") / 4); bond("C–F", (w) => ae("CH3F", w) - 3 * (ae("CH4", w) / 4), meas("CH3F") - (3 * meas("CH4")) / 4);
  bond("O–H", (w) => ae("H2O", w) / 2, meas("H2O") / 2); bond("O–F", (w) => ae("OF2", w) / 2, meas("OF2") / 2);
  bond("F–H", (w) => ae("HF", w), meas("HF")); bond("F–F", (w) => ae("F2", w), meas("F2"));
  bond("D–H", (w) => ae("DH5", w) / 5); bond("D–Gl", (w) => ae("DH4Gl", w) - 4 * (ae("DH5", w) / 5));
  bond("Px–H", (w) => ae("PxH2", w) / 2); bond("Px–Gl", (w) => ae("PxGl2", w) / 2);
  bond("Gl–H", (w) => ae("GlH", w)); bond("Gl–Gl", (w) => ae("Gl2", w));
  writeFileSync(path.join(here, "../js/bondsdata.js"), `/* Generated by tools/bonds.mjs bake; do not edit. Each molecule's Hartree–Fock geometry (bohr, degrees) and its
   atomization energy (eV; Hartree–Fock and MP2, no zero point), and the mean bonds drawn from them, ours against the
   measured. */
export const BONDS = ${JSON.stringify(out)};
`);
  for (const [k, v] of Object.entries(out.bonds)) console.log(`${k}: MP2 ${v.mp2} eV, Hartree–Fock ${v.hf}${v.measured != null ? `, measured ${v.measured}` : ""}`);
} else console.error("usage: bonds.mjs mol <name> | bake");
