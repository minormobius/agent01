// foam.js — a small, self-contained VORONOI cell field (the /econ · /chunkroller substrate), so the two ops
// decks are drawn over real foam tiling, not abstract lines. Deterministic jittered-grid seeds → clipped
// Voronoi polygons (half-plane clipping against nearby seeds) + a cell ADJACENCY graph (cells that share an
// edge). The adjacency graph is what the layout grows engine/office regions over and routes material flow
// along. Pure, zero-dep, node-tested.

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const DEFAULTS = { W: 760, H: 520, cols: 22, rows: 15, jitter: 0.62, seed: 1 };

// clip a convex polygon (array of [x,y]) to the half-plane a*x + b*y <= c (Sutherland–Hodgman). Returns the
// clipped polygon and whether the clipping line actually cut it (⇒ the two seeds are Voronoi-adjacent).
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

function centroid(poly) {
  let A = 0, cx = 0, cy = 0; const n = poly.length;
  for (let i = 0; i < n; i++) { const p = poly[i], q = poly[(i + 1) % n]; const cr = p[0] * q[1] - q[0] * p[1]; A += cr; cx += (p[0] + q[0]) * cr; cy += (p[1] + q[1]) * cr; }
  A *= 0.5; if (Math.abs(A) < 1e-6) { let mx = 0, my = 0; for (const p of poly) { mx += p[0]; my += p[1]; } return [mx / n, my / n, 0]; }
  return [cx / (6 * A), cy / (6 * A), Math.abs(A)];
}

export function buildFoam(seed = DEFAULTS.seed, opts = {}) {
  const o = { ...DEFAULTS, ...opts, seed: (seed >>> 0) };
  const { W, H, cols, rows, jitter } = o;
  const rng = mulberry32((o.seed ^ 0x6f0a) >>> 0);
  const cw = W / cols, ch = H / rows;

  // jittered-grid seeds (≤ 1 per grid site) — keeps the foam connected and even (the rind-foam discipline)
  const seeds = []; const grid = [];
  for (let r = 0; r < rows; r++) { grid.push([]); for (let cI = 0; cI < cols; cI++) {
    const x = (cI + 0.5 + (rng() - 0.5) * jitter) * cw, y = (r + 0.5 + (rng() - 0.5) * jitter) * ch;
    grid[r].push(seeds.length); seeds.push({ i: seeds.length, x, y, col: cI, row: r });
  } }

  const box = [[0, 0], [W, 0], [W, H], [0, H]];
  const cells = seeds.map((s) => ({ i: s.i, x: s.x, y: s.y, col: s.col, row: s.row, poly: box.slice(), cand: [], neighbors: new Set(), area: 0 }));

  // clip each cell against seeds in the ±2 grid neighbourhood; the cut seeds are CANDIDATE neighbours
  for (const s of seeds) {
    const cell = cells[s.i];
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      if (!dr && !dc) continue; const r2 = s.row + dr, c2 = s.col + dc;
      if (r2 < 0 || r2 >= rows || c2 < 0 || c2 >= cols) continue;
      const j = grid[r2][c2], t = seeds[j];
      const dx = t.x - s.x, dy = t.y - s.y, mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
      const res = clip(cell.poly, dx, dy, dx * mx + dy * my);
      cell.poly = res.poly;
      if (res.cut) cell.cand.push(j);
    }
    const [cx, cy, area] = centroid(cell.poly);
    cell.cx = cx; cell.cy = cy; cell.area = area;
  }
  // TRUE Voronoi adjacency: j is a neighbour only if the FINAL polygon has an edge lying ON the bisector of
  // (i,j) — i.e. they actually share a wall (the clip `cut` flag over-reports; a far seed's edge gets clipped
  // away by a nearer one). This brings avg degree to the Euler ~6.
  for (const s of seeds) {
    const cell = cells[s.i], P = cell.poly, n = P.length;
    for (const j of cell.cand) {
      const t = seeds[j], dx = t.x - s.x, dy = t.y - s.y, c = dx * (s.x + t.x) / 2 + dy * (s.y + t.y) / 2;
      const L = Math.hypot(dx, dy) || 1, eps = 0.6;
      for (let k = 0; k < n; k++) {
        const p = P[k], q = P[(k + 1) % n];
        const dpp = Math.abs(dx * p[0] + dy * p[1] - c) / L, dqq = Math.abs(dx * q[0] + dy * q[1] - c) / L;
        if (dpp < eps && dqq < eps && Math.hypot(q[0] - p[0], q[1] - p[1]) > 1.0) { cell.neighbors.add(j); break; }
      }
    }
  }
  // symmetrise (the shared-wall test can round asymmetrically at the margins)
  for (const c of cells) for (const j of c.neighbors) cells[j].neighbors.add(c.i);
  for (const c of cells) { c.neighbors = [...c.neighbors]; delete c.cand; }

  return { W, H, cols, rows, cw, ch, seed: o.seed, seeds, cells, nearestCell };
}

// nearest cell to a point (by seed distance) — for planting region seeds at chosen positions
export function nearestCell(foam, x, y) {
  let best = -1, bd = Infinity;
  for (const c of foam.cells) { const d = (c.x - x) ** 2 + (c.y - y) ** 2; if (d < bd) { bd = d; best = c.i; } }
  return best;
}

// BFS shortest path over the cell adjacency graph (returns array of cell indices, or null). `allow` optionally
// restricts to a set of cells (route inside a region); omit to route across the whole floor.
export function pathCells(foam, a, b, allow = null) {
  if (a === b) return [a];
  const prev = new Map([[a, -1]]); const q = [a];
  for (let h = 0; h < q.length; h++) {
    const u = q[h];
    for (const v of foam.cells[u].neighbors) {
      if (prev.has(v)) continue; if (allow && !allow.has(v)) continue;
      prev.set(v, u); if (v === b) { const out = [v]; let x = u; while (x !== -1) { out.push(x); x = prev.get(x); } return out.reverse(); }
      q.push(v);
    }
  }
  return null;
}

// multi-source BFS = graph-Voronoi: assign every cell to its nearest source (by hop distance). Returns
// owner[] (cell index → source index, or -1). Contiguous regions, the "facilities are Voronoi regions OF the
// chambers" conceit.
export function graphVoronoi(foam, sourceCells) {
  const owner = new Array(foam.cells.length).fill(-1);
  const q = []; sourceCells.forEach((c, s) => { if (owner[c] === -1) { owner[c] = s; q.push(c); } });
  for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of foam.cells[u].neighbors) if (owner[v] === -1) { owner[v] = owner[u]; q.push(v); } }
  return owner;
}

if (typeof globalThis !== 'undefined') globalThis.RindFoam = { buildFoam, nearestCell, pathCells, graphVoronoi };
