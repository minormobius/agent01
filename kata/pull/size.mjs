#!/usr/bin/env node
/* PULL's bundle-size study, with a six-neighbour control. Is a bigger bundle a better rope, and does it matter that a
   4D fibre has twelve neighbours where ours has six?
     4D   cuboctahedral clusters: 13 and 55 fibres (147 is beyond the solver here)
     3D   hexagonal bundles: 7, 19, 37 and 61, in a tube that carries load: the like-for-like rope in our world
   Each loose, and in a hose whose thickness (0.05 or 0.1 of a fibre radius for the smallest bundle, growing with the
   bundle's radius, which keeps the press at a contact the same) and tightness (0.1, 0.2, 0.3 of strength) are chosen on
   seeds 1–15 by the mean and reported on seeds 16–55. The hose is the flawed material of js/hose.js. 48 sections (the larger bundles are slow), Weibull modulus 5, friction 0.3; each
   world's reference is one strand of that length. 
   node kata/pull/size.mjs 4:1,3:1,3:2,3:3   (dim:shells, one process a list) → data/size-<dim>-<shells>.json */
import fs from "node:fs";
import { test, stats, TALLY } from "./js/bench.js";
import { bundleRope } from "./js/hose.js";
const N = 40, RUN = { steps: 110, strain: 0.045 }, t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0) + "s", ref = stats(Array.from({ length: 400 }, (_, i) => test({ section: "one", S: 48, seed: i + 1 }, RUN).peak));
for (const spec of (process.argv[2] || "4:1").split(",")) { const [dim, k] = spec.split(":").map(Number); TALLY.reset();
  const run = (v) => { const p = []; let W = 0, n = 0, split = 0, bad = 0; for (let s = 1; s <= N; s++) { const h = bundleRope({ dim, k, ...v }, s), t = test(h.opts, RUN); W = h.material; n = h.fibres; split += h.split / N; if (t.R.left > 1.001) bad++; p.push(t.peak / ref.mean / W); } const st = stats(p); return { fibres: n, weight: W, mean: st.mean, se: st.sd / Math.sqrt(N), p5: st.p5, cv: st.cv, split, unconverged: bad }; };
  /* a bigger skin has more flaws, so the tightness that suits a small bundle splits a large one: tune both at every size */
  const run2 = (v, a, b) => { const p = []; let W = 0, split = 0, bad = 0; for (let s = a; s <= b; s++) { const h = bundleRope({ dim, k, ...v }, s), t = test(h.opts, RUN); W = h.material; split += h.split / (b - a + 1); if (t.R.left > 1.001) bad++; p.push(t.peak / ref.mean / W); } const st = stats(p); return { weight: W, mean: st.mean, se: st.sd / Math.sqrt(st.n), p5: st.p5, cv: st.cv, split, unconverged: bad }; };
  let best = null; const grid = []; for (const f of [0.05, 0.1]) for (const hoop of [0.1, 0.2, 0.3]) { const tau = (f * (2 * k + 1)) / 3, r = run2({ tau, hoop }, 1, 15); grid.push({ tau, hoop, mean: r.mean, unconverged: r.unconverged }); if (!r.unconverged && (!best || r.mean > best.mean)) best = { tau, hoop, mean: r.mean }; }
  const loose = run2({ loose: true }, 16, 55), hose = run2({ tau: best.tau, hoop: best.hoop }, 16, 55), tau = best.tau, n = bundleRope({ dim, k, loose: true }, 1).fibres;
  loose.fibres = n; const out = { dim, k, S: 48, n: 40, tau, hoop: best.hoop, grid, ref: ref.mean, strandCv: ref.cv, loose, hose, status: TALLY.record };
  fs.writeFileSync(new URL(`./data/size-${dim}-${k}.json`, import.meta.url), JSON.stringify(out));
  console.error(`${dim}D`, "fibres", String(loose.fibres).padStart(3), "loose", loose.mean.toFixed(3), "cv", (loose.cv * 100).toFixed(0) + "%", "| hose τ", tau.toFixed(3), "hoop", best.hoop, "split", (hose.split * 100).toFixed(0) + "%", "weight", hose.weight.toFixed(1), "→", hose.mean.toFixed(3), "±", hose.se.toFixed(3), "p5", hose.p5.toFixed(3), "cv", (hose.cv * 100).toFixed(0) + "%", "ratio", (hose.mean / loose.mean).toFixed(2), "unconv", loose.unconverged + hose.unconverged, sec()); }
