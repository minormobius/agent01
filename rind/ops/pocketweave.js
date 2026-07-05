// pocketweave.js — THE POCKET DIMENSION. The weave's topology walked at the NAVE's scale.
//
// The cheat, made honest by the analytic map: each thread becomes a POCKET — a nave-scale floor
// (the v100 rooms-and-concourse engine, the same one under hoop's nave) shaped as a long strip,
// hub end → rim end. The metric is faked; the TOPOLOGY is exact and comes straight from the
// analytic weave (buildGeometry + weaveLines — no foam, no Voronoi certificate needed here):
//
//   • STATIONS. Every K(6,8) crossing is solved analytically (the same closed form weaveLines
//     uses): each (white w, engine f) pair has an exact radial fraction rf, an over/under parity,
//     and a district (which of the seven hexes it falls in). A pocket's doors sit along its strip
//     at positions PROPORTIONAL TO TRUE ARC LENGTH — order and relative spacing are real.
//   • RECIPROCITY. A crossing is one place: door (w,f) in w's pocket and door (f,w) in f's are the
//     same station. Cross, and you arrive at the reciprocal door; cross back, you return. Pinned.
//   • PARITY IS THE SIDE. Where your thread passes OVER the other, the door is on the north wall;
//     UNDER, the south wall — the over/under weave read at floor level.
//   • THE COMMONS. The hub ends don't portal: each kind has a commons pocket (the nave pattern —
//     a hex floor where the six white pockets / eight engine pockets attach), so the plaza is
//     still a place you walk.
//
// THE CHUNKS (v101's own streaming discipline, applied to the faux threads): a band is NOT one
// monolithic solve. Its spine is cut into 2–5 SEGMENTS, each solved lazily as its own chunk —
// but every segment of a thread shares ONE foamSeed, so they slice the SAME global 3D Voronoi
// foam: boundary cells are bit-identical and the segments abut seamlessly (v100's streaming
// guarantee — this is what "voronoi continuity" means here). Each cut carries one SEAM PORT at
// the spine point, inherited by both sides, so the concourse meets across the seam (a bulkhead
// doorway, not a wall). Consequences:
//   • a door PREVIEW digests one segment, not a whole thread (the commons no longer swallows six
//     full bands to warm its peeks);
//   • door placement is SEGMENT-LOCAL and deterministic regardless of solve order — a pocket
//     first touched via its middle segment places the same doors as one solved hub → rim.
//
// One-door survives by construction: within a pocket 0 doors (segment concourses merge through
// the seam ports into one concourse), white↔engine exactly 1 (a station, through its interface
// chamber), same-kind via the commons. Pure, deterministic from (seed, threadKey); lazily solved
// per SEGMENT; node-tested by test/pocket.selftest.mjs.

import { buildGeometry, weaveLines } from './weave3d.js';
import { solveChunk } from './v100/chunkgen.js';
import { createWorld, addChunk, buildWalk, extendWalk } from './v100/manager.js';
import { mulberry32 } from './v100/voronoi.js';
import { districtCentres, SEVEN, OFFICE_DEFAULTS } from './officeweave.js';

const TAU = Math.PI * 2;
export const POCKET_DEFAULTS = {
  rings: 1, turnScale: 0.35, hexScale: SEVEN, NW: 6, NF: 8, layers: 8, flatR: 0.35,
  spacing: 150,                        // thin the (unused) prism nodes — only the analytic layer matters here
  H: 220, margin: 150, perStation: 260, minW: 1500, maxW: 2800, alcove: 100, alcoveW: 0.032,
  cellSize: 16, roomSize: 15, concourseWidth: 2,
  commonsW: 940, commonsH: 640,
  bridgeW: 330, bridgeH: 280, wobble: 0.55,   // the interface chambers + the spine's directional noise
  segArc: 800,                         // target nave-units of band per CHUNK segment (2–5 segments per thread)
};
const PROD_MIX = [['make', 26], ['store', 12], ['mend', 9], ['move', 7], ['dwell', 9], ['trade', 5], ['grow', 5], ['serve', 3], ['learn', 2]];

