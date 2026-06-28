// floor.js — A COHERENT FORGE REGION: many chunks at once, the CONCOURSE GROWN by physarum across the
// whole region, with a FULFILLMENT CENTER conduit to the nave above.
//
// The hypoxia/rooms-first concourse solver is GONE. Each chunk is only partitioned into rooms+facilities
// (no road); the road is then GROWN — the intra-facility activity flow + the inter-engine supply loop +
// the nave's product-up/waste-down demand are the trip demand, physarum (paint/flux.js) grows the flux
// field over the WHOLE region's cell graph, and the conduits are carved as its superlevel set. The long
// inter-chunk hauls overlap into TRUNK ARTERIALS spanning seams — the emergent axial-rail.
//
// The FULFILLMENT CENTER (engines.js, a logistics hub, placed at the region's hub chunk) is the rind↔nave
// conduit: assembly's product flows to it and rides UP the lift to the NAVE node; the nave's worn goods
// come DOWN as waste to the reclaim yards. Given the region's assembly throughput, the loop can supply a
// whole nave — and it tiles to a bigger region unchanged.
//
// Pure + deterministic (seed in → identical region; atproto-stable). No DOM. Node-tested in
// forge/test/region.selftest.mjs.

import { partitionChunk, pickChunkEngines, packChunk, growConduits } from './facility.js';
import { ENGINES, sourceSteps, sinkSteps } from './engines.js';
import { SAMPLE_SHAPE, shapePoly, shapeSideOf } from '../chunkroller/shapes.js';
import { latticeVectors } from '../chunkroller/builder.js';

// crew a single assembly line keeps supplied (nominal — for the nave-supply readout).
const CREW_PER_ASSEMBLY = 180;

// ── hex cluster layout (axial spiral over the lattice; T[0],T[1] a valid hex basis) ──
const AX_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
function hexSpiral(count) {
  const out = [{ i: 0, j: 0 }]; if (count <= 1) return out;
  for (let ring = 1; out.length < count; ring++) {
    let i = AX_DIRS[4][0] * ring, j = AX_DIRS[4][1] * ring;
    for (let side = 0; side < 6 && out.length < count; side++) for (let step = 0; step < ring && out.length < count; step++) { out.push({ i, j }); i += AX_DIRS[side][0]; j += AX_DIRS[side][1]; }
  }
  return out;
}
const axKey = (i, j) => i + ',' + j;
const midKey = (poly, e) => { const a = poly[e], b = poly[(e + 1) % poly.length]; return Math.round((a.x + b.x) / 2) + ',' + Math.round((a.y + b.y) / 2); };
function sharedSide(polyA, sideOf, polyB) {
  const bKeys = new Set(); for (let e = 0; e < polyB.length; e++) bKeys.add(midKey(polyB, e));
  for (let k = 0; k < 6; k++) { const ks = []; for (let e = 0; e < polyA.length; e++) if (sideOf[e] === k) ks.push(midKey(polyA, e)); if (ks.length && ks.every((x) => bKeys.has(x))) return k; }
  return -1;
}

