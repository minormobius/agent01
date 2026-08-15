// level6.mjs — the first level neither autoSplit() nor a straight line can
// express: fan-out into two PROCESSORS with different yields.
//
// LEVEL_4 (autoSplit, proportional-to-demand) and LEVEL_5 (player-set explicit
// share) both fan a source out directly to two SINKS with no conversion in
// between — neither can express "which recipe should get more of the ore",
// because neither branch converts the resource at a different rate.
// production.mjs's analyse()/feasible() already accept a fan-out edge whose
// destination is a PROCESSOR as long as the group's shares are explicit
// (grouping is by (from, resolved resource), never by `to.kind` — see
// analyse()'s groupsByFrom construction, and the FINDING this ticket cites).
// No level has ever exercised that path; this is the first.
//
// ------------------------------------------------------------- the shape
//
//   ore (source, rate 100)
//     --share shareA-->     smelterA (processor, ore -> ingot at 0.6/ore, capacity 100)
//     --share (1-shareA)--> smelterB (processor, ore -> ingot at 1.0/ore, capacity 100)
//   smelterA -> depotA (sink, demand 24)   -- single edge, share defaults to 1
//   smelterB -> depotB (sink, demand 50)   -- single edge, share defaults to 1
//
// Both smelter capacities (100) are set so they never bind: the worst-case
// supply to either smelter is the full source rate of 100, and 100/1 = 100
// <= capacity. So this level is entirely about the YIELD trade-off (0.6 vs
// 1.0 ingot per ore) — LEVEL_3 already owns the capacity-bottleneck lesson,
// and this one deliberately does not repeat it.
//
// Both depots receive achieved = 100 * share * yield. Both sinks are fed
// simultaneously (ok=true, no deficits) exactly when shareA is in [0.4, 0.5]:
//   shareA >= 0.4   (else depotA short: 100*shareA*0.6 < 24)
//   shareA <= 0.5   (else depotB short: 100*(1-shareA)*1.0 < 50)
//
// The fair point — equal margins on both sinks — is shareA = 4/9 (a repeating
// decimal; level6.selftest.mjs computes it as a fraction, never a rounded
// literal), giving margin 1/9 on BOTH sinks. Still band 'tight' (1/9 < 0.15),
// a different texture from LEVEL_5's fair point (0.375, margin 0.25,
// 'comfortable') — this level's window is genuinely tighter, a consequence of
// the yields (0.6 and 1.0) rather than a copy of LEVEL_5's numbers.
//
// SHIPPED at shareA = 0.4 — the LOW edge of the valid window, same convention
// as LEVEL_5: depotA is exactly met (margin 0), depotB has slack (margin
// 0.2), overall margin = min(0, 0.2) = 0, band 'tight' — the same "opens
// feasible, barely" texture every prior level ships with.
export const LEVEL_6 = {
  nodes: [
    { kind: 'source', id: 'ore', resource: 'ore', rate: 100 },
    {
      kind: 'processor',
      id: 'smelterA',
      inputs: [{ resource: 'ore', rate: 1 }],
      outputs: [{ resource: 'ingot', rate: 0.6 }],
      capacity: 100,
    },
    {
      kind: 'processor',
      id: 'smelterB',
      inputs: [{ resource: 'ore', rate: 1 }],
      outputs: [{ resource: 'ingot', rate: 1.0 }],
      capacity: 100,
    },
    { kind: 'sink', id: 'depotA', resource: 'ingot', demand: 24 },
    { kind: 'sink', id: 'depotB', resource: 'ingot', demand: 50 },
  ],
  edges: [
    { from: 'ore', to: 'smelterA', share: 0.4 },
    { from: 'ore', to: 'smelterB', share: 0.6 },
    { from: 'smelterA', to: 'depotA' },
    { from: 'smelterB', to: 'depotB' },
  ],
};

/**
 * The level with the player's own share choice applied — same contract as
 * `withShareA` in level5.mjs. Returns a new level object: the edge whose
 * `to` is `smelterA` gets `share: shareA`, the edge whose `to` is `smelterB`
 * gets `share: 1 - shareA` (matched by the edge's `to` field, not array
 * position), every other field and node byte-identical, input never mutated.
 *
 * Kept local to this level, same precedent as level2.mjs's SMELTER_OPTIONS
 * and level5.mjs's own withShareA — level-specific helpers live in the
 * level's own module, not level-view.js.
 */
export function withShareA(level, shareA) {
  return {
    ...level,
    edges: level.edges.map((e) => {
      if (e.to === 'smelterA') return { ...e, share: shareA };
      if (e.to === 'smelterB') return { ...e, share: 1 - shareA };
      return e;
    }),
  };
}
