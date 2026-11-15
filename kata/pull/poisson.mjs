#!/usr/bin/env node
/* PULL's contracting-sheath study. A hose whose Poisson ratio is larger than its fibres' tightens as the rope is
   stretched: its squeeze is (misfit + Δν × stretch) where a plain hose's is its misfit. With HOOP = 0.5 the misfit is
   about half a percent, so the squeeze grows by a factor 1 + (Δν / 0.005) × stretch. Δν up to about 0.2 is a choice of
   materials (4D isotropic matter is capped at ⅓); more than that is a sheath built to contract, such as a braid.
   Thirteen fibres in a hose τ thick, weight counted.   node kata/pull/poisson.mjs [N=60]   (~6 min) */
import fs from "node:fs";
import { test, stats, sheath } from "./js/bench.js";
const N = +process.argv[2] || 60, RUN = { steps: 110, strain: 0.045 }, MISFIT = 0.005, t0 = Date.now(), out = { n: N, misfit: MISFIT, rows: [] };
const REF = stats(Array.from({ length: 400 }, (_, i) => test({ section: "one", seed: i + 1 }, RUN).peak)).mean;
for (const staple of [0, 40]) for (const dnu of [0, 0.1, 0.2, 0.5, 1]) { let best = null; for (const t of [0.02, 0.05, 0.1, 0.2]) { const sh = sheath(4, t), v = []; let left = 0;
    for (let s = 1; s <= N; s++) { const r = test({ section: "fcc13s", staple, press: { kind: "hoop", p: sh.press, wall: sh.wall, gain: dnu / MISFIT }, ribbon: { k: sh.material, strength: sh.material }, seed: s }, RUN); v.push(r.peak / REF); left = Math.max(left, r.R.left || 0); }
    const st = stats(v), W = 13 + sh.material, row = { staple, dnu, tau: t, mean: st.mean, cv: st.cv, material: W, specific: st.mean / W, specific5: st.p5 / W, left }; if (!best || row.specific5 > best.specific5) best = row; }
  out.rows.push(best); console.error(staple ? "short fibres" : "filaments   ", "Δν", String(dnu).padEnd(4), "best τ", String(best.tau).padEnd(5), "per weight", best.specific.toFixed(3), "5th", best.specific5.toFixed(3), "cv", (best.cv * 100).toFixed(0) + "%", best.left > 1.001 ? "UNCONVERGED" : "", ((Date.now() - t0) / 1000).toFixed(0) + "s"); }
fs.writeFileSync(new URL("./data/poisson.json", import.meta.url), JSON.stringify(out));
