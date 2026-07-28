// fixtures.js — ROOM-LEVEL fixture placement for organic, multi-cell rooms (the v6 prototype).
//
// The /sprite/fixture kernels assume one room = one Voronoi cell. Once a room is an organic UNION of
// many small cells (so its outline isn't a straight convex polygon), lights / the tile-grabbing
// console / the central component must attach to the GROUP, not a single cell. This is the owner-aware
// version: group paint cells by room owner, find the union's boundary membranes, and place fixtures
// against them. The DRAW functions (drawWallLight / drawWallFixture / drawDevice) are reused unchanged.
//
// Pure, deterministic, zero-dep beyond the shared kernels. Pinned by hoop/test/v6halls.selftest.mjs.

import { bucketGrid, jitterGrid } from '../paint/voronoi.js';
import { mulberry32 } from './gen.js';
import { lightGenome } from '../v4/fixture/lights.js';
import { deviceGenome } from '../v4/fixture/deco.js';
import { profile } from '../v4/fixture/consoles.js';

const vkey = (x, y) => Math.round(x / 2) + ',' + Math.round(y / 2);
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1; let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)); }

// ── THE SEEDING-ORDER STEP (the user's proposal): lay a FINE unit-cell grid, then assign each cell to
// a room (its footprint disc), a corridor (near a hall edge), or void — BEFORE the Voronoi walls are
// drawn. buildSceneCustom then walls only the membranes between different owners, so a room paints as
// an organic union of many small cells (non-convex, finely tiled), not one convex polygon. ──────────
export function assignOwners(layout, { unit, hallWidth = 30, jit = 0.55 } = {}) {
  const rng = mulberry32((layout.seed ^ 0x51ed) >>> 0);
  const raw = jitterGrid(layout.W, layout.H, unit, jit, rng);
  const seeds = [], owner = [];                              // owner: roomId≥0 · -1 corridor · -2 void
  for (const p of raw) {
    let o = -2, hd = Infinity;
    for (const [u, v] of layout.edges) { const d = segDist(p.x, p.y, layout.nodes[u].x, layout.nodes[u].y, layout.nodes[v].x, layout.nodes[v].y); if (d < hd) hd = d; }
    if (hd < hallWidth) o = -1;
    else { let bd = Infinity, br = -1; for (const r of layout.rooms) { const d = Math.hypot(p.x - r.x, p.y - r.y); if (d < r.radius && d < bd) { bd = d; br = r.id; } } if (br >= 0) o = br; }
    if (o > -2 || hd < hallWidth * 2.2) { seeds.push({ x: p.x, y: p.y }); owner.push(o); }   // keep a void apron so rooms/halls get bounded
  }
  // each room's DOOR cell: its owned seed nearest the door-hall node
  const doorCell = new Set();
  for (const r of layout.rooms) {
    const hn = layout.nodes[r.doorHall]; let bi = -1, bd = Infinity;
    for (let i = 0; i < seeds.length; i++) { if (owner[i] !== r.id) continue; const d = (seeds[i].x - hn.x) ** 2 + (seeds[i].y - hn.y) ** 2; if (d < bd) { bd = d; bi = i; } }
    if (bi >= 0) doorCell.add(bi);
  }
  const isHall = (i) => owner[i] === -1;
  const edgeKind = (a, b) => {
    const oa = owner[a], ob = owner[b];
    if (oa === -1 && ob === -1) return 'open';                // concourse
    if (oa >= 0 && oa === ob) return 'open';                  // within one room — organic union, no wall
    if (((oa >= 0 && ob === -1) || (ob >= 0 && oa === -1)) && (doorCell.has(a) || doorCell.has(b))) return 'door';
    return 'wall';
  };
  return { seeds, owner, doorCell, edgeKind, isHall };
}

// group floor cells by room owner (owner[seedIdx] ≥ 0 = a room; -1 corridor, -2 void). cell.room is the
// SEED index the paint cell belongs to, so its owner is owner[cell.room].
export function roomGroups(scene, owner) {
  const groups = new Map();
  for (let i = 0; i < scene.paintCells.length; i++) {
    const c = scene.paintCells[i]; if (c.wall || c.room == null) continue;
    const o = owner[c.room]; if (o == null || o < 0) continue;
    let g = groups.get(o); if (!g) groups.set(o, g = { id: o, cells: [], cx: 0, cy: 0 });
    g.cells.push(i); g.cx += c.x; g.cy += c.y;
  }
  for (const g of groups.values()) { g.cx /= g.cells.length; g.cy /= g.cells.length; }
  return groups;
}

