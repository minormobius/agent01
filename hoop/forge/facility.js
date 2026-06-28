// facility.js — FITTING THE EIGHT PRODUCTION ENGINES INTO THE FOAM (physarum-pathed).
//
// Same voronoi foam chamber allocation as the nave & rind (buildFoam → defineChunk), so a forge floor is
// built from the SAME construction process as the rest of the ship — the user's conceit. But the CONCOURSE
// IS NOT IMPOSED. The hypoxia/rooms-first concourse solver is gone; the conduits are GROWN by physarum
// (paint/flux.js) from the production demand and carved into the foam — grow-then-settle, the econ/roads.js
// pattern. What stays:
//
//   1. partitionChunk tiles the chunk's interior into rooms (footprint-weighted graph-Voronoi — NO road),
//      partitions those rooms into 1–3 FACILITIES (Voronoi regions OF the chambers), assigns each its
//      engine's PROCESS STEPS by family, and routes the ACTIVITY GRAPH room→room.
//   2. growConduits runs the flux field over the CELL graph from trip demand (the activity flow + supply)
//      and carves its superlevel set as the concourse, giving every room frontage + a door — the physarum
//      pather, the only pather.
//
// Pure + deterministic (seed in → identical everywhere; atproto-stable). No DOM. Node-tested in
// forge/test/facility.selftest.mjs.

import { buildFoam, defineChunk, centroid } from '../v099/v7/foam.js';
import { mulberry32, assignZones, relaxZones } from '../v099/paint/voronoi.js';
import { makeGraph, createGrower, finalizeField } from '../paint/flux.js';
import { ENGINES, ENGINE_IDS, coreAt } from './engines.js';

const DEF = { cellSize: 16, depth: 2.4, W: 900, H: 600 };

function bbox(poly) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const v of poly) { x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); x1 = Math.max(x1, v.x); y1 = Math.max(y1, v.y); } return { x0, y0, x1, y1 }; }

// ── room graph: a proximity graph over room centroids (KNN ∪ MST), guaranteed connected ──────────────
export function roomGraph(rooms, k = 4) {
  const n = rooms.length, edges = new Set();
  const key = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
  const d2 = (i, j) => (rooms[i].x - rooms[j].x) ** 2 + (rooms[i].y - rooms[j].y) ** 2;
  for (let i = 0; i < n; i++) {
    const near = []; for (let j = 0; j < n; j++) if (j !== i) near.push([j, d2(i, j)]);
    near.sort((a, b) => a[1] - b[1]);
    for (let t = 0; t < Math.min(k, near.length); t++) edges.add(key(i, near[t][0]));
  }
  if (n > 1) {
    const inT = new Uint8Array(n), best = new Float64Array(n).fill(Infinity), par = new Int32Array(n).fill(-1);
    best[0] = 0;
    for (let it = 0; it < n; it++) {
      let u = -1, bd = Infinity; for (let i = 0; i < n; i++) if (!inT[i] && best[i] < bd) { bd = best[i]; u = i; }
      if (u < 0) break; inT[u] = 1; if (par[u] >= 0) edges.add(key(u, par[u]));
      for (let v = 0; v < n; v++) if (!inT[v]) { const w = d2(u, v); if (w < best[v]) { best[v] = w; par[v] = u; } }
    }
  }
  return [...edges].map((s) => { const [a, b] = s.split(',').map(Number); return { a, b }; });
}

// keep each facility's largest connected component; reassign detached pockets to the bordering facility.
function repairFacilities(n, edges, facOf, nFac) {
  const adj = Array.from({ length: n }, () => []); for (const e of edges) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let f = 0; f < nFac; f++) {
      const members = []; for (let i = 0; i < n; i++) if (facOf[i] === f) members.push(i);
      if (members.length <= 1) continue;
      const comp = new Map(), comps = [];
      for (const s of members) { if (comp.has(s)) continue; const c = [], q = [s]; comp.set(s, comps.length); while (q.length) { const u = q.pop(); c.push(u); for (const v of adj[u]) if (facOf[v] === f && !comp.has(v)) { comp.set(v, comps.length); q.push(v); } } comps.push(c); }
      if (comps.length <= 1) continue;
      comps.sort((a, b) => b.length - a.length);
      for (let ci = 1; ci < comps.length; ci++) for (const r of comps[ci]) {
        const cnt = {}; for (const v of adj[r]) if (facOf[v] !== f) cnt[facOf[v]] = (cnt[facOf[v]] || 0) + 1;
        let best = -1, bb = -1; for (const k in cnt) if (cnt[k] > bb) { bb = cnt[k]; best = +k; }
        if (best >= 0) { facOf[r] = best; changed = true; }
      }
    }
    if (!changed) break;
  }
}

