// cells3d.js — TRUE 3D VORONOI CHAMBERS over the prism weave. Every prism node owns a convex POLYHEDRON: the
// hexagonal prism clipped by the perpendicular-bisector half-space of every nearby node. The cells pack the prism
// SOLID — no gaps, no overlap (Σ cell volume == prism volume, pinned by the selftest) — so every volumetric slice
// is spoken for. NOT four painted planes.
//
// The DOOR graph is the true 3D face adjacency: two chambers share a door iff their polyhedra share a 2D face.
// `routeMinDoors` counts THREAD doors — crossing into a chamber owned by a DIFFERENT thread is a door; walking
// your own thread's corridor is free — and finds the path that crosses the fewest. Pure, deterministic, node-tested.

const EPS = 1e-6;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const L = len(a) || 1; return [a[0] / L, a[1] / L, a[2] / L]; };

// clip a convex polyhedron (array of faces; each face an ordered ring of [x,y,z]) by the half-space n·x ≤ d.
// Returns { faces, cut } — `cut` is true iff the plane actually sliced the cell (⇒ a new cap face on plane n).
function clipByPlane(faces, n, d) {
  const kept = [], capPts = []; let cut = false;
  for (const f of faces) {
    const out = []; const L = f.length; let made = false;
    for (let i = 0; i < L; i++) {
      const A = f[i], B = f[(i + 1) % L], sA = dot(n, A) - d, sB = dot(n, B) - d;
      if (sA <= EPS) out.push(A);
      if ((sA < -EPS && sB > EPS) || (sA > EPS && sB < -EPS)) { const t = sA / (sA - sB); const P = [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1]), A[2] + t * (B[2] - A[2])]; out.push(P); capPts.push(P); made = true; }
    }
    if (out.length >= 3) kept.push(out);
    if (made) cut = true;
  }
  if (capPts.length >= 3) { const cap = orderRing(capPts, n); if (cap.length >= 3) { kept.push(cap); } }
  return { faces: kept, cut };
}

// order a set of coplanar points (on plane with normal n) into a convex ring by angle around their centroid
function orderRing(pts, n) {
  const uniq = [];
  for (const p of pts) if (!uniq.some((q) => Math.abs(q[0] - p[0]) < 1e-4 && Math.abs(q[1] - p[1]) < 1e-4 && Math.abs(q[2] - p[2]) < 1e-4)) uniq.push(p);
  if (uniq.length < 3) return [];
  const c = [0, 0, 0]; for (const p of uniq) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } c[0] /= uniq.length; c[1] /= uniq.length; c[2] /= uniq.length;
  let u = cross(n, [0, 0, 1]); if (len(u) < 1e-6) u = cross(n, [0, 1, 0]); u = norm(u); const v = norm(cross(n, u));
  return uniq.sort((a, b) => Math.atan2(dot(sub(a, c), v), dot(sub(a, c), u)) - Math.atan2(dot(sub(b, c), v), dot(sub(b, c), u)));
}

function cellVolume(faces) { let V = 0; for (const f of faces) for (let i = 1; i < f.length - 1; i++) V += dot(f[0], cross(f[i], f[i + 1])); return Math.abs(V) / 6; }
function uniqueVerts(faces) { const out = []; for (const f of faces) for (const p of f) if (!out.some((q) => Math.abs(q[0] - p[0]) < 1e-3 && Math.abs(q[1] - p[1]) < 1e-3 && Math.abs(q[2] - p[2]) < 1e-3)) out.push(p); return out; }

export const ownerKey = (o) => o ? (o.kind === 'white' ? 'w' + o.idx : 'p' + o.idx) : 'matrix';

