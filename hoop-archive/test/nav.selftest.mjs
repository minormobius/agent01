// nav.selftest.mjs — pins the two-tier wayfinding kernel (hoop/js/nav.js).
// Run: node hoop/test/nav.selftest.mjs
import '../js/ship.js'; // side-effect: sets globalThis.HoopShip
import { chambersIn, chunkOf, CHUNK } from '../js/postal.js';
import { routeChunks, doorTiles, doorBetween, fineRoute, route, wayfan, makeShipFloor } from '../js/nav.js';
import { FoamField, foamPorts } from '../js/world.js'; // the LIVE deck, for the integration check

const Ship = globalThis.HoopShip, SEED = Ship.FLAGSHIP_SEED;
const isFloor = makeShipFloor(SEED);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
const connected = (tiles) => tiles.every((t, i) => i === 0 || adjacent(tiles[i - 1], t));
const allFloor = (tiles) => tiles.every((t) => isFloor(t.x, t.y));
const centre = (cx, cy, ord) => { const r = chambersIn(SEED, cx, cy)[ord]; return { x: r.x, y: r.y }; };

// ── COARSE: portal-graph A* over the chunk lattice ──
{
  const p = routeChunks(SEED, [0, 0], [4, 3]);
  ok(!!p, 'routeChunks finds a coarse path');
  ok(p[0][0] === 0 && p[0][1] === 0 && p[p.length - 1][0] === 4 && p[p.length - 1][1] === 3, 'coarse path runs from→to');
  ok(p.length === 4 + 3 + 1, 'coarse path is Manhattan-optimal on the open lattice');
  ok(p.every((c, i) => i === 0 || Math.abs(c[0] - p[i - 1][0]) + Math.abs(c[1] - p[i - 1][1]) === 1), 'every coarse step crosses one seam');
  ok(JSON.stringify(routeChunks(SEED, [0, 0], [4, 3])) === JSON.stringify(p), 'coarse routing is deterministic');
}

// ── door geometry: the cross-seam tiles are orthogonally adjacent and are floor ──
{
  const d = doorBetween(SEED, 0, 0, 1, 0);
  ok(adjacent(d.inTile, d.outTile), 'a seam crossing is a single orthogonal step');
  ok(isFloor(d.inTile.x, d.inTile.y) && isFloor(d.outTile.x, d.outTile.y), 'both sides of a seam door are floor');
  const dt = doorTiles(SEED, 0, 0);
  ok(dt.E.out.x === dt.E.x + 1 && dt.E.out.y === dt.E.y, 'east door opens into the eastern neighbour');
}

// ── FINE: bounded A* inside one chunk connects two chambers ──
{
  const leg = fineRoute(centre(2, 2, 0), centre(2, 2, 3), isFloor, { bound: { x0: 48, y0: 48, x1: 71, y1: 71 } });
  ok(!!leg, 'fineRoute connects two chambers within a chunk');
  ok(connected(leg) && allFloor(leg), 'the fine leg is a connected run of floor tiles');
}

// ── STITCH: the full HPA* route, start→goal across many chunks ──
{
  const from = centre(0, 0, 0), to = centre(4, 3, 2);
  const r = route(SEED, from, to, isFloor);
  ok(!!r, 'route() finds a full cross-chunk path');
  ok(r.tiles.length > 0 && connected(r.tiles), 'the stitched path is a single connected tile chain');
  ok(allFloor(r.tiles), 'every tile on the path is floor (no walking through walls)');
  ok(adjacent(r.tiles[0], from) || (r.tiles[0].x === from.x && r.tiles[0].y === from.y), 'the path starts at (or beside) the start tile');
  ok(r.tiles[r.tiles.length - 1].x === to.x && r.tiles[r.tiles.length - 1].y === to.y, 'the path ends exactly on the goal chamber');
  ok(r.portals.length === r.chunks.length - 1, 'one portal crossing per seam on the route');
  ok(JSON.stringify(route(SEED, from, to, isFloor).tiles) === JSON.stringify(r.tiles), 'routing is deterministic');
}

// ── same-chunk and negative-coordinate routes ──
{
  const same = route(SEED, centre(2, 2, 0), centre(2, 2, 3), isFloor);
  ok(same && same.chunks.length === 1 && connected(same.tiles) && allFloor(same.tiles), 'a same-chunk route stays in one chunk and connects');
  const neg = route(SEED, centre(0, 0, 0), centre(-3, -2, 1), isFloor);
  ok(neg && connected(neg.tiles) && allFloor(neg.tiles), 'a route into negative chunk space connects');
  const longHaul = route(SEED, centre(0, 0, 0), centre(9, 7, 3), isFloor);
  ok(longHaul && connected(longHaul.tiles) && allFloor(longHaul.tiles), 'a long-haul route (16 chunks) connects start→goal');
}

