// flux.js — desire-line roads: the street network as the superlevel set of the NPC traffic field.
//
// The thesis the user named: the stationary flux of NPC trips is (in the s→0 limit) the LAPLACE
// TRANSFORM of the NPC motion process — the resolvent / graph Green's function, the time-integrated
// occupancy of every chamber under the ensemble of journeys people actually make. Solve that field
// once and roads are simply its SUPERLEVEL SET: the chambers the most journeys pass through want to
// be open concourse; everything below the waterline stays sequestered building. One solve yields the
// streets, the road hierarchy, the building doors, AND the ambient traffic to animate — not four
// systems, one field seen four ways.
//
// We compute the field by the biological mechanism (Physarum / ant-trail / current-flow betweenness,
// same family): place only ATTRACTORS (homes, work, the everyday basket) + the TRIP DEMAND between
// them, route every trip on the room-adjacency graph, accumulate flux, and let conductance ADAPT to
// flux (grow where used, decay where not) so cost = length / conductance. Iterate to a fixed point.
// The feedback exponent μ is the one real knob: μ<1 (sublinear) keeps redundant parallel streets — a
// GRID; μ>1 collapses everyone onto one arterial — a TREE. That dial *is* "do I have enough roads".
//
// Pure + deterministic; node + browser. Operates on what buildScene() already returns
// (roomSeeds + adjEdges), so it bolts onto /paint with zero changes to the geometry kernel.

import { mulberry32, bucketGrid } from './voronoi.js';

// minimal binary heap of [key, payload…] tuples, ordered by key
function heap() {
  const a = [];
  return {
    size: () => a.length,
    push(e) { a.push(e); let k = a.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (a[p][0] <= a[k][0]) break; [a[p], a[k]] = [a[k], a[p]]; k = p; } },
    pop() { const t = a[0], l = a.pop(); if (a.length) { a[0] = l; let k = 0; for (;;) { const L = 2 * k + 1, R = L + 1; let m = k; if (L < a.length && a[L][0] < a[m][0]) m = L; if (R < a.length && a[R][0] < a[m][0]) m = R; if (m === k) break; [a[m], a[k]] = [a[k], a[m]]; k = m; } } return t; },
  };
}

// ── ATTRACTORS: the few programs trips flow between (paint-local; the foam port reuses econ ROLES) ──
const PROGRAMS = [
  { id: 'dwell', w: 60, src: true },     // homes — the origin of most trips
  { id: 'work', w: 18, dst: true, pull: 1.0 },
  { id: 'basket', w: 14, dst: true, pull: 0.8 },   // serve/heal/learn/play — the daily errands
  { id: 'civic', w: 4, dst: true, pull: 0.5 },
  { id: 'util', w: 4 },                  // reactors / treatment — sequestered, low foot traffic
];
export function buildAttractors(scene, { seed = 1 } = {}) {
  const rng = mulberry32((seed ^ 0xa53f9d1) >>> 0);
  const tot = PROGRAMS.reduce((s, p) => s + p.w, 0);
  const pick = () => { let r = rng() * tot; for (const p of PROGRAMS) { r -= p.w; if (r <= 0) return p.id; } return 'dwell'; };
  const program = scene.roomSeeds.map(() => pick());
  return { program };
}

// ── TRIP DEMAND: a gravity model — each home sends trips to its nearest few work + basket, weighted
//    by 1/d² so locality dominates (this is what makes parallel short paths exist → a grid, not a
//    star). Returns [{a, b, w}] over room ids; the Laplace field is the response to this forcing. ──
export function tripDemand(scene, attractors, { seed = 1, kWork = 2, kBasket = 2, kCivic = 1 } = {}) {
  const seeds = scene.roomSeeds, prog = attractors.program;
  const byProg = (id) => seeds.filter((s) => prog[s.id] === id);
  const work = byProg('work'), basket = byProg('basket'), civic = byProg('civic');
  const nearestK = (home, list, k) => list
    .map((d) => [d, (d.x - home.x) ** 2 + (d.y - home.y) ** 2])
    .sort((a, b) => a[1] - b[1]).slice(0, k);
  const demand = [];
  for (const home of seeds) {
    if (prog[home.id] !== 'dwell') continue;
    const add = (pairs, scale) => { for (const [d, d2] of pairs) demand.push({ a: home.id, b: d.id, w: scale / (1 + d2 / 4000) }); };
    add(nearestK(home, work, kWork), 1.0);
    add(nearestK(home, basket, kBasket), 0.8);
    add(nearestK(home, civic, kCivic), 0.4);
  }
  return demand;
}

