// pocketdeck.js — THE UPPER RIND AS THE EVERYTHING FACTORY: the ring-weave pocket dimension
// (rind/upperrind — pocketweave.js + ringpocket.js in ring mode) brought into the GAME as deck 1.
//
// The topology is the weave's, exact: SIX white-collar ops threads (W0–W5, the npc factory
// maintainers — two per nave faction, antipodal) × EIGHT production threads — six radial engines
// (P0–P5: foundry · chemworks · mill · fab · weave · fluid) plus TWO RING LOOPS that intersect
// everything (RA the assembly ring at the core, RR the reclaim ring at the rim). Every crossing
// is a ZERO-GRADE chamber (the no-ladder rule): thread×thread through an X interface chamber,
// ring×threads through a beefy Y-junction ANTECHAMBER (ZA:/ZR:, one per adjacent thread pair).
// Two nexuses close the deck stack: NX (the TOP-FLOOR fulfillment nexus, bonded to the assembly
// ring — the lift UP to the nave) and ND (the BOTTOM-FLOOR dispatch nexus, bonded to the reclaim
// ring — the shaft DOWN to the lower rind; waste falls outward, so the way down is at the rim).
//
// THE GAME ADAPTATION (vs rind/ops/pocketweave.js — same analytic layer, different plumbing):
//   • MANAGER-FREE. The game surface owns ONE world + ONE walk graph (all decks); this module only
//     SOLVES chunk records, in ABSOLUTE deck coordinates (each pocket at its own SLOT, far apart so
//     pockets never stitch by accident — each pocket is its own island, which is exactly what a
//     pocket dimension is). The surface streams them in like nave wards: prepareWeaveDeck() →
//     weaveSolveNext() one rec per tick, tagged { deck: 1, rind: true, weave: {key, si, kind} }.
//   • DOORS ARE TELEPORT PAIRS (the shaft mechanic, sideways): a crossing is one place, realised as
//     a door cell in each pocket; the two cells pair by pairId = sorted([fromKey, toKey]). The
//     surface registers resolved pairs (weaveDoorPairs) and crossing is crossTo(other end).
//   • Hex pockets (antes, interfaces, nexuses) solve over an explicit world-positioned hex POLY
//     (never shape:'hex' local coords) so nothing ever lands on the nave's coordinates.
//
// Pure + deterministic from (seed); node-tested by ../test/pocketdeck.selftest.mjs.

import { solveChunk } from '../../v099/v8/chunkgen.js';
import { buildGeometry, weaveLines, districtCentres, SEVEN, mulberry32 } from './weavecore.js';
import { ENGINES } from './engines.js';

const TAU = Math.PI * 2;

export const DECK_DEFAULTS = {
  rings: 1, turnScale: 0.35, hexScale: SEVEN, NW: 6, NF: 8, layers: 8, flatR: 0.35,
  spacing: 150,
  H: 220, margin: 150, perStation: 260, minW: 1500, maxW: 2600, alcove: 100, alcoveW: 0.032,
  cellSize: 16, roomSize: 15, concourseWidth: 2,
  bridgeW: 330, bridgeH: 280, wobble: 0.55,
  segArc: 900, gradeScale: 2.2,
  ringRadA: 470, ringRadR: 860, ringSegA: 6, ringSegR: 8, ringZ: 90,
  nexusW: 620, nexusH: 430,          // the two nexus floors (NX top / ND bottom)
  slot: 3600,                        // pocket-slot pitch (world units) — pockets are islands, never adjacent
};
// production floors read as work halls, whites as lived ops floors (the wild-type mix keeps dwell/serve
// rooms, so residents and quest keepers have homes on the white threads — npcs live only there).
const PROD_MIX = [['make', 26], ['store', 12], ['mend', 9], ['move', 7], ['dwell', 9], ['trade', 5], ['grow', 5], ['serve', 3], ['learn', 2]];

