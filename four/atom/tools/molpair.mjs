/* Pairs of molecules too big for the full basis: PxGl₂ (4D's OF₂, pxygen holding two gluorines) and our OF₂ as the
   check. Two PxGl₂ are six heavy 4D atoms, about 340 functions in the census's basis and 13 GB of stored integrals,
   past the runner. Two economies bring it to about 300 functions and 4–5 GB:
     the core contracted: each heavy atom's tightest s primitives (all but the five most diffuse) become one function,
       with the coefficients of the atom's own 1s orbital (unrestricted Hartree–Fock in the full set); the 1s is frozen in
       MP2 anyway, and the valence keeps every primitive it had;
     the integrals stored in single precision (gauss.js twoElectron f32), the energies still summed in double.
   Both are checked against the full basis in double on our OF₂ pair and on bond energies (`check`).
     node four/atom/tools/molpair.mjs mono <OF2|PxGl2>          the molecule: geometry (tools/bonds.mjs), dipole, energies
     node four/atom/tools/molpair.mjs check <OF2|PxGl2> [k]     placement k by the full basis in double and the economy one
     node four/atom/tools/molpair.mjs pair <OF2|PxGl2> <k> [--full]   placement k: MP2 interaction, counterpoise (runner, one a
                                                                command); --full the whole basis in double (needs the memory)
     node four/atom/tools/molpair.mjs bake                      → js/molpairdata.js
   Placements: B turned at random, its centre a random direction and a distance in [DMIN, DMAX] from A's, no two atoms
   closer than CLOSE (seeded by k); every 8th placement is drawn tight (DMIN − 1.5 … DMIN) so the repulsion is seen, and
   k ≥ 200 tighter still (the wall).
   Cache $TMPDIR/atom4-molpair */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import * as G from "../js/gauss.js";
import { basisFor, directions } from "./census.mjs";
import { randomRotation } from "../js/md.js";

const DIR = path.join(process.env.TMPDIR || os.tmpdir(), "atom4-molpair"); mkdirSync(DIR, { recursive: true });
const here = path.dirname(new URL(import.meta.url).pathname), [cmd, name, karg] = process.argv.slice(2), KCAL = 627.5095, KELVIN = 315775.02;
const SPIN = { 3: { 8: [5, 3], 9: [5, 4] }, 4: { 10: [6, 4], 11: [6, 5] } };
/* each molecule: dimension, centre and ligand, its Hartree–Fock geometry (bohr, degrees) from tools/bonds.mjs, the
   placement window (bohr), the basis letters */
export const MOLS = {
  OF2: { d: 3, X: 8, L: 9, R: 2.5327, theta: 103.44, DMIN: 5.0, DMAX: 10, CLOSE: 4.2, plus: "D" },
  PxGl2: { d: 4, X: 10, L: 11, R: 3.017, theta: 93.11, DMIN: 6.0, DMAX: 12, CLOSE: 4.8, plus: "D" },
};
export const atomsOf = (M) => { const u = directions(2, M.d, M.theta), z = new Array(M.d).fill(0); return [{ Z: M.X, at: z }, ...u.map((v) => ({ Z: M.L, at: v.map((x) => x * M.R) }))]; };
/* the core-contracted recipe for an atom: [l, exps] entries with exps either a number list (free primitives) or
   { exps, coefs } (one contracted function) */
