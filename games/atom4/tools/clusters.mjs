/* How fast minima multiply: clusters of n molecules, on the force field fitted to Hartree–Fock pairs
   (js/forcefields.js), searched from random starts. Chapter 11 found a pair's landscape is a funnel (one minimum);
   for many molecules the number of minima is expected to grow exponentially with n (Stillinger 1999). This counts
   them, in both worlds: our water (keys as in tools/forcefield.mjs: 3) against Xater (4) and element 9's XH₃ (4.9).
     node games/atom4/tools/clusters.mjs <key> <n> [starts]   # one cluster size; results cached, so a cut run resumes
     node games/atom4/tools/clusters.mjs bake                 # gather what's done into js/clusters.js
   The first molecule is fixed; each other has d(d − 1)/2 turns and d moves, so (n − 1) d(d + 1)/2 numbers. Every start
   descends (js/landscape.js) until the slope is gone; ends that ran out of steps are counted as unfinished, not as
   minima. Two minima are the same if their energies agree within 0.1 kcal/mol and their sorted heavy-atom distances
   within 0.1 bohr (that ignores which molecule is which, and the cluster's own turn and mirror). Pairwise additive:
   no three-body terms, which the force field doesn't have. */
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { WORLDS, monoOf } from "./forcefield.mjs";
import { hydrideAtoms } from "./census.mjs";
import { modelEnergy } from "../js/ffmodel.js";
import { randomRotation } from "../js/md.js";
import { planes, posed, clusterSteps, rng } from "../js/landscape.js";

const KCAL = 627.509, CACHE = path.join(tmpdir(), "atom4-clusters");
const sig = (Ms) => { const X = Ms.map((M) => M[0]), out = []; for (let i = 0; i < X.length; i++) for (let j = i + 1; j < X.length; j++) out.push(Math.hypot(...X[i].map((v, k) => v - X[j][k]))); return out.sort((a, b) => a - b); };
const same = (a, b) => Math.abs(a.E - b.E) < 0.1 / KCAL && a.sig.every((v, i) => Math.abs(v - b.sig[i]) < 0.1);

/* one cluster size: each start has its own seed, so a resumed run continues the same sequence */
export async function search(key, n, starts, p, log = () => {}) {
  const w = WORLDS[key], d = w.d, m = monoOf(key), A = hydrideAtoms(m.Z, d, m.R, m.param).map((a) => a.at), np = planes(d).length + d;
  const file = path.join(CACHE, `${key}_${n}.json`); mkdirSync(CACHE, { recursive: true });
  const st = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { key, d, n, done: 0, minima: [], curve: [], apart: 0, unfinished: 0, steps: [], seconds: 0 };
  const E = (Bs) => { const Ms = [A, ...Bs]; let e = 0; for (let i = 0; i < Ms.length; i++) for (let j = i + 1; j < Ms.length; j++) e += modelEnergy(p, Ms[i], Ms[j]); return e; };
  // starts: each molecule turned at random, its heavy atom anywhere in a ball holding n molecules at the pair's spacing
  const Rball = m.dimer.RXX * (0.6 + 0.5 * Math.cbrt(n));
  let t0 = Date.now(), lastSave = Date.now();
  while (st.done < starts) {
    const R0s = [], x0 = [], rnd = rng(1e6 * n + 1e4 * d + 100 * m.Z + st.done);
    for (let i = 1; i < n; i++) {
      R0s.push(randomRotation(d, rnd));
      let v; do { v = Array.from({ length: d }, () => 2 * rnd() - 1); } while (Math.hypot(...v) > 1); // uniform in the ball
      x0.push(...new Array(planes(d).length).fill(0), ...v.map((c) => c * Rball));
    }
    let last, k = 0; for (const s of clusterSteps(E, A, R0s, x0, d, 1500 + 300 * n)) { last = s; k++; }
    const Ms = [A, ...last.R0s.map((R0, i) => posed(A, R0, last.x.slice(i * np, (i + 1) * np), d))], S = sig(Ms);
    if (last.g > 2e-5) st.unfinished++;
    else if (S[S.length - 1] > 4 * Rball) st.apart++; // a molecule wandered off: not a cluster of n
    else {
      const q = { E: last.f, sig: S }; let b = st.minima.find((r) => same(r, q));
      if (!b) { b = { ...q, hits: 0, first: st.done, X: Ms.map((M) => M.map((a) => a.map((v) => +v.toFixed(4)))) }; st.minima.push(b); }
      b.hits++;
    }
    st.steps.push(k); st.done++; st.curve.push(st.minima.length);
    if (Date.now() - lastSave > 20000 || st.done === starts) {
      st.seconds += (Date.now() - t0) / 1000; t0 = Date.now(); lastSave = Date.now(); st.minima.sort((a, b) => a.E - b.E);
      writeFileSync(file, JSON.stringify(st)); log(`${key} n=${n}: ${st.done}/${starts} starts, ${st.minima.length} minima (best ${(st.minima[0]?.E * KCAL).toFixed(2)} kcal/mol ×${st.minima[0]?.hits ?? 0}), ${st.apart} apart, ${st.unfinished} unfinished`);
    }
  }
  return st;
}