// ── ring-mode constants (ringpocket.js verbatim) ──
export const RADIAL_ENGINES = ['foundry', 'chemworks', 'mill', 'fab', 'weave', 'fluid'];
export const RING_ORDER = (() => { const o = []; for (let i = 0; i < 6; i++) { o.push('W' + i); o.push('P' + i); } return o; })();
export const isRingKey = (k) => k === 'RA' || k === 'RR' || k === 'NX' || k === 'ND';
export const isAnte = (k) => typeof k === 'string' && k[0] === 'Z' && k.length > 1 && k[1] !== '';
export const PAIRS = Array.from({ length: 6 }, (_, i) => [RING_ORDER[2 * i], RING_ORDER[2 * i + 1]]);
const pairIndexOf = (threadKey) => Math.max(0, Math.floor(RING_ORDER.indexOf(threadKey) / 2));
export const anteKey = (ringKey, threadKey) => { const p = PAIRS[pairIndexOf(threadKey)]; return 'Z' + ringKey[1] + ':' + p[0] + '+' + p[1]; };
export const anteParts = (k) => { const [rp, pair] = k.slice(1).split(':'); const threads = pair.split('+'); const pairIndex = pairIndexOf(threads[0]); return { ring: 'R' + rp, threads, pairIndex, angle: (2 * pairIndex + 1) / 12 * TAU }; };
const NEXUS_SLOT_A = 0.35 / 12 * TAU;          // NX's door angle on the assembly ring
const NEXUS_SLOT_D = (6 + 0.35) / 12 * TAU;    // ND's door angle on the reclaim ring (opposite side)

// human label per pocket key (the HUD / journal voice)
export function weaveLabel(st, key) {
  // v107: name an antechamber by the human threads it joins, not the raw pair key. "assembly-ring
  // antechamber W0+P0" meant nothing to a player; "the assembly-ring junction of the … thread and the …
  // hall" is walkable guidance.
  const threadName = (t) => t && t[0] === 'W' ? ((st.geo.warps[+t.slice(1)] || {}).id || t)
    : t && t[0] === 'P' ? ((st.geo.wefts[+t.slice(1)] || {}).id || t) : t;
  return key === 'RA' ? 'the assembly ring' : key === 'RR' ? 'the reclaim ring'
    : key === 'NX' ? 'the fulfillment nexus' : key === 'ND' ? 'the dispatch nexus'
    : isAnte(key) ? (() => { const ap = anteParts(key); return `the ${key[1] === 'A' ? 'assembly' : 'reclaim'}-ring junction of the ${threadName(ap.threads[0])} thread and the ${threadName(ap.threads[1])} hall`; })()
    : key[0] === 'X' ? 'an interface chamber'
    : key[0] === 'W' ? `the ${st.geo.warps[+key.slice(1)].id} thread (${st.geo.warps[+key.slice(1)].factionLabel})`
    : key[0] === 'P' ? `the ${st.geo.wefts[+key.slice(1)].id} hall` : key;
}

// ── the analytic stations (pocketweave.js#solveStations verbatim) ──
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

// horizontal arc-length LUT (pocketweave verbatim)
function arcLUT(R, turns, flatR) {
  const M = 200, a = new Float64Array(M + 1); let s = 0;
  for (let i = 1; i <= M; i++) { const rf = i / M; s += Math.hypot(R, rf * R * turns * TAU) / M; a[i] = s; }
  const at = (rf) => { const x = Math.max(0, Math.min(1, rf)) * M, i = Math.floor(x), t = x - i; return i >= M ? a[M] : a[i] + (a[i + 1] - a[i]) * t; };
  const s0 = at(flatR), s1 = at(1);
  const fn = (rf) => (at(rf) - s0) / (s1 - s0);
  fn.total = s1 - s0;
  return fn;
}

function nearestRoad(rec, x, y, used) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < rec.cells.length; i++) {
    if (!rec.road[i] || used.has(i)) continue;
    const c = rec.cells[i], d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// segment-local reachability (pocketweave verbatim): BFS over ONE rec with the walk membership rule
function recReach(rec, src) {
  const seen = new Set();
  if (src < 0) { for (let i = 0; i < rec.cells.length; i++) seen.add(i); return seen; }
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

// a flat-top hexagon polygon inscribed in W×H, centred at (cx, cy) — world-positioned, so hex
// pockets never solve at local origin (which would collide with the nave's coordinates).
function hexPoly(cx, cy, W, H) {
  const rx = W / 2, ry = H / 2, out = [];
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + TAU / 12; out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }); }
  return out;
}

