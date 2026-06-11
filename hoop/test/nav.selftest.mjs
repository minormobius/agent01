// nav.selftest.mjs — pins the two-tier wayfinding kernel (hoop/js/nav.js).
// Run: node hoop/test/nav.selftest.mjs
import '../js/ship.js'; // side-effect: sets globalThis.HoopShip
import { chambersIn } from '../js/postal.js';
import { routeChunks, doorTiles, doorBetween, fineRoute, route, makeShipFloor } from '../js/nav.js';

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

console.log(`nav.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
