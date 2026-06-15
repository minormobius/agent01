// gen.js — HALLS-FIRST, POLYGON-CHUNKED layout generator (the hoop v5 prototype).
//
// The world is grown, not built — so chunks are NOT a rectangular grid. They are the VORONOI CELLS of
// a jittered lattice of chunk-seeds: irregular 4–7-sided polygons that tile the plane. The clean
// tiling contract never needed rectangles — it needs SHARED EDGES:
//   · two chunks are neighbours when their cells share a Voronoi edge (on the perpendicular bisector
//     of their two seeds);
//   · a PORT is a deterministic function of the unordered seed-PAIR (hash(seed,pairKey)) placed on
//     that bisector → both chunks derive the identical crossing, no grid assumption;
//   · ROOMS stay inside their polygon; the CONCOURSE crosses a seam only at ports.
// Nav is then clean HPA*: a coarse port graph over the chunk-adjacency graph + each chunk's hall graph.
//
// Pure, deterministic (seed + chunk coord → identical chunk), zero-dep beyond clipCell. node + browser.
// Pinned by hoop/test/halls.selftest.mjs.

import { clipCell } from '../paint/voronoi.js';

export function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1; let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)); }
function pointInPoly(poly, x, y) { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
function polyClearance(poly, x, y) { let m = Infinity; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; m = Math.min(m, segDist(x, y, a[0], a[1], b[0], b[1])); } return m; }

export const ROOM_PROGRAMME = [
  { role: 'dwell', w: 2, radius: 78 }, { role: 'make', w: 1, radius: 100 }, { role: 'trade', w: 1, radius: 90 },
  { role: 'serve', w: 1, radius: 90 }, { role: 'learn', w: 0.7, radius: 115 }, { role: 'heal', w: 0.5, radius: 115 },
  { role: 'play', w: 0.7, radius: 104 }, { role: 'grow', w: 0.7, radius: 95 }, { role: 'worship', w: 0.4, radius: 124 },
  { role: 'govern', w: 0.3, radius: 145 }, { role: 'store', w: 0.6, radius: 80 },
];
function pickRole(rnd) { const tot = ROOM_PROGRAMME.reduce((s, r) => s + r.w, 0); let r = rnd() * tot; for (const e of ROOM_PROGRAMME) { r -= e.w; if (r <= 0) return e; } return ROOM_PROGRAMME[0]; }

// ── the chunk lattice (jittered) and its Voronoi cells ─────────────────────────────────────────────
const DEFAULTS = { G: 1500, jit: 0.34 };                    // chunk-seed spacing · jitter (< 0.5 keeps neighbours local)
export function chunkSeed(seed, i, j, G = DEFAULTS.G, jit = DEFAULTS.jit) {
  const r = mulberry32(hashStr(seed + '|cs|' + i + '|' + j));
  return { i, j, x: (i + 0.5) * G + (r() - 0.5) * jit * G, y: (j + 0.5) * G + (r() - 0.5) * jit * G };
}
function ring(seed, i, j, G, jit, rad) { const out = []; for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) out.push(chunkSeed(seed, i + di, j + dj, G, jit)); return out; }
export function chunkPolygon(seed, i, j, G = DEFAULTS.G, jit = DEFAULTS.jit) {
  const A = chunkSeed(seed, i, j, G, jit), cand = ring(seed, i, j, G, jit, 2).filter((p) => !(p.i === i && p.j === j));
  return clipCell(A, cand, G * 2.4);
}
// are A,B Voronoi-adjacent? their bisector midpoint M has A,B as its two nearest seeds (symmetric test).
function adjacent(seed, A, B, G, jit) {
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, dA = (A.x - mx) ** 2 + (A.y - my) ** 2;
  for (const C of ring(seed, A.i, A.j, G, jit, 2)) { if ((C.i === A.i && C.j === A.j) || (C.i === B.i && C.j === B.j)) continue; if ((C.x - mx) ** 2 + (C.y - my) ** 2 < dA - 1e-6) return false; }
  return true;
}
// ports on the shared edge of A,B — on the bisector, in CANONICAL pair order so the result is identical
// regardless of which chunk asks (the geometry, not just the key, must be order-independent).
export function edgePortsFor(seed, A, B, G = DEFAULTS.G) {
  const ka = A.i + ',' + A.j, kb = B.i + ',' + B.j; if (ka > kb) { const t = A; A = B; B = t; }
  const r = mulberry32(hashStr(seed + '|port|' + (A.i + ',' + A.j) + '|' + (B.i + ',' + B.j)));
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, ex = -(B.y - A.y), ey = (B.x - A.x), el = Math.hypot(ex, ey) || 1, dx = ex / el, dy = ey / el;
  const n = 1 + (r() < 0.5 ? 1 : 0), out = [];
  for (let k = 0; k < n; k++) { const off = (r() - 0.5) * G * 0.42; out.push({ x: mx + dx * off, y: my + dy * off }); }
  return out;
}

