// builder.js — the interactive BOUNDED FLOOR builder (chunkroller's floor mode, v2).
//
// You build a finite floor BY HAND: click a free SIDE → the neighbouring ward renders off it, you pick each
// ward's biome (one of the seven), and you seal a frontier side into a CLOSED WALL — a side with ZERO ports
// (no concourse reaches it: a hard floor boundary, not a streaming seam). Each ward is solved with the v2
// rooms-first solver + role floors.
//
// TILING BY TRANSLATION. Wards tile by translation, not reflection: crossing a ward's side k lands the
// neighbour at +T_k (the lattice vector, `latticeT` in tessgen.js = corner_k + corner_{k+1}). This works
// for a regular hexagon AND for a deformed TESSELLATION shape (whose wiggly opposite edges are reverse+
// translate partners) — so the floor can use the editor's tessellation geometry and the seams stop reading
// as obvious straight hex edges. Every ward shares ONE foam seed, so neighbouring Voronoi cells abut with
// no clash (chunkgen.js `foamSeed`).
//
// Pure (no DOM): operates on real solveChunk records. Node-tested in test/builder.selftest.mjs.

import { solveChunk } from '../v099/v8/chunkgen.js';
import { createWorld, addChunk, edgeFree, midKey } from '../v099/v8/manager.js';
import { ROLES } from '../v099/econ/econ.js';
import { BIOMES, BIOME_GRAND, mixFromSliders } from './biomes.js';
import { GRAND_ROLES, GRAND_MIN, MIN_ROOM, TRAFFIC_FOOTPRINT } from '../v099/rooms.js';
import { SAMPLE_SHAPE, shapePoly, shapeSideOf } from './shapes.js';

const ONE_OF_EACH = Object.fromEntries(Object.keys(ROLES).map((r) => [r, 1]));   // role floors: ≥1 of each type
const centroid = (poly) => { let x = 0, y = 0; for (const p of poly) { x += p.x; y += p.y; } return { x: x / poly.length, y: y / poly.length }; };

// a flat-top regular hexagon as a {x,y} poly + identity sideOf (6 edges = 6 sides) — the fallback when no
// tessellation shape is used. Matches v7/foam.js's hex (V_k = R·(cos 60k, sin 60k)).
function hexPoly(cx, cy, R) { const p = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; p.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }); } return p; }

// the 6 lattice translation vectors for a centred poly: corner[k] = the poly vertex that STARTS side k;
// T_k = corner_k + corner_{k+1} − 2·centre (= latticeT scaled to the world tile). Translating a ward by
// T_k yields the neighbour across side k; the shared side is the neighbour's opposite side (k+3).
function latticeVectors(poly, sideOf) {
  const corner = [];
  for (let i = 0; i < poly.length; i++) { const k = sideOf[i]; if (corner[k] === undefined) corner[k] = poly[i]; }
  const nS = corner.length;
  // the tile CENTRE is the centroid of the CORNERS (the symmetric hex vertices) — NOT of all boundary
  // vertices, which the deformed edges pull off-centre. T_k = corner_k + corner_{k+1} − 2·centre = latticeT.
  const c = centroid(corner), T = [];
  for (let k = 0; k < nS; k++) { const a = corner[k], b = corner[(k + 1) % nS]; T[k] = { x: a.x + b.x - 2 * c.x, y: a.y + b.y - 2 * c.y }; }
  return T;
}

