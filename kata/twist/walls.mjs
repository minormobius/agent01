#!/usr/bin/env node
/* TWIST: does the kept turn need the bundle squeezed? Thirteen fibres, 0 to 3 turns, with the wall tight (0.19),
   just touching (0.20) and loose (0.215: nothing is compressed), three seeds, plain relaxation.
   (After the independent review of 2026-11-16, which found the odd turn stays even with the wall loose.)
   node kata/twist/walls.mjs   (~3 min) → data/walls.json */
import fs from "node:fs";
import { makeYarn } from "./js/yarn.js";
const out = { rows: [] }, t0 = Date.now();
for (const wall of [0.19, 0.2, 0.215]) for (const turns of [0, 1, 2, 3]) for (const seed of [1, 7, 13]) { const Y = makeYarn({ d: 4, pack: 13, wall, turns, seed }); Y.step(40000); const m = Y.measure(); out.rows.push({ wall, turns, seed, energy: +m.energy.toPrecision(5), moving: m.moving }); console.error("wall", wall, "turns", turns, "seed", seed, "energy", m.energy.toFixed(1), ((Date.now() - t0) / 1000).toFixed(0) + "s"); }
fs.writeFileSync(new URL("./data/walls.json", import.meta.url), JSON.stringify(out));
