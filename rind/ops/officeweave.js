// officeweave.js — THE SEVEN-HEXAGON OFFICE WEAVE. The kernel behind office.html, split out of the
// app so the node selftest and the page drive the SAME model (no mirror drift).
//
// TWO MOVES, one per user note:
//
//   1. "the threads are too tight — thicken everything up: extend the weave to SEVEN hexagons
//      instead of the current one."  The weave-cell grows by APERTURE-7 (WEAVE.md's own
//      self-similarity: seven hexes make a bigger hex rotated ≈19.106°, the H3 nesting): the SAME
//      14-thread weave is laid over a hexagon of 7× the area (hexScale = √7 — weave3d's "let the
//      disc breathe" lever), with the node pitch raised only enough to keep the build fast. Every
//      thread lands ~2.4× the chambers (median ≈550 vs ≈230) and every corridor is physically
//      broader. Nothing about the topology moves: K(6,8) = 48/48, 14/14 spirals continuous, all
//      doors at grade, one-door — the full onedoor certificate holds on every seed tested (the
//      selftest pins it). The seven child hexagons survive as DISTRICTS: each chamber knows which
//      of the 7 it sits in (nearest child-hex centre), the overlay draws the flower, and the HUD
//      reads it back — your office now genuinely SPANS districts.
//
//   2. "have office hew closer to the hoop/v101 style."  The office partition adopts the v101
//      room programme (vendored policy: ops/v101/rooms.js) and its world-painter conventions:
//        • TRAFFIC-SIZED rooms — a room's zone weight is its role's TRAFFIC_FOOTPRINT, so civic
//          hubs claim more chambers and dwellings fewer (assignZones' weighted Dijkstra).
//        • a GRAND ANCHOR — the room at the thread's nexus end is a civic centrepiece
//          (GRAND_ROLES for white threads, the engine core 'make' for production).
//        • MIN_ROOM bulldozing — micro-rooms merge into their biggest neighbour (or the hall).
//        • REAL WALLS — the hallway spine is carved out as the HALL region; every room↔room and
//          room↔hall boundary is a wall EXCEPT one door per spanning-tree edge (rooted at the
//          hall), chosen flattest-first — the rind rule: walls are the default, doors are
//          deliberately-placed gaps. Movement respects them: passable() is the walk graph.
//        • BAKED LIGHT — every room gets a self-emitting central component (role-hued) and the
//          hall gets warm bollard lamps; light pools per room and brightens the door thresholds
//          (the pooled-light read of v101's ray-traced bake, without the occlusion grid the
//          curve substrate can't feed).
//
// Pure, deterministic from (seed, opts). Node-tested by test/office.selftest.mjs.

import { buildCurveModel } from './curveseed.js';
import { certify } from './onedoor.js';
import { ROLES } from './v100/econ.js';
import { assignZones, mulberry32, clipCell } from './v100/voronoi.js';
import { TRAFFIC_FOOTPRINT, GRAND_ROLES, MIN_ROOM } from './v101/rooms.js';

const TAU = Math.PI * 2;
export const SEVEN = Math.sqrt(7);                       // aperture-7: area ×7 ⇒ circumradius ×√7
export const SEVEN_TWIST = Math.atan2(Math.sqrt(3), 5);  // ≈19.1066° — the H3 child-lattice rotation
export const OFFICE_DEFAULTS = {
  rings: 1, flatR: 0.35, layers: 8, pitch: 46, width: 6, NW: 6, NF: 8,
  turnScale: 0.35, lobby: true, hexScale: SEVEN, roomSize: 13,
};
export const WHITE_ROLES = ['govern', 'serve', 'learn', 'trade', 'dwell', 'play', 'heal', 'store'];
export const PROD_ROLES = ['make', 'make', 'store', 'mend', 'make', 'move', 'trade', 'grow'];
export const HALL = -1;      // the roomOf id of the hallway spine (the office's concourse)
export const PLAZA_RF = 0.85;   // fraction of flatR that is open PLAZA (forced hall, no cross-thread walls)

