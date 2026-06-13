// deck.selftest.mjs — pins THE DECK PROJECTION (hoop/econ/deck.js + voronoi.js buildSceneCustom):
// a solved region's mid-shell band rendered in /paint's 8/24 membrane language, with the city
// deciding what every membrane is. Run: node hoop/test/deck.selftest.mjs
import { ringLattice } from '../econ/region.js';
import { coarseSolve } from '../econ/record.js';
import { deckScene, walkRoute, gateLinks } from '../econ/deck.js';
import { buildSceneCustom, bucketGrid, roomOf } from '../paint/voronoi.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── buildSceneCustom, synthetic: the painter honours the caller's membrane classification ──
{
  const seeds = []; for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) seeds.push({ x: 80 + x * 90, y: 80 + y * 90 });
  // open between rooms 0–1; door between 1–2; everything else walls
  const sc = buildSceneCustom({ W: 430, H: 430, wallSpacing: 8, roomSpacing: 20, seeds, seed: 3,
    edgeKind: (a, b) => { const k = a < b ? a + ',' + b : b + ',' + a; return k === '0,1' ? 'open' : k === '1,2' ? 'door' : 'wall'; } });
  ok(sc.paintCells.length > 100 && sc.paintCells.every((c) => c.poly.length >= 3), 'a valid custom scene paints');
  ok(sc.opens.length === 1 && sc.doors.length === 1, 'the classification is honoured (1 open, 1 door)');
  // the opened membrane carries NO wall nuclei ON it; a walled membrane does (distance measured
  // to the membrane SEGMENT — a midpoint disc would catch neighbouring perpendicular walls)
  const segDist = (n, e) => { const dx = n.x - e.m[0], dy = n.y - e.m[1]; const t = Math.max(-e.len / 2, Math.min(e.len / 2, dx * e.along[0] + dy * e.along[1])); return Math.hypot(n.x - (e.m[0] + e.along[0] * t), n.y - (e.m[1] + e.along[1] * t)); };
  const onMembrane = (e) => sc.wallNuclei.filter((n) => segDist(n, e) < 1.5).length;
  const o = sc.opens[0];
  ok(onMembrane(o) === 0, 'an OPEN membrane has zero wall nuclei along it (the wall is removed)');
  const walled = sc.adjEdges.find((e) => { const k = e.a < e.b ? e.a + ',' + e.b : e.b + ',' + e.a; return k !== '0,1' && k !== '1,2'; });
  ok(onMembrane(walled) > 0, 'a WALL membrane keeps its nuclei');
  ok(sc.floorNuclei.some((n) => n.door), 'doors and opens are floor-bridged');
  // THE DOORMAT TRIM: every door-tagged nucleus sits inside the wall band — thresholds read as
  // doorways, never as brown mats extending into the room
  const rg2 = bucketGrid(sc.roomSeeds, sc.roomSize * 1.4);
  ok(sc.floorNuclei.filter((n) => n.door).every((n) => roomOf(n, rg2).edgeDist <= sc.band + 1e-6), 'door-tagged nuclei stay inside the wall band (no doormats)');
}