const CORE = {};
export function coreRecipe(Z, d, plus) {
  const key = `${Z}-${d}-${plus}`; if (CORE[key]) return CORE[key];
  const f = path.join(DIR, `core-${key}.json`); if (existsSync(f)) return (CORE[key] = JSON.parse(readFileSync(f, "utf8")));
  const full = basisFor(Z, d, plus), at = [{ Z, at: new Array(d).fill(0) }], sh = G.shellsFor(at[0], full).map((s) => ({ ...s, atom: 0 })), [na, nb] = SPIN[d][Z];
  const r = G.hartreeFock(at, sh, d, { nAlpha: na, nBeta: nb }), n = r.n, m = r.m, sExps = full.find(([l]) => l === 0)[1];
  // the 1s: the α orbital lowest in energy; its coefficients on the s primitives (the first shells, one function each)
  const c1s = sExps.map((_, i) => r.Ca[i * m + 0]), order = sExps.map((a, i) => [a, i]).sort((x, y) => x[0] - y[0]), free = new Set(order.slice(0, 5).map(([, i]) => i));
  const tight = sExps.map((a, i) => [a, i]).filter(([, i]) => !free.has(i));
  const rec = full.map(([l, exps]) => (l === 0 ? [0, [...sExps.filter((_, i) => free.has(i)), { exps: tight.map(([a]) => a), coefs: tight.map(([, i]) => c1s[i]) }]] : [l, exps]));
  writeFileSync(f, JSON.stringify(rec)); void n; return (CORE[key] = rec);
}
const shellsFrom = (atom, rec) => rec.flatMap(([l, list]) => list.map((e) => (typeof e === "number" ? { at: atom.at, l, exps: [e], coefs: [1] } : { at: atom.at, l, exps: e.exps, coefs: e.coefs })));
function shellsOf(atoms, d, plus, economy) { return atoms.flatMap((a, k) => (economy ? shellsFrom(a, coreRecipe(a.Z, d, plus)) : G.shellsFor(a, basisFor(a.Z, d, plus))).map((s) => ({ ...s, atom: k }))); }
/* a pair's interaction: Hartree–Fock and MP2, each molecule alone in the pair's whole basis (counterpoise) */
export function pairEnergy(A, B, d, plus, economy) {
  const all = [...A, ...B], sh = shellsOf(all, d, plus, economy), one = G.oneElectron(sh, all, d), ERI = G.twoElectron(sh, d, one.F, { f32: economy });
  const nA = A.reduce((t, a) => t + a.Z, 0) / 2, frozen = (at) => at.filter((a) => a.Z > 2).length;
  const run = (at, nel) => { const r = G.hartreeFock(at, sh, d, { nAlpha: nel, nBeta: nel, ints: { one: at === all ? one : G.oneElectron(sh, at, d), ERI } }); return { r, e2: G.mp2(r, ERI, { frozen: frozen(at) }).E2 }; };
  const ab = run(all, 2 * nA), a = run(A, nA), b = run(B, nA);
  return { hf: ab.r.E - a.r.E - b.r.E, mp2: ab.r.E + ab.e2 - a.r.E - a.e2 - b.r.E - b.e2, ok: ab.r.converged && a.r.converged && b.r.converged, n: one.n, it: Math.max(ab.r.iterations, a.r.iterations, b.r.iterations) };
}
/* placement k of molecule M: [A, B] */
export function placement(M, k) {
  let s = 7919 * (k + 1) + M.X; const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // k ≥ 200: the wall, for molecules that attract even at the first set's tight placements (all 81 PxGl₂ ones bound):
  // centres 2–0.5 bohr inside DMIN, atoms allowed to 3.6 bohr in 4D (3.0 in ours)
  const A = atomsOf(M), d = M.d, wall = k >= 200, tight = wall || k % 8 === 7, lo = wall ? M.DMIN - 2 : tight ? M.DMIN - 1.5 : M.DMIN, hi = wall ? M.DMIN + 0.5 : tight ? M.DMIN : M.DMAX, close = wall ? (d === 3 ? 3.0 : 3.6) : tight ? M.CLOSE - 0.5 : M.CLOSE;
  for (;;) {
    const R = randomRotation(d, rnd), g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-300)) * Math.cos(2 * Math.PI * rnd()), u = Array.from({ length: d }, g), un = Math.hypot(...u), D = lo + (hi - lo) * rnd();
    const B = A.map((a) => ({ Z: a.Z, at: Array.from({ length: d }, (_, i) => (D * u[i]) / un + R[i].reduce((t, r, j) => t + r * a.at[j], 0)) }));
    if (A.every((a) => B.every((b) => Math.hypot(...a.at.map((x, i) => x - b.at[i])) > close))) return [A, B];
  }
}
const MAIN = !!process.argv[1] && import.meta.url.endsWith("/" + path.basename(process.argv[1]));
if (!MAIN) {
  // imported (tools/molff.mjs): no command
} else if (cmd === "mono") {
  const M = MOLS[name], at = atomsOf(M);
  for (const economy of [false, true]) { const sh = shellsOf(at, M.d, M.plus, economy), one = G.oneElectron(sh, at, M.d), ERI = G.twoElectron(sh, M.d, one.F, { f32: economy }), ne = at.reduce((t, a) => t + a.Z, 0) / 2;
    const r = G.hartreeFock(at, sh, M.d, { nAlpha: ne, nBeta: ne, ints: { one, ERI } }), e2 = G.mp2(r, ERI, { frozen: 3 }).E2;
    console.log(`${name} ${economy ? "economy" : "full"}: ${one.n} functions, HF ${r.E.toFixed(6)}, MP2 ${(r.E + e2).toFixed(6)}, dipole ${Math.hypot(...r.dipole).toFixed(4)} au (${r.converged ? "converged" : "NOT converged"})`); }
} else if (cmd === "check") {
  const M = MOLS[name], ks = karg ? [+karg] : [0, 1, 7], out = [];
  for (const k of ks) { const [A, B] = placement(M, k), t0 = Date.now(), f = pairEnergy(A, B, M.d, M.plus, false), t1 = Date.now(), e = pairEnergy(A, B, M.d, M.plus, true), t2 = Date.now();
    out.push({ k, full: f, economy: e }); console.log(`${name} placement ${k}: full ${f.n} functions MP2 ${(f.mp2 * KCAL).toFixed(4)} kcal/mol (HF ${(f.hf * KCAL).toFixed(4)}), ${((t1 - t0) / 1000).toFixed(0)} s; economy ${e.n} functions MP2 ${(e.mp2 * KCAL).toFixed(4)} (HF ${(e.hf * KCAL).toFixed(4)}), ${((t2 - t1) / 1000).toFixed(0)} s; difference ${((e.mp2 - f.mp2) * KCAL).toFixed(4)} kcal/mol`); }
  writeFileSync(path.join(DIR, `check-${name}-${ks.join("_")}.json`), JSON.stringify(out));
} else if (cmd === "pair") {
  // --full: the census's whole basis in double precision (about 13 GB for PxGl₂: a machine with the memory, the economy's check)
  const M = MOLS[name], k = +karg, full = process.argv.includes("--full"), f = path.join(DIR, `${full ? "pairfull" : "pair"}-${name}-${k}.json`);
  if (!existsSync(f)) { const [A, B] = placement(M, k), t0 = Date.now(), e = pairEnergy(A, B, M.d, M.plus, !full); writeFileSync(f, JSON.stringify({ name, k, basis: full ? "full" : "economy", A: A.map((a) => a.at), B: B.map((b) => b.at), ...e, s: (Date.now() - t0) / 1000 })); }
  const r = JSON.parse(readFileSync(f, "utf8")); console.log(`${name} ${k}: MP2 ${(r.mp2 * KCAL).toFixed(3)} kcal/mol (${(r.mp2 * KELVIN).toFixed(0)} K), HF ${(r.hf * KCAL).toFixed(3)}, ${r.ok ? "converged" : "NOT converged"}, ${r.n} functions, ${r.s.toFixed(0)} s`);
} else if (cmd === "bake") {
  const out = {};
  for (const f of readdirSync(DIR).filter((f) => f.startsWith("pair-") || f.startsWith("pairfull-"))) { const r = JSON.parse(readFileSync(path.join(DIR, f), "utf8")); (out[r.name] ??= { points: [] }).points.push({ k: r.k, basis: r.basis ?? "economy", A: r.A, B: r.B, hf: r.hf, mp2: r.mp2, ok: r.ok }); }
  for (const f of readdirSync(DIR).filter((f) => f.startsWith("check-"))) { const r = JSON.parse(readFileSync(path.join(DIR, f), "utf8")), nm = f.split("-")[1]; (out[nm] ??= { points: [] }).checks = [...(out[nm].checks || []), ...r.map((c) => ({ k: c.k, full: c.full.mp2 * KCAL, economy: c.economy.mp2 * KCAL }))]; }
  for (const v of Object.values(out)) v.points.sort((a, b) => a.k - b.k);
  writeFileSync(path.join(here, "../js/molpairdata.js"), `/* Generated by tools/molpair.mjs bake; do not edit. Per molecule: each placement's two molecules (atom positions, bohr;
   heavy atom first) and their interaction (hartree; Hartree–Fock and MP2, counterpoise, the core-contracted basis in
   single precision), and the checks of that economy against the full basis in double (kcal/mol). */
export const MOLPAIR = ${JSON.stringify(out)};
`);
  for (const [k, v] of Object.entries(out)) console.log(`${k}: ${v.points.length} placements; checks ${(v.checks || []).map((c) => (c.economy - c.full).toFixed(3)).join(", ")} kcal/mol`);
} else console.error("usage: molpair.mjs mono <OF2|PxGl2> | check <OF2|PxGl2> [k] | pair <OF2|PxGl2> <k> | bake");