// one CHUNK (i,j): its Voronoi polygon → ports on every shared edge → hub → spokes → capillaries →
// rooms budded INSIDE the polygon. World coordinates. Halls reach the polygon edges (so they stitch).
export function genChunk({ seed = 1, i = 0, j = 0, G = DEFAULTS.G, jit = DEFAULTS.jit, hallSeg = 175, density = 1, roomSize = 1, margin = 22 } = {}) {
  const A = chunkSeed(seed, i, j, G, jit), poly = chunkPolygon(seed, i, j, G, jit);
  const rng = mulberry32(hashStr(seed + '|chunk|' + i + '|' + j));
  const nodes = [], edges = [], portNodes = [];
  const add = (x, y, port) => { nodes.push({ x, y, id: nodes.length, port: !!port }); return nodes.length - 1; };
  const link = (a, b) => edges.push([a, b]);
  const inside = (x, y) => pointInPoly(poly, x, y) && polyClearance(poly, x, y) > margin * 0.5;
  // ports on each adjacent edge
  for (const B of ring(seed, i, j, G, jit, 1)) { if (B.i === i && B.j === j) continue; if (!adjacent(seed, A, B, G, jit)) continue; for (const p of edgePortsFor(seed, A, B, G)) portNodes.push({ node: add(p.x, p.y, true), B }); }
  // hub at the chunk seed; spokes hub→(midpoint)→port — the midpoints are budding sites along the halls
  const hub = add(A.x, A.y), corridorNodes = [hub];
  for (const pn of portNodes) {
    const mx = A.x + (nodes[pn.node].x - A.x) * 0.55 + (rng() - 0.5) * hallSeg * 0.4;
    const my = A.y + (nodes[pn.node].y - A.y) * 0.55 + (rng() - 0.5) * hallSeg * 0.4;
    if (inside(mx, my)) { const mid = add(mx, my); link(hub, mid); link(mid, pn.node); corridorNodes.push(mid); }
    else link(hub, pn.node);
  }
  // capillaries off the corridors, kept inside the polygon (retry the initial heading a few times)
  function sprout(fromId, depth) {
    if (depth <= 0) return;
    let ang, px, py, ok = false;
    for (let t = 0; t < 4 && !ok; t++) { ang = rng() * Math.PI * 2; px = nodes[fromId].x + Math.cos(ang) * hallSeg * (0.8 + rng() * 0.4); py = nodes[fromId].y + Math.sin(ang) * hallSeg * (0.8 + rng() * 0.4); if (inside(px, py)) ok = true; }
    if (!ok) return;
    let bprev = fromId, len = 1 + Math.floor(rng() * 3 * density);
    for (let k = 0; k < len; k++) {
      const id = add(px, py); link(bprev, id); bprev = id; corridorNodes.push(id);
      if (rng() < 0.5 * density) sprout(id, depth - 1);
      px += Math.cos(ang) * hallSeg * (0.8 + rng() * 0.5) + (rng() - 0.5) * hallSeg * 0.5;
      py += Math.sin(ang) * hallSeg * (0.8 + rng() * 0.5) + (rng() - 0.5) * hallSeg * 0.5;
      if (!inside(px, py)) break;
    }
  }
  for (const cid of corridorNodes.slice()) if (rng() < 0.85) sprout(cid, 2);
  // perpendicular at a node (for budding rooms to the side of the corridor)
  const adj = nodes.map(() => []); for (const [u, v] of edges) { adj[u].push(v); adj[v].push(u); }
  const perpAt = (id) => { let dx = 0, dy = 0; for (const k of adj[id]) { dx += nodes[k].x - nodes[id].x; dy += nodes[k].y - nodes[id].y; } const L = Math.hypot(dx, dy) || 1; return { px: -dy / L, py: dx / L }; };
  // rooms bud off corridor nodes, INSIDE the polygon (clearance ≥ radius+margin ⇒ never straddle a seam)
  const rooms = [];
  const clearOfHalls = (x, y, r) => { for (const [u, v] of edges) if (segDist(x, y, nodes[u].x, nodes[u].y, nodes[v].x, nodes[v].y) < r + margin * 0.6) return false; return true; };
  for (const id of corridorNodes) {
    if (nodes[id].port) continue;
    const { px, py } = perpAt(id);
    for (const side of [1, -1]) {
      if (rng() > 0.9) continue;
      const prog = pickRole(rng), radius = prog.radius * roomSize * (0.85 + rng() * 0.35);
      const off = hallSeg * 0.4 + radius, rx = nodes[id].x + px * side * off, ry = nodes[id].y + py * side * off;
      if (!pointInPoly(poly, rx, ry) || polyClearance(poly, rx, ry) < radius + margin) continue;   // INSIDE the cell — no seam straddle
      if (!clearOfHalls(rx, ry, radius)) continue;
      if (rooms.some((r) => dist(r, { x: rx, y: ry }) < r.radius + radius + margin)) continue;
      const doorPt = { x: nodes[id].x + px * side * (off - radius), y: nodes[id].y + py * side * (off - radius) };
      rooms.push({ id: rooms.length, x: rx, y: ry, radius, role: prog.role, doorHall: id, doorPt });
    }
  }
  return { i, j, seedPt: A, poly, nodes, edges, rooms, portNodes: portNodes.map((p) => p.node) };
}

