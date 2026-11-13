#!/usr/bin/env node
/* PULL's sheath study: what weight of sheath pays. A bundle of continuous filaments, or of short fibres, in a sheath
   of thickness τ (in fibre radii), three ways: HOSE, a closed skin that grips and also carries load along the rope (it
   is a member, as strong as its material); HOOPS, the same material as separate hoops, which grip and carry nothing
   along the rope (a weave's hoops; its lengthwise bands are just more filaments); and for comparison ours, seven in a
   tube, for its grip only. Strength per material, the sheath's weight counted.   node kata/pull/sheath.mjs [N=60]   (~8 min) */
import fs from "node:fs";
import { test, stats, sheath } from "./js/bench.js";
const N = +process.argv[2] || 60, RUN = { steps: 110, strain: 0.045 }, TAU = [0, 0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5], out = { n: N, tau: TAU, rows: [] }, t0 = Date.now();
const ref = stats(Array.from({ length: 400 }, (_, i) => test({ section: "one", seed: i + 1 }, RUN).peak)).mean; out.ref = ref;
for (const [kind, dim, staple, member] of [["hose", 4, 0, true], ["hoops", 4, 0, false], ["hose, short fibres", 4, 40, true], ["hoops, short fibres", 4, 40, false], ["tube, grip only (3D)", 3, 0, false], ["tube, grip only (3D), short fibres", 3, 40, false]]) for (const t of TAU) { const sh = sheath(dim, t), v = [];
  const opts = { section: member && t > 0 && dim === 4 ? "fcc13s" : sh.section, staple, press: t > 0 ? { kind: "hoop", p: sh.press, ...(member && dim === 4 ? { wall: sh.wall } : {}) } : { kind: "none" }, ...(member && t > 0 && dim === 4 ? { ribbon: { k: sh.material, strength: sh.material } } : {}) };
  /* (the 3D tube is run for its grip only: a seven with a sheath track isn't built, so its rows are comparable to HOOPS, not HOSE) */
  for (let s = 1; s <= N; s++) v.push(test({ ...opts, seed: s }, RUN).peak / ref);
  const st = stats(v), mat = sh.fibres + sh.material; out.rows.push({ kind, dim, staple, member, tau: t, press: sh.press, material: mat, mean: st.mean, cv: st.cv, p5: st.p5, specific: st.mean / mat, specific5: st.p5 / mat });
  console.error(kind.padEnd(24), "τ/r", String(t).padEnd(5), "sheath", sh.material.toFixed(2).padStart(5), "strength", st.mean.toFixed(2).padStart(6), "cv", (st.cv * 100).toFixed(0).padStart(2) + "%", "specific", (st.mean / mat).toFixed(3), "5th", (st.p5 / mat).toFixed(3), ((Date.now() - t0) / 1000).toFixed(0) + "s"); }
fs.writeFileSync(new URL("./data/sheath.json", import.meta.url), JSON.stringify(out));
