/* The Ludographer — STATIC feature vector for a generated game.
 *
 * Turns a spec into a fixed-length numeric vector computed *without playing the
 * game* — mechanic-presence flags, topology/win one-hots, and a few scalars.
 * This is the input the tiny NN critic (Rung 2) learns to map to the quality
 * score that the self-test (Rung 1) measures by actually playing. Keeping the
 * vector purely static is the whole point: once the net is trained, the
 * generator can screen a seed in microseconds instead of seconds of simulation.
 *
 * Shared by the backend label-generator and (later) the in-browser critic.
 * Attaches to LUDO.features(g) -> { names:[...], vector:[...] }. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var L = NS.LUDO = NS.LUDO || {};

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
    // scalars (normalised to ~0..1)
    put("scalar:complexity", g.complexity / 5);
    put("scalar:nMech", g.mechIds.length / 6);
    put("scalar:playersBest", g.players.best / 6);
    put("scalar:playersSpan", (g.players.max - g.players.min) / 5);
    put("scalar:nResources", g.resources.length / 7);
    put("scalar:rounds", g.params.rounds / 10);
    put("scalar:vpTarget", Math.min(1, g.params.vpTarget / 40));

    return { names: names, vector: vec };
  };
})();