// ── pocket shells ─────────────────────────────────────────────────────────────────────────────
// Each pocket is a lazy shell: geometry now (spine/banks/cuts/doors-to-be), chunk recs on demand
// via st (weaveSolveNext drives them in a fixed order). All coordinates are ABSOLUTE (slot-offset).

// a THREAD pocket (pocketweave.js#buildPocket's band half, slot-offset)
function buildThreadShell(st, key) {
  const o = st.opts, seed = threadSeed(st.seed, key);
  const kind = key[0] === 'W' ? 'white' : 'prod';
  const idx = +key.slice(1);
  const arc = kind === 'white' ? st.arcW : st.arcP;
  const myStations = st.stations.filter((s) => (kind === 'white' ? s.w : s.f) === idx)
    .map((s) => ({ ...s, u: arc(s.rf) }))
    .sort((a, b) => a.u - b.u);
  const targetArc = Math.max(o.minW, Math.min(o.maxW, 400 + o.perStation * myStations.length));
  const sc = targetArc / arc.total, halfW = o.H / 2;
  const line = kind === 'white' ? (rf) => st.lines.lineW(idx, rf) : (rf) => st.lines.lineP(idx, rf);
  const zline = kind === 'white' ? (rf) => st.lines.zW(idx, rf) : (rf) => st.lines.zP(idx, rf);
  const M2 = 72, spine = [];
  for (let i = 0; i <= M2; i++) { const rf = st.lines.flatR + (1 - st.lines.flatR) * i / M2, p = line(rf); spine.push({ rf, x: p[0] * sc, y: p[1] * sc, z: zline(rf) * o.gradeScale }); }
  const norm = () => { for (let i = 0; i <= M2; i++) { const a = spine[Math.max(0, i - 1)], b = spine[Math.min(M2, i + 1)], L = Math.hypot(b.x - a.x, b.y - a.y) || 1; spine[i].nx = -(b.y - a.y) / L; spine[i].ny = (b.x - a.x) / L; } };
  norm();
  // seeded wobble on the directionality (pocketweave verbatim)
  const wrng = mulberry32((seed ^ 0x7abc) >>> 0), p1 = wrng() * TAU, p2 = wrng() * TAU, p3 = wrng() * TAU, p4 = wrng() * TAU, p5 = wrng() * TAU;
  const amp = halfW * o.wobble;
  for (let i = 0; i <= M2; i++) {
    const u = i / M2, taper = Math.min(1, 4 * u) * Math.min(1, 4 * (1 - u));
    const wv = (Math.sin(u * TAU * 2.3 + p1) * 0.5 + Math.sin(u * TAU * 4.7 + p2) * 0.33 + Math.sin(u * TAU * 8.1 + p3) * 0.22
      + Math.sin(u * TAU * 16.3 + p4) * 0.12 + Math.sin(u * TAU * 27.7 + p5) * 0.07) * amp * taper;
    spine[i].x += spine[i].nx * wv; spine[i].y += spine[i].ny * wv;
  }
  norm();
  const q1 = wrng() * TAU, q2 = wrng() * TAU, q3 = wrng() * TAU, q4 = wrng() * TAU;
  const edgeNoise = (u, side) => {
    const a = side > 0 ? q1 : q3, b = side > 0 ? q2 : q4;
    return Math.max(-halfW * 0.3, (Math.sin(u * TAU * 11.7 + a) + Math.sin(u * TAU * 19.3 + b) * 0.6) * halfW * 0.16);
  };
  const uFlat = st.lines.flatR, uOfRf = (rf) => (rf - uFlat) / (1 - uFlat);
  const bumpAt = (u, side) => {
    let b = 0;
    for (const s of myStations) {
      const d = Math.abs(u - uOfRf(s.rf)) / o.alcoveW; if (d >= 1) continue;
      const k = (1 - d) * (1 - d);
      b = Math.max(b, o.alcove * k * ((s.over ? 1 : -1) === side ? 1 : 0.45));
    }
    return b;
  };
  const pad = halfW + o.alcove;
  let mx = 1e9, my = 1e9, Mx = -1e9, My = -1e9;
  for (const p of spine) { mx = Math.min(mx, p.x - pad); my = Math.min(my, p.y - pad); Mx = Math.max(Mx, p.x + pad); My = Math.max(My, p.y + pad); }
  // slot-offset: the band lands INSIDE its own pocket slot, world coordinates
  const slot = st.slots.get(key);
  const sx = slot.x - (mx + Mx) / 2, sy = slot.y - (my + My) / 2;
  for (const p of spine) { p.x += sx; p.y += sy; }
  const bankTop = [], bankBot = [];
  for (let i = 0; i <= M2; i++) {
    const u = i / M2, p = spine[i];
    bankTop.push({ x: p.x + p.nx * (halfW + bumpAt(u, 1) + edgeNoise(u, 1)), y: p.y + p.ny * (halfW + bumpAt(u, 1) + edgeNoise(u, 1)) });
    bankBot.push({ x: p.x - p.nx * (halfW + bumpAt(u, -1) + edgeNoise(u, -1)), y: p.y - p.ny * (halfW + bumpAt(u, -1) + edgeNoise(u, -1)) });
  }
  // THE CUTS: 2–5 segments, each cut snapped away from station alcoves (pocketweave verbatim)
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
    segs.push({ si: k, i0, i1, poly, stations, solved: false, rec: null });
  }
  return { key, kind, spine, segs, doors: [], _halfW: halfW, _uOf: uOfRf, seed, myStations, targetArc };
}

