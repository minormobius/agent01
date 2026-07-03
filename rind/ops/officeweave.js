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
import { assignZones, mulberry32 } from './v100/voronoi.js';
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
export const HALL = -1;   // the roomOf id of the hallway spine (the office's concourse)

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

// ── the thread model (14 real threads + the synthetic hub lobby) ─────────────────────────────
function buildThreads(m, cert) {
  const cells = m.cells, T = new Map();
  const get = (kind, idx) => { const k = (kind === 'white' ? 'W' : 'P') + idx; if (!T.has(k)) T.set(k, { key: k, kind, idx, cells: new Set(), doorAt: new Map(), nexusGi: -1 }); return T.get(k); };
  for (const c of cells) if (c.owner) get(c.owner.kind, c.owner.idx).cells.add(c.gi);
  for (const d of dedupeDoors(m, cert)) { get('white', d.w).doorAt.set(d.a, { toKey: 'P' + d.f, farGi: d.b }); get('prod', d.f).doorAt.set(d.b, { toKey: 'W' + d.w, farGi: d.a }); }
  for (const t of T.values()) { let best = -1, bd = Infinity; for (const gi of t.cells) { const c = cells[gi], r = c.x * c.x + c.y * c.y; if (r < bd) { bd = r; best = gi; } } t.nexusGi = best; }
  return T;
}

// the six-thread NEXUS as a synthetic "thread": the lobby floor with six doors, one per white arm
function buildHub(m, threads) {
  const cells = m.cells, lobby = new Set();
  for (const c of cells) if (Math.hypot(c.x, c.y) / m.R < (m.flatR || 0.16) + 0.03) lobby.add(c.gi);
  let center = -1, bd = Infinity;
  for (const gi of lobby) { const c = cells[gi], r = c.x * c.x + c.y * c.y; if (r < bd) { bd = r; center = gi; } }
  if (center < 0) { for (const c of cells) { const r = c.x * c.x + c.y * c.y; if (r < bd) { bd = r; center = c.gi; } } lobby.add(center); }
  const doorAt = new Map(), used = new Set();
  const whites = [...threads.values()].filter((t) => t.kind === 'white').sort((a, b) => a.idx - b.idx);
  for (const w of whites) {
    let entry = -1;
    for (const nb of cells[w.nexusGi].adj) if (lobby.has(nb) && !used.has(nb)) { entry = nb; break; }
    if (entry < 0) { const wc = cells[w.nexusGi]; let bb = Infinity; for (const gi of lobby) { if (used.has(gi)) continue; const c = cells[gi], d = (c.x - wc.x) ** 2 + (c.y - wc.y) ** 2; if (d < bb) { bb = d; entry = gi; } } }
    if (entry >= 0) { used.add(entry); doorAt.set(entry, { toKey: w.key, farGi: w.nexusGi }); }
  }
  return { key: 'HUB', kind: 'white', synthetic: true, cells: lobby, doorAt, nexusGi: center };
}

// ── ONE THREAD → a v101-style office: hall + traffic-sized walled rooms + doors + baked light ──
function buildOfficeFor(world, t) {
  const { m, cells } = world;
  const stepAdj = (gi) => { const out = []; for (const nb of cells[gi].adj) if (t.cells.has(nb)) out.push(nb); return out; };
  const gis = [...t.cells], li = new Map(gis.map((g, i) => [g, i]));
  const sd = (m.seed ^ (t.kind === 'white' ? 0x1111 : 0x2222) ^ ((t.idx | 0) * 0x9e37) ^ (t.synthetic ? 0x7777 : 0)) >>> 0;
  const rng = mulberry32((sd ^ 0x5bd1) >>> 0);
  const rfOf = (gi) => Math.hypot(cells[gi].x, cells[gi].y) / m.R;

  // 1. the HALL — the hallway spine (nexus → rim-most chamber, widened one ring); the hub lobby is ALL hall
  let rim = t.nexusGi, br = -1; for (const g of gis) { const r = rfOf(g); if (r > br) { br = r; rim = g; } }
  const bfsPath = (a, b) => { if (a === b) return [a]; const prev = new Map([[a, -1]]), q = [a]; for (let h = 0; h < q.length; h++) { if (q[h] === b) break; for (const nb of stepAdj(q[h])) if (!prev.has(nb)) { prev.set(nb, q[h]); q.push(nb); } } if (!prev.has(b)) return null; const p = []; for (let c = b; c !== -1; c = prev.get(c)) p.push(c); return p.reverse(); };
  const spinePath = bfsPath(t.nexusGi, rim) || [t.nexusGi];
  const hall = new Set(t.synthetic ? gis : spinePath);
  if (!t.synthetic) for (const g of spinePath) for (const nb of stepAdj(g)) hall.add(nb);

  // 2. TRAFFIC-SIZED zones (v101): pick each zone's ROLE first, weight it by TRAFFIC_FOOTPRINT,
  // and let assignZones' weighted Dijkstra grow busy rooms bigger and quiet rooms smaller.
  const roomOf = new Map(gis.map((g) => [g, HALL]));
  const rooms = [];
  if (!t.synthetic) {
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
  if (t.synthetic) for (const gi of t.doorAt.keys()) emitters.push({ gi, x: cells[gi].x, y: cells[gi].y, kind: 'bollard', room: HALL, color: '#f4bf62' });
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

  // 7. the neighbours' FIRST CHAMBERS through each K-door (peeks) — the hub shows the six whites in full
  const PEEK_DEPTH = 3, peek = [], peekSet = new Set();
  for (const [gi, d] of t.doorAt) {
    const N = world.threads.get(d.toKey);
    if (t.synthetic) { for (const g of N.cells) { peek.push({ gi: g, toKey: d.toKey, door: gi }); peekSet.add(g); } continue; }
    const seen = new Map([[d.farGi, 0]]), q = [d.farGi];
    for (let h = 0; h < q.length; h++) { const dep = seen.get(q[h]); if (dep >= PEEK_DEPTH) continue; for (const nb of cells[q[h]].adj) if (N.cells.has(nb) && !seen.has(nb)) { seen.set(nb, dep + 1); q.push(nb); } }
    for (const g of seen.keys()) { peek.push({ gi: g, toKey: d.toKey, door: gi }); peekSet.add(g); }
  }

  return { rooms: live, roomOf, hall, spinePath, rim, doors, doorSet, passable, stepNbrs, pathWithin, emitters, lum, peek, peekSet };
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
  world.threads.set('HUB', buildHub(m, world.threads));
  world.office = (key) => { let off = world.offices.get(key); if (!off) { off = buildOfficeFor(world, world.threads.get(key)); world.offices.set(key, off); } return off; };
  return world;
}

if (typeof globalThis !== 'undefined') globalThis.RindOfficeWeave = { buildOfficeWorld, districtCentres, districtHexes, OFFICE_DEFAULTS, SEVEN, SEVEN_TWIST, WHITE_ROLES, PROD_ROLES, HALL };
