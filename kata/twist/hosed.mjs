#!/usr/bin/env node
/* TWIST's hosed-bundle study: is twist in a bundle held together kept mod 2 turns?
   Thirteen fibres (one and the twelve round it), clamped at both ends, given 0 to 4 turns in quarter turns about a
   fourfold axis of the packing (so every quarter turn puts the top end back on the packing's own sites), stretched,
   annealed (six kicks of falling size, each followed by a relaxation) and brought to rest.
     hosed   inside a wall at 0.19 (fibres touch at 0.20): the bundle turns as a body
     free    no wall: thirteen independent fibres
   If a bundle that turns as a body keeps twist the way a body's rotations allow (the belt trick), its rest energy
   should depend on the twist modulo TWO turns and be the same at t and 2 − t. Free fibres' ends differ only by the
   twist modulo ONE turn. So: hosed, period 2 with a mirror at 1; free, period 1 with a mirror at ½.
   node kata/twist/hosed.mjs [seeds=3]   (~12 min) → data/hosed.json */
import fs from "node:fs";
import { makeYarn } from "./js/yarn.js";
const SEEDS = [1, 7, 13, 21, 34].slice(0, +process.argv[2] || 3), TURNS = Array.from({ length: 17 }, (_, k) => k / 4), KICKS = [0.02, 0.015, 0.01, 0.007, 0.004, 0.002], t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0) + "s";
const rest = (o) => { const Y = makeYarn(o); Y.step(8000); let best = Infinity; for (const k of KICKS) { Y.kick(k); Y.step(6000); } Y.step(30000); const m = Y.measure(); best = m.energy; return { energy: +best.toPrecision(6), moving: m.moving }; };
const out = { wall: 0.19, touch: 0.2, kicks: KICKS, turns: TURNS, hosed: [], free: [] };
for (const seed of SEEDS) for (const turns of TURNS) { const r = rest({ d: 4, pack: 13, wall: 0.19, turns, seed }); out.hosed.push({ seed, turns, ...r }); console.error("hosed seed", seed, "turns", turns.toFixed(2), "energy", r.energy.toFixed(1), sec()); }
for (const turns of TURNS) { const r = rest({ d: 4, pack: 13, turns, seed: 1 }); out.free.push({ turns, ...r }); console.error("free turns", turns.toFixed(2), "energy", r.energy.toFixed(2), sec()); }
fs.mkdirSync(new URL("./data/", import.meta.url), { recursive: true }); fs.writeFileSync(new URL("./data/hosed.json", import.meta.url), JSON.stringify(out)); console.error("done", sec());
