/* Molecules without hydrogen: a heavy atom's diatomic, bond length and strength by Hartree–Fock and MP2 (unrestricted
   where it has unpaired electrons, js/gauss.js ump2), our F₂ and O₂ as the checks.
     node four/atom/tools/diatomic.mjs mol <F2|O2|Gl2|Px2> [plus] [--spins=2S,…]   the curve over R, the atoms, the bond
     node four/atom/tools/diatomic.mjs pair <F2|Gl2> <R> <H|X|T|L>   two molecules R apart, MP2, counterpoise (one point)
     node four/atom/tools/diatomic.mjs bake                          → js/diatomicdata.js
   4D's p shell holds 8 (2(l+1)²), so gluorine (element 11) lacks one electron, like fluorine, and pxygen (element 10)
   two, like oxygen. Gl₂ fills σ²π⁶π*⁶ (three π, not two): a single bond, closed-shell. Px₂ puts four electrons in the
   three π*: a double bond with two unpaired, a triplet as O₂ is (the singlet is computed too, and the lower kept).
   The molecule is started three ways (bare nuclei; the atoms' densities, spins parallel or antiparallel), and a fourth
   from the previous point's solution as the curve is walked inward from the separated atoms; the lowest Hartree–Fock
   energy is kept, so a stretched bond pulls apart into two atoms. The bond is counterpoise-corrected: each atom computed in the whole molecule's basis at that R. The basis is the
   census's recipe (tools/census.mjs basisFor) with `plus` (default "d": a second d). Cache $TMPDIR/atom4-diatomic */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import * as G from "../js/gauss.js";
import { basisFor, pairEnergy } from "./census.mjs";

