// roomsfirst.js — the v2 chunk solver: GROW ROOMS FIRST, then path a concourse to reach every room.
//
// v1 (perfuse → seize → paintRooms) grows the concourse by CELL hypoxia and carves rooms from the
// leftover tissue, so rooms are an afterthought and the rim leaves thin slivers. v2 inverts it: partition
// the whole interior into rooms up front (footprint-weighted graph-Voronoi + role floors + surface
// tension), THEN grow a minimal concourse that reaches every ROOM (oxygen to rooms, not cells) — seeded at
// the ports, Prim-grown until every room borders road, with each room guaranteed a door onto one connected
// concourse. Same record contract as v1 ({ road, roomOf, rooms:[{cells,door,doorRoad,x,y,role}] }).
//
// Pure; node-tested against the contract in test/roomsfirst.selftest.mjs.

import { mulberry32, assignZones, relaxZones } from '../paint/voronoi.js';
import { centroid, widenOneSided } from './foam.js';
import { ROLES, ROLE_MIX } from '../econ/econ.js';

const drawFrom = (mix, rng) => { const tot = mix.reduce((s, m) => s + m[1], 0); let r = rng() * tot; for (const [k, w] of mix) { r -= w; if (r <= 0) return k; } return 'dwell'; };

// plan a role per zone: a grand civic anchor, then the role FLOORS (≥ N of each required building type),
// then fill the rest from the role mix. Weights drive each zone's footprint (cells).
function planZones(nZones, footprint, grand, grandMin, roleFloors, roleMix, rng) {
  const mix = roleMix || ROLE_MIX, roles = [];
  if (grand && grand.length && nZones >= grandMin) roles.push(grand[Math.floor(rng() * grand.length)]);
  if (roleFloors) for (const [role, cnt] of Object.entries(roleFloors)) for (let i = 0; i < cnt && roles.length < nZones; i++) roles.push(role);
  while (roles.length < nZones) roles.push(drawFrom(mix, rng));
  const weights = roles.map((r) => (footprint && footprint[r]) || 1);
  return { roles, weights };
}