// ── the deck of a solved region ──
const L = ringLattice({ Ri: 150, T: 12, cell: 1, regionsPerRing: 36 });
const rec = coarseSolve({ lattice: L, seed: 7, axMin: 0, axMax: 5 });
const d = deckScene({ lattice: L, seed: 7, record: rec, az: 3, ax: 1, axSpan: 14 });
{
  ok(d.stats.rooms > 200 && d.scene.paintCells.length > 3000, 'a deck band projects to a real paint scene (' + d.stats.rooms + ' rooms, ' + d.scene.paintCells.length + ' cells)');
  ok(d.stats.roadRooms > 0 && d.scene.opens.length > 0, 'the right-of-way reaches this deck as zero-wall concourse');
  const rrOpens = d.scene.opens.filter((e) => e.a < d.nReal && e.b < d.nReal);
  ok(rrOpens.every((e) => (d.owner[e.a] === -1 && d.owner[e.b] === -1) || (d.owner[e.a] >= 0 && d.owner[e.a] === d.owner[e.b])), 'real opens join two road rooms OR two rooms of the SAME building (open halls)');
  ok(d.scene.opens.filter((e) => e.a >= d.nReal || e.b >= d.nReal).every((e) => d.isGate.has(Math.min(e.a, e.b))), 'the only membranes opened into the ghost rim are the GATES (the street continues through the seam)');
  // exactly one STREET door per road-fronting building (service doors are a separate category)
  const ek = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
  const doored = new Map();
  for (const k of d.streetDoorKeys) {
    const [a, b] = k.split(',').map(Number);
    const bo = d.owner[a] >= 0 ? d.owner[a] : d.owner[b];
    doored.set(bo, (doored.get(bo) || 0) + 1);
  }
  ok([...doored.values()].every((n) => n === 1), 'every street-doored building has EXACTLY one street door (sequestration)');
  const fronting = new Set();
  for (const e of d.scene.adjEdges) {
    if (e.a >= d.nReal || e.b >= d.nReal) continue;          // frontage is onto OUR road, not the neighbour's
    const bo = d.owner[e.a] >= 0 && d.owner[e.b] === -1 ? d.owner[e.a] : d.owner[e.b] >= 0 && d.owner[e.a] === -1 ? d.owner[e.b] : -1;
    if (bo >= 0) fronting.add(bo);
  }
  ok(doored.size === fronting.size, 'every building that fronts the street on this deck gets its door (' + doored.size + '/' + fronting.size + ')');
  // UNIVERSAL NAVIGABILITY: every room reaches every room (the hard requirement)
  const walkAdj = Array.from({ length: d.nReal }, () => []);
  for (const e of d.scene.doors.concat(d.scene.opens)) { if (e.a >= d.nReal || e.b >= d.nReal) continue; walkAdj[e.a].push(e.b); walkAdj[e.b].push(e.a); }
  let start0 = 0; while (d.sealed.has(start0)) start0++;
  const seenW = new Set([start0]), qW = [start0];
  while (qW.length) { const u = qW.pop(); for (const v of walkAdj[u]) if (!seenW.has(v)) { seenW.add(v); qW.push(v); } }
  ok(seenW.size === d.nReal - d.sealed.size, 'EVERY unsealed room is navigable to every other (' + seenW.size + '/' + (d.nReal - d.sealed.size) + ')');
  ok(d.sealed.size <= d.nReal * 0.03, 'sealed border pockets are rare (' + d.sealed.size + '/' + d.nReal + ' — their connectivity is the 3D stairs leg)');
  ok(d.serviceEdges.length > 0 && d.serviceEdges.length < d.seeds.length * 0.25, 'service doors are few — easements, not a second road network (' + d.serviceEdges.length + ')');
  ok(d.serviceEdges.every((e) => !d.streetDoorKeys.has(ek(e.a, e.b))), 'service doors and street doors are disjoint categories');
  // class weighting: easements prefer not to run through homes
  const dwellTouch = d.serviceEdges.filter((e) => d.role[e.a] === 'dwell' || d.role[e.b] === 'dwell').length;
  ok(dwellTouch < d.serviceEdges.length * 0.6, 'most easements avoid homes (' + dwellTouch + '/' + d.serviceEdges.length + ' touch a dwelling)');
  // OPEN HALLS: every membrane INSIDE a building is removed — the building is one room bounded only
  // by its exterior shell (+ its one street door). No interior walls, no interior doors.
  const openSet = new Set(d.scene.opens.map((e) => ek(e.a, e.b)));
  const doorSet = new Set(d.scene.doors.map((e) => ek(e.a, e.b)));
  let hallsOK = true, interiorDoors = 0;
  for (const e of d.scene.adjEdges) {
    if (e.a >= d.nReal || e.b >= d.nReal) continue;
    if (d.owner[e.a] >= 0 && d.owner[e.a] === d.owner[e.b]) {     // a same-building membrane
      if (!openSet.has(ek(e.a, e.b))) hallsOK = false;           // must be removed (open)
      if (doorSet.has(ek(e.a, e.b))) interiorDoors++;            // and never a door
    }
  }
  ok(hallsOK && interiorDoors === 0, 'every building is one OPEN HALL — interior membranes removed, no interior walls or doors (' + interiorDoors + ' interior doors)');
  ok(d.bill.length === d.stats.buildings && d.bill.every((g) => g.glyph && g.n >= 1), 'every deck-present building gets a glyph anchor');
  // determinism (the regenerate-a-year-later contract, at the render layer)
  const d2 = deckScene({ lattice: L, seed: 7, record: rec, az: 3, ax: 1, axSpan: 14 });
  ok(d2.scene.paintCells.length === d.scene.paintCells.length && d2.scene.doors.length === d.scene.doors.length && d2.scene.opens.length === d.scene.opens.length, 'the deck render is deterministic');
}

