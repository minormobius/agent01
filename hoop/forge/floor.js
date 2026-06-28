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
import { pathFind } from '../v099/v8/manager.js';
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

// ── THE GLOBAL LAYOUT OPTIMIZER ──────────────────────────────────────────────────────────────────────
// With ONE fulfillment center per factory, every gram of product funnels to a single nave conduit and every
// gram of waste comes back down through it. So the layout problem is: assign engines to chunks to MINIMISE
// total weighted transport around that one hub. The cost has three parts: (1) the nave throughput — all
// assembly product travels to the hub, all reclaim absorbs waste from the hub (heavy, so assembly+reclaim
// want to RING the hub); (2) the inter-engine supply — each producer's output to its nearest consumer; the
// minimiser pulls a producer next to its consumer. The emergent structure is a RADIAL SUPPLY GRADIENT:
// fulfillment at the centre, a ring of assembly+reclaim, the refiners (foundry/mill/chem/fab/weave) outside
// feeding inward. We seed that by ring+affinity then polish with swap local search.

// relative chunk counts per engine (the balanced factory mix) + each engine's affinity for the hub
// (1 / its supply-graph distance to the fulfillment center): assembly & reclaim talk to it directly.
const MIX = { assembly: 4, reclaim: 3, foundry: 2, mill: 2, chemworks: 2, fab: 2, weave: 2, fluid: 1 };
const AFFINITY = { assembly: 1.0, reclaim: 1.0, mill: 0.5, chemworks: 0.5, fab: 0.5, weave: 0.5, foundry: 0.34, fluid: 0.25 };
const W_PROD = 3, W_WASTE = 3;   // nave throughput weights (dominant — they funnel to the hub)

const polyCentroid = (poly) => { let x = 0, y = 0; for (const p of poly) { x += p.x; y += p.y; } return { x: x / poly.length, y: y / poly.length }; };

// scale MIX to exactly P production chunks, ≥1 of each (so the commodity loop always closes).
function targetMix(P) {
  const keys = Object.keys(MIX), tot = keys.reduce((s, k) => s + MIX[k], 0);
  const cnt = {}; let sum = 0; for (const k of keys) { cnt[k] = Math.max(1, Math.round((MIX[k] / tot) * P)); sum += cnt[k]; }
  // fix rounding drift to hit P exactly (add/remove from the largest groups, never below 1)
  const order = keys.slice().sort((a, b) => cnt[b] - cnt[a]);
  let gi = 0; while (sum > P) { const k = order[gi % order.length]; if (cnt[k] > 1) { cnt[k]--; sum--; } gi++; if (gi > 1000) break; }
  gi = 0; while (sum < P) { const k = order[gi % order.length]; cnt[k]++; sum++; gi++; if (gi > 1000) break; }
  const list = []; for (const k of keys) for (let i = 0; i < cnt[k]; i++) list.push(k); return { cnt, list };
}

// total weighted transport for an engine→chunk assignment (engineOf[i] = engine id, or null for a hub).
function layoutCost(engineOf, centroids, hubChunks) {
  const prod = []; for (let i = 0; i < engineOf.length; i++) if (engineOf[i]) prod.push(i);
  const d = (a, b) => Math.hypot(centroids[a].x - centroids[b].x, centroids[a].y - centroids[b].y);
  const hubD = (i) => Math.min(...hubChunks.map((h) => d(i, h)));
  let cost = 0;
  for (const i of prod) {
    const e = ENGINES[engineOf[i]];
    for (const tag of (e.output || [])) {
      if (tag === 'waste') continue;                                   // waste is produced at the hub, handled below
      // nearest production consumer of this tag
      let best = Infinity; for (const j of prod) { if (j === i) continue; if ((ENGINES[engineOf[j]].intake || []).includes(tag)) best = Math.min(best, d(i, j)); }
      if (tag === 'product') cost += hubD(i) * W_PROD;                 // product goes UP to the nave hub
      else if (best < Infinity) cost += best;                         // ordinary inter-engine supply
    }
    if ((e.intake || []).includes('waste')) cost += hubD(i) * W_WASTE; // reclaim absorbs waste DOWN from the hub
  }
  return cost;
}

