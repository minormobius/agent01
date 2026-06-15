// gen.js — HALLS-FIRST, CHUNKED layout generator (the hoop v5 prototype).
//
// The world is an unbounded grid of CHUNKS. The design rule that makes tiling clean:
//   · ROOMS are strictly chunk-INTERIOR (inset from the seam) — nothing straddles a boundary.
//   · the CONCOURSE is the only thing that crosses a seam, and only at DETERMINISTIC SHARED PORTS:
//     a port is a pure function of the EDGE's identity (hash(seed,'V',cx+1,cy)), so the neighbour
//     derives the exact same port — the halls line up by construction (region.js's seam contract,
//     but a handful of 1-D crossings instead of a 2-D foam strip).
//   · nav is then clean HPA*: a coarse PORT graph across chunks + each chunk's hall graph + straight
//     legs. Unbounded world, bounded per-step loading.
//
// Pure, deterministic (seed + chunk coord → identical chunk), zero-dep, node + browser.
// genChunk(cx,cy) → one chunk (world coords); genRegion(grid) → a stitched block for the sandbox.
// Pinned by hoop/test/halls.selftest.mjs.

export function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1; let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)); }

// room programme — role mix with target RADII (px). A room is a footprint DISC that later claims the
// fine unit cells whose centres fall in it (the organic multi-cell room).
export const ROOM_PROGRAMME = [
  { role: 'dwell', w: 2, radius: 78 }, { role: 'make', w: 1, radius: 100 }, { role: 'trade', w: 1, radius: 90 },
  { role: 'serve', w: 1, radius: 90 }, { role: 'learn', w: 0.7, radius: 115 }, { role: 'heal', w: 0.5, radius: 115 },
  { role: 'play', w: 0.7, radius: 104 }, { role: 'grow', w: 0.7, radius: 95 }, { role: 'worship', w: 0.4, radius: 124 },
  { role: 'govern', w: 0.3, radius: 145 }, { role: 'store', w: 0.6, radius: 80 },
];
function pickRole(rnd) { const tot = ROOM_PROGRAMME.reduce((s, r) => s + r.w, 0); let r = rnd() * tot; for (const e of ROOM_PROGRAMME) { r -= e.w; if (r <= 0) return e; } return ROOM_PROGRAMME[0]; }

// DETERMINISTIC PORTS on a chunk edge. kind 'V' (vertical edge at world x=i·CW, spanning row j) or
// 'H' (horizontal edge at world y=j·CH, spanning column i). Keyed by the EDGE, so both chunks sharing
// it derive identical ports → the concourse lines up across the seam with no negotiation.
export function edgePorts(seed, kind, i, j, CW, CH) {
  const rng = mulberry32(hashStr(seed + '|' + kind + '|' + i + '|' + j));
  const n = 1 + (rng() < 0.5 ? 1 : 0);                       // 1–2 crossings per seam edge
  const out = [];
  for (let k = 0; k < n; k++) { const t = 0.24 + (k + 0.5) / n * 0.52 + (rng() - 0.5) * 0.12; out.push(kind === 'V' ? { x: i * CW, y: (j + clamp(t, 0.1, 0.9)) * CH } : { x: (i + clamp(t, 0.1, 0.9)) * CW, y: j * CH }); }
  return out;
}

