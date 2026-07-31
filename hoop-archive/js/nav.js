// nav.js — wayfinding across the infinite ship: two-tier hierarchical routing (HPA*).
//
// The single windowed tile-BFS in world.js can't route across the unbounded map. The
// deterministic chunk structure hands us the textbook hierarchical answer, in two tiers:
//
//   COARSE — the PORTAL GRAPH. Chunks connect only through their four seam doors
//     (HoopShip.edgePorts, seed-only, always open), so the inter-chunk graph is a 4-regular
//     lattice. A* over chunk coords plans the sequence of chunks (and the doors to cross),
//     realising chunks lazily along the frontier. Heuristic: Manhattan chunk distance.
//
//   FINE — the CHAMBER/TILE GRAPH. Inside each chunk we route entry-door → exit-door (and the
//     final chunk door → target tile) with a bounded A* over an `isFloor(x,y)` predicate — so
//     nav is decoupled from the rendering substrate and works against ship.js tiles OR world.js
//     foam, whichever the caller exposes (same {tiles} shape, "renders/moves on it unchanged").
//
//   STITCH — concatenate: coarse gives portals p0,p1,…; fine fills each leg; a one-tile step
//     crosses each seam. The result is a single connected tile path start→goal.
//
// This is HPA*, and the 2-D-deck cousin of rind/wayfind.js (which does the 3-D structural
// version: spiral ramps + azimuthal roads through the foam). Pure + deterministic; the coarse
// tier needs only the seed, the fine tier only `isFloor`. Pinned by hoop/test/nav.selftest.mjs.

import { chunkOf, CHUNK } from './postal.js';

const SHIP = () => globalThis.HoopShip;

// ── a tiny binary min-heap (entries: [priority, ...payload]) ───────────────────────────────
function heap() {
  const a = [];
  return {
    get size() { return a.length; },
    push(e) { a.push(e); let k = a.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (a[p][0] <= a[k][0]) break; [a[p], a[k]] = [a[k], a[p]]; k = p; } },
    pop() { const top = a[0], last = a.pop(); if (a.length) { a[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === k) break;[a[m], a[k]] = [a[k], a[m]]; k = m; } } return top; },
  };
}

// ── the four seam doors of a chunk, in world tiles + the neighbour they cross to ───────────
// `portsFn(seed,cx,cy) → {W,E,N,S}` selects the substrate's seam scheme: ship.js edgePorts (the
// default / reference) or world.js foamPorts (the live deck). They differ in offset; everything
// else is identical, so nav stays substrate-correct by threading the right ports through.
export function doorTiles(seed, cx, cy, portsFn) {
  const Ship = SHIP(), p = (portsFn || Ship.edgePorts)(seed, cx, cy), C = CHUNK, ox = cx * C, oy = cy * C;
  return {
    W: { x: ox,         y: oy + p.W, nbr: [cx - 1, cy], out: { x: ox - 1,     y: oy + p.W } },
    E: { x: ox + C - 1, y: oy + p.E, nbr: [cx + 1, cy], out: { x: ox + C,     y: oy + p.E } },
    N: { x: ox + p.N,   y: oy,       nbr: [cx, cy - 1], out: { x: ox + p.N,   y: oy - 1 } },
    S: { x: ox + p.S,   y: oy + C - 1, nbr: [cx, cy + 1], out: { x: ox + p.S, y: oy + C } },
  };
}
// the door of chunk (ax,ay) facing its lattice-adjacent neighbour (bx,by): {inTile, outTile}
export function doorBetween(seed, ax, ay, bx, by, portsFn) {
  const d = doorTiles(seed, ax, ay, portsFn);
  if (bx === ax + 1 && by === ay) return { inTile: { x: d.E.x, y: d.E.y }, outTile: d.E.out };
  if (bx === ax - 1 && by === ay) return { inTile: { x: d.W.x, y: d.W.y }, outTile: d.W.out };
  if (by === ay + 1 && bx === ax) return { inTile: { x: d.S.x, y: d.S.y }, outTile: d.S.out };
  if (by === ay - 1 && bx === ax) return { inTile: { x: d.N.x, y: d.N.y }, outTile: d.N.out };
  return null; // not lattice-adjacent
}

