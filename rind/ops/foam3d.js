// foam3d.js — the OPS WEAVE as a 3D PANCAKE: a wide, flat, two-layer voronoi foam disc, woven from
// counter-rotating SPIRALS in the disc plane.
//
//   • The disc is WIDE (radius R) and THIN (two layers — vaguely two floors): an UPPER layer (over) and a
//     LOWER layer (under). A jittered polar lattice of nuclei + lattice adjacency = the volumetric foam.
//   • 6 WHITE spiral-arms wind out from the centre one way; all 6 converge at the centre on the UPPER layer →
//     the white hub. 8 PRODUCTION arms wind the OTHER way; all 8 converge at the centre on the LOWER layer →
//     the production hub. So the SIX STARTS SIT ABOVE THE EIGHT STARTS (white hub upper-centre, production hub
//     lower-centre), and the two hubs are disconnected except by threading the woven body.
//   • counter-rotation ⇒ every white arm crosses every production arm (K(6,8)); upper/lower layer = over/under
//     by plain-weave parity ⇒ every chamber owned (100% of both layers).
//   • the world is made of THREADS, so you can inhabit one: `crossingRad()` + the band-centre helpers let a
//     renderer unroll the disc around any arm (the mapping tech) — your arm straightens to a spine (centre→rim)
//     and the 8 production crossings become stations along it.
//
// A seedable FAMILY (spiral turns + phases per seed; turns-sum ≥ 1 ⇒ K(6,8)). Pure, deterministic, node-tested.

import { ENGINE_RING, ENGINES, supplyChain } from './engines.js';
import { WHITE, warpOver } from './weave.js';

