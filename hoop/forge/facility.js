// facility.js — FITTING THE EIGHT PRODUCTION ENGINES INTO THE FOAM.
//
// Same voronoi foam chamber allocation as the nave and the rind (buildFoam → defineChunk → solveRoomsFirst),
// so a forge floor is built from the SAME construction process as the rest of the ship — the user's conceit.
// What changes is purely the overlay:
//
//   1. the chunk's rooms are partitioned into 1–3 FACILITIES by graph-Voronoi over the room graph
//      (assignZones — the very kernel that grows the rooms, run one level up: facilities are Voronoi
//      regions OF the chambers). Facility sizes ∝ each engine's total footprint, so a big foundry claims
//      more chambers than a small reclaim yard.
//   2. each facility is assigned an ENGINE; its rooms are labelled with that engine's PROCESS STEPS,
//      placed by the engine's family (a hot core at the cluster centre for a star; a spine end for a path);
//      and the engine's ACTIVITY GRAPH is routed room→room. The flow graph is what makes a star look like a
//      star and a path look like a path — drawn over uniform foam.
//
// Pure + deterministic (seed in → identical facilities everywhere; atproto-stable). No DOM. Node-tested in
// forge/test/facility.selftest.mjs.

import { buildFoam, defineChunk, centroid } from '../v099/v7/foam.js';
import { solveRoomsFirst } from '../v099/v7/roomsfirst.js';
import { mulberry32, assignZones } from '../v099/paint/voronoi.js';
import { ENGINES, ENGINE_IDS, coreAt, engineFootprint } from './engines.js';

const DEF = { cellSize: 16, depth: 2.4, W: 900, H: 600 };

function bbox(poly) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const v of poly) { x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); x1 = Math.max(x1, v.x); y1 = Math.max(y1, v.y); } return { x0, y0, x1, y1 }; }

// ── room graph: a proximity graph over room centroids (KNN ∪ MST), guaranteed connected ──────────────
// (Facility clustering + flow "nearest" only need a connected room adjacency; proximity over centroids is
// deterministic and dodges the concourse-plumbing the foam edge graph would need.)
export function roomGraph(rooms, k = 4) {
  const n = rooms.length, edges = new Set();
  const key = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
  const d2 = (i, j) => (rooms[i].x - rooms[j].x) ** 2 + (rooms[i].y - rooms[j].y) ** 2;
  for (let i = 0; i < n; i++) {
    const near = []; for (let j = 0; j < n; j++) if (j !== i) near.push([j, d2(i, j)]);
    near.sort((a, b) => a[1] - b[1]);
    for (let t = 0; t < Math.min(k, near.length); t++) edges.add(key(i, near[t][0]));
  }
  // MST (Prim) over full graph to guarantee one component
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
      // connected components of this facility
      const comp = new Map(), comps = [];
      for (const s of members) { if (comp.has(s)) continue; const c = [], q = [s]; comp.set(s, comps.length); while (q.length) { const u = q.pop(); c.push(u); for (const v of adj[u]) if (facOf[v] === f && !comp.has(v)) { comp.set(v, comps.length); q.push(v); } } comps.push(c); }
      if (comps.length <= 1) continue;
      comps.sort((a, b) => b.length - a.length);
      for (let ci = 1; ci < comps.length; ci++) for (const r of comps[ci]) {
        // donate to the neighbouring facility this room borders most (else nearest other facility)
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
  // eigenvector of the 2×2 covariance for the larger eigenvalue
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, l = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det));
  let ux = l - syy, uy = sxy; if (Math.abs(ux) + Math.abs(uy) < 1e-9) { ux = 1; uy = 0; }
  const m = Math.hypot(ux, uy) || 1; ux /= m; uy /= m;
  return { c: { x: cx, y: cy }, u: { x: ux, y: uy }, v: { x: -uy, y: ux } };
}

