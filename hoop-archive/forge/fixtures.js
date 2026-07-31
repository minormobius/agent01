// fixtures.js — WHAT FILLS AND MOVES THROUGH THE CHAMBERS (the anti-soup layer).
//
// The foam geometry is uniform by design — every chamber is a Voronoi cell of one construction process. So
// a foundry and a weave hall have the SAME shapes; if all that distinguished them were a debug tint the map
// would be a homogeneous stew. Identity comes from three overlays the player actually reads:
//
//   1. AMBIENT  — per-engine light + floor (a foundry glows hot orange; a cleanroom is cold cyan; a weave
//                 hall is humid green). The atmosphere says what kind of place this is before you read a glyph.
//   2. FIXTURES — a characteristic MACHINE per process step (the furnace, the loom, the reactor, the
//                 shredder…). The core step gets the big landmark fixture; the rest get smaller equipment.
//   3. MATERIAL — the stuff IN MOTION along the activity graph. This is the real differentiator: topology is
//                 a verb, not a noun. A star that PULSES outward from a hot core, a billet that STREAMS down
//                 a line, a reactor loop that CIRCULATES, a reclaim yard that FANS junk out — all read
//                 instantly even on identical foam, because you see the flow move the way the engine works.
//
// Pure data + helpers (no canvas — the draw code is sprites.js). Node-tested in test/fixtures.selftest.mjs.

import { ENGINES } from './engines.js';

// per-engine atmosphere: `light` = the signature glow at the core; `floor` = the chamber floor tint.
export const AMBIENT = {
  foundry: { light: '#ff7a1e', floor: '#241206', name: 'forge-hot' },
  chemworks: { light: '#b388ff', floor: '#1b1430', name: 'reagent-violet' },
  mill: { light: '#b8c2d2', floor: '#171b22', name: 'mill-steel' },
  fab: { light: '#36d6df', floor: '#06232a', name: 'cleanroom-cyan' },
  weave: { light: '#73d35a', floor: '#0f2410', name: 'weave-humid' },
  assembly: { light: '#f4c542', floor: '#241d06', name: 'line-amber' },
  fluid: { light: '#4f9bff', floor: '#0a1730', name: 'fluid-blue' },
  reclaim: { light: '#ff6a3d', floor: '#26110a', name: 'reclaim-rust' },
  fulfillment: { light: '#cbd3e0', floor: '#191c24', name: 'logistics-white' },
};

// the CORE landmark fixture per engine (the big machine you read the place by). The non-core steps draw a
// smaller generic equipment box carrying the step's own glyph (cheap, still reads as machinery).
export const CORE_FIXTURE = {
  foundry: 'crucible', chemworks: 'retort', mill: 'rollers', fab: 'litho', weave: 'loom',
  assembly: 'conveyor', fluid: 'pump', reclaim: 'shredder', fulfillment: 'lift',
};

// MATERIAL carriers: the SHAPE of the stuff moving, its relative SPEED, and the motion MODE — which is just
// a label for how the engine's activity graph animates (the edges already encode the topology; the mode tags
// the feel for the renderer/legend). The verb is what kills the soup.
export const MATERIAL = {
  foundry: { shape: 'droplet', speed: 1.5, mode: 'pulse', hot: true, label: 'molten metal pulses out from the furnace' },
  chemworks: { shape: 'bubble', speed: 1.0, mode: 'circulate', label: 'reagent circulates the reactor loop' },
  mill: { shape: 'bar', speed: 0.8, mode: 'stream', label: 'a billet streams down the line' },
  fab: { shape: 'chip', speed: 0.55, mode: 'stream', label: 'wafers advance through the graded line' },
  weave: { shape: 'shuttle', speed: 1.2, mode: 'comb', label: 'shuttles cross the spine to the teeth' },
  assembly: { shape: 'part', speed: 0.9, mode: 'merge', label: 'parts converge on the spine, a product leaves' },
  fluid: { shape: 'drop', speed: 1.3, mode: 'circulate', label: 'coolant circulates the reservoir network' },
  reclaim: { shape: 'junk', speed: 1.0, mode: 'fan', label: 'shredded stock fans out to the bales' },
  fulfillment: { shape: 'crate', speed: 0.7, mode: 'lift', hot: false, label: 'product rides the lift up; waste comes down' },
};

export const fixtureOf = (engine, step) => (step === ENGINES[engine].core ? CORE_FIXTURE[engine] : 'machine');
export const ambientOf = (engine) => AMBIENT[engine] || AMBIENT.fulfillment;
export const materialOf = (engine) => MATERIAL[engine] || MATERIAL.fulfillment;

// every shape the sprite renderer must know how to draw (cores + the generic + the carriers).
export const CORE_SHAPES = [...new Set(Object.values(CORE_FIXTURE))];
export const CARRIER_SHAPES = [...new Set(Object.values(MATERIAL).map((m) => m.shape))];

export function validate() {
  const errs = [];
  for (const id of Object.keys(ENGINES)) {
    if (!AMBIENT[id]) errs.push(`${id}: no ambient`);
    if (!CORE_FIXTURE[id]) errs.push(`${id}: no core fixture`);
    if (!MATERIAL[id]) errs.push(`${id}: no material carrier`);
  }
  // every ambient light/floor is a hex colour
  for (const [id, a] of Object.entries(AMBIENT)) { if (!/^#[0-9a-f]{6}$/i.test(a.light) || !/^#[0-9a-f]{6}$/i.test(a.floor)) errs.push(`${id}: bad ambient colour`); }
  // the cores are all distinct (no two engines share a landmark machine — they must read apart)
  if (new Set(Object.values(CORE_FIXTURE)).size !== Object.keys(CORE_FIXTURE).length) errs.push('two engines share a core fixture');
  return errs;
}
