// level3.mjs — two independently player-set bottlenecks, not one.
//
// LEVEL_1 exposes one continuous knob (the ore rate) against one fixed
// processor capacity. LEVEL_2 exposes one discrete choice (which smelter)
// against one fixed source rate. Both levels have exactly one thing that can
// ever be the bottleneck. This is the first level where TWO different
// capacities can each independently starve the depot — dragging either one
// down breaks it, which is the new lesson LEVEL_1 and LEVEL_2 cannot teach.
//
// ------------------------------------------------------------- the shape
//
// Four nodes, straight line — satisfies production.mjs's v1 restriction of at
// most one outgoing edge per node (no fan-out, no convergence):
//
//   ore (source, rate 300)
//     -> miner    (processor, inputs ore/1 -> outputs ingot/1, capacity 70)
//     -> smelter  (processor, inputs ingot/1 -> outputs gear/1, capacity 45)
//     -> depot    (sink, resource gear, demand 44)
//
// Ore's rate (300) is deliberately far above anything either processor can
// ever consume — LEVEL_1's own device (plant/levels/level1.mjs) for keeping
// the source from ever being the bottleneck, reused here so the puzzle is
// only ever about the two processor capacities, never about supply.
//
// Hand-computed, as shipped:
//   scale_miner   = min(capacity 70, supply 300 / inputRate 1) = 70
//                   -> ingot out = 70 * 1 = 70
//   scale_smelter = min(capacity 45, supply 70 / inputRate 1)  = 45
//                   -> gear out  = 45 * 1 = 45
//   depot achieved = 45, demand 44 -> margin = (45 - 44) / 44 = 1/44 ≈ 0.0227
//   band(margin) === 'tight' (default threshold 0.15) — LEVEL_1's own
//   texture: opens feasible, barely.
//
// Because ore never binds, achieved always equals exactly
// min(minerCapacity, smelterCapacity) — no hidden arithmetic, so the level
// stays legible from the two capacity numbers plant/level-view.js's
// drawLevel() already prints on each processor's box (`capacity ${n.capacity}`).
// No change to level-view.js or production.mjs was needed or made.
export const LEVEL_3 = {
  nodes: [
    { kind: 'source', id: 'ore', resource: 'ore', rate: 300 },
    {
      kind: 'processor',
      id: 'miner',
      inputs: [{ resource: 'ore', rate: 1 }],
      outputs: [{ resource: 'ingot', rate: 1 }],
      capacity: 70,
    },
    {
      kind: 'processor',
      id: 'smelter',
      inputs: [{ resource: 'ingot', rate: 1 }],
      outputs: [{ resource: 'gear', rate: 1 }],
      capacity: 45,
    },
    { kind: 'sink', id: 'depot', resource: 'gear', demand: 44 },
  ],
  edges: [
    { from: 'ore', to: 'miner' },
    { from: 'miner', to: 'smelter' },
    { from: 'smelter', to: 'depot' },
  ],
};
