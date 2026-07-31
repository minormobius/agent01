/* Telegraph — the seeded core.

   Same xmur3 + mulberry32 pair the rest of the repo uses. Everything random
   about an encounter — terrain, node placement, which enemies and where — comes
   out of (seed, level) and nothing else. Nothing is random once the encounter
   starts; that is what makes the game perfect-information and what lets
   test/analysis.mjs re-derive the exact boards a player would see.

   Static sites can't import across directories, so this is a deliberate local
   copy. Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var T = NS.TELEGRAPH = NS.TELEGRAPH || {};

  function hashStr(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* One stream per (seed, level). Encounter 4 of seed "abc" is always the same
     board, whatever happened in encounters 1–3 — so a run is a sequence of
     fixed puzzles and two players on one seed face identical problems. */
  function rngFor(seed, level) {
    var seedFn = hashStr(String(seed) + "::level::" + level);
    var r = mulberry32(seedFn());
    return {
      next: r,
      int: function (lo, hi) { return Math.floor(lo + r() * (hi - lo + 1)); },
      pick: function (arr) { return arr[Math.floor(r() * arr.length)]; },
      chance: function (p) { return r() < p; },
      shuffled: function (arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
          var j = Math.floor(r() * (i + 1));
          var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
      },
    };
  }

  function randomSeed() {
    var A = ["dun", "vex", "kor", "mal", "sev", "tor", "iri", "orb", "zan", "hel"];
    var B = ["dra", "mesh", "lith", "vane", "spar", "rift", "gate", "wick", "loom", "arc"];
    var r = Math.random;
    return A[Math.floor(r() * A.length)] + "-" + B[Math.floor(r() * B.length)] +
      "-" + Math.floor(10 + r() * 90);
  }

  T.rngFor = rngFor;
  T.randomSeed = randomSeed;
  T.hashStr = hashStr;
})();