// ── the seven districts: the aperture-7 child hexes nested in the big hexagon ────────────────
// Child circumradius Rc = R/√7; the 6 outer centres sit √3·Rc from the middle along the child
// lattice directions — the parent edge-normal directions rotated by the H3 twist. Every chamber
// is assigned to its nearest centre, so the districts are a true 7-way Voronoi partition of the
// weave (the child hexes drawn by districtHexes are the idealised overlay of the same nesting).
export function districtCentres(R) {
  const Rc = R / SEVEN, d = Math.sqrt(3) * Rc, out = [[0, 0]];
  for (let k = 0; k < 6; k++) { const a = (Math.PI / 6) + k * (Math.PI / 3) + SEVEN_TWIST; out.push([d * Math.cos(a), d * Math.sin(a)]); }
  return out;
}
export function districtHexes(R) {
  const Rc = R / SEVEN;
  return districtCentres(R).map(([cx, cy]) => {
    const v = [];
    for (let k = 0; k < 6; k++) { const a = k * (Math.PI / 3) + SEVEN_TWIST; v.push([cx + Rc * Math.cos(a), cy + Rc * Math.sin(a)]); }
    return v;
  });
}

// placeDoors picks each K(6,8) pair's flattest adjacency independently, so two pairs can land on
// the SAME cell (measured: w4:f0 and w5:f0 sharing one prod chamber at ×7) — and a cell can only
// be ONE door in the office model (stand on it → cross it). Relocate any collider to the next-
// flattest white-w↔prod-f adjacency with free endpoints; the crossing is still a genuine at-grade
// face contact between the same two threads (the certificate's own doors are untouched).
function dedupeDoors(m, cert) {
  const cells = m.cells, usedA = new Set(), usedB = new Set(), out = [];
  const lobbyR2 = m.lobby ? (m.flatR * m.R) ** 2 : 0;
  for (const d of cert.doors) {
    if (!usedA.has(d.a) && !usedB.has(d.b)) { usedA.add(d.a); usedB.add(d.b); out.push(d); continue; }
    let best = null;
    for (const c of cells) {
      if (!(c.owner && c.owner.kind === 'white' && c.owner.idx === d.w) || c.concourse !== 'white' || usedA.has(c.gi)) continue;
      for (const nb of c.adj) {
        const q = cells[nb];
        if (!(q.owner && q.owner.kind === 'prod' && q.owner.idx === d.f) || q.concourse !== 'prod' || usedB.has(nb)) continue;
        const mx = (c.x + q.x) / 2, my = (c.y + q.y) / 2; if (mx * mx + my * my < lobbyR2) continue;
        const dz = Math.abs(c.z - q.z), horiz = Math.hypot(c.x - q.x, c.y - q.y), grade = horiz > 1e-6 ? dz / horiz : Infinity;
        if (!best || grade < best.grade || (grade === best.grade && c.gi < best.a)) best = { ...d, a: c.gi, b: nb, grade, dz, horiz };
      }
    }
    if (best) { usedA.add(best.a); usedB.add(best.b); out.push(best); }
    else out.push(d);   // no free adjacency — keep the collision (the selftest would surface it)
  }
  return out;
}

// ── the thread model (the 14 real threads; "which thread" = who owns the chamber underfoot) ──
function buildThreads(m, cert) {
  const cells = m.cells, T = new Map();
  const get = (kind, idx) => { const k = (kind === 'white' ? 'W' : 'P') + idx; if (!T.has(k)) T.set(k, { key: k, kind, idx, cells: new Set(), doorAt: new Map(), nexusGi: -1 }); return T.get(k); };
  for (const c of cells) if (c.owner) get(c.owner.kind, c.owner.idx).cells.add(c.gi);
  for (const d of dedupeDoors(m, cert)) { get('white', d.w).doorAt.set(d.a, { toKey: 'P' + d.f, farGi: d.b }); get('prod', d.f).doorAt.set(d.b, { toKey: 'W' + d.w, farGi: d.a }); }
  for (const t of T.values()) { let best = -1, bd = Infinity; for (const gi of t.cells) { const c = cells[gi], r = c.x * c.x + c.y * c.y; if (r < bd) { bd = r; best = gi; } } t.nexusGi = best; }
  return T;
}

