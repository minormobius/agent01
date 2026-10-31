/* How fast minima multiply: clusters of n molecules, on the force field fitted to Hartree–Fock pairs
   (js/forcefields.js), searched from random starts. Chapter 11 found a pair's landscape is a funnel (one minimum);
   for many molecules the number of minima is expected to grow exponentially with n (Stillinger 1999). This counts
   them, in both worlds: our water (keys as in tools/forcefield.mjs: 3) against Xater (4) and element 9's XH₃ (4.9).
     node four/atom/tools/clusters.mjs <key> <n> [starts] [--shard i/m]   # one cluster size; cached, so a cut run resumes
     node four/atom/tools/clusters.mjs bake                 # gather what's done into js/clusters.js
     node four/atom/tools/clusters.mjs repol <key> <n> [top] # the audit: the best minima relaxed on the polarizable field
     node four/atom/tools/clusters.mjs repolbake             # gather the audit into js/clusteraudit.js
   The first molecule is fixed; each other has d(d − 1)/2 turns and d moves, so (n − 1) d(d + 1)/2 numbers. Every start
   descends (js/landscape.js) until the slope is gone; ends that ran out of steps are counted as unfinished, not as
   minima. Two minima are the same if their energies agree within 0.1 kcal/mol and their sorted heavy-atom distances
   within 0.1 bohr (that ignores which molecule is which, and the cluster's own turn and mirror). Pairwise additive:
   no three-body terms, which the force field doesn't have.
   Start s has its own seed, so a search splits across machines: --shard i/m runs the starts s ≡ i (mod m), into its own
   cache file, and bake merges a complete set of shards (or the unsharded file, whichever covers more starts: the two
   cover the same seeds, so they're never added together). */
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

/* one cluster size: each start has its own seed, so a resumed run continues the same sequence; shard [i, m] runs only
   the starts s ≡ i (mod m) */
export async function search(key, n, starts, p, log = () => {}, [si, sm] = [0, 1]) {
  const w = WORLDS[key], d = w.d, m = monoOf(key), A = hydrideAtoms(m.Z, d, m.R, m.param).map((a) => a.at), np = planes(d).length + d;
  const file = path.join(CACHE, sm > 1 ? `${key}_${n}_s${si}of${sm}.json` : `${key}_${n}.json`); mkdirSync(CACHE, { recursive: true });
  const st = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { key, d, n, shard: [si, sm], done: 0, minima: [], curve: [], apart: 0, unfinished: 0, steps: [], seconds: 0 };
  const at = () => si + sm * st.done; // this shard's next start, by its global index
  const E = (Bs) => { const Ms = [A, ...Bs]; let e = 0; for (let i = 0; i < Ms.length; i++) for (let j = i + 1; j < Ms.length; j++) e += modelEnergy(p, Ms[i], Ms[j]); return e; };
  // starts: each molecule turned at random, its heavy atom anywhere in a ball holding n molecules at the pair's spacing
  const Rball = m.dimer.RXX * (0.6 + 0.5 * Math.cbrt(n));
  let t0 = Date.now(), lastSave = Date.now();
  while (at() < starts) {
    const R0s = [], x0 = [], rnd = rng(1e6 * n + 1e4 * d + 100 * m.Z + at());
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
      if (!b) { b = { ...q, hits: 0, first: at(), X: Ms.map((M) => M.map((a) => a.map((v) => +v.toFixed(4)))) }; st.minima.push(b); }
      b.hits++;
    }
    st.steps.push(k); st.done++; st.curve.push(st.minima.length);
    if (Date.now() - lastSave > 20000 || at() >= starts) {
      st.seconds += (Date.now() - t0) / 1000; t0 = Date.now(); lastSave = Date.now(); st.minima.sort((a, b) => a.E - b.E);
      writeFileSync(file, JSON.stringify(st)); log(`${key} n=${n}${sm > 1 ? ` shard ${si}/${sm}` : ""}: start ${at()}/${starts} (${st.done} here), ${st.minima.length} minima (best ${(st.minima[0]?.E * KCAL).toFixed(2)} kcal/mol ×${st.minima[0]?.hits ?? 0}), ${st.apart} apart, ${st.unfinished} unfinished`);
    }
  }
  return st;
}

/* how many minima are still unseen: Chao1, from the minima seen once (f1) and twice (f2) */
export const chao1 = (minima) => { const f1 = minima.filter((q) => q.hits === 1).length, f2 = minima.filter((q) => q.hits === 2).length; return minima.length + (f2 ? (f1 * f1) / (2 * f2) : (f1 * (f1 - 1)) / 2); };

