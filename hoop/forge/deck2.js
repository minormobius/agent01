// deck2.js — THE TWO-DECK FACTORY (resolution A from TRACKS.md): the material track and the pedestrian
// track on STACKED decks, non-intersecting because they're at different heights, joined by a corkscrew
// RAMP at each facility (the "weird ramp like stairs" the voronoi foam wanted from the start).
//
//   deck 0 — MATERIAL: the forge region we grew (carved concourse + facilities), spiderbots carry packets
//            along the trunks (supplyRoutes). The freight floor.
//   deck 1 — PEDESTRIAN: a mezzanine of CATWALKS over the same trunks + an OFFICE/control room over each
//            facility core. Technicians & rindwalkers — the white-collar layer — walk it and look down on
//            the machines. Its own deck, so it never crosses the freight floor.
//   ramps  — at each facility core a helical ramp climbs deck 0 → deck 1 (the per-facility exchange: a tech
//            descends to the floor, a lift carries product up). The fulfillment ramp continues to the nave.
//
// Pure-ish (wraps the region builder) + deterministic. Node-tested in test/deck2.selftest.mjs.

import { buildForgeRegion, regionWalk, supplyRoutes } from './floor.js';

// a deterministic helical ramp descriptor for a facility (corkscrew through the foam, deck 0 → deck 1).
function rampFor(f, i) {
  const turns = 1.25 + (i % 4) * 0.25;          // 1.25–2 turns (varies per facility, deterministic)
  const r = 26 + (i % 3) * 6;                   // ramp radius in world units (a few cells wide)
  const dir = i % 2 ? 1 : -1;                   // handedness alternates
  return { x: f.x, y: f.y, turns, r, dir, facility: f.id, engine: f.engine, navePort: !!f.navePort };
}

export function twoDeckFactory(seed, opts = {}) {
  const { count = 7 } = opts;
  const mat = buildForgeRegion(seed, { count, optimize: true });   // deck 0 — the material factory
  const walk = regionWalk(mat);
  const routes = supplyRoutes(mat, walk);                          // the freight trunks (packets ride these)
  // deck 1 — offices over each facility core; catwalks follow the material trunks one deck up (the mezzanine)
  const offices = mat.facilities.map((f) => ({ x: f.x, y: f.y, engine: f.engine, color: f.color, navePort: !!f.navePort, facility: f.id, rooms: f.rooms.length }));
  const catwalks = routes.map((rt) => ({ poly: rt.poly, engine: rt.engine, cross: rt.cross }));
  const ramps = mat.facilities.map((f, i) => rampFor(f, i));
  return { mat, walk, routes, offices, catwalks, ramps, nave: mat.nave, bbox: mat.bbox, count };
}

// sample a point on a ramp helix at parameter t∈[0,1]: deck 0 (t=0) → deck 1 (t=1). z is returned as a
// fraction of the deck gap (the caller multiplies by its world deck height H).
export function rampPoint(ramp, t) {
  const a = ramp.dir * t * ramp.turns * Math.PI * 2;
  return { x: ramp.x + Math.cos(a) * ramp.r, y: ramp.y + Math.sin(a) * ramp.r, z: t };
}
