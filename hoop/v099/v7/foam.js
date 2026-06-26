// foam.js — the v7 chunking kernel. Built layer by layer, one per tap.
//
// The bet (the user's): too much was going on for a map, so v7 grows piece by piece, each layer the
// substrate the next reads. The CORE solve that drives everything is layer 1 — a PLANAR CUT THROUGH
// A 3D VORONOI FOAM. The slice of a 3D Voronoi by a plane is, exactly, a 2D POWER DIAGRAM: each 3D
// nucleus at (x,y,z) projects to (x,y) carrying an additive weight w = z² (its squared distance off
// the cut plane), and a plane point belongs to whichever projected site minimises |p−proj|²+w.
// Nuclei sitting in the plane win big cells; nuclei deep off it win small cells or none — so a slice
// gives the ORGANIC, VARIED cell sizes a flat 2D jittered grid never does. "Cells have a size", and
// the size is inherited from the third dimension we sliced through.
//
// Then: clip the foam to a CHUNK (a square or an equilateral triangle — both tile the plane cleanly,
// unlike rectangles / right triangles) with a ghost perimeter + edge ports (layer 2); PERFUSE it —
// connect the ports and measure oxygenation along the cell graph (layer 3); SEIZE cells to grow the
// concourse by HYPOXIA (capillaries sprout toward the least-served tissue — angiogenesis, which
// maximises coverage per road length and partitions tissue into bounded pockets, layer 4); paint
// ROOMS onto the oxygenated surface, one door each (layer 5); give the rooms civic character (6).
//
// Pure + deterministic (seed in → identical chunk on every machine, atproto-stable). Zero side
// effects; the page only draws what these return. Pinned by hoop/test/v7.selftest.mjs.

import { mulberry32, bucketGrid, assignZones } from '../paint/voronoi.js';
import { ROLES, ROLE_MIX, DOMAINS, makePlace } from '../econ/econ.js';

// ── LAYER 1: the base foam — a planar cut through a 3D Voronoi foam (= a 2D power diagram) ────────
//
// clipPowerCell: site A's cell on the plane, by clipping a box against the WEIGHTED bisectors
// (radical axes) with nearby sites. Identical machinery to paint's clipCell, except the cut line
// between A and B is offset from the midpoint by the weight difference: the point on the A→B line
// where A and B's power distances tie is at t = ½ + (w_B − w_A)/(2|AB|²) (t=½ recovers plain
// Voronoi). Each surviving polygon edge is LABELLED with the neighbour site that cut it, so the
// cell-adjacency graph (the Delaunay-of-the-power-diagram) falls straight out.
export function clipPowerCell(A, neighbours, R) {
  let poly = [
    { x: A.x - R, y: A.y - R, s: -1 }, { x: A.x + R, y: A.y - R, s: -1 },
    { x: A.x + R, y: A.y + R, s: -1 }, { x: A.x - R, y: A.y + R, s: -1 },
  ];
  const near = neighbours
    .map((s) => [s, (s.x - A.x) ** 2 + (s.y - A.y) ** 2])
    .filter((p) => p[1] > 1e-9).sort((a, b) => a[1] - b[1]).slice(0, 28).map((p) => p[0]);
  for (const B of near) {
    const d2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2; if (d2 < 1e-9) continue;
    const t = 0.5 + ((B.w || 0) - (A.w || 0)) / (2 * d2);     // radical-axis crossing on the A→B line
    const mx = A.x + t * (B.x - A.x), my = A.y + t * (B.y - A.y);
    const nx = A.x - B.x, ny = A.y - B.y;                     // keep the half-plane toward A (da ≥ 0)
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = (a.x - mx) * nx + (a.y - my) * ny, db = (b.x - mx) * nx + (b.y - my) * ny;
      if (da >= 0) {
        out.push(a);
        if (db < 0) { const tt = da / (da - db); out.push({ x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt, s: B.id }); }
      } else if (db >= 0) {
        const tt = da / (da - db); out.push({ x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt, s: a.s });
      }
    }
    poly = out; if (poly.length < 3) break;
  }
  return poly;
}

