/* Outbound — every tunable number, in one place.
 *
 * Same reason /horde/ has one: these numbers are the game, and hunting them
 * through three files makes tuning guesswork. They are read at call time, not
 * captured, so `test/sweep.mjs` can walk the space and report what each setting
 * does to the shape of the decisions rather than to how it feels to me at 2am.
 *
 * The load-bearing relationship is CREW CAPACITY vs ROUTE LENGTH.
 *
 *   capacity ≈ crew × (maxStrain - 1) safe sends, plus fuel / average toll burns
 *
 * When capacity comfortably exceeds the route, nothing is ever weighed and the
 * solver reports that most choices have no wrong answer. Every number below was
 * moved at least once trying to fix that by feel; the sweep is what settled it.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var O = NS.OUTBOUND = NS.OUTBOUND || {};

  O.CFG = {
    // --- the crew ---------------------------------------------------------
    crewSize: 5,
    // Disciplines aboard, out of the six that exist. Fewer than six is what
    // makes trouble nobody can meet possible at all.
    crewRoles: 4,
    /* Sends before you lose someone, and by a distance the most sensitive
       number in the game — it multiplies straight into crew capacity, which is
       the thing that has to stay scarce against the length of the road.

       The sweep settled this one. At 3 sends, 44% of decisions on a perfect
       crossing had no wrong answer at all; at 2 that falls to 21% and the share
       where half the options are traps rises from 33% to 48%. Two is also the
       more honest reading of the fiction: you get one hard job out of somebody,
       and the second one is the one that does not end well. */
    maxStrain: 2,

    // --- fuel -------------------------------------------------------------
    startFuel: 12,
    maxFuel: 16,
    refuelPerLeg: 6,
    restCost: 2,
    restRelief: 1,

    // --- the road ---------------------------------------------------------
    baseStages: 7,
    stagesPerLeg: 0.9,
    maxStages: 14,
    // Systems nobody aboard is trained for.
    baseDeficit: 1,
    deficitPerLeg: 0.5,
    maxDeficit: 5,
    // …but never more than this share of the run, or the road reads as one
    // repeated sentence and most systems stop offering a choice at all.
    maxBlindShare: 0.34,
    // A system may be a longer burn than its kind suggests; this caps that.
    maxToll: 6,
    // Above this share of viable options, the generator keeps tightening.
    loose: 0.66,
    // How far past the plan the road may be padded when nothing else tightens.
    maxPadding: 5,
  };
})();