// stitch a block of chunks (i in [i0,i0+cols), j in [j0,j0+rows)): merge port nodes at identical world
// positions so the hall graph connects across seams. Returns a layout nav/fixtures consume directly.
export function genRegion({ seed = 1, cols = 3, rows = 3, i0 = 0, j0 = 0, G = DEFAULTS.G, jit = DEFAULTS.jit, ...opts } = {}) {
  const nodes = [], edges = [], rooms = [], chunks = [], portMap = new Map();
  const pkey = (x, y) => Math.round(x) + ',' + Math.round(y);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let dj = 0; dj < rows; dj++) for (let di = 0; di < cols; di++) {
    const ch = genChunk({ seed, i: i0 + di, j: j0 + dj, G, jit, ...opts }), remap = new Array(ch.nodes.length);
    ch.nodes.forEach((n, k) => {
      if (n.port) { const key = pkey(n.x, n.y); let gid = portMap.get(key); if (gid == null) { gid = nodes.length; nodes.push({ x: n.x, y: n.y, id: gid, port: true }); portMap.set(key, gid); } remap[k] = gid; }
      else { const gid = nodes.length; nodes.push({ x: n.x, y: n.y, id: gid }); remap[k] = gid; }
    });
    for (const [a, b] of ch.edges) edges.push([remap[a], remap[b]]);
    for (const r of ch.rooms) rooms.push({ ...r, id: rooms.length, doorHall: remap[r.doorHall] });
    for (const p of ch.poly) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }
    chunks.push({ i: ch.i, j: ch.j, poly: ch.poly, seedPt: ch.seedPt });
  }
  return { seed, G, jit, cols, rows, chunks, nodes, edges, rooms, bounds: { x0: minX, y0: minY, x1: maxX, y1: maxY }, W: maxX - minX, H: maxY - minY };
}

// single-chunk convenience (back-compat for the test + simple path): one real (jittered) chunk (0,0).
export function genLayout(opts = {}) {
  const ch = genChunk({ seed: opts.seed || 1, i: 0, j: 0, G: 1700, jit: DEFAULTS.jit, hallSeg: opts.hallSeg || 175, density: opts.density || 1, roomSize: opts.roomSize || 1 });
  let maxX = 0, maxY = 0; for (const p of ch.poly) { maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }
  return { W: maxX, H: maxY, seed: opts.seed || 1, hallSeg: opts.hallSeg || 175, nodes: ch.nodes, edges: ch.edges, rooms: ch.rooms, poly: ch.poly };
}

// point-in-room test (disc)
export function roomAt(layout, x, y) { for (const r of layout.rooms) if ((x - r.x) ** 2 + (y - r.y) ** 2 <= r.radius * r.radius) return r; return null; }

const GEN = { mulberry32, chunkSeed, chunkPolygon, edgePortsFor, genChunk, genRegion, genLayout, roomAt, ROOM_PROGRAMME };
if (typeof globalThis !== 'undefined') globalThis.HALLSGEN = GEN;
export default GEN;
