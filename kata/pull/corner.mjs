#!/usr/bin/env node
/* PULL's audit follow-ups (Astra, 2026-11-16), at the reference rope (96 sections, Weibull modulus 5):
     corner   friction and hose stress BOTH halved (their product a quarter): the published sensitivity study moved one
              at a time. Hose at three thicknesses and the loose bundle, 60 pulls; seeds 1–60 choose the thickness and
              seeds 61–120 report it, so the tuned figure is not read off the sample that tuned it
     refine   the loading increment: 110, 440 and 1760 steps to the same stretch, the same 20 seeds, with the reference
              strand re-pulled at each (a strand's peak is read low when the steps are coarse)
     status   over every pull here: the worst convergence flag, how many solves stopped on a stalled line search (accepted
              when the force imbalance is under a millionth of a link's strength), and the worst such imbalance
   node kata/pull/corner.mjs   (~8 min) → data/corner.json */
import fs from "node:fs";
import { test, stats, sheath } from "./js/bench.js";
const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0) + "s", out = { corner: {}, refine: [], status: { worstLeft: 0, stalled: 0, pulls: 0, worstResidual: 0 } };
const pull = (opts, run, seeds) => { const v = []; for (const s of seeds) { const r = test({ ...opts, seed: s }, run); v.push(r.peak); out.status.worstLeft = Math.max(out.status.worstLeft, r.R.left || 0); out.status.stalled += r.R.stalled || 0; out.status.worstResidual = Math.max(out.status.worstResidual, r.R.resid || 0); out.status.pulls++; } return stats(v); };
const seeds = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k), RUN = { steps: 110, strain: 0.045 };
const hose = (t, f) => { const sh = sheath(4, t); return { section: "fcc13s", mu: 0.3 * f.mu, press: { kind: "hoop", p: sh.press * f.hoop, wall: sh.wall * f.hoop }, ribbon: { k: sh.material, strength: sh.material } }; };
const ref = pull({ section: "one" }, RUN, seeds(1, 400)).mean, f = { mu: 0.5, hoop: 0.5 }, loose = pull({ section: "fcc13", press: { kind: "none" } }, RUN, seeds(1, 60));
out.corner.loose = loose.mean / ref / 13; out.corner.rows = [];
for (const t of [0.05, 0.1, 0.2]) { const W = 13 + 27 * t, a = pull(hose(t, f), RUN, seeds(1, 60)), b = pull(hose(t, f), RUN, seeds(61, 120)); out.corner.rows.push({ tau: t, tune: { mean: a.mean / ref / W, p5: a.p5 / ref / W }, report: { mean: b.mean / ref / W, p5: b.p5 / ref / W, se: b.sd / Math.sqrt(b.n) / ref / W } }); console.error("corner τ", t, "tune", (a.mean / ref / W).toFixed(3), (a.p5 / ref / W).toFixed(3), "report", (b.mean / ref / W).toFixed(3), "±", (b.sd / Math.sqrt(b.n) / ref / W).toFixed(3), sec()); }
for (const steps of [110, 440, 1760]) { const run = { steps, strain: 0.045 }, r = pull({ section: "one" }, run, seeds(1, 200)).mean, h = pull(hose(0.1, { mu: 1, hoop: 1 }), run, seeds(1, 20)).mean, l = pull({ section: "fcc13", press: { kind: "none" } }, run, seeds(1, 20)).mean; out.refine.push({ steps, strand: r, hose: h / r / 15.7, loose: l / r / 13 }); console.error("steps", steps, "strand", r.toFixed(7), "hose", (h / r / 15.7).toFixed(4), "loose", (l / r / 13).toFixed(4), sec()); }
fs.writeFileSync(new URL("./data/corner.json", import.meta.url), JSON.stringify(out)); console.error("done", JSON.stringify(out.status), sec());
