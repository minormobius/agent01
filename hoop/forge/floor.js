// floor.js — A COHERENT FORGE REGION: many chunks solved at once, with the conduit network GROWN by
// physarum across the whole region (not imposed per chunk).
//
// Three things the single-chunk roller couldn't show:
//   1. RIND COHERENCE — a hex cluster of forge chunks on ONE shared foam, seams seamless (the nave/rind
//      composition, scaled up). Each chunk carries 1–3 facilities; together they read as a stretch of rind.
//   2. THE INTER-ENGINE SUPPLY GRAPH — facilities close the loop across chunks: a foundry's metal feeds a
//      mill, the mill's stock feeds an assembly line, assembly's product wears out and a reclaim yard
//      shreds it back to scrap_metal/feedstock/silicon/fiber that feed the foundry/chemworks/fab/weave.
//      Commodity tags (engines.js intake/output) match emitter→consumer across the region.
//   3. PHYSARUM PATHING — instead of solveRoomsFirst's imposed minimal concourse, the material conduits are
//      GROWN: the activity flow (intra-facility) + the supply graph (inter-facility) are the trip demand,
//      the flux field is grown over the global chamber graph (paint/flux.js), and the conduits are its
//      superlevel set. The long inter-facility hauls overlap into TRUNK ARTERIALS that span chunk seams —
//      the emergent axial-rail / trans-rind transport, not drawn by hand.
//
// Pure + deterministic (seed in → identical region everywhere; atproto-stable). No DOM. Node-tested in
// forge/test/region.selftest.mjs.

import { solveForgeChunk, pickChunkEngines, roomGraph } from './facility.js';
import { ENGINES, sourceSteps, sinkSteps, consumersOf } from './engines.js';
import { makeGraph, createGrower, finalizeField } from '../paint/flux.js';
import { SAMPLE_SHAPE, shapePoly, shapeSideOf } from '../chunkroller/shapes.js';
import { latticeVectors } from '../chunkroller/builder.js';

// ── hex cluster layout: the first `count` hexes in a spiral, in axial coords (i,j) over the lattice ──
// world pos = i·T[0] + j·T[1] (T = the 6 lattice translation vectors; T[0],T[1] are a valid hex basis,
// 60° apart, equal length — the 6 neighbours are ±T[0], ±T[1], ±(T[0]−T[1])).
const AX_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];   // the 6 axial neighbour steps
function hexSpiral(count) {
  const out = [{ i: 0, j: 0 }]; if (count <= 1) return out;
  for (let ring = 1; out.length < count; ring++) {
    // start at ring steps along direction 4, then walk the six sides
    let i = AX_DIRS[4][0] * ring, j = AX_DIRS[4][1] * ring;
    for (let side = 0; side < 6 && out.length < count; side++) {
      for (let step = 0; step < ring && out.length < count; step++) { out.push({ i, j }); i += AX_DIRS[side][0]; j += AX_DIRS[side][1]; }
    }
  }
  return out;
}
const axKey = (i, j) => i + ',' + j;
// the side DIRECTION (0..5) of a hex toward axial neighbour delta — index into AX_DIRS.
function dirOfDelta(di, dj) { for (let k = 0; k < 6; k++) if (AX_DIRS[k][0] === di && AX_DIRS[k][1] === dj) return k; return -1; }

// the side of polygon A (by direction) abutting polygon B — matched on shared segment midpoints (nave's).
function midKey(poly, e) { const a = poly[e], b = poly[(e + 1) % poly.length]; return Math.round((a.x + b.x) / 2) + ',' + Math.round((a.y + b.y) / 2); }
function sharedSide(polyA, sideOf, polyB) {
  const bKeys = new Set(); for (let e = 0; e < polyB.length; e++) bKeys.add(midKey(polyB, e));
  for (let k = 0; k < 6; k++) { const ks = []; for (let e = 0; e < polyA.length; e++) if (sideOf[e] === k) ks.push(midKey(polyA, e)); if (ks.length && ks.every((x) => bKeys.has(x))) return k; }
  return -1;
}

