// ringpocket.js — THE RING TOPOLOGY for the walked pocket (upperrind's `rings` mode). The econ solver +
// the ring-weave schematic showed assembly & reclaim are hubs every thread meets; here they become
// walkable ANNULAR floors that CLOSE INTO A LOOP, brought into the pocket dimension proper.
//
//   • RECLAIM ('RR') — the OUTER ring at the rim; ASSEMBLY ('RA') — the INNER ring at the core. Each is a
//     circular band (annulus) cut into arc SEGMENTS solved by the same v100 rooms+concourse engine as a
//     thread. THE LOOP: the last arc's end-seam port sits at the SAME location as the first arc's
//     start-seam port (spine[M] ≡ spine[0]), so the manager stitches them — the concourse runs continuously
//     all the way around, a true loop you can walk without end.
//   • Each ring places a door to every one of the 12 radial threads (6 white + 6 engine) around its
//     circumference — "touches 12". The assembly ring also carries a door to the FULFILLMENT NEXUS ('NX')
//     at the core.
//   • The 12 threads (built by pocketweave in `rings` mode) grow an INNER door → 'RA' and an OUTER door →
//     'RR' in place of the old commons hub, so hub→rim a thread runs assembly-ring → K-crossings →
//     reclaim-ring. Reciprocity (ringReciprocal) wires ring↔thread and NX↔RA crossings.
//
// Reuses the v100 machinery directly (no coupling back to pocketweave). Pure/deterministic; the loop +
// topology are pinned by rind/upperrind/ringpocket.selftest.mjs.

import { solveChunk } from './v100/chunkgen.js';
import { createWorld, addChunk, buildWalk, extendWalk } from './v100/manager.js';
import { ENGINES } from './engines.js';

const TAU = Math.PI * 2;

// the six RADIAL engines (the eight production verticals minus the two that become rings)
export const RADIAL_ENGINES = ['foundry', 'chemworks', 'mill', 'fab', 'weave', 'fluid'];
// the 12 radial threads in ring order (interleaved white/engine around the circumference)
export const RING_ORDER = (() => { const o = []; for (let i = 0; i < 6; i++) { o.push('W' + i); o.push('P' + i); } return o; })();
export const isRingKey = (k) => k === 'RA' || k === 'RR' || k === 'NX';
const slotOf = (k) => RING_ORDER.indexOf(k);
const NEXUS_SLOT_A = 0.35 / 12 * TAU;   // the nexus door's angle on the assembly ring

// ── local copies of pocketweave's tiny helpers (kept self-contained) ──
function threadSeed(seed, key) { let h = seed >>> 0; for (const ch of key) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0; return (h ^ 0x9e3779b9) >>> 0; }
function nearestRoad(rec, x, y, used) { let best = -1, bd = Infinity; for (let i = 0; i < rec.cells.length; i++) { if (!rec.road[i] || used.has(i)) continue; const c = rec.cells[i], d = (c.x - x) ** 2 + (c.y - y) ** 2; if (d < bd) { bd = d; best = i; } } return best; }
function attach(pocket, g, rec) {
  if (!pocket.world) { pocket.world = createWorld(); addChunk(pocket.world, rec); pocket.walk = buildWalk(pocket.world); }
  else { addChunk(pocket.world, rec); extendWalk(pocket.walk, pocket.world, rec.id); }
  g.rec = rec; g.chunkId = rec.id; g.solved = true; pocket.solvedCount++;
}

// ── an annular ring pocket (RA = inner/assembly, RR = outer/reclaim) — a closed loop ──
export function buildRingPocket(world, key) {
  const o = world.opts, isA = key === 'RA', seed = threadSeed(world.seed, key);
  const rad = isA ? o.ringRadA : o.ringRadR, halfW = o.H / 2, pad = halfW + 60;
  const cx = rad + pad, cy = rad + pad, M = 96, nseg = isA ? o.ringSegA : o.ringSegR;
  const spine = [];
  for (let i = 0; i <= M; i++) { const a = i / M * TAU; spine.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad, a, z: 0, rf: isA ? o.ringRadA / o.ringRadR : 1, nx: Math.cos(a), ny: Math.sin(a) }); }
  const bankOut = spine.map((p) => ({ x: p.x + p.nx * halfW, y: p.y + p.ny * halfW }));
  const bankIn = spine.map((p) => ({ x: p.x - p.nx * halfW, y: p.y - p.ny * halfW }));
  const cuts = []; for (let k = 0; k <= nseg; k++) cuts.push(Math.round(M * k / nseg));
  const segs = [];
  for (let k = 0; k < nseg; k++) {
    const i0 = cuts[k], i1 = cuts[k + 1], poly = [];
    for (let i = i0; i <= i1; i++) poly.push({ x: bankOut[i].x, y: bankOut[i].y });
    for (let i = i1; i >= i0; i--) poly.push({ x: bankIn[i].x, y: bankIn[i].y });
    segs.push({ si: k, i0, i1, poly, solved: false, chunkId: -1, rec: null });
  }
  const pocket = {
    key, kind: 'ring', ring: true, isAssembly: isA, W: cx + rad + pad, H: cy + rad + pad,
    cx, cy, rad, M, nseg, cuts, spine, arches: [], doors: [], doorAt: new Map(), hubDoor: -1,
    world: null, walk: null, segs, solvedCount: 0,
  };
  pocket.segAt = (a) => { let i = ((a / TAU) % 1 + 1) % 1 * M; for (let k = 0; k < nseg; k++) if (i >= cuts[k] && i < cuts[k + 1]) return k; return nseg - 1; };
  pocket.segOf = () => 0;
  pocket.ensureSeg = (si) => {
    const g = segs[si]; if (g.solved) return g;
    // THE LOOP — inherit a seam port at BOTH cut ends; segLast's end (spine[M]) shares spine[0] with seg0's
    // start, so the wrap stitches and the concourse closes into a continuous ring.
    const inherit = [{ x: spine[g.i0].x, y: spine[g.i0].y }, { x: spine[g.i1].x, y: spine[g.i1].y }];
    const rec = solveChunk({ seed: threadSeed(world.seed, key + '#' + si), foamSeed: seed, v2: true, poly: g.poly, inherit, cellSize: o.cellSize, roomSize: o.roomSize, concourseWidth: o.concourseWidth });
    attach(pocket, g, rec);
    placeRingDoors(world, pocket, g);
    return g;
  };
  pocket.ensureAll = () => { for (let k = 0; k < nseg; k++) pocket.ensureSeg(k); };
  return pocket;
}