const DIR = path.join(process.env.TMPDIR || os.tmpdir(), "atom4-diatomic"); mkdirSync(DIR, { recursive: true });
const here = path.dirname(new URL(import.meta.url).pathname), [cmd, name, plusArg] = process.argv.slice(2), EV = 27.211386;
/* per molecule: dimension, element, the atom's spins (α, β), the molecule's spin states (2S), the R grid (bohr), cores frozen */
export const MOLS = {
  F2: { d: 3, Z: 9, atom: [5, 4], spins: [0], R: [2.3, 2.45, 2.6, 2.75, 2.9, 3.1, 3.4, 5], frozen: 1, measured: { R: 2.668, De: 1.66 } },
  O2: { d: 3, Z: 8, atom: [5, 3], spins: [2, 4], R: [2.0, 2.1, 2.2, 2.3, 2.45, 2.6, 2.8, 5], frozen: 1, measured: { R: 2.282, De: 5.21 } },
  Gl2: { d: 4, Z: 11, atom: [6, 5], spins: [0], R: [2.6, 2.9, 3.05, 3.2, 3.35, 3.5, 3.8, 4.2, 4.8, 6], frozen: 1 },
  Px2: { d: 4, Z: 10, atom: [6, 4], spins: [2, 0, 4], R: [1.9, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 3.0, 3.3, 3.6, 4.0, 4.6, 6, 9], frozen: 1 },
};
function point(M, R, plus, spin, prev = null) {
  const z = Array(M.d).fill(0), A = { Z: M.Z, at: z }, B = { Z: M.Z, at: [R, ...z.slice(1)] }, atoms = [A, B];
  const sh = atoms.flatMap((a, k) => G.shellsFor(a, basisFor(M.Z, M.d, plus)).map((s) => ({ ...s, atom: k }))), one = G.oneElectron(sh, atoms, M.d), ERI = G.twoElectron(sh, M.d, one.F);
  // each atom in the whole basis (counterpoise): its nucleus alone, the other's functions as ghosts. The molecule is
  // started three ways and the lowest Hartree–Fock energy kept: from the bare nuclei, and from the two atoms' densities
  // with spins parallel or antiparallel. Any one start can land on the wrong state: from the bare nuclei Px₂ fell into the
  // ion pair Px⁺Px⁻ (6 eV above two atoms at 12 bohr), and from antiparallel atoms F₂ near its bond into a state 10 eV up
  const at = G.hartreeFock([A], sh, M.d, { nAlpha: M.atom[0], nBeta: M.atom[1], ints: { one: G.oneElectron(sh, [A], M.d), ERI } }), ca = G.ump2(at, ERI, { frozen: M.frozen });
  const atB = G.hartreeFock([B], sh, M.d, { nAlpha: M.atom[0], nBeta: M.atom[1], ints: { one: G.oneElectron(sh, [B], M.d), ERI } });
  const both = (anti) => ({ Pa: Float64Array.from(at.Pa, (v, k) => v + (anti ? atB.Pb[k] : atB.Pa[k])), Pb: Float64Array.from(at.Pb, (v, k) => v + (anti ? atB.Pa[k] : atB.Pb[k])) });
  const ne = 2 * M.Z, na = (ne + spin) / 2, nb = (ne - spin) / 2, tries = [["bare", null], ["parallel", both(false)], ["antiparallel", both(true)], ...(prev ? [["previous R", prev]] : [])].map(([how, guess]) => ({ how, r: G.hartreeFock(atoms, sh, M.d, { nAlpha: na, nBeta: nb, ints: { one, ERI }, guess }) }));
  const best = tries.filter((t) => t.r.converged).sort((a, b) => a.r.E - b.r.E)[0] ?? tries[0], mol = best.r, cm = G.ump2(mol, ERI, { frozen: 2 * M.frozen });
  return { R, spin, n: one.n, hf: mol.E, mp2: mol.E + cm.E2, atomHF: at.E, atomMP2: at.E + ca.E2, ok: mol.converged && at.converged, it: [mol.iterations, at.iterations], P: { Pa: mol.Pa, Pb: mol.Pb }, start: best.how, starts: tries.map((t) => ({ how: t.how, E: t.r.E, ok: t.r.converged })),
    DeHF: (2 * at.E - mol.E) * EV, De: (2 * (at.E + ca.E2) - (mol.E + cm.E2)) * EV };
}
/* the minimum of a curve by a parabola through the lowest point and its neighbours */
function minimum(rows, key) { const k = rows.reduce((b, r, i) => (r[key] < rows[b][key] ? i : b), 0); if (k === 0 || k === rows.length - 1) return { R: rows[k].R, at: "edge" };
  const [a, b, c] = [rows[k - 1], rows[k], rows[k + 1]], den = (a.R - b.R) * (a.R - c.R) * (b.R - c.R), A = (c.R * (b[key] - a[key]) + b.R * (a[key] - c[key]) + a.R * (c[key] - b[key])) / den, B = (c.R ** 2 * (a[key] - b[key]) + b.R ** 2 * (c[key] - a[key]) + a.R ** 2 * (b[key] - c[key])) / den;
  return { R: -B / (2 * A) }; }
