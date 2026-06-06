/* The Ludographer — load the trained NN critic for in-browser inference.
   Progressive enhancement: fetches the committed model, builds the net, and
   exposes LUDO.rateGame(g) -> 0..100. If anything fails (no model, offline),
   it resolves to null and the site stays fully functional without a rating.
   Requires LUDO.Critic + LUDO.features + LUDO.operational. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var L = NS.LUDO = NS.LUDO || {};

  L.loadCritic = function () {
    if (L.rateGame) return Promise.resolve(L.rateGame);
    if (!L.Critic || !L.features) return Promise.resolve(null);
    return fetch("js/critic-model.json")
      .then(function (r) { if (!r.ok) throw new Error("no model"); return r.json(); })
      .then(function (j) {
        var net = L.Critic.fromJSON(j);
        L.criticMeta = j.val || null;
        L.rateGame = function (g) {
          try { return Math.round(net.predict(L.features(g).vector)); }
          catch (e) { return null; }
        };
        return L.rateGame;
      })
      .catch(function () { return null; });
  };
})();