function placeRingDoors(world, pocket, g) {
  const rec = g.rec, base = pocket.walk.base[g.chunkId], used = new Set();
  for (let t = 0; t < 12; t++) {
    const a = (t + 0.5) / 12 * TAU; if (pocket.segAt(a) !== g.si) continue;
    const px = pocket.cx + Math.cos(a) * pocket.rad, py = pocket.cy + Math.sin(a) * pocket.rad;
    const cell = nearestRoad(rec, px, py, used); if (cell < 0) continue; used.add(cell);
    const toKey = RING_ORDER[t];
    const d = { cell, seg: g.si, node: base + cell, toKey, other: toKey, station: null, label: toKey, ringSlot: t };
    pocket.doors.push(d); pocket.doorAt.set(d.node, d);
  }
  if (pocket.isAssembly && pocket.segAt(NEXUS_SLOT_A) === g.si) {   // assembly ring → the fulfillment nexus
    const px = pocket.cx + Math.cos(NEXUS_SLOT_A) * pocket.rad, py = pocket.cy + Math.sin(NEXUS_SLOT_A) * pocket.rad;
    const cell = nearestRoad(rec, px, py, used);
    if (cell >= 0) { used.add(cell); const d = { cell, seg: g.si, node: base + cell, toKey: 'NX', other: 'NX', station: null, label: 'the fulfillment nexus' }; pocket.doors.push(d); pocket.doorAt.set(d.node, d); }
  }
}

// ── the fulfillment nexus ('NX') — a small core floor bonded to the assembly ring ──
export function buildNexusPocket(world) {
  const o = world.opts, key = 'NX', seed = threadSeed(world.seed, key);
  const W = o.commonsW * 0.66, H = o.commonsH * 0.66;
  const pocket = { key, kind: 'nexus', W, H, spine: null, arches: [], doors: [], doorAt: new Map(), hubDoor: -1, world: null, walk: null, segs: [{ si: 0, solved: false, chunkId: -1, rec: null }], solvedCount: 0, segOf: () => 0 };
  pocket.ensureSeg = () => {
    const g = pocket.segs[0]; if (g.solved) return g;
    const rec = solveChunk({ seed, foamSeed: seed, v2: true, shape: 'hex', W, H, cellSize: o.cellSize, roomSize: o.roomSize, concourseWidth: o.concourseWidth });
    let bi = -1, bs = -Infinity;   // gild the central chamber — the lift up to the nave
    for (let i = 0; i < rec.rooms.length; i++) { const r = rec.rooms[i]; if (r.door < 0 || !r.cells.length) continue; const s = r.cells.length - Math.hypot(r.x - W / 2, r.y - H / 2) * 0.6; if (s > bs) { bs = s; bi = i; } }
    if (bi >= 0) { const r = rec.rooms[bi]; r.nexus = true; r.role = 'fulfillment'; r.glyph = '⇅'; r.color = '#cbd3e0'; }
    attach(pocket, g, rec);
    const base = pocket.walk.base[g.chunkId], used = new Set();
    const cell = nearestRoad(rec, W / 2, H * 0.22, used);   // one door out to the assembly ring
    if (cell >= 0) { const d = { cell, seg: 0, node: base + cell, toKey: 'RA', other: 'RA', station: null, label: 'the assembly ring' }; pocket.doors.push(d); pocket.doorAt.set(d.node, d); }
    return g;
  };
  pocket.ensureAll = () => pocket.ensureSeg(0);
  return pocket;
}

// ── reciprocity for every crossing that involves a ring or the nexus ──
export function ringReciprocal(world, fromKey, door) {
  const to = door.toKey;
  if (to === 'RA' || to === 'RR') {                    // thread → ring: land at the ring's door for this thread
    const ring = world.pocket(to), slot = slotOf(fromKey), a = (slot + 0.5) / 12 * TAU;
    ring.ensureSeg(slot >= 0 ? ring.segAt(a) : 0);
    return ring.doors.find((d) => d.toKey === fromKey) || ring.doors[0] || null;
  }
  if (to === 'NX') { const nx = world.pocket('NX'); nx.ensureSeg(0); return nx.doors.find((d) => d.toKey === fromKey) || nx.doors[0] || null; }
  if (fromKey === 'NX') { const ring = world.pocket('RA'); ring.ensureSeg(ring.segAt(NEXUS_SLOT_A)); return ring.doors.find((d) => d.toKey === 'NX') || ring.doors[0] || null; }
  if (fromKey === 'RA' || fromKey === 'RR') {          // ring → thread: land at the thread's inner (RA) or outer (RR) door
    const th = world.pocket(to);
    if (fromKey === 'RA') th.ensureSeg(0); else th.ensureSeg(th.segs.length - 1);
    return th.doors.find((d) => d.toKey === fromKey) || th.doors[0] || null;
  }
  return null;
}
