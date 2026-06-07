/* The Ludographer — the generic SIMULATOR + agents.
 *
 * Plays the abstract economy that operational.js projects a game onto. One
 * engine, every game: it never knows what theme or mechanics it's running, only
 * the action menu, costs, yields and end trigger. Pluggable agents let us pit
 * skill against chance, which is how the self-test measures whether a game is
 * any good. Deterministic given a seed string. Attaches to LUDO.simulate /
 * LUDO.agents. Backend only. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var L = NS.LUDO = NS.LUDO || {};

  function clone(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }
  function canAfford(res, cost) { for (var k in cost) if ((res[k] || 0) < cost[k]) return false; return true; }
  function legalActions(state, model) {
    var out = [];
    for (var i = 0; i < model.actions.length; i++) if (canAfford(state.res, model.actions[i].cost)) out.push(model.actions[i]);
    return out;
  }
  function applyAction(state, a) {
    for (var k in a.cost) state.res[k] = (state.res[k] || 0) - a.cost[k];
    var y = a.yield;
    if (y.res) for (var k2 in y.res) state.res[k2] = (state.res[k2] || 0) + y.res[k2];
    if (y.vp) state.vp += y.vp;
    if (y.track) state.track += y.track;
    if (y.prod) for (var k3 in y.prod) state.prod[k3] = (state.prod[k3] || 0) + y.prod[k3];
  }

  // ── agents ────────────────────────────────────────────────────────────────
  // Each: (legal, state, model, rand) -> action | null(pass).
  function randomAgent(legal, state, model, rand) {
    if (!legal.length) return null;
    return legal[Math.floor(rand.f() * legal.length)];
  }
  function actionValue(a, model) {
    var w = model.w, y = a.yield, v = 0;
    v += (y.vp || 0) * w.vp;
    v += (y.track || 0) * w.track;
    if (y.prod) { var p = 0; for (var k in y.prod) p += y.prod[k]; v += p * w.prod; }
    if (y.res) { var s = 0; for (var k2 in y.res) s += y.res[k2]; v += s * w.res; }
    var c = 0; for (var k3 in a.cost) c += a.cost[k3]; v -= c * 0.4;
    return v;
  }
  function greedyAgent(legal, state, model, rand) {
    if (!legal.length) return null;
    var best = null, bv = -1e9;
    for (var i = 0; i < legal.length; i++) {
      var v = actionValue(legal[i], model) + rand.f() * 1e-3; // jitter tiebreak
      if (v > bv) { bv = v; best = legal[i]; }
    }
    // never knowingly take a strictly-pointless action when a useful one exists
    if (bv <= 0 && legal.length) { /* still act: cheapest */ }
    return best;
  }
  L.agents = { random: randomAgent, greedy: greedyAgent };

  // ── one game ────────────────────────────────────────────────────────────────
  // agents: array of agent fns, one per seat. Returns a result record.
  L.simulate = function (model, agents, seedStr) {
    var rand = L.prng.Rand("sim::" + seedStr);
    var P = agents.length;
    var players = [];
    for (var i = 0; i < P; i++) players.push({ res: clone(model.startRes), vp: 0, track: 0, prod: {} });

    var turn = 0, round = 0, ended = false, reason = "cap", actionCounts = {};
    var cur = 0;
    while (turn < model.hardTurnCap) {
      var st = players[cur];
      // passive production at start of turn
      for (var k in st.prod) st.res[k] = (st.res[k] || 0) + st.prod[k];
      // action points
      for (var ap = 0; ap < model.apPerTurn; ap++) {
        var legal = legalActions(st, model);
        var a = agents[cur](legal, st, model, rand);
        if (!a) break; // pass
        applyAction(st, a);
        actionCounts[a.id] = (actionCounts[a.id] || 0) + 1;
        if (model.end.type === "race" && st.track >= model.end.target) { ended = true; reason = "race"; break; }
      }
      turn++;
      if (ended) break;
      // end-of-round bookkeeping
      if (cur === P - 1) {
        round++;
        if (model.end.type === "vp") {
          var hit = players.some(function (p) { return p.vp >= model.end.target; });
          if (hit || round >= model.end.roundCap) { ended = true; reason = hit ? "vp" : "rounds"; break; }
        }
      }
      cur = (cur + 1) % P;
    }

    // score + winner
    var scores = players.map(function (p) { return model.end.type === "race" ? p.track : p.vp; });
    var max = Math.max.apply(null, scores);
    var leaders = [];
    for (var j = 0; j < P; j++) if (scores[j] === max) leaders.push(j);
    var winner = leaders.length === 1 ? leaders[0] : -1; // -1 = tie

    return {
      ended: ended, reason: reason, turns: turn, rounds: round,
      scores: scores, winner: winner, tie: leaders.length > 1,
      actionCounts: actionCounts, margin: secondMargin(scores)
    };
  };

  function secondMargin(scores) {
    var s = scores.slice().sort(function (a, b) { return b - a; });
    return s.length > 1 ? s[0] - s[1] : s[0];
  }
})();
