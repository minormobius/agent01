/* Outbound — the seeded core.

   Same xmur3 + mulberry32 pair the rest of the repo uses. A leg is generated
   from (seed, leg number) and nothing after that is random at all: the whole
   run is charted from the first system and never changes. That is what makes
   the viability solver meaningful — there is no future to guess at, only a
   future to spend.

   Static sites can't import across directories, so this is a deliberate local
   copy. Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var O = NS.OUTBOUND = NS.OUTBOUND || {};

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

  function rngFor(seed, leg) {
    var r = mulberry32(hashStr(String(seed) + "::leg::" + leg)());
    return {
      next: r,
      float: function (lo, hi) { return lo + r() * (hi - lo); },
      int: function (lo, hi) { return Math.floor(lo + r() * (hi - lo + 1)); },
      pick: function (a) { return a[Math.floor(r() * a.length)]; },
      chance: function (p) { return r() < p; },
      shuffled: function (a) {
        var b = a.slice();
        for (var i = b.length - 1; i > 0; i--) {
          var j = Math.floor(r() * (i + 1));
          var t = b[i]; b[i] = b[j]; b[j] = t;
        }
        return b;
      },
    };
  }

  function randomSeed() {
    var A = ["cold", "far", "long", "last", "thin", "deep", "slow", "dark"];
    var B = ["burn", "haul", "reach", "drift", "lead", "run", "thaw", "crossing"];
    var r = Math.random;
    return A[Math.floor(r() * A.length)] + "-" + B[Math.floor(r() * B.length)] +
      "-" + Math.floor(10 + r() * 90);
  }

  O.rngFor = rngFor;
  O.randomSeed = randomSeed;
  O.hashStr = hashStr;
})();
