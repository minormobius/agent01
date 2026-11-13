#!/usr/bin/env node
/* PULL's braid study: the ropes whose strands are hoses. Every strand is continuous (a hose is spun, not stapled), so
   what a braid can add is load sharing round a break, and what it costs is the angle its strands lie at.
     loose     n hoses side by side, touching nothing
     plait     three hoses plaited, each pressing on the other two as it is pulled
     maypole   a straight hose core and six hoses braided round it
     served    the same core with six ribbons wound on it. Each ribbon is held by the core; ribbon to ribbon there is
               only friction that can be slid out of, so this row gives them none: the pessimistic end. The maypole row
               is the other end, per material
   A strand at angle θ is a track with stiffness cos³θ, strength cosθ, weight 1/cosθ, pressing tan²θ × its tension
   (`laid`, bench.js). Strength is in strands (the mean of one straight strand at this length).
   node kata/pull/braid.mjs [N=60]   (~4 min for 200; 50° is left out: some of its solves did not converge) */
import fs from "node:fs";
import { test, stats, laid } from "./js/bench.js";
const N = +process.argv[2] || 60, RUN = { steps: 110, strain: 0.07 }, t0 = Date.now(), out = { n: N, rows: [] };
const REF = stats(Array.from({ length: 400 }, (_, i) => test({ section: "one", seed: i + 1 }, RUN).peak)).mean; out.ref = REF;
const run = (name, theta, material, opts) => { const v = []; let left = 0; for (let s = 1; s <= N; s++) { const r = test({ ...opts, seed: s }, RUN); v.push(r.peak / REF); left = Math.max(left, r.R.left || 0); } const st = stats(v);
  out.rows.push({ name, theta, material, mean: st.mean, cv: st.cv, p5: st.p5, specific: st.mean / material, specific5: st.p5 / material, left });
  console.error(name.padEnd(10), String(theta).padStart(3) + "°", "strength", st.mean.toFixed(2).padStart(5), "cv", (st.cv * 100).toFixed(1).padStart(4) + "%", "weight", material.toFixed(2).padStart(5), "per weight", (st.mean / material).toFixed(3), "5th", (st.p5 / material).toFixed(3), left > 1 ? "UNCONVERGED " + left.toFixed(1) : "", ((Date.now() - t0) / 1000).toFixed(0) + "s"); };
run("loose 3", 0, 3, { section: "plait3", press: { kind: "none" } });
run("loose 7", 0, 7, { section: "may7", press: { kind: "none" } });
for (const th of [10, 20, 30, 40]) { const a = laid(th), strand = { k: a.k, strength: a.strength }, press = { kind: "twist", q: a.q }, core = { k: 1, strength: 1 };
  run("plait", th, 3 * a.material, { section: "plait3", press, tracks: [strand, strand, strand] });
  run("maypole", th, 1 + 6 * a.material, { section: "may7", press, tracks: [core, ...Array(6).fill(strand)] });
  run("served", th, 1 + 6 * a.material, { section: "ribbon7", press, tracks: [core, ...Array(6).fill(strand)] }); }
fs.writeFileSync(new URL("./data/braid.json", import.meta.url), JSON.stringify(out));