// ── THE FIELD, STEPPABLE: the generic kernel both /paint and /econ drive. makeGraph builds the
//    routing graph; createGrower exposes ONE flux-reinforcement round per step() so a page can
//    animate the field forming; finalizeField takes the converged state to its superlevel set.
//    growNetwork (below) is the one-shot orchestration /paint uses — same math, same outputs. ──
export function makeGraph(n, edgeList) {
  const E = edgeList.length, adj = Array.from({ length: n }, () => []);
  const len = new Float64Array(E), ea = new Int32Array(E), eb = new Int32Array(E);
  for (let i = 0; i < E; i++) { const e = edgeList[i]; ea[i] = e.a; eb[i] = e.b; len[i] = Math.max(1e-6, e.len); adj[e.a].push([e.b, i]); adj[e.b].push([e.a, i]); }
  return { n, E, adj, len, ea, eb };
}

export function createGrower(graph, demand, {
  mu = 0.75, grow = 1.0, decay = 0.35, baseline = 1, condGain = 6, condMax = 60,
  originBatches = 1,
} = {}) {
  const { n, E, adj, len, ea, eb } = graph;
  const cond = new Float64Array(E).fill(baseline);
  const flux = new Float64Array(E), traffic = new Float64Array(n);
  const bySrc = new Map();
  for (const t of demand) { let a = bySrc.get(t.a); if (!a) { a = []; bySrc.set(t.a, a); } a.push(t); }
  // each origin's search may stop once all ITS destinations are settled — demand is gravity-local,
  // so most searches explore a small ball, not the whole graph (the difference between usable and
  // unusable at /econ's 8k-cell scale)
  const destsOf = new Map();
  for (const [src, trips] of bySrc) destsOf.set(src, new Set(trips.map((t) => t.b)));
  // hot loop: flat-array heap + visit stamps (no per-source fills, no tuple garbage) — together
  // with early exit this is what keeps a step interactive at /econ's 8k-cell scale
  const dist = new Float64Array(n), prevE = new Int32Array(n);
  const seenAt = new Int32Array(n), doneAt = new Int32Array(n); let visit = 0;
  const hKey = new Float64Array(E + 8), hVal = new Int32Array(E + 8); let hN = 0;
  const hpush = (k, v) => { let i = hN++; hKey[i] = k; hVal[i] = v; while (i > 0) { const p = (i - 1) >> 1; if (hKey[p] <= hKey[i]) break; const tk = hKey[p]; hKey[p] = hKey[i]; hKey[i] = tk; const tv = hVal[p]; hVal[p] = hVal[i]; hVal[i] = tv; i = p; } };
  const hpop = () => { const v = hVal[0]; hN--; if (hN > 0) { hKey[0] = hKey[hN]; hVal[0] = hVal[hN]; let i = 0; for (;;) { const L = 2 * i + 1, R = L + 1; let m = i; if (L < hN && hKey[L] < hKey[m]) m = L; if (R < hN && hKey[R] < hKey[m]) m = R; if (m === i) break; const tk = hKey[m]; hKey[m] = hKey[i]; hKey[i] = tk; const tv = hVal[m]; hVal[m] = hVal[i]; hVal[i] = tv; i = m; } } return v; };
  const dijkstra = (src, cost) => {
    visit++; hN = 0;
    const dests = destsOf.get(src); let remaining = dests.size;
    dist[src] = 0; seenAt[src] = visit; prevE[src] = -1; hpush(0, src);
    while (hN > 0) {
      const u = hpop(); if (doneAt[u] === visit) continue; doneAt[u] = visit;
      if (dests.has(u) && --remaining === 0) break;
      const d = dist[u];
      for (const [v, ei] of adj[u]) {
        if (doneAt[v] === visit) continue;
        const nd = d + cost[ei];
        if (seenAt[v] !== visit || nd < dist[v]) { dist[v] = nd; prevE[v] = ei; seenAt[v] = visit; hpush(nd, v); }
      }
    }
    return visit;
  };
  let iter = 0;
  return {
    get iter() { return iter; },
    state: { cond, flux, traffic },
    step() {                                            // one reinforcement round; returns a snapshot
      const cost = new Float64Array(E);
      for (let i = 0; i < E; i++) cost[i] = len[i] / cond[i];
      flux.fill(0); traffic.fill(0);
      // origin batching (stochastic relaxation): each round routes a deterministic rotating subset
      // of origins — decay smooths the field across rounds; what keeps a 33k-chamber step live
      let k = -1;
      for (const [src, trips] of bySrc) {
        k++;
        if (originBatches > 1 && k % originBatches !== iter % originBatches) continue;
        const v = dijkstra(src, cost);
        for (const t of trips) {
          if (doneAt[t.b] !== v) continue;            // unreachable this round
          let u = t.b;
          traffic[u] += t.w;
          while (u !== src) { const ei = prevE[u]; if (ei < 0) break; flux[ei] += t.w; u = (ea[ei] === u) ? eb[ei] : ea[ei]; traffic[u] += t.w; }
        }
      }
      let maxF = 0; for (let i = 0; i < E; i++) if (flux[i] > maxF) maxF = flux[i];
      for (let i = 0; i < E; i++) {
        const fN = maxF > 0 ? flux[i] / maxF : 0, tgt = Math.pow(fN, mu);
        cond[i] = Math.min(condMax, baseline + (cond[i] - baseline) * (1 - decay) + grow * condGain * tgt);
      }
      iter++;
      return { iter, maxFlux: maxF };
    },
  };
}