export function solveRoomsFirst(foam, chunk, opts = {}) {
  const { roomSize = 14, seed = 1, footprint = null, grand = null, grandMin = 3, roleFloors = null, roleMix = null, tension = 0, concourseWidth = 2, edgeMargin = 3, microRoom = 6 } = opts;
  const N = foam.cells.length, interior = chunk.interior;
  const rng = mulberry32((seed ^ 0x2f1d) >>> 0);
  const portCellSet = chunk.portCells || new Set();

  // EDGE MARGIN: how far (graph hops) every cell is from the rim. The concourse is BANISHED from the edge
  // by `edgeMargin` cells (so edge rooms are that deep, not skrawny). `roadable` is the strict boundary
  // condition: a cell may carry road only if it is a port OR it lies ≥ edgeMargin cells in from the rim.
  // The lone exception is a thin per-port stub (carved below), so a rim port can still reach inward.
  const edgeDist = new Int32Array(N).fill(-1), eq = [];
  for (const c of interior) if (chunk.rim && chunk.rim[c]) { edgeDist[c] = 0; eq.push(c); }
  for (let h = 0; h < eq.length; h++) { const u = eq[h]; for (const v of foam.adj[u]) { if (chunk.ghost[v] || edgeDist[v] >= 0) continue; edgeDist[v] = edgeDist[u] + 1; eq.push(v); } }
  const roadable = (cid) => portCellSet.has(cid) || edgeDist[cid] < 0 || edgeDist[cid] >= edgeMargin;

  // ── 1) PARTITION the whole interior into zones (rooms-first) ──
  const li = new Map(); interior.forEach((c, i) => li.set(c, i));
  const subEdges = [];
  for (const c of interior) for (const v of foam.adj[c]) { if (v > c && li.has(v)) subEdges.push({ a: li.get(c), b: li.get(v) }); }
  const nZones = Math.max(1, Math.round(interior.length / roomSize));
  const plan = planZones(nZones, footprint, grand, grandMin, roleFloors, roleMix, rng);
  let zoneLocal = assignZones(interior.length, subEdges, plan.weights, (seed ^ 0x9e37) >>> 0);
  if (tension > 0) zoneLocal = relaxZones(interior.length, subEdges, zoneLocal, tension);
  const zoneCell = new Int32Array(N).fill(-1);
  interior.forEach((c, i) => { zoneCell[c] = zoneLocal[i]; });
  const zoneRole = (z) => plan.roles[z] || 'dwell';

  // ── 2) ROAD: seed ports, connect them, then Prim-grow to reach every room ──
  // BOUNDARY CONDITION: the concourse only ever paves roadable cells — i.e. NOT the rim, except at the
  // ports. So the perimeter belongs to rooms (the player meets rooms on the edge), and the concourse is
  // forced inward instead of looping around the outside. (allowRim is a last-resort escape so a port or a
  // room walled behind a thick rim can still connect.)
  const road = new Uint8Array(N);
  // PORT STUBS: the strict margin forbids road within `edgeMargin` of the rim, but ports SIT on the rim.
  // Carve a single shortest stub from each port straight inward to the first roadable cell, so the port
  // reaches the concourse without the road ever running ALONG the edge. These stubs are the only road
  // permitted inside the margin band.
  for (const p of chunk.ports) {
    const s = p.cell; if (s < 0 || chunk.ghost[s]) continue;
    road[s] = 1;
    if (edgeDist[s] >= edgeMargin) continue;
    // punch straight inward: PREFER never routing the stub along the rim (skip other edgeDist-0 cells) so
    // the only perimeter cell it paves is the port itself. A port buried in a notch may have no inward
    // escape without one rim step — so fall back to allowing rim traversal if the strict pass finds none.
    const stub = (avoidRim) => {
      const par = new Int32Array(N).fill(-2), q = [s]; par[s] = -1; let hit = -1;
      for (let h = 0; h < q.length && hit < 0; h++) { const u = q[h]; for (const v of foam.adj[u]) { if (chunk.ghost[v] || par[v] !== -2 || (avoidRim && edgeDist[v] === 0)) continue; par[v] = u; if (edgeDist[v] >= edgeMargin) { hit = v; break; } q.push(v); } }
      if (hit < 0) return false;
      for (let u = hit; u !== -1; u = par[u]) road[u] = 1;
      return true;
    };
    if (!stub(true)) stub(false);
  }
  const carveTo = (isTarget, allowRim = false) => {
    const par = new Int32Array(N).fill(-2), q = [];
    for (const c of interior) if (road[c]) { par[c] = -1; q.push(c); }
    if (!q.length) { const t = interior.find(isTarget); if (t == null) return false; road[t] = 1; return true; }
    let hit = -1;
    for (let h = 0; h < q.length && hit < 0; h++) { const u = q[h]; for (const v of foam.adj[u]) { if (chunk.ghost[v] || par[v] !== -2 || (!allowRim && !roadable(v) && !isTarget(v))) continue; par[v] = u; if (isTarget(v)) { hit = v; break; } q.push(v); } }
    if (hit < 0) return false;
    for (let u = hit; u !== -1; u = par[u]) road[u] = 1;
    return true;
  };
  const ports = chunk.ports.map((p) => p.cell).filter((c) => c >= 0 && !chunk.ghost[c]);
  if (ports.length) { road[ports[0]] = 1; for (let i = 1; i < ports.length; i++) if (!road[ports[i]]) { if (!carveTo((v) => v === ports[i])) carveTo((v) => v === ports[i], true); } }
  else { const c = interior.find((i) => roadable(i)); road[c == null ? interior[0] : c] = 1; }

  const served = new Uint8Array(nZones);
  const markServed = () => { served.fill(0); for (const c of interior) if (!road[c]) for (const v of foam.adj[c]) if (road[v]) { served[zoneCell[c]] = 1; break; } };
  const aliveZones = new Set(zoneCell.length ? Array.from(interior, (c) => zoneCell[c]) : []);
  markServed();
  // a room is served by carving a roadable cell ADJACENT to one of its cells (so the concourse touches the
  // room from inside, never riding its rim cells).
  const nearUnserved = (v) => roadable(v) && !road[v] && foam.adj[v].some((w) => !road[w] && zoneCell[w] >= 0 && !served[zoneCell[w]]);
  let guard = 0;
  while (guard++ < nZones * 4) {
    let any = false; for (const z of aliveZones) if (!served[z]) { any = true; break; }
    if (!any) break;
    if (!carveTo(nearUnserved)) break;
    markServed();
  }
  stitchRoad(foam, chunk, road, roadable);
  // CONCOURSE WIDTH: widen the 1-cell capillaries to the minimum (default 2-wide), roadable only (the
  // widener already refuses rim cells), so corridors aren't hairline.
  if (concourseWidth > 1) widenOneSided(foam, chunk, road, concourseWidth - 1, roadable);

  // ── 3) ROOMS = per-zone connected components of the non-road cells; each guaranteed a door ──
  const buildRooms = () => {
    const comp = new Int32Array(N).fill(-1), out = [];
    for (const s of interior) {
      if (road[s] || comp[s] >= 0) continue;
      const z = zoneCell[s]; if (z < 0) continue;
      const cells = [], q = [s]; comp[s] = out.length;
      for (let h = 0; h < q.length; h++) { const u = q[h]; cells.push(u); for (const v of foam.adj[u]) if (!road[v] && zoneCell[v] === z && comp[v] < 0) { comp[v] = out.length; q.push(v); } }
      out.push({ cells, zone: z });
    }
    return out;
  };
  let rcs = buildRooms();
  // give any room without a road neighbour a door: carve up to (not into) it, then rebuild.
  let dg = 0;
  while (dg++ < 40) {
    let orphan = null;
    for (const r of rcs) if (!r.cells.some((c) => foam.adj[c].some((v) => road[v]))) { orphan = new Set(r.cells); break; }
    if (!orphan) break;
    // reach a roadable cell ADJACENT to the orphan (keeps the rim boundary); fall back to allowing rim.
    const adjOrphan = (v) => roadable(v) && !road[v] && foam.adj[v].some((w) => orphan.has(w));
    if (!carveTo(adjOrphan) && !carveTo((v) => orphan.has(v), true)) break;
    rcs = buildRooms();
  }

  // MICROROOM CLEANUP: eminent-domain road-building leaves slivers. A room smaller than `microRoom`
  // cells is absorbed into the neighbouring ROOM it shares the most border with; if it has no room
  // neighbour (walled off by concourse on every side) it dissolves INTO the concourse. Iterate, smallest
  // first — absorbing can expose a new sliver, and a dissolved sliver only ever adds connected road.
  if (microRoom > 1) {
    const stuck = new Set();
    let mg = 0;
    while (mg++ < rcs.length * 2 + 40) {
      const cellRoom = new Int32Array(N).fill(-1);
      rcs.forEach((r, ri) => { for (const c of r.cells) cellRoom[c] = ri; });
      // role census so we never absorb away the LAST room of a required type (keep the role floors).
      const roleCount = {}; for (const r of rcs) { const role = zoneRole(r.zone); roleCount[role] = (roleCount[role] || 0) + 1; }
      let target = -1;
      for (let ri = 0; ri < rcs.length; ri++) {
        if (rcs[ri].cells.length >= microRoom || stuck.has(rcs[ri])) continue;
        if (roleCount[zoneRole(rcs[ri].zone)] <= 1) continue;   // protect the sole room of its role
        if (target < 0 || rcs[ri].cells.length < rcs[target].cells.length) target = ri;
      }
      if (target < 0) break;
      const border = new Map();
      for (const c of rcs[target].cells) for (const v of foam.adj[c]) { const nr = cellRoom[v]; if (nr >= 0 && nr !== target) border.set(nr, (border.get(nr) || 0) + 1); }
      if (border.size) {
        let best = -1, bb = -1; for (const [nr, b] of border) if (b > bb) { bb = b; best = nr; }
        for (const c of rcs[target].cells) { rcs[best].cells.push(c); zoneCell[c] = rcs[best].zone; }
      } else {
        // no room neighbour: dissolve into the concourse — but NEVER pave the rim (keep the boundary);
        // a rim-touching orphan sliver stays a tiny room instead.
        if (rcs[target].cells.some((c) => chunk.rim && chunk.rim[c])) { stuck.add(rcs[target]); continue; }
        for (const c of rcs[target].cells) { road[c] = 1; zoneCell[c] = -1; }
      }
      rcs.splice(target, 1);
    }
  }

  const roomOf = new Int32Array(N).fill(-1), rooms = [];
  for (const { cells, zone } of rcs) {
    if (cells.length < 1) continue;
    const id = rooms.length; for (const c of cells) roomOf[c] = id;
    const ctr = centroid(foam.cells, cells);
    let door = -1, doorRoad = -1, bd = Infinity;
    for (const c of cells) for (const v of foam.adj[c]) if (road[v]) { const d = (foam.cells[c].x - ctr.x) ** 2 + (foam.cells[c].y - ctr.y) ** 2; if (d < bd) { bd = d; door = c; doorRoad = v; } }
    rooms.push({ id, cells, door, doorRoad, x: ctr.x, y: ctr.y, role: zoneRole(zone) });
  }

  // role census (for tests / readout): how many of each building type the floors achieved.
  const roleCount = {}; for (const r of rooms) roleCount[r.role] = (roleCount[r.role] || 0) + 1;
  return { road, roomOf, rooms, stats: { rooms: rooms.length, zones: nZones, roleCount } };
}

