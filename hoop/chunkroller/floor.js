// chunkroller/floor.js — the BOUNDED FLOOR + CHUNK BIOME + EDGE TILE model.
//
// Three concepts, one module:
//   • CHUNK BIOME — every chunk gets a deterministic biome (a named ROLE_MIX bias) keyed to its position
//     + the floor seed, so a floor grows VARIED WARDS (a market here, a cloister there) reproducibly.
//   • BOUNDED FLOOR — floor 1 is a FINITE hand of ~7–10 chunks, not an endless stream. We grow exactly
//     `count` chunks off the real tiler (manager.js reflection), compactly, from the origin.
//   • EDGE TILE — once the floor stops growing, every chunk edge with no neighbour is a FRONTIER that the
//     bounded floor SEALS: an edge tile (the floor's wall) instead of a streaming seam.
//   • no-baddies floor 1 — `noBaddies` rides on the floor (depth === 1), the per-floor creature gate.
//
// Pure (no DOM): grows real solveChunk records. Node-tested in test/floor.selftest.mjs.

import { solveChunk } from '../v099/v8/chunkgen.js';
import { createWorld, addChunk, neighbourSpec, edgeFree } from '../v099/v8/manager.js';
import { BIOMES, BIOME_GRAND, mixFromSliders } from './biomes.js';
import { GRAND_ROLES, GRAND_MIN, MIN_ROOM, TRAFFIC_FOOTPRINT } from '../v099/rooms.js';

export const BIOME_KEYS = Object.keys(BIOMES);
const centroid = (poly) => { let x = 0, y = 0; for (const p of poly) { x += p.x; y += p.y; } return { x: x / poly.length, y: y / poly.length }; };

// deterministic biome for a chunk, keyed to its (quantized) centroid + the floor seed. Same floor seed ⇒
// same ward map, on any machine (atproto-stable, like the rest of generation).
export function chunkBiomeAt(floorSeed, cx, cy) {
  const q = (v) => Math.round(v / 40);
  let h = (floorSeed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ q(cx), 0x85ebca6b); h = Math.imul(h ^ (q(cy) + 0x165667b1), 0xc2b2ae35); h ^= h >>> 16;
  return BIOME_KEYS[(h >>> 0) % BIOME_KEYS.length];
}

// grow a bounded floor of `count` chunks off the real tiler, compactly from the origin, each chunk solved
// with its biome's roleMix. Returns the world + per-chunk biome + the sealed edge tiles + the floor flags.
export function growFloor(floorSeed, { count = 9, depth = 1, W = 900, H = 600, portRange = [1, 4] } = {}) {
  const world = createWorld();
  const biomeOf = [];
  const solveFor = (opts, cx, cy) => {
    const bk = chunkBiomeAt(floorSeed, cx, cy);
    const grand = BIOME_GRAND[bk] || GRAND_ROLES;
    const rec = solveChunk({
      ...opts, seed: (floorSeed ^ (world.chunks.length * 0x9e37 + 0x51)) >>> 0, W, H,
      roomSize: 14, footprint: TRAFFIC_FOOTPRINT, grand, grandMin: GRAND_MIN, minRoom: MIN_ROOM,
      roleMix: mixFromSliders(BIOMES[bk].sliders), portRange,
    });
    biomeOf.push(bk);
    return addChunk(world, rec);
  };

  const c0 = solveFor({}, W / 2, H / 2);
  const origin = centroid(c0.poly);

  let guard = 0;
  while (world.chunks.length < count && guard++ < count * 12) {
    // pick the (chunk, free edge) whose neighbour would land NEAREST the origin → a compact floor, not a line.
    let bestCh = -1, bestE = -1, bd = Infinity, bestC = null;
    for (const ch of world.chunks) {
      const cc = centroid(ch.poly), n = ch.poly.length;
      for (let e = 0; e < n; e++) {
        if (!edgeFree(world, ch, e)) continue;
        const a = ch.poly[e], b = ch.poly[(e + 1) % n], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const cand = { x: 2 * mx - cc.x, y: 2 * my - cc.y };       // reflect the centroid across the edge ≈ neighbour centre
        const d = (cand.x - origin.x) ** 2 + (cand.y - origin.y) ** 2;
        if (d < bd) { bd = d; bestCh = ch.id; bestE = e; bestC = cand; }
      }
    }
    if (bestCh < 0) break;                                          // floor is closed (no free edge) before count
    const spec = neighbourSpec(world, bestCh, bestE);
    solveFor({ poly: spec.poly, inherit: spec.inherit }, bestC.x, bestC.y);
  }

  // EDGE TILES: every edge still free after growth is the sealed floor boundary.
  const edgeTiles = [];
  for (const ch of world.chunks) {
    const n = ch.poly.length;
    for (let e = 0; e < n; e++) {
      if (!edgeFree(world, ch, e)) continue;
      const a = ch.poly[e], b = ch.poly[(e + 1) % n];
      edgeTiles.push({ chunkId: ch.id, edge: e, ax: a.x, ay: a.y, bx: b.x, by: b.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 });
    }
  }

  // biome histogram + the floor bbox (for fitting a view)
  const histogram = {}; for (const bk of biomeOf) histogram[bk] = (histogram[bk] || 0) + 1;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const ch of world.chunks) for (const p of ch.poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }

  return { world, biomeOf, edgeTiles, histogram, bbox: { x0, y0, x1, y1 }, depth, noBaddies: depth === 1, count: world.chunks.length };
}