// the converged field → its connected superlevel set + the 3-tier edge hierarchy (group-agnostic;
// per-building frontage/doors are the caller's job — /paint does rooms, /econ does cell clumps).
export function finalizeField(graph, { traffic, cond }, { roadFrac = 0.32 } = {}) {
  const { n, E, adj, len, ea, eb } = graph;
  const sorted = [...traffic].sort((a, b) => a - b);
  const thresh = sorted[Math.min(n - 1, Math.floor(n * (1 - roadFrac)))] || 0;
  const isRoad = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (traffic[i] >= thresh && traffic[i] > 0) isRoad[i] = 1;
  // connect stray road components to the largest, riding existing conductance
  const dist = new Float64Array(n), prevE = new Int32Array(n), done = new Uint8Array(n);
  const roadComponents = () => {
    const comp = new Int32Array(n).fill(-1); let c = 0;
    for (let s = 0; s < n; s++) { if (!isRoad[s] || comp[s] >= 0) continue; comp[s] = c; const q = [s]; while (q.length) { const u = q.pop(); for (const [v] of adj[u]) if (isRoad[v] && comp[v] < 0) { comp[v] = c; q.push(v); } } c++; }
    return { comp, count: c };
  };
  for (let pass = 0; pass < 4; pass++) {
    const { comp, count } = roadComponents();
    if (count <= 1) break;
    const size = new Array(count).fill(0); for (let i = 0; i < n; i++) if (comp[i] >= 0) size[comp[i]]++;
    const main = size.indexOf(Math.max(...size));
    const cost = new Float64Array(E); for (let i = 0; i < E; i++) cost[i] = len[i] / cond[i];
    dist.fill(Infinity); prevE.fill(-1); done.fill(0);
    const h = heap(); for (let i = 0; i < n; i++) if (comp[i] === main) { dist[i] = 0; h.push([0, i]); }
    while (h.size()) { const [d, u] = h.pop(); if (done[u]) continue; done[u] = 1; for (const [v, ei] of adj[u]) { const nd = d + cost[ei]; if (nd < dist[v]) { dist[v] = nd; prevE[v] = ei; h.push([nd, v]); } } }
    for (let cc = 0; cc < count; cc++) {
      if (cc === main) continue;
      let best = -1, bd = Infinity; for (let i = 0; i < n; i++) if (comp[i] === cc && dist[i] < bd) { bd = dist[i]; best = i; }
      if (best < 0) continue;
      let u = best; while (u >= 0 && comp[u] !== main) { isRoad[u] = 1; const ei = prevE[u]; if (ei < 0) break; u = (ea[ei] === u) ? eb[ei] : ea[ei]; }
    }
  }
  // road edges + the hierarchy by conductance quantiles
  const roadEdge = new Uint8Array(E), roadConds = [];
  for (let i = 0; i < E; i++) if (isRoad[ea[i]] && isRoad[eb[i]]) { roadEdge[i] = 1; roadConds.push(cond[i]); }
  roadConds.sort((a, b) => a - b);
  const q = (f) => roadConds.length ? roadConds[Math.floor(roadConds.length * f)] : Infinity;
  const tHi = q(0.85), tMid = q(0.55);
  const tier = new Int8Array(E);
  for (let i = 0; i < E; i++) if (roadEdge[i]) tier[i] = cond[i] >= tHi ? 3 : cond[i] >= tMid ? 2 : 1;
  return { isRoad, roadEdge, tier, thresh };
}

