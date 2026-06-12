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

// The room-adjacency graph: which rooms share a membrane, with that membrane's midpoint and the
// across/along unit vectors (across = seed→seed, perpendicular to the wall). Border edges (a cell
// edge on the canvas frame, not a real bisector between two rooms) are filtered out.
export function adjacency(roomCells, roomSeeds, roomGrid, tol) {
  const byId = new Map(roomSeeds.map((s) => [s.id, s]));
  const edges = new Map();
  for (const c of roomCells) {
    const A = byId.get(c.id), v = c.poly;
    for (let i = 0; i < v.length; i++) {
      const p = v[i], q = v[(i + 1) % v.length], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      let B = null, dB = Infinity;
      for (const s of roomGrid.near(mx, my)) { if (s.id === A.id) continue; const d = (s.x - mx) ** 2 + (s.y - my) ** 2; if (d < dB) { dB = d; B = s; } }
      if (!B) continue;
      const dA = Math.hypot(A.x - mx, A.y - my);
      if (Math.abs(dA - Math.sqrt(dB)) > tol) continue; // not equidistant ⇒ a frame edge, not a shared wall
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const a = Math.min(A.id, B.id), b = Math.max(A.id, B.id), key = a + ',' + b, prev = edges.get(key);
      if (!prev || len > prev.len) {
        const nx = B.x - A.x, ny = B.y - A.y, n = Math.hypot(nx, ny) || 1;
        edges.set(key, { a, b, m: [mx, my], len, across: [nx / n, ny / n], along: [-ny / n, nx / n] });
      }
    }
  }
  return [...edges.values()];
}

// Choose the doors: a deterministic spanning tree (every room connected) + a `loops` fraction of
// the remaining adjacencies (extra doors → road-network loops). Union-find over room ids.
export function chooseDoors(edges, roomCount, seed, loops) {
  const hash = (e) => { let x = (seed ^ Math.imul(e.a + 1, 73856093) ^ Math.imul(e.b + 1, 19349663)) >>> 0; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; return x >>> 0; };
  const ord = edges.slice().sort((p, q) => hash(p) - hash(q));
  const par = Array.from({ length: roomCount }, (_, i) => i), find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const tree = [], rest = [];
  for (const e of ord) { if (find(e.a) !== find(e.b)) { par[find(e.a)] = find(e.b); tree.push(e); } else rest.push(e); }
  return tree.concat(rest.slice(0, Math.round(rest.length * Math.max(0, Math.min(1, loops || 0)))));
}

