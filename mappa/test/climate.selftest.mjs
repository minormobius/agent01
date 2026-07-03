// climate.selftest.mjs — guards the climate-engine extraction (computeClimate).
//
// Two contracts:
//  1. NON-BREAKING: generateWorld is bit-identical to the pre-extraction engine.
//     Locked with checksums for a fixed (seed, N). If tectonics/erosion/climate ever
//     drift, these fail — that is the point (mappa determinism underpins the atlas,
//     city placement, and every frozen ATProto world record).
//  2. RE-RUNNABLE: computeClimate on the SAME fixed geology, with a colder/drier
//     forcing, yields a colder, more glaciated climate — and draws no rng (so it is a
//     pure function of geometry+forcing and can run per-era on a frozen region).
//
// Run: node mappa/test/climate.selftest.mjs   (from the repo root)

import { generateWorld, computeClimate, BIOMES } from '../engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const near = (a, b, e = 1e-3) => Math.abs(a - b) <= e;
function sum(a) { let s = 0; for (let i = 0; i < a.length; i++) s = (s * 1.0000001 + a[i]) % 1e9; return +s.toFixed(3); }
const BI = Object.fromEntries(BIOMES.map((b, i) => [b.id, i]));
const coldLand = (w, bm) => { let c = 0; for (let i = 0; i < w.N; i++) if (w.water[i] === 0 && (bm[i] === BI.glacier || bm[i] === BI.ice || bm[i] === BI.tundra || bm[i] === BI.taiga)) c++; return c; };
const meanLand = (w, t) => { let s = 0, n = 0; for (let i = 0; i < w.N; i++) if (w.water[i] === 0) { s += t[i]; n++; } return s / Math.max(1, n); };

const w = generateWorld(12345, { N: 7000 });

// ---- 1. non-breaking checksums (seed 12345, N 7000 → 5092 cells) ------------
console.log('non-breaking (generateWorld bit-identical):');
ok(w.N === 5092, `cell count stable (${w.N})`);
ok(near(sum(w.elev), -1831.819), 'elevation checksum');
ok(near(sum(w.temperature), 75534.619), 'temperature checksum');
ok(near(sum(w.moisture), 3263.839), 'moisture checksum');
ok(near(sum(w.biome), 20919.891), 'biome checksum');
ok(near(sum(w.seasonality), 41871.248), 'seasonality checksum');
ok(w.rivers.length === 88, `river count stable (${w.rivers.length})`);
ok(w.meta.windCells === 4 && w.meta.coriolisSign === 1, 'wind meta stable');

// ---- 2. re-runnable climate on the same geology -----------------------------
console.log('re-runnable climate engine (computeClimate):');
const geo = { N: w.N, V: w.V, adj: w.adj, elev: w.elev, water: w.water };
const forcing = { seed: w.meta.seed, solar: 1, axialTilt: w.meta.axialTilt, rotationRate: w.meta.rotationRate };

// re-run with the world's own forcing → must reproduce generateWorld's fields exactly
const same = computeClimate(geo, forcing);
ok(near(sum(same.temperature), sum(w.temperature)) && near(sum(same.biome), sum(w.biome)),
   're-run with native forcing reproduces the baseline climate');

// deterministic: same inputs → same outputs (no rng, no Date.now)
const same2 = computeClimate(geo, forcing);
ok(sum(same2.temperature) === sum(same.temperature) && sum(same2.moisture) === sum(same.moisture),
   'computeClimate is deterministic (pure function of geometry+forcing)');

// a glacial forcing → colder, more glaciated
const ice = computeClimate(geo, { ...forcing, tempOffset: -7, seaLevelOffset: -0.03 });
ok(meanLand(w, ice.temperature) < meanLand(w, w.temperature) - 5, 'glacial forcing lowers mean land temperature');
ok(coldLand(w, ice.biome) > coldLand(w, w.biome), `glacial forcing spreads cold biomes (${coldLand(w, w.biome)} → ${coldLand(w, ice.biome)})`);

// a hot-house forcing → warmer, fewer cold biomes
const hot = computeClimate(geo, { ...forcing, tempOffset: +6, seaLevelOffset: +0.02 });
ok(meanLand(w, hot.temperature) > meanLand(w, w.temperature) + 4, 'hot-house forcing raises mean land temperature');
ok(coldLand(w, hot.biome) <= coldLand(w, w.biome), 'hot-house forcing shrinks cold biomes');

console.log(fail === 0 ? `\n✓ all green — ${pass} passed, 0 failed` : `\n✗ ${fail} FAILED (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
