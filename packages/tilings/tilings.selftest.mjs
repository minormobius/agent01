#!/usr/bin/env node
/* tilings — known-answer selftest. Run before touching the package:
     node packages/tilings/tilings.selftest.mjs      (~3 s)

   For every shape: the complex is exact (integer coordinates), closed
   (every interior edge has exactly one tile across it, adjacency is
   symmetric), covers the plane (random points locate a tile), has sane
   areas, and is DETERMINISTIC — a golden signature per shape pins the tile
   count and every coordinate, so a tiling cannot drift under a permalink
   that was built on it. */

import { SHAPES, tiling, FIX, SHAPE_INFO } from "./tilings.js";

let failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.error("  ✗ " + msg); } }
const t0 = Date.now();

// GOLDEN SIGNATURES at R = 10 (shape:tiles:vertices:xsum:ysum). If one fails
// the tiling moved; bump TILINGS_VERSION and re-pin only if that is intended.
const GOLD = {
  grid: "grid:316:357:1967775898",
  hex: "hex:121:282:2286125644",
  penrose: "penrose:389:434:133228954",
  ammann: "ammann:381:422:1113215051",
  seven: "seven:395:441:2608545490",
  rhombille: "rhombille:378:421:3765188529",
  snub: "snub:313:240:3341770689",
  kagome: "kagome:313:366:4052348873",
  rhombitri: "rhombitri:319:366:3137301486",
  truncsq: "truncsq:313:696:4048925419",
};
const PIN = process.argv.includes("--pin");
if (PIN) console.log("  (re-pinning: printing signatures)");

for (const shape of SHAPES) {
  console.log("\n" + shape + " — " + SHAPE_INFO[shape].label);
  const T = tiling(shape, 10);
  ok(T.n > 50, `${shape}: has tiles (${T.n})`);
  // exact
  let ints = true;
  for (let i = 0; i < T.vx.length; i++) if (!Number.isInteger(T.vx[i]) || !Number.isInteger(T.vy[i])) ints = false;
  ok(ints, `${shape}: every vertex is an integer in fixed point`);
  // closed + symmetric
  let bad = 0, asym = 0, interior = 0;
  for (let t = 0; t < T.n; t++) {
    if (T.interior[t]) interior++;
    for (let k = T.nbrStart[t]; k < T.nbrStart[t + 1]; k++) {
      const o = T.nbrList[k];
      let back = false;
      for (let j = T.nbrStart[o]; j < T.nbrStart[o + 1]; j++) if (T.nbrList[j] === t) back = true;
      if (!back) asym++;
    }
    // no directed edge has two different tiles across it beyond the one recorded
    if (T.degree(t) > T.polyLen[t]) bad++;
  }
  ok(asym === 0, `${shape}: edge adjacency is symmetric (${asym} one-way)`);
  ok(bad === 0, `${shape}: no tile has more neighbours than edges`);
  ok(interior > T.n * 0.5, `${shape}: most tiles are interior (${interior} of ${T.n})`);
  // areas
  let amin = Infinity, amax = 0, asum = 0;
  for (let t = 0; t < T.n; t++) { amin = Math.min(amin, T.area[t]); amax = Math.max(amax, T.area[t]); asum += T.area[t]; }
  ok(amin > 0.15 && amax < 6, `${shape}: tile areas in a sane band (${amin.toFixed(3)}–${amax.toFixed(3)})`);
  const disk = Math.PI * 100;
  ok(asum > disk * 0.7 && asum < disk * 1.3, `${shape}: total area ≈ the disk (${asum.toFixed(1)} vs ${disk.toFixed(1)})`);
  // coverage: every point well inside the disk is in some tile (deterministic LCG points)
  let seed = 12345, hits = 0, tries = 0;
  for (let i = 0; i < 2000; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const x = ((seed / 0x7fffffff) * 2 - 1) * 8;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const y = ((seed / 0x7fffffff) * 2 - 1) * 8;
    if (x * x + y * y > 64) continue;
    tries++;
    if (T.locate(Math.round(x * FIX), Math.round(y * FIX)) >= 0) hits++;
  }
  ok(hits === tries, `${shape}: every sampled point inside R−2 locates a tile (${hits}/${tries})`);
  // locate agrees with centroids
  let selfHit = 0;
  for (let t = 0; t < T.n; t++) if (T.locate(T.cx[t], T.cy[t]) === t) selfHit++;
  ok(selfHit === T.n, `${shape}: every centroid locates its own tile (${selfHit}/${T.n})`);
  // vertex adjacency contains edge adjacency
  let missing = 0;
  for (let t = 0; t < T.n; t++) for (let k = T.nbrStart[t]; k < T.nbrStart[t + 1]; k++) {
    const o = T.nbrList[k];
    let found = false;
    for (let j = T.vnbrStart[t]; j < T.vnbrStart[t + 1]; j++) if (T.vnbrList[j] === o) found = true;
    if (!found) missing++;
  }
  ok(missing === 0, `${shape}: every edge neighbour is a vertex neighbour`);
  // along: each directed edge's along-tiles are edge neighbours, not the across tile
  let alongBad = 0, alongTotal = 0;
  for (let t = 0; t < T.n; t++) {
    const s = T.polyStart[t], L = T.polyLen[t];
    for (let i = 0; i < L; i++) for (let k = T.alongStart[s + i]; k < T.alongStart[s + i + 1]; k++) {
      alongTotal++;
      const o = T.alongList[k];
      if (o === T.across[s + i] || o === t) alongBad++;
    }
  }
  ok(alongBad === 0 && alongTotal > 0, `${shape}: along-edge tiles are proper (${alongTotal})`);
  // determinism + golden
  const sig = T.signature();
  ok(tiling(shape, 10).signature() === sig, `${shape}: builds identically twice`);
  if (PIN) console.log(`  ${shape}: "${sig}",`);
  else ok(sig === GOLD[shape], `${shape}: golden signature (got ${sig})`);
}

console.log(`\n${checks} checks, ${failures} failures, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(failures ? 1 : 0);
