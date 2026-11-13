/* The mass model's check on ours, and the one 4D mass it can't settle (masses-1; paper 2 figure 1's methods).
   Ours (d = 3, s = 1) against measured binding energies (AME2020, IAEA AMDC mass_1.mas20; all 30 checked to 2 keV, 2026-11-13):
     · α clusters: k + 1 helium-4s against k + 1 free ones, by the ladder (Monte Carlo on the pair potential, MN-ladder-3-1-k)
       and by Brink's grid (a helium-4 on k fixed-draw helium-4s, plusmore-3-1-k-a-12)
     · every computed separation on core k = 2–5 (n, p, nn, np, t, h, a) under the two consistent models: the grid's own
       (unscaled) and the ladder-anchored one (scaled by r_k = S₄(ladder)/S₄(grid)); the median relative error of each
     · ¹¹B + p → 3α (the triton-like cluster on ⁸Be, the 4D ceryllium cycle's analogue): each model's Q against 8.59 MeV,
       and so the 4D 5-11 + p → ⁴He + ceryllium-8 Q at each strength, raw and with ours' error at that core taken off
   Writes papers/p2/data/masscheck.json.     node four/fusion/tools/masscheck.mjs       (seconds; needs the cache) */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { table } from "./nuc4.mjs";

const DIR = `${process.env.TMPDIR ?? "/tmp"}/atom4-nuclei`, load = (f) => (existsSync(`${DIR}/${f}`) ? JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")) : null);
const AME = { "2-4": 28.296, "4-8": 56.5, "6-12": 92.162, "8-16": 127.619, "10-20": 160.645, "12-24": 198.257,
  "4-9": 58.165, "5-9": 56.314, "6-13": 97.108, "7-13": 94.105, "8-17": 131.763, "9-17": 128.22, "10-21": 167.406, "11-21": 163.076,
  "4-10": 64.977, "5-10": 64.751, "5-11": 76.205, "6-11": 73.441, "6-14": 105.285, "7-14": 104.659, "7-15": 115.492, "8-15": 111.956,
  "8-18": 139.807, "9-18": 137.369, "9-19": 147.801, "10-19": 143.781, "10-22": 177.77, "11-22": 174.145, "11-23": 186.564, "12-23": 181.725 };
const Ba = -(load("MN-he-3-1-none-4.json")?.E ?? NaN), lad = (k) => (k === 1 ? 0 : load(`MN-ladder-3-1-${k}.json`)?.E);
const fileOf = (k, c) => (c === "n" || c === "p" ? `plusone-3-1-${k}-${c === "p" ? 1 : 0}-12.json` : `plusmore-3-1-${k}-${c}-12.json`);
const SP = { n: [0, 1], p: [1, 0], nn: [0, 2], np: [1, 1], t: [1, 2], h: [2, 1], a: [2, 2] };
// α clusters against free helium-4s
const BaG = -load(fileOf(1, "a")).Ec, clusters = [];
for (let k = 1; k <= 5; k++) { const m = load(fileOf(k, "a")), A = 4 * (k + 1), key = `${2 * (k + 1)}-${A}`;
  clusters.push({ k: k + 1, nucleus: key, real: +(-(AME[key] - (k + 1) * AME["2-4"])).toFixed(3), ladder: lad(k + 1) != null ? +lad(k + 1).toFixed(3) : null, grid: m ? +(m.E + (k + 1) * BaG).toFixed(3) : null }); }
// separations on k = 2–5 under each model
const seps = [], errG = [], errL = [];
for (let k = 2; k <= 5; k++) { const a = load(fileOf(k, "a")), r = (Ba + lad(k) - lad(k + 1)) / a.S;
  for (const [c, [z, n]] of Object.entries(SP)) { const m = load(fileOf(k, c)), key = `${2 * k + z}-${4 * k + z + n}`, core = AME[`${2 * k}-${4 * k}`];
    if (!m || AME[key] == null) continue; const real = AME[key] - core, G = m.S, L = c === "a" ? Ba + lad(k) - lad(k + 1) : r * m.S;
    seps.push({ k, c, real: +real.toFixed(3), grid: +G.toFixed(3), ladder: +L.toFixed(3), r: +r.toFixed(4) });
    if (c !== "a") { errG.push((G - real) / real); errL.push((L - real) / real); } } }
const med = (e) => { const x = e.map(Math.abs).sort((p, q) => p - q); return x[x.length >> 1]; };
// ¹¹B + p → 3α: Q = B_α − S_t(on ⁸Be); the grid's in its own basis, the ladder model's with the Monte Carlo B_α
const St = seps.find((x) => x.k === 2 && x.c === "t"), Q11 = { real: AME["2-4"] - St.real, grid: BaG - St.grid, ladder: Ba - St.ladder };
const offset = Q11.ladder - Q11.real; // how far the ladder model overstates that Q
const four = [1.5152, 1.55, 1.6, 1.65, 1.7, 1.75, 1.8, 1.85].map((s) => { const L = table(s, { mass: "ladder" }), G = table(s, { mass: "grid" }), q = (T) => T.Ba + T.B(4, 4) - T.B(5, 6);
  return { s, ladder: +q(L).toFixed(2), grid: +q(G).toFixed(2), ladderLessOffset: +(q(L) - offset).toFixed(2) }; });
const out = { about: "tools/masscheck.mjs: the mass model on ours against AME2020 and the 4D ceryllium-cycle Q it can't settle", BaMC: +Ba.toFixed(3), BaGrid: +BaG.toFixed(3), clusters, separations: seps,
  medianError: { grid: +med(errG).toFixed(3), ladder: +med(errL).toFixed(3), n: errG.length }, q11B: Object.fromEntries(Object.entries(Q11).map(([k, v]) => [k, +v.toFixed(3)])), offset: +offset.toFixed(3), cycleQ4D: four };
writeFileSync(new URL("../../papers/p2/data/masscheck.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ clusters, medianError: out.medianError, q11B: out.q11B, offset: out.offset, cycleQ4D: four }, null, 1));