// principal axis (PCA) of a set of points → {u (along), v (cross), c (centroid)}.
function principalAxis(pts) {
  const n = pts.length || 1; let cx = 0, cy = 0; for (const p of pts) { cx += p.x; cy += p.y; } cx /= n; cy /= n;
  let sxx = 0, sxy = 0, syy = 0; for (const p of pts) { const dx = p.x - cx, dy = p.y - cy; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, l = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det));
  let ux = l - syy, uy = sxy; if (Math.abs(ux) + Math.abs(uy) < 1e-9) { ux = 1; uy = 0; }
  const m = Math.hypot(ux, uy) || 1; ux /= m; uy /= m;
  return { c: { x: cx, y: cy }, u: { x: ux, y: uy }, v: { x: -uy, y: ux } };
}

// assign engine steps to a facility's rooms by family + route the activity graph (room-index based).
function assignSteps(eng, rooms) {
  const ax = principalAxis(rooms);
  const along = (r) => (r.x - ax.c.x) * ax.u.x + (r.y - ax.c.y) * ax.u.y;
  const ang = (r) => Math.atan2(r.y - ax.c.y, r.x - ax.c.x);
  const dC = (r) => (r.x - ax.c.x) ** 2 + (r.y - ax.c.y) ** 2;
  const steps = eng.steps, nS = steps.length, nR = rooms.length;
  const stepFor = new Map();
  let core;
  if (coreAt(eng.family) === 'center') core = rooms.reduce((a, b) => (dC(a) <= dC(b) ? a : b));
  else core = rooms.reduce((a, b) => (along(a) <= along(b) ? a : b));
  if (coreAt(eng.family) === 'head') {
    const ordered = [...rooms].sort((a, b) => along(a) - along(b));
    for (let i = 0; i < nR; i++) { const si = Math.min(nS - 1, Math.floor((i * nS) / nR)); stepFor.set(ordered[i].idx, steps[si].id); }
    stepFor.set(core.idx, eng.core);
    return { stepFor, core: core.idx };
  }
  const others = rooms.filter((r) => r.idx !== core.idx).sort((a, b) => ang(a) - ang(b));
  const nonCore = steps.filter((s) => s.id !== eng.core);
  for (let i = 0; i < others.length; i++) stepFor.set(others[i].idx, nonCore[i % Math.max(1, nonCore.length)].id);
  stepFor.set(core.idx, eng.core);
  return { stepFor, core: core.idx };
}

// route the activity graph over rooms: each step→step edge connects each source room to the nearest target.
function routeFlow(eng, facRooms, stepFor) {
  const byStep = {}; for (const r of facRooms) { const s = stepFor.get(r.idx); (byStep[s] = byStep[s] || []).push(r); }
  const out = [], seen = new Set();
  for (const [a, b] of eng.flow) {
    const src = byStep[a] || [], dst = byStep[b] || []; if (!src.length || !dst.length) continue;
    for (const s of src) {
      let best = null, bd = Infinity; for (const d of dst) { if (d.idx === s.idx) continue; const w = (s.x - d.x) ** 2 + (s.y - d.y) ** 2; if (w < bd) { bd = w; best = d; } }
      if (!best) continue; const k = s.idx + '>' + best.idx; if (seen.has(k)) continue; seen.add(k);
      out.push({ from: s.idx, to: best.idx, step: [a, b] });
    }
  }
  return out;
}

function facilityCount(engineIds) { return Math.max(1, Math.min(3, engineIds.length)); }