// solve one ward: a biome-biased chunk over the given polygon, with inherited seam ports + closed walls.
// Pure — same (seedC, foamSeed, poly, inherit, biome, closed) ⇒ identical record everywhere.
function solveWard(state, seedC, poly, inherit, biome, closed) {
  const b = BIOMES[biome] || BIOMES.wild;
  return solveChunk({
    seed: seedC, foamSeed: state.seed, W: state.W, H: state.H, poly, inherit: inherit || [], sideOf: state.sideOf,
    roomSize: 14, footprint: TRAFFIC_FOOTPRINT, grand: BIOME_GRAND[biome] || GRAND_ROLES, grandMin: GRAND_MIN,
    minRoom: MIN_ROOM, roleMix: mixFromSliders(b.sliders), portRange: [1, state.portsMax],
    closedSides: closed && closed.size ? [...closed] : null,
    v2: state.v2, roleFloors: state.v2 ? ONE_OF_EACH : null, tension: state.v2 ? 0.6 : 0,
  });
}

// gather the seam ports a polygon inherits from every OTHER abutting ward, and mark those shared segments
// occupied — translation cousin of manager.neighbourSpec (which reflects). midKey matching is geometry-
// agnostic, so it works for the wiggly tessellation boundary too (shared segments coincide).
function inheritAndOccupy(state, poly, selfId) {
  const inherit = [];
  for (let be = 0; be < poly.length; be++) {
    const mk = midKey(poly, be);
    for (const ec of state.world.chunks) { if (ec.id === selfId) continue; for (let e = 0; e < ec.poly.length; e++) if (midKey(ec.poly, e) === mk) { for (const p of ec.ports) if (p.edge === e) inherit.push({ x: p.x, y: p.y }); state.world.occupied.add(mk); } }
  }
  return inherit;
}

function reSolve(state, id) {
  const m = state.meta[id], poly = state.world.chunks[id].poly;
  const rec = solveWard(state, m.seedC, poly, inheritAndOccupy(state, poly, id), m.biome, m.closed);
  rec.id = id; state.world.chunks[id] = rec;
}

function placeChunk(state, poly, inherit, biome) {
  const id = state.world.chunks.length;
  const seedC = (state.seed ^ (id * 0x9e37 + 0x51)) >>> 0;
  // A PRIORI WALLS: every side that doesn't already abut an existing ward is a CLOSED WALL (no port) from
  // the start. So the bounded floor's boundary is portless walls by default — no post-hoc sealing, and the
  // solver never grows the concourse toward the boundary ("no port = no concourse"). Only seam sides (whose
  // segments are already occupied) stay open — PLUS any side the NEXT-TILE PLAN marks as a deliberate open
  // GATE (`state.planOpen`), so you can establish a tile's boundary conditions before you place it.
  const closed = new Set(), nS = state.T.length, n = poly.length;
  for (let k = 0; k < nS; k++) { if (state.planOpen && state.planOpen.has(k)) continue; let seam = false; for (let e = 0; e < n; e++) if (state.sideOf[e] === k && state.world.occupied.has(midKey(poly, e))) { seam = true; break; } if (!seam) closed.add(k); }
  const rec = solveWard(state, seedC, poly, inherit, biome, closed);
  addChunk(state.world, rec);                       // assigns rec.id = id
  state.meta[id] = { biome, closed, seedC };
  return id;
}

// the SIDE a polygon edge belongs to → which of the 6 directions. Constant across wards (all are translates).
const sideOfEdge = (state, e) => state.sideOf[e];

// ── public API ──

// start a floor: ward 0 centred. `shape` = a tessellation descriptor (default SAMPLE_SHAPE) or null for a
// plain hexagon. v2 (rooms-first + role floors) on by default.
export function createBuild(seed, { shape = SAMPLE_SHAPE, W = 900, H = 600, v2 = true, portsMax = 1, biome = 'wild' } = {}) {
  const R = Math.min(W, H) * 0.46, cx = W / 2, cy = H / 2;
  const poly = shape ? shapePoly(shape, cx, cy, R) : hexPoly(cx, cy, R);
  const sideOf = shape ? shapeSideOf(shape) : poly.map((_, i) => i);
  const state = { seed: (seed | 0) >>> 0, W, H, v2, portsMax, shape, sideOf, world: createWorld(), meta: [], planOpen: new Set() };
  state.T = latticeVectors(poly, sideOf);
  placeChunk(state, poly, [], biome);
  return state;
}