// ── the analytic stations: every K crossing's rf, parity and district, from the family params ──
export function solveStations(geo, lines) {
  const { NW, NF, family, R } = geo, { flatR } = lines;
  const { turnsW, turnsP, phaseW, phaseP, spin } = family;
  const S = turnsW + turnsP, ph = (phaseW - phaseP) / TAU, Kmax = Math.ceil(Math.abs(S)) + 2;
  const centres = districtCentres(R);
  const stations = [];
  for (let w = 0; w < NW; w++) for (let f = 0; f < NF; f++) {
    let best = null;
    for (let k = -Kmax; k <= Kmax; k++) {
      const gg = ((w + 0.5) / NW - (f + 0.5) / NF + ph - k) / (spin * S);
      if (gg <= 0.015 || gg >= 0.999) continue;
      const rf = flatR + gg * (1 - flatR);
      if (!best || rf < best.rf) best = { w, f, rf, over: ((((w + f + k) % 2) + 2) % 2) === 0, k };
    }
    if (!best) continue;
    const p = lines.lineW(best.w, best.rf);
    let d = 0, bd = Infinity;
    for (let i = 0; i < 7; i++) { const dd = (p[0] - centres[i][0]) ** 2 + (p[1] - centres[i][1]) ** 2; if (dd < bd) { bd = dd; d = i; } }
    stations.push({ ...best, district: d });
  }
  return stations;
}

// horizontal arc-length LUT (weave3d's form) — u(rf): how far along the strip a station sits
function arcLUT(R, turns, flatR) {
  const M = 200, a = new Float64Array(M + 1); let s = 0;
  for (let i = 1; i <= M; i++) { const rf = i / M; s += Math.hypot(R, rf * R * turns * TAU) / M; a[i] = s; }
  const at = (rf) => { const x = Math.max(0, Math.min(1, rf)) * M, i = Math.floor(x), t = x - i; return i >= M ? a[M] : a[i] + (a[i + 1] - a[i]) * t; };
  const s0 = at(flatR), s1 = at(1);
  const fn = (rf) => (at(rf) - s0) / (s1 - s0);   // 0 at the hub end of the weave, 1 at the rim
  fn.total = s1 - s0;                              // absolute arc (analytic units) for the spiral scale
  return fn;
}