// solve ONE thread segment into a chunk rec + place its doors (pocketweave#ensureSeg + placeThreadDoors)
function solveThreadSeg(st, p, si) {
  const o = st.opts, g = p.segs[si];
  if (g.solved) return g;
  const spine = p.spine, M2 = spine.length - 1;
  const inherit = [];
  if (si > 0) inherit.push({ x: spine[g.i0].x, y: spine[g.i0].y });
  if (si < p.segs.length - 1) inherit.push({ x: spine[g.i1].x, y: spine[g.i1].y });
  const rec = solveChunk({
    seed: threadSeed(st.seed, p.key + '#' + si), foamSeed: p.seed,
    v2: true, poly: g.poly, inherit, cellSize: o.cellSize, roomSize: o.roomSize,
    concourseWidth: o.concourseWidth, roleMix: p.kind === 'prod' ? PROD_MIX : null,
  });
  g.rec = rec; g.solved = true;
  // doors — SEGMENT-LOCAL and solve-order-independent
  const used = new Set();
  let anchor = -1;
  if (g.si === 0) {
    const hub = nearestRoad(rec, spine[0].x, spine[0].y, used);
    if (hub >= 0) {
      used.add(hub); anchor = hub;
      p.doors.push({ key: p.key, si, cell: hub, toKey: anteKey('RA', p.key), label: 'the assembly ring', u: 0 });
    }
  } else {
    const p0 = rec.ports.find((q) => q.inherited);
    anchor = p0 && p0.cell >= 0 ? p0.cell : nearestRoad(rec, spine[g.i0].x, spine[g.i0].y, used);
  }
  if (g.si === p.segs.length - 1) {
    const rim = nearestRoad(rec, spine[M2].x, spine[M2].y, used);
    if (rim >= 0) { used.add(rim); p.doors.push({ key: p.key, si, cell: rim, toKey: anteKey('RR', p.key), label: 'the reclaim ring', u: 1 }); }
  }
  const reach = recReach(rec, anchor);
  const at = (u) => spine[Math.max(0, Math.min(M2, Math.round(u * M2)))];
  for (const s of g.stations) {
    const sp = at(p._uOf(s.rf)), side = s.over ? 1 : -1, off = p._halfW + o.alcove * 0.55;
    const x = sp.x + sp.nx * side * off, y = sp.y + sp.ny * side * off;
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
    p.doors.push({ key: p.key, si, cell, toKey: 'X' + s.w + ':' + s.f, label: p.kind === 'white' ? 'P' + s.f : 'W' + s.w, station: s, over: s.over, district: s.district, u: p._uOf(s.rf) });
  }
  return g;
}

