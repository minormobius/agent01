/* The full search for two molecules' best arrangement. Chapter 10's census optimized each hydrogen-bonded pair over
   two numbers (distance and one tilt) in one family of arrangements; a liquid run found Xater pairs bound more
   strongly than that "optimum". Here every relative pose is open: the second molecule turned by exp(Ω) (Ω
   antisymmetric: 3 numbers in 3D, 6 in 4D) and moved by t (d numbers).
     node games/atom4/tools/pairsearch.mjs <key> [rounds]   # key as in tools/forcefield.mjs: 3, 4, 4.9; rounds of relaxing (3)
   1. Thousands of random starts minimized on the fitted force field (js/forcefields.js), which is cheap; the
      distinct minima kept.
   2. The best few, and the census's own pair and the strongest pair a liquid run produced, scored by Hartree–Fock
      (the census's pair energy, counterpoise-corrected).
   3. The best two relaxed under Hartree–Fock, every pose number at once, by rounds of parabolas along each.
   Hartree–Fock energies are cached in the temp dir, so a run cut short resumes. */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { WORLDS, monoOf } from "./forcefield.mjs";
import { hydrideAtoms, dimerAtoms, pairEnergy } from "./census.mjs";
import { modelEnergy } from "../js/ffmodel.js";
import { randomRotation } from "../js/md.js";
import { planes, posed, descend, rng } from "../js/landscape.js";
export { posed };

const KCAL = 627.509;
/* step 1: the model's distinct minima, best first */
export function modelMinima(key, p, starts = 1500) {
  const w = WORLDS[key], d = w.d, m = monoOf(key), A = hydrideAtoms(m.Z, d, m.R, m.param).map((a) => a.at), rnd = rng(77 + d * 10 + m.Z), found = [];
  for (let s = 0; s < starts; s++) {
    const R0 = randomRotation(d, rnd), dir = Array.from({ length: d }, () => rnd() - 0.5), n = Math.hypot(...dir), D = m.dimer.RXX * (0.8 + 0.4 * rnd());
    const x0 = [...new Array(planes(d).length).fill(0), ...dir.map((v) => (v / n) * D)];
    const r = descend((B) => modelEnergy(p, A, B), A, R0, x0, d);
    const B = posed(A, r.R0, r.x, d), dXX = Math.hypot(...A[0].map((v, i) => v - B[0][i]));
    // one per basin: within 0.3 kcal/mol and 0.15 bohr is the same structure. A descent that ran out of steps with the
    // slope not gone isn't a minimum: counted as one, such stalls once passed for extra basins
    if (r.g < 2e-5 && r.f < -0.1 / KCAL && !found.some((q) => Math.abs(q.E - r.f) < 0.3 / KCAL && Math.abs(q.dXX - dXX) < 0.15)) found.push({ E: r.f, dXX, B, R0: r.R0, x: r.x });
  }
  return { A, minima: found.sort((a, b) => a.E - b.E) };
}

/* Hartree–Fock for a list of placements, four processes at a time, cached by a hash of the geometry */
const CACHE = path.join(tmpdir(), "atom4-pairsearch");
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
export function hfMany(key, pairs) {
  mkdirSync(CACHE, { recursive: true });
  const w = WORLDS[key], tasks = pairs.map(([A, B]) => () => {
    const geo = JSON.stringify([A, B].map((M) => M.map((p) => p.map((v) => +v.toFixed(5))))), file = path.join(CACHE, `${key}_${hash(geo)}.json`);
    if (existsSync(file)) return Promise.resolve(JSON.parse(readFileSync(file, "utf8")).E);
    return new Promise((ok, fail) => { const p = spawn(process.execPath, ["--max-old-space-size=6000", fileURLToPath(import.meta.url), "hf", key, geo]); let out = ""; p.stdout.on("data", (b) => (out += b)); p.stderr.on("data", (b) => process.stderr.write(b)); p.on("close", (c) => { if (c) return fail(new Error("hf exited " + c)); const r = JSON.parse(out.trim().split("\n").pop()); writeFileSync(file, JSON.stringify(r)); ok(r.E); }); });
  });
  const out = new Array(tasks.length); let next = 0;
  return Promise.all(Array.from({ length: 4 }, async () => { while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); } })).then(() => out);
}
/* step 3: relax under Hartree–Fock, every pose number at once: each round fits a parabola along each number (both
   sides of the current point, all evaluated together), takes every number's step at once, and halves the steps */