// optimise: ring+affinity seed, then swap local search. Returns engineOf[] (null at hubs) + cost + baseline
// (the SAME mix placed at random — so the number isolates the PLACEMENT win, not a different engine set).
function optimizeLayout(seed, hexes, centroids, hubChunks) {
  const count = hexes.length, hubSet = new Set(hubChunks);
  const prodChunks = []; for (let i = 0; i < count; i++) if (!hubSet.has(i)) prodChunks.push(i);
  const { list } = targetMix(prodChunks.length);
  // hex distance to the nearest hub (axial) → ring
  const axDist = (a, b) => { const di = hexes[a].i - hexes[b].i, dj = hexes[a].j - hexes[b].j; return (Math.abs(di) + Math.abs(dj) + Math.abs(di + dj)) / 2; };
  const ringOf = (i) => Math.min(...hubChunks.map((h) => axDist(i, h)));
  // SEED: innermost chunks ← highest-affinity engines
  const byRing = prodChunks.slice().sort((a, b) => ringOf(a) - ringOf(b) || a - b);
  const byAff = list.slice().sort((a, b) => (AFFINITY[b] || 0) - (AFFINITY[a] || 0) || a.localeCompare(b));
  const engineOf = new Array(count).fill(null);
  byRing.forEach((c, k) => { engineOf[c] = byAff[k]; });
  // swap local search to a fixed point
  let improved = true, guard = 0;
  while (improved && guard++ < 60) {
    improved = false;
    for (let x = 0; x < prodChunks.length; x++) for (let y = x + 1; y < prodChunks.length; y++) {
      const a = prodChunks[x], b = prodChunks[y]; if (engineOf[a] === engineOf[b]) continue;
      const before = layoutCost(engineOf, centroids, hubChunks);
      const t = engineOf[a]; engineOf[a] = engineOf[b]; engineOf[b] = t;
      if (layoutCost(engineOf, centroids, hubChunks) < before - 1e-9) improved = true;
      else { const u = engineOf[a]; engineOf[a] = engineOf[b]; engineOf[b] = u; }
    }
  }
  // baseline: same mix, deterministic-random placement (Fisher–Yates on prodChunks)
  const rnd = mulberryRng((seed ^ 0xbeef) >>> 0), perm = list.slice();
  for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  const baseOf = new Array(count).fill(null); prodChunks.forEach((c, k) => { baseOf[c] = perm[k]; });
  return { engineOf, cost: layoutCost(engineOf, centroids, hubChunks), baseline: layoutCost(baseOf, centroids, hubChunks) };
}
function mulberryRng(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// choose the fulfillment hub chunk(s): the most central (chunk 0 in a spiral), then farthest-point spread.
function chooseHubs(centroids, k) {
  const n = centroids.length, cx = centroids.reduce((s, c) => s + c.x, 0) / n, cy = centroids.reduce((s, c) => s + c.y, 0) / n;
  let c0 = 0, bd = Infinity; for (let i = 0; i < n; i++) { const d = (centroids[i].x - cx) ** 2 + (centroids[i].y - cy) ** 2; if (d < bd) { bd = d; c0 = i; } }
  const hubs = [c0];
  while (hubs.length < k) { let best = -1, bb = -1; for (let i = 0; i < n; i++) { if (hubs.includes(i)) continue; const dd = Math.min(...hubs.map((h) => (centroids[i].x - centroids[h].x) ** 2 + (centroids[i].y - centroids[h].y) ** 2)); if (dd > bb) { bb = dd; best = i; } } if (best < 0) break; hubs.push(best); }
  return hubs;
}

export function buildForgeRegion(seed, opts = {}) {
  const { count = 7, W = 900, H = 600, R = 150, mu = 1.2, iters = 18, roadFrac = 0.24, engines = null, optimize = false, fulfillmentCount = null } = opts;
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

  // FULFILLMENT placement: ONE nave conduit per ~19-chunk factory (the user's call), at the most central
  // chunk. (Override with fulfillmentCount; for a much larger region, farthest-point spread the hubs.)
  const centroids = polys.map(polyCentroid);
  const nFulfil = engines && count === 1 ? 0 : Math.max(1, fulfillmentCount != null ? fulfillmentCount : Math.round(count / 19));
  const hubChunks = nFulfil ? chooseHubs(centroids, nFulfil) : [];
  const hubSet = new Set(hubChunks);

  // ENGINE ASSIGNMENT: optimised global layout (minimise transport around the hub) or random per-chunk.
  let layout = null, engineOf = null;
  if (engines && count === 1) { /* single-chunk facilities view: forced engines, no fulfillment */ }
  else if (optimize) { layout = optimizeLayout(seed, hexes, centroids, hubChunks); engineOf = layout.engineOf; }

  // ── solve (partition only — NO concourse) center-out, inheriting seam ports ──
  const parts = new Array(count).fill(null), recPoly = new Array(count);
  for (let i = 0; i < count; i++) {
    const closed = []; for (let k = 0; k < 6; k++) if (!openDir[i].has(k)) closed.push(k);
    const inherit = [];
    for (let k = 0; k < 6; k++) { const j = neighbourOf[i][k]; if (j < 0 || !parts[j]) continue; const sj = sharedSide(polys[j], sideOf, polys[i]); for (const p of parts[j].ports) if (sideOf[p.edge] === sj) inherit.push({ x: p.x, y: p.y }); }
    const cseed = (seed ^ (i * 0x9e37 + 0x51)) >>> 0;
    const eng = engines && count === 1 ? engines : (hubSet.has(i) ? ['fulfillment'] : (engineOf ? [engineOf[i]] : pickChunkEngines(cseed)));
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
    const rec = packChunk(p.foam, p.def, p.interior, p.rooms, p.facilities, p.flow, isRoadLocal, p.engines);
    rec.id = i; recs.push(rec);   // id = chunk index, so {chunks: recs} drives buildWalk()/pathFind directly
  }

  // conduit edges (world coords, tiered) — the grown network for the region overlay
  const conduits = [];
  for (let i = 0; i < carve.graph.E; i++) { if (!carve.roadEdge[i]) continue; const a = carve.graph.ea[i], b = carve.graph.eb[i]; const ax = a === naveIdx ? naveXY : cellXY[a], bx = b === naveIdx ? naveXY : cellXY[b]; conduits.push({ ax: ax[0], ay: ax[1], bx: bx[0], by: bx[1], tier: carve.tier[i], nave: a === naveIdx || b === naveIdx, chunkA: a === naveIdx ? -1 : cellChunk[a], chunkB: b === naveIdx ? -1 : cellChunk[b] }); }

  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of polys.flat()) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  y0 = Math.min(y0, naveXY[1] - 14);
  // the layout's transport cost vs the same engine mix placed at random (when optimised) — the placement win
  const curCost = hubChunks.length ? layoutCost(engineOf || facilitiesEngineOf(facilities, count, hubSet), centroids, hubChunks) : null;
  return {
    seed, count, recs, polys, rooms, facilities, supply, conduits,
    nave: { x: naveXY[0], y: naveXY[1], pop: navePop, fulfillment: fulfil.length, links: naveEdges.length },
    layout: layout ? { optimized: true, cost: layout.cost, baseline: layout.baseline, reduction: layout.baseline > 0 ? (layout.baseline - layout.cost) / layout.baseline : 0, fulfillment: hubChunks.length } : { optimized: false, cost: curCost, fulfillment: hubChunks.length },
    crossLinks, bbox: { x0, y0, x1, y1 }, sideOf,
  };
}