// ── assign engine steps to a facility's rooms, by the engine's family, + route the activity graph ────
// rooms: [{idx, x, y}] (idx = global room index). Returns { stepFor:Map(idx→stepId), core:idx, order:[idx] }.
function assignSteps(eng, rooms) {
  const ax = principalAxis(rooms);
  const along = (r) => (r.x - ax.c.x) * ax.u.x + (r.y - ax.c.y) * ax.u.y;
  const cross = (r) => (r.x - ax.c.x) * ax.v.x + (r.y - ax.c.y) * ax.v.y;
  const ang = (r) => Math.atan2(r.y - ax.c.y, r.x - ax.c.x);
  const dC = (r) => (r.x - ax.c.x) ** 2 + (r.y - ax.c.y) ** 2;
  const steps = eng.steps, nS = steps.length, nR = rooms.length;
  const stepFor = new Map();

  // core room: centre for hub families, the head of the axis for spine families.
  let core;
  if (coreAt(eng.family) === 'center') { core = rooms.reduce((a, b) => (dC(a) <= dC(b) ? a : b)); }
  else { core = rooms.reduce((a, b) => (along(a) <= along(b) ? a : b)); }   // smallest projection = head

  if (coreAt(eng.family) === 'head') {
    // LINEAR families (path · dag · comb · in-tree): order by axis, lay steps along it in declared order.
    const ordered = [...rooms].sort((a, b) => along(a) - along(b));
    for (let i = 0; i < nR; i++) { const si = Math.min(nS - 1, Math.floor((i * nS) / nR)); stepFor.set(ordered[i].idx, steps[si].id); }
    stepFor.set(core.idx, eng.core);
    return { stepFor, core: core.idx, order: ordered.map((r) => r.idx) };
  }
  // HUB families (star · cycle · fan · flow): core at centre; the rest take non-core steps around it by
  // angle, so the spokes/ring read radially. Cycle/flow keep declared order around the ring.
  const others = rooms.filter((r) => r.idx !== core.idx).sort((a, b) => ang(a) - ang(b));
  const nonCore = steps.filter((s) => s.id !== eng.core);
  for (let i = 0; i < others.length; i++) { const s = nonCore[i % Math.max(1, nonCore.length)]; stepFor.set(others[i].idx, s.id); }
  stepFor.set(core.idx, eng.core);
  return { stepFor, core: core.idx, order: [core.idx, ...others.map((r) => r.idx)] };
}

// route the activity graph over the rooms: for each declared step→step edge, connect each room of the
// source step to the NEAREST room of the target step (so parallel rooms each wire to the line). Returns
// global room-index edges with the engine + step pair, deduped.
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

// how many facilities a chunk of these engines gets (1–3). One slot per engine in the list (the caller
// decides which engines share a chunk via pickChunkEngines); capped at 3.
function facilityCount(engineIds) { return Math.max(1, Math.min(3, engineIds.length)); }

// ── the solver: one chunk of foam, carrying 1–3 facilities ───────────────────────────────────────────
export function solveForgeChunk(opts = {}) {
  const o = { ...DEF, ...opts }, seed = (o.seed ?? 1) >>> 0, foamSeed = (o.foamSeed ?? seed) >>> 0;
  const engineIds = (o.engines && o.engines.length ? o.engines : ['foundry']).slice(0, 3);
  const nFac = facilityCount(engineIds);
  const region = o.poly ? bbox(o.poly) : { x0: 0, y0: 0, x1: o.W, y1: o.H };
  const foam = buildFoam({ regions: [region], cellSize: o.cellSize, depth: o.depth, seed: foamSeed, W: o.W, H: o.H });
  const def = defineChunk(foam, { seed, poly: o.poly, inherit: o.inherit || [], shape: o.poly ? null : (o.shape || 'hex'), portRange: o.portRange || [1, 1], sideOf: o.sideOf || null, closedSides: o.closedSides || null });

  // size the room count to host every step of every engine, with elbow room (×1.5), then partition foam
  // into that many rooms. roleMix neutral — facility identity comes from the overlay, not the foam draw.
  const totalSteps = engineIds.reduce((s, id) => s + ENGINES[id].steps.length, 0);
  const targetRooms = Math.max(nFac, Math.round(totalSteps * 1.5));
  const roomSize = Math.max(5, Math.round(def.interiorCount / targetRooms));
  const rf = solveRoomsFirst(foam, def, { roomSize, seed, tension: 0.55, concourseWidth: 2 });
  const rooms = rf.rooms.map((r, i) => ({ idx: i, x: r.x, y: r.y, cells: r.cells, door: r.door, doorRoad: r.doorRoad }));

  // partition rooms into nFac facilities by graph-Voronoi, weighted by engine total footprint.
  const rg = roomGraph(rooms);
  const facWeights = engineIds.map((id) => ENGINES[id].steps.reduce((s, x) => s + x.fp, 0));
  const facOf = rooms.length ? assignZones(rooms.length, rg, facWeights.slice(0, nFac), (seed ^ 0x5a17) >>> 0) : new Int32Array(0);
  // CONNECTIVITY REPAIR: graph-Voronoi can leave a stray pocket of a facility detached. Keep each
  // facility's largest connected component (over rg) and donate any detached pocket to the neighbouring
  // facility it borders most — so every facility ends as ONE coherent chamber cluster.
  repairFacilities(rooms.length, rg, facOf, nFac);

  // per facility: assign steps + route flow
  const facilities = [], flow = [];
  const roomMeta = rooms.map(() => ({ facility: -1, engine: null, step: null, isCore: false }));
  for (let f = 0; f < nFac; f++) {
    const eng = ENGINES[engineIds[f]];
    const facRooms = rooms.filter((r) => facOf[r.idx] === f);
    if (!facRooms.length) { facilities.push({ id: f, engine: engineIds[f], label: eng.label, color: eng.color, glyph: eng.glyph, family: eng.family, rooms: [], core: -1 }); continue; }
    const { stepFor, core } = assignSteps(eng, facRooms);
    for (const r of facRooms) { roomMeta[r.idx] = { facility: f, engine: engineIds[f], step: stepFor.get(r.idx), isCore: r.idx === core }; }
    for (const e of routeFlow(eng, facRooms, stepFor)) flow.push({ ...e, facility: f, engine: engineIds[f], color: eng.color });
    facilities.push({ id: f, engine: engineIds[f], label: eng.label, color: eng.color, glyph: eng.glyph, family: eng.family, core, rooms: facRooms.map((r) => r.idx) });
  }

  return packRecord(foam, def, rf, rooms, roomMeta, facilities, flow, engineIds);
}