// ── ONE THREAD → a v101-style office: hall + traffic-sized walled rooms + doors + baked light ──
function buildOfficeFor(world, t) {
  const { m, cells } = world;
  const stepAdj = (gi) => { const out = []; for (const nb of cells[gi].adj) if (t.cells.has(nb)) out.push(nb); return out; };
  const gis = [...t.cells], li = new Map(gis.map((g, i) => [g, i]));
  const sd = (m.seed ^ (t.kind === 'white' ? 0x1111 : 0x2222) ^ ((t.idx | 0) * 0x9e37)) >>> 0;
  const rng = mulberry32((sd ^ 0x5bd1) >>> 0);
  const rfOf = (gi) => Math.hypot(cells[gi].x, cells[gi].y) / m.R;

  // 1. the HALL — the hallway spine (nexus → rim-most chamber, widened one ring) PLUS the PLAZA:
  // every chamber inside flatR·PLAZA_RF is open hall. The flat core is where the same-kind threads
  // converge (onedoor's door-free concourse hub) — forcing it to hall, with no cross-thread walls
  // there (see buildWalls), makes the nexus a real open lobby you WALK, not a portal room.
  let rim = t.nexusGi, br = -1; for (const g of gis) { const r = rfOf(g); if (r > br) { br = r; rim = g; } }
  const bfsPath = (a, b) => { if (a === b) return [a]; const prev = new Map([[a, -1]]), q = [a]; for (let h = 0; h < q.length; h++) { if (q[h] === b) break; for (const nb of stepAdj(q[h])) if (!prev.has(nb)) { prev.set(nb, q[h]); q.push(nb); } } if (!prev.has(b)) return null; const p = []; for (let c = b; c !== -1; c = prev.get(c)) p.push(c); return p.reverse(); };
  const spinePath = bfsPath(t.nexusGi, rim) || [t.nexusGi];
  const plazaR = (m.flatR || 0.16) * PLAZA_RF;
  const hall = new Set(spinePath);
  for (const g of spinePath) for (const nb of stepAdj(g)) hall.add(nb);
  for (const g of gis) if (rfOf(g) < plazaR) hall.add(g);

  // 2. TRAFFIC-SIZED zones (v101): pick each zone's ROLE first, weight it by TRAFFIC_FOOTPRINT,
  // and let assignZones' weighted Dijkstra grow busy rooms bigger and quiet rooms smaller.
  const roomOf = new Map(gis.map((g) => [g, HALL]));
  const rooms = [];
  {
    const subEdges = [];
    for (const g of gis) for (const nb of stepAdj(g)) if (nb > g && li.has(nb)) subEdges.push({ a: li.get(g), b: li.get(nb) });
    const nZones = Math.max(3, Math.round(gis.length / (world.opts.roomSize || OFFICE_DEFAULTS.roomSize)));
    const pool = t.kind === 'white' ? WHITE_ROLES : PROD_ROLES;
    const zoneRole = Array.from({ length: nZones }, () => pool[Math.floor(rng() * pool.length)]);
    const weights = zoneRole.map((r) => TRAFFIC_FOOTPRINT[r] ?? 1);
    const zone = assignZones(gis.length, subEdges, weights, sd);

    // group non-hall cells by zone, then SPLIT disconnected zone pieces (carving the hall out of a
    // zone can cut it in two) so every room is one connected clump.
    const byZone = new Map();
    gis.forEach((g, i) => { if (hall.has(g)) return; const z = zone[i]; let b = byZone.get(z); if (!b) byZone.set(z, b = []); b.push(g); });
    for (const [z, cellsOf] of [...byZone.entries()].sort((a, b) => a[0] - b[0])) {
      const left = new Set(cellsOf);
      while (left.size) {
        const s0 = cellsOf.find((g) => left.has(g)), comp = [s0], seen = new Set([s0]); left.delete(s0);
        for (let h = 0; h < comp.length; h++) for (const nb of stepAdj(comp[h])) if (left.has(nb) && !seen.has(nb)) { seen.add(nb); left.delete(nb); comp.push(nb); }
        rooms.push({ id: rooms.length, cells: comp, role: zoneRole[z] });
      }
    }
    for (const r of rooms) for (const g of r.cells) roomOf.set(g, r.id);

    // 3. MIN_ROOM bulldozing (v101): a room too small to seat a fixture merges into the adjacent
    // room sharing the most boundary, or is handed back to the hall if only the hall touches it.
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of rooms) {
        if (!r.cells.length || r.cells.length >= MIN_ROOM) continue;
        const share = new Map();
        for (const g of r.cells) for (const nb of stepAdj(g)) { const z = roomOf.get(nb); if (z !== r.id && z !== HALL) share.set(z, (share.get(z) || 0) + 1); }
        let best = HALL, bs = 0; for (const [z, n] of share) if (n > bs || (n === bs && z < best)) { bs = n; best = z; }
        if (best === HALL) { for (const g of r.cells) { roomOf.set(g, HALL); hall.add(g); } }
        else { const tgt = rooms[best]; for (const g of r.cells) roomOf.set(g, tgt.id); tgt.cells.push(...r.cells); }
        r.cells = []; changed = true;
      }
    }

    // 4. the GRAND ANCHOR (v101): the room nearest the nexus is the civic centrepiece — a
    // GRAND role on a white thread, the engine core ('make') on a production thread.
    const nc = cells[t.nexusGi];
    let anchor = null, ad = Infinity;
    for (const r of rooms) { if (!r.cells.length) continue; for (const g of r.cells) { const c = cells[g], d = (c.x - nc.x) ** 2 + (c.y - nc.y) ** 2; if (d < ad) { ad = d; anchor = r; } } }
    if (anchor) {
      const grandPool = t.kind === 'white' ? GRAND_ROLES.filter((r) => pool.includes(r)) : ['make'];
      anchor.role = grandPool.length ? grandPool[Math.floor(rng() * grandPool.length)] : anchor.role;
      anchor.grand = true;
    }
  }

  // finalize rooms: centroid, glyph, colour, shade, residents
  const live = rooms.filter((r) => r.cells.length);
  for (const r of live) {
    let cx = 0, cy = 0; for (const g of r.cells) { cx += cells[g].x; cy += cells[g].y; }
    r.cx = cx / r.cells.length; r.cy = cy / r.cells.length;
    r.glyph = ROLES[r.role].glyph; r.color = ROLES[r.role].color;
    r.shade = 0.02 + rng() * 0.12;
    r.people = r.role === 'dwell' ? 1 + Math.floor(rng() * 3) : 0;
    let best = r.cells[0], bd = Infinity;
    for (const g of r.cells) { const c = cells[g], d = (c.x - r.cx) ** 2 + (c.y - r.cy) ** 2; if (d < bd) { bd = d; best = g; } }
    r.compGi = best;   // the self-emitting central component sits here
  }

  // 5. DOORS — one per spanning-tree edge of the region graph rooted at the hall, flattest first
  // (the zero-grade doorway rule). Everything else on a region boundary is a WALL.
  const roomsById = new Map(live.map((r) => [r.id, r]));
  const cand = new Map();   // "zA|zB" (zA<zB, HALL=-1) → best {a,b,grade}
  for (const g of gis) {
    const za = roomOf.get(g);
    for (const nb of stepAdj(g)) {
      if (nb < g) continue;
      const zb = roomOf.get(nb);
      if (za === zb) continue;
      const lo = Math.min(za, zb), hi = Math.max(za, zb), key = lo + '|' + hi;
      const a = cells[g], b = cells[nb];
      const dz = Math.abs(a.z - b.z), horiz = Math.hypot(a.x - b.x, a.y - b.y), grade = horiz > 1e-6 ? dz / horiz : Infinity;
      const prev = cand.get(key);
      if (!prev || grade < prev.grade || (grade === prev.grade && g < prev.a)) cand.set(key, { a: g, b: nb, grade, lo, hi });
    }
  }
  const regionAdj = new Map();   // region id → Set(neighbour region ids)
  const radj = (z) => { let s = regionAdj.get(z); if (!s) regionAdj.set(z, s = new Set()); return s; };
  for (const { lo, hi } of cand.values()) { radj(lo).add(hi); radj(hi).add(lo); }
  const doors = [], doorSet = new Set(), reached = new Set([HALL]), queue = [HALL];
  for (let h = 0; h < queue.length; h++) {
    const z = queue[h];
    for (const nb of [...(regionAdj.get(z) || [])].sort((a, b) => a - b)) {
      if (reached.has(nb)) continue;
      reached.add(nb); queue.push(nb);
      const c = cand.get(Math.min(z, nb) + '|' + Math.max(z, nb));
      doors.push({ a: c.a, b: c.b, grade: c.grade, rooms: [z, nb] });
      doorSet.add(c.a + '|' + c.b); doorSet.add(c.b + '|' + c.a);
    }
  }
  const passable = (a, b) => roomOf.get(a) === roomOf.get(b) || doorSet.has(a + '|' + b);
  const stepNbrs = (gi) => { const out = []; for (const nb of cells[gi].adj) if (t.cells.has(nb) && passable(gi, nb)) out.push(nb); return out; };
  // walk the WALLED graph; avoidDoors keeps autopaths from tripping a K-portal mid-route (a
  // thread door cell is only ever the FINAL step of a path that targets it).
  const pathWithin = (a, b, avoidDoors) => {
    if (a === b) return [a];
    const prev = new Map([[a, -1]]), q = [a];
    for (let h = 0; h < q.length; h++) { if (q[h] === b) break; for (const nb of stepNbrs(q[h])) { if (prev.has(nb)) continue; if (avoidDoors && nb !== b && t.doorAt.has(nb)) continue; prev.set(nb, q[h]); q.push(nb); } }
    if (!prev.has(b)) return null;
    const p = []; for (let c = b; c !== -1; c = prev.get(c)) p.push(c); return p.reverse();
  };

  // 6. BAKED LIGHT — components pool light in their room; bollards light the hall; the doors glow.
  const emitters = [];
  for (const r of live) emitters.push({ gi: r.compGi, x: cells[r.compGi].x, y: cells[r.compGi].y, kind: 'comp', room: r.id, color: r.color });
  const bollardEvery = 3;
  spinePath.forEach((g, i) => { if (i % bollardEvery === 0) emitters.push({ gi: g, x: cells[g].x, y: cells[g].y, kind: 'bollard', room: HALL, color: '#f4bf62' }); });
  const lum = new Map(gis.map((g) => [g, 0]));
  const R2c = (m.pitch * 3.2) ** 2, R2b = (m.pitch * 2.4) ** 2;
  for (const e of emitters) {
    const R2 = e.kind === 'comp' ? R2c : R2b;
    for (const g of gis) {
      const z = roomOf.get(g), ez = e.room;
      if (z !== ez && !(z === HALL && e.kind === 'bollard')) continue;   // light pools per region
      const c = cells[g], d2 = (c.x - e.x) ** 2 + (c.y - e.y) ** 2;
      if (d2 > R2 * 4) continue;
      lum.set(g, Math.min(1.35, lum.get(g) + 1 / (1 + d2 / R2)));
    }
  }
  for (const d of doors) { lum.set(d.a, Math.min(1.35, lum.get(d.a) + 0.4)); lum.set(d.b, Math.min(1.35, lum.get(d.b) + 0.4)); }   // thresholds glow

  return { rooms: live, roomOf, hall, spinePath, rim, doors, doorSet, passable, stepNbrs, pathWithin, emitters, lum };
}