export function buildForgeRegion(seed, opts = {}) {
  const { count = 7, W = 900, H = 600, R = 150, mu = 1.2, iters = 18, roadFrac = 0.24, engines = null } = opts;
  seed = (seed | 0) >>> 0;
  const cx = W / 2, cy = H / 2;
  const poly0 = shapePoly(SAMPLE_SHAPE, cx, cy, R), sideOf = shapeSideOf(SAMPLE_SHAPE);
  const T = latticeVectors(poly0, sideOf);
  const hexes = hexSpiral(count);
  const inCluster = new Set(hexes.map((h) => axKey(h.i, h.j)));
  const polys = hexes.map((h) => poly0.map((p) => ({ x: p.x + h.i * T[0].x + h.j * T[1].x, y: p.y + h.i * T[0].y + h.j * T[1].y })));
  const openDir = hexes.map((h) => { const s = new Set(); for (let k = 0; k < 6; k++) if (inCluster.has(axKey(h.i + AX_DIRS[k][0], h.j + AX_DIRS[k][1]))) s.add(k); return s; });
  const indexAt = new Map(); hexes.forEach((h, i) => indexAt.set(axKey(h.i, h.j), i));
  const neighbourOf = hexes.map((h) => AX_DIRS.map(([di, dj]) => { const id = indexAt.get(axKey(h.i + di, h.j + dj)); return id == null ? -1 : id; }));

  // FULFILLMENT placement: the hub chunk (0) is the nave conduit; one more per ~8 chunks for a bigger region.
  const fulfilChunks = new Set();
  if (engines == null && count >= 4) for (let i = 0; i < count; i++) if (i % 8 === 0) fulfilChunks.add(i);

  // ── solve (partition only — NO concourse) center-out, inheriting seam ports ──
  const parts = new Array(count).fill(null), recPoly = new Array(count);
  for (let i = 0; i < count; i++) {
    const closed = []; for (let k = 0; k < 6; k++) if (!openDir[i].has(k)) closed.push(k);
    const inherit = [];
    for (let k = 0; k < 6; k++) { const j = neighbourOf[i][k]; if (j < 0 || !parts[j]) continue; const sj = sharedSide(polys[j], sideOf, polys[i]); for (const p of parts[j].ports) if (sideOf[p.edge] === sj) inherit.push({ x: p.x, y: p.y }); }
    const cseed = (seed ^ (i * 0x9e37 + 0x51)) >>> 0;
    const eng = engines && count === 1 ? engines : (fulfilChunks.has(i) ? ['fulfillment'] : pickChunkEngines(cseed));
    parts[i] = partitionChunk({ poly: polys[i], sideOf, inherit, closedSides: closed, seed: cseed, foamSeed: seed, W, H, engines: eng });
    recPoly[i] = polys[i];
  }

  // ── global CELL graph: every chunk's interior cells, intra foam adjacency + cross-seam proximity links ──
  const cellChunk = [], cellLocal = [], cellXY = []; const g2 = []; let nCells = 0;       // global cell bookkeeping
  for (let i = 0; i < count; i++) { const p = parts[i], map = new Map(); p.interior.forEach((cid, li) => { map.set(cid, nCells); cellChunk.push(i); cellLocal.push(li); cellXY.push([p.foam.cells[cid].x, p.foam.cells[cid].y]); nCells++; }); g2.push(map); }
  const naveIdx = nCells;                                                                  // the NAVE node (the deck above)
  const naveXY = [(Math.min(...polys.flat().map((q) => q.x)) + Math.max(...polys.flat().map((q) => q.x))) / 2, Math.min(...polys.flat().map((q) => q.y)) - 70];
  const edgeSet = new Map();
  const addEdge = (a, b, len) => { if (a === b) return; const k = a < b ? a + ',' + b : b + ',' + a; if (!edgeSet.has(k)) edgeSet.set(k, len); };
  for (let i = 0; i < count; i++) { const p = parts[i]; for (const cid of p.interior) { const a = g2[i].get(cid); for (const v of p.foam.adj[cid]) { const b = g2[i].get(v); if (b == null) continue; addEdge(a, b, Math.hypot(p.foam.cells[cid].x - p.foam.cells[v].x, p.foam.cells[cid].y - p.foam.cells[v].y)); } } }
  // cross-seam: per shared port, link the nearest interior cell on each side (cell-level stitch)
  const nearestInterior = (i, x, y) => { const p = parts[i]; let best = -1, bd = Infinity; for (const cid of p.interior) { const d = (p.foam.cells[cid].x - x) ** 2 + (p.foam.cells[cid].y - y) ** 2; if (d < bd) { bd = d; best = cid; } } return best >= 0 ? g2[i].get(best) : -1; };
  let crossLinks = 0;
  for (let i = 0; i < count; i++) for (let k = 0; k < 6; k++) { const j = neighbourOf[i][k]; if (j < 0 || j <= i) continue; for (const port of parts[i].ports) { const a = nearestInterior(i, port.x, port.y), b = nearestInterior(j, port.x, port.y); if (a >= 0 && b >= 0) { addEdge(a, b, Math.hypot(cellXY[a][0] - cellXY[b][0], cellXY[a][1] - cellXY[b][1])); crossLinks++; } } }

  // ── global rooms + facilities ──
  const roomBase = [], rooms = []; let roff = 0;
  for (let i = 0; i < count; i++) { roomBase.push(roff); for (const r of parts[i].rooms) { const gcells = r.cells.map((c) => g2[i].get(c)).filter((x) => x != null); rooms.push({ gid: roff + r.idx, chunk: i, cells: gcells, x: r.x, y: r.y, facility: r.facility, engine: r.engine, step: r.step, isCore: r.isCore, doorCell: g2[i].get(r.doorCell) }); roff++; } }
  const facilities = [];
  for (let i = 0; i < count; i++) for (const f of parts[i].facilities) {
    if (!f.rooms.length) continue; const e = ENGINES[f.engine];
    const gRooms = f.rooms.map((r) => roomBase[i] + r);
    const srcSet = new Set(sourceSteps(f.engine)), sinkSet = new Set(sinkSteps(f.engine));
    const inRoom = pickStepRoom(rooms, gRooms, srcSet) ?? gRooms[0];
    const outRoom = pickStepRoom(rooms, gRooms, sinkSet) ?? gRooms[gRooms.length - 1];
    let fx = 0, fy = 0; for (const g of gRooms) { fx += rooms[g].x; fy += rooms[g].y; } fx /= gRooms.length; fy /= gRooms.length;
    facilities.push({ id: facilities.length, chunk: i, engine: f.engine, color: f.color, label: e.label, family: e.family, logistics: !!e.logistics, navePort: !!e.navePort, intake: e.intake, output: e.output, rooms: gRooms, inRoom, outRoom, x: fx, y: fy });
  }

  // ── the inter-engine supply graph (emitter output tag → nearest consumer intake, prefer cross-chunk) ──
  const supply = [];
  for (const F of facilities) for (const tag of (F.output || [])) {
    let best = null, bd = Infinity;
    for (const G of facilities) { if (G.id === F.id || !(G.intake || []).includes(tag)) continue; const cross = G.chunk !== F.chunk ? 0.7 : 1.0; const d = ((F.x - G.x) ** 2 + (F.y - G.y) ** 2) * cross; if (d < bd) { bd = d; best = G; } }
    if (best) supply.push({ tag, from: F.id, to: best.id, fromRoom: F.outRoom, toRoom: best.inRoom, fromCell: rooms[F.outRoom].doorCell, toCell: rooms[best.inRoom].doorCell, cross: best.chunk !== F.chunk });
  }

  // ── the NAVE: product UP, waste DOWN through each fulfillment center's lift ──
  const navePop = facilities.filter((f) => f.engine === 'assembly').length * CREW_PER_ASSEMBLY;
  const fulfil = facilities.filter((f) => f.navePort);
  const naveEdges = [];   // fulfillment lift door ↔ nave node
  for (const f of fulfil) { const c = rooms[f.outRoom].doorCell; if (c != null) { addEdge(c, naveIdx, Math.hypot(cellXY[c][0] - naveXY[0], cellXY[c][1] - naveXY[1])); naveEdges.push({ facility: f.id, cell: c }); } }

  const edgeList = [...edgeSet.entries()].map(([k, len]) => { const [a, b] = k.split(',').map(Number); return { a, b, len }; });

  // ── demand: intra-facility activity flow + inter-facility supply + nave product-up/waste-down ──
  const demand = [];
  for (let i = 0; i < count; i++) for (const fl of parts[i].flow) { const a = rooms[roomBase[i] + fl.from].doorCell, b = rooms[roomBase[i] + fl.to].doorCell; if (a != null && b != null && a !== b) demand.push({ a, b, w: 1 }); }
  for (const s of supply) if (s.fromCell != null && s.toCell != null && s.fromCell !== s.toCell) demand.push({ a: s.fromCell, b: s.toCell, w: s.cross ? 6 : 3 });
  for (const ne of naveEdges) { demand.push({ a: ne.cell, b: naveIdx, w: 8 }); demand.push({ a: naveIdx, b: ne.cell, w: 8 }); }   // up + down

  // ── GROW the concourse: physarum over the region cell graph, carve the superlevel set ──
  const carve = growConduits({ nCells: nCells + 1, cellEdges: edgeList, rooms, demand }, { mu, iters, roadFrac });

  // ── split the carved road back per chunk + pack each record (now with GROWN concourse) ──
  const recs = [];
  for (let i = 0; i < count; i++) {
    const p = parts[i], isRoadLocal = new Uint8Array(p.interior.length);
    p.interior.forEach((cid, li) => { if (carve.isRoad[g2[i].get(cid)]) isRoadLocal[li] = 1; });
    recs.push(packChunk(p.foam, p.def, p.interior, p.rooms, p.facilities, p.flow, isRoadLocal, p.engines));
  }

  // conduit edges (world coords, tiered) — the grown network for the region overlay
  const conduits = [];
  for (let i = 0; i < carve.graph.E; i++) { if (!carve.roadEdge[i]) continue; const a = carve.graph.ea[i], b = carve.graph.eb[i]; const ax = a === naveIdx ? naveXY : cellXY[a], bx = b === naveIdx ? naveXY : cellXY[b]; conduits.push({ ax: ax[0], ay: ax[1], bx: bx[0], by: bx[1], tier: carve.tier[i], nave: a === naveIdx || b === naveIdx, chunkA: a === naveIdx ? -1 : cellChunk[a], chunkB: b === naveIdx ? -1 : cellChunk[b] }); }

  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of polys.flat()) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  y0 = Math.min(y0, naveXY[1] - 14);
  return {
    seed, count, recs, polys, rooms, facilities, supply, conduits,
    nave: { x: naveXY[0], y: naveXY[1], pop: navePop, fulfillment: fulfil.length, links: naveEdges.length },
    crossLinks, bbox: { x0, y0, x1, y1 }, sideOf,
  };
}

// pick the facility room whose step is in `stepSet`, nearest the facility centroid; null if none.
function pickStepRoom(rooms, gRooms, stepSet) {
  const cand = gRooms.filter((g) => stepSet.has(rooms[g].step)); if (!cand.length) return null;
  let cx = 0, cy = 0; for (const g of gRooms) { cx += rooms[g].x; cy += rooms[g].y; } cx /= gRooms.length; cy /= gRooms.length;
  return cand.reduce((a, b) => ((rooms[a].x - cx) ** 2 + (rooms[a].y - cy) ** 2 <= (rooms[b].x - cx) ** 2 + (rooms[b].y - cy) ** 2 ? a : b));
}
