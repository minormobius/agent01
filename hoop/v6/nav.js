// nav.js — TWO-TIER routing over the halls-first layout (the v6 nav prototype).
//
// The whole point of halls-first: pathfinding stops being room-to-room foam hopping. The nav graph is
// tiny — the corridor nodes (open concourse) plus one door per room into its centre. A route is:
//   start point → (its room centre, or nearest hall node) → A* along the halls → target room door →
//   target room centre → exact end point.
// Inside a hall run or a room the space is OPEN, so those legs are straight lines. Few hops, no wall
// crossings by construction (a room only touches the halls through its one door).
//
// Pure, deterministic, zero-dep. buildNavGraph(layout) → graph (cached on the layout); route(layout,
// a, b) → { pts:[[x,y]…], hops }. Pinned by hoop/test/v6halls.selftest.mjs.

import { roomAt } from './gen.js';

const D = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// the nav graph: every hall node, plus one node per room CENTRE. Edges: corridor edges (open), and
// each room centre ↔ its door's hall node (through the door). Node ids: 0..H-1 = hall nodes,
// H+i = room i's centre.
export function buildNavGraph(layout) {
  if (layout._nav) return layout._nav;
  const Hn = layout.nodes.length, N = Hn + layout.rooms.length;
  const pos = new Array(N), adj = Array.from({ length: N }, () => []);
  for (let i = 0; i < Hn; i++) pos[i] = { x: layout.nodes[i].x, y: layout.nodes[i].y };
  const addEdge = (a, b) => { const w = D(pos[a].x, pos[a].y, pos[b].x, pos[b].y); adj[a].push({ to: b, w }); adj[b].push({ to: a, w }); };
  for (const [u, v] of layout.edges) addEdge(u, v);          // the open concourse
  layout.rooms.forEach((r, i) => {
    const c = Hn + i; pos[c] = { x: r.x, y: r.y };
    // door leg = hall node → door point → room centre (cost is the real bent length)
    const w = D(layout.nodes[r.doorHall].x, layout.nodes[r.doorHall].y, r.doorPt.x, r.doorPt.y) + D(r.doorPt.x, r.doorPt.y, r.x, r.y);
    adj[r.doorHall].push({ to: c, w }); adj[c].push({ to: r.doorHall, w });
  });
  return (layout._nav = { Hn, N, pos, adj });
}

// nearest hall node to a free point (used when the point is in the concourse, not a room)
function nearestHall(g, x, y) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < g.Hn; i++) { const d = (g.pos[i].x - x) ** 2 + (g.pos[i].y - y) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}

// A* over the nav graph (Euclidean heuristic — the graph is metric)
function astar(g, s, t) {
  const open = [s], gsc = new Float64Array(g.N).fill(Infinity), fsc = new Float64Array(g.N).fill(Infinity), prev = new Int32Array(g.N).fill(-1), inOpen = new Uint8Array(g.N);
  const h = (i) => D(g.pos[i].x, g.pos[i].y, g.pos[t].x, g.pos[t].y);
  gsc[s] = 0; fsc[s] = h(s); inOpen[s] = 1;
  while (open.length) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (fsc[open[k]] < fsc[open[bi]]) bi = k;
    const u = open.splice(bi, 1)[0]; inOpen[u] = 0;
    if (u === t) break;
    for (const e of g.adj[u]) { const nd = gsc[u] + e.w; if (nd < gsc[e.to]) { prev[e.to] = u; gsc[e.to] = nd; fsc[e.to] = nd + h(e.to); if (!inOpen[e.to]) { open.push(e.to); inOpen[e.to] = 1; } } }
  }
  if (!isFinite(gsc[t])) return null;
  const seq = []; for (let u = t; u !== -1; u = prev[u]) seq.push(u); seq.reverse(); return seq;
}

// resolve a free point to a graph node + the dense lead-in points to splice before/after the A* path.
// In a room: the point connects to the room centre via the (open) interior; lead = [pt]. The centre's
// node is H+roomIdx. In a hall: connect to the nearest hall node; lead = [pt].
function anchor(layout, g, x, y) {
  const r = roomAt(layout, x, y);
  if (r) return { node: g.Hn + r.id, lead: [[x, y]] };       // node sequence will start/end at the centre; pt is the open in-room leg
  return { node: nearestHall(g, x, y), lead: [[x, y]] };
}

export function route(layout, a, b) {
  const g = buildNavGraph(layout);
  const s = anchor(layout, g, a.x, a.y), t = anchor(layout, g, b.x, b.y);
  const seq = astar(g, s.node, t.node);
  if (!seq) return null;
  // build the polyline: start exact pt → each node centre (and the door points are implicit bends) → end exact pt
  const pts = [[a.x, a.y]];
  const roomCentreNode = (i) => i >= g.Hn;
  for (let k = 0; k < seq.length; k++) {
    const u = seq[k];
    // when we step hall→roomCentre or roomCentre→hall, route THROUGH that room's door point so the
    // bend reads as a doorway, never a straight cut across the room wall.
    if (k > 0) {
      const p = seq[k - 1];
      const roomIdx = roomCentreNode(u) ? u - g.Hn : roomCentreNode(p) ? p - g.Hn : -1;
      if (roomIdx >= 0) { const dp = layout.rooms[roomIdx].doorPt; pts.push([dp.x, dp.y]); }
    }
    pts.push([g.pos[u].x, g.pos[u].y]);
  }
  pts.push([b.x, b.y]);
  // dedupe consecutive coincident points
  const out = [pts[0]]; for (let i = 1; i < pts.length; i++) if (D(pts[i][0], pts[i][1], out[out.length - 1][0], out[out.length - 1][1]) > 1e-6) out.push(pts[i]);
  return { pts: out, hops: seq.length };
}

const NAV = { buildNavGraph, route };
if (typeof globalThis !== 'undefined') globalThis.HALLSNAV = NAV;
export default NAV;
