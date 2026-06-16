// manager.js — v8 milestone 1: the chunk world + the cross-chunk walk graph.
//
// Holds the loaded chunk records, seeds neighbours by reflection (inheriting shared-edge ports from
// EVERY abutting chunk), and stitches a single WALK GRAPH across them: free movement within a room
// and within the concourse, crossing between them only at a room's door, and crossing between CHUNKS
// only at the shared-edge ports. Pathfinding over that graph is local/near by construction — there's
// no universe-scale routing, which is exactly the scope we want.
//
// Pure + deterministic; node + browser. The page drives it; tests pin it.

import { reflectPolyAcrossEdge } from '../v7/foam.js';

export function createWorld() { return { chunks: [], occupied: new Set() }; }
export const midKey = (poly, e) => { const a = poly[e], b = poly[(e + 1) % poly.length]; return Math.round((a.x + b.x) / 2) + ',' + Math.round((a.y + b.y) / 2); };

export function addChunk(world, rec) { rec.id = world.chunks.length; world.chunks.push(rec); for (let e = 0; e < rec.poly.length; e++) { const mk = midKey(rec.poly, e); if (rec.ports.some((p) => p.edge === e && p.inherited)) world.occupied.add(mk); } return rec; }

// is this edge of this chunk a frontier (no neighbour yet)?
export function edgeFree(world, chunk, e) { return !world.occupied.has(midKey(chunk.poly, e)); }

// the spec to hand solveChunk for the neighbour across edge `ei`: the reflected polygon + the ports
// inherited from EVERY existing chunk edge it will abut (fixes the fill-the-middle case).
export function neighbourSpec(world, chunkId, ei) {
  const ch = world.chunks[chunkId], poly = reflectPolyAcrossEdge(ch.poly, ei), inherit = [];
  for (let be = 0; be < poly.length; be++) { const mk = midKey(poly, be); for (const ec of world.chunks) for (let e = 0; e < ec.poly.length; e++) if (midKey(ec.poly, e) === mk) { for (const p of ec.ports) if (p.edge === e) inherit.push({ x: p.x, y: p.y }); world.occupied.add(mk); } }
  return { poly, inherit };
}

// the unified walk graph over all loaded chunks. Global node id = base[chunkId] + localCell.
const mem = (ch, i) => ch.road[i] ? 'R' : ('r' + ch.id + '_' + ch.roomOf[i]);
export function buildWalk(world, blockedOf) {
  const base = [], pos = [], nodeChunk = [], nodeLocal = []; let N = 0;
  for (const ch of world.chunks) { base[ch.id] = N; for (let i = 0; i < ch.cells.length; i++) { pos.push(ch.cells[i].x, ch.cells[i].y); nodeChunk.push(ch.id); nodeLocal.push(i); } N += ch.cells.length; }
  const adj = Array.from({ length: N }, () => []);
  const link = (a, b) => { adj[a].push(b); adj[b].push(a); };
  for (const ch of world.chunks) {
    const b0 = base[ch.id];
    for (let i = 0; i < ch.cells.length; i++) for (const j of ch.adj[i]) { if (j <= i) continue; const la = mem(ch, i), lb = mem(ch, j); if ((la === 'R' && lb === 'R') || la === lb) link(b0 + i, b0 + j); }
    for (const r of ch.rooms) { const dp = r.doorPairs && r.doorPairs.length ? r.doorPairs : (r.door >= 0 && r.doorRoad >= 0 ? [[r.door, r.doorRoad]] : []); for (const [a, b] of dp) link(b0 + a, b0 + b); }   // the doorway (1–2 cells)
  }
  // cross-chunk: chunks sharing a port location → link their port cells (both concourse) = the seam crossing
  const byLoc = new Map();
  for (const ch of world.chunks) for (const p of ch.ports) { if (p.cell == null || p.cell < 0) continue; const k = Math.round(p.x) + ',' + Math.round(p.y); let a = byLoc.get(k); if (!a) { a = []; byLoc.set(k, a); } a.push(base[ch.id] + p.cell); }
  for (const group of byLoc.values()) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) link(group[i], group[j]);
  // optional IMPASSABLE nodes (v091 fixtures): blockedOf(chunkId, localCell) → bool. Edges are LEFT
  // INTACT (so the fog/sight ball still flows over a fixture and reveals it); pathFind + nearestNode
  // consult walk.blocked so MOVEMENT routes around it. Omitted ⇒ nothing blocked (shared default).
  let blocked = null;
  if (blockedOf) { blocked = new Set(); for (const ch of world.chunks) { const b0 = base[ch.id]; for (let i = 0; i < ch.cells.length; i++) if (blockedOf(ch.id, i)) blocked.add(b0 + i); } }
  return { N, adj, pos: new Float32Array(pos), nodeChunk: new Int32Array(nodeChunk), nodeLocal: new Int32Array(nodeLocal), base, blocked };
}
export const globalOf = (walk, chunkId, local) => walk.base[chunkId] + local;

// nearest walkable global node to a world point
export function nearestNode(walk, x, y, avoidBlocked) { const blk = avoidBlocked && walk.blocked; let best = -1, bd = Infinity; for (let i = 0; i < walk.N; i++) { if (blk && blk.has(i)) continue; const d = (walk.pos[2 * i] - x) ** 2 + (walk.pos[2 * i + 1] - y) ** 2; if (d < bd) { bd = d; best = i; } } return best; }

// shortest path (Dijkstra by euclidean) over the walk graph
export function pathFind(walk, src, dst) {
  const { N, adj, pos } = walk, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N), heap = [[0, src]];
  const push = (d, c) => { heap.push([d, c]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break;[heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let k = 0; for (;;) { const L = 2 * k + 1, R = L + 1; let m = k; if (L < heap.length && heap[L][0] < heap[m][0]) m = L; if (R < heap.length && heap[R][0] < heap[m][0]) m = R; if (m === k) break;[heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return t; };
  const blk = walk.blocked;   // impassable nodes (v091 fixtures) are never expanded into (except dst itself)
  dist[src] = 0;
  while (heap.length) { const [d, u] = pop(); if (done[u]) continue; done[u] = 1; if (u === dst) break; for (const v of adj[u]) { if (blk && v !== dst && blk.has(v)) continue; const nd = d + Math.hypot(pos[2 * u] - pos[2 * v], pos[2 * u + 1] - pos[2 * v + 1]); if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push(nd, v); } } }
  if (!done[dst]) return null;
  const path = []; for (let u = dst; u !== -1; u = prev[u]) path.push(u); return path.reverse();
}

// the sight ball (fog): BFS over the walk graph up to `hops` — vision flows down the concourse and
// through doors, walls block it. Returns a Set of global node ids.
export function sightBall(walk, center, hops) { const out = new Set(), dist = new Map([[center, 0]]), q = [center]; for (let h = 0; h < q.length; h++) { const u = q[h], d = dist.get(u); out.add(u); if (d >= hops) continue; for (const v of walk.adj[u]) if (!dist.has(v)) { dist.set(v, d + 1); q.push(v); } } return out; }
