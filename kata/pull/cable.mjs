#!/usr/bin/env node
/* PULL's cabling study, and the self-tightening sheath.
   CABLING: thirteen ropes in a sheath, then thirteen of those. Each level is the same bench with the level below as
   its fibre: the element's link strengths are Weibull with the modulus and scale that reproduce the element's own
   measured distribution at this length, its stiffness and weight are the element's, and the sheath's thickness τ is in
   element radii. What differs from the level below: the elements are already uniform; an element is partly hollow
   (its fibres fill 27 fibre-sections' worth of space), so the sheath round thirteen of them is heavier for its τ and
   presses harder per unit of element stiffness; and a broken element here carries nothing (in fact it would keep a
   frictional plateau: so this is the pessimistic case).
   TRAP: a sheath whose press is c × its own tension.   node kata/pull/cable.mjs [N=100]   (~10 min) */
import fs from "node:fs";
import { test, stats, HOOP } from "./js/bench.js";
const N = +process.argv[2] || 100, RUN = { steps: 110, strain: 0.045 }, S = 96, t0 = Date.now(), out = { n: N, levels: [], trap: [] }, sec = () => ((Date.now() - t0) / 1000).toFixed(0) + "s";
const lg = (z) => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.001208650973866179, -0.000005395239384953]; let x = z, y = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let ser = 1.000000000190015; for (const cj of c) ser += cj / ++y; return -t + Math.log((2.5066282746310005 * ser) / x); };
/* an element: strength distribution (in strands) with mean and modulus m at this length, stiffness K and weight W in fibres, solid-equivalent section V in fibre sections */
const pulls = (el, opts) => { /* link scale so that the weakest of S − 1 links has the element's mean; forces in units of the element's stiffness */ const sigma = (el.mean * REF) / el.K / ((S - 1) ** (-1 / el.m) * Math.exp(lg(1 + 1 / el.m))); const v = []; for (let s = 1; s <= N; s++) v.push((test({ ...opts, sigma, m: el.m, seed: s }, RUN).peak * el.K) / REF); return stats(v); };
const REF = stats(Array.from({ length: 400 }, (_, i) => test({ section: "one", seed: i + 1 }, RUN).peak)).mean; out.ref = REF;
let el = { name: "fibre", mean: 1, m: 5, K: 1, W: 1, V: 1 };
for (let level = 1; level <= 3; level++) { const rows = [];
  for (const t of [0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2]) { /* thirteen elements, hoops τ element-radii thick: weight 27 τ V, press 0.02 HOOP τ × V/K per contact (a third of the skin's force on an element) */
    const st = pulls(el, { section: "fcc13", press: t > 0 ? { kind: "hoop", p: 0.02 * HOOP * t * (el.V / el.K) } : { kind: "none" } }), W = 13 * el.W + 27 * t * el.V;
    rows.push({ level, tau: t, mean: st.mean, cv: st.cv, p5: st.p5, weibull: st.weibull, material: W, specific: st.mean / W, specific5: st.p5 / W });
    console.error(`level ${level} (13 × ${el.name})`.padEnd(26), "τ", String(t).padEnd(6), "strength", st.mean.toFixed(1).padStart(7), "cv", (st.cv * 100).toFixed(1).padStart(4) + "%", "weight", W.toFixed(1).padStart(7), "specific", (st.mean / W).toFixed(3), "5th", (st.p5 / W).toFixed(3), sec()); }
  const best = rows.reduce((a, b) => (b.specific5 > a.specific5 ? b : a)); out.levels.push({ level, element: el.name, rows, best: best.tau });
  el = { name: level === 1 ? "rope" : "cable", mean: best.mean, m: best.weibull, K: 13 * el.K, W: best.material, V: 27 * el.V }; }
/* the self-tightening sheath: thirteen filaments in a hose τ thick that is a member and presses c × its own tension */
for (const [theta, staple] of [[35, 0], [45, 0], [55, 0], [45, 40], [55, 40]]) for (const t of [0.01, 0.02, 0.05, 0.1]) { const c = Math.tan((theta * Math.PI) / 180) ** 2 / 9, v = []; for (let s = 1; s <= N; s++) v.push(test({ section: "fcc13s", staple, press: { kind: "trap", c }, ribbon: { k: 27 * t, strength: 27 * t }, seed: s }, RUN).peak / REF); const st = stats(v), W = 13 + 27 * t;
  out.trap.push({ theta, staple, tau: t, c, mean: st.mean, cv: st.cv, p5: st.p5, material: W, specific: st.mean / W, specific5: st.p5 / W }); console.error(`trap ${theta}°${staple ? ", short fibres" : ""}`.padEnd(26), "τ", String(t).padEnd(6), "strength", st.mean.toFixed(1).padStart(7), "cv", (st.cv * 100).toFixed(1).padStart(4) + "%", "weight", W.toFixed(1).padStart(7), "specific", (st.mean / W).toFixed(3), "5th", (st.p5 / W).toFixed(3), sec()); }
fs.writeFileSync(new URL("./data/cable.json", import.meta.url), JSON.stringify(out));