// ── the FLOOR MAP: the 2D Voronoi tile per chamber, clipped to the hexagon, with every tile edge
// attributed to the 2D neighbour whose bisector cut it. This is the render geometry AND the wall
// geometry AND the sight geometry — one map, so what blocks your eye is exactly what is drawn.
// LEVEL-LOCAL: a cell is tiled against its LEVEL-MATES only (|Δz| < ~2.2 decks — the walkable-step
// band). The plan interleaves both strata, and tiling against everything shreds each level's floor
// into a sponge; tiled per level, each level's tiles cover the plan continuously, and the other
// stratum genuinely passes beneath your floor unseen. ──
export const LEVEL_BAND = 2.2;   // in vpitch units — matches the wall band and the walkable step ceiling
export function buildFloorMap(world) {
  const { m, cells } = world;
  const zBand = LEVEL_BAND * m.vpitch;
  const fp = m.footprint;
  const clipToHex = (poly) => {
    let out = poly;
    for (let i = 0; i < fp.length && out.length >= 3; i++) {
      const a = fp[i], b = fp[(i + 1) % fp.length], ex = b[0] - a[0], ey = b[1] - a[1];
      const sref = ex * (0 - a[1]) - ey * (0 - a[0]);
      const f = (p) => (ex * (p[1] - a[1]) - ey * (p[0] - a[0])) * sref, np = [];
      for (let k = 0; k < out.length; k++) { const P0 = out[k], Q0 = out[(k + 1) % out.length], dp = f(P0), dq = f(Q0); if (dp >= -1e-9) np.push(P0); if ((dp >= -1e-9) !== (dq >= -1e-9)) { const t = dp / (dp - dq); np.push([P0[0] + (Q0[0] - P0[0]) * t, P0[1] + (Q0[1] - P0[1]) * t]); } }
      out = np;
    }
    return out.length >= 3 ? out : [];
  };
  const gs = m.pitch * 1.6, grid = new Map(), gk = (x, y) => `${Math.floor(x / gs)},${Math.floor(y / gs)}`;
  for (const c of cells) { const k = gk(c.x, c.y); let b = grid.get(k); if (!b) { b = []; grid.set(k, b); } b.push(c); }
  const R = m.pitch * 2.2, eps = m.pitch * 0.08;
  const polys = new Map(), edges = new Map();
  for (const c of cells) {
    const bx = Math.floor(c.x / gs), by = Math.floor(c.y / gs), near = [];
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const b = grid.get(`${bx + dx},${by + dy}`); if (b) for (const o of b) if (o !== c && Math.abs(o.z - c.z) < zBand) near.push(o); }
    const poly = clipToHex(clipCell({ x: c.x, y: c.y }, near, R));
    polys.set(c.gi, poly);
    if (poly.length < 3) continue;
    const es = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 < 1) continue;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dc = Math.hypot(mx - c.x, my - c.y);
      let nb = -1, bd = eps;
      for (const o of near) { const d = Math.abs(Math.hypot(mx - o.x, my - o.y) - dc); if (d < bd) { bd = d; nb = o.gi; } }
      es.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], nb });
    }
    edges.set(c.gi, es);
  }
  return { polys, edges };
}