// Build the whole scene: room seeds + room cells (the exact floor plan), the membrane-seeded wall
// nuclei (fine, at `wallSpacing`) with DOORS cut where rooms connect, and DENSITY-GRADED floor
// nuclei — a big seed at each room centre, fining toward the walls — so detail goes where it's
// needed (crisp thin walls) and the interiors stay coarse. Doors are two-nuclei-wide gaps in the
// wall, bridged with floor so the rooms connect; `loops` adds extra doors past the spanning tree.
// Knobs: `wallSpacing` (wall thickness ≈ it), `roomSpacing` (interior coarseness), `loops` (roads).
export function buildScene({ W, H, wallSpacing, roomSpacing, roomSize, loops = 0, seed = 1 }) {
  const rng = mulberry32(seed >>> 0);
  const band = wallSpacing * 0.5;
  // 1. the floor plan: jittered-grid room seeds → room Voronoi cells
  const roomSeeds = jitterGrid(W, H, roomSize, 0.55, rng).map((p, i) => ({ ...p, id: i }));
  const roomGrid = bucketGrid(roomSeeds, roomSize * 1.4);
  const roomCells = roomSeeds.map((s) => ({ id: s.id, x: s.x, y: s.y, poly: clipCell(s, roomGrid.near(s.x, s.y), roomSize * 2.2) }));

  // 1b. DOORS: a spanning tree of the room-adjacency graph (every room connected) + `loops` extras.
  const adjEdges = adjacency(roomCells, roomSeeds, roomGrid, wallSpacing * 0.6);
  const doors = chooseDoors(adjEdges, roomSeeds.length, seed >>> 0, loops);
  const doorHalf = wallSpacing;                 // gap along the wall = 2·wallSpacing (two nuclei wide)
  const doorGrid = bucketGrid(doors.map((d) => ({ x: d.m[0], y: d.m[1] })), Math.max(roomSize, doorHalf * 2));
  const atDoor = (x, y) => { for (const q of doorGrid.near(x, y)) if ((q.x - x) ** 2 + (q.y - y) ** 2 < doorHalf * doorHalf) return true; return false; };

  // 2. WALL nuclei: sample every room-cell edge (the membranes) at `wallSpacing`, but SKIP the
  //    door gaps; dedupe coincident samples of shared edges by snapping to a fine grid.
  const wallNuclei = [], seen = new Set(), snap = wallSpacing * 0.45;
  const addWall = (x, y) => {
    if (x < 0 || y < 0 || x > W || y > H || atDoor(x, y)) return;
    const k = Math.round(x / snap) + ',' + Math.round(y / snap);
    if (seen.has(k)) return; seen.add(k);
    wallNuclei.push({ x, y, wall: true });
  };
  for (const c of roomCells) {
    const v = c.poly;
    for (let i = 0; i < v.length; i++) {
      const a = v[i], b = v[(i + 1) % v.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(L / wallSpacing));
      for (let j = 0; j <= n; j++) { const t = j / n; addWall(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); }
    }
  }

  // 3. FLOOR nuclei: variable-radius dart-throwing. Local target spacing grows with distance from
  //    the wall — `wallSpacing` at the band edge, ramping to `roomSpacing` by mid-room — so cells
  //    coarsen toward the centre. Room-centre seeds are forced first to anchor a big middle cell.
  const refDepth = Math.max(band + 1, roomSize * 0.45);
  const localSpacing = (edge) => {
    const f = Math.max(0, Math.min(1, (edge - band) / (refDepth - band)));
    return wallSpacing + (roomSpacing - wallSpacing) * f;
  };
  const hashCell = Math.max(roomSpacing, wallSpacing);
  const acc = new Map(), akey = (x, y) => Math.floor(x / hashCell) + ',' + Math.floor(y / hashCell);
  const floorNuclei = [];
  const place = (x, y, room, door = false) => { const n = { x, y, wall: false, room, door }; floorNuclei.push(n); const k = akey(x, y); let b = acc.get(k); if (!b) { b = []; acc.set(k, b); } b.push(n); return n; };
  const clearOf = (x, y, r) => { const cx = Math.floor(x / hashCell), cy = Math.floor(y / hashCell), r2 = r * r; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const b = acc.get((cx + dx) + ',' + (cy + dy)); if (!b) continue; for (const q of b) if ((q.x - x) ** 2 + (q.y - y) ** 2 < r2) return false; } return true; };
  // forced room-centre seeds (the big middle cell)
  for (const s of roomSeeds) { const e = roomOf(s, roomGrid).edgeDist; if (e > band) place(s.x, s.y, s.id); }
  // DOOR bridges: a two-wide line of floor nuclei crossing each door, so the rooms connect through it
  for (const d of doors) {
    const [mx, my] = d.m, [ax, ay] = d.across, [tx, ty] = d.along;
    for (const du of [-wallSpacing * 0.5, wallSpacing * 0.5]) {
      for (let dv = -(band + wallSpacing); dv <= band + wallSpacing + 1e-6; dv += wallSpacing) {
        const x = mx + tx * du + ax * dv, y = my + ty * du + ay * dv;
        if (x < 0 || y < 0 || x > W || y > H) continue;
        place(x, y, roomOf({ x, y }, roomGrid).room, true);
      }
    }
  }
  // graded fill from a fine candidate grid (densest = wallSpacing), accepted by the local radius
  for (const p of jitterGrid(W, H, wallSpacing, 0.6, rng)) {
    const r = roomOf(p, roomGrid);
    if (r.edgeDist <= band && !atDoor(p.x, p.y)) continue;   // keep out of the wall band — except at doors
    if (clearOf(p.x, p.y, localSpacing(Math.max(r.edgeDist, band)))) place(p.x, p.y, r.room);
  }

  // 4. paint: the Voronoi of all nuclei (neighbour search sized for the coarsest cells)
  const nuclei = wallNuclei.concat(floorNuclei);
  const paintGrid = bucketGrid(nuclei, Math.max(roomSpacing, wallSpacing) * 1.6);
  const paintCells = nuclei.map((nu) => ({ wall: nu.wall, room: nu.room, door: !!nu.door, x: nu.x, y: nu.y, poly: clipCell(nu, paintGrid.near(nu.x, nu.y), roomSpacing * 3) }));

  return { W, H, wallSpacing, roomSpacing, roomSize, band, loops, roomSeeds, roomCells, adjEdges, doors, wallNuclei, floorNuclei, nuclei, paintCells };
}

