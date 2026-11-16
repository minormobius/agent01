#!/usr/bin/env node
/* PULL's closure study: the hose as a material with flaws (js/hose.js), with how tight and how thick it is made
   OPTIMISED, not chosen. For each version of the model the best (τ, hoop) is picked on seeds 1–30 by the 5th
   percentile per weight and reported on seeds 31–90. Thirteen filaments, 96 sections.
     baseline    size effect on, brittle (rankine), stress peak 2.3, a split stays where it starts
     and one change at a time: the axial criterion (mises, linear); the stress peak (1: an evenly stressed skin);
     how far a split runs (the whole rope); no size effect; and hoops (no axial member)
   node kata/pull/closure.mjs [modulus=5]   (~25 min) → data/closure-<modulus>.json */
import fs from "node:fs";
import { test, stats, TALLY } from "./js/bench.js";
import { hoseRope } from "./js/hose.js";
const m = +process.argv[2] || 5, RUN = { steps: 110, strain: 0.045 }, TAU = [0.05, 0.1, 0.2], HOOP = [0.05, 0.1, 0.2, 0.3, 0.5], t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0) + "s", seeds = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
const ref = stats(seeds(1, 400).map((s) => test({ section: "one", m, seed: s }, RUN).peak)).mean, loose = stats(seeds(31, 90).map((s) => test({ section: "fcc13", m, press: { kind: "none" }, seed: s }, RUN).peak));
const run = (v, ss) => { const peaks = [], split = []; let W = 0; for (const s of ss) { const h = hoseRope({ m, ...v }, s); W = h.material; peaks.push(test(h.opts, RUN).peak / ref / W); split.push(h.split); } const st = stats(peaks); return { mean: st.mean, p5: st.p5, cv: st.cv, se: st.sd / Math.sqrt(st.n), split: split.reduce((a, b) => a + b, 0) / split.length }; };
const out = { m, ref, loose: { mean: loose.mean / ref / 13, p5: loose.p5 / ref / 13 }, tau: TAU, hoop: HOOP, rows: [] };
for (const [name, v] of [["baseline", {}], ["axial criterion: von Mises", { crit: "mises" }], ["axial criterion: linear interaction", { crit: "linear" }], ["skin evenly stressed (no peak)", { peak: 1 }], ["a split runs the whole rope", { run: Infinity }], ["no size effect", { size: false }], ["hoops: no axial member", { member: false }]]) {
  let best = null; const grid = []; for (const tau of TAU) for (const hoop of HOOP) { const r = run({ ...v, tau, hoop }, seeds(1, 30)); grid.push({ tau, hoop, mean: r.mean, p5: r.p5 }); if (!best || r.p5 > best.p5) best = { tau, hoop, p5: r.p5 }; }
  const rep = run({ ...v, tau: best.tau, hoop: best.hoop }, seeds(31, 90)); out.rows.push({ name, tau: best.tau, hoop: best.hoop, ...rep, grid });
  console.error(`m ${m}`, name.padEnd(38), "best τ", best.tau, "hoop", best.hoop, "→", rep.mean.toFixed(3), "±", rep.se.toFixed(3), "p5", rep.p5.toFixed(3), "split", (rep.split * 100).toFixed(1) + "%", "| loose", out.loose.mean.toFixed(3), sec()); }
out.status = TALLY.record; fs.writeFileSync(new URL(`./data/closure-${m}.json`, import.meta.url), JSON.stringify(out)); console.error("done", JSON.stringify(out.status), sec());