// a RING pocket shell (ringpocket.js#buildRingPocket, slot-offset)
function buildRingShell(st, key) {
  const o = st.opts, isA = key === 'RA', seed = threadSeed(st.seed, key);
  const rad = isA ? o.ringRadA : o.ringRadR, halfW = o.H / 2;
  const slot = st.slots.get(key);
  const cx = slot.x, cy = slot.y, M = 96, nseg = isA ? o.ringSegA : o.ringSegR;
  const zamp = o.ringZ, CTRL = [];
  for (let j = 0; j < 12; j++) CTRL.push({ a: j / 12 * TAU, z: j % 2 === 1 ? 0 : ((j / 2) % 2 === 0 ? zamp : -zamp) });
  CTRL.push({ a: TAU, z: CTRL[0].z });
  const zAt = (a) => { a = ((a % TAU) + TAU) % TAU; for (let k = 0; k < CTRL.length - 1; k++) if (a >= CTRL[k].a && a <= CTRL[k + 1].a) { const t = (a - CTRL[k].a) / (CTRL[k + 1].a - CTRL[k].a); return CTRL[k].z + (CTRL[k + 1].z - CTRL[k].z) * (t * t * (3 - 2 * t)); } return 0; };
  const spine = [];
  for (let i = 0; i <= M; i++) { const a = i / M * TAU; spine.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad, a, z: zAt(a), nx: Math.cos(a), ny: Math.sin(a) }); }
  const bankOut = spine.map((p) => ({ x: p.x + p.nx * halfW, y: p.y + p.ny * halfW }));
  const bankIn = spine.map((p) => ({ x: p.x - p.nx * halfW, y: p.y - p.ny * halfW }));
  const cuts = []; for (let k = 0; k <= nseg; k++) cuts.push(Math.round(M * k / nseg));
  const segs = [];
  for (let k = 0; k < nseg; k++) {
    const i0 = cuts[k], i1 = cuts[k + 1], poly = [];
    for (let i = i0; i <= i1; i++) poly.push({ x: bankOut[i].x, y: bankOut[i].y });
    for (let i = i1; i >= i0; i--) poly.push({ x: bankIn[i].x, y: bankIn[i].y });
    segs.push({ si: k, i0, i1, poly, solved: false, rec: null });
  }
  const shell = { key, kind: 'ring', isAssembly: isA, cx, cy, rad, M, nseg, cuts, spine, segs, doors: [], seed };
  shell.segAt = (a) => { let i = ((a / TAU) % 1 + 1) % 1 * M; for (let k = 0; k < nseg; k++) if (i >= cuts[k] && i < cuts[k + 1]) return k; return nseg - 1; };
  return shell;
}

// solve ONE ring arc segment + its doors (ringpocket#ensureSeg + placeRingDoors, with ND on RR)
function solveRingSeg(st, p, si) {
  const o = st.opts, g = p.segs[si];
  if (g.solved) return g;
  const spine = p.spine;
  // THE LOOP: seam ports at both cut ends; the last arc's end (spine[M]) shares spine[0] with the
  // first arc's start, so the concourse closes into a continuous ring you can walk without end.
  const inherit = [{ x: spine[g.i0].x, y: spine[g.i0].y }, { x: spine[g.i1].x, y: spine[g.i1].y }];
  const rec = solveChunk({ seed: threadSeed(st.seed, p.key + '#' + si), foamSeed: p.seed, v2: true, poly: g.poly, inherit, cellSize: o.cellSize, roomSize: o.roomSize, concourseWidth: o.concourseWidth, roleMix: PROD_MIX });
  g.rec = rec; g.solved = true;
  const used = new Set();
  for (let i = 0; i < 6; i++) {
    const a = (2 * i + 1) / 12 * TAU; if (p.segAt(a) !== g.si) continue;
    const px = p.cx + Math.cos(a) * p.rad, py = p.cy + Math.sin(a) * p.rad;
    const cell = nearestRoad(rec, px, py, used); if (cell < 0) continue; used.add(cell);
    const toKey = 'Z' + p.key[1] + ':' + PAIRS[i][0] + '+' + PAIRS[i][1];
    p.doors.push({ key: p.key, si, cell, toKey, label: PAIRS[i].join('·'), pairIndex: i, angle: a });
  }
  if (p.isAssembly && p.segAt(NEXUS_SLOT_A) === g.si) {
    const px = p.cx + Math.cos(NEXUS_SLOT_A) * p.rad, py = p.cy + Math.sin(NEXUS_SLOT_A) * p.rad;
    const cell = nearestRoad(rec, px, py, used);
    if (cell >= 0) { used.add(cell); p.doors.push({ key: p.key, si, cell, toKey: 'NX', label: 'the fulfillment nexus', angle: NEXUS_SLOT_A }); }
  }
  if (!p.isAssembly && p.segAt(NEXUS_SLOT_D) === g.si) {
    const px = p.cx + Math.cos(NEXUS_SLOT_D) * p.rad, py = p.cy + Math.sin(NEXUS_SLOT_D) * p.rad;
    const cell = nearestRoad(rec, px, py, used);
    if (cell >= 0) { used.add(cell); p.doors.push({ key: p.key, si, cell, toKey: 'ND', label: 'the dispatch nexus', angle: NEXUS_SLOT_D }); }
  }
  return g;
}

