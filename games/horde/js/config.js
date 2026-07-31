/* Hold the Line — tunables, the bestiary, and the card pool.

   Everything a balance change should ever need to touch lives in this file, and
   nothing in here reads the DOM. `test/balance.mjs` imports exactly this plus
   sim.js and plays thousands of runs against it, so a number moved here is a
   number the bot can immediately re-measure.

   Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var H = NS.HORDE = NS.HORDE || {};

  /* ---------------------------------------------------------------- config --

     ARCS is 6 because that is the largest number of directions a thumb can
     still read at a glance on a phone: enough that triage is a real decision,
     few enough that you never have to count.

     Zombies live on a normalised radius: 1.0 is the spawn edge, 0.0 is the
     wall. Keeping the sim unitless means the renderer owns all the pixels and
     the sim can be tested without one. */
  var CONFIG = {
    ARCS: 6,

    // --- the gun -----------------------------------------------------------
    // Damage is continuous, not per-shot. The muzzle flash is a lie the
    // renderer tells; the sim only knows damage-per-second.
    dps: 10,

    // Unfocused arcs still receive this fraction of your DPS. It is the single
    // most important number in the game: at 0 you must be everywhere at once
    // and the game is miserable; at 1 direction stops mattering. 0.08 leaves
    // trash dying on its own while anything real needs your attention.
    // SPILLOVER raises it, but to a hard ceiling (see the card) — an uncapped
    // version of this number deletes the game, which the balance bot proved.
    spill: 0.08,

    // Heat is what turns "point at the worst arc" into a decision. Sustained
    // focus first *droops* (damage falls off, a soft nudge to rotate) and then
    // jams (a hard punishment). The soft stage exists so that good play is
    // rotating on rhythm rather than watching a meter.
    //
    // droop is the number that makes camping cost something. At 0.45 the bot
    // that ignored heat entirely scored the same as the bot that read it — the
    // mechanic was decorative. 0.60 is where reading heat starts to pay.
    heatRate: 0.34,        // per second while focused
    coolRate: 0.55,        // per second while not
    droop: 0.60,           // DPS multiplier lost at heat = 1
    jamTime: 1.4,          // seconds of no fire after a jam
    jamRecoverHeat: 0.35,  // heat left after a jam clears

    // --- the wall ----------------------------------------------------------
    wallMax: 10,

    // --- the grenade -------------------------------------------------------
    // The "damage the horde" verb. Hits the focused arc hard and splashes to
    // both neighbours, so aiming it is itself a small allocation problem.
    grenadeCd: 11,
    grenadeDmg: 22,
    grenadeSplash: 0.4,

    // --- the director ------------------------------------------------------
    briefTime: 2.2,        // "WAVE n" beat before the spawns start
    gateTime: 6.0,         // seconds to choose an upgrade
    gateOffers: 3,

    // Wave budget in spawn points, and how long the wave has to spend them.
    // Bodies grow linearly so the screen stays readable.
    waveBudget: function (w) { return 5 + 3.2 * w; },
    waveDuration: function (w) { return Math.min(26, 12 + 0.6 * w); },
    // How many arcs a wave is allowed to use. Wave 1 uses two; by wave 11 you
    // are genuinely surrounded.
    waveArcs: function (w) { return Math.max(2, Math.min(6, 1 + Math.ceil(w / 2))); },

    // Zombie HP grows *geometrically*, and this is the most important balance
    // decision in the game. The player's power also compounds — a card is a
    // percentage, and you get one per wave — so linear horde scaling means the
    // player runs away with it for ever. (The first balance run had every seed
    // hitting the 40-wave cap.) Matching the horde's curve to the player's and
    // putting it slightly ahead is what makes a run end.
    hpScale: function (w) { return Math.pow(1.19, w - 1); },
    speedScale: function (w) { return Math.min(1.6, 1 + 0.035 * (w - 1)); },

    // Fixed simulation timestep. The render loop accumulates real time and
    // calls step() in exact 1/120s slices, so a 60Hz phone, a 144Hz desktop
    // and the headless bot all compute the identical run.
    dt: 1 / 120,
  };

  /* -------------------------------------------------------------- bestiary --

     `pts` is the spawn-point cost the director pays. `dmg` is wall damage on a
     leak. `clump` spawns that many at once from one arc. */
  var ZOMBIES = {
    walker: { id: "walker", name: "walker", hp: 4,  speed: 0.085, dmg: 1, pts: 1,   minWave: 1, clump: 1 },
    runner: { id: "runner", name: "runner", hp: 2.5, speed: 0.165, dmg: 1, pts: 1,  minWave: 3, clump: 1 },
    swarm:  { id: "swarm",  name: "swarm",  hp: 1,  speed: 0.115, dmg: 1, pts: 0.7, minWave: 4, clump: 4 },
    brute:  { id: "brute",  name: "brute",  hp: 22, speed: 0.048, dmg: 3, pts: 4,   minWave: 5, clump: 1 },
  };

  /* ----------------------------------------------------------- the cards ----

     The gate is the whole game. These are deliberately written in the register
     of the adverts that inspired this — big round percentages, one clear verb,
     and a couple of cards that are actively bad for you if you misread them.

     `weight` is a crude power ranking. It does double duty: it keeps the offer
     shuffle from stacking three run-winners, and it decides which card you get
     when the timer runs out — you are handed the *weakest* option on the table.
     The genre never punishes indecision with nothing; it punishes it with a bad
     default, which is much more effective at making you choose.

     `apply(run)` may touch mods, the wall, or the live horde.

     Note the ceilings on the repeatable cards (spill, tar, grenade_cd,
     autoloader). Every one of those was an uncapped multiply in the first
     draft, and the balance bot showed what that does: a run that saw SPILLOVER
     six times had spill at 0.57, at which point aiming stops mattering and the
     game is over as a game. A repeatable card needs an asymptote. */
  var UPGRADES = [
    {
      id: "damage", name: "HEAVIER ROUNDS", blurb: "+30% damage",
      weight: 5, minWave: 1, repeatable: true,
      apply: function (run) { run.mods.dps *= 1.30; },
    },
    {
      // The risk card. Heat is additive here and in COOLANT LOOP on purpose:
      // as multiplies they simply cancelled out and neither card had a feel.
      id: "overdrive", name: "OVERDRIVE", blurb: "+75% damage · runs much hotter",
      weight: 6, minWave: 2, repeatable: true, risky: true,
      apply: function (run) { run.mods.dps *= 1.75; run.mods.heatRate += 0.14; },
    },
    {
      id: "coolant", name: "COOLANT LOOP", blurb: "much slower heat buildup",
      weight: 5, minWave: 1, repeatable: true,
      apply: function (run) { run.mods.heatRate = Math.max(0.12, run.mods.heatRate - 0.07); },
    },
    {
      id: "autoloader", name: "AUTOLOADER", blurb: "clear jams far faster",
      weight: 4, minWave: 2, repeatable: true,
      apply: function (run) { run.mods.jamTime = Math.max(0.4, run.mods.jamTime - 0.45); },
    },
    {
      id: "spill", name: "SPILLOVER", blurb: "unfocused arcs +6% of your DPS",
      weight: 6, minWave: 2, repeatable: true,
      apply: function (run) { run.mods.spill = Math.min(0.30, run.mods.spill + 0.06); },
    },
    {
      id: "twin", name: "TWIN MOUNT", blurb: "your fire covers both neighbouring arcs at 45%",
      weight: 8, minWave: 4, repeatable: false,
      apply: function (run) { run.mods.twin = 0.45; },
    },
    {
      id: "wall", name: "REBUILD", blurb: "+3 max wall · repair 2",
      weight: 5, minWave: 1, repeatable: true,
      apply: function (run) {
        run.mods.wallMax += 3;
        run.wall.max = run.mods.wallMax;
        run.wall.hp = Math.min(run.wall.max, run.wall.hp + 2);
      },
    },
    {
      // The designated bad default: this is what the timer hands you when you
      // freeze, and at a gate your wall is often already near full — so
      // indecision is punished with a card that does almost nothing. That is
      // the genre's actual trick, and it is much crueller than offering
      // nothing at all.
      id: "patch", name: "PATCH THE GAP", blurb: "repair 6 wall now",
      weight: 2, minWave: 1, repeatable: true,
      apply: function (run) { run.wall.hp = Math.min(run.wall.max, run.wall.hp + 6); },
    },
    {
      id: "medic", name: "FIELD MEDIC", blurb: "repair 2 wall after every wave",
      weight: 6, minWave: 3, repeatable: false,
      apply: function (run) { run.mods.clearRepair += 2; },
    },
    {
      id: "tar", name: "TAR PITS", blurb: "the horde moves slower",
      weight: 7, minWave: 2, repeatable: true,
      apply: function (run) { run.mods.speedMul = Math.max(0.55, run.mods.speedMul - 0.12); },
    },
    {
      id: "grenade_cd", name: "BANDOLIER", blurb: "much shorter grenade cooldown",
      weight: 5, minWave: 2, repeatable: true,
      apply: function (run) { run.mods.grenadeCd = Math.max(3.5, run.mods.grenadeCd * 0.72); },
    },
    {
      // Grenade damage is flat while zombie HP is geometric, so this card has
      // to scale hard just to stay relevant into the late waves.
      id: "grenade_pow", name: "SHAPED CHARGE", blurb: "+80% grenade damage",
      weight: 4, minWave: 2, repeatable: true,
      apply: function (run) { run.mods.grenadeDmg *= 1.80; },
    },
    {
      // Was "kill everything past the halfway line, now" — which read well and
      // was a guaranteed no-op, because a gate only opens once the field is
      // clear. Same fantasy (kill them at the back), as a lasting effect.
      id: "sniper", name: "SNIPER'S NEST", blurb: "+120% damage to the far half of an arc",
      weight: 4, minWave: 2, repeatable: false,
      apply: function (run) { run.mods.outer = 1.20; },
    },
    {
      id: "scrap", name: "SALVAGE CREW", blurb: "+1 card offered at every future gate",
      weight: 7, minWave: 3, repeatable: false,
      apply: function (run) { run.mods.gateOffers += 1; },
    },
    {
      id: "execute", name: "HOLLOW POINTS", blurb: "+60% damage to anything under half health",
      weight: 6, minWave: 3, repeatable: false,
      apply: function (run) { run.mods.execute = 0.60; },
    },
  ];

  H.CONFIG = CONFIG;
  H.ZOMBIES = ZOMBIES;
  H.UPGRADES = UPGRADES;
})();
