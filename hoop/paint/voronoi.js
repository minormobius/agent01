// voronoi.js — the membrane-seeded Voronoi painter behind /paint/ (the rendering playground).
//
// The idea (the user's): take a floor plan's MEMBRANES (the walls between rooms) and seed them
// with Voronoi nuclei spaced `s`. Keep the floor nuclei OUT of a band of width ~s around the
// walls. Paint the Voronoi tiling of {wall nuclei ∪ floor nuclei}: wall-seeded cells are the wall
// material, the rest is floor. Because the floor nuclei are held a distance ~s/2 off the membrane,
// the wall band comes out ~s thick — so the one knob, nucleus spacing, DIRECTLY sets wall thickness.
//
// Pure + deterministic (seed in → same scene). Zero-dep, node + browser. The /paint/ page only
// draws what buildScene() returns; this module is pinned by hoop/test/paint.selftest.mjs.

export function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// a jittered grid of points over [0,W]×[0,H] at `spacing`, displaced up to `jit`·spacing per axis
export function jitterGrid(W, H, spacing, jit, rng) {
  const out = [];
  for (let gy = spacing / 2; gy < H; gy += spacing) for (let gx = spacing / 2; gx < W; gx += spacing) {
    out.push({ x: gx + (rng() - 0.5) * jit * spacing, y: gy + (rng() - 0.5) * jit * spacing });
  }
  return out;
}

// a 3×3 bucket-grid neighbour index over a point set
export function bucketGrid(points, cell) {
  const m = new Map(), key = (x, y) => Math.floor(x / cell) + ',' + Math.floor(y / cell);
  for (const p of points) { const k = key(p.x, p.y); let b = m.get(k); if (!b) { b = []; m.set(k, b); } b.push(p); }
  return {
    near(x, y) { const out = [], cx = Math.floor(x / cell), cy = Math.floor(y / cell); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const b = m.get((cx + dx) + ',' + (cy + dy)); if (b) for (const p of b) out.push(p); } return out; },
  };
}

// the Voronoi cell of site A as a convex polygon: clip a box of half-size R against the
// perpendicular bisectors with A's nearest neighbours (keep the half-plane toward A).
export function clipCell(A, neighbours, R) {
  let poly = [[A.x - R, A.y - R], [A.x + R, A.y - R], [A.x + R, A.y + R], [A.x - R, A.y + R]];
  const near = neighbours
    .map((s) => [s, (s.x - A.x) ** 2 + (s.y - A.y) ** 2])
    .filter((p) => p[1] > 1e-9).sort((a, b) => a[1] - b[1]).slice(0, 24).map((p) => p[0]);
  for (const B of near) {
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, nx = A.x - B.x, ny = A.y - B.y, out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = (a[0] - mx) * nx + (a[1] - my) * ny, db = (b[0] - mx) * nx + (b[1] - my) * ny;
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    poly = out; if (poly.length < 3) break;
  }
  return poly;
}

// distance from p to the nearest Voronoi boundary of its own room (the membrane), using the
// bisector identity dist = (|pB|²−|pA|²)/(2|AB|) minimised over neighbour seeds B. Returns
// { room, edgeDist }. Cheap, exact, no explicit edge geometry needed.
export function roomOf(p, roomGrid) {
  const cand = roomGrid.near(p.x, p.y);
  let A = null, dA = Infinity;
  for (const s of cand) { const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2; if (d < dA) { dA = d; A = s; } }
  if (!A) return { room: null, edgeDist: Infinity };
  let edge = Infinity;
  for (const B of cand) {
    if (B === A) continue;
    const ab = Math.hypot(B.x - A.x, B.y - A.y); if (ab < 1e-6) continue;
    const dB = (B.x - p.x) ** 2 + (B.y - p.y) ** 2;
    const e = (dB - dA) / (2 * ab); if (e < edge) edge = e;
  }
  return { room: A.id, edgeDist: edge };
}

// Build the whole scene: room seeds + room cells (the exact floor plan), the membrane-seeded wall
// nuclei + the band-excluded floor nuclei, and the painted Voronoi of them all.
export function buildScene({ W, H, spacing, roomSize, seed = 1 }) {
  const rng = mulberry32(seed >>> 0);
  // 1. the floor plan: jittered-grid room seeds → room Voronoi cells
  const roomSeeds = jitterGrid(W, H, roomSize, 0.55, rng).map((p, i) => ({ ...p, id: i }));
  const roomGrid = bucketGrid(roomSeeds, roomSize * 1.4);
  const roomCells = roomSeeds.map((s) => ({ id: s.id, x: s.x, y: s.y, poly: clipCell(s, roomGrid.near(s.x, s.y), roomSize * 2.2) }));

  // 2. WALL nuclei: sample every room-cell edge (the membranes) at `spacing`; dedupe coincident
  //    samples of shared edges by snapping to a fine grid.
  const wallNuclei = [], seen = new Set(), snap = spacing * 0.45;
  const addWall = (x, y) => {
    if (x < 0 || y < 0 || x > W || y > H) return;
    const k = Math.round(x / snap) + ',' + Math.round(y / snap);
    if (seen.has(k)) return; seen.add(k);
    wallNuclei.push({ x, y, wall: true });
  };
  for (const c of roomCells) {
    const v = c.poly;
    for (let i = 0; i < v.length; i++) {
      const a = v[i], b = v[(i + 1) % v.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(L / spacing));
      for (let j = 0; j <= n; j++) { const t = j / n; addWall(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); }
    }
  }

  // 3. FLOOR nuclei: a jittered grid, but keep only those a clear distance off any membrane
  //    (edgeDist > band). `band` = the wall half-thickness, tied to spacing — the knob.
  const band = spacing * 0.5;
  const floorNuclei = [];
  for (const p of jitterGrid(W, H, spacing, 0.5, rng)) {
    const r = roomOf(p, roomGrid);
    if (r.edgeDist > band) floorNuclei.push({ x: p.x, y: p.y, wall: false, room: r.room });
  }

  // 4. paint: the Voronoi of all nuclei
  const nuclei = wallNuclei.concat(floorNuclei);
  const paintGrid = bucketGrid(nuclei, spacing * 1.8);
  const paintCells = nuclei.map((nu) => ({ wall: nu.wall, room: nu.room, x: nu.x, y: nu.y, poly: clipCell(nu, paintGrid.near(nu.x, nu.y), spacing * 3) }));

  return { W, H, spacing, roomSize, band, roomSeeds, roomCells, wallNuclei, floorNuclei, nuclei, paintCells };
}