export function buildCells(model) {
  const { nodes, footprint, spacing: a, thickness, layers } = model;
  const vpitch = thickness / layers, T = thickness;

  // the prism as a convex polyhedron: hex top + hex bottom + 6 sides (outward-oriented)
  const vt = footprint.map((p) => [p[0], p[1], T]), vb = footprint.map((p) => [p[0], p[1], 0]);
  const prismFaces = [vt.slice(), vb.slice().reverse()];
  for (let k = 0; k < 6; k++) { const k2 = (k + 1) % 6; prismFaces.push([vb[k], vb[k2], vt[k2], vt[k]]); }

  // a 3D grid over the nodes for neighbour queries
  const reach = 2.4 * Math.max(a, vpitch), gs = reach, grid = new Map(), gk = (x, y, z) => `${Math.floor(x / gs)},${Math.floor(y / gs)},${Math.floor(z / gs)}`;
  for (const n of nodes) { const k = gk(n.x, n.y, n.z); (grid.get(k) || grid.set(k, []).get(k)).push(n); }

  const cells = nodes.map((n) => ({ gi: n.i, nodeIndex: n.i, layer: n.layer, x: n.x, y: n.y, z: n.z, owner: n.nearest, ownerKey: ownerKey(n.nearest), flat: !!n.flat, verts: null, volume: 0, adj: new Set() }));

  for (const n of nodes) {
    let faces = prismFaces.map((f) => f.map((p) => p.slice()));
    const cand = [];
    const bx = Math.floor(n.x / gs), by = Math.floor(n.y / gs), bz = Math.floor(n.z / gs);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const bucket = grid.get(`${bx + dx},${by + dy},${bz + dz}`); if (!bucket) continue;
      for (const t of bucket) { if (t === n) continue; const d2 = (t.x - n.x) ** 2 + (t.y - n.y) ** 2 + (t.z - n.z) ** 2; if (d2 > reach * reach) continue; cand.push(t); } }
    cand.sort((p, q) => ((p.x - n.x) ** 2 + (p.y - n.y) ** 2 + (p.z - n.z) ** 2) - ((q.x - n.x) ** 2 + (q.y - n.y) ** 2 + (q.z - n.z) ** 2));
    const planes = [];
    for (const t of cand) { const nx = t.x - n.x, ny = t.y - n.y, nz = t.z - n.z, d = (nx * (n.x + t.x) + ny * (n.y + t.y) + nz * (n.z + t.z)) / 2;
      const res = clipByPlane(faces, [nx, ny, nz], d); faces = res.faces; planes.push({ t, n: [nx, ny, nz], d, L: Math.hypot(nx, ny, nz) || 1 }); }
    const cell = cells[n.i]; cell.verts = uniqueVerts(faces); cell.volume = cellVolume(faces); cell.faces = faces;
    // TRUE face adjacency: neighbour t is a door iff a FINAL face lies on the bisector plane of (n,t)
    for (const pl of planes) { const tc = cells[pl.t.i]; let onFace = false;
      for (const f of faces) { let all = f.length >= 3; for (const p of f) if (Math.abs(dot(pl.n, p) - pl.d) / pl.L > 0.5) { all = false; break; } if (all) { onFace = true; break; } }
      if (onFace) { cell.adj.add(tc.gi); tc.adj.add(cell.gi); }
    }
  }

  const prismVolume = footprint.reduce((s, p, i) => { const q = footprint[(i + 1) % footprint.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2 * T;
  const filled = cells.reduce((s, c) => s + c.volume, 0);
  return { cells, vpitch, layers, prismVolume: Math.abs(prismVolume), filledVolume: filled, fillRatio: filled / Math.abs(prismVolume) };
}

// wayfinding that minimises DOORS — a door = crossing into a chamber owned by a DIFFERENT thread (walking your own
// thread's corridor is free). 0/1-weighted shortest path (0-1 BFS / deque). Returns { path, doors, cells } or null.
export function routeMinDoors(cellsModel, aGi, bGi) {
  const { cells } = cellsModel;
  if (aGi == null || bGi == null) return null;
  if (aGi === bGi) return { path: [aGi], doors: 0, cells: 1 };
  const dist = new Map([[aGi, 0]]), prev = new Map([[aGi, -1]]); let dq = [aGi];
  while (dq.length) {
    dq.sort((x, y) => dist.get(x) - dist.get(y));      // small graphs ⇒ simple priority; correct 0/1 weights
    const cur = dq.shift(); if (cur === bGi) break;
    for (const nb of cells[cur].adj) { const w = cells[nb].ownerKey === cells[cur].ownerKey ? 0 : 1, nd = dist.get(cur) + w;
      if (nd < (dist.has(nb) ? dist.get(nb) : Infinity)) { dist.set(nb, nd); prev.set(nb, cur); dq.push(nb); } }
  }
  if (!prev.has(bGi)) return null;
  const path = []; for (let c = bGi; c !== -1; c = prev.get(c)) path.push(c); path.reverse();
  return { path, doors: dist.get(bGi), cells: path.length };
}

if (typeof globalThis !== 'undefined') globalThis.RindCells3D = { buildCells, routeMinDoors, ownerKey };