// ── WAYFINDING between probes: routes obey the membranes, and a building's exit IS its one door ──
{
  // two concourse rooms route (the street network is one component on this deck or close to it)
  const roads = []; d.owner.forEach((o, i) => { if (o === -1 && !d.sealed.has(i)) roads.push(i); });
  let roadRoute = null;
  outer: for (let i = 0; i < roads.length; i++) for (let j = roads.length - 1; j > i; j--) { roadRoute = walkRoute(d, roads[i], roads[j]); if (roadRoute) break outer; }
  ok(!!roadRoute && roadRoute.rooms.length >= 2 && roadRoute.length > 0, 'two probes on the concourse route (' + (roadRoute && roadRoute.rooms.length) + ' rooms, ' + Math.round(roadRoute ? roadRoute.length : 0) + ' px)');
  // every step of a route crosses a door or an open membrane — never a wall
  const passable = new Set();
  for (const e of d.scene.doors.concat(d.scene.opens)) passable.add(Math.min(e.a, e.b) + ',' + Math.max(e.a, e.b));
  const legal = (r) => r.rooms.every((u, k) => k === 0 || passable.has(Math.min(u, r.rooms[k - 1]) + ',' + Math.max(u, r.rooms[k - 1])));
  ok(legal(roadRoute), 'every crossing in a route is a door or an open membrane (walls are walls)');
  // a probe INSIDE a building with no easements exits through its ONE street door
  const ek2 = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
  const serviceTouch = new Set();
  for (const e of d.serviceEdges) { if (d.owner[e.a] >= 0) serviceTouch.add(d.owner[e.a]); if (d.owner[e.b] >= 0) serviceTouch.add(d.owner[e.b]); }
  let funnel = null;
  for (const k of d.streetDoorKeys) {
    const [a, b] = k.split(',').map(Number);
    const bo = d.owner[a] >= 0 ? d.owner[a] : d.owner[b];
    if (serviceTouch.has(bo)) continue;                    // pick a building whose only exit is the street door
    const inside = []; d.owner.forEach((o, i) => { if (o === bo) inside.push(i); });
    if (!inside.length || !roads.length) continue;
    const r = walkRoute(d, inside[0], roads[0]);
    if (!r) continue;
    let exit = null;
    for (let j = 1; j < r.rooms.length; j++) if (d.owner[r.rooms[j - 1]] === bo && d.owner[r.rooms[j]] !== bo) { exit = ek2(r.rooms[j - 1], r.rooms[j]); break; }
    funnel = exit === k; break;
  }
  ok(funnel === true, 'a journey out of an easement-free building funnels through its ONE street door');
  // and now the original complaint: random probe pairs ALWAYS route
  const open = []; for (let i = 0; i < d.nReal; i++) if (!d.sealed.has(i)) open.push(i);
  let allRoute = true;
  for (let t = 0; t < 30; t++) {
    const a = open[(t * 7919) % open.length], b = open[(t * 104729 + 13) % open.length];
    if (a !== b && !walkRoute(d, a, b)) { allRoute = false; break; }
  }
  ok(allRoute, 'NO MORE "no path": 30 random probe pairs all route');
}