if (cmd === "mol") {
  const M0 = MOLS[name], sp = process.argv.find((a) => a.startsWith("--spins=")), M = sp ? { ...M0, spins: sp.slice(8).split(",").map(Number) } : M0, plus = plusArg && !plusArg.startsWith("--") ? plusArg : "d"; if (!M0) throw new Error(`no molecule ${name}`);
  const file = path.join(DIR, `${name}_${plus}.json`), st = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { name, plus, d: M.d, Z: M.Z, rows: [] };
  // each spin state's curve is walked from the separated atoms inward, every point also started from the last one's
  // solution (continuation), so a state found where the atoms are apart is followed in
  for (const spin of M.spins) { let prev = null; for (const R of [...M.R].sort((a, b) => b - a)) {
    if (st.rows.some((r) => r.R === R && r.spin === spin)) continue; const t0 = Date.now(), { P, ...r } = point(M, R, plus, spin, prev); prev = P; st.rows.push(r); writeFileSync(file, JSON.stringify(st));
    console.log(`${name} 2S=${spin} R=${R}: HF bond ${r.DeHF.toFixed(3)} eV, MP2 ${r.De.toFixed(3)} eV (${r.n} functions, ${r.ok ? "converged" : "NOT converged"} in ${r.it.join("/")}, from ${r.start}, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  } }
  for (const spin of M.spins) { const rows = st.rows.filter((r) => r.spin === spin).sort((a, b) => a.R - b.R), m = minimum(rows.map((r) => ({ R: r.R, e: -r.De })), "e"), mh = minimum(rows.map((r) => ({ R: r.R, e: -r.DeHF })), "e");
    console.log(`${name} 2S=${spin}: MP2 minimum ${m.at ? "at the grid's edge " : ""}${m.R.toFixed(3)} bohr, bound by ${Math.max(...rows.map((r) => r.De)).toFixed(3)} eV; Hartree–Fock ${mh.at ? "at the edge " : ""}${mh.R.toFixed(3)} bohr, ${Math.max(...rows.map((r) => r.DeHF)).toFixed(3)} eV${M.measured ? `; measured ${M.measured.R} bohr, ${M.measured.De} eV` : ""}`); }
} else if (cmd === "pair") {
  /* two molecules at their MP2 bond length, centres R apart along x: H both along y, X along y and z, T along y and x,
     L both along x (as tools/air.mjs's H₂ pairs); MP2 with the census's pair energy (counterpoise), basis "Dd"
     (diffuse s and p, a second d) for the pull between them. In K, as the air chapter's. One point a command */
  const M = MOLS[name], R = +process.argv[4], o = process.argv[5], b = { F2: 2.704, Gl2: 3.111 }[name] / 2, d = M.d, z = (v) => [...v, ...Array(d - v.length).fill(0)];
  const A = o === "L" ? [[-b], [b]] : [[0, -b], [0, b]], B = { H: [[R, -b], [R, b]], X: [[R, 0, -b], [R, 0, b]], T: [[R - b], [R + b]], L: [[R - b], [R + b]] }[o];
  const file = path.join(DIR, `pair-${name}-${R}-${o}.json`);
  if (!existsSync(file)) { const t0 = Date.now(), e = pairEnergy(A.map((p) => ({ Z: M.Z, at: z(p) })), B.map((p) => ({ Z: M.Z, at: z(p) })), d, { mp2: true, plus: "Dd" });
    writeFileSync(file, JSON.stringify({ name, d, R, o, hf: e.E * 315775.02, mp2: (e.E + e.E2) * 315775.02, ok: e.ok, n: e.n, s: (Date.now() - t0) / 1000 })); }
  console.log(readFileSync(file, "utf8"));
} else if (cmd === "bake") {
  const out = {};
  for (const f of readdirSync(DIR).filter((f) => /^(F2|O2|Gl2|Px2)_.*\.json$/.test(f))) { const st = JSON.parse(readFileSync(path.join(DIR, f), "utf8")), M = MOLS[st.name];
    for (const spin of [...new Set(st.rows.map((r) => r.spin))]) { const rows = st.rows.filter((r) => r.spin === spin).sort((a, b) => a.R - b.R);
      (out[st.name] ??= { d: st.d, Z: st.Z, measured: M.measured ?? null, states: [] }).states.push({ plus: st.plus, spin, curve: rows.map((r) => ({ R: r.R, De: +r.De.toFixed(4), DeHF: +r.DeHF.toFixed(4), ok: r.ok })), R: +minimum(rows.map((r) => ({ R: r.R, e: -r.De })), "e").R.toFixed(3), De: +Math.max(...rows.map((r) => r.De)).toFixed(3), RHF: +minimum(rows.map((r) => ({ R: r.R, e: -r.DeHF })), "e").R.toFixed(3), DeHF: +Math.max(...rows.map((r) => r.DeHF)).toFixed(3), jumps: rows.slice(1).map((r, i) => [rows[i], r]).filter(([a, b]) => Math.abs(b.De - a.De) / (b.R - a.R) > 10).map(([a, b]) => [a.R, b.R]) }); } }
  // the pair curves: each orientation, and the rotation average weighted (L, T, H, X) = (1, 4, 2, 2)/9 in 3D, (1, 6, 3, 6)/16
  // in 4D by how a rod lies (tools/air.mjs); the well by a parabola through the lowest point and its neighbours
  const W = { 3: { L: 1, T: 4, H: 2, X: 2 }, 4: { L: 1, T: 6, H: 3, X: 6 } };
  for (const nm of ["F2", "Gl2"]) { const pts = readdirSync(DIR).filter((f) => f.startsWith(`pair-${nm}-`)).map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8"))), d = MOLS[nm].d;
    const Rs = [...new Set(pts.map((p) => p.R))].sort((a, b) => a - b).filter((R) => "LTHX".split("").every((o) => pts.some((p) => p.R === R && p.o === o)));
    if (Rs.length < 3) continue; const wsum = Object.values(W[d]).reduce((a, b) => a + b, 0);
    const curve = Rs.map((R) => { const at = (o) => pts.find((p) => p.R === R && p.o === o); return { R, mp2: Object.entries(W[d]).reduce((t, [o, w]) => t + w * at(o).mp2, 0) / wsum, hf: Object.entries(W[d]).reduce((t, [o, w]) => t + w * at(o).hf, 0) / wsum, by: Object.fromEntries("LTHX".split("").map((o) => [o, +at(o).mp2.toFixed(2)])) }; });
    const k = curve.reduce((b, c, i) => (c.mp2 < curve[b].mp2 ? i : b), 0), m = k > 0 && k < curve.length - 1 ? minimum(curve.map((c) => ({ R: c.R, e: c.mp2 })), "e").R : curve[k].R;
    const inner = pts.filter((p) => !Rs.includes(p.R)).map((p) => ({ R: p.R, o: p.o, mp2: +p.mp2.toFixed(1), hf: +p.hf.toFixed(1) })).sort((a, b) => a.R - b.R || a.o.localeCompare(b.o));
    (out[nm] ??= { d, Z: MOLS[nm].Z, states: [] }).pair = { inner, curve: curve.map((c) => ({ R: c.R, mp2: +c.mp2.toFixed(2), hf: +c.hf.toFixed(2), by: c.by })), wellK: +(-Math.min(...curve.map((c) => c.mp2))).toFixed(1), R0: +m.toFixed(2), deepestOrientation: Object.entries(curve[k].by).sort((a, b) => a[1] - b[1])[0] }; }
  // what was baked before and whose caches aren't here (a sandbox since reclaimed) is kept, not dropped
  try { const old = Object.values(await import("../js/diatomicdata.js")).find((v) => v && typeof v === "object") || {};
    for (const [nm, v] of Object.entries(old)) { if (!out[nm]) { out[nm] = v; continue; } if (!out[nm].states.length && v.states?.length) out[nm] = { ...v, ...out[nm], states: v.states, ...(v.measured !== undefined ? { measured: v.measured } : {}) }; if (!out[nm].pair && v.pair) out[nm].pair = v.pair; } } catch { /* none yet */ }
  writeFileSync(path.join(here, "../js/diatomicdata.js"), `/* Generated by tools/diatomic.mjs bake; do not edit. Per molecule: dimension, element, measured bond (ours), and per
   basis and spin state (2S) the counterpoise-corrected bond energy against R (eV; MP2 and Hartree–Fock), the minimum
   R (bohr) and the bond energy at it; for F₂ and Gl₂ the pair curve (K, MP2, counterpoise) by orientation and rotation-averaged,
   its well depth and distance; and where the MP2 curve jumps (more than 10 eV a bohr between neighbouring points: the Hartree–Fock solution changed
   state; outside the well, as Gl₂'s does where the stretched bond turns broken-symmetry, harmless; inside it, as Px₂'s
   does, the curve isn't a bond). */
export const DIATOMIC = ${JSON.stringify(out)};
`);
  console.log(JSON.stringify(out, (k, v) => (k === "curve" ? undefined : v)));
} else console.error("usage: diatomic.mjs mol <F2|O2|Gl2|Px2> [plus] | bake");
