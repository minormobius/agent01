// roads.js — desire-line roads for /econ: the paint/flux.js kernel driven by the REAL society.
//
// In /paint the attractors were synthetic. Here they don't have to be: the econ society already IS
// the demand — every hat is a recurring trip (home→work, home→parish, home→club), every supply
// edge is a freight run. So the traffic field this grows is literally the Laplace transform of THIS
// town's NPC motion, and the streets are its superlevel set: where these people's journeys overlap.
//
// Stepwise on purpose: createRoadGrower exposes one reinforcement round per step() so the page can
// animate the seed society morphing into a road-having network — faint desire lines sharpening into
// a hierarchy, then the carve (road cells expropriated from the buildings they cross).
//
// Pure + deterministic; node + browser. Consumes what buildWorld()/buildSociety() already return.

import { makeGraph, createGrower, finalizeField } from '../paint/flux.js';

// one door CELL per building: the member cell nearest the centroid (trips start/end there)
export function doorCells(world) {
  const door = new Int32Array(world.places.length).fill(-1);
  for (const pl of world.places) {
    let best = -1, bd = Infinity;
    for (const ci of pl.cells) { const s = world.sites[ci]; const d = (s.x - pl.x) ** 2 + (s.y - pl.y) ** 2; if (d < bd) { bd = d; best = ci; } }
    door[pl.id] = best;
  }
  return door;
}

// ── TRIP DEMAND from the lived society: hats (people) + supply edges (freight), aggregated per
//    origin-destination cell pair so the field solver sees each desire line once, weighted. ──
export function buildTripDemand(world, society, { wWork = 1.0, wThird = 0.6, wSupply = 0.4 } = {}) {
  const door = doorCells(world);
  const agg = new Map();
  const add = (a, b, w) => { if (a < 0 || b < 0 || a === b) return; const k = a + ',' + b; agg.set(k, (agg.get(k) || 0) + w); };
  for (const p of society.people) {
    const home = door[p.home];
    for (const h of p.hats) { if (h.place === p.home) continue; add(home, door[h.place], h.kind === 'work' ? wWork : wThird); }
  }
  for (const e of world.edges) add(door[e.from], door[e.to], wSupply);
  const trips = [];
  for (const [k, w] of agg) { const [a, b] = k.split(','); trips.push({ a: +a, b: +b, w }); }
  return { trips, door };
}

// ── the steppable grower over the CELL graph (edge length = site-to-site distance — real travel
//    length, not the shared-wall length /paint uses). step() = one reinforcement round. ──
export function createRoadGrower(world, society, opts = {}) {
  const sites = world.sites;
  const cellEdges = world.cellAdj.map((e) => ({ a: e.a, b: e.b, len: Math.hypot(sites[e.a].x - sites[e.b].x, sites[e.a].y - sites[e.b].y) }));
  const graph = makeGraph(sites.length, cellEdges);
  const { trips, door } = buildTripDemand(world, society, opts);
  const grower = createGrower(graph, trips, opts);
  return { graph, grower, trips, door, cellEdges, step: () => grower.step(), get iter() { return grower.iter; }, state: grower.state };
}

// ── finalize, BUILDING-AWARE: superlevel set + connectivity from the kernel, then the econ rules —
//    road cells are EXPROPRIATED from the buildings they cross (the carve); every surviving
//    building must keep frontage (one door edge onto the road); fully-eaten buildings are absorbed.
export function finalizeRoads(rg, world, { roadFrac = 0.18 } = {}) {
  const { graph } = rg, { n, E, adj, ea, eb } = graph;
  const cond = rg.state.cond;
  const { isRoad } = finalizeField(graph, rg.state, { roadFrac });

  // frontage, building-scoped: a building with no member cell adjacent to a road promotes the
  // cheapest cell path from its clump to the road (door assignment INSIDE the loop, per FOAM.md)
  const owner = world.buildingOf;
  const touchesRoad = (pl) => pl.cells.some((ci) => !isRoad[ci] && adj[ci].some(([v]) => isRoad[v]));
  for (const pl of world.places) {
    const alive = pl.cells.filter((ci) => !isRoad[ci]);
    if (!alive.length || touchesRoad(pl)) continue;
    // BFS from all surviving member cells to the nearest road cell; promote the interior path
    const par = new Int32Array(n).fill(-2);
    const q = []; for (const ci of alive) { par[ci] = -1; q.push(ci); }
    let hit = -1;
    for (let h = 0; h < q.length && hit < 0; h++) { const u = q[h]; for (const [v] of adj[u]) { if (par[v] !== -2) continue; if (isRoad[v]) { hit = u; break; } par[v] = u; q.push(v); } }
    if (hit < 0) continue;
    let u = hit; while (u >= 0 && par[u] !== -1) { isRoad[u] = 1; u = par[u]; }
    if (u >= 0 && !alive.includes(u)) isRoad[u] = 1;
  }

  // recompute road edges + tiers AFTER frontage promotion (the kernel's own ordering rule)
  const roadEdge = new Uint8Array(E), roadConds = [];
  for (let i = 0; i < E; i++) if (isRoad[ea[i]] && isRoad[eb[i]]) { roadEdge[i] = 1; roadConds.push(cond[i]); }
  roadConds.sort((a, b) => a - b);
  const qn = (f) => roadConds.length ? roadConds[Math.floor(roadConds.length * f)] : Infinity;
  const tHi = qn(0.85), tMid = qn(0.55);
  const tier = new Int8Array(E);
  for (let i = 0; i < E; i++) if (roadEdge[i]) tier[i] = cond[i] >= tHi ? 3 : cond[i] >= tMid ? 2 : 1;

  // doors: per surviving building, the (member cell ↔ road cell) edge with the best conductance
  const doors = []; let absorbed = 0, expropriated = 0;
  for (const pl of world.places) {
    const alive = pl.cells.filter((ci) => !isRoad[ci]);
    expropriated += pl.cells.length - alive.length;
    if (!alive.length) { absorbed++; continue; }
    let best = -1, bc = -1;
    for (const ci of alive) for (const [v, ei] of adj[ci]) if (isRoad[v] && cond[ei] > bc) { bc = cond[ei]; best = ei; }
    if (best >= 0) doors.push({ place: pl.id, edge: best, a: ea[best], b: eb[best] });
  }
  let roadCells = 0; for (let i = 0; i < n; i++) if (isRoad[i]) roadCells++;
  const surviving = world.places.length - absorbed;
  return { isRoad, roadEdge, tier, doors,
    stats: { roadCells, roadFrac: roadCells / n, expropriated, absorbed, surviving, doored: doors.length, owner } };
}
