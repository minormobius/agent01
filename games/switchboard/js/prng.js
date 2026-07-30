/* Switchboard — the seeded core.

   Same xmur3 + mulberry32 pair the rest of the repo uses. A shift is generated
   from (seed, shift number) and nothing after that is random: every arrival,
   length and deadline is fixed before the clock starts, and the player can see
   all of it. That is what makes an exact optimum possible for a real-time game.

   Static sites can't import across directories, so this is a deliberate local
   copy. Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var S = NS.SWITCHBOARD = NS.SWITCHBOARD || {};

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

  function rngFor(seed, shift) {
    var r = mulberry32(hashStr(String(seed) + "::shift::" + shift)());
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
    var A = ["night", "late", "double", "split", "dead", "grave", "swing", "back"];
    var B = ["shift", "watch", "board", "hour", "line", "call", "relay", "post"];
    var r = Math.random;
    return A[Math.floor(r() * A.length)] + "-" + B[Math.floor(r() * B.length)] +
      "-" + Math.floor(10 + r() * 90);
  }

  S.rngFor = rngFor;
  S.randomSeed = randomSeed;
  S.hashStr = hashStr;
})();
