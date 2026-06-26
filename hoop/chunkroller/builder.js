// builder.js — the interactive BOUNDED FLOOR builder (chunkroller's floor mode, v2).
//
// Where floor.js#growFloor AUTO-grows a compact hand of chunks, this builds one BY HAND: you click a
// free edge → the neighbouring chunk renders off it (reflection tiling over manager.js), you pick each
// chunk's biome (one of the seven wards), and you seal a frontier edge into a CLOSED WALL — a side with
// ZERO ports, so no concourse ever reaches that edge: a hard floor boundary (the bounded-floor boundary
// condition), not a streaming seam. Each chunk is solved with the v2 rooms-first solver + role floors.
//
// Pure (no DOM): operates on real solveChunk records. Node-tested in test/builder.selftest.mjs.

import { solveChunk } from '../v099/v8/chunkgen.js';
import { createWorld, addChunk, neighbourSpec, edgeFree, midKey } from '../v099/v8/manager.js';
import { ROLES } from '../v099/econ/econ.js';
import { BIOMES, BIOME_GRAND, mixFromSliders } from './biomes.js';
import { GRAND_ROLES, GRAND_MIN, MIN_ROOM, TRAFFIC_FOOTPRINT } from '../v099/rooms.js';

const ONE_OF_EACH = Object.fromEntries(Object.keys(ROLES).map((r) => [r, 1]));   // role floors: ≥1 of each type

// solve one ward: a hex chunk biased by its biome, with the given inherited seam ports + closed walls.
// Pure — same (seedC, poly, inherit, biome, closed, flags) ⇒ identical record on every machine.
function solveWard(state, seedC, poly, inherit, biome, closed) {
  const b = BIOMES[biome] || BIOMES.wild;
  return solveChunk({
    seed: seedC, foamSeed: state.seed, W: state.W, H: state.H, poly: poly || undefined, inherit: inherit || [],
    shape: poly ? null : 'hex', roomSize: 14, footprint: TRAFFIC_FOOTPRINT,
    grand: BIOME_GRAND[biome] || GRAND_ROLES, grandMin: GRAND_MIN, minRoom: MIN_ROOM,
    roleMix: mixFromSliders(b.sliders), portRange: [1, state.portsMax],
    closedSides: closed && closed.size ? [...closed] : null,
    v2: state.v2, roleFloors: state.v2 ? ONE_OF_EACH : null, tension: state.v2 ? 0.6 : 0,
  });
}

// gather the seam ports a chunk's polygon inherits from every OTHER abutting chunk (for re-solving an
// existing chunk in place — keeps its shared edges aligned to the neighbours that already exist).
function inheritFor(world, poly, selfId) {
  const inherit = [];
  for (let be = 0; be < poly.length; be++) { const mk = midKey(poly, be); for (const ec of world.chunks) { if (ec.id === selfId) continue; for (let e = 0; e < ec.poly.length; e++) if (midKey(ec.poly, e) === mk) for (const p of ec.ports) if (p.edge === e) inherit.push({ x: p.x, y: p.y }); } }
  return inherit;
}

// re-solve chunk `id` in place (after its closed-wall set or a neighbour changed). Append-stable: id and
// occupancy don't move; only this chunk's ports/road/rooms change.
function reSolve(state, id) {
  const m = state.meta[id], poly = state.world.chunks[id].poly;
  const rec = solveWard(state, m.seedC, poly, inheritFor(state.world, poly, id), m.biome, m.closed);
  rec.id = id; state.world.chunks[id] = rec;
}

function placeChunk(state, poly, inherit, biome) {
  const id = state.world.chunks.length;
  const seedC = (state.seed ^ (id * 0x9e37 + 0x51)) >>> 0;
  const closed = new Set();
  const rec = solveWard(state, seedC, poly, inherit, biome, closed);
  addChunk(state.world, rec);                       // assigns rec.id = id
  state.meta[id] = { biome, closed, seedC };
  return id;
}

// ── public API ──

// start a floor: chunk 0, centred, with the chosen biome. v2 (rooms-first + role floors) on by default.
export function createBuild(seed, { W = 900, H = 600, v2 = true, portsMax = 1, biome = 'wild' } = {}) {
  const state = { seed: (seed | 0) >>> 0, W, H, v2, portsMax, world: createWorld(), meta: [] };
  placeChunk(state, null, null, biome);
  return state;
}

// grow the neighbour off a free edge. If that edge was a closed wall, it re-opens (it must carry a port to
// share across the new seam). Returns the new chunk id, or -1 if the edge isn't a frontier.
export function growAt(state, chunkId, edge, biome) {
  const ch = state.world.chunks[chunkId];
  if (!ch || !edgeFree(state.world, ch, edge)) return -1;
  if (state.meta[chunkId].closed.delete(edge)) reSolve(state, chunkId);   // reopen → it has a port to share
  const spec = neighbourSpec(state.world, chunkId, edge);
  return placeChunk(state, spec.poly, spec.inherit, biome || state.meta[chunkId].biome);
}

// toggle a frontier edge between open and CLOSED WALL (0 ports). Re-solves the chunk. Seam edges can't be
// walled (they carry a live crossing). Returns true if it toggled.
export function toggleWall(state, chunkId, edge) {
  const ch = state.world.chunks[chunkId];
  if (!ch || !edgeFree(state.world, ch, edge)) return false;
  const closed = state.meta[chunkId].closed;
  if (closed.has(edge)) closed.delete(edge); else closed.add(edge);
  reSolve(state, chunkId);
  return true;
}

// seal EVERY remaining frontier edge into a closed wall — the bounded floor's boundary in one move.
export function sealFrontier(state) {
  let n = 0;
  for (const ch of state.world.chunks) {
    const closed = state.meta[ch.id].closed; let changed = false;
    for (let e = 0; e < ch.poly.length; e++) if (edgeFree(state.world, ch, e) && !closed.has(e)) { closed.add(e); changed = true; n++; }
    if (changed) reSolve(state, ch.id);
  }
  return n;
}

// every frontier edge, flagged open vs closed-wall — the page draws growable handles on the open ones and
// walls on the closed ones.
export function freeEdges(state) {
  const out = [];
  for (const ch of state.world.chunks) {
    const n = ch.poly.length;
    for (let e = 0; e < n; e++) {
      if (!edgeFree(state.world, ch, e)) continue;
      const a = ch.poly[e], b = ch.poly[(e + 1) % n];
      out.push({ chunkId: ch.id, edge: e, closed: state.meta[ch.id].closed.has(e), ax: a.x, ay: a.y, bx: b.x, by: b.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 });
    }
  }
  return out;
}

export function bbox(state) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const ch of state.world.chunks) for (const p of ch.poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
}
export const biomeOf = (state, id) => state.meta[id].biome;
export function histogram(state) { const h = {}; for (const ch of state.world.chunks) { const b = state.meta[ch.id].biome; h[b] = (h[b] || 0) + 1; } return h; }
export function closedWallCount(state) { let n = 0; for (const m of state.meta) n += m.closed.size; return n; }
