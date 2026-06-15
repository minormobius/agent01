// gen.js — HALLS-FIRST layout generator (the hoop v5 prototype).
//
// The v3/v4 world is a uniform foam of equal chambers wired by doors — fixtures land per-clump,
// lighting is sparse, and pathfinding is fragile room-to-room hopping. This inverts it: grow the
// CONCOURSE (a capillary corridor network) FIRST, then hang big single-door ROOMS (the "wells") off
// it. Movement is mostly along halls into rooms — few hops, easy to reason about — and each room is a
// clean cell the /sprite/fixture pipeline can furnish in full.
//
// Pure, deterministic (seed in → identical layout), zero-dep, node + browser. Returns the geometry;
// the page draws it and nav.js routes over it. Pinned by hoop/test/halls.selftest.mjs.

export function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// room programme — a role mix with target sizes (in px). The big civic wells are rarer; dwellings
// are the common small room. Size is the room's half-extent baseline; the generator jitters it.
export const ROOM_PROGRAMME = [
  { role: 'dwell', w: 2, size: 130 }, { role: 'make', w: 1, size: 170 }, { role: 'trade', w: 1, size: 150 },
  { role: 'serve', w: 1, size: 150 }, { role: 'learn', w: 0.7, size: 195 }, { role: 'heal', w: 0.5, size: 195 },
  { role: 'play', w: 0.7, size: 180 }, { role: 'grow', w: 0.7, size: 160 }, { role: 'worship', w: 0.4, size: 210 },
  { role: 'govern', w: 0.3, size: 250 }, { role: 'store', w: 0.6, size: 140 },
];
function pickRole(rnd) {
  const tot = ROOM_PROGRAMME.reduce((s, r) => s + r.w, 0); let r = rnd() * tot;
  for (const e of ROOM_PROGRAMME) { r -= e.w; if (r <= 0) return e; } return ROOM_PROGRAMME[0];
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// point-to-segment distance (corridors are polyline segments; rooms must clear them)
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
// does rect (cx,cy,hw,hh) overlap (with margin) another rect?
function rectsOverlap(a, b, m) {
  return Math.abs(a.x - b.x) < a.hw + b.hw + m && Math.abs(a.y - b.y) < a.hh + b.hh + m;
}

// ── the generator ────────────────────────────────────────────────────────────────────────────────
// 1. a main SPINE corridor across the region; 2. branch capillaries off it (recursively); 3. ROOMS
//    bud off the corridor nodes, perpendicular to the local corridor direction, non-overlapping; each
//    room records the corridor node it attaches to (its single door). The hall graph (nodes+edges) is
//    explicit, so nav is a tiny two-tier A* (halls + one door per room).
export function genLayout(opts = {}) {
  const { W = 2600, H = 1500, seed = 1, hallSeg = 175, density = 1, margin = 22 } = opts;
  const rnd = mulberry32(seed >>> 0);
  const nodes = [], edges = [];                              // hall graph: nodes[i]={x,y}, edges=[[a,b]]
  const adj = () => { const a = nodes.map(() => []); for (const [u, v] of edges) { a[u].push(v); a[v].push(u); } return a; };
  const addNode = (x, y) => { nodes.push({ x, y, id: nodes.length }); return nodes.length - 1; };
  const link = (a, b) => { edges.push([a, b]); };

  // 1. SPINE — a gently wavering corridor across the middle third
  const spineY = H * 0.5 + (rnd() - 0.5) * H * 0.16, spine = [];
  let prev = -1;
  for (let x = W * 0.10; x <= W * 0.90; x += hallSeg) {
    const id = addNode(x, spineY + (rnd() - 0.5) * hallSeg * 0.45);
    if (prev >= 0) link(prev, id); prev = id; spine.push(id);
  }

  // 2. BRANCHES — capillaries sprouting up/down off spine nodes, recursively (depth 2)
  const corridorNodes = spine.slice();
  function sprout(fromId, dir, depth) {
    if (depth <= 0) return;
    const len = 1 + Math.floor(rnd() * 2.4 * density);
    let bx = nodes[fromId].x, by = nodes[fromId].y, bprev = fromId;
    for (let k = 0; k < len; k++) {
      by += dir * hallSeg * (0.85 + rnd() * 0.5);
      bx += (rnd() - 0.5) * hallSeg * 0.7;
      if (by < H * 0.08 || by > H * 0.92 || bx < W * 0.06 || bx > W * 0.94) break;
      const id = addNode(bx, by); link(bprev, id); bprev = id; corridorNodes.push(id);
      if (rnd() < 0.4 * density) sprout(id, rnd() < 0.5 ? -1 : 1, depth - 1);   // a sub-capillary
    }
  }
  for (const sid of spine) { if (rnd() < 0.7) sprout(sid, -1, 2); if (rnd() < 0.7) sprout(sid, 1, 2); }

  // local corridor direction at a node (mean of its incident edges), and the two perpendiculars
  const A = adj();
  const perpAt = (id) => {
    let dx = 0, dy = 0; for (const j of A[id]) { dx += nodes[j].x - nodes[id].x; dy += nodes[j].y - nodes[id].y; }
    const L = Math.hypot(dx, dy) || 1; return { px: -dy / L, py: dx / L };   // unit perpendicular
  };

  // 3. ROOMS bud off corridor nodes, alternating sides, sized by role, non-overlapping & clear of halls
  const rooms = [];
  const clearOfHalls = (x, y, hw, hh) => {
    for (const [u, v] of edges) if (segDist(x, y, nodes[u].x, nodes[u].y, nodes[v].x, nodes[v].y) < Math.max(hw, hh) + margin * 0.6) return false;
    return true;
  };
  for (const id of corridorNodes) {
    const { px, py } = perpAt(id);
    for (const side of [1, -1]) {                             // try BOTH sides of the corridor
      if (rnd() > 0.9) continue;                              // leave the occasional bare stretch
      const prog = pickRole(rnd), sz = prog.size * (0.85 + rnd() * 0.4);
      const hw = sz * (0.46 + rnd() * 0.14), hh = sz * (0.46 + rnd() * 0.14);
      const off = hallSeg * 0.42 + Math.max(hw, hh) * 1.04;  // push the room off the corridor by a door stub
      const cx = nodes[id].x + px * side * off, cy = nodes[id].y + py * side * off;
      const rect = { x: cx, y: cy, hw, hh };
      if (cx - hw < margin || cy - hh < margin || cx + hw > W - margin || cy + hh > H - margin) continue;
      if (!clearOfHalls(cx, cy, hw, hh)) continue;
      if (rooms.some((r) => rectsOverlap(rect, r, margin))) continue;
      // the single DOOR: where the room meets the corridor (on the room edge facing the node)
      const doorPt = { x: nodes[id].x + px * side * (off - hh), y: nodes[id].y + py * side * (off - hh) };
      rooms.push({ id: rooms.length, x: cx, y: cy, hw, hh, role: prog.role, doorHall: id, doorPt });
    }
  }

  return { W, H, seed, hallSeg, nodes, edges, rooms };
}

// point-in-room test (rect), used by nav + the page (which room did I tap?)
export function roomAt(layout, x, y) {
  for (const r of layout.rooms) if (Math.abs(x - r.x) <= r.hw && Math.abs(y - r.y) <= r.hh) return r;
  return null;
}

const GEN = { mulberry32, genLayout, roomAt, ROOM_PROGRAMME };
if (typeof globalThis !== 'undefined') globalThis.HALLSGEN = GEN;
export default GEN;