// the union BOUNDARY of a room: polygon edges of its cells that aren't shared with another cell of the
// SAME room → they border a wall / void / a different room. Returns segments with inward normals.
export function roomBoundary(scene, group) {
  const count = new Map(), store = new Map();
  for (const idx of group.cells) {
    const v = scene.paintCells[idx].poly;
    for (let i = 0; i < v.length; i++) {
      const a = v[i], b = v[(i + 1) % v.length], ka = vkey(a[0], a[1]), kb = vkey(b[0], b[1]);
      const k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      count.set(k, (count.get(k) || 0) + 1); if (!store.has(k)) store.set(k, [a, b]);
    }
  }
  const edges = [];
  for (const [k, n] of count) {
    if (n !== 1) continue;                                   // shared by two same-room cells ⇒ interior
    const [a, b] = store.get(k), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = group.cx - mx, ny = group.cy - my; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;   // inward
    edges.push({ mx, my, nx, ny, len });
  }
  return edges;
}

// wall-grown lights on the room's longest boundary membranes, pointing inward toward the centroid.
export function placeRoomLights(scene, group, rng, perRoom) {
  const edges = roomBoundary(scene, group).sort((a, b) => b.len - a.len), sp = scene.roomSpacing || 40, out = [];
  const n = Math.min(perRoom, edges.length);
  // spread the picks across the boundary (skip every other long edge) so lights don't bunch on one wall
  for (let e = 0, taken = 0; e < edges.length && taken < n; e += (edges.length > perRoom * 2 ? 2 : 1), taken++) {
    const ed = edges[e], g = lightGenome(rng), len = sp * (1.0 + g.len * 0.6);
    out.push({ x: ed.mx, y: ed.my, nx: ed.nx, ny: ed.ny, len, model: g, room: group.id, tip: { x: ed.mx + ed.nx * len * 0.82, y: ed.my + ed.ny * len * 0.82 } });
  }
  return out;
}