// FREE-ROAM nav graph over a region — every interior cell is a node, foam-adjacent cells link, chunks join
// at shared ports. Fully connected (the foam is), so a player can walk the whole region: the carved road is
// the streets, but you can also cut through the facilities. Shaped like manager.buildWalk's output, so the
// game's pathFind()/nearestNode() run over it unchanged. (The proto pather — /forge/walk.)
export function regionWalk(reg) {
  const recs = reg.recs, base = [], pos = [], nodeChunk = [], nodeLocal = []; let N = 0;
  for (const ch of recs) { base[ch.id] = N; for (let i = 0; i < ch.cells.length; i++) { pos.push(ch.cells[i].x, ch.cells[i].y); nodeChunk.push(ch.id); nodeLocal.push(i); N++; } }
  const adj = Array.from({ length: N }, () => []), link = (a, b) => { adj[a].push(b); adj[b].push(a); };
  for (const ch of recs) { const b0 = base[ch.id]; for (let i = 0; i < ch.adj.length; i++) for (const j of ch.adj[i]) if (j > i) link(b0 + i, b0 + j); }
  const byLoc = new Map();
  for (const ch of recs) for (const p of ch.ports) { if (p.cell == null || p.cell < 0) continue; const k = Math.round(p.x) + ',' + Math.round(p.y); let a = byLoc.get(k); if (!a) byLoc.set(k, a = []); a.push(base[ch.id] + p.cell); }
  for (const g of byLoc.values()) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) link(g[i], g[j]);
  return { N, adj, pos: new Float32Array(pos), nodeChunk: new Int32Array(nodeChunk), nodeLocal: new Int32Array(nodeLocal), base, blocked: null };
}

