// level4.mjs — the first level with a real fan-out: one source, two sinks
// with DIFFERENT demand, competing for the same supply.
//
// Levels 1-3 are all straight lines (vision.md: "every level so far is a
// straight line... levels 1-3 are lines BY FORCE, not by choice" — v1's
// feasible() throws on an unsplit fan-out). This is the first level shaped
// like the other kind of decision the genre is actually about: a single
// source feeding more than one consumer, where the consumers' fates are now
// coupled through the split rather than each having its own private
// bottleneck.
//
// ------------------------------------------------------------- the shape
//
//   ore (source, rate R)
//     -> stockpileA (sink, resource ore, demand 30)
//     -> stockpileB (sink, resource ore, demand 70)
//
// Neither edge carries an explicit `share` — this network is not valid input
// to `feasible()` on its own (production.mjs refuses an unsplit fan-out by
// design, see its header and plant/test/production.selftest.mjs's "fan-out
// without an explicit share is refused" block). It must be passed through
// `autoSplit()` first, which — because both destinations are sinks and each
// is fed by exactly this one edge in the whole network — fills
// `share = demand / totalDemand` for each: 30/100 = 0.3 and 70/100 = 0.7,
// the max-min-optimal split (production.mjs's autoSplit() doc comment works
// the proof; production.selftest.mjs's autoSplit block already pins these
// exact numbers for a 30/70 demand split).
//
// The player's lever is the source rate (this ticket's scope; a future
// ticket's lever could be which sinks are even connected). Shipped at
// R = 102 — just above the total demand of 100 — both sinks are fed exactly
// their proportional share of a 2% surplus:
//
//   achieved.stockpileA = 102 * 0.3 = 30.6  (demand 30, margin (30.6-30)/30 = 0.02)
//   achieved.stockpileB = 102 * 0.7 = 71.4  (demand 70, margin (71.4-70)/70 = 0.02)
//
// Both margins come out EQUAL — that is the signature of the proportional
// split, not a coincidence of these numbers (autoSplit sets
// share_i = demand_i / total specifically so achieved_i / demand_i is the
// same for every sink in the group; see production.mjs's proof). So the
// level's overall margin is 0.02, `band()` calls it 'tight' — the same
// "opens feasible, barely" texture as LEVEL_1 and LEVEL_3.
//
// THE NEW LESSON, decided rather than left implicit: because the split is
// proportional, dropping the source rate does not sacrifice one sink to keep
// the other whole — both sinks fall short by the SAME fraction of their own
// demand, but not the same absolute amount (stockpileB has 70/30 = 2.33x
// stockpileA's demand, so it loses 2.33x as many units for the same
// percentage shortfall). A player watching both boxes go red at once, by
// different amounts, is the first time a single lever's failure is shared
// across more than one sink rather than isolated to one — the coupling
// fan-out introduces, not a "pick a favorite" mechanic. (`plant/test/level4.selftest.mjs`
// pins this exactly; a ticket wanting an actual favor-one-over-the-other
// lever needs explicit per-edge `share`, not `autoSplit`, and is a different
// level.)
export const LEVEL_4 = {
  nodes: [
    { kind: 'source', id: 'ore', resource: 'ore', rate: 102 },
    { kind: 'sink', id: 'stockpileA', resource: 'ore', demand: 30 },
    { kind: 'sink', id: 'stockpileB', resource: 'ore', demand: 70 },
  ],
  edges: [
    { from: 'ore', to: 'stockpileA' },
    { from: 'ore', to: 'stockpileB' },
  ],
};