// a NEXUS pocket (NX top / ND bottom — ringpocket#buildNexusPocket, world-positioned hex, + ND)
function solveNexus(st, key) {
  const o = st.opts, p = st.pockets.get(key), g = p.segs[0];
  if (g.solved) return g;
  const slot = st.slots.get(key), W = o.nexusW, H = o.nexusH;
  const seed = threadSeed(st.seed, key);
  const rec = solveChunk({ seed, foamSeed: seed, v2: true, poly: hexPoly(slot.x, slot.y, W, H), cellSize: o.cellSize, roomSize: o.roomSize, concourseWidth: o.concourseWidth });
  // gild the central chamber — NX: the lift up to the nave · ND: the shaft down to the lower rind
  let bi = -1, bs = -Infinity;
  for (let i = 0; i < rec.rooms.length; i++) { const r = rec.rooms[i]; if (r.door < 0 || !r.cells.length) continue; const s = r.cells.length - Math.hypot(r.x - slot.x, r.y - slot.y) * 0.6; if (s > bs) { bs = s; bi = i; } }
  if (bi >= 0) {
    const r = rec.rooms[bi]; r.nexus = true;
    if (key === 'NX') { r.role = 'fulfillment'; r.glyph = '⇅'; r.color = '#cbd3e0'; }
    else { r.role = 'descent'; r.glyph = '⇓'; r.color = '#8f96a8'; }
    p.nexusRoom = bi;
  }
  g.rec = rec; g.solved = true;
  const used = new Set();
  const cell = nearestRoad(rec, slot.x, slot.y - H * 0.28, used);
  if (cell >= 0) p.doors.push({ key, si: 0, cell, toKey: key === 'NX' ? 'RA' : 'RR', label: key === 'NX' ? 'the assembly ring' : 'the reclaim ring' });
  return g;
}

// an ANTECHAMBER (ringpocket#buildAntePocket — the zero-grade Y junction: ring + two threads)
function solveAnte(st, key) {
  const o = st.opts, p = st.pockets.get(key), g = p.segs[0];
  if (g.solved) return g;
  const { ring, threads } = anteParts(key);
  const slot = st.slots.get(key), W = Math.round(o.bridgeW * 1.5), H = Math.round(o.bridgeH * 1.35);
  const seed = threadSeed(st.seed, key);
  const rec = solveChunk({ seed, foamSeed: seed, v2: true, poly: hexPoly(slot.x, slot.y, W, H), cellSize: o.cellSize, roomSize: 12, concourseWidth: 2 });
  g.rec = rec; g.solved = true;
  const used = new Set();
  const place = (fx, fy, toKey, label) => { const c = nearestRoad(rec, slot.x + W * fx, slot.y + H * fy, used); if (c < 0) return; used.add(c); p.doors.push({ key, si: 0, cell: c, toKey, label: label || toKey }); };
  place(0, -0.3, ring, ring === 'RA' ? 'the assembly ring' : 'the reclaim ring');
  place(-0.26, 0.3, threads[0]);
  place(0.26, 0.3, threads[1]);
  return g;
}

