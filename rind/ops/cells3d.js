// cells3d.js — VORONOI CHAMBERS for the prism weave. One cell per prism node: per-layer 2D Voronoi clipped to the
// hexagonal footprint, coloured by the thread that claims the node. Plus the DOOR graph — in-layer shared walls
// and cross-layer (deck-to-deck) adjacency — and `routeMinDoors`, a wayfinding route that MINIMISES THE NUMBER OF
// DOORS CROSSED (fewest cells entered = BFS in the cell graph). Pure, deterministic, node-tested.

// clip a convex polygon to the half-plane a·x + b·y ≤ c (Sutherland–Hodgman); `cut` ⇒ the two seeds are adjacent
function clip(poly, a, b, c) {
  const out = []; let cut = false; const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const dp = a * p[0] + b * p[1] - c, dq = a * q[0] + b * q[1] - c;
    const ip = dp <= 1e-9, iq = dq <= 1e-9;
    if (ip) out.push(p);
    if (ip !== iq) { const t = dp / (dp - dq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); cut = true; }
  }
  return { poly: out, cut };
}
function area(poly) { let A = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; A += p[0] * q[1] - q[0] * p[1]; } return Math.abs(A) / 2; }

// ownerKey: a stable id for a node's claiming thread (or the interstitial matrix)
export const ownerKey = (o) => o ? (o.kind === 'white' ? 'w' + o.idx : 'p' + o.idx) : 'matrix';

export function buildCells(model) {
  const { nodes, footprint, spacing: a, thickness, layers } = model;
  const vpitch = thickness / layers;
  const cells = []; const nodeCell = new Map();

  // ── per-layer 2D Voronoi (clip the hex footprint by nearby same-layer nodes) ──
  const byLayer = Array.from({ length: layers }, () => []);
  for (const n of nodes) byLayer[n.layer].push(n);
  const gs = 2.2 * a;
  for (let L = 0; L < layers; L++) {
    const ns = byLayer[L], grid = new Map();
    const bk = (x, y) => `${Math.floor(x / gs)},${Math.floor(y / gs)}`;
    for (const n of ns) { const k = bk(n.x, n.y); (grid.get(k) || grid.set(k, []).get(k)).push(n); }
    for (const n of ns) {
      let poly = footprint.map((v) => [v[0], v[1]]); const cand = [];
      const bx = Math.floor(n.x / gs), by = Math.floor(n.y / gs);
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const bucket = grid.get(`${bx + dx},${by + dy}`); if (!bucket) continue;
        for (const t of bucket) { if (t === n) continue; const ex = t.x - n.x, ey = t.y - n.y; if (ex * ex + ey * ey > (3 * a) ** 2) continue;
          const res = clip(poly, ex, ey, ex * (n.x + t.x) / 2 + ey * (n.y + t.y) / 2); poly = res.poly; if (res.cut) cand.push(t); } }
      const gi = cells.length;
      cells.push({ gi, nodeIndex: n.i, layer: L, z: n.z, x: n.x, y: n.y, poly, area: area(poly), owner: n.nearest, ownerKey: ownerKey(n.nearest), flat: !!n.flat, cand: cand.map((t) => t.i), adj: new Set() });
      nodeCell.set(n.i, gi);
    }
  }

  // ── in-layer TRUE adjacency: a candidate is a neighbour only if a final polygon edge lies on their bisector ──
  for (const cell of cells) { const P = cell.poly, nP = P.length;
    for (const ti of cell.cand) { const tc = cells[nodeCell.get(ti)]; if (!tc) continue;
      const dx = tc.x - cell.x, dy = tc.y - cell.y, c = dx * (cell.x + tc.x) / 2 + dy * (cell.y + tc.y) / 2, Ln = Math.hypot(dx, dy) || 1, eps = 0.8;
      for (let k = 0; k < nP; k++) { const p = P[k], q = P[(k + 1) % nP];
        if (Math.abs(dx * p[0] + dy * p[1] - c) / Ln < eps && Math.abs(dx * q[0] + dy * q[1] - c) / Ln < eps && Math.hypot(q[0] - p[0], q[1] - p[1]) > 1) { cell.adj.add(tc.gi); tc.adj.add(cell.gi); break; } }
    }
  }

  // ── cross-layer DOORS: a cell is adjacent to a cell on an adjacent deck whose node sits within one node-step ──
  const thr = 1.4 * Math.max(a, vpitch), thr2 = thr * thr, g3 = thr;
  const grid3 = new Map(), k3 = (x, y, z) => `${Math.floor(x / g3)},${Math.floor(y / g3)},${Math.floor(z / g3)}`;
  for (const c of cells) { const k = k3(c.x, c.y, c.z); (grid3.get(k) || grid3.set(k, []).get(k)).push(c); }
  for (const c of cells) { const bx = Math.floor(c.x / g3), by = Math.floor(c.y / g3), bz = Math.floor(c.z / g3);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const bucket = grid3.get(`${bx + dx},${by + dy},${bz + dz}`); if (!bucket) continue;
      for (const t of bucket) { if (t === c || t.layer === c.layer) continue; if ((t.x - c.x) ** 2 + (t.y - c.y) ** 2 + (t.z - c.z) ** 2 <= thr2) { c.adj.add(t.gi); t.adj.add(c.gi); } } } }

  return { cells, vpitch, nodeCell, layers };
}

// wayfinding that MINIMISES DOOR CROSSINGS: BFS in the cell graph (every edge = one door) ⇒ the path that enters
// the fewest chambers. Returns { path:[gi…], doors, threadChanges } or null if disconnected.
export function routeMinDoors(cellsModel, aGi, bGi) {
  const { cells } = cellsModel;
  if (aGi == null || bGi == null) return null;
  if (aGi === bGi) return { path: [aGi], doors: 0, threadChanges: 0 };
  const prev = new Map([[aGi, -1]]), q = [aGi];
  for (let h = 0; h < q.length; h++) { const cur = q[h]; if (cur === bGi) break; for (const nb of cells[cur].adj) if (!prev.has(nb)) { prev.set(nb, cur); q.push(nb); } }
  if (!prev.has(bGi)) return null;
  const path = []; for (let c = bGi; c !== -1; c = prev.get(c)) path.push(c); path.reverse();
  let threadChanges = 0; for (let i = 1; i < path.length; i++) if (cells[path[i]].ownerKey !== cells[path[i - 1]].ownerKey) threadChanges++;
  return { path, doors: path.length - 1, threadChanges };
}

if (typeof globalThis !== 'undefined') globalThis.RindCells3D = { buildCells, routeMinDoors, ownerKey };