// ── partition ONE chunk: foam → rooms tiling the interior (NO concourse) → 1–3 facilities → steps + flow.
// Returns the foam + def (for the cell graph the carve runs over) and rooms whose cells are foam cell ids.
export function partitionChunk(opts = {}) {
  const o = { ...DEF, ...opts }, seed = (o.seed ?? 1) >>> 0, foamSeed = (o.foamSeed ?? seed) >>> 0;
  const engineIds = (o.engines && o.engines.length ? o.engines : ['foundry']).slice(0, 3);
  const nFac = facilityCount(engineIds);
  const region = o.poly ? bbox(o.poly) : { x0: 0, y0: 0, x1: o.W, y1: o.H };
  const foam = buildFoam({ regions: [region], cellSize: o.cellSize, depth: o.depth, seed: foamSeed, W: o.W, H: o.H });
  const def = defineChunk(foam, { seed, poly: o.poly, inherit: o.inherit || [], shape: o.poly ? null : (o.shape || 'hex'), portRange: o.portRange || [1, 1], sideOf: o.sideOf || null, closedSides: o.closedSides || null });
  const interior = def.interior, N = foam.cells.length;

  // tile the interior into rooms (zones), footprint-neutral, compact (no road carved out)
  const totalSteps = engineIds.reduce((s, id) => s + ENGINES[id].steps.length, 0);
  const targetRooms = Math.max(nFac, Math.round(totalSteps * 1.5));
  const roomSize = Math.max(5, Math.round(interior.length / targetRooms));
  const li = new Map(); interior.forEach((c, i) => li.set(c, i));
  const subEdges = []; for (const c of interior) for (const v of foam.adj[c]) if (v > c && li.has(v)) subEdges.push({ a: li.get(c), b: li.get(v) });
  const nZones = Math.max(1, Math.round(interior.length / roomSize));
  const rng = mulberry32((seed ^ 0x2f1d) >>> 0);
  let zoneLocal = assignZones(interior.length, subEdges, Array.from({ length: nZones }, () => 1), (seed ^ 0x9e37) >>> 0);
  zoneLocal = relaxZones(interior.length, subEdges, zoneLocal, 0.5);
  // rooms = connected components per zone (graph-Voronoi zones are normally connected; split if not)
  const comp = new Int32Array(interior.length).fill(-1), rooms = [];
  for (let s = 0; s < interior.length; s++) {
    if (comp[s] >= 0) continue; const z = zoneLocal[s], cells = [], q = [s]; comp[s] = rooms.length;
    for (let h = 0; h < q.length; h++) { const u = q[h]; cells.push(interior[u]); for (const vc of foam.adj[interior[u]]) { const v = li.get(vc); if (v != null && zoneLocal[v] === z && comp[v] < 0) { comp[v] = rooms.length; q.push(v); } } }
    if (cells.length) { const ctr = centroid(foam.cells, cells); rooms.push({ idx: rooms.length, cells, x: ctr.x, y: ctr.y }); }
  }

  // partition rooms into nFac facilities (graph-Voronoi over the room proximity graph), weighted by engine fp
  const rg = roomGraph(rooms);
  const facWeights = engineIds.map((id) => ENGINES[id].steps.reduce((s, x) => s + x.fp, 0));
  const facOf = rooms.length ? assignZones(rooms.length, rg, facWeights.slice(0, nFac), (seed ^ 0x5a17) >>> 0) : new Int32Array(0);
  repairFacilities(rooms.length, rg, facOf, nFac);

  const facilities = [], roomMeta = rooms.map(() => ({ facility: -1, engine: null, step: null, isCore: false }));
  const flow = [];
  for (let f = 0; f < nFac; f++) {
    const eng = ENGINES[engineIds[f]], facRooms = rooms.filter((r) => facOf[r.idx] === f);
    if (!facRooms.length) { facilities.push({ id: f, engine: engineIds[f], label: eng.label, color: eng.color, glyph: eng.glyph, family: eng.family, rooms: [], core: -1 }); continue; }
    const { stepFor, core } = assignSteps(eng, facRooms);
    for (const r of facRooms) roomMeta[r.idx] = { facility: f, engine: engineIds[f], step: stepFor.get(r.idx), isCore: r.idx === core };
    for (const e of routeFlow(eng, facRooms, stepFor)) flow.push({ ...e, facility: f, engine: engineIds[f], color: eng.color });
    facilities.push({ id: f, engine: engineIds[f], label: eng.label, color: eng.color, glyph: eng.glyph, family: eng.family, core, rooms: facRooms.map((r) => r.idx) });
  }
  // attach meta to rooms
  rooms.forEach((r) => { const m = roomMeta[r.idx]; r.facility = m.facility; r.engine = m.engine; r.step = m.step; r.isCore = m.isCore; });
  // door cell per room = the room cell nearest its centroid (trips start/end there)
  for (const r of rooms) { let best = r.cells[0], bd = Infinity; for (const c of r.cells) { const d = (foam.cells[c].x - r.x) ** 2 + (foam.cells[c].y - r.y) ** 2; if (d < bd) { bd = d; best = c; } } r.doorCell = best; }

  return { foam, def, interior, rooms, facilities, flow, ports: def.ports, engines: engineIds, cellSize: foam.cellSize, N };
}

