// level1.mjs — the first concrete recipe network gate 5 can grade.
//
// Vision priority 3: "A LEVEL SOMEONE CAN LOSE." Everything built against
// production.mjs so far (plant/test/production.selftest.mjs) is a synthetic
// network invented to exercise one code path. This is the other direction: a
// single network that CLAIMS to be a level, in production.mjs's existing
// node/edge shape, checked by plant/test/level1.selftest.mjs.
//
// ------------------------------------------------------------- the shape
//
// One line, no fan-out, no convergence — the smallest network production.mjs
// can grade at all: a source mines ore, a smelter turns ore into gear at a
// fixed capacity, a depot demands gear.
//
//   ore (source, rate 1000) -> smelter (capacity 51) -> depot (demand 50)
//
// The source rate (1000) is deliberately far above what the smelter can ever
// consume — it exists so the smelter's OWN capacity is the thing that binds,
// not an accident of supply. That capacity is gate 5's scale computation:
// scale = min(capacity, supply / inputRate) = min(51, 1000/1) = 51, so the
// smelter emits 51 gear/tick against a depot that demands 50.
//
// margin = (achieved - demand) / demand = (51 - 50) / 50 = 0.02 — feasible,
// by exactly 2%. FACTORIO.md §3 names margin the difficulty dial: a network
// with a huge margin is a diagram, not a puzzle. This is the smallest
// integer-clean margin above zero this network's numbers can express, chosen
// on purpose (decision, see the selftest header for the reversal condition).
export const LEVEL_1 = {
  nodes: [
    { kind: 'source', id: 'ore', resource: 'ore', rate: 1000 },
    {
      kind: 'processor',
      id: 'smelter',
      inputs: [{ resource: 'ore', rate: 1 }],
      outputs: [{ resource: 'gear', rate: 1 }],
      capacity: 51,
    },
    { kind: 'sink', id: 'depot', resource: 'gear', demand: 50 },
  ],
  edges: [
    { from: 'ore', to: 'smelter' },
    { from: 'smelter', to: 'depot' },
  ],
};
