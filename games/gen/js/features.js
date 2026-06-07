/* The Ludographer — STATIC feature vector for a generated game.
 *
 * Turns a spec into a fixed-length numeric vector computed *without playing the
 * game*: mechanic-presence flags, topology/win one-hots, capability tags, a few
 * spec scalars, and a handful of cheap signals read off the operational
 * projection (the action menu and its rolled costs/yields — arithmetic, not
 * simulation). This is the input the tiny NN critic (critic.js) maps to the
 * quality score the self-test measures by actually playing. Keeping it
 * simulation-free is the point: once trained, the generator screens a seed in
 * microseconds instead of seconds of playtests.
 *
 * Requires LUDO.operational to be loaded first (for the operational features).
 * Attaches to LUDO.features(g) -> { names:[...], vector:[...] }. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var L = NS.LUDO = NS.LUDO || {};

  // same shape as sim.js's actionValue, recomputed cheaply for EV features.
  function actionValue(a, w) {
    var y = a.yield, v = 0;
    v += (y.vp || 0) * w.vp;
    v += (y.track || 0) * w.track;
    if (y.prod) { var p = 0; for (var k in y.prod) p += y.prod[k]; v += p * w.prod; }
    if (y.res) { var s = 0; for (var k2 in y.res) s += y.res[k2]; v += s * w.res; }
    var c = 0; for (var k3 in a.cost) c += a.cost[k3]; v -= c * 0.4;
    return v;
  }

  L.features = function (g) {
    var lex = L.lex;
    var names = [], vec = [];
    var put = function (name, val) { names.push(name); vec.push(+val || 0); };

    // mechanic presence flags (stable order = lexicon order)
    lex.MECH.forEach(function (m) { put("mech:" + m.id, g.mechIds.indexOf(m.id) >= 0 ? 1 : 0); });
    // topology one-hot
    lex.TOPOLOGIES.forEach(function (t) { put("topo:" + t.id, g.topology.id === t.id ? 1 : 0); });
    // win one-hot
    lex.WINS.forEach(function (w) { put("win:" + w.id, g.win.id === w.id ? 1 : 0); });
    // capability-tag flags (coarser than mechanics; helps the net generalise)
    ["resource", "vp", "engine", "spatial", "majority", "network", "set", "race", "market", "movement", "action", "hand", "elimination", "draft"]
      .forEach(function (t) { put("tag:" + t, g._tags[t] ? 1 : 0); });
    // spec scalars (normalised to ~0..1)
    put("scalar:complexity", g.complexity / 5);
    put("scalar:nMech", g.mechIds.length / 6);
    put("scalar:playersBest", g.players.best / 6);
    put("scalar:playersSpan", (g.players.max - g.players.min) / 5);
    put("scalar:nResources", g.resources.length / 7);
    put("scalar:rounds", g.params.rounds / 10);
    put("scalar:vpTarget", Math.min(1, g.params.vpTarget / 40));

    // operational-projection features — cheap (no simulation), but they expose
    // the economy roll that the spec scalars can't see, and that's where a lot
    // of the degeneracy lives (a single too-good action, a race that can't end).
    if (L.operational) {
      var m = L.operational(g);
      var vals = m.actions.map(function (a) { return actionValue(a, m.w); });
      var maxV = Math.max.apply(null, vals), meanV = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
      put("op:nActions", m.actions.length / 8);
      put("op:apPerTurn", m.apPerTurn / 3);
      put("op:race", m.end.type === "race" ? 1 : 0);
      put("op:hasQuickPoints", m.actions.some(function (a) { return a.id === "quick-points"; }) ? 1 : 0);
      put("op:evDispersion", maxV > 0 ? (maxV - meanV) / (maxV + 1) : 0);   // dominance proxy
      put("op:vpTargetVsActions", Math.min(1, (m.end.target || 10) / (8 * Math.max(1, maxV))));
    }

    return { names: names, vector: vec };
  };
})();
