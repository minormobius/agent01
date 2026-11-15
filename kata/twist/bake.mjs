#!/usr/bin/env node
/* TWIST's baked runs: what the paper's twist figures and numbers are drawn from. Everything is `makeYarn` with its
   defaults (7 fibres of 33 beads, length 4, fibre radius 0.1, stretch 3%, 30 000 steps) unless said.
     traces   two turns in 3D and in 4D, read every 500 steps: turns still wound, energy, squeeze on the core
     ends     the rest state for 0 to 3 turns, in 3D and 4D
     ribbon   4D, two turns, the core a rigid ribbon of half-width 0.05 to 0.45
     hosed    thirteen fibres in a hose (wall 0.19; fibres touch at 0.20), 0 to 5 turns, three seeds; and with no hose
   node kata/twist/bake.mjs   (~4 min) → data/twist.json */
import fs from "node:fs";
import { makeYarn } from "./js/yarn.js";
const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0) + "s", r4 = (x) => +x.toPrecision(5), STEPS = 30000;
const end = (o, steps = STEPS) => { const Y = makeYarn(o); Y.step(steps); const m = Y.measure(); return { wound: r4(m.wind), energy: r4(m.energy), squeeze: r4(m.squeeze), hold: r4(m.hold), out: r4(m.out), moving: m.moving }; };
const trace = (o, every = 500, steps = STEPS) => { const Y = makeYarn(o), v = []; for (let t = 0; t <= steps; t += every) { const m = Y.measure(); v.push({ t, wound: r4(m.wind), energy: r4(m.energy), squeeze: r4(m.squeeze) }); Y.step(every); } return v; };
const out = { steps: STEPS, defaults: { fibres: 7, beads: 33, length: 4, radius: 0.1, ring: 0.212, strain: 0.03, ks: 3000, kc: 6000, dt: 0.006, damp: 0.985, noise: 2e-3 } };
out.traces = { d3: trace({ d: 3, turns: 2 }), d4: trace({ d: 4, turns: 2 }) }; console.error("traces", sec());
out.ends = []; for (const d of [3, 4]) for (const turns of [0, 0.5, 1, 1.5, 2, 3]) out.ends.push({ d, turns, ...end({ d, turns }) }); console.error("ends", sec());
out.still = end({ d: 4, turns: 2, noise: 0 }); /* (no jiggle: the 4D twist stands, an unstable equilibrium) */
out.ribbon = [0.05, 0.1, 0.2, 0.3, 0.45].map((tape) => ({ tape, ...end({ d: 4, turns: 2, tape }) })); console.error("ribbon", sec());
out.hosed = { wall: 0.19, touch: 0.2, rows: [], free: [] };
for (const seed of [1, 7, 13]) for (const turns of [0, 1, 2, 3, 4, 5]) { out.hosed.rows.push({ seed, turns, ...end({ d: 4, pack: 13, wall: 0.19, turns, seed }, 40000) }); console.error("hosed seed", seed, "turns", turns, out.hosed.rows.at(-1).energy, sec()); }
for (const turns of [0, 1, 2, 3]) out.hosed.free.push({ turns, ...end({ d: 4, pack: 13, turns }, 40000) });
out.hosed.traces = { one: trace({ d: 4, pack: 13, wall: 0.19, turns: 1 }, 1000, 40000), two: trace({ d: 4, pack: 13, wall: 0.19, turns: 2 }, 1000, 40000) };
fs.writeFileSync(new URL("./data/twist.json", import.meta.url), JSON.stringify(out)); console.error("done", sec());