// nearest CONCOURSE cell of a solved chunk to a point, skipping cells already used as doors
function nearestRoad(rec, x, y, used) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < rec.cells.length; i++) {
    if (!rec.road[i] || used.has(i)) continue;
    const c = rec.cells[i], d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// segment-local reachability: BFS over ONE rec with the walk graph's membership rule (free within
// the concourse and within a room; room↔concourse only at the doorway). Deterministic, no manager.
function recReach(rec, src) {
  const seen = new Set();
  if (src < 0) { for (let i = 0; i < rec.cells.length; i++) seen.add(i); return seen; }   // no anchor → allow all
  const doorLink = new Map();
  const link = (a, b) => { let g = doorLink.get(a); if (!g) doorLink.set(a, g = []); g.push(b); };
  for (const r of rec.rooms) {
    const dp = r.doorPairs && r.doorPairs.length ? r.doorPairs : (r.door >= 0 && r.doorRoad >= 0 ? [[r.door, r.doorRoad]] : []);
    for (const [a, b] of dp) { link(a, b); link(b, a); }
  }
  const mem = (i) => rec.road[i] ? 'R' : 'r' + rec.roomOf[i];
  seen.add(src); const q = [src];
  for (let h = 0; h < q.length; h++) {
    const u = q[h], mu = mem(u);
    for (const v of rec.adj[u]) { if (seen.has(v)) continue; const mv = mem(v); if ((mu === 'R' && mv === 'R') || mu === mv) { seen.add(v); q.push(v); } }
    const dl = doorLink.get(u); if (dl) for (const v of dl) if (!seen.has(v)) { seen.add(v); q.push(v); }
  }
  return seen;
}

function threadSeed(seed, key) { let h = seed >>> 0; for (const ch of key) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0; return (h ^ 0x9e3779b9) >>> 0; }

// attach one solved segment rec to the pocket's manager world + growing walk graph
function attach(pocket, g, rec) {
  if (!pocket.world) { pocket.world = createWorld(); addChunk(pocket.world, rec); pocket.walk = buildWalk(pocket.world); }
  else { addChunk(pocket.world, rec); extendWalk(pocket.walk, pocket.world, rec.id); }
  g.rec = rec; g.chunkId = rec.id; g.solved = true; pocket.solvedCount++;
}

// ── one pocket: a lazy SHELL (geometry now, chunks on demand) ────────────────────────────────
function buildPocket(world, key) {
  const o = world.opts, seed = threadSeed(world.seed, key);
  const isCommons = key === 'CW' || key === 'CP';
  const isBridge = key[0] === 'X';
  const kind = isBridge ? 'bridge' : (key[0] === 'W' || key === 'CW' ? 'white' : 'prod');

  if (isBridge || isCommons) {
    // single-segment pockets: the interface chamber (one room, shared by both threads — seeded
    // ONLY by (world.seed, w, f), so both sides solve the SAME record) and the two commons.
    const W = isBridge ? o.bridgeW : o.commonsW, H = isBridge ? o.bridgeH : o.commonsH;
    const pocket = {
      key, kind, W, H, spine: null, arches: [], doors: [], doorAt: new Map(), hubDoor: -1,
      world: null, walk: null, segs: [{ si: 0, solved: false, chunkId: -1, rec: null }],
      solvedCount: 0, segOf: () => 0,
    };
    pocket.ensureSeg = (si = 0) => {
      const g = pocket.segs[0]; if (g.solved) return g;
      const rec = isBridge
        ? solveChunk({ seed, foamSeed: seed, v2: true, shape: 'hex', W, H, cellSize: o.cellSize, roomSize: 11, concourseWidth: 2 })
        : solveChunk({ seed, foamSeed: seed, v2: true, shape: 'hex', W, H, cellSize: o.cellSize, roomSize: o.roomSize, concourseWidth: o.concourseWidth, roleMix: kind === 'prod' ? PROD_MIX : null });
      if (key === 'CP') {
        // THE NEXUS — the works floor's centrepiece chamber, reserved for player progression
        // (marked now, wired later): the biggest doored room nearest the hex centre, gilded so
        // the paint, lamps and fixtures all read it as the special room. Deterministic; pinned.
        let bi = -1, bs = -Infinity;
        for (let i = 0; i < rec.rooms.length; i++) {
          const r = rec.rooms[i];
          if (r.door < 0 || !r.cells.length) continue;
          const s = r.cells.length - Math.hypot(r.x - W / 2, r.y - H / 2) * 0.6;
          if (s > bs) { bs = s; bi = i; }
        }
        if (bi >= 0) { const r = rec.rooms[bi]; r.nexus = true; r.role = 'nexus'; r.glyph = '◈'; r.color = '#f4bf62'; }
      }
      attach(pocket, g, rec);
      const base = pocket.walk.base[g.chunkId], used = new Set();
      if (isBridge) {
        const [bw, bf] = key.slice(1).split(':').map(Number);
        const st = world.stations.find((s) => s.w === bw && s.f === bf) || null;
        const dW = nearestRoad(rec, W * 0.16, H / 2, used);
        if (dW >= 0) { used.add(dW); const d = { cell: dW, seg: 0, node: base + dW, toKey: 'W' + bw, other: 'W' + bw, station: st, label: 'W' + bw }; pocket.doors.push(d); pocket.doorAt.set(d.node, d); }
        const dP = nearestRoad(rec, W * 0.84, H / 2, used);
        if (dP >= 0) { used.add(dP); const d = { cell: dP, seg: 0, node: base + dP, toKey: 'P' + bf, other: 'P' + bf, station: st, label: 'P' + bf }; pocket.doors.push(d); pocket.doorAt.set(d.node, d); }
      } else {
        // the commons: one door per attached pocket, ringed around the hex (the nave commons pattern)
        const n = kind === 'white' ? world.geo.NW : world.geo.NF;
        for (let k = 0; k < n; k++) {
          const a = (k + 0.5) / n * TAU;
          const cell = nearestRoad(rec, W / 2 + Math.cos(a) * W * 0.36, H / 2 + Math.sin(a) * H * 0.36, used);
          if (cell < 0) continue; used.add(cell);
          const d = { cell, seg: 0, node: base + cell, toKey: (kind === 'white' ? 'W' : 'P') + k, station: null, label: 'hub' };
          pocket.doors.push(d); pocket.doorAt.set(d.node, d);
        }
      }
      return g;
    };
    pocket.ensureAll = () => pocket.ensureSeg(0);
    return pocket;
  }

  // ── a THREAD pocket: the spiral band, cut into lazily-solved segments ──
  const idx = +key.slice(1);
  const arc = kind === 'white' ? world.arcW : world.arcP;
  const myStations = world.stations.filter((s) => (kind === 'white' ? s.w : s.f) === idx)
    .map((s) => ({ ...s, u: arc(s.rf) }))
    .sort((a, b) => a.u - b.u);
  // THE SPIRAL: the pocket curves the way the analytic map does — the band follows the thread's
  // own centreline (lineW/lineP), scaled so its arc length is the nave-scale target. Doors sit
  // ON the curve; parity picks the outer (over) or inner (under) edge of the band.
  const targetArc = Math.max(o.minW, Math.min(o.maxW, 400 + o.perStation * myStations.length));
  const sc = targetArc / arc.total, halfW = o.H / 2;
  const line = kind === 'white' ? (rf) => world.lines.lineW(idx, rf) : (rf) => world.lines.lineP(idx, rf);
  const zline = kind === 'white' ? (rf) => world.lines.zW(idx, rf) : (rf) => world.lines.zP(idx, rf);
  const M2 = 72, spine = [];
  for (let i = 0; i <= M2; i++) { const rf = world.lines.flatR + (1 - world.lines.flatR) * i / M2, p = line(rf); spine.push({ rf, x: p[0] * sc, y: p[1] * sc, z: zline(rf) }); }
  const norm = () => { for (let i = 0; i <= M2; i++) { const a = spine[Math.max(0, i - 1)], b = spine[Math.min(M2, i + 1)], L = Math.hypot(b.x - a.x, b.y - a.y) || 1; spine[i].nx = -(b.y - a.y) / L; spine[i].ny = (b.x - a.x) / L; } };
  norm();
  // FUCK UP THE SPIRAL: seeded noise on the directionality — a smooth wobble along the normal
  // (three incommensurate sines), then recompute the headings. Deterministic per thread.
  const wrng = mulberry32((seed ^ 0x7abc) >>> 0), p1 = wrng() * TAU, p2 = wrng() * TAU, p3 = wrng() * TAU, p4 = wrng() * TAU, p5 = wrng() * TAU;
  const amp = halfW * o.wobble;
  for (let i = 0; i <= M2; i++) {
    const u = i / M2, taper = Math.min(1, 4 * u) * Math.min(1, 4 * (1 - u));   // pin the two ends
    const wv = (Math.sin(u * TAU * 2.3 + p1) * 0.5 + Math.sin(u * TAU * 4.7 + p2) * 0.33 + Math.sin(u * TAU * 8.1 + p3) * 0.22
      + Math.sin(u * TAU * 16.3 + p4) * 0.12 + Math.sin(u * TAU * 27.7 + p5) * 0.07) * amp * taper;   // + high-frequency jitter on the heading
    spine[i].x += spine[i].nx * wv; spine[i].y += spine[i].ny * wv;
  }
  norm();
  // WIDTH noise, independent per edge (high-frequency): the two banks wander separately
  const q1 = wrng() * TAU, q2 = wrng() * TAU, q3 = wrng() * TAU, q4 = wrng() * TAU;
  const edgeNoise = (u, side) => {
    const a = side > 0 ? q1 : q3, b = side > 0 ? q2 : q4;
    return Math.max(-halfW * 0.3, (Math.sin(u * TAU * 11.7 + a) + Math.sin(u * TAU * 19.3 + b) * 0.6) * halfW * 0.16);
  };
  // STATION ALCOVES: the band is thin, and each portal bulges OFF the spiral on its parity side —
  // a small lobe you walk OUT of the band to reach, so crossing reads as stepping into a room.
  const uFlat = world.lines.flatR, uOfRf = (rf) => (rf - uFlat) / (1 - uFlat);
  const bumpAt = (u, side) => {
    let b = 0;
    for (const st of myStations) {
      const d = Math.abs(u - uOfRf(st.rf)) / o.alcoveW; if (d >= 1) continue;
      const k = (1 - d) * (1 - d);
      b = Math.max(b, o.alcove * k * ((st.over ? 1 : -1) === side ? 1 : 0.45));   // out-bulge + in-bulge: the chamber straddles the band
    }
    return b;
  };
  const pad = halfW + o.alcove;
  let mx = 1e9, my = 1e9, Mx = -1e9, My = -1e9;
  for (const p of spine) { mx = Math.min(mx, p.x - pad); my = Math.min(my, p.y - pad); Mx = Math.max(Mx, p.x + pad); My = Math.max(My, p.y + pad); }
  const sx = 30 - mx, sy = 30 - my;
  for (const p of spine) { p.x += sx; p.y += sy; }
  const W = Mx - mx + 60, H = My - my + 60;
  // the two banks, computed ONCE — every segment slices the same polyline, so cut edges match exactly
  const bankTop = [], bankBot = [];
  for (let i = 0; i <= M2; i++) {
    const u = i / M2, p = spine[i];
    bankTop.push({ x: p.x + p.nx * (halfW + bumpAt(u, 1) + edgeNoise(u, 1)), y: p.y + p.ny * (halfW + bumpAt(u, 1) + edgeNoise(u, 1)) });
    bankBot.push({ x: p.x - p.nx * (halfW + bumpAt(u, -1) + edgeNoise(u, -1)), y: p.y - p.ny * (halfW + bumpAt(u, -1) + edgeNoise(u, -1)) });
  }
  // THE CUTS: 2–5 segments of ~segArc nave-units, each cut snapped AWAY from station alcoves so a
  // seam never slices a portal lobe. Deterministic pure arithmetic — no rng.
  const stSamples = myStations.map((s) => Math.round(uOfRf(s.rf) * M2));
  const nseg = Math.max(2, Math.min(5, Math.round(targetArc / o.segArc)));
  const cuts = [0];
  for (let k = 1; k < nseg; k++) {
    const ideal = Math.round(M2 * k / nseg);
    let best = -1, bs = -Infinity;
    for (let c = ideal - 6; c <= ideal + 6; c++) {
      if (c <= cuts[cuts.length - 1] + 10 || c >= M2 - 8) continue;
      let md = 99; for (const ss of stSamples) md = Math.min(md, Math.abs(c - ss));
      const score = Math.min(md, 6) * 10 - Math.abs(c - ideal);
      if (score > bs) { bs = score; best = c; }
    }
    if (best > 0) cuts.push(best);
  }
  cuts.push(M2);
  const segs = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const i0 = cuts[k], i1 = cuts[k + 1], last = k === cuts.length - 2;
    const poly = [];
    for (let i = i0; i <= i1; i++) poly.push({ x: bankTop[i].x, y: bankTop[i].y });
    for (let i = i1; i >= i0; i--) poly.push({ x: bankBot[i].x, y: bankBot[i].y });
    const stations = myStations.filter((s) => { const si = Math.round(uOfRf(s.rf) * M2); return si >= i0 && (si < i1 || last); });
    segs.push({ si: k, i0, i1, poly, stations, solved: false, chunkId: -1, rec: null });
  }

  const pocket = {
    key, kind, W, H, spine, arches: [], doors: [], doorAt: new Map(), hubDoor: -1,
    world: null, walk: null, segs, solvedCount: 0,
    _halfW: halfW, _uOf: uOfRf,
  };
  pocket.segOf = (s) => {
    const si = Math.round(uOfRf(s.rf) * M2);
    for (let k = 0; k < segs.length; k++) if (si < segs[k].i1 || k === segs.length - 1) return k;
    return segs.length - 1;
  };
  // district arches from the spine alone (no solve needed)
  const at = (u) => spine[Math.max(0, Math.min(M2, Math.round(u * M2)))];
  let lastDistrict = -1;
  for (const s of myStations) {
    if (s.district !== lastDistrict) {
      const a = at(Math.max(0, uOfRf(s.rf) - 0.03));
      pocket.arches.push({ x1: a.x + a.nx * halfW, y1: a.y + a.ny * halfW, x2: a.x - a.nx * halfW, y2: a.y - a.ny * halfW, district: s.district });
      lastDistrict = s.district;
    }
  }
  pocket.ensureSeg = (si) => {
    const g = segs[si]; if (g.solved) return g;
    // SEAM PORTS: one at each interior cut, AT the spine point, handed to BOTH sides via inherit —
    // so the two segments bind cells at the same location and the walk stitches them (manager byLoc).
    const inherit = [];
    if (si > 0) inherit.push({ x: spine[g.i0].x, y: spine[g.i0].y });
    if (si < segs.length - 1) inherit.push({ x: spine[g.i1].x, y: spine[g.i1].y });
    const rec = solveChunk({
      seed: threadSeed(world.seed, key + '#' + si), foamSeed: seed,   // ONE foam per thread = voronoi continuity across seams
      v2: true, poly: g.poly, inherit, cellSize: o.cellSize, roomSize: o.roomSize,
      concourseWidth: o.concourseWidth, roleMix: kind === 'prod' ? PROD_MIX : null,
    });
    attach(pocket, g, rec);
    placeThreadDoors(world, pocket, g);
    return g;
  };
  pocket.ensureAll = () => { for (let k = 0; k < segs.length; k++) pocket.ensureSeg(k); };
  return pocket;
}