// an X INTERFACE (pocketweave's bridge pocket — one chamber shared by a white and an engine)
function solveInterface(st, key) {
  const o = st.opts, p = st.pockets.get(key), g = p.segs[0];
  if (g.solved) return g;
  const [bw, bf] = key.slice(1).split(':').map(Number);
  const slot = st.slots.get(key), W = o.bridgeW, H = o.bridgeH;
  const seed = threadSeed(st.seed, key);
  const rec = solveChunk({ seed, foamSeed: seed, v2: true, poly: hexPoly(slot.x, slot.y, W, H), cellSize: o.cellSize, roomSize: 11, concourseWidth: 2 });
  g.rec = rec; g.solved = true;
  const st0 = st.stations.find((s) => s.w === bw && s.f === bf) || null;
  const used = new Set();
  const dW = nearestRoad(rec, slot.x - W * 0.34, slot.y, used);
  if (dW >= 0) { used.add(dW); p.doors.push({ key, si: 0, cell: dW, toKey: 'W' + bw, label: 'W' + bw, station: st0 }); }
  const dP = nearestRoad(rec, slot.x + W * 0.34, slot.y, used);
  if (dP >= 0) { used.add(dP); p.doors.push({ key, si: 0, cell: dP, toKey: 'P' + bf, label: 'P' + bf, station: st0 }); }
  return g;
}

// ── the deck: prepare / solve-next / door pairs ───────────────────────────────────────────────

// SLOT LAYOUT: pockets on a deterministic grid around the deck origin. Analytically flavoured —
// rings + nexuses at the centre column, whites west, engines east, antes between, interfaces far east.
function layoutSlots(st, cx, cy) {
  const S = st.opts.slot, put = (key, gx, gy) => st.slots.set(key, { x: cx + gx * S, y: cy + gy * S });
  put('NX', 0, -1); put('RA', 0, 0); put('RR', 0, 1); put('ND', 0, 2);
  for (let i = 0; i < 6; i++) put('W' + i, -2 - (i % 2), i - 2.5);          // whites: two west columns
  for (let i = 0; i < 6; i++) put('P' + i, 2 + (i % 2), i - 2.5);           // engines: two east columns
  for (let i = 0; i < 6; i++) { put('ZA:' + PAIRS[i][0] + '+' + PAIRS[i][1], -1, i - 2.5); put('ZR:' + PAIRS[i][0] + '+' + PAIRS[i][1], 1, i - 2.5); }
  let k = 0;
  for (const s of st.stations) { put('X' + s.w + ':' + s.f, 4 + (k % 4), Math.floor(k / 4) - 2.5); k++; }
}

export function prepareWeaveDeck(seed, { cx = 0, cy = 0, opts = {} } = {}) {
  seed = (seed | 0) >>> 0;
  const o = { ...DECK_DEFAULTS, ...opts, NF: 6 };   // ring mode: 6 radial engines (assembly & reclaim become the rings)
  const geo = buildGeometry(seed, { rings: o.rings, spacing: o.spacing, layers: o.layers, NW: o.NW, NF: o.NF, turnScale: o.turnScale, hexScale: o.hexScale });
  const lines = weaveLines(geo, { flatR: o.flatR });
  geo.wefts = RADIAL_ENGINES.map((id, f) => ({ id, f, kind: 'prod', ...ENGINES[id] }));
  const st = {
    seed, opts: o, geo, lines, cx, cy,
    stations: solveStations(geo, lines),
    arcW: arcLUT(geo.R, geo.family.turnsW, lines.flatR),
    arcP: arcLUT(geo.R, geo.family.turnsP, lines.flatR),
    slots: new Map(), pockets: new Map(),
    recs: [], meta: [], order: [], idx: 0,
  };
  layoutSlots(st, cx, cy);
  // shells (geometry only — cheap; chunks solve one per tick via weaveSolveNext)
  st.pockets.set('RA', buildRingShell(st, 'RA'));
  st.pockets.set('RR', buildRingShell(st, 'RR'));
  for (const key of ['NX', 'ND']) st.pockets.set(key, { key, kind: 'nexus', segs: [{ si: 0, solved: false, rec: null }], doors: [] });
  for (let i = 0; i < 6; i++) { const k = 'ZA:' + PAIRS[i][0] + '+' + PAIRS[i][1]; st.pockets.set(k, { key: k, kind: 'ante', segs: [{ si: 0, solved: false, rec: null }], doors: [] }); }
  for (let i = 0; i < 6; i++) { const k = 'ZR:' + PAIRS[i][0] + '+' + PAIRS[i][1]; st.pockets.set(k, { key: k, kind: 'ante', segs: [{ si: 0, solved: false, rec: null }], doors: [] }); }
  for (let i = 0; i < 6; i++) st.pockets.set('W' + i, buildThreadShell(st, 'W' + i));
  for (let i = 0; i < 6; i++) st.pockets.set('P' + i, buildThreadShell(st, 'P' + i));
  for (const s of st.stations) { const k = 'X' + s.w + ':' + s.f; st.pockets.set(k, { key: k, kind: 'interface', segs: [{ si: 0, solved: false, rec: null }], doors: [] }); }
  // THE SOLVE ORDER — arrival-first: the top nexus (the shaft lands there), the assembly ring, its
  // antechambers, the six white threads (where the npcs live), then the way down (ND + reclaim ring +
  // its antechambers), the six engine halls, and the interface chambers last.
  const order = [];
  order.push(['NX', 0]);
  for (let k = 0; k < st.pockets.get('RA').nseg; k++) order.push(['RA', k]);
  for (let i = 0; i < 6; i++) order.push(['ZA:' + PAIRS[i][0] + '+' + PAIRS[i][1], 0]);
  for (let i = 0; i < 6; i++) for (let k = 0; k < st.pockets.get('W' + i).segs.length; k++) order.push(['W' + i, k]);
  order.push(['ND', 0]);
  for (let k = 0; k < st.pockets.get('RR').nseg; k++) order.push(['RR', k]);
  for (let i = 0; i < 6; i++) order.push(['ZR:' + PAIRS[i][0] + '+' + PAIRS[i][1], 0]);
  for (let i = 0; i < 6; i++) for (let k = 0; k < st.pockets.get('P' + i).segs.length; k++) order.push(['P' + i, k]);
  for (const s of st.stations) order.push(['X' + s.w + ':' + s.f, 0]);
  st.order = order;
  return st;
}