// The 3D nuclei live on a GLOBAL jittered lattice in WORLD space — each lattice cell (ix,iy,iz)
// gets a deterministic per-axis jitter from a hash of its index + the world seed. That's the whole
// trick behind seamless chunking: wherever a chunk lands, it slices the SAME global foam, so two
// chunks meeting at an edge see identical boundary cells (the "ghost perimeter used wholesale when
// the neighbour wakes"). gid = the lattice index string is the cell's stable cross-chunk identity.
function hashJit(ix, iy, iz, salt) {
  let h = (salt ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (ix & 0x3ffff), 2654435761); h ^= h >>> 15;
  h = Math.imul(h ^ (iy & 0x3ffff), 2246822519); h ^= h >>> 13;
  h = Math.imul(h ^ (iz & 0x3ff), 3266489917); h ^= h >>> 16;
  return ((h >>> 0) % 2048) / 2048 - 0.5;
}
export function genNuclei(region, s, D, seed) {
  const jit = 0.62, nz = Math.max(0, Math.round(D / 2 / s)), out = [];
  const ix0 = Math.floor(region.x0 / s) - 1, ix1 = Math.ceil(region.x1 / s) + 1;
  const iy0 = Math.floor(region.y0 / s) - 1, iy1 = Math.ceil(region.y1 / s) + 1;
  for (let iz = -nz; iz <= nz; iz++)
    for (let iy = iy0; iy <= iy1; iy++)
      for (let ix = ix0; ix <= ix1; ix++) {
        const x = (ix + 0.5 + hashJit(ix, iy, iz, seed ^ 0x11) * jit) * s;
        const y = (iy + 0.5 + hashJit(ix, iy, iz, seed ^ 0x22) * jit) * s;
        const z = (iz + hashJit(ix, iy, iz, seed ^ 0x33) * jit) * s;
        out.push({ x, y, z, w: z * z, gid: ix + '_' + iy + '_' + iz });
      }
  return out;
}

// Build (or rebuild) the foam over a set of world REGIONS (AABBs), each grown by a clip margin so
// every cell INSIDE a region is fully clipped (its neighbours are present) and therefore identical
// no matter which chunk's rebuild produced it. `cellSize` = lattice spacing; `depth` = slab depth
// in spacings (more layers ⇒ more off-plane nuclei ⇒ more cell-size variance). Cells carry a stable
// `gid`; `cellByGid` maps it to the current array index so frozen per-chunk solves survive a rebuild.
export function buildFoam({ regions, cellSize = 26, depth = 2.4, seed = 1, W, H } = {}) {
  const s = Math.max(6, cellSize), D = s * Math.max(1, depth), margin = s * 4;
  if (!regions) regions = [{ x0: 0, y0: 0, x1: W, y1: H }];
  const byGid = new Map();
  for (const r of regions) for (const nu of genNuclei({ x0: r.x0 - margin, y0: r.y0 - margin, x1: r.x1 + margin, y1: r.y1 + margin }, s, D, seed)) if (!byGid.has(nu.gid)) byGid.set(nu.gid, nu);
  const nuclei = [...byGid.values()]; nuclei.forEach((nu, i) => { nu.id = i; });
  const grid = bucketGrid(nuclei, s * 1.7);
  const cells = [], keep = new Map();
  for (const nu of nuclei) { const poly = clipPowerCell(nu, grid.near(nu.x, nu.y), s * 3); if (poly.length < 3) continue; keep.set(nu.id, cells.length); cells.push({ id: cells.length, src: nu.id, gid: nu.gid, x: nu.x, y: nu.y, z: nu.z, w: nu.w, poly, area: polyArea(poly) }); }
  const adjSet = cells.map(() => new Set());
  for (const c of cells) for (const v of c.poly) { if (v.s < 0) continue; const j = keep.get(v.s); if (j == null || j === c.id) continue; adjSet[c.id].add(j); adjSet[j].add(c.id); }
  const edges = [], seenE = new Set();
  for (let i = 0; i < cells.length; i++) for (const j of adjSet[i]) { if (j <= i) continue; const k = i + ',' + j; if (seenE.has(k)) continue; seenE.add(k); edges.push({ a: i, b: j, len: Math.hypot(cells[i].x - cells[j].x, cells[i].y - cells[j].y) }); }
  const adj = cells.map((_, i) => [...adjSet[i]]);
  const cellByGid = new Map(cells.map((c) => [c.gid, c.id]));
  return { regions, cellSize: s, depth: D, seed, cells, edges, adj, cellByGid, nucleiCount: nuclei.length, W, H };
}
// canvas-rooted convenience: one region covering [0,W]×[0,H] (the single-chunk demo + tests use this)
export function baseFoam({ W, H, cellSize = 26, depth = 2.4, seed = 1 }) {
  return buildFoam({ regions: [{ x0: 0, y0: 0, x1: W, y1: H }], cellSize, depth, seed, W, H });
}

function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; } return Math.abs(a) / 2; }
export function centroid(cells, list) { let x = 0, y = 0; for (const i of list) { x += cells[i].x; y += cells[i].y; } const n = list.length || 1; return { x: x / n, y: y / n }; }

