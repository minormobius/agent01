#!/usr/bin/env node
/* PULL's map: strength and reliability over the two things that drive the ranking, fibre scatter (Weibull modulus) and
   friction, with the hose as a material with flaws (js/hose.js, baseline) and its thickness and tightness optimised in
   every cell on seeds 1–30 and reported on seeds 31–90. Thirteen filaments, 96 sections; each cell has its own
   reference strand.   node kata/pull/map.mjs 3,5   (one process a list of moduli) → data/map-<modulus>.json */
import fs from "node:fs";
import { test, stats, TALLY } from "./js/bench.js";
import { hoseRope } from "./js/hose.js";
const MS = (process.argv[2] || "5").split(",").map(Number), MU = [0.15, 0.3, 0.6], RUN = { steps: 110, strain: 0.045 }, t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0) + "s", seeds = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
for (const m of MS) { TALLY.reset(); const ref = stats(seeds(1, 400).map((s) => test({ section: "one", m, seed: s }, RUN)).map((r) => r.peak)), out = { m, strandCv: ref.cv, cells: [] };
  const pull = (v, ss) => { const p = []; let W = 0; for (const s of ss) { const h = hoseRope({ m, ...v }, s); W = h.material; p.push(test(h.opts, RUN).peak / ref.mean / W); } const st = stats(p); return { mean: st.mean, p5: st.p5, cv: st.cv, se: st.sd / Math.sqrt(st.n) }; };
  const tuned = (v, grid) => { let best = null; for (const g of grid) { const r = pull({ ...v, ...g }, seeds(1, 30)); if (!best || r.p5 > best.p5) best = { ...g, p5: r.p5 }; } return { tau: best.tau, hoop: best.hoop, ...pull({ ...v, tau: best.tau, hoop: best.hoop }, seeds(31, 90)) }; };
  for (const mu of MU) { const l = stats(seeds(31, 90).map((s) => test({ section: "fcc13", m, mu, press: { kind: "none" }, seed: s }, RUN).peak / ref.mean / 13));
    const hose = tuned({ mu }, [0.05, 0.1, 0.2].flatMap((tau) => [0.1, 0.2, 0.3].map((hoop) => ({ tau, hoop })))), hoops = tuned({ mu, member: false }, [0.05, 0.1].flatMap((tau) => [0.1, 0.3].map((hoop) => ({ tau, hoop }))));
    out.cells.push({ mu, loose: { mean: l.mean, p5: l.p5, cv: l.cv }, hose, hoops }); console.error("m", m, "μ", mu, "strand cv", (ref.cv * 100).toFixed(0) + "%", "loose", l.mean.toFixed(3), "hoops", hoops.mean.toFixed(3), "hose", hose.mean.toFixed(3), "±", hose.se.toFixed(3), `(τ ${hose.tau}, hoop ${hose.hoop})`, "p5: strand", (ref.p5 / ref.mean).toFixed(2), "hose", hose.p5.toFixed(2), sec()); }
  out.status = TALLY.record; fs.writeFileSync(new URL(`./data/map-${m}.json`, import.meta.url), JSON.stringify(out)); }
console.error("done", sec());
