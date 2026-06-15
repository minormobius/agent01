// foam.js — the v7 chunking kernel. Six pure, deterministic steps, one per tap.
//
// The bet (the user's): too much was going on for a map. So v7 is built layer by layer, each layer
// the substrate the next reads. The CORE solve that drives everything is layer 1 — a PLANAR CUT
// THROUGH A 3D VORONOI FOAM. The slice of a 3D Voronoi by a plane is, exactly, a 2D POWER DIAGRAM:
// each 3D nucleus at (x,y,z) projects to (x,y) carrying an additive weight w = z² (its squared
// distance off the cut plane), and the plane point belongs to whichever projected site minimises
// |p−proj|²+w. Nuclei sitting in the plane win big cells; nuclei deep off it win small cells or
// none — so a slice gives the ORGANIC, VARIED cell sizes a flat 2D jittered grid never does. That
// variance is the whole point: "cells have a size", and the size is inherited from the third
// dimension we sliced through.
//
// Everything downstream is graph work over those cells: agglomerate cells → rooms (layer 2), set a
// narrower concourse grain (layer 3), clip to a chunk + seed a ghost perimeter + drop edge ports
// (layer 4), GROW the concourse with Physarum between the Monte-Carlo ports and seed rooms off the
// dispersed phase (layer 5), then hand the rooms civic character (layer 6).
//
// Pure + deterministic (seed in → identical chunk on every machine, atproto-stable). Zero side
// effects; the page only draws what these return. Pinned by hoop/test/v7.selftest.mjs.

import { mulberry32, bucketGrid, assignZones } from '../paint/voronoi.js';
import { makeGraph, createGrower, finalizeField } from '../paint/flux.js';
import { ROLES, ROLE_MIX, DOMAINS, makePlace } from '../econ/econ.js';

// ── LAYER 1: the base foam — a planar cut through a 3D Voronoi foam (= a 2D power diagram) ────────
//
// clipPowerCell: site A's cell on the plane, by clipping a box against the WEIGHTED bisectors
// (radical axes) with nearby sites. Identical machinery to paint's clipCell, except the cut line
// between A and B is offset from the midpoint by the weight difference: the point on the A→B line
// where A and B's power distances tie is at t = ½ + (w_B − w_A)/(2|AB|²) (t=½ recovers plain
// Voronoi). Each surviving polygon edge is LABELLED with the neighbour site that cut it, so the
// cell-adjacency graph (the Delaunay-of-the-power-diagram) falls straight out — no fuzzy
// shared-edge hashing.
export function clipPowerCell(A, neighbours, R) {
  // poly vertices carry `s`: the site id of the edge LEAVING this vertex (-1 = the clip-box frame)
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

// Build the base foam: scatter 3D nuclei in a W×H×depth box on a jittered lattice, slice at z=0.
// `cellSize` is the 3D lattice spacing (cell scale). `depth` is the slab thickness in spacings —
// more layers ⇒ more nuclei lurking off-plane ⇒ more size variance (the "size variance" knob). The
// slice keeps only nuclei whose cell actually meets the plane (a non-degenerate polygon).
export function baseFoam({ W, H, cellSize = 26, depth = 2.4, seed = 1 }) {
  const rng = mulberry32(seed >>> 0);
  const s = Math.max(6, cellSize), D = s * Math.max(1, depth), jit = 0.62;
  // 3D jittered lattice over [0,W]×[0,H]×[-D/2,D/2]; project to (x,y) with weight w = z²
  const nuclei = [];
  for (let gz = -D / 2 + s / 2; gz < D / 2; gz += s)
    for (let gy = s / 2; gy < H; gy += s)
      for (let gx = s / 2; gx < W; gx += s) {
        const x = gx + (rng() - 0.5) * jit * s, y = gy + (rng() - 0.5) * jit * s, z = gz + (rng() - 0.5) * jit * s;
        nuclei.push({ x, y, z, w: z * z });
      }
  const grid = bucketGrid(nuclei, s * 1.7);
  // power-clip every nucleus; keep the ones whose cell meets the plane → the slice cells
  const raw = [];
  for (const nu of nuclei) {
    nu.id = raw.length;                                       // provisional id for adjacency labels
    raw.push(nu);
  }
  // re-key ids onto the bucket points too (bucketGrid stored references, so id is visible there)
  const cells = [];
  const keep = new Int32Array(raw.length).fill(-1);
  for (const nu of raw) {
    const poly = clipPowerCell(nu, grid.near(nu.x, nu.y), s * 3);
    if (poly.length < 3) continue;
    keep[nu.id] = cells.length;
    cells.push({ id: cells.length, src: nu.id, x: nu.x, y: nu.y, z: nu.z, w: nu.w, poly, area: polyArea(poly) });
  }
  // cell-adjacency graph from the edge labels (src ids → kept cell ids), symmetric, with travel len
  const adjSet = cells.map(() => new Set());
  for (const c of cells) for (const v of c.poly) {
    if (v.s < 0) continue; const j = keep[v.s]; if (j < 0 || j === c.id) continue;
    adjSet[c.id].add(j); adjSet[j].add(c.id);
  }
  const edges = [], seenE = new Set();
  for (let i = 0; i < cells.length; i++) for (const j of adjSet[i]) {
    if (j <= i) continue; const k = i + ',' + j; if (seenE.has(k)) continue; seenE.add(k);
    edges.push({ a: i, b: j, len: Math.hypot(cells[i].x - cells[j].x, cells[i].y - cells[j].y) });
  }
  const adj = cells.map((_, i) => [...adjSet[i]]);
  return { W, H, cellSize: s, depth: D, seed, cells, edges, adj, nucleiCount: nuclei.length };
}

function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; } return Math.abs(a) / 2; }
export function centroid(cells, list) { let x = 0, y = 0; for (const i of list) { x += cells[i].x; y += cells[i].y; } const n = list.length || 1; return { x: x / n, y: y / n }; }

