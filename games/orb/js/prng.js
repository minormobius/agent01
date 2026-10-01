/* Orb — the seeded core.

   Same xmur3 + mulberry32 pair the rest of the repo uses. A board is a pure
   function of (seed, size, first click): the mesh comes from (seed, size), the
   mines from (seed, size, first cell). Static sites can't import across
   directories, so this is a deliberate local copy. Attaches to the shared
   namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var O = NS.ORB = NS.ORB || {};

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

  function rngFor() {
    var key = Array.prototype.join.call(arguments, "::");
    var r = mulberry32(hashStr(key)());
    return {
      next: r,
      int: function (lo, hi) { return Math.floor(lo + r() * (hi - lo + 1)); },
      pick: function (arr) { return arr[Math.floor(r() * arr.length)]; },
      shuffle: function (a) {
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

  O.rngFor = rngFor;
  O.randomSeed = randomSeed;
})();
