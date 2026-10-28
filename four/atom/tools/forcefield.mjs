/* Bakes js/ffdata.js: Hartree–Fock interaction energies of two rigid molecules at many relative placements, the data a
   molecular-dynamics force field is fitted to. For our water (3D, the calibration) and Xater (4D), each at its census
   shape (js/census.js), by the census's pair energy (tools/census.mjs: the same basis rule, counterpoise-corrected).
     node four/atom/tools/forcefield.mjs        # writes js/ffdata.js (half an hour or so; jobs cached in the temp dir)
   The placements: random turns of the second molecule at random directions and distances (heavy atoms DMIN to DMAX
   apart, no two atoms closer than CLOSE), seeded so each point is reproducible from its index, a scan along the
   census's optimized hydrogen bond, and a set packed tighter so the fit sees the repulsion. */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { CENSUS } from "../js/census.js";
import { hydrideAtoms, dimerAtoms, pairEnergy } from "./census.mjs";
import { randomRotation } from "../js/md.js";

/* each molecule by a key: "3" our water, "4" Xater, "4.9" element 9's XH₃ (bmmonia, Xater's rival in the census chapter),
   "3.9" our HF and "3.7" our ammonia */
export const WORLDS = { 3: { d: 3, Z: 8, DMIN: 4.6, DMAX: 9, CLOSE: 2.7 }, 4: { d: 4, Z: 10, DMIN: 5.2, DMAX: 11, CLOSE: 3.0 }, 4.9: { d: 4, Z: 9, DMIN: 5.2, DMAX: 11, CLOSE: 3.0 },
  // our HF and ammonia, for the audit's known answers (tools/audit.mjs known): published pairs to check the pipeline on
  3.9: { d: 3, Z: 9, DMIN: 4.4, DMAX: 9, CLOSE: 2.7 }, 3.7: { d: 3, Z: 7, DMIN: 5.0, DMAX: 10, CLOSE: 2.8 } };
export const RANDOM = 56, SCAN = [-0.8, -0.4, 0, 0.5, 1.2, 2.2, 3.5], CLOSE = 16; // CLOSE more placements, packed tighter (DMIN − 1.4 … DMIN, atoms 0.4 closer), so the repulsion is seen
export const monoOf = (key) => CENSUS[WORLDS[key].d].find((m) => m.Z === WORLDS[key].Z);
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/* the k-th placement of molecule key: [A, B] as atom lists */
export function placement(key, k) {
  const w = WORLDS[key], d = w.d, m = monoOf(key), A = hydrideAtoms(m.Z, d, m.R, m.param);
  if (k >= RANDOM && k < RANDOM + SCAN.length) return dimerAtoms(m, d, m.dimer.RXX + SCAN[k - RANDOM], m.dimer.beta);
  const rnd = rng(({ 4.9: 9000, 3.9: 3900, 3.7: 3700 }[key] ?? 1000 * d) + k), tight = k >= RANDOM + SCAN.length, lo = tight ? w.DMIN - 1.4 : w.DMIN, hi = tight ? w.DMIN : w.DMAX, close = tight ? w.CLOSE - 0.4 : w.CLOSE;
  for (;;) {
    const R = randomRotation(d, rnd), g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-300)) * Math.cos(2 * Math.PI * rnd()), u = Array.from({ length: d }, g), un = Math.hypot(...u), D = lo + (hi - lo) * rnd();
    const B = A.map((a) => ({ Z: a.Z, at: Array.from({ length: d }, (_, i) => (D * u[i]) / un + R[i].reduce((s, r, j) => s + r * a.at[j], 0)) }));
    if (A.every((a) => B.every((b) => Math.hypot(...a.at.map((x, i) => x - b.at[i])) > close))) return [A, B];
  }
}
export const count = () => RANDOM + SCAN.length + CLOSE;

const CACHE = path.join(tmpdir(), "atom4-ff");
function run(key, k) {
  const file = path.join(CACHE, `${key}_${k}.json`);
  if (existsSync(file)) return Promise.resolve(JSON.parse(readFileSync(file, "utf8")));
  return new Promise((ok, fail) => {
    const p = spawn(process.execPath, ["--max-old-space-size=6000", fileURLToPath(import.meta.url), "point", key, k]); let out = "";
    p.stdout.on("data", (b) => (out += b)); p.stderr.on("data", (b) => process.stderr.write(b));
    p.on("close", (c) => { if (c) return fail(new Error(`point ${key} ${k} exited ${c}`)); const r = JSON.parse(out.trim().split("\n").pop()); mkdirSync(CACHE, { recursive: true }); writeFileSync(file, JSON.stringify(r)); ok(r); });
  });
}
async function pool(tasks, k = 4) { const out = new Array(tasks.length); let next = 0; await Promise.all(Array.from({ length: k }, async () => { while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); } })); return out; }

/* refinement: run the liquid with the current force field (js/forcefields.js; the live view's drop, js/liquid.js),
   take the closest pairs it visits (at 300 and 900 K), and add their Hartree–Fock energies to the data. A fit to
   isolated pairs never sees how tightly a liquid packs; this shows it, round by round */