/* how many minima are still unseen: Chao1, from the minima seen once (f1) and twice (f2) */
export const chao1 = (minima) => { const f1 = minima.filter((q) => q.hits === 1).length, f2 = minima.filter((q) => q.hits === 2).length; return minima.length + (f2 ? (f1 * f1) / (2 * f2) : (f1 * (f1 - 1)) / 2); };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv[0] === "bake") {
    const out = {};
    for (const f of existsSync(CACHE) ? readdirSync(CACHE).filter((f) => f.endsWith(".json")) : []) {
      const st = JSON.parse(readFileSync(path.join(CACHE, f), "utf8")), key = String(st.key);
      // a floor on the count: minima told apart by energy alone (0.1 kcal/mol), so a soft basin whose geometry spreads
      // past the 0.1-bohr test can't be counted twice
      const levels = st.minima.map((q) => q.E).sort((a, b) => a - b).filter((e, i, a) => i === 0 || e - a[i - 1] > 0.1 / KCAL).length;
      (out[key] ??= {})[st.n] = { d: st.d, n: st.n, starts: st.done, minima: st.minima.length, levels, chao1: +chao1(st.minima).toFixed(1), apart: st.apart, unfinished: st.unfinished,
        best: st.minima.slice(0, 12).map((q) => ({ E: +q.E.toFixed(7), hits: q.hits, first: q.first })), curve: st.curve.filter((_, i) => i % Math.max(1, Math.round(st.done / 200)) === 0), bestX: st.minima[0]?.X ?? null };
    }
    writeFileSync(new URL("../js/clusters.js", import.meta.url), `/* Generated by tools/clusters.mjs (bake); do not edit. Per molecule (keys as in tools/forcefield.mjs) and
   cluster size n: random starts, the distinct minima found (and, as a floor, how many distinct energies), the Chao1
   estimate of how many there are, the best few
   (energy in hartree, hits, the start that first found it), the discovery curve (sampled), and the best cluster's
   atoms. On the force field (js/forcefields.js), pairwise additive. */
export const CLUSTERS = ${JSON.stringify(out)};
`);
    console.log("wrote js/clusters.js");
  } else {
    const [key, n, starts] = [argv[0], +argv[1], +(argv[2] ?? 1000)], { FORCEFIELDS } = await import("../js/forcefields.js"), t0 = Date.now();
    const st = await search(key, n, starts, FORCEFIELDS[key].p, (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s ${s}`));
    console.log(`done: ${st.minima.length} minima, Chao1 ${chao1(st.minima).toFixed(1)}; best ${st.minima.slice(0, 5).map((q) => `${(q.E * KCAL).toFixed(2)}×${q.hits}`).join(", ")}`);
  }
}
