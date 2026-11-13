#!/usr/bin/env node
/* PULL's sensitivity study: does the ranking survive the dials? Three numbers in the bench are chosen, not measured:
     HOOP   how hard a hose or hoop is stressed, as a share of its strength (0.5): its press scales with it
     set    the tension a yarn or braid is laid with, as a share of a link's strength (5%)
     μ      friction between neighbours (0.3)
   Each configuration is pulled at half and double each dial that touches it, and given the best thickness or angle
   for that dial (a designer would re-tune). Strength per weight, all weight counted.   node kata/pull/sens.mjs [N=60]   (~10 min) */
import fs from "node:fs";
import { test, stats, laid } from "./js/bench.js";
const N = +process.argv[2] || 60, RUN = { steps: 110, strain: 0.07 }, t0 = Date.now(), out = { n: N, rows: [] };
const REF = stats(Array.from({ length: 400 }, (_, i) => test({ section: "one", seed: i + 1 }, RUN).peak)).mean; out.ref = REF;
const pull = (opts, material) => { const v = []; let left = 0; for (let s = 1; s <= N; s++) { const r = test({ ...opts, seed: s }, RUN); v.push(r.peak / REF); left = Math.max(left, r.R.left || 0); } const st = stats(v); return { mean: st.mean, cv: st.cv, material, specific: st.mean / material, specific5: st.p5 / material, left }; };
/* the configurations: each returns its tunings (label, opts, material) for a given set of dials */
const TAU = [0.05, 0.1, 0.2], ANG = [10, 20, 30];
const CONF = {
  "filaments in a hose": (d) => TAU.map((t) => [`τ ${t}`, { section: "fcc13s", press: { kind: "hoop", p: 0.06 * d.hoop * t }, ribbon: { k: 27 * t, strength: 27 * t }, mu: d.mu }, 13 + 27 * t]),
  "short fibres in a hose": (d) => TAU.map((t) => [`τ ${t}`, { section: "fcc13s", staple: 40, press: { kind: "hoop", p: 0.06 * d.hoop * t }, ribbon: { k: 27 * t, strength: 27 * t }, mu: d.mu }, 13 + 27 * t]),
  "filaments in hoops": (d) => TAU.map((t) => [`τ ${t}`, { section: "fcc13", press: { kind: "hoop", p: 0.06 * d.hoop * t }, mu: d.mu }, 13 + 27 * t]),
  "maypole": (d) => ANG.map((th) => { const a = laid(th), s = { k: a.k, strength: a.strength }; return [`${th}°`, { section: "may7", press: { kind: "twist", q: a.q, set: d.set }, tracks: [{ k: 1, strength: 1 }, s, s, s, s, s, s], mu: d.mu }, 1 + 6 * a.material]; }),
  "plait of three": (d) => ANG.map((th) => { const a = laid(th), s = { k: a.k, strength: a.strength }; return [`${th}°`, { section: "plait3", press: { kind: "twist", q: a.q, set: d.set }, tracks: [s, s, s], mu: d.mu }, 3 * a.material]; }),
  "yarn on a ribbon, hard": (d) => [["", { section: "ribbon7", staple: 40, press: { kind: "twist", q: 0.35, set: d.set }, ribbon: { k: 2, strength: 2 }, mu: d.mu }, 8]],
  "filaments, loose": (d) => [["", { section: "fcc13", press: { kind: "none" }, mu: d.mu }, 13]],
  "a ribbon alone": () => [["", { section: "one", ribbon: { k: 2, strength: 2 } }, 2]],
};
const BASE = { hoop: 0.5, set: 0.05, mu: 0.3 }, DIALS = [["base", {}], ["HOOP ½×", { hoop: 0.25 }], ["HOOP 2×", { hoop: 1 }], ["set 2%", { set: 0.02 }], ["set 10%", { set: 0.1 }], ["μ ½×", { mu: 0.15 }], ["μ 2×", { mu: 0.6 }]];
const touches = { "filaments in a hose": ["hoop", "mu"], "short fibres in a hose": ["hoop", "mu"], "filaments in hoops": ["hoop", "mu"], maypole: ["set", "mu"], "plait of three": ["set", "mu"], "yarn on a ribbon, hard": ["set", "mu"], "filaments, loose": [], "a ribbon alone": [] };
for (const [name, make] of Object.entries(CONF)) for (const [dial, ch] of DIALS) { if (dial !== "base" && !Object.keys(ch).some((k) => touches[name].includes(k))) continue; const d = { ...BASE, ...ch };
  let best = null; for (const [label, opts, material] of make(d)) { const r = pull(opts, material); if (!best || r.specific5 > best.specific5) best = { ...r, at: label }; }
  out.rows.push({ name, dial, ...best }); console.error(name.padEnd(24), dial.padEnd(9), (best.at || "").padEnd(6), "per weight", best.specific.toFixed(3), "5th", best.specific5.toFixed(3), "cv", (best.cv * 100).toFixed(0) + "%", best.left > 1.001 ? "UNCONVERGED " + best.left.toFixed(1) : "", ((Date.now() - t0) / 1000).toFixed(0) + "s"); }
fs.writeFileSync(new URL("./data/sens.json", import.meta.url), JSON.stringify(out));
