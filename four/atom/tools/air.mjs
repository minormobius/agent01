/* The air: whether 4D hydrogen and helium are gases at a planet's temperature. Hartree–Fock plus MP2 (js/gauss.js) on
   the census's even-tempered bases grown with diffuse s and p, a second p and a d on hydrogen (tools/census.mjs basisFor
   "Dph"; "Dd" for helium), counterpoise-corrected (census.mjs pairEnergy), ours alongside as the check.
     node four/atom/tools/air.mjs mol                 the H₂ molecule in both worlds: bond length and binding (MP2)
     node four/atom/tools/air.mjs pair <He|H2> <d>    the pair's energy against distance; for H₂ four orientations
                                                      (parallel, crossed, T, end to end), the molecule at its own bond
     node four/atom/tools/air.mjs bake                → js/airdata.js
   A rod's axis lies along the line between two molecules with probability 1/d, so the rotation average weights end to
   end, T, parallel and crossed as (1, 4, 2, 2)/9 in 3D (the textbook's) and (1, 6, 3, 6)/16 in 4D. Cache
   $TMPDIR/atom4-air (a run of minutes per pair in the sandbox) */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import * as G from "../js/gauss.js";
import { basisFor, pairEnergy } from "./census.mjs";
const DIR = path.join(process.env.TMPDIR || os.tmpdir(), "atom4-air"); mkdirSync(DIR, { recursive: true });
const here = path.dirname(new URL(import.meta.url).pathname), [cmd, ...args] = process.argv.slice(2), EV = 27.211386, K = 315775.02;
const save = (f, o) => { writeFileSync(path.join(DIR, f), JSON.stringify(o)); console.log(`wrote ${f}`); }, load = (f) => (existsSync(path.join(DIR, f)) ? JSON.parse(readFileSync(path.join(DIR, f), "utf8")) : null);
const shellsOf = (atoms, d, plus) => atoms.flatMap((a, i) => G.shellsFor(a, basisFor(a.Z, d, plus)).map((s) => ({ ...s, atom: i })));
function energy(atoms, d, plus, nA, nB) { const sh = shellsOf(atoms, d, plus), one = G.oneElectron(sh, atoms, d), ERI = G.twoElectron(sh, d, one.F), r = G.hartreeFock(atoms, sh, d, { nAlpha: nA, nBeta: nB, ints: { one, ERI } }); const c = nA === nB ? G.mp2(r, ERI) : { E2: 0 }; return { hf: r.E, mp2: r.E + c.E2, n: one.n }; }
export const BOND = { 3: 1.4, 4: 3.0 };
if (cmd === "mol") {
  const out = {};
  for (const d of [3, 4]) { const plus = "Dph", z = Array(d).fill(0), H = energy([{ Z: 1, at: z }], d, plus, 1, 0).hf; let best = null;
    for (let R = d === 3 ? 0.8 : 1.6; R <= (d === 3 ? 2.4 : 6); R += d === 3 ? 0.05 : 0.1) { const e = energy([{ Z: 1, at: z }, { Z: 1, at: [R, ...z.slice(1)] }], d, plus, 1, 1); if (!best || e.mp2 < best.mp2) best = { R, ...e }; }
    out[d] = { H: H * EV, R: best.R, De: (2 * H - best.mp2) * EV, DeHF: (2 * H - best.hf) * EV, n: best.n };
    console.log(`d=${d}: H atom ${(H * EV).toFixed(3)} eV; H₂ ${best.R.toFixed(2)} bohr, bound by ${out[d].De.toFixed(2)} eV (MP2), ${out[d].DeHF.toFixed(2)} (HF)`); }
  save("mol.json", out);
} else if (cmd === "pair") {
  const sys = args[0], d = +args[1], plus = sys === "He" ? "Dd" : "Dph", z = (v) => [...v, ...Array(d - v.length).fill(0)], b = BOND[d] / 2;
  const geo = (R, o) => { if (sys === "He") return [[{ Z: 2, at: z([0]) }], [{ Z: 2, at: z([R]) }]];
    // centres R apart along x; H: both along y, X: along y and z, T: along y and x, L: both along x
    const A = o === "L" ? [[-b], [b]] : [[0, -b], [0, b]], B = { H: [[R, -b], [R, b]], X: [[R, 0, -b], [R, 0, b]], T: [[R - b], [R + b]], L: [[R - b], [R + b]] }[o];
    return [A.map((p) => ({ Z: 1, at: z(p) })), B.map((p) => ({ Z: 1, at: z(p) }))]; };
  const Rs = sys === "He" ? (d === 3 ? [4.5, 5, 5.5, 6, 6.5, 7, 8] : [4, 4.5, 5, 5.5, 6, 6.5, 7, 8, 9]) : (d === 3 ? [5, 5.5, 6, 6.5, 7, 7.5, 8, 9] : [5, 5.5, 6, 6.5, 7, 7.5, 8, 9, 10, 11]);
  const ors = sys === "He" ? ["-"] : ["H", "X", "T", "L"], rows = [];
  for (const R of Rs) { const row = { R }; for (const o of ors) { const [A, B] = geo(R, o), e = pairEnergy(A, B, d, { mp2: true, plus }); row[o] = { hf: e.E * K, mp2: (e.E + e.E2) * K }; } rows.push(row);
    console.log(`${sys} d=${d} R=${R}: ${ors.map((o) => `${o} ${row[o].mp2.toFixed(1)} K`).join(", ")}`); }
  save(`pair-${sys}-${d}.json`, { sys, d, plus, rows });
} else if (cmd === "bake") {
  const W = { 3: { L: 1, T: 4, H: 2, X: 2 }, 4: { L: 1, T: 6, H: 3, X: 6 } }, out = { mol: load("mol.json"), pairs: [] };
  for (const sys of ["He", "H2"]) for (const d of [3, 4]) { const p = load(`pair-${sys}-${d}.json`); if (!p) continue;
    const curve = p.rows.map((r) => ({ R: r.R, hf: sys === "He" ? r["-"].hf : Object.entries(W[d]).reduce((s, [o, w]) => s + w * r[o].hf, 0) / Object.values(W[d]).reduce((a, b) => a + b, 0), mp2: sys === "He" ? r["-"].mp2 : Object.entries(W[d]).reduce((s, [o, w]) => s + w * r[o].mp2, 0) / Object.values(W[d]).reduce((a, b) => a + b, 0) }));
    // the well: a parabola through the lowest point and its neighbours
    const i = curve.reduce((k, c, j) => (c.mp2 < curve[k].mp2 ? j : k), 0), [a, m, c] = [curve[Math.max(0, i - 1)], curve[i], curve[Math.min(curve.length - 1, i + 1)]];
    let R0 = m.R, E0 = m.mp2; if (a !== m && c !== m) { const h1 = m.R - a.R, h2 = c.R - m.R, d1 = (m.mp2 - a.mp2) / h1, d2 = (c.mp2 - m.mp2) / h2, cc = (d2 - d1) / ((h1 + h2) / 2); if (cc > 0) { const bb = (d1 + d2) / 2 - cc * ((h2 - h1) / 2) / 2; R0 = m.R - (d1 * h2 + d2 * h1) / (h1 + h2) / cc; E0 = m.mp2 - ((d1 * h2 + d2 * h1) / (h1 + h2)) ** 2 / (2 * cc); } }
    out.pairs.push({ sys, d, curve, well: -E0, R0, raw: p.rows }); }
  writeFileSync(path.join(here, "../js/airdata.js"), `// generated by four/atom/tools/air.mjs bake — the H₂ molecule and the He and H₂ pairs (MP2), ours and 4D\nexport const AIR = ${JSON.stringify(out)};\n`);
  console.log(out.pairs.map((p) => `${p.sys} d=${p.d}: well ${p.well.toFixed(1)} K at ${p.R0.toFixed(2)} bohr`).join("; "));
} else console.log("commands: mol | pair <He|H2> <d> | bake");
