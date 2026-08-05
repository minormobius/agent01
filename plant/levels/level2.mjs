// level2.mjs — a discrete three-way machine choice, not a slider.
//
// LEVEL_1 (plant/levels/level1.mjs) exposes one continuous knob: drag the ore
// rate down until the depot starves. The unanswered ask lp-02e2be is whether
// that satisfies the vision's playability bar — "an intention they formed,
// acted on, and got refused for" — or whether a slider just eases toward a
// label turning red. This is the direct alternative: no drag, no gradient.
// Three buttons, three fixed capacities, one right answer.
//
// ------------------------------------------------------------- the shape
//
//   ore (source, rate 55) -> smelter (capacity: one of 30/48/90) -> depot (demand 50)
//
// Same node/edge shape as LEVEL_1, same production.mjs, unmodified. The knob
// this time is not the source rate but the smelter's own capacity, picked
// from a small fixed menu rather than dragged continuously — an intention
// ("I choose the golden smelter") either satisfies the depot or it does not,
// with no partial credit and no way to nudge toward the answer.
//
// LEVEL_2_BASE ships with the 'cheap' capacity (30) already applied, so the
// page opens already infeasible — the first thing a visitor sees is a broken
// factory, and picking a machine is the fix, not the break (mirrors LEVEL_1's
// own "first look" choice, just inverted: there the shipped state is feasible
// and dragging breaks it, here the shipped state is broken and choosing fixes
// it — two different textures of the same refusal).
//
// SMELTER_OPTIONS is two decoys and one answer, on purpose:
//
//   cheap  (30): scale = min(30, 55/1) = 30  -> achieved 30 -> short by 20 (-40%)
//   good   (48): scale = min(48, 55/1) = 48  -> achieved 48 -> short by  2 ( -4%, a near-miss)
//   golden (90): scale = min(90, 55/1) = 55  -> achieved 55 -> feasible, margin 10% (tight)
//
// 'golden' is the only feasible choice, and its own capacity (90) is not even
// what limits it — the ore source (55/tick) is. A visitor who reasons "bigger
// capacity number wins" gets the right answer for the wrong reason on cheap
// vs. good (30 < 48, both fail) but the puzzle only really bites on golden:
// capacity 90 look wildly over-provisioned next to a demand of 50, and it is
// still only an 10% margin because the smelter was never the bottleneck.
export const LEVEL_2_BASE = {
  nodes: [
    { kind: 'source', id: 'ore', resource: 'ore', rate: 55 },
    {
      kind: 'processor',
      id: 'smelter',
      inputs: [{ resource: 'ore', rate: 1 }],
      outputs: [{ resource: 'gear', rate: 1 }],
      capacity: 30,
    },
    { kind: 'sink', id: 'depot', resource: 'gear', demand: 50 },
  ],
  edges: [
    { from: 'ore', to: 'smelter' },
    { from: 'smelter', to: 'depot' },
  ],
};

export const SMELTER_OPTIONS = [
  { id: 'cheap', label: 'cheap smelter', capacity: 30 },
  { id: 'good', label: 'good smelter', capacity: 48 },
  { id: 'golden', label: 'golden smelter', capacity: 90 },
];