// ── THE FIELD: route demand, accumulate flux, adapt conductance to a fixed point. Returns the
//    traffic field (the Laplace transform), per-edge flux + conductance, road rooms (the superlevel
//    set, made connected + every building given frontage), one door per building, and edge tiers. ──
export function growNetwork(scene, demand, opts = {}) {
  const { iters = 14, mu = 0.75, roadFrac = 0.32 } = opts;
  const seeds = scene.roomSeeds, n = seeds.length, edges = scene.adjEdges, E = edges.length;
  const graph = makeGraph(n, edges);
  const { adj } = graph;
  const grower = createGrower(graph, demand, opts);
  for (let it = 0; it < iters; it++) grower.step();
  const { cond, flux, traffic } = grower.state;
  const { isRoad } = finalizeField(graph, grower.state, { roadFrac });   // frontage below mutates isRoad, so roads/tiers are recomputed after

  // frontage: every building must touch a road (its one door). Orphans promote the shortest hop.
  const nearestRoadPath = (b) => {
    const par = new Int32Array(n).fill(-2); par[b] = -1; const q = [b];
    for (let h = 0; h < q.length; h++) { const u = q[h]; if (isRoad[u]) return { hit: u, par }; for (const [v] of adj[u]) if (par[v] === -2) { par[v] = u; q.push(v); } }
    return null;
  };
  for (let b = 0; b < n; b++) {
    if (isRoad[b]) continue;
    if (adj[b].some(([v]) => isRoad[v])) continue;       // already has frontage
    const r = nearestRoadPath(b); if (!r) continue;
    let u = r.par[r.hit];                                 // promote interior rooms between b and the road
    while (u >= 0 && u !== b) { isRoad[u] = 1; u = r.par[u]; }
  }

  // one door per building: the incident edge to a road room with the highest conductance
  const doorEdge = new Int32Array(n).fill(-1);
  for (let b = 0; b < n; b++) {
    if (isRoad[b]) continue;
    let best = -1, bc = -1;
    for (const [v, ei] of adj[b]) if (isRoad[v] && cond[ei] > bc) { bc = cond[ei]; best = ei; }
    doorEdge[b] = best;
  }

  // road edges (open walls = both endpoints road) + a 3-tier hierarchy by conductance
  const roadEdge = new Uint8Array(E);
  const roadConds = [];
  for (let i = 0; i < E; i++) { const e = edges[i]; if (isRoad[e.a] && isRoad[e.b]) { roadEdge[i] = 1; roadConds.push(cond[i]); } }
  roadConds.sort((a, b) => a - b);
  const q = (f) => roadConds.length ? roadConds[Math.floor(roadConds.length * f)] : Infinity;
  const tHi = q(0.85), tMid = q(0.55);
  const tier = new Int8Array(E);                          // 0 none · 1 footpath · 2 street · 3 arterial
  for (let i = 0; i < E; i++) if (roadEdge[i]) tier[i] = cond[i] >= tHi ? 3 : cond[i] >= tMid ? 2 : 1;

  let roadRooms = 0; for (let i = 0; i < n; i++) if (isRoad[i]) roadRooms++;
  let buildings = 0, doored = 0; for (let i = 0; i < n; i++) if (!isRoad[i]) { buildings++; if (doorEdge[i] >= 0) doored++; }
  let roadEdgeCount = 0; for (let i = 0; i < E; i++) if (roadEdge[i]) roadEdgeCount++;
  const tmax = Math.max(...traffic, 1e-9), tmean = traffic.reduce((a, b) => a + b, 0) / Math.max(1, n);
  return { n, E, cond, flux, traffic, isRoad, doorEdge, roadEdge, tier,
    stats: { roadRooms, buildings, doored, roadEdgeCount, mu, peakConcentration: tmax / Math.max(1e-9, tmean) } };
}