// connect every stray road fragment to the largest along the cheapest roadable path (one component).
function stitchRoad(foam, chunk, road, roadable) {
  for (let pass = 0; pass < 4; pass++) {
    const comp = new Int32Array(foam.cells.length).fill(-1), sizes = []; let nc = 0;
    for (const i of chunk.interior) { if (!road[i] || comp[i] >= 0) continue; const q = [i]; comp[i] = nc; let s = 0; while (q.length) { const u = q.pop(); s++; for (const v of foam.adj[u]) if (road[v] && comp[v] < 0) { comp[v] = nc; q.push(v); } } sizes.push(s); nc++; }
    if (nc <= 1) return;
    const main = sizes.indexOf(Math.max(...sizes));
    const dist = new Int32Array(foam.cells.length).fill(-1), from = new Int32Array(foam.cells.length).fill(-1), q = [];
    for (const i of chunk.interior) if (road[i] && comp[i] === main) { dist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of foam.adj[u]) { if (chunk.ghost[v] || dist[v] >= 0 || (!roadable(v) && !road[v])) continue; dist[v] = dist[u] + 1; from[v] = u; q.push(v); } }
    const reps = new Map();
    for (const i of chunk.interior) if (road[i] && comp[i] !== main && dist[i] >= 0) { const r = reps.get(comp[i]); if (!r || dist[i] < r.d) reps.set(comp[i], { cell: i, d: dist[i] }); }
    if (!reps.size) return;
    for (const { cell } of reps.values()) for (let u = cell; u !== -1 && comp[u] !== main; u = from[u]) road[u] = 1;
  }
}