// ── PATHFINDING IS A FUNCTION OF WALLS: the LOS-pulled route never crosses a wall, and runs
//    straight across open space (far fewer corners than the dense centre-to-centre path) ──
{
  const segX = (ax, ay, bx, by, cx, cy, dx, dy) => {
    const s1 = (cx - ax) * (dy - ay) - (cy - ay) * (dx - ax), s2 = (cx - bx) * (dy - by) - (cy - by) * (dx - bx);
    const s3 = (ax - cx) * (by - cy) - (ay - cy) * (bx - cx), s4 = (ax - dx) * (by - dy) - (ay - dy) * (bx - dx);
    return ((s1 > 0) !== (s2 > 0)) && ((s3 > 0) !== (s4 > 0));
  };
  const hitsWall = (A, B) => {                              // inset so door-jamb endpoints don't false-positive
    const vx = B[0] - A[0], vy = B[1] - A[1], ln = Math.hypot(vx, vy) || 1, ux = vx / ln * 0.8, uy = vy / ln * 0.8;
    const a = [A[0] + ux, A[1] + uy], b = [B[0] - ux, B[1] - uy];
    return d.walls.some((w) => segX(a[0], a[1], b[0], b[1], w[0], w[1], w[2], w[3]));
  };
  const probes = []; for (let i = 0; i < d.nReal; i++) if (!d.sealed.has(i)) probes.push(i);
  let routes = 0, crossings = 0, corners = 0, dijCells = 0;
  for (let t = 0; t < 40; t++) {
    const a = probes[(t * 7919) % probes.length], b = probes[(t * 104729 + 13) % probes.length];
    if (a === b) continue;
    const r = walkRoute(d, a, b); if (!r) continue;
    routes++; dijCells += r.rooms.length; corners += r.pts.length;
    for (let i = 1; i < r.pts.length; i++) if (hitsWall(r.pts[i - 1], r.pts[i])) { crossings++; break; }
  }
  ok(d.walls && d.walls.length > 100, 'the deck ships its wall segments for line-of-sight (' + (d.walls && d.walls.length) + ')');
  ok(crossings === 0, 'NO route crosses a wall — the path is a function of the walls (' + crossings + '/' + routes + ')');
  ok(corners < dijCells, 'LOS pulls the path taut — far fewer corners than Dijkstra cells (' + corners + ' pts vs ' + dijCells + ' cells)');
}

// ── FRAME-CLIP: no oblong stitch cells — every paint cell is bounded to the region frame + margin ──
{
  const M = d.K * 1.5 + 1e-6;
  const outOfBounds = d.scene.paintCells.filter((c) => c.poly.some((p) => p[0] < -M || p[1] < -M || p[0] > d.frame.W + M || p[1] > d.frame.H + M));
  ok(outOfBounds.length === 0, 'every paint cell is clipped to the frame + seam margin — no unanchored oblongs (' + outOfBounds.length + ' stray)');
}

// ── STAIRS & LADDERS: the vertical right-of-way emerges from the 3D solve ──
{
  ok(d.stairs.length > 0, 'the deck has stairs/ladders — vertical right-of-way (' + d.stairs.length + ')');
  ok(d.stairs.every((s) => d.owner[s.cell] === -1), 'every stair sits on the concourse (a road cell)');
  ok(d.stairs.every((s) => s.dir === 1 || s.dir === -1), 'each connector goes up (−1) or down (+1)');
  // the floor below (gz+1): each down-stair lands on a road cell there (reuse the same 3D solve)
  const below = deckScene({ lattice: L, seed: 7, record: rec, az: 3, ax: 1, axSpan: 14, gz: d.gz + 1, solved: d.solved });
  const bGid = new Map(); below.band.forEach((c, i) => bGid.set(c.gid, i));
  const downs = d.stairs.filter((s) => s.dir === 1);
  ok(downs.length > 0 && downs.every((s) => { const pr = bGid.get(s.partnerGid); return pr != null && below.owner[pr] === -1; }), 'down-stairs land on a road cell of the deck below (' + downs.length + ')');
  // determinism
  const d2 = deckScene({ lattice: L, seed: 7, record: rec, az: 3, ax: 1, axSpan: 14, solved: d.solved });
  ok(JSON.stringify(d2.stairs) === JSON.stringify(d.stairs), 'the stair set is deterministic');
}