// ── INTEGRATION: route over the REAL foam deck (world.js FoamField) using foamPorts ──
{
  // the foam uses its own seam scheme — seamless, but distinct from ship.js edgePorts
  ok(foamPorts(SEED, 2, 1).E === foamPorts(SEED, 3, 1).W, 'foam seams agree across E↔W');
  ok(foamPorts(SEED, 2, 1).S === foamPorts(SEED, 2, 2).N, 'foam seams agree across S↔N');
  let diffs = 0; for (let c = 0; c < 8; c++) if (foamPorts(SEED, c, 1).E !== Ship.edgePorts(SEED, c, 1).E) diffs++;
  ok(diffs > 0, 'foam ports are a distinct scheme from ship.js edgePorts (the integration bug)');

  const ff = new FoamField(SEED);
  const foamFloor = (x, y) => ff.isFloor(x, y);
  // doorTiles honours the ports fn, and the foam door is real floor on both sides of the seam
  const d = doorTiles(SEED, 2, 1, foamPorts);
  ok(foamFloor(d.E.x, d.E.y) && foamFloor(d.E.out.x, d.E.out.y), 'the foam E door (via foamPorts) is floor on both sides');
  // routing with the DEFAULT (ship) ports would aim at the wrong tiles; foamPorts is required.

  const repTile = (cx, cy) => { const c = ff.chamberAt(cx * CHUNK + 12, cy * CHUNK + 12); return ff.chamberLocation(c.gid); };
  const from = repTile(0, 0), to = repTile(3, 2);
  const r = route(SEED, from, to, foamFloor, { ports: foamPorts });
  ok(!!r, 'route() finds a path over the REAL foam deck');
  ok(r && connected(r.tiles) && r.tiles.every((t) => foamFloor(t.x, t.y)), 'the foam route is a connected run of real foam-floor tiles');
  if (r) { const last = r.tiles[r.tiles.length - 1], lc = chunkOf(last.x, last.y); ok(lc.cx === 3 && lc.cy === 2, 'the foam route reaches the goal chunk'); }
  ok(JSON.stringify(route(SEED, from, to, foamFloor, { ports: foamPorts }).tiles) === JSON.stringify(r.tiles), 'foam routing is deterministic');
}

// ── THE WAYFINDING FAN: the geodesic tree that will define the visible map ──
{
  const o = centre(0, 0, 0);
  const fan = wayfan(isFloor, o, { radius: 14 });
  ok(fan.reached.size > 1, 'wayfan reaches a neighbourhood of cells from the player');
  ok(fan.reached.get(o.x + ',' + o.y).dist === 0, 'the origin is the root of the tree');
  // every reached cell is floor, within radius, and its parent is adjacent (a real tree)
  let treeOk = true, withinR = true;
  for (const n of fan.reached.values()) {
    if (!isFloor(n.x, n.y)) treeOk = false;
    if (n.dist > fan.radius) withinR = false;
    if (n.parent != null) { const p = fan.reached.get(n.parent); if (!p || Math.abs(p.x - n.x) + Math.abs(p.y - n.y) !== 1) treeOk = false; }
  }
  ok(treeOk, 'the fan is a real tree: every cell floor, parent orthogonally adjacent');
  ok(withinR, 'no cell exceeds the fan radius (truncated at the perimeter)');
  // tips are the perimeter; the geodesic to each tip is a connected floor run from the origin
  ok(fan.tips.length > 0, 'the fan has perimeter tips (the cells the routes radiate to)');
  let tipsOk = true;
  for (const t of fan.tips) { const path = fan.pathTo(t.x, t.y); if (!path || path.length === 0 || path[0].x !== o.x || path[0].y !== o.y || !connected(path) || !allFloor(path)) tipsOk = false; }
  ok(tipsOk, 'pathTo(tip) is a connected floor geodesic rooted at the player');
  ok(JSON.stringify([...wayfan(isFloor, o, { radius: 14 }).reached.keys()].sort()) === JSON.stringify([...fan.reached.keys()].sort()), 'wayfan is deterministic');
  // ENABLEMENT: a different wayfinding rule (cost) reshapes the fan — the map morphs
  const biased = wayfan(isFloor, o, { radius: 14, cost: (a, b) => (b.x > a.x ? 1 : 3) }); // cheap to head +x → elongated fan
  ok(JSON.stringify([...biased.reached.keys()].sort()) !== JSON.stringify([...fan.reached.keys()].sort()), 'changing the wayfinding rule changes the fan (the map can look different)');
}

console.log(`nav.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