// ── COARSE: A* over the chunk lattice. Returns [[cx,cy],…] from→to inclusive, or null. ─────
export function routeChunks(seed, from, to, opts = {}) {
  const passable = opts.passable || (() => true), maxExpand = opts.maxExpand || 100000;
  const key = (x, y) => x + ',' + y, [tx, ty] = to;
  const h = (x, y) => Math.abs(x - tx) + Math.abs(y - ty);
  const open = heap(); open.push([h(from[0], from[1]), from[0], from[1]]);
  const g = new Map([[key(from[0], from[1]), 0]]), came = new Map(), done = new Set();
  let exp = 0;
  while (open.size && exp++ < maxExpand) {
    const [, x, y] = open.pop(), k = key(x, y);
    if (done.has(k)) continue; done.add(k);
    if (x === tx && y === ty) { const path = [[x, y]]; let c = k; while (came.has(c)) { const [px, py] = came.get(c); path.unshift([px, py]); c = key(px, py); } return path; }
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const nk = key(nx, ny);
      if (done.has(nk) || !passable(seed, [x, y], [nx, ny])) continue;
      const ng = g.get(k) + 1;
      if (g.get(nk) === undefined || ng < g.get(nk)) { g.set(nk, ng); came.set(nk, [x, y]); open.push([ng + h(nx, ny), nx, ny]); }
    }
  }
  return null;
}

// ── FINE: bounded A* over an isFloor predicate. Returns [{x,y},…] inclusive, or null. ──────
function snapFloor(p, isFloor, radius) {
  const x0 = Math.round(p.x), y0 = Math.round(p.y);
  if (isFloor(x0, y0)) return { x: x0, y: y0 };
  for (let r = 1; r <= radius; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (isFloor(x0 + dx, y0 + dy)) return { x: x0 + dx, y: y0 + dy };
  }
  return null;
}
export function fineRoute(from, to, isFloor, opts = {}) {
  const start = snapFloor(from, isFloor, opts.snap ?? 3), goal = snapFloor(to, isFloor, opts.snap ?? 10);
  if (!start || !goal) return null;
  const b = opts.bound, inB = b ? (x, y) => x >= b.x0 - 1 && x <= b.x1 + 1 && y >= b.y0 - 1 && y <= b.y1 + 1 : () => true;
  const key = (x, y) => x + ',' + y, h = (x, y) => Math.abs(x - goal.x) + Math.abs(y - goal.y);
  const open = heap(); open.push([h(start.x, start.y), start.x, start.y]);
  const g = new Map([[key(start.x, start.y), 0]]), came = new Map(), done = new Set();
  const maxExpand = opts.maxExpand ?? 8000; let exp = 0;
  while (open.size && exp++ < maxExpand) {
    const [, x, y] = open.pop(), k = key(x, y);
    if (done.has(k)) continue; done.add(k);
    if (x === goal.x && y === goal.y) { const path = [{ x, y }]; let c = k; while (came.has(c)) { const q = came.get(c); path.unshift(q); c = key(q.x, q.y); } return path; }
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const nk = key(nx, ny);
      if (done.has(nk) || !inB(nx, ny) || !isFloor(nx, ny)) continue;
      const ng = g.get(k) + 1;
      if (g.get(nk) === undefined || ng < g.get(nk)) { g.set(nk, ng); came.set(nk, { x, y }); open.push([ng + h(nx, ny), nx, ny]); }
    }
  }
  return null;
}

// ── STITCH: the full HPA* route. Returns { tiles:[{x,y}…], portals:[…], chunks:[…] } or null ─
export function route(seed, from, to, isFloor, opts = {}) {
  const fc = chunkOf(Math.round(from.x), Math.round(from.y)), tc = chunkOf(Math.round(to.x), Math.round(to.y));
  const bboxOf = (cx, cy) => ({ x0: cx * CHUNK, y0: cy * CHUNK, x1: cx * CHUNK + CHUNK - 1, y1: cy * CHUNK + CHUNK - 1 });
  const tiles = [], portals = [];
  const pushTiles = (leg) => { for (const t of leg) { const last = tiles[tiles.length - 1]; if (!last || last.x !== t.x || last.y !== t.y) tiles.push(t); } };

  if (fc.cx === tc.cx && fc.cy === tc.cy) {
    const leg = fineRoute(from, to, isFloor, { bound: bboxOf(fc.cx, fc.cy), ...opts });
    if (!leg) return null;
    pushTiles(leg);
    return { tiles, portals, chunks: [[fc.cx, fc.cy]] };
  }
  const chunks = routeChunks(seed, [fc.cx, fc.cy], [tc.cx, tc.cy], opts);
  if (!chunks) return null;
  let cursor = from;
  for (let i = 0; i < chunks.length - 1; i++) {
    const [ax, ay] = chunks[i], [bx, by] = chunks[i + 1];
    const door = doorBetween(seed, ax, ay, bx, by, opts.ports);
    if (!door) return null;
    const leg = fineRoute(cursor, door.inTile, isFloor, { bound: bboxOf(ax, ay), ...opts });
    if (!leg) return null;
    pushTiles(leg);
    pushTiles([door.outTile]);        // the one-tile seam crossing into the next chunk
    portals.push(door.inTile);
    cursor = door.outTile;
  }
  const last = fineRoute(cursor, to, isFloor, { bound: bboxOf(tc.cx, tc.cy), ...opts });
  if (!last) return null;
  pushTiles(last);
  return { tiles, portals, chunks };
}