// is side k of this ward a frontier (all its segments free)? returns the segment edge indices, or null.
function sideEdges(state, ch, k) { const es = []; for (let e = 0; e < ch.poly.length; e++) if (state.sideOf[e] === k) es.push(e); return es; }
function sideFree(state, ch, k) { const es = sideEdges(state, ch, k); return es.length ? es.every((e) => edgeFree(state.world, ch, e)) : false; }

// grow the neighbour off a free side. If that side was a closed wall, it re-opens (it must carry a port to
// share). Returns the new ward id, or -1 if the side isn't a frontier.
export function growSide(state, chunkId, sideK, biome) {
  const ch = state.world.chunks[chunkId];
  if (!ch || !sideFree(state, ch, sideK)) return -1;
  if (state.meta[chunkId].closed.delete(sideK)) reSolve(state, chunkId);   // reopen → it has a port to share
  const T = state.T[sideK], poly = ch.poly.map((p) => ({ x: p.x + T.x, y: p.y + T.y }));
  const inherit = inheritAndOccupy(state, poly, -1);
  return placeChunk(state, poly, inherit, biome || state.meta[chunkId].biome);
}

// toggle a frontier side between open and CLOSED WALL (0 ports). Re-solves the ward. A side with a neighbour
// (a live seam) can't be walled. Returns true if it toggled.
export function toggleWall(state, chunkId, sideK) {
  const ch = state.world.chunks[chunkId];
  if (!ch || !sideFree(state, ch, sideK)) return false;
  const closed = state.meta[chunkId].closed;
  if (closed.has(sideK)) closed.delete(sideK); else closed.add(sideK);
  reSolve(state, chunkId);
  return true;
}

// seal EVERY remaining frontier side into a closed wall — the bounded floor's boundary in one move.
export function sealFrontier(state) {
  let n = 0;
  for (const ch of state.world.chunks) {
    const closed = state.meta[ch.id].closed; let changed = false;
    const nS = state.T.length;
    for (let k = 0; k < nS; k++) if (sideFree(state, ch, k) && !closed.has(k)) { closed.add(k); changed = true; n++; }
    if (changed) reSolve(state, ch.id);
  }
  return n;
}

// every frontier SIDE, flagged open vs closed-wall, with its segment polyline + a handle point. The page
// draws a ＋ grow handle on the open ones and a wall along the closed ones.
export function frontier(state) {
  const out = [], nS = state.T.length;
  for (const ch of state.world.chunks) {
    const n = ch.poly.length;
    for (let k = 0; k < nS; k++) {
      if (!sideFree(state, ch, k)) continue;
      const es = sideEdges(state, ch, k), segs = [];
      let mx = 0, my = 0;
      for (const e of es) { const a = ch.poly[e], b = ch.poly[(e + 1) % n]; segs.push([a.x, a.y, b.x, b.y]); mx += (a.x + b.x) / 2; my += (a.y + b.y) / 2; }
      out.push({ chunkId: ch.id, sideK: k, closed: state.meta[ch.id].closed.has(k), mx: mx / es.length, my: my / es.length, segs });
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

// ── the NEXT-TILE PLAN: prospectively establish a tile's boundary conditions before you place it ──
// `planOpen` is the set of side directions (0..nS-1) that the NEXT placed ward leaves OPEN as a gate
// instead of the default closed wall. (A seam side is always open regardless.) Set it, then grow.
export const sideCount = (state) => state.T.length;
export function togglePlan(state, sideK) { if (state.planOpen.has(sideK)) state.planOpen.delete(sideK); else state.planOpen.add(sideK); return state.planOpen.has(sideK); }
export function setPlan(state, sides) { state.planOpen = new Set(sides); }
export function planSides(state) { return [...state.planOpen]; }
export function isPlanOpen(state, sideK) { return state.planOpen.has(sideK); }