// solve the NEXT pocket chunk (the rindSolveNext contract): returns { i, rec, key, si } or null.
// The caller adds rec to the live world (tagged deck/rind/weave) and extends the walk graph.
export function weaveSolveNext(st) {
  if (st.idx >= st.order.length) return null;
  const [key, si] = st.order[st.idx], i = st.idx++;
  const p = st.pockets.get(key);
  const g = p.kind === 'ring' ? solveRingSeg(st, p, si)
    : p.kind === 'nexus' ? solveNexus(st, key)
    : p.kind === 'ante' ? solveAnte(st, key)
    : p.kind === 'interface' ? solveInterface(st, key)
    : solveThreadSeg(st, p, si);
  const rec = g.rec;
  rec.weave = { key, si, kind: p.kind };
  st.recs[i] = rec;
  st.meta[i] = { key, si, kind: p.kind, label: weaveLabel(st, key) };
  return { i, rec, key, si };
}

// every door of every SOLVED pocket, with its pairId — two doors sharing a pairId are one crossing
// (a teleport pair). `chunkIdOf(rec)` maps a rec to its live-world chunk id (set by the caller's add).
export function weaveDoorPairs(st) {
  const byPair = new Map();
  for (const p of st.pockets.values()) {
    for (const d of p.doors) {
      const pid = [d.key, d.toKey].sort().join('|');
      let g = byPair.get(pid); if (!g) byPair.set(pid, g = []);
      g.push(d);
    }
  }
  const pairs = [];
  for (const [pid, ds] of byPair) {
    if (ds.length !== 2) continue;   // the other side hasn't solved yet
    pairs.push({ pid, a: ds[0], b: ds[1] });
  }
  return pairs;
}

// the rec that holds a pocket door (for the caller to resolve node ids): door → its segment's rec
export function doorRec(st, d) { return st.pockets.get(d.key).segs[d.si].rec; }

// which pocket key a rec belongs to (or null) — the surface's "which thread am I on"
export function weaveKeyOf(rec) { return rec && rec.weave ? rec.weave.key : null; }

// the NX lift room + ND descent room recs (where the two deck shafts sink)
export function nexusRoomOf(st, key) {
  const p = st.pockets.get(key), g = p.segs[0];
  if (!g.solved || p.nexusRoom == null) return null;
  const r = g.rec.rooms[p.nexusRoom];
  return { rec: g.rec, room: r, x: r.x, y: r.y };
}