// ── the physarum carve, region-agnostic: grow the flux field over a cell graph from trip demand, carve
// its superlevel set as the concourse, give every room frontage + a door. (econ/roads.js#finalizeRoads,
// generalised: rooms carry global cell-index lists.) Returns isRoad (per cell), tiered road edges, doors.
export function growConduits({ nCells, cellEdges, rooms, demand }, opts = {}) {
  const { mu = 1.05, iters = 16, roadFrac = 0.26 } = opts;
  const graph = makeGraph(nCells, cellEdges);
  const grower = createGrower(graph, demand, { mu, condMax: 60, condGain: 6 });
  for (let it = 0; it < iters; it++) grower.step();
  const cond = grower.state.cond;
  const { isRoad } = finalizeField(graph, grower.state, { roadFrac });
  const { adj, ea, eb, E } = graph;
  // frontage: a room with no member cell adjacent to road promotes the cheapest interior path to road
  const touches = (cells) => cells.some((ci) => !isRoad[ci] && adj[ci].some(([v]) => isRoad[v]));
  for (const r of rooms) {
    const alive = r.cells.filter((ci) => !isRoad[ci]); if (!alive.length || touches(r.cells)) continue;
    const par = new Int32Array(nCells).fill(-2), q = []; for (const ci of alive) { par[ci] = -1; q.push(ci); }
    let hit = -1; for (let h = 0; h < q.length && hit < 0; h++) { const u = q[h]; for (const [v] of adj[u]) { if (par[v] !== -2) continue; if (isRoad[v]) { hit = u; break; } par[v] = u; q.push(v); } }
    if (hit < 0) continue; let u = hit; while (u >= 0 && par[u] !== -1) { isRoad[u] = 1; u = par[u]; }
  }
  // tiers over surviving road edges + a door per room (best-conductance member↔road edge)
  const roadEdge = new Uint8Array(E), roadConds = [];
  for (let i = 0; i < E; i++) if (isRoad[ea[i]] && isRoad[eb[i]]) { roadEdge[i] = 1; roadConds.push(cond[i]); }
  roadConds.sort((a, b) => a - b);
  const qn = (f) => (roadConds.length ? roadConds[Math.floor(roadConds.length * f)] : Infinity);
  const tHi = qn(0.85), tMid = qn(0.55), tier = new Int8Array(E);
  for (let i = 0; i < E; i++) if (roadEdge[i]) tier[i] = cond[i] >= tHi ? 3 : cond[i] >= tMid ? 2 : 1;
  const doors = new Map();
  for (const r of rooms) { let best = -1, bc = -1; for (const ci of r.cells) if (!isRoad[ci]) for (const [v, ei] of adj[ci]) if (isRoad[v] && cond[ei] > bc) { bc = cond[ei]; best = ci; } if (best >= 0) doors.set(r, best); }
  return { graph, isRoad, roadEdge, tier, cond, doors };
}