export const plazaRf = (m) => (m.flatR || 0.16) * PLAZA_RF;   // radial fraction of the open plaza

// ── the GLOBAL WALLS, with REAL GAPS at every door. An edge of the floor map is a wall when the
// regions on its two sides differ — a room boundary, a hall boundary, or a thread boundary — with
// two kinds of deliberate opening: (a) inside the plaza, same-kind threads share one open floor
// (no wall — onedoor's door-free concourse hub, walked); (b) wall pieces within a door's hole
// radius are TRIMMED AWAY, so both the picture and the sight rays pass through the doorway. ──
export function buildWalls(world, floorMap) {
  const { m, cells, threads } = world;
  const pRf = plazaRf(m), rfOf = (gi) => Math.hypot(cells[gi].x, cells[gi].y) / m.R;
  const keyOf = (gi) => { const o = cells[gi].owner; return o ? (o.kind === 'white' ? 'W' : 'P') + o.idx : null; };
  // door points: every room threshold of every office + the 48 K-doors (deduped pairs)
  const doorPts = [];
  for (const t of threads.values()) {
    const off = world.office(t.key);
    for (const d of off.doors) { const a = cells[d.a], b = cells[d.b]; doorPts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, kind: 'room', a: d.a, b: d.b, aKey: t.key, bKey: t.key }); }
    for (const [gi, d] of t.doorAt) { if (t.kind !== 'white') continue; const a = cells[gi], b = cells[d.farGi]; doorPts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, kind: 'K', a: gi, b: d.farGi, aKey: t.key, bKey: d.toKey }); }
  }
  const holeR = m.pitch * 0.62, hg = new Map(), hgs = holeR, hk = (x, y) => `${Math.floor(x / hgs)},${Math.floor(y / hgs)}`;
  for (const p of doorPts) { const k = hk(p.x, p.y); let b = hg.get(k); if (!b) hg.set(k, b = []); b.push(p); }
  const inHole = (x, y) => { const bx = Math.floor(x / hgs), by = Math.floor(y / hgs); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const b = hg.get(`${bx + dx},${by + dy}`); if (!b) continue; for (const p of b) if ((p.x - x) ** 2 + (p.y - y) ** 2 < holeR * holeR) return true; } return false; };
  const regionOf = (gi) => { const k = keyOf(gi); if (!k) return 'void:' + gi; return k + '/' + world.office(k).roomOf.get(gi); };
  // a 2D edge is only a REAL WALL if its two flanks actually abut on the same level — the plan
  // interleaves both strata (median flank Δz ≈ 2.8 decks, measured), and an edge between a cell
  // and another passing a level above/below is a floor/ceiling overlap, not a wall. Same-thread
  // walkable steps measure ≤ ~2.2 decks (q99), so that is the wall band.
  const zBand = 2.2 * m.vpitch;
  const walls = [];
  for (const c of cells) {
    const es = floorMap.edges.get(c.gi); if (!es) continue;
    const za = regionOf(c.gi), ka = keyOf(c.gi), kinda = cells[c.gi].owner && cells[c.gi].owner.kind;
    for (const e of es) {
      if (e.nb >= 0 && e.nb < c.gi) continue;               // each internal edge once
      let isWall;
      if (e.nb < 0) isWall = true;                          // the sealed hexagon rim
      else if (Math.abs(cells[c.gi].z - cells[e.nb].z) >= zBand) continue;   // another level — no wall
      // the PLAZA is the certified door-free concourse hub: NO walls inside it at all. The
      // white/prod separation there is by LEVEL (the renderer keys plaza sight to your kind's
      // concourse), not by architecture — the flat core is two clean stacked floors by intent.
      else if (rfOf(c.gi) < pRf && rfOf(e.nb) < pRf) continue;
      else {
        const zb = regionOf(e.nb);
        if (za === zb) continue;
        isWall = true;
      }
      if (!isWall) continue;
      // trim the door holes out of the wall — the gap is REAL (drawn and sight both pass)
      const len = Math.hypot(e.x2 - e.x1, e.y2 - e.y1), n = Math.max(1, Math.ceil(len / (m.pitch * 0.35)));
      const zc = e.nb < 0 ? cells[c.gi].z : (cells[c.gi].z + cells[e.nb].z) / 2;   // the wall's LEVEL
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n, mx = e.x1 + (e.x2 - e.x1) * (t0 + t1) / 2, my = e.y1 + (e.y2 - e.y1) * (t0 + t1) / 2;
        if (inHole(mx, my)) continue;
        walls.push({ x1: e.x1 + (e.x2 - e.x1) * t0, y1: e.y1 + (e.y2 - e.y1) * t0, x2: e.x1 + (e.x2 - e.x1) * t1, y2: e.y1 + (e.y2 - e.y1) * t1, a: c.gi, b: e.nb, z: zc });
      }
    }
  }
  return { walls, doorPts };
}