// ── LAYER 2: the chunk — boundary conditions done right ─────────────────────────────────────────
// A chunk is a dice-roll between a SQUARE and an EQUILATERAL TRIANGLE: both tile the plane cleanly
// (rectangles and right triangles tile worse and were the source of the old navigation pain). The
// foam covers the whole canvas; the chunk shape is inscribed, and every cell whose centroid lands
// OUTSIDE it becomes a GHOST — not shown as a room, but kept to bound the edge-cells and woken
// wholesale when the neighbour chunk loads. Each chunk edge gets 1–4 CONCOURSE PORTS at Monte-Carlo
// positions — the cross-chunk movement points the solve must connect and perfuse from.
export function defineChunk(foam, { seed = 1, poly = null, inherit = [], shape: want = null, portRange = [1, 4], sideOf = null } = {}) {
  const rng = mulberry32((seed ^ 0xc40c) >>> 0);
  let shape;
  if (!poly) {
    const { W, H } = foam, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.43, k = R * Math.sqrt(3) / 2;
    shape = want || (rng() < 0.5 ? 'square' : 'triangle');
    if (shape === 'square') { const h = R * 0.92; poly = [{ x: cx - h, y: cy - h }, { x: cx + h, y: cy - h }, { x: cx + h, y: cy + h }, { x: cx - h, y: cy + h }]; }
    else if (shape === 'hex') { const Rh = Math.min(W, H) * 0.46; poly = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; poly.push({ x: cx + Rh * Math.cos(a), y: cy + Rh * Math.sin(a) }); } }   // flat-top regular hexagon — its gentler 120° corners mean fewer skinny edge rooms, and it still tiles by reflection
    else if (rng() < 0.5) poly = [{ x: cx, y: cy - R }, { x: cx + k, y: cy + R / 2 }, { x: cx - k, y: cy + R / 2 }];   // point-up triangle
    else poly = [{ x: cx, y: cy + R }, { x: cx - k, y: cy - R / 2 }, { x: cx + k, y: cy - R / 2 }];                    // point-down triangle
  } else shape = poly.length === 4 ? 'square' : poly.length === 6 ? 'hex' : 'triangle';
  const inside = (x, y) => pointInPoly(x, y, poly);
  const ghost = new Uint8Array(foam.cells.length);
  for (const c of foam.cells) if (!inside(c.x, c.y)) ghost[c.id] = 1;
  const interior = foam.cells.filter((c) => !ghost[c.id]).map((c) => c.id);
  const grid = bucketGrid(interior.map((id) => foam.cells[id]), foam.cellSize * 2);
  const nearestInterior = (px, py) => { let best = -1, bd = Infinity; for (const c of grid.near(px, py)) { const d = (c.x - px) ** 2 + (c.y - py) ** 2; if (d < bd) { bd = d; best = c.id; } } return best; };
  const nearestEdge = (px, py) => { let be = 0, bd = Infinity; for (let e = 0; e < poly.length; e++) { const d = ptSegDist(px, py, poly[e], poly[(e + 1) % poly.length]); if (d < bd) { bd = d; be = e; } } return be; };
  const ports = [], edgeHasPort = new Set();
  // INHERITED ports first — the shared edge's crossing points, reused from the neighbour so the
  // concourse meets across the seam (each binds to THIS chunk's nearest cell, adjacent across the edge)
  for (const ip of inherit) { const cell = nearestInterior(ip.x, ip.y); if (cell < 0) continue; const e = nearestEdge(ip.x, ip.y); ports.push({ edge: e, x: ip.x, y: ip.y, cell, inherited: true }); edgeHasPort.add(e); }
  // fresh ports — `portRange` [min,max] ports PER SIDE (direction). Group the polygon edges into sides:
  // default, each edge is its own side (a regular hex → 6). A tessellation shape passes `sideOf` (one
  // side index per edge) so its many boundary segments collapse to the original 6 directions — ports are
  // then allocated PER DIRECTION, spread along that side's arc length, not per segment.
  const pr0 = portRange[0] | 0, pr1 = Math.max(pr0, portRange[1] | 0);
  const groups = new Map();
  for (let e = 0; e < poly.length; e++) { const s = sideOf ? (sideOf[e] == null ? e : sideOf[e]) : e; let g = groups.get(s); if (!g) { g = []; groups.set(s, g); } g.push(e); }
  for (const es of groups.values()) {
    if (es.some((e) => edgeHasPort.has(e))) continue;                 // a side that inherited a port needs no fresh ones
    const pts = [poly[es[0]]]; for (const e of es) pts.push(poly[(e + 1) % poly.length]);   // the side's polyline
    const segLen = [], cum = [0]; let total = 0;
    for (let i = 0; i < pts.length - 1; i++) { const L = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); segLen.push(L); total += L; cum.push(total); }
    const n = pr0 + Math.floor(rng() * (pr1 - pr0 + 1));
    for (let i = 0; i < n; i++) {
      const target = ((i + 0.5 + (rng() - 0.5) * 0.6) / n) * total;
      let si = 0; while (si < segLen.length - 1 && cum[si + 1] < target) si++;
      const lt = segLen[si] ? (target - cum[si]) / segLen[si] : 0.5;
      const px = pts[si].x + (pts[si + 1].x - pts[si].x) * lt, py = pts[si].y + (pts[si + 1].y - pts[si].y) * lt, cell = nearestInterior(px, py);
      if (cell >= 0 && !ports.some((p) => p.cell === cell)) ports.push({ edge: es[si], x: px, y: py, cell });
    }
  }
  // rim = interior cells touching the chunk boundary (adjacent to a ghost). The concourse is kept
  // OFF the rim except at port cells, so chunk-to-chunk crossing happens ONLY at the ports — the
  // concourse is forced inward instead of riding the seam.
  const rim = new Uint8Array(foam.cells.length), portCells = new Set(ports.map((p) => p.cell));
  for (const cid of interior) if (foam.adj[cid].some((v) => ghost[v])) rim[cid] = 1;
  return { shape, poly, ghost, ports, interior, interiorCount: interior.length, rim, portCells };
}
// may a cell carry concourse? everywhere interior except the boundary rim — but always at a port.
function canRoad(chunk, cid) { return !chunk.rim || !chunk.rim[cid] || (chunk.portCells && chunk.portCells.has(cid)); }
// reflect a polygon across one of its edges → the adjacent chunk that shares that edge (squares beget
// squares, equilateral triangles beget their flipped neighbour — both tile the plane).
export function reflectPolyAcrossEdge(poly, ei) {
  const a = poly[ei], b = poly[(ei + 1) % poly.length], dx = b.x - a.x, dy = b.y - a.y, dd = dx * dx + dy * dy || 1;
  return poly.map((p) => { const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / dd, px = a.x + t * dx, py = a.y + t * dy; return { x: 2 * px - p.x, y: 2 * py - p.y }; });
}
function ptSegDist(px, py, a, b) { const dx = b.x - a.x, dy = b.y - a.y, dd = dx * dx + dy * dy || 1; let t = ((px - a.x) * dx + (py - a.y) * dy) / dd; t = Math.max(0, Math.min(1, t)); const cx = a.x + t * dx, cy = a.y + t * dy; return Math.hypot(px - cx, py - cy); }
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// multi-source BFS over the interior cell graph from the current concourse `road`. dist = hops to
// the nearest concourse cell (−1 = ghost / unreached); from = predecessor toward the concourse.
function perfuseField(foam, chunk, road) {
  const N = foam.cells.length, dist = new Int32Array(N).fill(-1), from = new Int32Array(N).fill(-1), q = [];
  for (let i = 0; i < N; i++) if (road[i] && !chunk.ghost[i]) { dist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of foam.adj[u]) { if (chunk.ghost[v] || dist[v] >= 0) continue; dist[v] = dist[u] + 1; from[v] = u; q.push(v); } }
  return { dist, from };
}
// BFS shortest path between two interior cells (used to wire the port skeleton)
function bfsPath(foam, chunk, src, dst) {
  const from = new Map([[src, -1]]), q = [src];
  for (let h = 0; h < q.length; h++) { const u = q[h]; if (u === dst) break; for (const v of foam.adj[u]) { if (chunk.ghost[v] || from.has(v)) continue; from.set(v, u); q.push(v); } }
  if (!from.has(dst)) return null; const path = []; for (let u = dst; u !== -1; u = from.get(u)) path.push(u); return path;
}

