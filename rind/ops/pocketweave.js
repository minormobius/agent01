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
// One-door survives by construction: within a pocket 0 doors, white↔engine exactly 1 (a station),
// same-kind via the commons. Pure, deterministic from (seed, threadKey); lazily solved per pocket;
// node-tested by test/pocket.selftest.mjs.

import { buildGeometry, weaveLines } from './weave3d.js';
import { solveChunk } from './v100/chunkgen.js';
import { createWorld, addChunk, buildWalk, pathFind } from './v100/manager.js';
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

function threadSeed(seed, key) { let h = seed >>> 0; for (const ch of key) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0; return (h ^ 0x9e3779b9) >>> 0; }

// ── one pocket: the strip floor + its doors, solved lazily and cached ────────────────────────
function buildPocket(world, key) {
  const o = world.opts, seed = threadSeed(world.seed, key);
  const isCommons = key === 'CW' || key === 'CP';
  const isBridge = key[0] === 'X';
  const kind = isBridge ? 'bridge' : (key[0] === 'W' || key === 'CW' ? 'white' : 'prod');
  let rec, W, H;
  if (isBridge) {
    // THE INTERFACE CHAMBER — one room, shared by both threads. Seeded ONLY by (world.seed, w, f),
    // so whichever side you enter from, it is the SAME solved record: the serious imposition, kept.
    const [bw, bf] = key.slice(1).split(':').map(Number);
    W = o.bridgeW; H = o.bridgeH;
    rec = solveChunk({ seed, foamSeed: seed, v2: true, shape: 'hex', W, H, cellSize: o.cellSize, roomSize: 11, concourseWidth: 2 });
    const st = world.stations.find((s) => s.w === bw && s.f === bf) || null;
    const w0 = createWorld(); addChunk(w0, rec);
    const walk0 = buildWalk(w0);
    const pocket0 = { key, kind, rec, walk: walk0, W, H, doors: [], doorAt: new Map(), hubDoor: -1, arches: [], spine: null };
    const used0 = new Set();
    const dW = nearestRoad(rec, W * 0.16, H / 2, used0);
    if (dW >= 0) { used0.add(dW); const d = { cell: dW, node: dW, toKey: 'W' + bw, other: 'W' + bw, station: st, label: 'W' + bw }; pocket0.doors.push(d); pocket0.doorAt.set(dW, d); }
    const dP = nearestRoad(rec, W * 0.84, H / 2, used0);
    if (dP >= 0) { used0.add(dP); const d = { cell: dP, node: dP, toKey: 'P' + bf, other: 'P' + bf, station: st, label: 'P' + bf }; pocket0.doors.push(d); pocket0.doorAt.set(dP, d); }
    return pocket0;
  }
  if (isCommons) {
    W = o.commonsW; H = o.commonsH;
    rec = solveChunk({ seed, foamSeed: seed, v2: true, shape: 'hex', W, H, cellSize: o.cellSize, roomSize: o.roomSize, concourseWidth: o.concourseWidth, roleMix: kind === 'prod' ? PROD_MIX : null });
  } else {
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
    W = Mx - mx + 60; H = My - my + 60;
    const poly = [
      ...spine.map((p, i) => { const u = i / M2, off = halfW + bumpAt(u, 1) + edgeNoise(u, 1); return { x: p.x + p.nx * off, y: p.y + p.ny * off }; }),
      ...[...spine].reverse().map((p, i) => { const u = (M2 - i) / M2, off = halfW + bumpAt(u, -1) + edgeNoise(u, -1); return { x: p.x - p.nx * off, y: p.y - p.ny * off }; }),
    ];
    rec = solveChunk({ seed, foamSeed: seed, v2: true, poly, W, H, cellSize: o.cellSize, roomSize: o.roomSize, concourseWidth: o.concourseWidth, roleMix: kind === 'prod' ? PROD_MIX : null });
    rec._stations = myStations; rec._spine = spine; rec._halfW = halfW;
  }
  const w = createWorld(); addChunk(w, rec);
  const walk = buildWalk(w);
  const pocket = { key, kind, rec, walk, W, H, doors: [], doorAt: new Map(), hubDoor: -1, arches: [], spine: rec._spine || null };

  const used = new Set();
  if (isCommons) {
    // the commons: one door per attached pocket, ringed around the hex (the nave commons pattern)
    const n = kind === 'white' ? world.geo.NW : world.geo.NF;
    for (let k = 0; k < n; k++) {
      const a = (k + 0.5) / n * TAU;
      const cell = nearestRoad(rec, W / 2 + Math.cos(a) * W * 0.36, H / 2 + Math.sin(a) * H * 0.36, used);
      if (cell < 0) continue; used.add(cell);
      const d = { cell, node: cell, toKey: (kind === 'white' ? 'W' : 'P') + k, station: null, label: 'hub' };
      pocket.doors.push(d); pocket.doorAt.set(cell, d);
    }
  } else {
    // the hub door (left end → the commons) + one station door per crossing, at true-arc x,
    // parity picking the wall side
    const spine = rec._spine, halfW = rec._halfW, M2 = spine.length - 1;
    const at = (u) => spine[Math.max(0, Math.min(M2, Math.round(u * M2)))];
    const uOf = (rf) => { const flatR = world.lines.flatR; return (rf - flatR) / (1 - flatR); };   // spine is rf-uniform
    const hubP = spine[0];
    const hub = nearestRoad(rec, hubP.x, hubP.y, used);
    if (hub >= 0) { used.add(hub); pocket.hubDoor = hub; const d = { cell: hub, node: hub, toKey: kind === 'white' ? 'CW' : 'CP', station: null, label: 'the commons' }; pocket.doors.push(d); pocket.doorAt.set(hub, d); }
    let lastDistrict = -1;
    for (const s of rec._stations) {
      const sp = at(uOf(s.rf)), side = s.over ? 1 : -1, reach = halfW + world.opts.alcove * 0.55;
      const x = sp.x + sp.nx * side * reach, y = sp.y + sp.ny * side * reach;
      // deepest WALKABLE cell of the alcove (concourse or doored room), REACHABILITY-CHECKED:
      // rare solver offcuts leave an isolated pocket of cells — try nearest candidates until one
      // actually walks from the hub door (deterministic; bounded).
      const cand = [];
      for (let i = 0; i < rec.cells.length; i++) {
        if (used.has(i)) continue;
        const rid = rec.roomOf[i];
        if (!rec.road[i] && (rid < 0 || !rec.rooms[rid] || rec.rooms[rid].door < 0)) continue;
        const c = rec.cells[i]; cand.push([((c.x - x) ** 2 + (c.y - y) ** 2), i]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      let cell = -1;
      const src = pocket.hubDoor >= 0 ? pocket.hubDoor : (cand.length ? cand[0][1] : -1);
      for (let t = 0; t < Math.min(14, cand.length); t++) { const i = cand[t][1]; if (src < 0 || i === src || pathFind(pocket.walk, src, i)) { cell = i; break; } }
      if (cell < 0) continue; used.add(cell);
      const other = (kind === 'white' ? 'P' + s.f : 'W' + s.w);
      const toKey = 'X' + s.w + ':' + s.f;   // every crossing passes through its shared interface chamber
      const d = { cell, node: cell, toKey, other, station: s, label: other, x, over: s.over, district: s.district };
      pocket.doors.push(d); pocket.doorAt.set(cell, d);
      if (s.district !== lastDistrict) {
        const a = at(Math.max(0, uOf(s.rf) - 0.03));
        pocket.arches.push({ x1: a.x + a.nx * halfW, y1: a.y + a.ny * halfW, x2: a.x - a.nx * halfW, y2: a.y - a.ny * halfW, district: s.district });
        lastDistrict = s.district;
      }
    }
  }
  return pocket;
}

// the reciprocal door: where crossing at `door` from `fromKey` lands you in the target pocket
export function reciprocalDoor(world, fromKey, door) {
  const target = world.pocket(door.toKey);
  if (door.toKey[0] === 'X') return target.doors.find((d) => d.toKey === fromKey) || target.doors[0];   // step INTO the interface, at your own side
  if (door.station) {                                                          // step OUT of the interface: the thread's station door
    const s = door.station;
    for (const d of target.doors) if (d.station && d.station.w === s.w && d.station.f === s.f) return d;
  } else if (fromKey === 'CW' || fromKey === 'CP') {
    return target.doors.find((d) => !d.station) || target.doors[0];            // pocket's hub door
  }
  return target.doors.find((d) => d.toKey === fromKey) || target.doors[0];     // commons door back to us
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