// doors of ONE thread segment — SEGMENT-LOCAL and solve-order-independent: candidates come from
// this rec alone, filtered to cells reachable from the segment's own anchor (the hub end for
// segment 0, the inherited seam port otherwise), so a pocket first touched via its middle segment
// places exactly the doors it would have placed solved hub → rim.
function placeThreadDoors(world, pocket, g) {
  const o = world.opts, rec = g.rec, base = pocket.walk.base[g.chunkId];
  const spine = pocket.spine, M2 = spine.length - 1, used = new Set();
  let anchor = -1;
  if (g.si === 0) {
    const hub = nearestRoad(rec, spine[0].x, spine[0].y, used);
    if (hub >= 0) {
      used.add(hub); anchor = hub;
      pocket.hubDoor = base + hub;
      const d = { cell: hub, seg: 0, node: base + hub, toKey: pocket.kind === 'white' ? 'CW' : 'CP', station: null, label: 'the commons' };
      pocket.doors.push(d); pocket.doorAt.set(d.node, d);
    }
  } else {
    const p0 = rec.ports.find((p) => p.inherited);
    anchor = p0 && p0.cell >= 0 ? p0.cell : nearestRoad(rec, spine[g.i0].x, spine[g.i0].y, used);
  }
  const reach = recReach(rec, anchor);
  const at = (u) => spine[Math.max(0, Math.min(M2, Math.round(u * M2)))];
  for (const s of g.stations) {
    const sp = at(pocket._uOf(s.rf)), side = s.over ? 1 : -1, off = pocket._halfW + o.alcove * 0.55;
    const x = sp.x + sp.nx * side * off, y = sp.y + sp.ny * side * off;
    // deepest WALKABLE cell of the alcove (concourse or doored room) that genuinely connects
    const cand = [];
    for (let i = 0; i < rec.cells.length; i++) {
      if (used.has(i) || !reach.has(i)) continue;
      const rid = rec.roomOf[i];
      if (!rec.road[i] && (rid < 0 || !rec.rooms[rid] || rec.rooms[rid].door < 0)) continue;
      const c = rec.cells[i]; cand.push([(c.x - x) ** 2 + (c.y - y) ** 2, i]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    if (!cand.length) continue;
    const cell = cand[0][1]; used.add(cell);
    const other = pocket.kind === 'white' ? 'P' + s.f : 'W' + s.w;
    const toKey = 'X' + s.w + ':' + s.f;   // every crossing passes through its shared interface chamber
    const d = { cell, seg: g.si, node: base + cell, toKey, other, station: s, label: other, over: s.over, district: s.district };
    pocket.doors.push(d); pocket.doorAt.set(d.node, d);
  }
  // keep the rail readable whatever the solve order: hub first, stations in analytic rf order
  pocket.doors.sort((a, b) => (a.station ? a.station.rf : -1) - (b.station ? b.station.rf : -1));
}

// the reciprocal door: where crossing at `door` from `fromKey` lands you in the target pocket.
// LAZY: ensures exactly the target segment that holds the reciprocal door (one chunk, not a thread).
export function reciprocalDoor(world, fromKey, door) {
  const target = world.pocket(door.toKey);
  if (door.toKey[0] === 'X') {   // step INTO the interface, at your own side
    target.ensureSeg(0);
    return target.doors.find((d) => d.toKey === fromKey) || target.doors[0];
  }
  if (door.station) {            // step OUT of the interface: the thread's matching station door
    const s = door.station;
    target.ensureSeg(target.segOf(s));
    for (const d of target.doors) if (d.station && d.station.w === s.w && d.station.f === s.f) return d;
    return target.doors[0];
  }
  target.ensureSeg(0);
  if (fromKey === 'CW' || fromKey === 'CP') return target.doors.find((d) => !d.station) || target.doors[0];   // pocket's hub door
  return target.doors.find((d) => d.toKey === fromKey) || target.doors[0];   // commons door back to us
}

export function buildPocketWorld(seed = 7, opts = {}) {
  const o = { ...POCKET_DEFAULTS, ...opts };
  const geo = buildGeometry(seed, { rings: o.rings, spacing: o.spacing, layers: o.layers, NW: o.NW, NF: o.NF, turnScale: o.turnScale, hexScale: o.hexScale });
  const lines = weaveLines(geo, { flatR: o.flatR });
  const world = {
    seed, opts: o, geo, lines,
    warps: geo.warps, wefts: geo.wefts,
    stations: solveStations(geo, lines),
    arcW: arcLUT(geo.R, geo.family.turnsW, lines.flatR),
    arcP: arcLUT(geo.R, geo.family.turnsP, lines.flatR),
    pockets: new Map(),
  };
  world.pocket = (key) => { let p = world.pockets.get(key); if (!p) { p = buildPocket(world, key); world.pockets.set(key, p); } return p; };
  world.label = (key) => key[0] === 'X' ? 'the interface' : key === 'CW' ? 'the ops commons' : key === 'CP' ? 'the works floor' : key[0] === 'W' ? geo.warps[+key.slice(1)].id : geo.wefts[+key.slice(1)].id;
  return world;
}

if (typeof globalThis !== 'undefined') globalThis.RindPocketWeave = { buildPocketWorld, solveStations, reciprocalDoor, POCKET_DEFAULTS };