export async function hfRelax(key, A, R0, x0, rounds = 3, log = () => {}) {
  const d = WORLDS[key].d, nw = planes(d).length; let x = x0.slice(), h = x.map((_, k) => (k < nw ? 0.06 : 0.12));
  let [E] = await hfMany(key, [[A, posed(A, R0, x, d)]]);
  for (let r = 0; r < rounds; r++) {
    const trial = []; x.forEach((_, k) => { for (const sgn of [1, -1]) { const y = x.slice(); y[k] += sgn * h[k]; trial.push(y); } });
    const Es = await hfMany(key, trial.map((y) => [A, posed(A, R0, y, d)]));
    const step = x.map((_, k) => { const ep = Es[2 * k], em = Es[2 * k + 1], c = ep + em - 2 * E; if (c <= 0) return ep < em ? h[k] : -h[k]; return Math.max(-2 * h[k], Math.min(2 * h[k], (-(ep - em) / (2 * c)) * h[k])); });
    let y = x.map((v, k) => v + step[k]), [Ey] = await hfMany(key, [[A, posed(A, R0, y, d)]]);
    if (Ey > E) { y = x.map((v, k) => v + 0.5 * step[k]); [Ey] = await hfMany(key, [[A, posed(A, R0, y, d)]]); } // overshot: half the step
    if (Ey < E) { x = y; E = Ey; }
    log(`  round ${r + 1}: ${(E * KCAL).toFixed(2)} kcal/mol`); h = h.map((v) => v / 2);
  }
  return { x, E, B: posed(A, R0, x, d) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv[0] === "bake") { // gather the searches' results into js/pairmin.js
    const out = {};
    for (const key of Object.keys(WORLDS)) { const f = path.join(CACHE, `best_${key}.json`); if (!existsSync(f)) { console.log(`${key}: no search yet`); continue; } const r = JSON.parse(readFileSync(f, "utf8")), rd = (M) => M.map((p) => p.map((v) => +v.toFixed(5))); out[key] = { d: WORLDS[key].d, Z: WORLDS[key].Z, best: { E: +r.best.E.toFixed(7), dXX: +r.best.dXX.toFixed(3), from: r.best.from, A: rd(r.best.A), B: rd(r.best.B) }, search: +r.search.E.toFixed(7), census: +r.census.E.toFixed(7), censusPair: { A: rd(r.census.A), B: rd(r.census.B) }, modelMinima: r.model.map((q) => ({ model: +q.E.toFixed(7), hf: +q.hf.toFixed(7), dXX: +q.dXX.toFixed(3) })) }; }
    writeFileSync(new URL("../js/pairmin.js", import.meta.url), `/* Generated by tools/pairsearch.mjs (bake) from its searches; do not edit. Per molecule (keys as in
   tools/forcefield.mjs): the best pair found over every relative pose (Hartree–Fock, counterpoise-corrected; hartree),
   whether it came from the search or the census's own pair, the heavy atoms' distance, both molecules' atoms, the
   search's own best and the census pair's energy, and the force field's minima with their Hartree–Fock scores. */
export const PAIRMIN = ${JSON.stringify(out)};
`);
    console.log("wrote js/pairmin.js");
  }
  else if (argv[0] === "hf") { const w = WORLDS[argv[1]], [A, B] = JSON.parse(argv[2]), at = (M) => M.map((p, i) => ({ Z: i ? 1 : w.Z, at: p })), e = pairEnergy(at(A), at(B), w.d); console.log(JSON.stringify({ E: e.E, ok: e.ok })); }
  else {
    const key = argv[0], rounds = +(argv[1] ?? 3), w = WORLDS[key], d = w.d, m = monoOf(key), { FORCEFIELDS } = await import("../js/forcefields.js"), p = FORCEFIELDS[key].p, t0 = Date.now();
    const log = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s ${s}`);
    const { A, minima } = modelMinima(key, p); log(`${minima.length} distinct model minima; best ${minima.slice(0, 6).map((q) => `${(q.E * KCAL).toFixed(2)} (X–X ${q.dXX.toFixed(2)})`).join(", ")}`);
    const top = minima.slice(0, 6), Es = await hfMany(key, top.map((q) => [A, q.B]));
    top.forEach((q, i) => { q.hf = Es[i]; });
    // the census's own pair, for comparison
    const [cA, cB] = dimerAtoms(m, d, m.dimer.RXX, m.dimer.beta), [cE] = await hfMany(key, [[cA.map((a) => a.at), cB.map((a) => a.at)]]);
    log(`HF at the model minima: ${top.map((q) => `${(q.hf * KCAL).toFixed(2)}`).join(", ")}; the census pair ${(cE * KCAL).toFixed(2)} kcal/mol`);
    const cands = top.slice().sort((a, b) => a.hf - b.hf).slice(0, 2).filter((q, i, arr) => i === 0 || q.hf < arr[0].hf + 3 / KCAL), relaxed = []; // the second only if it's within 3 kcal/mol
    for (const q of cands) { log(`relaxing the pair at HF ${(q.hf * KCAL).toFixed(2)}`); relaxed.push(await hfRelax(key, A, q.R0, q.x, rounds, log)); }
    const win = relaxed.sort((a, b) => a.E - b.E)[0], dXX = Math.hypot(...A[0].map((v, i) => v - win.B[0][i]));
    const hx = Math.min(...win.B.slice(1).map((h) => Math.hypot(...A[0].map((v, i) => v - h[i]))), ...A.slice(1).map((h) => Math.hypot(...win.B[0].map((v, i) => v - h[i]))));
    // the relaxation is coarse (parabolas along each pose number, a few rounds: good to ~0.1–0.2 kcal/mol), so the
    // census's own carefully optimized pair stands if it's lower
    const census = { E: cE, dXX: m.dimer.RXX, A: cA.map((a) => a.at), B: cB.map((a) => a.at) }, found = { E: win.E, dXX, A, B: win.B }, best = found.E < census.E ? { ...found, from: "search" } : { ...census, from: "census" };
    log(`best: ${(best.E * KCAL).toFixed(2)} kcal/mol from the ${best.from}, X–X ${best.dXX.toFixed(2)} bohr (search ${(win.E * KCAL).toFixed(2)}, nearest H···X ${hx.toFixed(2)}; census ${(cE * KCAL).toFixed(2)})`);
    mkdirSync(CACHE, { recursive: true }); writeFileSync(path.join(CACHE, `best_${key}.json`), JSON.stringify({ key, best, search: found, census, model: top.map((q) => ({ E: q.E, hf: q.hf, dXX: q.dXX })) }));
  }
}