// pack a serializable record (plain objects + typed arrays), local cell index space — mirrors chunkgen.js.
function packRecord(foam, def, rf, rooms, roomMeta, facilities, flow, engineIds) {
  const interior = def.interior, local = new Map(); interior.forEach((cid, i) => local.set(cid, i));
  const srcToCell = new Map(); for (const c of foam.cells) srcToCell.set(c.src, c.id);
  const cells = interior.map((cid) => {
    const c = foam.cells[cid];
    const poly = c.poly.map((vx) => { const nb = vx.s >= 0 ? srcToCell.get(vx.s) : -1; const lb = nb != null && local.has(nb) ? local.get(nb) : -1; return [vx.x, vx.y, lb]; });
    return { x: c.x, y: c.y, poly };
  });
  const road = new Uint8Array(interior.length), roomOf = new Int32Array(interior.length).fill(-1);
  interior.forEach((cid, i) => { if (rf.road[cid]) road[i] = 1; roomOf[i] = rf.roomOf[cid] != null ? rf.roomOf[cid] : -1; });
  const outRooms = rooms.map((r) => {
    const m = roomMeta[r.idx];
    return { id: r.idx, cells: r.cells.map((c) => local.get(c)).filter((v) => v != null), x: r.x, y: r.y, door: r.door >= 0 ? local.get(r.door) : -1, doorRoad: r.doorRoad >= 0 ? local.get(r.doorRoad) : -1, facility: m.facility, engine: m.engine, step: m.step, isCore: m.isCore };
  });
  const ports = def.ports.map((p) => ({ x: p.x, y: p.y, edge: p.edge, inherited: !!p.inherited, cell: local.get(p.cell) }));
  return { poly: def.poly, shape: def.shape, region: bbox(def.poly), cells, road, roomOf, rooms: outRooms, facilities, flow, ports, engines: engineIds, cellSize: foam.cellSize };
}

// ── deterministic engine selection for a chunk: draw a small set whose footprints fit 1–3 facilities ──
// big hot engines (perChunk 1) tend to come solo; small ones (perChunk 3) pair up. Deterministic from seed.
export function pickChunkEngines(seed, { max = 3 } = {}) {
  const rng = mulberry32((seed ^ 0x1f83) >>> 0);
  const first = ENGINE_IDS[Math.floor(rng() * ENGINE_IDS.length)];
  const cap = ENGINES[first].perChunk;                          // a perChunk-1 engine fills the chunk alone
  if (cap <= 1) return [first];
  const n = 1 + Math.floor(rng() * Math.min(max, cap));         // up to its perChunk
  const pool = ENGINE_IDS.filter((id) => ENGINES[id].perChunk >= 2 && id !== first);
  const out = [first];
  while (out.length < n && pool.length) { const i = Math.floor(rng() * pool.length); out.push(pool.splice(i, 1)[0]); }
  return out;
}