// ── LAYER 2: rooms — agglomerate cells into room-sized clumps (graph-Voronoi) ───────────────────
// `roomSize` = target cells per room. assignZones grows that many well-spread connected clumps over
// the cell graph. Returns roomOf[cellId] + the rooms (members + centroid). This is where we discover
// what a room "wants" to be: the realised avg cells/room comes back in `avgCells`.
export function growRooms(foam, { roomSize = 8, seed = 1 } = {}) {
  const N = foam.cells.length;
  const nRooms = Math.max(1, Math.round(N / Math.max(1, roomSize)));
  const roomOf = assignZones(N, foam.edges, new Array(nRooms).fill(1), seed >>> 0);
  return packRooms(foam, roomOf, nRooms);
}
function packRooms(foam, roomOf, nRooms) {
  const members = Array.from({ length: nRooms }, () => []);
  for (let i = 0; i < roomOf.length; i++) { const z = roomOf[i]; if (z >= 0 && z < nRooms) members[z].push(i); }
  const rooms = [], remap = new Int32Array(nRooms).fill(-1);
  for (let z = 0; z < nRooms; z++) { if (!members[z].length) continue; const c = centroid(foam.cells, members[z]); remap[z] = rooms.length; rooms.push({ id: rooms.length, cells: members[z], x: c.x, y: c.y }); }
  const room2 = roomOf.map((z) => (z >= 0 ? remap[z] : -1));
  const avgCells = rooms.length ? roomOf.filter((z) => z >= 0).length / rooms.length : 0;
  return { roomOf: room2, rooms, avgCells };
}

// ── LAYER 3: concourse grain — the (narrower) cell-width a concourse will occupy ─────────────────
// Concourses should be narrower than rooms (the user's intuition → a separate slider). This previews
// that grain by agglomerating at the concourse scale so the page can show how wide a concourse reads
// next to a room, and it derives the solve's road parameters: a narrower concourse ⇒ less floor given
// to road (lower roadFrac) and a tighter, more tree-like field (higher μ).
export function concourseGrain(foam, { roomSize = 8, concourseWidth = 3, seed = 1 } = {}) {
  const N = foam.cells.length;
  const w = Math.max(1, Math.min(roomSize, concourseWidth));
  const nGrain = Math.max(1, Math.round(N / w));
  const grainOf = assignZones(N, foam.edges, new Array(nGrain).fill(1), (seed ^ 0x51ed) >>> 0);
  const ratio = w / Math.max(1, roomSize);                    // concourse width as a fraction of a room
  const roadFrac = Math.max(0.06, Math.min(0.5, 0.12 + 0.30 * ratio));
  const mu = Math.max(0.55, Math.min(1.4, 1.25 - 0.7 * ratio));
  return { grainOf, nGrain, concourseWidth: w, ratio, roadFrac, mu };
}