// ── GRAVITY'S BIAS: planar conductance caps consolidate streets onto the deck ──
{
  const frag = (dd) => {
    const par = new Map(); const find = (x) => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
    dd.owner.forEach((o, i) => { if (o === -1) par.set(i, i); });
    for (const e of dd.scene.opens) if (par.has(e.a) && par.has(e.b)) par.set(find(e.a), find(e.b));
    return new Set([...par.keys()].map(find)).size;
  };
  const iso = deckScene({ lattice: L, seed: 7, record: rec, az: 3, ax: 1, axSpan: 14, solveOpts: { planarBias: 1, bandBias: 1 } });
  ok(frag(d) < frag(iso), 'the planar bias CONSOLIDATES the deck street network (' + frag(d) + ' fragments vs ' + frag(iso) + ' unbiased)');
  ok(d.stats.roadRooms > iso.stats.roadRooms, 'more street lands ON the playable deck under gravity\'s bias (' + d.stats.roadRooms + ' vs ' + iso.stats.roadRooms + ' rooms)');
  ok(d.stats.serviceDoors < iso.stats.serviceDoors, 'fewer easements are needed when streets run in-plane (' + d.stats.serviceDoors + ' vs ' + iso.stats.serviceDoors + ')');
}

// ── GATE LINKS (the game's border crossings): symmetric, landing in the neighbour's right-of-way ──
{
  let tested = false;
  for (let az = 0; az < 36 && !tested; az++) {
    const da = deckScene({ lattice: L, seed: 7, record: rec, az, ax: 1, axSpan: 14 });
    const la = gateLinks(da, { lattice: L, seed: 7, record: rec, az, ax: 1, axSpan: 14 });
    if (!la.length) continue;
    tested = true;
    ok(la.every((lk) => da.owner[lk.room] === -1 && da.isGate.has(lk.room)), 'every crossing sits on a gate room in OUR right-of-way');
    const lk = la[0];
    const db = deckScene({ lattice: L, seed: 7, record: rec, az: lk.to.az, ax: lk.to.ax, axSpan: 14 });
    const partnerRoom = db.band.findIndex((c) => c.gid === lk.partner);
    ok(partnerRoom >= 0, 'the partner chamber is a deck room of the neighbour (gates pair within a gz)');
    ok(db.owner[partnerRoom] === -1, 'the landing room is in the NEIGHBOUR\'s right-of-way (seam continuity, playable)');
    const lb = gateLinks(db, { lattice: L, seed: 7, record: rec, az: lk.to.az, ax: lk.to.ax, axSpan: 14 });
    const back = lb.find((b) => b.gid === lk.partner);
    ok(!!back && back.partner === lk.gid, 'the neighbour links BACK through the same gate (crossings are symmetric)');
    // the settled society rides along for the game's inspector
    ok(da.solved.society && da.solved.society.people.length > 200, 'the final settled society ships with the solve (' + da.solved.society.people.length + ' residents)');
  }
  ok(tested, 'at least one region on the test ring has deck-level crossings');
}

// ── THE CONTINUITY PIN: regions tile a continuous world — A's ghosts ARE B's reals, same world px ──
{
  const b2 = deckScene({ lattice: L, seed: 7, record: rec, az: 4, ax: 1, axSpan: 14 });
  const bByGid = new Map(); b2.band.forEach((c, i) => bByGid.set(c.gid, i));
  let checked = 0, maxErr = 0;
  d.ghostBand.forEach((g, gi) => {
    const bi = bByGid.get(g.gid);
    if (bi == null) return;
    checked++;
    const aw = d.seeds[d.nReal + gi], bw = b2.seeds[bi];
    const err = Math.hypot(aw.x - (bw.x + d.frame.W), aw.y - bw.y);   // B sits one region +az of A
    if (err > maxErr) maxErr = err;
  });
  ok(checked > 10, 'A sees a populated shared strip with B (' + checked + ' chambers)');
  ok(maxErr < 1e-6, 'GHOSTS ARE THE NEIGHBOUR, bit-for-bit: max world-position error ' + maxErr.toExponential(1) + ' px — the seam does not exist');
}

console.log(`deck.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
