// wormhole — MARGINS, the dispatcher between marginalia engines.
//
// Each paper's margin is filled by one engine, chosen by a seeded coin from
// the paper id (so a paper always wears the same kind): flora.js (the
// watercolour garden) or serpent.js (the tree, its fruit, and its serpents).
// Every engine has the same contract — genome(id, field, overrides) →
// describe(g) → grow(g, page, opts) — and stamps g.kind, so callers ask this
// module for the genome and then for the engine that owns it.
//
// For now the choice is an even coin; a weighting or a per-field biome can
// replace it here without touching either engine. Load after the engines.

(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var F = NS.WORMHOLE_FLORA, Z = NS.WORMHOLE_SERPENT;
  if (!F || !Z) throw new Error("margins.js needs flora.js and serpent.js loaded first");
  var ENGINES = { flora: F, serpent: Z };
  var KINDS = ["flora", "serpent"];
  function kindOf(id) {
    var h = F.core.xmur3("margin-kind:" + String(id))();
    return KINDS[h % KINDS.length];
  }
  function genome(id, field, overrides, kind) {
    kind = kind || (overrides && overrides.kind) || kindOf(id);
    var g = ENGINES[kind].genome(id, field, overrides);
    g.kind = kind;
    return g;
  }
  function engine(g) { return ENGINES[g.kind || "flora"]; }
  NS.WORMHOLE_MARGINS = {
    KINDS: KINDS, ENGINES: ENGINES, kindOf: kindOf, genome: genome, engine: engine,
    grow: function (g, page, opts) { return engine(g).grow(g, page, opts); },
    describe: function (g) { return engine(g).describe(g); },
  };
})();