export const HARVEST = 16;
export async function harvest(d, round) {
  const { drop } = await import("../js/liquid.js"), K = 3.166811563e-6, fs = 41.341374, picks = [];
  for (const TK of [300, 900]) {
    const sys = drop(d, d === 3 ? 64 : 81, TK * K); for (let s = 0; s < 800; s++) sys.step(2 * fs, TK * K, 200 * fs);
    const ps = []; for (let a = 0; a < sys.N; a++) for (let b = a + 1; b < sys.N; b++) ps.push([Math.hypot(...sys.sep(3 * a, 3 * b)), a, b]);
    ps.sort((x, y) => x[0] - y[0]);
    const at = (i) => Array.from({ length: d }, (_, k) => sys.x[i * d + k]);
    for (let i = 0; i < HARVEST / 2; i++) { const [, a, b] = ps[i * 2], off = sys.sep(3 * b, 3 * a); picks.push([[0, 1, 2].map((s) => at(3 * a + s)), [0, 1, 2].map((s) => at(3 * b + s).map((v, k) => v - at(3 * b)[k] + at(3 * a)[k] + off[k]))]); }
  }
  return picks.map(([A, B]) => [A.map((at, i) => ({ Z: i ? 1 : WORLDS[d].Z, at })), B.map((at, i) => ({ Z: i ? 1 : WORLDS[d].Z, at }))]);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv[0] === "hpoint") { const [A, B] = JSON.parse(readFileSync(argv[1], "utf8"))[+argv[2]], e = pairEnergy(A, B, +argv[3]); console.log(JSON.stringify({ d: +argv[3], A: A.map((a) => a.at.map((x) => +x.toFixed(6))), B: B.map((b) => b.at.map((x) => +x.toFixed(6))), E: +e.E.toFixed(8), ok: e.ok })); }
  else if (argv[0] === "refine") { // node tools/forcefield.mjs refine <round>: harvest both worlds, add their energies to js/ffdata.js
    const round = +argv[1], { FFDATA } = await import("../js/ffdata.js");
    for (const d of [3, 4]) {
      FFDATA[d].d = d;
      const file = path.join(CACHE, `harvest_${d}_${round}.json`); mkdirSync(CACHE, { recursive: true });
      if (!existsSync(file)) writeFileSync(file, JSON.stringify(await harvest(d, round)));
      const n = JSON.parse(readFileSync(file, "utf8")).length;
      const pts = await pool(Array.from({ length: n }, (_, i) => () => {
        const cf = path.join(CACHE, `h_${d}_${round}_${i}.json`); if (existsSync(cf)) return JSON.parse(readFileSync(cf, "utf8"));
        return new Promise((ok, fail) => { const p = spawn(process.execPath, ["--max-old-space-size=6000", fileURLToPath(import.meta.url), "hpoint", file, i, d]); let out = ""; p.stdout.on("data", (b) => (out += b)); p.stderr.on("data", (b) => process.stderr.write(b)); p.on("close", (c) => { if (c) return fail(new Error("hpoint " + i)); const r = JSON.parse(out.trim().split("\n").pop()); writeFileSync(cf, JSON.stringify(r)); ok(r); }); });
      }));
      FFDATA[d].points = FFDATA[d].points.filter((p) => Math.floor(p.k / 1000) !== round).concat(pts.map((p, i) => ({ k: 1000 * round + i, A: p.A, B: p.B, E: p.E, ok: p.ok })));
      console.log(`${d}D round ${round}: ${pts.map((p) => (p.E * 627.5).toFixed(1)).join(" ")} kcal/mol`);
    }
    writeFileSync(new URL("../js/ffdata.js", import.meta.url), `/* Generated by tools/forcefield.mjs (Hartree–Fock pair energies, counterpoise-corrected, the census's basis rule);
   do not edit. Per world: the molecule's heavy atom Z and its shape (R, param), and for each placement k both
   molecules' atoms A and B (heavy atom first) and their interaction energy E (hartree). k ≥ 1000·r: pairs harvested
   from the liquid in refinement round r. */
export const FFDATA = ${JSON.stringify(FFDATA)};
`);
  }
  else if (argv[0] === "point") { const key = argv[1], d = WORLDS[key].d, k = +argv[2], [A, B] = placement(key, k), e = pairEnergy(A, B, d); console.log(JSON.stringify({ d, key, k, A: A.map((a) => a.at.map((x) => +x.toFixed(6))), B: B.map((b) => b.at.map((x) => +x.toFixed(6))), E: +e.E.toFixed(8), ok: e.ok })); }
  else {
    const keys = argv.length ? argv : Object.keys(WORLDS), t0 = Date.now(), jobs = keys.flatMap((key) => Array.from({ length: count() }, (_, k) => ({ key, k }))); let done = 0;
    const pts = await pool(jobs.map(({ key, k }) => () => run(key, k).then((r) => { if (++done % 10 === 0) console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s ${done}/${jobs.length}`); return r; })));
    // keep what's already baked for the keys not run now
    const old = existsSync(new URL("../js/ffdata.js", import.meta.url)) ? (await import("../js/ffdata.js")).FFDATA : {};
    const FF = { ...old, ...Object.fromEntries(keys.map((key) => { const m = monoOf(key); return [key, { d: WORLDS[key].d, Z: m.Z, R: m.R, param: m.param, points: [...((old[key] || {}).points || []).filter((p) => p.k >= 1000), ...pts.filter((p) => (p.key ?? String(p.d)) === key).map(({ k, A, B, E, ok }) => ({ k, A, B, E, ok }))] }]; })) };
    writeFileSync(new URL("../js/ffdata.js", import.meta.url), `/* Generated by tools/forcefield.mjs (Hartree–Fock pair energies, counterpoise-corrected, the census's basis rule);
   do not edit. Per world: the molecule's heavy atom Z and its shape (R, param), and for each placement k both
   molecules' atoms A and B (heavy atom first) and their interaction energy E (hartree). */
export const FFDATA = ${JSON.stringify(FF)};
`);
    console.log("wrote js/ffdata.js");
  }
}
