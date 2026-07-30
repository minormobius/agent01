/* Telegraph — the solver.
 *
 * Enumerates every legal way this turn could go, in both act-orders, and scores
 * each one. Because the game has no hidden information and no randomness, that
 * enumeration is complete: the answer is not an estimate.
 *
 * This is the whole reason the game is turn-based and fully visible. In Hold
 * the Line "was there a better play?" is a matter of opinion. Here it is a
 * count, and after every turn the game tells you: 4 of 2,310 positions ended
 * clean, and you found one of them — or you didn't.
 *
 * Outcomes are deduplicated by resulting board state rather than by plan. Two
 * unrelated actions taken in either order are the same decision, and counting
 * that twice would inflate the denominator and make the game look kinder than
 * it is.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var T = NS.TELEGRAPH = NS.TELEGRAPH || {};

  var DEFAULT_CAP = 120000;

  /* Everything one unit could legally do: stand somewhere reachable, then
     optionally use its ability from there. Targets are recomputed after the
     move, because where you stand decides what you can reach. */
  function unitOptions(s, unit) {
    if (!unit || !unit.alive) return [null];
    var out = [], spots = T.reachable(s, unit), i, j;
    for (i = 0; i < spots.length; i++) {
      var p = spots[i];
      out.push({ mx: p.x, my: p.y, ax: -1, ay: -1 });
      var c = T.cloneState(s);
      T.moveUnit(c, unit.id, p.x, p.y);
      var targets = T.abilityTargets(c, T.getUnit(c, unit.id));
      for (j = 0; j < targets.length; j++) {
        out.push({ mx: p.x, my: p.y, ax: targets[j].x, ay: targets[j].y });
      }
    }
    return out;
  }

  function applyOption(s, unitId, opt) {
    if (!opt) return;
    T.moveUnit(s, unitId, opt.mx, opt.my);
    if (opt.ax >= 0) T.useAbility(s, unitId, opt.ax, opt.ay);
  }

  /* Canonical fingerprint of a board. Anything the end-of-turn resolution reads
     must appear here, or two genuinely different outcomes would collapse into
     one — note `dir`, which is what a shove actually changes. */
  function keyOf(s) {
    var i, parts = [s.integrity];
    for (i = 0; i < s.units.length; i++) {
      var u = s.units[i];
      parts.push("u" + u.id + ":" + (u.alive ? u.x + "," + u.y + "," + u.hp : "x"));
    }
    var es = s.enemies.slice().sort(function (a, b) { return a.id - b.id; });
    for (i = 0; i < es.length; i++) {
      var e = es[i];
      parts.push("e" + e.id + ":" + (e.alive ? e.x + "," + e.y + "," + e.hp + "," + e.dir : "x"));
    }
    return parts.join("|");
  }

  /* Search the current turn.

     Returns the number of distinct reachable outcomes, how many of them take no
     integrity damage ("clean"), how many take none at all ("flawless"), and the
     best score available. `capped` means the board was too branchy to finish —
     the counts are then a lower bound, and the caller must say so. */
  function analyseTurn(state, cap) {
    cap = cap || DEFAULT_CAP;
    var results = {};     // key -> {integrity, unitDmg, score}
    var visited = 0, capped = false;

    var alive = state.units.filter(function (u) { return u.alive; });
    var orders = alive.length > 1 ? [[0, 1], [1, 0]] : [[0]];

    for (var o = 0; o < orders.length && !capped; o++) {
      var order = orders[o];
      var first = alive[order[0]];
      var optsA = unitOptions(state, first);

      for (var a = 0; a < optsA.length && !capped; a++) {
        var sA = T.cloneState(state);
        applyOption(sA, first.id, optsA[a]);

        if (order.length === 1) {
          record(results, sA);
          if (++visited > cap) capped = true;
          continue;
        }

        var second = T.getUnit(sA, alive[order[1]].id);
        var optsB = unitOptions(sA, second);
        for (var b = 0; b < optsB.length; b++) {
          var sB = T.cloneState(sA);
          applyOption(sB, second.id, optsB[b]);
          record(results, sB);
          if (++visited > cap) { capped = true; break; }
        }
      }
    }

    var total = 0, clean = 0, flawless = 0, best = Infinity, bestState = null;
    for (var k in results) {
      var r = results[k];
      total++;
      if (r.integrity === 0) clean++;
      if (r.integrity === 0 && r.unitDmg === 0) flawless++;
      if (r.score < best) { best = r.score; bestState = r.state; }
    }
    return {
      total: total, clean: clean, flawless: flawless,
      bestScore: best === Infinity ? 0 : best,
      // The board after the strongest available line. A bot can simply adopt
      // this and end the turn — no need to replay a plan.
      bestState: bestState,
      capped: capped, visited: visited,
      // The headline number: what fraction of everything you could have done
      // was actually correct. This IS the economy of choice, measured.
      tightness: total ? clean / total : 0,
    };
  }

  function record(results, s) {
    var key = keyOf(s);
    if (results[key]) return;
    var cost = T.costOf(s);
    cost.state = s;
    results[key] = cost;
  }

  /* Did the player find one of the good lines? Compare what they actually left
     on the board against the best that was available. */
  function gradeTurn(analysis, actualCost) {
    if (actualCost.integrity === 0 && actualCost.unitDmg === 0) return "flawless";
    if (actualCost.integrity === 0) return "clean";
    if (analysis.clean === 0) return "forced";   // nothing better existed
    return "missed";
  }

  T.unitOptions = unitOptions;
  T.applyOption = applyOption;
  T.keyOf = keyOf;
  T.analyseTurn = analyseTurn;
  T.gradeTurn = gradeTurn;
  T.DEFAULT_CAP = DEFAULT_CAP;
})();