// ── SIGHT: an occlusion bitmap rasterised from the trimmed walls, and a ray test over it. What
// blocks the ray is exactly the wall geometry that is drawn — doors are holes because the wall
// pieces there were trimmed away, so adjacent threads spill into view THROUGH their doorways. ──
export function buildSight(world, walls) {
  const { m } = world;
  const R = m.R, res = m.pitch / 2.5, zMid = m.thickness / 2, band = 0.9 * m.vpitch;
  const x0 = -R - res, y0 = -R - res, w = Math.ceil((2 * R + 2 * res) / res), h = w;
  // TWO occlusion grids — one per stratum. A wall lives at a LEVEL (its flanks' mean z); it only
  // blocks the sight of a viewer on that level. Walls near the mid-plane (the at-grade crossing
  // country) stamp both. The hexagon rim seals both.
  const gridU = new Uint8Array(w * h), gridL = new Uint8Array(w * h);
  const stamp = (g, x, y) => { const ix = Math.floor((x - x0) / res), iy = Math.floor((y - y0) / res); if (ix >= 0 && iy >= 0 && ix < w && iy < h) g[iy * w + ix] = 1; };
  for (const s of walls) {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), n = Math.max(1, Math.ceil(len / (res * 0.5)));
    const up = s.b < 0 || s.z >= zMid - band, lo = s.b < 0 || s.z <= zMid + band;
    for (let i = 0; i <= n; i++) {
      const x = s.x1 + (s.x2 - s.x1) * i / n, y = s.y1 + (s.y2 - s.y1) * i / n;
      if (up) stamp(gridU, x, y);
      if (lo) stamp(gridL, x, y);
    }
  }
  const blockedAt = (g, x, y) => { const ix = Math.floor((x - x0) / res), iy = Math.floor((y - y0) / res); return ix < 0 || iy < 0 || ix >= w || iy >= h ? true : g[iy * w + ix] === 1; };
  // ray from A to B on the viewer's stratum, ignoring only a GRID-SCALE band at each endpoint
  // (numerical fuzz — a nucleus one texel from its own wall must not self-occlude; anything
  // farther genuinely blocks). Samples every ~0.6·res. `viewerZ` picks the grid.
  const skip = res * 0.8;
  const visible = (ax, ay, bx, by, viewerZ = zMid) => {
    const g = viewerZ >= zMid ? gridU : gridL;
    const len = Math.hypot(bx - ax, by - ay);
    if (len <= res * 2) return true;
    const t0 = skip / len, t1 = 1 - skip / len, n = Math.max(1, Math.ceil((len * (t1 - t0)) / (res * 0.6)));
    for (let i = 0; i <= n; i++) { const t = t0 + (t1 - t0) * i / n; if (blockedAt(g, ax + (bx - ax) * t, ay + (by - ay) * t)) return false; }
    return true;
  };
  return { res, x0, y0, w, h, gridU, gridL, zMid, blockedAt, visible };
}