// one CHUNK (cx,cy): edge ports → a hub → spokes to every port → capillaries → interior rooms.
// Coordinates are WORLD-space. Halls reach all four edges (so they stitch); rooms are inset.
export function genChunk({ seed = 1, cx = 0, cy = 0, CW = 1900, CH = 1350, hallSeg = 175, density = 1, roomSize = 1, margin = 24 } = {}) {
  const rng = mulberry32(hashStr(seed + '|chunk|' + cx + '|' + cy));
  const ox = cx * CW, oy = cy * CH, x0 = ox + margin, y0 = oy + margin, x1 = ox + CW - margin, y1 = oy + CH - margin;
  const nodes = [], edges = [];
  const add = (x, y, port) => { nodes.push({ x, y, id: nodes.length, port: !!port }); return nodes.length - 1; };
  const link = (a, b) => edges.push([a, b]);
  // ports on the 4 shared edges (west=V@cx, east=V@cx+1, north=H@cy, south=H@cy+1)
  const portNodes = { W: [], E: [], N: [], S: [] };
  for (const p of edgePorts(seed, 'V', cx, cy, CW, CH)) portNodes.W.push(add(p.x, p.y, true));
  for (const p of edgePorts(seed, 'V', cx + 1, cy, CW, CH)) portNodes.E.push(add(p.x, p.y, true));
  for (const p of edgePorts(seed, 'H', cx, cy, CW, CH)) portNodes.N.push(add(p.x, p.y, true));
  for (const p of edgePorts(seed, 'H', cx, cy + 1, CW, CH)) portNodes.S.push(add(p.x, p.y, true));
  const allPorts = [...portNodes.W, ...portNodes.E, ...portNodes.N, ...portNodes.S];
  // hub + spokes to each port (a midpoint each, kept inside the chunk)
  const hub = add(clamp(ox + CW * (0.42 + rng() * 0.16), x0, x1), clamp(oy + CH * (0.42 + rng() * 0.16), y0, y1));
  const corridorNodes = [hub];
  for (const pid of allPorts) {
    const mx = clamp((nodes[hub].x + nodes[pid].x) / 2 + (rng() - 0.5) * hallSeg * 0.6, x0, x1);
    const my = clamp((nodes[hub].y + nodes[pid].y) / 2 + (rng() - 0.5) * hallSeg * 0.6, y0, y1);
    const mid = add(mx, my); link(hub, mid); link(mid, pid); corridorNodes.push(mid);
  }
  // capillaries off the spokes (kept inside the chunk)
  function sprout(fromId, depth) {
    if (depth <= 0) return;
    const len = 1 + Math.floor(rng() * 3 * density), ang = rng() * Math.PI * 2; let bx = nodes[fromId].x, by = nodes[fromId].y, bprev = fromId;
    for (let k = 0; k < len; k++) {
      bx += Math.cos(ang) * hallSeg * (0.8 + rng() * 0.5) + (rng() - 0.5) * hallSeg * 0.5;
      by += Math.sin(ang) * hallSeg * (0.8 + rng() * 0.5) + (rng() - 0.5) * hallSeg * 0.5;
      if (bx < x0 || bx > x1 || by < y0 || by > y1) break;
      const id = add(bx, by); link(bprev, id); bprev = id; corridorNodes.push(id);
      if (rng() < 0.5 * density) sprout(id, depth - 1);
    }
  }
  for (const cid of corridorNodes.slice()) if (rng() < 0.85) sprout(cid, 2);

  // local corridor direction (mean of incident edges) → perpendicular for budding rooms
  const adj = nodes.map(() => []); for (const [u, v] of edges) { adj[u].push(v); adj[v].push(u); }
  const perpAt = (id) => { let dx = 0, dy = 0; for (const j of adj[id]) { dx += nodes[j].x - nodes[id].x; dy += nodes[j].y - nodes[id].y; } const L = Math.hypot(dx, dy) || 1; return { px: -dy / L, py: dx / L }; };

  // ROOMS bud off corridor nodes as discs, INSET within the chunk rect (never straddling a seam),
  // non-overlapping & clear of halls.
  const rooms = [];
  const clearOfHalls = (x, y, r) => { for (const [u, v] of edges) if (segDist(x, y, nodes[u].x, nodes[u].y, nodes[v].x, nodes[v].y) < r + margin * 0.6) return false; return true; };
  for (const id of corridorNodes) {
    if (nodes[id].port) continue;                            // don't bud rooms onto the seam ports
    const { px, py } = perpAt(id);
    for (const side of [1, -1]) {
      if (rng() > 0.9) continue;
      const prog = pickRole(rng), radius = prog.radius * roomSize * (0.85 + rng() * 0.35);
      const off = hallSeg * 0.4 + radius, rx = nodes[id].x + px * side * off, ry = nodes[id].y + py * side * off;
      if (rx - radius < x0 || ry - radius < y0 || rx + radius > x1 || ry + radius > y1) continue;   // INSET — no seam straddle
      if (!clearOfHalls(rx, ry, radius)) continue;
      if (rooms.some((r) => dist(r, { x: rx, y: ry }) < r.radius + radius + margin)) continue;
      const doorPt = { x: nodes[id].x + px * side * (off - radius), y: nodes[id].y + py * side * (off - radius) };
      rooms.push({ id: rooms.length, x: rx, y: ry, radius, role: prog.role, doorHall: id, doorPt });
    }
  }
  return { cx, cy, ox, oy, CW, CH, nodes, edges, rooms, portNodes };
}