// ── LAYER 3: perfuse — connect the ports, then measure oxygenation along the cell graph ─────────
// Travel along edges: link every port into one concourse skeleton (so the chunk is traversable
// edge-to-edge), then BFS the oxygenation field — each tissue cell's hop-distance to the nearest
// concourse. `oxygenReach` is the diffusion depth: a cell is SERVED if within it. The skeleton alone
// barely perfuses anything (a thin artery), which is exactly the readout that motivates layer 4.
export function perfuse(foam, chunk, { oxygenReach = 3 } = {}) {
  const N = foam.cells.length, road = new Uint8Array(N);
  const ports = chunk.ports.map((p) => p.cell).filter((c) => !chunk.ghost[c]);
  if (ports.length) {
    road[ports[0]] = 1;
    const RIMPEN = 8;                       // connect ports by a path that PENALISES the rim, so the
    for (let i = 1; i < ports.length; i++) {  // skeleton dives inward instead of riding the seam — yet a
      const src = ports[i];                   // port buried behind a thick rim can still escape (at cost)
      const dist = new Map([[src, 0]]), from = new Map([[src, -1]]), done = new Set(), heap = [[0, src]];
      const push = (d, c) => { heap.push([d, c]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break;[heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
      const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let k = 0; for (;;) { const L = 2 * k + 1, R = L + 1; let m = k; if (L < heap.length && heap[L][0] < heap[m][0]) m = L; if (R < heap.length && heap[R][0] < heap[m][0]) m = R; if (m === k) break;[heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return t; };
      let hit = -1;
      while (heap.length) { const [d, u] = pop(); if (done.has(u)) continue; done.add(u); if (road[u]) { hit = u; break; } for (const v of foam.adj[u]) { if (chunk.ghost[v] || done.has(v)) continue; const nd = d + (canRoad(chunk, v) ? 1 : RIMPEN); if (!dist.has(v) || nd < dist.get(v)) { dist.set(v, nd); from.set(v, u); push(nd, v); } } }
      if (hit < 0) { road[src] = 1; continue; }
      for (let u = hit; u !== -1; u = from.get(u)) road[u] = 1;
    }
  }
  const { dist } = perfuseField(foam, chunk, road);
  return measure(foam, chunk, road, dist, oxygenReach, []);
}
function measure(foam, chunk, road, dist, reach, addOrder) {
  let roadCells = 0, hypoxic = 0, sumDepth = 0;
  for (const i of chunk.interior) { if (road[i]) { roadCells++; continue; } const d = dist[i] < 0 ? 1e6 : dist[i]; sumDepth += Math.min(d, 99); if (d > reach) hypoxic++; }
  const tissue = chunk.interiorCount - roadCells;
  return { road, dist, addOrder, oxygenReach: reach,
    servedFrac: chunk.interiorCount ? 1 - hypoxic / chunk.interiorCount : 1,
    stats: { roadCells, hypoxic, tissue, avgDepth: tissue ? sumDepth / tissue : 0, roadFrac: chunk.interiorCount ? roadCells / chunk.interiorCount : 0 } };
}

// ── LAYER 4: seize — grow the concourse by HYPOXIA (the road builder that isn't econ's) ─────────
// econ grows desire-lines from a society's trips; here there's no society yet — the chunk just has
// to be TRAVERSABLE and well-PERFUSED. So this is angiogenesis: repeatedly find the most under-served
// tissue cell (the deepest hypoxia), sprout a capillary toward it along the cell graph, and stop
// `oxygenReach` short (no need to pave all the way — the diffusion ball does the rest). Capillaries
// branch, space-fill, and partition the tissue into bounded pockets — which is what gives layer 5
// real rooms instead of one giant blob. Optimises coverage per road length by construction: each
// sprout brings a whole diffusion-ball of new tissue online for the length of one capillary.
export function seize(foam, chunk, { oxygenReach = 3, concourseWidth = 1, maxFrac = 0.5, seed = 1 } = {}) {
  const per = perfuse(foam, chunk, { oxygenReach });
  const road = per.road.slice();
  let { dist } = perfuseField(foam, chunk, road);
  const reach = oxygenReach, addOrder = [], sprouts = [], blocked = new Set();
  let roadCells = per.stats.roadCells, guard = 0;
  const maxRoad = maxFrac * chunk.interiorCount;
  while (guard++ < 800) {
    // deepest hypoxia: the interior tissue cell with the largest distance-to-concourse (rim included —
    // rim tissue still needs oxygen; it just gets it from an interior capillary, not from rim road)
    let u = -1, md = reach;
    for (const i of chunk.interior) { if (road[i] || blocked.has(i)) continue; const d = dist[i]; if (d > md) { md = d; u = i; } }
    if (u < 0 || roadCells >= maxRoad) break;
    // grow a capillary toward u over CANROAD cells only (so the whole sprout is pavable and stays
    // connected to the body), leaving a `reach`-deep stub of tissue near u for the diffusion ball.
    const par = new Map([[u, -1]]), q = [u]; let roadHit = -1;
    for (let h = 0; h < q.length && roadHit < 0; h++) { const c = q[h]; if (road[c]) { roadHit = c; break; } for (const v of foam.adj[c]) { if (chunk.ghost[v] || par.has(v) || (!canRoad(chunk, v) && v !== u)) continue; par.set(v, c); q.push(v); } }
    if (roadHit < 0) { blocked.add(u); continue; }
    const path = []; for (let c = roadHit; c !== -1; c = par.get(c)) path.push(c);   // path[0]=road … path[end]=u
    const added = [];
    for (let k = 1; k < path.length - reach; k++) { const c = path[k]; if (!road[c] && canRoad(chunk, c)) { road[c] = 1; roadCells++; added.push(c); } }
    if (!added.length) { blocked.add(u); continue; }
    addOrder.push(...added); sprouts.push(added);
    ({ dist } = perfuseField(foam, chunk, road));
  }
  // a SINGLE connected concourse is a core need — stitch any stray capillary back to the main body
  // before widening (the bare hypoxia growth always attaches sprouts to existing road, but isolated
  // ports / boundary slivers can still strand a fragment; this makes one-component a hard guarantee).
  stitchConcourse(foam, chunk, road);
  // concourse width: widen the 1-cell capillaries SINGLE-SIDED (one extra cell-layer per width step,
  // on one flank only — not the old both-sides dilation that made "2" read as ~4 wide).
  const widened = widenOneSided(foam, chunk, road, Math.max(0, concourseWidth - 1));
  for (const i of widened) { void i; roadCells++; }
  if (widened.length) addOrder.push(...widened);
  ({ dist } = perfuseField(foam, chunk, road));
  const out = measure(foam, chunk, road, dist, reach, addOrder);
  out.sprouts = sprouts.length; out.widened = widened.length; return out;
}

// connect every stray concourse fragment to the largest one along the cheapest interior path, so the
// concourse is a single connected component (walkable end to end).
function stitchConcourse(foam, chunk, road) {
  for (let pass = 0; pass < 4; pass++) {
    const comp = new Int32Array(foam.cells.length).fill(-1), sizes = []; let nc = 0;
    for (const i of chunk.interior) { if (!road[i] || comp[i] >= 0) continue; const q = [i]; comp[i] = nc; let s = 0; while (q.length) { const u = q.pop(); s++; for (const v of foam.adj[u]) if (road[v] && comp[v] < 0) { comp[v] = nc; q.push(v); } } sizes.push(s); nc++; }
    if (nc <= 1) return;
    const main = sizes.indexOf(Math.max(...sizes));
    const dist = new Int32Array(foam.cells.length).fill(-1), from = new Int32Array(foam.cells.length).fill(-1), q = [];
    for (const i of chunk.interior) if (road[i] && comp[i] === main) { dist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of foam.adj[u]) { if (chunk.ghost[v] || dist[v] >= 0 || !canRoad(chunk, v)) continue; dist[v] = dist[u] + 1; from[v] = u; q.push(v); } }
    const reps = new Map();   // nearest cell of each non-main fragment to the main body
    for (const i of chunk.interior) if (road[i] && comp[i] !== main && dist[i] >= 0) { const r = reps.get(comp[i]); if (!r || dist[i] < r.d) reps.set(comp[i], { cell: i, d: dist[i] }); }
    if (!reps.size) return;
    for (const { cell } of reps.values()) for (let u = cell; u !== -1 && comp[u] !== main; u = from[u]) road[u] = 1;
  }
}

// SINGLE-HEADED widening: grow the concourse by `layers` one-cell layers, each on ONE flank only.
// For each concourse cell we estimate the local tangent (along the capillary) and absorb only the
// tissue neighbours on its left normal — so width N reads as ~N cells, not the 2N of both-sided.
function widenOneSided(foam, chunk, road, layers) {
  const added = [];
  for (let L = 0; L < layers; L++) {
    const adds = [];
    for (const r of chunk.interior) {
      if (!road[r]) continue;
      const t = roadTangent(foam, road, r), nx = -t.y, ny = t.x;
      for (const f of foam.adj[r]) { if (road[f] || chunk.ghost[f] || !canRoad(chunk, f)) continue; const dx = foam.cells[f].x - foam.cells[r].x, dy = foam.cells[f].y - foam.cells[r].y; if (dx * nx + dy * ny > 0) adds.push(f); }
    }
    for (const f of adds) if (!road[f]) { road[f] = 1; added.push(f); }
  }
  return added;
}
function roadTangent(foam, road, r) {
  const rn = foam.adj[r].filter((v) => road[v]).map((v) => ({ x: foam.cells[v].x - foam.cells[r].x, y: foam.cells[v].y - foam.cells[r].y }));
  if (!rn.length) return { x: 1, y: 0 };
  const norm = (v) => { const m = Math.hypot(v.x, v.y) || 1; return { x: v.x / m, y: v.y / m }; };
  if (rn.length === 1) return norm(rn[0]);
  let best = [rn[0], rn[1]], bd = 2;        // the most-opposed pair of road neighbours ≈ the capillary axis
  for (let a = 0; a < rn.length; a++) for (let b = a + 1; b < rn.length; b++) { const A = norm(rn[a]), B = norm(rn[b]), dot = A.x * B.x + A.y * B.y; if (dot < bd) { bd = dot; best = [rn[a], rn[b]]; } }
  return norm({ x: best[0].x - best[1].x, y: best[0].y - best[1].y });
}

// ── LAYER 5: rooms — paint rooms on the oxygenated surface, one door each ───────────────────────
// The capillary bed has partitioned the tissue into connected POCKETS. Each pocket is a room; a
// pocket bigger than the room-size knob is subdivided (graph-Voronoi within the pocket). Every pocket
// borders the concourse (that's what perfusion guarantees), so every room gets exactly ONE door —
// the room cell touching the concourse nearest the room's centre; all its other concourse-borders
// stay walls. Pathfinding is then trivial: every trip is room → its door → concourse → door → room.
// Draw a role from the canonical ROLE_MIX (module-level cousin of castCharacter's local pickRole),
// used by the optional traffic-sizing path to weight a sub-room's footprint by its role.
function drawRole(rng, mix = ROLE_MIX) { const tot = mix.reduce((s, m) => s + m[1], 0); let r = rng() * tot; for (const [k, w] of mix) { r -= w; if (r <= 0) return k; } return 'dwell'; }

// `footprint` (optional, v091): a role→weight map. When given, a big pocket is split into rooms whose
// CELL COUNTS are proportional to a per-role footprint (a traffic proxy) instead of being equal, and
// each room carries the role it was sized for (castCharacter honours it). Omitted ⇒ identical to before.
// `grand`/`grandMin`: plant one grand role as the anchor of any pocket ≥ grandMin room-units.
// `minRoom`: bulldoze rooms smaller than this many cells (merge into a neighbour / back to concourse).
export function paintRooms(foam, chunk, solve, { roomSize = 10, seed = 1, footprint = null, grand = null, grandMin = 3, minRoom = 0, roleMix = null } = {}) {
  const road = solve.road, N = foam.cells.length;
  const comp = new Int32Array(N).fill(-1), rooms = [];
  // tissue = interior, non-concourse, and REACHABLE from the concourse. Excluding unreachable cells
  // (slivers the ghost boundary cut off from the network) is what guarantees every room a door: a
  // reachable pocket connects to the concourse, so its boundary always has a concourse-adjacent cell.
  const tissue = (i) => !chunk.ghost[i] && !road[i] && solve.dist[i] >= 0;
  let cc = 0;
  for (const start of chunk.interior) {
    if (!tissue(start) || comp[start] >= 0) continue;
    const members = [], q = [start]; comp[start] = cc;
    for (let h = 0; h < q.length; h++) { const u = q[h]; members.push(u); for (const v of foam.adj[u]) if (tissue(v) && comp[v] < 0) { comp[v] = cc; q.push(v); } }
    cc++;
    if (members.length > roomSize * 1.6) {
      // subdivide this pocket into rooms (graph-Voronoi within the pocket)
      const idx = new Map(members.map((m, i) => [m, i])), subEdges = [];
      for (const m of members) for (const v of foam.adj[m]) if (idx.has(v) && v > m) subEdges.push({ a: idx.get(m), b: idx.get(v) });
      let weights, roles = null;
      if (footprint) {
        // TRAFFIC SIZING (v091): draw a role per sub-room and weight its size by the role's footprint,
        // so busy rooms claim more cells than quiet ones. Draw until the footprints fill the pocket
        // (≈ members/roomSize "units"); carry each role onto its room for castCharacter to honour.
        const rrng = mulberry32((seed ^ (cc * 0x9e37) ^ 0x5151) >>> 0), target = members.length / roomSize;
        roles = []; weights = []; let acc = 0;
        if (grand && grand.length && target >= grandMin) {
          // GRAND ANCHOR: a big pocket gets one civic centrepiece, weighted toward the grandest role.
          const tot = grand.reduce((s, r) => s + (footprint[r] || 1), 0); let x = rrng() * tot, pick = grand[0];
          for (const r of grand) { x -= (footprint[r] || 1); if (x <= 0) { pick = r; break; } }
          roles.push(pick); const w = footprint[pick] || 1; weights.push(w); acc += w;
        }
        do { const role = drawRole(rrng, roleMix || ROLE_MIX), w = footprint[role] || 1; roles.push(role); weights.push(w); acc += w; } while (acc < target && roles.length < members.length);
      } else {
        const k = Math.max(1, Math.round(members.length / roomSize)); weights = new Array(k).fill(1);
      }
      const sub = assignZones(members.length, subEdges, weights, (seed ^ (cc * 0x9e37)) >>> 0);
      const buckets = Array.from({ length: weights.length }, () => []);
      sub.forEach((z, i) => { if (z >= 0 && z < weights.length) buckets[z].push(members[i]); });
      buckets.forEach((mem, zi) => { if (mem.length) rooms.push(roles ? { cells: mem, role: roles[zi] } : { cells: mem }); });
    } else rooms.push({ cells: members });
  }
  // door pass: the room cell touching the concourse nearest the room centre (its only door)
  const roomOf = new Int32Array(N).fill(-1);
  rooms.forEach((r, id) => { r.id = id; const ctr = centroid(foam.cells, r.cells); r.x = ctr.x; r.y = ctr.y; r.cells.forEach((c) => { roomOf[c] = id; }); });
  const assignDoor = (r) => { let door = -1, doorRoad = -1, bd = Infinity; for (const c of r.cells) for (const v of foam.adj[c]) if (road[v]) { const d = (foam.cells[c].x - r.x) ** 2 + (foam.cells[c].y - r.y) ** 2; if (d < bd) { bd = d; door = c; doorRoad = v; } } r.door = door; r.doorRoad = doorRoad; };
  rooms.forEach(assignDoor);

  // inner sub-rooms (born of subdividing a big pocket) may not touch the concourse — send a short
  // concourse SPUR to reach them, so the one-door-per-room-to-the-concourse invariant always holds.
  for (const r of rooms) {
    if (r.door >= 0) continue;
    const par = new Map(); const q = []; for (const c of r.cells) { par.set(c, -1); q.push(c); }
    let roadHit = -1;
    for (let h = 0; h < q.length && roadHit < 0; h++) { const u = q[h]; for (const v of foam.adj[u]) { if (chunk.ghost[v] || par.has(v)) continue; par.set(v, u); if (road[v]) { roadHit = v; break; } q.push(v); } }
    if (roadHit < 0) continue;
    let v = par.get(roadHit), last = roadHit;            // convert the spur (tissue between room & concourse)
    while (v >= 0 && roomOf[v] !== r.id) { road[v] = 1; roomOf[v] = -1; last = v; v = par.get(v); }
    r.door = v; r.doorRoad = last;
  }
  // bulldoze MICRO-ROOMS (v091, opt-in via minRoom): a room under `minRoom` cells is too small to seat
  // a fixture, so merge it into its largest adjacent room — or, if it only borders the concourse, hand
  // its cells back to the concourse. Iterates (capped) so absorbing one runt can't leave another behind.
  if (minRoom > 0) {
    let again = true, guard = 0;
    while (again && guard++ < 64) {
      again = false;
      const cnt = new Int32Array(rooms.length);
      for (const i of chunk.interior) { const z = roomOf[i]; if (z >= 0 && z < rooms.length) cnt[z]++; }
      for (let id = 0; id < rooms.length; id++) {
        if (cnt[id] === 0 || cnt[id] >= minRoom) continue;
        const mine = []; for (const i of chunk.interior) if (roomOf[i] === id) mine.push(i);
        const nb = new Map(); let roadHit = false;
        for (const c of mine) for (const v of foam.adj[c]) { const z = roomOf[v]; if (z === id) continue; if (z >= 0) nb.set(z, (nb.get(z) || 0) + 1); else if (road[v]) roadHit = true; }
        let bz = -1, bc = -1; for (const [z, n] of nb) if (n > bc) { bc = n; bz = z; }
        if (bz >= 0) { for (const c of mine) roomOf[c] = bz; again = true; }
        else if (roadHit) { for (const c of mine) { road[c] = 1; roomOf[c] = -1; } again = true; }
      }
    }
  }
  // recompact: spurs stole cells from their old rooms, so rebuild membership + drop emptied rooms
  const cellsOf = rooms.map(() => []);
  for (const i of chunk.interior) { const z = roomOf[i]; if (z >= 0 && z < rooms.length) cellsOf[z].push(i); }
  rooms.forEach((r, id) => { r.cells = cellsOf[id]; });
  const live = rooms.filter((r) => r.cells.length);
  const roomOf2 = new Int32Array(N).fill(-1);
  live.forEach((r, id) => { r.id = id; const ctr = centroid(foam.cells, r.cells); r.x = ctr.x; r.y = ctr.y; r.cells.forEach((c) => { roomOf2[c] = id; }); if (r.door >= 0 && roomOf2[r.door] !== id) assignDoor(r); });
  const doored = live.filter((r) => r.door >= 0).length;
  return { rooms: live, roomOf: roomOf2, road, stats: { rooms: live.length, doored, avgCells: live.length ? live.reduce((s, r) => s + r.cells.length, 0) / live.length : 0 } };
}

// ── LAYER 6: character — the civic layer (econ ROLES) sampled onto the rooms ─────────────────────
const NAMES = ['Jim', 'Mara', 'Otto', 'Lena', 'Cy', 'Wren', 'Bo', 'Ada', 'Tomas', 'Ines', 'Hal', 'Rosa', 'Gus', 'Pia', 'Ned', 'Suki', 'Cole', 'Mir', 'Vale', 'Ruth'];
export function castCharacter(rooms, { seed = 1, household = 3, roleMix = null } = {}) {
  const rng = mulberry32((seed ^ 0x21e6) >>> 0);
  const mix = roleMix || ROLE_MIX, tot = mix.reduce((s, m) => s + m[1], 0);
  const pickRole = () => { let r = rng() * tot; for (const [k, w] of mix) { r -= w; if (r <= 0) return k; } return 'dwell'; };
  const out = rooms.map((room) => {
    const role = room.role || pickRole(), R = ROLES[role], dom = R.dom ? DOMAINS[Math.floor(rng() * DOMAINS.length)] : null, pl = makePlace(room.id, role, dom);
    const people = [];
    if (role === 'dwell') { const n = 1 + Math.floor(rng() * (2 * household - 1)); for (let k = 0; k < n; k++) people.push(NAMES[Math.floor(rng() * NAMES.length)]); }
    return { ...room, role, domain: pl.domain, glyph: pl.glyph, color: pl.color, tier: pl.tier, people };
  });
  const counts = {}; for (const r of out) counts[r.role] = (counts[r.role] || 0) + 1;
  return { rooms: out, counts };
}
