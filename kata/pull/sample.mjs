#!/usr/bin/env node
/* PULL's samples: every species pulled to failure N times (seeds 1…N), the peaks written to data/samples.json.
   node kata/pull/sample.mjs [N=200]      (~6 minutes for 200) */
import fs from "node:fs";
import { test, SPECIES, stats } from "./js/bench.js";
const N = +process.argv[2] || 200, RUN = { steps: 110, strain: 0.045 }, out = { n: N, run: RUN, peaks: {}, curve: {} }, t0 = Date.now();
for (const sp of SPECIES) { const v = []; for (let s = 1; s <= N; s++) { const r = test({ ...sp.opts, seed: s }, RUN); v.push(+r.peak.toPrecision(6)); if (s === 1) out.curve[sp.id] = r.curve.map((x) => +x.toPrecision(4)); } out.peaks[sp.id] = v; const st = stats(v); console.error(sp.id.padEnd(11), "mean", st.mean.toFixed(5), "cv", (st.cv * 100).toFixed(1) + "%", "p5", st.p5.toFixed(5), ((Date.now() - t0) / 1000).toFixed(0) + "s"); }
fs.mkdirSync(new URL("./data/", import.meta.url), { recursive: true }); fs.writeFileSync(new URL("./data/samples.json", import.meta.url), JSON.stringify(out));