// SUPPLY ROUTES ON THE CARVED ROADS — for each inter-engine supply edge, the path the material PACKETS
// take along the grown concourse (not a straight line): pathFind over a ROAD-RESTRICTED graph (only road↔road
// edges + cross-chunk port links), from the emitter facility's road access to the consumer's. Returns a
// polyline per supply edge so the proto can animate packets riding the trunks we grew. Falls back to a
// straight line for the rare facility pair the road net can't connect.
export function supplyRoutes(reg, walk) {
  walk = walk || regionWalk(reg);
  const N = walk.N, isRoad = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const ch = reg.recs[walk.nodeChunk[i]]; if (ch.road[walk.nodeLocal[i]]) isRoad[i] = 1; }
  // road-restricted adjacency: keep an edge iff both ends are road, OR it's a cross-chunk link (the seam
  // crossings — port cells bridge the concourse between chunks even if the exact port cell isn't paved).
  const radj = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) for (const j of walk.adj[i]) { if (j <= i) continue; if ((isRoad[i] && isRoad[j]) || walk.nodeChunk[i] !== walk.nodeChunk[j]) { radj[i].push(j); radj[j].push(i); } }
  // bridge each seam-crossing cell to its OWN chunk's nearest road, so a route can step off the concourse,
  // over the seam, and back onto the next chunk's concourse — lifts the road net toward one component.
  const nearestRoadIn = (chunk, x, y) => { let best = -1, bd = Infinity; for (let i = 0; i < N; i++) { if (!isRoad[i] || walk.nodeChunk[i] !== chunk) continue; const d = (walk.pos[2 * i] - x) ** 2 + (walk.pos[2 * i + 1] - y) ** 2; if (d < bd) { bd = d; best = i; } } return best; };
  const seamCells = new Set(); for (let i = 0; i < N; i++) for (const j of walk.adj[i]) if (walk.nodeChunk[i] !== walk.nodeChunk[j]) { seamCells.add(i); seamCells.add(j); }
  for (const p of seamCells) { if (isRoad[p]) continue; const r = nearestRoadIn(walk.nodeChunk[p], walk.pos[2 * p], walk.pos[2 * p + 1]); if (r >= 0) { radj[p].push(r); radj[r].push(p); } }
  const roadWalk = { N, adj: radj, pos: walk.pos, nodeChunk: walk.nodeChunk, nodeLocal: walk.nodeLocal, base: walk.base, blocked: null };
  const accessOf = (f) => { let best = -1, bd = Infinity; for (let i = 0; i < N; i++) { if (!isRoad[i]) continue; const d = (walk.pos[2 * i] - f.x) ** 2 + (walk.pos[2 * i + 1] - f.y) ** 2; if (d < bd) { bd = d; best = i; } } return best; };
  const acc = reg.facilities.map(accessOf);
  const out = [];
  for (const s of reg.supply) {
    const a = acc[s.from], b = acc[s.to]; let poly = null, onRoad = false;
    if (a >= 0 && b >= 0) { const p = pathFind(roadWalk, a, b); if (p && p.length > 1) { poly = p.map((n) => ({ x: walk.pos[2 * n], y: walk.pos[2 * n + 1] })); onRoad = true; } }
    if (!poly) { const F = reg.facilities[s.from], G = reg.facilities[s.to]; poly = [{ x: F.x, y: F.y }, { x: G.x, y: G.y }]; }
    out.push({ poly, engine: reg.facilities[s.from].engine, tag: s.tag, onRoad, cross: s.cross, from: s.from, to: s.to });
  }
  return out;
}

// the engine-per-chunk array implied by the placed facilities (first production engine per chunk, null at
// hubs) — used to score a non-optimised (random) layout's transport cost for the readout comparison.
function facilitiesEngineOf(facilities, count, hubSet) {
  const out = new Array(count).fill(null);
  for (const f of facilities) { if (hubSet.has(f.chunk) || f.logistics) continue; if (!out[f.chunk]) out[f.chunk] = f.engine; }
  return out;
}

// pick the facility room whose step is in `stepSet`, nearest the facility centroid; null if none.
function pickStepRoom(rooms, gRooms, stepSet) {
  const cand = gRooms.filter((g) => stepSet.has(rooms[g].step)); if (!cand.length) return null;
  let cx = 0, cy = 0; for (const g of gRooms) { cx += rooms[g].x; cy += rooms[g].y; } cx /= gRooms.length; cy /= gRooms.length;
  return cand.reduce((a, b) => ((rooms[a].x - cx) ** 2 + (rooms[a].y - cy) ** 2 <= (rooms[b].x - cx) ** 2 + (rooms[b].y - cy) ** 2 ? a : b));
}