export const DEFAULTS = { R: 320, T: 84, Nrad: 21, Nth: 54, Nz: 2, jitter: 0.5, hubRf: 0.10, seed: 1 };
// the three factions — two white-collar roles each (the nave's lobes + exclusive verbs); gives representation
export const FACTIONS = [
  { id: 'rindwalker', label: 'Rindwalker', color: '#9b6b3a', verbs: ['mend', 'worship'], roleIds: ['perfusion', 'telemetry'], creed: 'maintenance is meaning — the floor\'s health-keepers' },
  { id: 'continuant', label: 'Continuant', color: '#5566b8', verbs: ['govern', 'grow'], roleIds: ['schedule', 'inventory'], creed: 'the voyage must continue — the planners & stewards' },
  { id: 'drift', label: 'Drift', color: '#3bb0c9', verbs: ['move', 'trade'], roleIds: ['dispatch', 'gate'], creed: 'a floor lives only if things move — the circulators' },
];
const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU) % TAU;
const swrap = (a) => { a = wrap(a); return a > Math.PI ? a - TAU : a; };
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function buildFoam3D(seed = DEFAULTS.seed, opts = {}) {
  const o = { ...DEFAULTS, ...opts, seed: (seed >>> 0) };
  const { R, T, Nrad, Nth, Nz, hubRf } = o;
  const NW = WHITE.length, NF = ENGINE_RING.length;
  const rng = mulberry32((o.seed ^ 0x3d0f) >>> 0);

  // seeded family: counter-rotating spiral turns (sum ≥ 1 ⇒ K(6,8)) + phases + spin direction
  const turnsW = 0.6 + 0.4 * rng(), turnsP = 0.6 + 0.4 * rng(), phaseW = rng() * TAU, phaseP = rng() * TAU, dir = rng() < 0.5 ? 1 : -1;
  // FACTIONS — two white-collar roles each (representation), mapped to the nave's three lobes + their exclusive
  // verbs. The arms are placed faction-contiguous so each faction owns a 120° sector of the rosette.
  const byId = Object.fromEntries(WHITE.map((w) => [w.id, w]));
  const warps = FACTIONS.flatMap((fac) => fac.roleIds.map((rid) => ({ ...byId[rid], faction: fac.id, factionLabel: fac.label, factionColor: fac.color, verbs: fac.verbs })))
    .map((wc, w) => ({ ...wc, w }));
  const wefts = ENGINE_RING.map((id, f) => ({ id, f, ...ENGINES[id] }));

  // the spiral band centres (in-plane), as a function of radial fraction rf ∈ [0,1]
  const thW = (w, rf) => wrap((w + 0.5) * TAU / NW + phaseW - dir * turnsW * TAU * rf);
  const thP = (f, rf) => wrap((f + 0.5) * TAU / NF + phaseP + dir * turnsP * TAU * rf);
  const bandW = (th, rf) => Math.min(NW - 1, Math.max(0, Math.floor(NW * wrap(th - phaseW + dir * turnsW * TAU * rf) / TAU)));
  const bandF = (th, rf) => Math.min(NF - 1, Math.max(0, Math.floor(NF * wrap(th - phaseP - dir * turnsP * TAU * rf) / TAU)));
  // radial fraction where white w crosses production f (band centres coincide) — a station along the arm
  function crossingRad(w, f) {
    const c = ((w + 0.5) / NW - (f + 0.5) / NF) + (phaseW - phaseP) / TAU, slope = dir * (turnsW + turnsP);
    for (let n = -2; n <= 2; n++) { const rf = (c - n) / slope; if (rf >= 0.02 && rf <= 1) return rf; }
    return 0.5;
  }

  // ── the volumetric foam: jittered polar lattice (radial × azimuthal × layer), thin in z = the pancake ──
  const id = (ir, ith, iz) => ir * Nth * Nz + ((ith % Nth + Nth) % Nth) * Nz + iz;
  const nuclei = [];
  for (let ir = 0; ir < Nrad; ir++) for (let ith = 0; ith < Nth; ith++) for (let iz = 0; iz < Nz; iz++) {
    const rf = (ir + 0.5 + (rng() - 0.5) * o.jitter) / Nrad;
    const th = wrap((ith + 0.5 + (rng() - 0.5) * o.jitter) / Nth * TAU);
    const z = ((iz + 0.5) / Nz - 0.5) * T;                       // thin vertical (two layers)
    const rad = rf * R, x = rad * Math.cos(th), y = rad * Math.sin(th);
    const over = iz >= Nz / 2;                                   // upper layer = over, lower = under
    const w = bandW(th, rf), f = bandF(th, rf), even = (w + f) % 2 === 0;
    const ownerKind = (over === even) ? 'warp' : 'weft';
    let owner = ownerKind === 'warp' ? { kind: 'warp', idx: w } : { kind: 'weft', idx: f };
    let hub = null;
    if (rf < hubRf) {                                            // the centre tile, split by layer
      if (over) { hub = 'whub'; owner = { kind: 'whub' }; }       // upper-centre = white hub (the six starts, ABOVE)
      else { hub = 'phub'; owner = { kind: 'phub' }; }            // lower-centre = production hub (the eight, BELOW)
    }
    nuclei.push({ i: id(ir, ith, iz), ir, ith, iz, rf, th, x, y, z, rad, over, w, f, even, owner, hub });
  }
  for (const n of nuclei) n.neighbors = [];
  const add = (a, b) => { if (nuclei[a] && nuclei[b]) { nuclei[a].neighbors.push(b); nuclei[b].neighbors.push(a); } };
  for (let ir = 0; ir < Nrad; ir++) for (let ith = 0; ith < Nth; ith++) for (let iz = 0; iz < Nz; iz++) {
    const a = id(ir, ith, iz);
    if (ir + 1 < Nrad) add(a, id(ir + 1, ith, iz));
    add(a, id(ir, ith + 1, iz));                                 // azimuth wraps (the ring closes)
    if (iz + 1 < Nz) add(a, id(ir, ith, iz + 1));               // upper↔lower
  }
  for (const n of nuclei) n.neighbors = [...new Set(n.neighbors)];

  const whiteThreads = warps.map((wc) => ({ ...wc, kind: 'white', cells: nuclei.filter((n) => !n.hub && n.owner.kind === 'warp' && n.w === wc.w).map((n) => n.i) }));
  const prodThreads = wefts.map((wf) => ({ ...wf, kind: 'prod', cells: nuclei.filter((n) => !n.hub && n.owner.kind === 'weft' && n.f === wf.f).map((n) => n.i) }));
  const pairs = new Set(); for (const n of nuclei) if (!n.hub) pairs.add(n.w + ':' + n.f);

  // tours: enter a white arm at the centre hub, ride OUT; meet each production at its crossing radius
  const tours = warps.map((wc) => ({
    w: wc.w, label: wc.label,
    stops: wefts.map((wf) => ({ f: wf.f, engine: wf.id, label: wf.label, glyph: wf.glyph, over: warpOver(wc.w, wf.f), rf: crossingRad(wc.w, wf.f) }))
      .sort((a, b) => a.rf - b.rf),                              // centre (hub) → rim
  }));
  const supply = supplyChain().filter((e) => e.from !== 'fulfillment' && e.to !== 'fulfillment').map((e) => ({ ...e, fa: ENGINE_RING.indexOf(e.from), fb: ENGINE_RING.indexOf(e.to), color: ENGINES[e.from].color }));

  return {
    R, T, Nrad, Nth, Nz, seed: o.seed, NW, NF, warps, wefts, factions: FACTIONS, nuclei, whiteThreads, prodThreads,
    tours, supply, contactPairs: pairs.size, contact: { everyTouchesEvery: pairs.size === NW * NF },
    family: { turnsW, turnsP, phaseW, phaseP, dir }, thW, thP, bandW, bandF, crossingRad, swrap,
  };
}

if (typeof globalThis !== 'undefined') globalThis.RindFoam3D = { buildFoam3D };