// ── THE WAYFINDING FAN — a geodesic tree from the player out to its perimeter ──────────────
// The substrate for the map overhaul. Instead of drawing a flat best-fit plane through the foam,
// the visible map is the set of routes that radiate from the player to the cells on its
// perimeter — a shortest-path tree, truncated at `radius`. Dijkstra over the same `isFloor`
// graph nav routes on; a pluggable `cost(from,to)` shapes the tree, so the SAME player position
// yields a different-looking map as you change the wayfinding rule (uniform/planar today; a
// radial-or-azimuthal bias makes the fan elongate or spiral — the foamview corkscrew, once the
// depth dimension is folded into `isFloor`/neighbours). Returns the tree (each cell → its parent),
// the tips (the perimeter the fan reaches), and pathTo() to reconstruct any geodesic.
export function wayfan(isFloor, origin, opts = {}) {
  const radius = opts.radius ?? 18, maxCells = opts.maxCells ?? 6000;
  const cost = opts.cost || (() => 1);
  const key = (x, y) => x + ',' + y;
  const s = { x: Math.round(origin.x), y: Math.round(origin.y) };
  const reached = new Map();
  const pathTo = (x, y) => { let k = key(Math.round(x), Math.round(y)), out = []; while (k != null) { const n = reached.get(k); if (!n) return null; out.push({ x: n.x, y: n.y }); k = n.parent; } return out.reverse(); };
  if (!isFloor(s.x, s.y)) return { origin: s, reached, tips: [], maxDist: 0, radius, pathTo };
  reached.set(key(s.x, s.y), { x: s.x, y: s.y, dist: 0, parent: null });
  const open = heap(); open.push([0, s.x, s.y]);
  let maxDist = 0;
  while (open.size && reached.size < maxCells) {
    const [d, x, y] = open.pop(), node = reached.get(key(x, y));
    if (!node || d > node.dist || node.dist >= radius) continue; // stale or at the frontier (don't expand past the perimeter)
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (!isFloor(nx, ny)) continue;
      const nd = node.dist + cost({ x, y }, { x: nx, y: ny });
      if (nd > radius) continue;
      const nk = key(nx, ny), ex = reached.get(nk);
      if (!ex || nd < ex.dist) { reached.set(nk, { x: nx, y: ny, dist: nd, parent: key(x, y) }); if (nd > maxDist) maxDist = nd; open.push([nd, nx, ny]); }
    }
  }
  // tips = leaves of the truncated tree (cells that parent nobody) — the perimeter the fan reaches
  const parents = new Set(); for (const n of reached.values()) if (n.parent != null) parents.add(n.parent);
  const tips = []; for (const [k, n] of reached) if (!parents.has(k)) tips.push(n);
  return { origin: s, reached, tips, maxDist, radius, pathTo };
}

// ── test/integration helper: an isFloor predicate over the canonical ship.js tiles ────────
// (the game passes world.js's own isFloor; this lets nav route headlessly over the real engine)
export function makeShipFloor(seed, genome) {
  const Ship = SHIP(), C = CHUNK, cache = new Map();
  const chunk = (cx, cy) => { const k = cx + ',' + cy; let v = cache.get(k); if (!v) { v = Ship.generateChunk(seed, cx, cy, genome); cache.set(k, v); } return v; };
  return (wx, wy) => {
    const cx = Math.floor(wx / C), cy = Math.floor(wy / C), t = chunk(cx, cy).tiles[(wy - cy * C) * C + (wx - cx * C)];
    return t === Ship.TILE.FLOOR || t === Ship.TILE.DOOR;
  };
}
