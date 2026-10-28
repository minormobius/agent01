/* The search audit: is the census chapter's best pair really the best? Built to run on the compute runner
   (.github/compute/), each mode resumable from its caches in $TMPDIR.
     node four/atom/tools/audit.mjs known <key>                  # the pipeline on one of our molecules, whose answer is published
     node four/atom/tools/audit.mjs probe <key> <n> [--shard i/m] # the Hartree–Fock landscape, sampled, against the force field
     node four/atom/tools/audit.mjs deepen <key> <n> [--only i]   # Hartree–Fock relaxed (pairsearch's hfDescend) from the n deepest probes (or just the i-th)
     node four/atom/tools/audit.mjs dimer <Z>                     # a 4D hydride's hydrogen-bonded pair, alone, with all the memory
     node four/atom/tools/audit.mjs summary                       # what the probes found
     node four/atom/tools/audit.mjs bake                          # the same, as js/audit.js, for the search chapter
   known: the whole chain the 4D pairs went through (Hartree–Fock training points, the fit, the full pair search),
   for our HF (key 3.9) or ammonia (3.7). If it finds the published best arrangements, the 4D results earn some trust.
   Its js/ffdata.js and js/forcefields.js are copied into $TMPDIR/atom4-audit/known_<key>/ so they come back.
   probe: random placements of two molecules in close contact (heavy atoms 0.85–1.35 times the best pair's apart, no
   two atoms too close), each scored by Hartree–Fock and by the force field. A Hartree–Fock basin the force field
   smoothed away shows up as placements much deeper under Hartree–Fock than the model says, or deeper than the best
   pair itself. Those are the ones to relax next. */
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url)), OUT = path.join(tmpdir(), "atom4-audit"), KCAL = 627.509;
mkdirSync(OUT, { recursive: true });
const sh = (args, mem = 3500) => new Promise((ok, fail) => {
  const p = spawn(process.execPath, [`--max-old-space-size=${mem}`, ...args], { stdio: "inherit" });
  p.on("close", (c) => (c ? fail(new Error(`${args.join(" ")} exited ${c}`)) : ok()));
});
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const argv = process.argv.slice(2), mode = argv[0];
if (mode === "known") {
  const key = argv[1], t0 = Date.now(), log = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s ${s}`);
  log(`training points for ${key}`); await sh([path.join(here, "forcefield.mjs"), key]);
  log("the fit"); await sh([path.join(here, "fitff.mjs")]);
  log("the full pair search"); await sh([path.join(here, "pairsearch.mjs"), key]);
  const dir = path.join(OUT, `known_${key}`); mkdirSync(dir, { recursive: true });
  for (const f of ["ffdata.js", "forcefields.js"]) copyFileSync(path.join(here, "../js", f), path.join(dir, f));
  log(`done; the fit and data copied to ${dir}`);
} else if (mode === "probe" || mode === "deepen") {
  const key = argv[1], n = +argv[2], s = argv.indexOf("--shard"), [si, sm] = s >= 0 ? argv[s + 1].split("/").map(Number) : [0, 1];
  const { WORLDS, monoOf } = await import("./forcefield.mjs"), { hydrideAtoms } = await import("./census.mjs"), { hfMany, hfDescend } = await import("./pairsearch.mjs");
  const { modelEnergy } = await import("../js/ffmodel.js"), { FORCEFIELDS } = await import("../js/forcefields.js"), { PAIRMIN } = await import("../js/pairmin.js"), { randomRotation } = await import("../js/md.js");
  const w = WORLDS[key], d = w.d, m = monoOf(key), A = hydrideAtoms(m.Z, d, m.R, m.param), At = A.map((a) => a.at), best = PAIRMIN[key].best, p = FORCEFIELDS[key].p;
  // placement g, the same every time it's asked for: B = t + R·A, its turn R and offset t kept so it can be relaxed later
  const place = (g) => {
    const rnd = rng(7919 * (Math.round(+key * 10)) + g);
    for (;;) {
      const R = randomRotation(d, rnd), gs = () => Math.sqrt(-2 * Math.log(rnd() + 1e-300)) * Math.cos(2 * Math.PI * rnd()), u = Array.from({ length: d }, gs), un = Math.hypot(...u);
      const D = best.dXX * (0.85 + 0.5 * rnd()), t = u.map((v) => (D * v) / un), B = At.map((q) => Array.from({ length: d }, (_, i) => t[i] + R[i].reduce((s, r, j) => s + r * q[j], 0)));
      if (At.every((a) => B.every((b) => Math.hypot(...a.map((x, i) => x - b[i])) > w.CLOSE - 0.4))) return { R, t, B };
    }
  };
  if (mode === "deepen") { // relax Hartree–Fock from the n deepest probe placements, by the quasi-Newton descent
    const pts = []; for (const f of readdirSync(OUT).filter((f) => f.startsWith(`probe_${key}`) && f.endsWith(".json") && (f === `probe_${key}.json` || f.startsWith(`probe_${key}_s`)))) pts.push(...JSON.parse(readFileSync(path.join(OUT, f), "utf8")).points);
    const only = argv.indexOf("--only"), oi = only >= 0 ? +argv[only + 1] : null; // one start per runner: the oi-th deepest
    const deepest = pts.sort((a, b) => a.hf - b.hf).slice(oi ?? 0, oi === null ? n : oi + 1), file = path.join(OUT, oi === null ? `deepen_${key}.json` : `deepen_${key}_${oi}.json`), st = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { key, best: best.E, runs: [] }, t0 = Date.now();
    for (const q of deepest) {
      if (st.runs.some((r) => r.g === q.g)) continue;
      const pl = place(q.g), drift = Math.max(...pl.B.flat().map((v, i) => Math.abs(v - q.B.flat()[i])));
      if (drift > 1e-3) { console.log(`placement ${q.g} doesn't regenerate (off by ${drift}); skipped`); continue; }
      const log = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s #${q.g} ${s}`); log(`from ${(q.hf * KCAL).toFixed(2)} kcal/mol (best pair ${(best.E * KCAL).toFixed(2)})`);
      const r = await hfDescend(key, At, pl.R, [...new Array((d * (d - 1)) / 2).fill(0), ...pl.t], { iters: 30, log });
      const dXX = Math.hypot(...At[0].map((v, i) => v - r.B[0][i]));
      st.runs.push({ g: q.g, from: q.hf, E: +r.E.toFixed(7), dXX: +dXX.toFixed(3), B: r.B.map((b) => b.map((v) => +v.toFixed(5))) }); writeFileSync(file, JSON.stringify(st));
      log(`ends at ${(r.E * KCAL).toFixed(2)} kcal/mol, X–X ${dXX.toFixed(2)}${r.E < best.E - 0.05 / KCAL ? "  ← DEEPER than the best pair" : ""}`);
    }
    process.exit(0);
  }
  const file = path.join(OUT, sm > 1 ? `probe_${key}_s${si}of${sm}.json` : `probe_${key}.json`);
  const st = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { key, d, best: best.E, points: [] };
  const at = () => si + sm * st.points.length; // the next placement's global index
  const t0 = Date.now();
  while (at() < n) {
    const gs = Array.from({ length: 4 }, (_, j) => at() + j * sm).filter((g) => g < n), Bs = gs.map((g) => place(g).B);
    const Es = await hfMany(key, Bs.map((B) => [At, B]));
    gs.forEach((g, j) => st.points.push({ g, hf: +Es[j].toFixed(7), model: +modelEnergy(p, At, Bs[j]).toFixed(7), dXX: +Math.hypot(...At[0].map((v, i) => v - Bs[j][0][i])).toFixed(3), B: Bs[j].map((q) => q.map((v) => +v.toFixed(5))) }));
    writeFileSync(file, JSON.stringify(st));
    const lo = Math.min(...st.points.map((q) => q.hf));
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s ${key} shard ${si}/${sm}: ${st.points.length} placements, deepest Hartree–Fock ${(lo * KCAL).toFixed(2)} kcal/mol (best pair ${(best.E * KCAL).toFixed(2)})`);
  }
} else if (mode === "dimer") {
  const Z = +argv[1], { CENSUS } = await import("../js/census.js"), { dimer: _, ...m } = CENSUS[4].find((q) => q.Z === Z), file = path.join(OUT, `dimer_4_${Z}.json`);
  if (existsSync(file)) { console.log("already done:", readFileSync(file, "utf8")); process.exit(0); }
  // the census's own pair job, run alone with nearly all of the runner's memory
  const out = await new Promise((ok, fail) => { const p = spawn(process.execPath, ["--max-old-space-size=14000", path.join(here, "census.mjs"), "dimer", JSON.stringify(m)]); let s = ""; p.stdout.on("data", (b) => (s += b)); p.stderr.on("data", (b) => process.stderr.write(b)); p.on("close", (c) => (c ? fail(new Error(`dimer ${Z} exited ${c}`)) : ok(s.trim().split("\n").pop()))); });
  writeFileSync(file, out); console.log(`4D element ${Z}'s pair:`, out);
  // and where the census looks for it, so its next bake includes the pair (tools/census.mjs)
  const cdir = path.join(tmpdir(), "atom4-census"); mkdirSync(cdir, { recursive: true });
  writeFileSync(path.join(cdir, ["dimer", JSON.stringify(m)].join("_").replace(/[^\w.-]/g, "").slice(0, 120) + ".json"), out);
} else if (mode === "bake") { // what the probes found, for the search chapter: js/audit.js
  const by = {};
  for (const f of readdirSync(OUT).filter((f) => f.startsWith("probe_"))) { const st = JSON.parse(readFileSync(path.join(OUT, f), "utf8")); (by[st.key] ??= { best: st.best, points: [] }).points.push(...st.points); }
  const out = Object.fromEntries(Object.entries(by).map(([key, { best, points }]) => {
    const att = points.filter((q) => q.hf < 0), gap = att.map((q) => q.model - q.hf);
    return [key, { placements: points.length, best: +best.toFixed(7), deeper: points.filter((q) => q.hf < best).length, deepest: +Math.min(...points.map((q) => q.hf)).toFixed(7), attractive: att.length, rms: +Math.sqrt(gap.reduce((t, g) => t + g * g, 0) / att.length).toFixed(7), shallowest: +Math.max(...gap).toFixed(7) }];
  }));
  writeFileSync(path.join(here, "../js/audit.js"), `/* Generated by tools/audit.mjs bake from the probes (run on the compute runner); do not edit. Per molecule key: random close
   placements of two molecules scored by Hartree–Fock and by the force field (hartree): how many, the best pair's energy, how
   many came out deeper than it, the deepest, and the force field's error on the attractive ones (rms, and its worst
   underestimate of the pull). */
export const PROBES = ${JSON.stringify(out)};
`);
  console.log("wrote js/audit.js", JSON.stringify(out));
} else if (mode === "summary") {
  const by = {};
  for (const f of readdirSync(OUT).filter((f) => f.startsWith("probe_"))) { const st = JSON.parse(readFileSync(path.join(OUT, f), "utf8")); (by[st.key] ??= { best: st.best, points: [] }).points.push(...st.points); }
  for (const [key, { best, points }] of Object.entries(by)) {
    const deeper = points.filter((q) => q.hf < best), gap = points.map((q) => (q.model - q.hf) * KCAL), worst = points.slice().sort((a, b) => (b.model - b.hf) - (a.model - a.hf)).slice(0, 5);
    const att = points.filter((q) => q.hf < 0), rms = Math.sqrt(att.reduce((t, q) => t + ((q.model - q.hf) * KCAL) ** 2, 0) / Math.max(1, att.length));
    console.log(`${key}: ${points.length} placements; Hartree–Fock deeper than the best pair (${(best * KCAL).toFixed(2)}): ${deeper.length}; model − HF on the attractive ones, rms ${rms.toFixed(2)} kcal/mol, largest ${Math.max(...gap).toFixed(2)}`);
    console.log("   where the model is too shallow most:", worst.map((q) => `#${q.g} HF ${(q.hf * KCAL).toFixed(1)} model ${(q.model * KCAL).toFixed(1)} at ${q.dXX}`).join("; "));
  }
} else {
  console.error("modes: known <key> | probe <key> <n> [--shard i/m] | deepen <key> <n> | dimer <Z> | summary | bake"); process.exit(1);
}