// ── compose the region: solve every chunk on one shared foam, seams open between in-cluster neighbours ──
export function buildForgeRegion(seed, opts = {}) {
  const { count = 7, W = 900, H = 600, R = 150, mu = 1.25, iters = 18, roadFrac = 0.34 } = opts;
  seed = (seed | 0) >>> 0;
  const cx = W / 2, cy = H / 2;
  const poly0 = shapePoly(SAMPLE_SHAPE, cx, cy, R), sideOf = shapeSideOf(SAMPLE_SHAPE);
  const T = latticeVectors(poly0, sideOf);
  const hexes = hexSpiral(count);
  const inCluster = new Set(hexes.map((h) => axKey(h.i, h.j)));
  const polys = hexes.map((h) => poly0.map((p) => ({ x: p.x + h.i * T[0].x + h.j * T[1].x, y: p.y + h.i * T[0].y + h.j * T[1].y })));

  // per chunk: which of the 6 sides are OPEN seams (an in-cluster neighbour exists), the rest closed walls.
  const openDir = hexes.map((h) => { const s = new Set(); for (let k = 0; k < 6; k++) { const ni = h.i + AX_DIRS[k][0], nj = h.j + AX_DIRS[k][1]; if (inCluster.has(axKey(ni, nj))) s.add(k); } return s; });
  // neighbour chunk index in each axial direction (or -1)
  const indexAt = new Map(); hexes.forEach((h, i) => indexAt.set(axKey(h.i, h.j), i));
  const neighbourOf = hexes.map((h) => AX_DIRS.map(([di, dj]) => { const id = indexAt.get(axKey(h.i + di, h.j + dj)); return id == null ? -1 : id; }));

  // solve center-out (spiral order is already center-first), inheriting ports from solved neighbours.
  const recs = new Array(count).fill(null), meta = [];
  for (let i = 0; i < count; i++) {
    const closed = []; for (let k = 0; k < 6; k++) if (!openDir[i].has(k)) closed.push(k);
    const inherit = [];
    for (let k = 0; k < 6; k++) { const j = neighbourOf[i][k]; if (j < 0 || !recs[j]) continue; const sj = sharedSide(polys[j], sideOf, polys[i]); for (const p of recs[j].ports) if (sideOf[p.edge] === sj) inherit.push({ x: p.x, y: p.y }); }
    const cseed = (seed ^ (i * 0x9e37 + 0x51)) >>> 0;
    const engines = pickChunkEngines(cseed);
    recs[i] = solveForgeChunk({ poly: polys[i], sideOf, inherit, closedSides: closed, seed: cseed, foamSeed: seed, W, H, engines });
    meta.push({ chunk: i, ax: hexes[i], engines });
  }

  // ── global chamber graph: rooms across all chunks, intra-chunk proximity edges + cross-seam links ──
  const base = [], rooms = []; let off = 0;
  for (let i = 0; i < count; i++) { base.push(off); for (const r of recs[i].rooms) rooms.push({ ...r, chunk: i, gid: off + r.id }); off += recs[i].rooms.length; }
  const N = rooms.length;
  const edgeSet = new Map();   // "a,b" → len, deduped (a<b)
  const addEdge = (a, b) => { if (a === b) return; const k = a < b ? a + ',' + b : b + ',' + a; if (edgeSet.has(k)) return; edgeSet.set(k, Math.hypot(rooms[a].x - rooms[b].x, rooms[a].y - rooms[b].y)); };
  // intra-chunk: the same room proximity graph the facility partition used
  for (let i = 0; i < count; i++) { const rg = roomGraph(recs[i].rooms); for (const e of rg) addEdge(base[i] + e.a, base[i] + e.b); }
  // cross-seam: for every solved adjacent pair, link the nearest room on each side of each shared port
  const crossEdges = [];
  for (let i = 0; i < count; i++) for (let k = 0; k < 6; k++) {
    const j = neighbourOf[i][k]; if (j < 0 || j <= i) continue;             // each pair once
    for (const p of recs[i].ports) {
      // a port shared with j sits at a midpoint present on j's boundary too; link nearest rooms across it
      const ra = nearestRoom(rooms, base[i], recs[i].rooms.length, p.x, p.y);
      const rb = nearestRoom(rooms, base[j], recs[j].rooms.length, p.x, p.y);
      if (ra >= 0 && rb >= 0) { addEdge(ra, rb); crossEdges.push([ra, rb]); }
    }
  }
  const edgeList = [...edgeSet.entries()].map(([k, len]) => { const [a, b] = k.split(',').map(Number); return { a, b, len }; });

  // ── facilities (global) + the inter-engine supply graph ──
  const facilities = [];
  for (let i = 0; i < count; i++) for (const f of recs[i].facilities) {
    if (!f.rooms.length) continue;
    const e = ENGINES[f.engine];
    const srcSet = new Set(sourceSteps(f.engine)), sinkSet = new Set(sinkSteps(f.engine));
    const gRooms = f.rooms.map((r) => base[i] + r);
    const inRoom = pickStepRoom(rooms, gRooms, srcSet) ?? gRooms[0];
    const outRoom = pickStepRoom(rooms, gRooms, sinkSet) ?? gRooms[gRooms.length - 1];
    let cx2 = 0, cy2 = 0; for (const g of gRooms) { cx2 += rooms[g].x; cy2 += rooms[g].y; } cx2 /= gRooms.length; cy2 /= gRooms.length;
    facilities.push({ id: facilities.length, chunk: i, engine: f.engine, color: f.color, label: e.label, family: e.family, intake: e.intake, output: e.output, rooms: gRooms, inRoom, outRoom, x: cx2, y: cy2 });
  }
  // match each (emitter facility, output tag) → the NEAREST consumer facility (prefer another chunk) of that tag
  const supply = [];
  for (const F of facilities) for (const tag of (F.output || [])) {
    let best = null, bd = Infinity;
    for (const G of facilities) { if (G.id === F.id || !(G.intake || []).includes(tag)) continue; const cross = G.chunk !== F.chunk ? 0.7 : 1.0; const d = ((F.x - G.x) ** 2 + (F.y - G.y) ** 2) * cross; if (d < bd) { bd = d; best = G; } }
    if (best) supply.push({ tag, from: F.id, to: best.id, fromRoom: F.outRoom, toRoom: best.inRoom, cross: best.chunk !== F.chunk });
  }

  // ── physarum: grow the conduit network from intra-facility flow + inter-facility supply ──
  const graph = makeGraph(N, edgeList);
  const demand = [];
  for (let i = 0; i < count; i++) for (const fl of recs[i].flow) demand.push({ a: base[i] + fl.from, b: base[i] + fl.to, w: 1 });   // intra-facility activity flow
  for (const s of supply) demand.push({ a: s.fromRoom, b: s.toRoom, w: s.cross ? 6 : 3 });                                            // inter-facility supply (heavier → trunks)
  const grower = createGrower(graph, demand, { mu, condMax: 60, condGain: 6 });
  let maxFlux = 0; for (let it = 0; it < iters; it++) maxFlux = grower.step().maxFlux;
  const field = finalizeField(graph, grower.state, { roadFrac });
  // per-edge conduit info for the renderer
  const conduits = [];
  for (let i = 0; i < graph.E; i++) if (field.roadEdge[i]) conduits.push({ a: graph.ea[i], b: graph.eb[i], tier: field.tier[i], cond: grower.state.cond[i] });

  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of polys.flat()) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { seed, count, recs, polys, meta, rooms, base, edgeList, crossEdges, facilities, supply, conduits, field, graph, traffic: grower.state.traffic, bbox: { x0, y0, x1, y1 }, sideOf };
}

function nearestRoom(rooms, base, n, x, y) { let best = -1, bd = Infinity; for (let r = 0; r < n; r++) { const g = base + r; const d = (rooms[g].x - x) ** 2 + (rooms[g].y - y) ** 2; if (d < bd) { bd = d; best = g; } } return best; }
// pick the facility room whose step is in `stepSet`, nearest the facility centroid; null if none.
function pickStepRoom(rooms, gRooms, stepSet) {
  const cand = gRooms.filter((g) => stepSet.has(rooms[g].step)); if (!cand.length) return null;
  let cx = 0, cy = 0; for (const g of gRooms) { cx += rooms[g].x; cy += rooms[g].y; } cx /= gRooms.length; cy /= gRooms.length;
  return cand.reduce((a, b) => ((rooms[a].x - cx) ** 2 + (rooms[a].y - cy) ** 2 <= (rooms[b].x - cx) ** 2 + (rooms[b].y - cy) ** 2 ? a : b));
}