// stitch a grid of chunks into one layout (for the sandbox): port nodes at identical world positions
// MERGE into one shared node, so the hall graph is connected across seams and nav routes through.
export function genRegion({ seed = 1, cols = 3, rows = 3, c0x = 0, c0y = 0, CW = 1900, CH = 1350, ...opts } = {}) {
  const nodes = [], edges = [], rooms = [], chunks = [], portMap = new Map();
  const pkey = (x, y) => Math.round(x) + ',' + Math.round(y);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const cx = c0x + i, cy = c0y + j, ch = genChunk({ seed, cx, cy, CW, CH, ...opts }), remap = new Array(ch.nodes.length);
    ch.nodes.forEach((n, k) => {
      if (n.port) { const key = pkey(n.x, n.y); let gid = portMap.get(key); if (gid == null) { gid = nodes.length; nodes.push({ x: n.x, y: n.y, id: gid, port: true }); portMap.set(key, gid); } remap[k] = gid; }
      else { const gid = nodes.length; nodes.push({ x: n.x, y: n.y, id: gid }); remap[k] = gid; }
    });
    for (const [a, b] of ch.edges) edges.push([remap[a], remap[b]]);
    for (const r of ch.rooms) rooms.push({ ...r, id: rooms.length, doorHall: remap[r.doorHall] });
    chunks.push({ cx, cy, ox: ch.ox, oy: ch.oy, CW, CH });
  }
  const x0 = c0x * CW, y0 = c0y * CH;
  return { seed, CW, CH, cols, rows, chunks, nodes, edges, rooms, bounds: { x0, y0, x1: (c0x + cols) * CW, y1: (c0y + rows) * CH }, W: cols * CW, H: rows * CH };
}

// single-chunk convenience (back-compat for the test + the simple sandbox path): chunk (0,0) over W×H.
export function genLayout(opts = {}) {
  const W = opts.W || 2600, H = opts.H || 1500;
  const ch = genChunk({ seed: opts.seed || 1, cx: 0, cy: 0, CW: W, CH: H, hallSeg: opts.hallSeg || 175, density: opts.density || 1, roomSize: opts.roomSize || 1 });
  return { W, H, seed: opts.seed || 1, hallSeg: opts.hallSeg || 175, nodes: ch.nodes, edges: ch.edges, rooms: ch.rooms, portNodes: ch.portNodes };
}

// point-in-room test (disc)
export function roomAt(layout, x, y) { for (const r of layout.rooms) if ((x - r.x) ** 2 + (y - r.y) ** 2 <= r.radius * r.radius) return r; return null; }

const GEN = { mulberry32, edgePorts, genChunk, genRegion, genLayout, roomAt, ROOM_PROGRAMME };
if (typeof globalThis !== 'undefined') globalThis.HALLSGEN = GEN;
export default GEN;
