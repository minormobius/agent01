#!/usr/bin/env node
/* PULL's robustness study: the two things the first draft never varied, and the assumptions that make a hose a member.
   An independent review (2026-11-16) showed the headline moved with both.
     gauge   the rope's length (24 to 192 sections) and the fibres' scatter (Weibull modulus 5, 10, 20): a single
             strand is a weakest-link chain, so the longer the gauge and the more scattered the fibre, the weaker the
             strand a rope is compared with. Each setting has its own reference strand
     member  the hose as built (stiffness and strength equal to its weight, a fibre's scatter); with the size effect a
             piece of material that much bigger would have; with its axial strength cut for carrying hoop stress as
             well (von Mises at HOOP = 0.5: 0.866; and a pessimistic half); and gripping but carrying almost nothing
   Per weight, hose weighed. Thirteen filaments.   node kata/pull/gauge.mjs [N=40]   (~12 min) → data/gauge.json */
import fs from "node:fs";
import { test, stats, sheath } from "./js/bench.js";
const N = +process.argv[2] || 40, RUN = { steps: 110, strain: 0.045 }, t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0) + "s", out = { n: N, gauge: [], member: [] };
const mean = (opts, n = N) => { const v = []; let left = 0; for (let s = 1; s <= n; s++) { const r = test({ ...opts, seed: s }, RUN); v.push(r.peak); left = Math.max(left, r.R.left || 0); } const st = stats(v); return { mean: st.mean, p5: st.p5, cv: st.cv, left }; };
const hose = (t, base, rib) => { const sh = sheath(4, t); return { ...base, section: "fcc13s", press: { kind: "hoop", p: sh.press, wall: sh.wall }, ribbon: rib ? rib(sh.material) : { k: sh.material, strength: sh.material } }; };
for (const [S, m] of [[24, 5], [48, 5], [96, 5], [192, 5], [96, 10], [96, 20]]) { const base = { S, m }, ref = mean({ ...base, section: "one" }, 400), row = { S, m, strandCv: ref.cv };
  const per = (r, W) => ({ specific: r.mean / ref.mean / W, specific5: r.p5 / ref.mean / W, left: r.left });
  row.loose = per(mean({ ...base, section: "fcc13", press: { kind: "none" } }), 13);
  row.hoops = per(mean({ ...base, section: "fcc13", press: { kind: "hoop", p: sheath(4, 0.1).press } }), 13 + 2.7);
  row.hose01 = per(mean(hose(0.1, base)), 15.7); row.hose02 = per(mean(hose(0.2, base)), 18.4);
  out.gauge.push(row); console.error("S", String(S).padEnd(4), "m", String(m).padEnd(3), "strand cv", (ref.cv * 100).toFixed(0) + "%", "loose", row.loose.specific.toFixed(3), "hoops", row.hoops.specific.toFixed(3), "hose τ0.1", row.hose01.specific.toFixed(3), "τ0.2", row.hose02.specific.toFixed(3), sec()); }
const ref = mean({ section: "one" }, 400).mean;
for (const [name, rib] of [["as built", null], ["with a size effect on its strength", (M) => ({ k: M, strength: M ** (1 - 1 / 5) })], ["axial strength × 0.866 (carrying hoop stress too)", (M) => ({ k: M, strength: 0.866 * M })], ["axial strength halved", (M) => ({ k: M, strength: 0.5 * M })], ["gripping, carrying almost nothing", (M) => ({ k: M / 100, strength: M })]]) {
  const a = mean(hose(0.1, {}, rib), 60), b = mean(hose(0.2, {}, rib), 60); out.member.push({ name, tau01: a.mean / ref / 15.7, tau02: b.mean / ref / 18.4, left: Math.max(a.left, b.left) }); console.error(name.padEnd(48), (a.mean / ref / 15.7).toFixed(3), (b.mean / ref / 18.4).toFixed(3), sec()); }
fs.writeFileSync(new URL("./data/gauge.json", import.meta.url), JSON.stringify(out)); console.error("done", sec());