// ── LAYER 4: the chunk — boundary conditions done right ─────────────────────────────────────────
// A chunk is a dice-roll between a SQUARE and a TRIANGLE (not rectangular-forced, not needlessly
// complex). The foam is generated over the whole canvas; the chunk shape is inset, and every cell
// whose centroid lands OUTSIDE it becomes a GHOST: not shown as a room, but kept to bound the
// edge-cells (and to be woken wholesale when the neighbour chunk loads). Each chunk edge gets 1–4
// CONCOURSE PORTS at Monte-Carlo positions — the cross-chunk movement points the solve must connect.
export function defineChunk(foam, { seed = 1, inset = 0.12 } = {}) {
  const rng = mulberry32((seed ^ 0xc40c) >>> 0);
  const { W, H } = foam;
  const m = Math.min(W, H) * inset;
  const shape = rng() < 0.5 ? 'square' : 'triangle';
  let poly;
  if (shape === 'square') {
    poly = [{ x: m, y: m }, { x: W - m, y: m }, { x: W - m, y: H - m }, { x: m, y: H - m }];
  } else {
    // an inscribed triangle, orientation jittered so chunks tile variously
    const flip = rng() < 0.5;
    poly = flip
      ? [{ x: m, y: m }, { x: W - m, y: m }, { x: W / 2, y: H - m }]
      : [{ x: W / 2, y: m }, { x: W - m, y: H - m }, { x: m, y: H - m }];
  }
  const inside = (x, y) => pointInPoly(x, y, poly);
  const ghost = new Uint8Array(foam.cells.length);
  for (const c of foam.cells) if (!inside(c.x, c.y)) ghost[c.id] = 1;
  // ports: walk each edge, drop 1–4 at random parameters; bind each to the nearest interior cell
  const grid = bucketGrid(foam.cells.filter((c) => !ghost[c.id]), foam.cellSize * 2), ports = [];
  for (let e = 0; e < poly.length; e++) {
    const a = poly[e], b = poly[(e + 1) % poly.length], k = 1 + Math.floor(rng() * 4);
    for (let i = 0; i < k; i++) {
      const t = (i + 0.5 + (rng() - 0.5) * 0.6) / k, px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
      let best = -1, bd = Infinity;
      for (const c of grid.near(px, py)) { const d = (c.x - px) ** 2 + (c.y - py) ** 2; if (d < bd) { bd = d; best = c.id; } }
      if (best >= 0) ports.push({ edge: e, x: px, y: py, cell: best });
    }
  }
  return { shape, poly, ghost, ports, interior: foam.cells.filter((c) => !ghost[c.id]).map((c) => c.id) };
}
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// ── LAYER 5: the chunk solve — grow the concourse, seed rooms off the dispersed phase ───────────
// The road builder that's NOT econ's. econ grows desire-lines from a society's trips; here there's
// no society yet — the chunk just has to be TRAVERSABLE edge-to-edge. So the demand is every pair of
// Monte-Carlo PORTS, routed with Physarum over the interior cell graph: conductance grows where
// journeys overlap, the field converges, and its superlevel set is the CONCOURSE (the dispersed
// phase). Rooms are then seeded off what's LEFT (the non-concourse cells), and each room is given
// exactly ONE door onto the concourse. Walls (cell boundaries between different owners) and doors
// and pathfinding all fall out of this one solve.
export function solveChunk(foam, chunk, grainCfg, { roomSize = 8, seed = 1, iters = 16 } = {}) {
  const interior = chunk.interior;
  const idx = new Int32Array(foam.cells.length).fill(-1);     // foam-cell id → compact interior index
  interior.forEach((cid, i) => { idx[cid] = i; });
  const n = interior.length;
  // interior-only graph
  const iedges = [];
  for (const e of foam.edges) { const a = idx[e.a], b = idx[e.b]; if (a >= 0 && b >= 0) iedges.push({ a, b, len: e.len }); }
  const graph = makeGraph(n, iedges);
  // port→port demand (all pairs of distinct port endpoint cells), the Monte-Carlo traversal forcing
  const portCells = [...new Set(chunk.ports.map((p) => idx[p.cell]).filter((i) => i >= 0))];
  const demand = [];
  for (let i = 0; i < portCells.length; i++) for (let j = i + 1; j < portCells.length; j++) demand.push({ a: portCells[i], b: portCells[j], w: 1 });
  const grower = createGrower(graph, demand, { mu: grainCfg.mu, seed });
  for (let it = 0; it < iters; it++) grower.step();
  const { isRoad: roadI } = finalizeField(graph, grower.state, { roadFrac: grainCfg.roadFrac });
  const cond = grower.state.cond;
  // lift road back to foam-cell space
  const isRoad = new Uint8Array(foam.cells.length);
  for (let i = 0; i < n; i++) if (roadI[i]) isRoad[interior[i]] = 1;

  // rooms off the dispersed phase: agglomerate the NON-road interior cells (compact subgraph)
  const roomCellIds = interior.filter((cid) => !isRoad[cid]);
  const sub = new Int32Array(foam.cells.length).fill(-1); roomCellIds.forEach((cid, i) => { sub[cid] = i; });
  const subEdges = [];
  for (const e of foam.edges) { const a = sub[e.a], b = sub[e.b]; if (a >= 0 && b >= 0) subEdges.push({ a, b }); }
  const M = roomCellIds.length, nRooms = Math.max(1, Math.round(M / Math.max(1, roomSize)));
  const subRoomOf = assignZones(M, subEdges, new Array(nRooms).fill(1), (seed ^ 0x9a17) >>> 0);
  const roomOf = new Int32Array(foam.cells.length).fill(-1);
  roomCellIds.forEach((cid, i) => { roomOf[cid] = subRoomOf[i]; });

  // pack rooms; FRONTAGE — every room must touch the concourse, else promote the shortest interior
  // hop to road (carve a stub), then give it exactly one DOOR (best-conductance road-adjacent cell).
  const members = Array.from({ length: nRooms }, () => []);
  for (const cid of roomCellIds) { const z = roomOf[cid]; if (z >= 0) members[z].push(cid); }
  const adjF = foam.adj;
  const touchesRoad = (cells) => cells.some((c) => adjF[c].some((v) => isRoad[v]));
  for (const mem of members) {
    if (!mem.length || touchesRoad(mem)) continue;
    // BFS over interior cells from this room's cells to the nearest road cell; carve the path
    const par = new Map(); const q = [];
    for (const c of mem) { par.set(c, -1); q.push(c); }
    let hit = -1;
    for (let h = 0; h < q.length && hit < 0; h++) { const u = q[h]; for (const v of adjF[u]) { if (chunk.ghost[v] || par.has(v)) continue; if (isRoad[v]) { hit = u; break; } par.set(v, u); q.push(v); } }
    if (hit < 0) continue; let u = hit; while (u >= 0 && par.get(u) !== -1) { isRoad[u] = 1; roomOf[u] = -1; u = par.get(u); }
  }
  // re-pack rooms after any carving, assign one door each
  const rooms = [];
  for (let z = 0; z < nRooms; z++) {
    const mem = members[z].filter((c) => roomOf[c] === z); if (!mem.length) continue;
    let bestDoor = -1, bc = -1, doorCell = -1;
    for (const c of mem) for (const v of adjF[c]) if (isRoad[v] && roomEdgeCond(foam, c, v, cond, idx) > bc) { bc = roomEdgeCond(foam, c, v, cond, idx); bestDoor = c; doorCell = v; }
    const ctr = centroid(foam.cells, mem);
    rooms.push({ id: rooms.length, cells: mem, x: ctr.x, y: ctr.y, door: bestDoor, doorRoad: doorCell });
  }
  const finalRoomOf = new Int32Array(foam.cells.length).fill(-1);
  rooms.forEach((r) => r.cells.forEach((c) => { finalRoomOf[c] = r.id; }));
  let roadCells = 0; for (const cid of interior) if (isRoad[cid]) roadCells++;
  return { isRoad, roomOf: finalRoomOf, rooms, portCells: portCells.map((i) => interior[i]),
    stats: { roadCells, roadFrac: roadCells / (n || 1), rooms: rooms.length, doored: rooms.filter((r) => r.door >= 0).length } };
}
function roomEdgeCond(foam, a, b, cond, idx) {
  // best-effort conductance proxy: we keyed cond by interior-edge index, but for door choice the
  // adjacency itself is enough — return inverse travel length so the nearest road wins deterministically
  return 1 / (1e-6 + Math.hypot(foam.cells[a].x - foam.cells[b].x, foam.cells[a].y - foam.cells[b].y));
}

