/* The Ludographer — the self-test scorer, factored out so both the report
   (test/playtest.mjs) and the NN trainer (test/train-critic.mjs) call one
   source of truth. Plays a generated game many times with agents of different
   strength and returns a 0..100 quality score on the measurable aesthetics of
   a good game. Requires LUDO.generate / operational / simulate / agents.
   Attaches to LUDO.evaluate(n, gamesPerConfig). Backend only. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var L = NS.LUDO = NS.LUDO || {};

  function clampP(g) { return Math.max(2, Math.min(4, g.players.best)); }

  L.evaluate = function (n, G) {
    G = G || 50;
    var g = L.generate(n);
    var model = L.operational(g);
    var P = clampP(g);
    var rnd = L.agents.random, grd = L.agents.greedy;

    var ended = 0, totalTurns = 0, i;
    for (i = 0; i < G; i++) {
      var r = L.simulate(model, fill(P, rnd), n + ":r:" + i);
      if (r.ended) ended++; totalTurns += r.turns;
    }
    var skillWins = 0;
    for (i = 0; i < G; i++) {
      var seat = i % P, ag = fill(P, rnd); ag[seat] = grd;
      var rs = L.simulate(model, ag, n + ":s:" + i);
      if (rs.winner === seat) skillWins++;
    }
    var ties = 0, seat0 = 0, decisive = 0, actAll = {};
    for (i = 0; i < G; i++) {
      var rg = L.simulate(model, fill(P, grd), n + ":g:" + i);
      if (rg.tie) ties++; else { decisive++; if (rg.winner === 0) seat0++; }
      for (var k in rg.actionCounts) actAll[k] = (actAll[k] || 0) + rg.actionCounts[k];
    }

    var chance = 1 / P;
    var completion = ended / G;
    var skill = Math.max(0, (skillWins / G - chance) / (1 - chance));
    var decisiveness = decisive / G;
    var firstAdv = decisive ? Math.abs(seat0 / decisive - chance) / (1 - chance) : 1;
    var totalActs = Object.keys(actAll).reduce(function (a, k) { return a + actAll[k]; }, 0) || 1;
    var dominance = Math.max.apply(null, Object.keys(actAll).map(function (k) { return actAll[k]; }).concat([0])) / totalActs;
    var domPenalty = Math.min(1, Math.max(0, (dominance - 0.55) / 0.45));
    var avgTurns = totalTurns / G;

    var q = 0;
    q += skill * 45;
    q += completion * 20;
    q += decisiveness * 15;
    q += (1 - firstAdv) * 10;
    q += (1 - domPenalty) * 10;
    if (avgTurns < 6) q -= 8;
    q = Math.max(0, Math.min(100, Math.round(q)));

    var flags = [];
    if (skill < 0.12) flags.push("luck-driven (skill≈chance)");
    if (completion < 0.85) flags.push("rarely ends");
    if (decisiveness < 0.6) flags.push("draw-prone");
    if (firstAdv > 0.5) flags.push("first-player advantage");
    if (domPenalty > 0.4) flags.push("dominant action");
    if (avgTurns < 6) flags.push("too short");

    return {
      n: n, g: g, model: model, quality: q, flags: flags,
      raw: { completion: completion, skill: +skill.toFixed(2), decisiveness: +decisiveness.toFixed(2),
        firstAdv: +firstAdv.toFixed(2), dominance: +dominance.toFixed(2), avgTurns: +avgTurns.toFixed(1) }
    };
  };

  function fill(n, x) { var a = []; for (var i = 0; i < n; i++) a.push(x); return a; }
})();