// ── the GLOBAL WALK GRAPH: crossing a door is a NO-OP — you just walk. Within a thread the
// office walls rule; across threads the 48 K-doors are the only cross-kind passages; inside the
// plaza, same-kind threads share one open floor. "Which thread am I on" = who owns your chamber. ──
export function buildGlobalWalk(world) {
  const { m, cells, threads } = world;
  const pRf = plazaRf(m), rfOf = (gi) => Math.hypot(cells[gi].x, cells[gi].y) / m.R;
  const keyOf = (gi) => { const o = cells[gi].owner; return o ? (o.kind === 'white' ? 'W' : 'P') + o.idx : null; };
  const kDoors = new Set();
  for (const t of threads.values()) for (const [gi, d] of t.doorAt) { kDoors.add(gi + '|' + d.farGi); kDoors.add(d.farGi + '|' + gi); }
  const passable = (a, b) => {
    const ka = keyOf(a), kb = keyOf(b);
    if (!ka || !kb) return false;
    if (ka === kb) return world.office(ka).passable(a, b);
    if (kDoors.has(a + '|' + b)) return true;
    const oa = cells[a].owner, ob = cells[b].owner;
    return oa.kind === ob.kind && rfOf(a) < pRf && rfOf(b) < pRf;   // the open plaza
  };
  const stepNbrs = (gi) => { const out = []; for (const nb of cells[gi].adj) if (passable(gi, nb)) out.push(nb); return out; };
  const pathBetween = (a, b, avoid) => {
    if (a === b) return [a];
    const prev = new Map([[a, -1]]), q = [a];
    for (let h = 0; h < q.length; h++) { if (q[h] === b) break; for (const nb of stepNbrs(q[h])) { if (prev.has(nb)) continue; if (avoid && avoid(nb) && nb !== b) continue; prev.set(nb, q[h]); q.push(nb); } }
    if (!prev.has(b)) return null;
    const p = []; for (let c = b; c !== -1; c = prev.get(c)) p.push(c); return p.reverse();
  };
  return { passable, stepNbrs, pathBetween, kDoors, keyOf };
}

