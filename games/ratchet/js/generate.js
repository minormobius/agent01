/* The Ratchet — the route generator.
 *
 * (seed, route number, the supply you arrive with) -> a route. Everything is
 * decided here and nothing after, so a route is a fixed puzzle.
 *
 * The contract, same as Telegraph's: a route handed to the player must be
 * completable. Note it is checked against the supply you ACTUALLY arrive with,
 * not some nominal starting value — a route that would be fair at full supply
 * and impossible at three is still an impossible route.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var R = NS.RATCHET = NS.RATCHET || {};

  var START_SUPPLY = 8;
  var MAX_SUPPLY = 10;
  var REFILL_PER_ROUTE = 3;

  /* Tuned against test/analysis.mjs. `deficit` is the number of stages you
     cannot possibly solve with tools — the engine of the whole game, because it
     forces you to choose which stages to simply absorb. */
  function routePlan(route) {
    var stages = Math.min(14, 6 + Math.floor(route * 0.8));
    /* Tuned against test/analysis.mjs, and it is a genuinely narrow window.
       At /3 the routes go soft — median narrowest-choice stays at 100% through
       level 5 and almost no run is ever fatally committed. At /2 the squeeze
       arrives while there is still road left to walk, which is the only place
       the foresight gap can exist at all. */
    var deficit = Math.min(7, 1 + Math.floor(route / 2));
    return {
      stages: stages,
      kit: Math.max(3, Math.min(8, stages - deficit)),
      rewards: route >= 2 ? 1 + (route >= 5 ? 1 : 0) : 0,
    };
  }

  /* Trimming threshold. This was 0.8 with two removals, which quietly gutted
     every kit — a level-1 route planned for four tools shipped with two, and
     every policy short of perfect died on the first route.

     A loose OPENING is not a loose route, either. The early stages of a route
     should be forgiving; the squeeze is supposed to arrive later, when the kit
     is thin and the road is not. So this only fires when the first choice is
     very nearly free, and only once. */
  var LOOSE = 0.94;

  function buildRoute(seed, route, supply, maxSupply) {
    var rng = R.rngFor(seed, route);
    var plan = routePlan(route);
    var kinds = Object.keys(R.OBSTACLES);
    var i;

    // --- the road -------------------------------------------------------
    var stages = [];
    var last = null;
    for (i = 0; i < plan.stages; i++) {
      var kind, guard = 0;
      do { kind = rng.pick(kinds); } while (kind === last && guard++ < 8);
      last = kind;
      stages.push({ kind: kind, toll: R.OBSTACLES[kind].toll, reward: null });
    }

    // --- caches: a reward is only paid out for SOLVING a stage, which is what
    // makes some stages worth spending a tool on rather than absorbing -----
    var mid = [];
    for (i = 1; i < stages.length - 1; i++) mid.push(i);
    var spots = rng.shuffled(mid).slice(0, plan.rewards);
    for (i = 0; i < spots.length; i++) {
      stages[spots[i]].reward = rng.pick(usefulTools(stages, spots[i] + 1));
    }

    // --- the kit --------------------------------------------------------
    // Drawn from tools this route actually has a use for. A kit full of rope
    // for a route with no cliffs is not difficulty, it is a bad roll.
    var pool = usefulTools(stages, 0);
    var kit = {};
    for (i = 0; i < plan.kit; i++) {
      var t = rng.pick(pool);
      kit[t] = (kit[t] || 0) + 1;
    }

    var s = {
      seed: String(seed), route: route,
      stages: stages, at: 0, kit: kit,
      supply: supply, maxSupply: maxSupply,
      phase: "travel", history: [], events: [],
    };

    return makeCrossable(s, rng, pool);
  }

  /* Every tool that solves at least one stage from `from` onward, listed once
     per stage it could serve — so tools the route leans on are drawn more
     often. */
  function usefulTools(stages, from) {
    var out = [];
    for (var i = from; i < stages.length; i++) {
      var acc = R.OBSTACLES[stages[i].kind].accepts;
      for (var j = 0; j < acc.length; j++) out.push(acc[j]);
    }
    return out.length ? out : Object.keys(R.TOOLS);
  }

  /* Make the route crossable, then make it interesting.

     Handing someone an impossible route breaks the only promise this game
     makes — that the run was winnable when it started, so losing it was
     something you did. Adding a tool is the repair, because it is the one that
     cannot make the route worse. */
  function makeCrossable(s, rng, pool) {
    var attempt, rating;
    for (attempt = 0; attempt < 14; attempt++) {
      rating = R.rate(s);
      if (rating.completable) break;
      var add = rng.pick(pool);
      s.kit[add] = (s.kit[add] || 0) + 1;
    }
    // Last resort: if the kit still cannot carry it, the route is simply too
    // long for the supply on hand. Shorten it rather than ship a dead route.
    while (!R.rate(s).completable && s.stages.length > 3) s.stages.pop();

    // Now the other failure mode. A route where nearly every option works asks
    // nothing. Drop a tool if the route survives without it.
    for (var trim = 0; trim < 1; trim++) {
      rating = R.rate(s);
      if (rating.tightness <= LOOSE) break;
      var carried = R.kitList(s.kit);
      var removed = false;
      for (var i = 0; i < carried.length && !removed; i++) {
        var t = carried[i];
        s.kit[t]--;
        if (R.rate(s).completable) removed = true; else s.kit[t]++;
      }
      if (!removed) break;
    }
    return s;
  }

  function newGame(seed) {
    return buildRoute(seed, 1, START_SUPPLY, MAX_SUPPLY);
  }

  /* Surviving a route buys back a little supply — enough that a clean crossing
     compounds, never enough to make a toll cheap. */
  function nextRoute(s) {
    return buildRoute(s.seed, s.route + 1,
      Math.min(s.maxSupply, s.supply + REFILL_PER_ROUTE), s.maxSupply);
  }

  R.START_SUPPLY = START_SUPPLY;
  R.MAX_SUPPLY = MAX_SUPPLY;
  R.REFILL_PER_ROUTE = REFILL_PER_ROUTE;
  R.routePlan = routePlan;
  R.buildRoute = buildRoute;
  R.newGame = newGame;
  R.nextRoute = nextRoute;
})();