/* The audit by the polarizable force field (js/polfields.js, js/polmodel.js), which counts each molecule's response to all
   its neighbours at once, where this search's force field adds pairs. The search's best `top` distinct minima of each
   size, each scored as found and then relaxed on the polarizable field (BFGS, every molecule but the first free, each
   turned about its own heavy atom), so the audit can say whether the best cluster stays best and how hard it holds.
   Cached per key and size ($TMPDIR/atom4-clusters/repol_<key>_<n>.json), a minimum at a time. */
export async function repol(key, n, top = 10, log = () => {}) {
  const { POLFIELDS } = await import("../js/polfields.js"), { termsFor } = await import("./fitpol.mjs"), { clusterEnergy } = await import("../js/polmodel.js"), { bfgsSteps, expm } = await import("../js/landscape.js");
  const T = termsFor(POLFIELDS[key]), d = POLFIELDS[key].d, np = planes(d).length;
  const files = readdirSync(CACHE).filter((f) => f.startsWith(`${key}_${n}`) && !f.startsWith("repol")), out = path.join(CACHE, `repol_${key}_${n}.json`);
  const all = files.flatMap((f) => JSON.parse(readFileSync(path.join(CACHE, f), "utf8")).minima).sort((a, b) => a.E - b.E), picks = [];
  for (const m of all) { if (picks.length >= top) break; if (!picks.some((u) => same(u, m))) picks.push(m); }
  const st = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : { key, n, rows: [] };
  for (const [i, m] of picks.entries()) {
    if (st.rows[i]) continue;
    const X = m.X, ctr = X.map((M) => M[0]), pose = (x) => X.map((M, a) => { if (!a) return M; const o = (a - 1) * (np + d), W = new Array(d * d).fill(0); planes(d).forEach(([p, q], j) => { W[p * d + q] = x[o + j]; W[q * d + p] = -x[o + j]; }); const R = expm(W, d); return M.map((s) => s.map((_, r) => ctr[a][r] + x[o + np + r] + s.reduce((t, v, c) => t + R[r * d + c] * (v - ctr[a][c]), 0))); });
    const E = (x) => clusterEnergy(T, pose(x)).E, x0 = new Array((n - 1) * (np + d)).fill(0), t0 = Date.now(); let last;
    for (const it of bfgsSteps(E, x0, 1500, 2e-6)) last = it;
    const fin = pose(last.x);
    st.rows[i] = { found: +(m.E * KCAL).toFixed(4), scored: +(E(x0) * KCAL).toFixed(4), relaxed: +(last.f * KCAL).toFixed(4), g: last.g, sig: sig(fin).map((v) => +v.toFixed(3)), X: fin.map((M) => M.map((a) => a.map((v) => +v.toFixed(5)))), moved: +Math.max(...fin.flatMap((M, a) => M.map((s, k) => Math.hypot(...s.map((v, c) => v - X[a][k][c]))))).toFixed(3) };
    writeFileSync(out, JSON.stringify(st)); log(`${key} n=${n} #${i}: found ${st.rows[i].found}, scored ${st.rows[i].scored}, relaxed ${st.rows[i].relaxed} kcal/mol (|g| ${last.g.toExponential(1)}, moved ${st.rows[i].moved} bohr, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  return st;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv[0] === "repol") await repol(argv[1], +argv[2], +(argv[3] ?? 10), console.log);
  else if (argv[0] === "repolbake") {
    // per key and size: each audited minimum as found (this search's field), scored on the polarizable field where it
    // sat, and relaxed on it, with how far its atoms moved; and which of them the polarizable field ranks first
    const out = {};
    for (const f of readdirSync(CACHE).filter((f) => /^repol_.*\.json$/.test(f))) {
      const st = JSON.parse(readFileSync(path.join(CACHE, f), "utf8")), rows = st.rows.filter(Boolean).map(({ found, scored, relaxed, moved, g }) => ({ found, scored, relaxed, moved, done: g < 2e-5 }));
      if (!rows.length) continue; const firstPol = rows.reduce((b, r, i) => (r.relaxed < rows[b].relaxed ? i : b), 0);
      (out[st.key] ??= {})[st.n] = { audited: rows.length, rows, firstPol };
    }
    writeFileSync(new URL("../js/clusteraudit.js", import.meta.url), `/* Generated by tools/clusters.mjs repolbake; do not edit. The cluster search audited by the polarizable force field
   (js/polfields.js): per key and size, its best distinct minima (kcal/mol, the whole cluster) as found on the pairwise
   field, scored on the polarizable field where they sat, and relaxed on it (moved: the farthest an atom went, bohr), and
   which one the polarizable field ranks first. */
export const CLUSTERAUDIT = ${JSON.stringify(out)};
`);
    console.log("wrote js/clusteraudit.js");
  }
  else if (argv[0] === "bake") {
    const out = {}, groups = {};
    for (const f of existsSync(CACHE) ? readdirSync(CACHE).filter((f) => f.endsWith(".json")) : []) {
      const st = JSON.parse(readFileSync(path.join(CACHE, f), "utf8")), [, m = 1] = st.shard ?? [0, 1];
      ((groups[`${st.key}_${st.n}`] ??= {})[m] ??= []).push(st);
    }
    for (const sets of Object.values(groups)) {
      // the unsharded file and each complete set of shards cover the same seeds: take whichever covers the most starts
      const full = Object.entries(sets).filter(([m, fs]) => fs.length === +m).map(([, fs]) => fs);
      const use = full.sort((a, b) => b.reduce((t, x) => t + x.done, 0) - a.reduce((t, x) => t + x.done, 0))[0]; if (!use) continue;
      const st0 = use[0], minima = [];
      for (const st of use) for (const q of st.minima) { const b = minima.find((r) => same(r, q)); if (b) { b.hits += q.hits; if (q.first < b.first) Object.assign(b, { first: q.first, X: q.X }); } else minima.push({ ...q }); }
      minima.sort((a, b) => a.E - b.E);
      const starts = use.reduce((t, x) => t + x.done, 0), sum = (k) => use.reduce((t, x) => t + x[k], 0), key = String(st0.key);
      // a floor on the count: the same minima merged under a test three times looser (0.3 kcal/mol, 0.5 bohr), so a
      // soft basin whose geometry spreads past the strict test can't be counted twice. (Telling minima apart by energy
      // alone fails once there are hundreds: chained 0.1 kcal/mol apart, they merge into a few dozen.)
      const floor = minima.reduce((out, q) => (out.some((r) => Math.abs(r.E - q.E) < 0.3 / KCAL && r.sig.every((v, i) => Math.abs(v - q.sig[i]) < 0.5)) ? out : [...out, q]), []).length;
      // settled? how many minima the second half of the starts added, and whether Chao1 can be trusted: not once the
      // minima seen only once are half of all found, when it's a guess bigger than anything measured
      const late = minima.filter((q) => q.first >= starts / 2).length, f1 = minima.filter((q) => q.hits === 1).length;
      // the discovery curve, from when each minimum was first found (by global start index)
      const firsts = minima.map((q) => q.first).sort((a, b) => a - b), every = Math.max(1, Math.round(starts / 200)), curve = [];
      for (let s = 0, j = 0; s < starts; s += every) { while (j < firsts.length && firsts[j] <= s) j++; curve.push(j); }
      (out[key] ??= {})[st0.n] = { d: st0.d, n: st0.n, starts, shards: use.length, minima: minima.length, floor, late, seenOnce: f1, chao1: +chao1(minima).toFixed(1), chaoTrusted: f1 < minima.length / 2, apart: sum("apart"), unfinished: sum("unfinished"),
        best: minima.slice(0, 12).map((q) => ({ E: +q.E.toFixed(7), hits: q.hits, first: q.first })), curve, every, bestX: minima[0]?.X ?? null };
    }
    writeFileSync(new URL("../js/clusters.js", import.meta.url), `/* Generated by tools/clusters.mjs (bake); do not edit. Per molecule (keys as in tools/forcefield.mjs) and
   cluster size n: random starts, the distinct minima found (and a floor: merged under a test three times looser),
   how many the second half of the starts added, how many were seen once, the Chao1 estimate of how many there are
   (and whether it can be trusted), the best few
   (energy in hartree, hits, the start that first found it), the discovery curve (minima found by each start, every
   every-th start), and the best cluster's
   atoms. On the force field (js/forcefields.js), pairwise additive. */
export const CLUSTERS = ${JSON.stringify(out)};
`);
    console.log("wrote js/clusters.js");
  } else {
    const sh = argv.indexOf("--shard"), shard = sh >= 0 ? argv.splice(sh, 2)[1].split("/").map(Number) : [0, 1];
    const [key, n, starts] = [argv[0], +argv[1], +(argv[2] ?? 1000)], { FORCEFIELDS } = await import("../js/forcefields.js"), t0 = Date.now();
    const st = await search(key, n, starts, FORCEFIELDS[key].p, (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s ${s}`), shard);
    console.log(`done: ${st.minima.length} minima, Chao1 ${chao1(st.minima).toFixed(1)}; best ${st.minima.slice(0, 5).map((q) => `${(q.E * KCAL).toFixed(2)}×${q.hits}`).join(", ")}`);
  }
}
