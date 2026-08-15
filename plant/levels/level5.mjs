// level5.mjs — the first level where the PLAYER's own choice decides who gets
// fed, not a formula.
//
// LEVEL_4 (plant/levels/level4.mjs) fans one source out to two sinks, but the
// split itself comes from autoSplit() — proportional to demand, no lever a
// player can move. Vision priority 1 calls the actual decision "splitting a
// shared output between competing consumers... the genre's central decision",
// and autoSplit removes exactly that decision from the player's hands.
// production.mjs already supports the other half of fan-out: an explicit
// per-edge `share` the network literal sets directly (landed turn 15/lp-34239d,
// plant/test/production.selftest.mjs's "fan-out WITH explicit shares" block).
// No level exercises it as a player lever until this one.
//
// ------------------------------------------------------------- the shape
//
//   well (source, resource water, rate 100)
//     --share shareA-->     fieldA (sink, demand 30)
//     --share (1-shareA)--> fieldB (sink, demand 50)
//
// The two edges' shares are defined as `shareA` and `1 - shareA` — they always
// sum to exactly 1, so this network is ALWAYS legal input to feasible(): the
// "over-allocate" refusal only triggers above a sum of 1 (production.mjs
// analyse(), the `sum > 1 + 1e-9` check), and the per-edge (0, 1] bound is
// only violated at the extremes shareA=0 or shareA=1, both outside this
// level's intended play range. So this level is entirely about the
// FEASIBILITY trade-off — who gets shorted — never the illegal-network throw,
// which stays untouched and out of scope (see level5.selftest.mjs's
// no-throw-invariant case).
//
// achievedA = 100*shareA, achievedB = 100*(1-shareA). Both sinks are fed
// simultaneously (ok=true, no deficits) exactly when shareA is in [0.30,
// 0.50] — a real window, not a knife-edge:
//   shareA >= 30/100 = 0.30   (else fieldA short)
//   shareA <= 0.50            (else fieldB short, since 1-shareA must be
//                                 >= 50/100 = 0.50)
//
// The optimal point inside that window — equal margins on both sinks, the
// same max-min-fair signature autoSplit()'s own docstring proves — is
// shareA = 30/80 = 0.375, giving margin 0.25 on BOTH sinks (band
// 'comfortable'; see level5.selftest.mjs's fair-split case).
//
// SHIPPED at shareA = 0.30 — the LOW edge of the valid window: fieldA is
// exactly met (margin 0) and fieldB has slack (margin 0.4), so the overall
// margin (the min across sinks) is 0, band 'tight' — the same "opens
// feasible, barely" texture LEVEL_1/LEVEL_3/LEVEL_4 all ship with.
//
// THE NEW LESSON: nudging shareA up toward 0.375 improves BOTH sinks at once
// (fieldA gains margin, fieldB still has slack to give); past 0.375 the trade
// reverses and fieldA's margin is traded away to keep growing fieldB's,
// eventually starving fieldB from the other side past 0.50. Drop shareA below
// 0.30 and fieldA starves while fieldB gains. One lever, two distinct and
// OPPOSITE failure directions — no earlier level has this (LEVEL_1/2/3 each
// have exactly one failure direction; LEVEL_4's failure is symmetric across
// both sinks, not directional).
export const LEVEL_5 = {
  nodes: [
    { kind: 'source', id: 'well', resource: 'water', rate: 100 },
    { kind: 'sink', id: 'fieldA', resource: 'water', demand: 30 },
    { kind: 'sink', id: 'fieldB', resource: 'water', demand: 50 },
  ],
  edges: [
    { from: 'well', to: 'fieldA', share: 0.3 },
    { from: 'well', to: 'fieldB', share: 0.7 },
  ],
};

/**
 * The level with the player's own share choice applied — LEVEL_5's discrete
 * lever. Returns a new level object: the edge whose `to` is `fieldA` gets
 * `share: shareA`, the edge whose `to` is `fieldB` gets `share: 1 - shareA`
 * (matched by the edge's `to` field, not array position), every other field
 * and node byte-identical, input never mutated — same contract as
 * `withSourceRate`/`withProcessorCapacity` in level-view.js.
 *
 * Kept local to this level rather than added to level-view.js: lp-bc6980 is
 * an open, ready ticket editing that file's edge-handling logic right now,
 * and level2.mjs's SMELTER_OPTIONS is the existing precedent for a level
 * keeping level-specific helpers in its own module.
 */
export function withShareA(level, shareA) {
  return {
    ...level,
    edges: level.edges.map((e) => {
      if (e.to === 'fieldA') return { ...e, share: shareA };
      if (e.to === 'fieldB') return { ...e, share: 1 - shareA };
      return e;
    }),
  };
}