// ── PAINT CLASSIFICATION: per fine paint-cell, what to draw. Roads are "zero walls for the shot" —
//    a wall cell whose two sides are BOTH road rooms is opened (it becomes concourse). ──
//    0 building-floor · 1 road-floor (open) · 2 wall · 3 door-threshold · 4 wall opened into road
export function classifyPaint(scene, model, { roomSize } = {}) {
  const rs = roomSize || scene.roomSize || 80;
  const rg = bucketGrid(scene.roomSeeds, rs * 1.4);
  const cls = new Int8Array(scene.paintCells.length);
  // door cells map to threshold rooms; build a set of (a,b) road edges for wall classification
  const roadPair = new Set();
  for (let i = 0; i < scene.adjEdges.length; i++) if (model.roadEdge[i]) { const e = scene.adjEdges[i]; roadPair.add(Math.min(e.a, e.b) + ',' + Math.max(e.a, e.b)); }
  const two = (x, y) => {                                 // the two nearest room seeds to a point
    let a = null, b = null, da = Infinity, db = Infinity;
    for (const s of rg.near(x, y)) { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < da) { db = da; b = a; da = d; a = s; } else if (d < db) { db = d; b = s; } }
    return [a, b];
  };
  for (let i = 0; i < scene.paintCells.length; i++) {
    const c = scene.paintCells[i];
    if (c.door) { cls[i] = 3; continue; }
    if (c.wall) {
      const [a, b] = two(c.x, c.y);
      cls[i] = (a && b && model.isRoad[a.id] && model.isRoad[b.id] && roadPair.has(Math.min(a.id, b.id) + ',' + Math.max(a.id, b.id))) ? 4 : 2;
      continue;
    }
    cls[i] = (c.room != null && model.isRoad[c.room]) ? 1 : 0;
  }
  return cls;
}

// orchestrator: scene → the whole desire-line model in one call
export function growRoads(scene, opts = {}) {
  const attractors = buildAttractors(scene, opts);
  const demand = tripDemand(scene, attractors, opts);
  const model = growNetwork(scene, demand, opts);
  const paintClass = classifyPaint(scene, model, opts);
  return { attractors, demand, model, paintClass };
}