// the tile-grabbing CONSOLE, owner-aware: march from the centroid to the nearest boundary wall, claim
// this room's wall + floor cells in the eruption envelope. Drawable by drawWallFixture unchanged.
export function growRoomConsole(scene, owner, group, rng, { kind = 'storage', avoid = [] } = {}) {
  const sp = scene.roomSpacing || 40, cells = scene.paintCells, W = scene.W, H = scene.H;
  const grid = bucketGrid(scene.nuclei, Math.max(scene.roomSpacing, scene.wallSpacing) * 1.7);
  const isWallAt = (x, y) => { let best = null, bd = Infinity; for (const q of grid.near(x, y)) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = q; } } return !best || best.wall || owner[best.room] !== group.id; };
  // pick the boundary direction farthest from the lights
  const rot = rng() * Math.PI / 6, DIRS = 16; let best = null, bestScore = -1, reachMax = 0;
  for (const idx of group.cells) reachMax = Math.max(reachMax, Math.hypot(cells[idx].x - group.cx, cells[idx].y - group.cy));
  for (let k = 0; k < DIRS; k++) {
    const ang = rot + k / DIRS * Math.PI * 2, cx = Math.cos(ang), cy = Math.sin(ang); let hit = null;
    for (let r = sp * 0.5; r < reachMax + sp * 2; r += scene.wallSpacing * 0.7) {
      const x = group.cx + cx * r, y = group.cy + cy * r; if (x < 1 || y < 1 || x > W - 1 || y > H - 1) break;
      if (isWallAt(x, y)) { hit = { x: group.cx + cx * (r - scene.wallSpacing * 0.5), y: group.cy + cy * (r - scene.wallSpacing * 0.5), cx, cy }; break; }
    }
    if (!hit) continue;
    let near = Infinity; for (const p of avoid) near = Math.min(near, (p.x - hit.x) ** 2 + (p.y - hit.y) ** 2);
    const score = avoid.length ? near : 1; if (score > bestScore) { bestScore = score; best = hit; }
  }
  if (!best) return null;
  best.mx = best.x; best.my = best.y;
  const nx = -best.cx, ny = -best.cy, tx = -ny, ty = nx;     // inward
  const reach = sp * (1.7 + rng() * 0.8), halfW = sp * (1.15 + rng() * 0.55), seedN = (rng() * 1e9) >>> 0;
  const claimed = [];
  for (let idx = 0; idx < cells.length; idx++) {
    const c = cells[idx]; if (!c || c.poly.length < 3) continue;
    const u = (c.x - best.mx) * nx + (c.y - best.my) * ny; if (u < -sp || u > reach + sp) continue;   // cheap envelope prefilter
    const w = Math.abs((c.x - best.mx) * tx + (c.y - best.my) * ty); if (w > halfW + sp) continue;
    if (c.wall) { if (u > -sp * 0.5 && u < sp * 0.4 && w < halfW) claimed.push({ idx, tier: 0, base: true, w }); }
    else if (owner[c.room] === group.id && u > 0 && u <= reach && w <= halfW * profile(u / reach, kind)) claimed.push({ idx, tier: u / reach, base: false, w });
  }
  if (claimed.filter((c) => !c.base).length < 1) return null;
  claimed.sort((a, b2) => a.tier - b2.tier);
  const graph = tileGraph(claimed, cells);
  const tipCells = claimed.filter((c) => c.tier > 0.7);
  const tip = tipCells.length ? { x: tipCells.reduce((s, c) => s + cells[c.idx].x, 0) / tipCells.length, y: tipCells.reduce((s, c) => s + cells[c.idx].y, 0) / tipCells.length } : { x: best.mx + nx * reach * 0.7, y: best.my + ny * reach * 0.7 };
  return { room: group.id, kind, nx, ny, tx, ty, halfW, reach, seedN, anchor: best, cells: claimed, tip, dist: graph.dist, parent: graph.parent, maxDist: graph.maxDist };
}
function tileGraph(claimed, cells) {
  const edgeMap = new Map();
  claimed.forEach((cl, li) => { const v = cells[cl.idx].poly; for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length], ka = vkey(a[0], a[1]), kb = vkey(b[0], b[1]), k = ka < kb ? ka + '|' + kb : kb + '|' + ka; let l = edgeMap.get(k); if (!l) edgeMap.set(k, l = []); l.push(li); } });
  const adj = claimed.map(() => new Set());
  for (const l of edgeMap.values()) if (l.length >= 2) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) if (l[i] !== l[j]) { adj[l[i]].add(l[j]); adj[l[j]].add(l[i]); }
  const dist = claimed.map(() => -1), parent = claimed.map(() => -1), q = [];
  claimed.forEach((c, i) => { if (c.base) { dist[i] = 0; q.push(i); } });
  for (let h = 0; h < q.length; h++) { const u = q[h]; for (const w of adj[u]) if (dist[w] < 0) { dist[w] = dist[u] + 1; parent[w] = u; q.push(w); } }
  let maxDist = 0; for (let i = 0; i < dist.length; i++) { if (dist[i] < 0) dist[i] = Math.round(claimed[i].tier * 4) + 1; if (dist[i] > maxDist) maxDist = dist[i]; }
  return { dist, parent, maxDist: maxDist || 1 };
}

// the central component — settle on the room cell of greatest clearance (to boundary + to fixtures).
export function roomComponent(scene, group, avoid, rng, capR) {
  const edges = roomBoundary(scene, group); let bp = null, best = -1;
  for (const idx of group.cells) {
    const c = scene.paintCells[idx]; let clear = Infinity;
    for (const e of edges) clear = Math.min(clear, Math.hypot(e.mx - c.x, e.my - c.y));
    for (const p of avoid) clear = Math.min(clear, Math.hypot(p.x - c.x, p.y - c.y));
    if (clear > best) { best = clear; bp = c; }
  }
  if (!bp || best < 8) return null;
  return { cx: bp.x, cy: bp.y, r: Math.max(scene.roomSpacing * 0.8, Math.min(best * 0.72, capR)), g: deviceGenome(rng, { sharp: true }) };
}

const FX = { assignOwners, roomGroups, roomBoundary, placeRoomLights, growRoomConsole, roomComponent };
if (typeof globalThis !== 'undefined') globalThis.HALLSFX = FX;
export default FX;