// ── LAYER 6: character — the civic layer (econ ROLES) sampled onto the rooms ─────────────────────
// Each solved room gets a role from econ's weighted programme (mostly dwellings, a working middle, a
// few civic anchors), a domain where the role takes one, and dwellings get a few NPCs. Deterministic.
const NAMES = ['Jim', 'Mara', 'Otto', 'Lena', 'Cy', 'Wren', 'Bo', 'Ada', 'Tomas', 'Ines', 'Hal', 'Rosa', 'Gus', 'Pia', 'Ned', 'Suki', 'Cole', 'Mir', 'Vale', 'Ruth'];
export function castCharacter(rooms, { seed = 1, household = 3 } = {}) {
  const rng = mulberry32((seed ^ 0x21e6) >>> 0);
  const tot = ROLE_MIX.reduce((s, m) => s + m[1], 0);
  const pickRole = () => { let r = rng() * tot; for (const [k, w] of ROLE_MIX) { r -= w; if (r <= 0) return k; } return 'dwell'; };
  const out = rooms.map((room) => {
    const role = pickRole(), R = ROLES[role];
    const dom = R.dom ? DOMAINS[Math.floor(rng() * DOMAINS.length)] : null;
    const pl = makePlace(room.id, role, dom);
    const people = [];
    if (role === 'dwell') { const n = 1 + Math.floor(rng() * (2 * household - 1)); for (let k = 0; k < n; k++) people.push(NAMES[Math.floor(rng() * NAMES.length)]); }
    return { ...room, role, domain: pl.domain, glyph: pl.glyph, color: pl.color, tier: pl.tier, people };
  });
  const counts = {}; for (const r of out) counts[r.role] = (counts[r.role] || 0) + 1;
  return { rooms: out, counts };
}