// ── the world ────────────────────────────────────────────────────────────────────────────────
export function buildOfficeWorld(seed = 7, opts = {}) {
  const o = { ...OFFICE_DEFAULTS, ...opts };
  const m = buildCurveModel(seed, o);
  // the page rests on the structural one-door proof (probes: 0); selftests pass probes to also measure
  const cert = certify(m, { concourse: 'flood', probes: o.probes ?? 0 });
  const cells = m.cells;
  const centres = districtCentres(m.R);
  const of = new Int32Array(cells.length);
  for (const c of cells) { let best = 0, bd = Infinity; for (let k = 0; k < 7; k++) { const d = (c.x - centres[k][0]) ** 2 + (c.y - centres[k][1]) ** 2; if (d < bd) { bd = d; best = k; } } of[c.gi] = best; }
  const world = { seed, opts: o, m, cert, cells, districts: { centres, hexes: districtHexes(m.R), of }, threads: null, offices: new Map() };
  world.threads = buildThreads(m, cert);
  world.office = (key) => { let off = world.offices.get(key); if (!off) { off = buildOfficeFor(world, world.threads.get(key)); world.offices.set(key, off); } return off; };
  for (const k of world.threads.keys()) world.office(k);          // eager: walls + sight need every office
  world.floorMap = buildFloorMap(world);
  const wd = buildWalls(world, world.floorMap);
  world.walls = wd.walls; world.doorPts = wd.doorPts;
  world.sight = buildSight(world, world.walls);
  world.walk = buildGlobalWalk(world);
  // spawn: the white plaza — the most central white nexus (walk out from the lobby by sight)
  let spawn = -1, bd = Infinity;
  for (const t of world.threads.values()) { if (t.kind !== 'white') continue; const c = cells[t.nexusGi], d = c.x * c.x + c.y * c.y; if (d < bd) { bd = d; spawn = t.nexusGi; } }
  world.spawnGi = spawn;
  return world;
}

if (typeof globalThis !== 'undefined') globalThis.RindOfficeWeave = { buildOfficeWorld, buildFloorMap, buildWalls, buildSight, buildGlobalWalk, districtCentres, districtHexes, plazaRf, OFFICE_DEFAULTS, SEVEN, SEVEN_TWIST, WHITE_ROLES, PROD_ROLES, HALL, PLAZA_RF };