// ── solve ONE chunk for the facilities page: partition, then physarum-carve its concourse from the
// activity flow. Returns the packed serializable record (cells, road, roomOf, rooms, facilities, flow). ──
export function solveForgeChunk(opts = {}) {
  const part = partitionChunk(opts);
  const { foam, def, interior, rooms } = part;
  const localOf = new Map(); interior.forEach((cid, i) => localOf.set(cid, i));
  const nCells = interior.length;
  // cell graph over the interior
  const seen = new Set(), cellEdges = [];
  for (const cid of interior) for (const v of foam.adj[cid]) { const a = localOf.get(cid), b = localOf.get(v); if (a == null || b == null) continue; const k = a < b ? a + ',' + b : b + ',' + a; if (seen.has(k)) continue; seen.add(k); cellEdges.push({ a, b, len: Math.hypot(foam.cells[cid].x - foam.cells[v].x, foam.cells[cid].y - foam.cells[v].y) }); }
  // rooms in local cell indices
  const lrooms = rooms.map((r) => ({ ...r, lcells: r.cells.map((c) => localOf.get(c)).filter((x) => x != null) }));
  for (const r of lrooms) r.cells = r.lcells;
  // demand = the activity flow (room door cell → room door cell)
  const doorL = rooms.map((r) => localOf.get(r.doorCell));
  const demand = part.flow.map((fl) => ({ a: doorL[fl.from], b: doorL[fl.to], w: 1 })).filter((t) => t.a != null && t.b != null && t.a !== t.b);
  const carve = growConduits({ nCells, cellEdges, rooms: lrooms, demand }, { mu: 1.0, roadFrac: 0.24 });
  return packChunk(foam, def, interior, rooms, part.facilities, part.flow, carve.isRoad, part.engines);
}

// pack a chunk record (plain objects + typed arrays), local cell index space.
export function packChunk(foam, def, interior, rooms, facilities, flow, isRoadLocal, engineIds) {
  const local = new Map(); interior.forEach((cid, i) => local.set(cid, i));
  const srcToCell = new Map(); for (const c of foam.cells) srcToCell.set(c.src, c.id);
  const cells = interior.map((cid) => {
    const c = foam.cells[cid];
    const poly = c.poly.map((vx) => { const nb = vx.s >= 0 ? srcToCell.get(vx.s) : -1; const lb = nb != null && local.has(nb) ? local.get(nb) : -1; return [vx.x, vx.y, lb]; });
    return { x: c.x, y: c.y, poly };
  });
  const road = new Uint8Array(interior.length), roomOf = new Int32Array(interior.length).fill(-1);
  rooms.forEach((r) => { for (const c of r.cells) { const l = local.get(c); if (l != null) roomOf[l] = r.idx; } });
  if (isRoadLocal) for (let i = 0; i < interior.length; i++) if (isRoadLocal[i]) { road[i] = 1; roomOf[i] = -1; }
  const outRooms = rooms.map((r) => ({ id: r.idx, cells: r.cells.map((c) => local.get(c)).filter((v) => v != null && !road[v]), x: r.x, y: r.y, door: r.doorCell != null ? local.get(r.doorCell) : -1, facility: r.facility, engine: r.engine, step: r.step, isCore: r.isCore }));
  const ports = def.ports.map((p) => ({ x: p.x, y: p.y, edge: p.edge, inherited: !!p.inherited, cell: local.get(p.cell) }));
  return { poly: def.poly, shape: def.shape, region: bbox(def.poly), cells, road, roomOf, rooms: outRooms, facilities, flow, ports, engines: engineIds, cellSize: foam.cellSize };
}

// ── deterministic engine selection for a chunk (production engines only; fulfillment is placed by floor) ──
const PRODUCTION = ENGINE_IDS.filter((id) => !ENGINES[id].logistics);
export function pickChunkEngines(seed, { max = 3 } = {}) {
  const rng = mulberry32((seed ^ 0x1f83) >>> 0);
  const first = PRODUCTION[Math.floor(rng() * PRODUCTION.length)];
  const cap = ENGINES[first].perChunk;
  if (cap <= 1) return [first];
  const n = 1 + Math.floor(rng() * Math.min(max, cap));
  const pool = PRODUCTION.filter((id) => ENGINES[id].perChunk >= 2 && id !== first);
  const out = [first];
  while (out.length < n && pool.length) { const i = Math.floor(rng() * pool.length); out.push(pool.splice(i, 1)[0]); }
  return out;
}
