/* Hold the Line — the seeded core.

   Every run is a seed. Spawn order, arc pressure, zombie types and the cards
   you get offered at every gate all come out of this generator and nothing
   else, so `?seed=abc` is a permalink to a specific run: the same horde, in the
   same order, with the same choices, on any machine. That is what makes the
   balance bot in test/ meaningful — it plays the *same* runs a phone would.

   Same xmur3 + mulberry32 pair the rest of the repo uses (borges/, games/gen/).
   No crypto here; we need draws that look unrepeatable to a player and are
   byte-identical across reloads and across node.

   Static sites can't import across directories, so this is a deliberate local
   copy rather than a shared import.

   Attaches to the shared namespace (window in the browser, globalThis in node). */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var H = NS.HORDE = NS.HORDE || {};

  // xmur3 string hash -> 32-bit seed generator
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

  /* A small named-stream RNG.

     Waves and card offers draw from *separate* streams (`rng.stream('waves')`,
     `rng.stream('cards')`). That decoupling is worth the extra machinery: it
     means adding a card to the pool doesn't reshuffle the horde, so a balance
     regression after a content change is a real balance regression and not just
     a different run. */
  function makeRng(seed) {
    var base = String(seed);
    var streams = {};
    function stream(name) {
      if (!streams[name]) {
        var seedFn = hashStr(base + "::" + name);
        streams[name] = mulberry32(seedFn());
      }
      return streams[name];
    }
    return {
      seed: base,
      stream: stream,
      // Convenience wrappers over a named stream.
      float: function (name, lo, hi) { return lo + stream(name)() * (hi - lo); },
      int: function (name, lo, hi) { return Math.floor(lo + stream(name)() * (hi - lo + 1)); },
      pick: function (name, arr) { return arr[Math.floor(stream(name)() * arr.length)]; },
      chance: function (name, p) { return stream(name)() < p; },
      // Fisher-Yates on a copy, so callers can shuffle without side effects.
      shuffled: function (name, arr) {
        var a = arr.slice(), r = stream(name);
        for (var i = a.length - 1; i > 0; i--) {
          var j = Math.floor(r() * (i + 1));
          var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
      },
    };
  }

  /* Human-friendly random seed for a fresh run: two syllables and a number,
     short enough to read off a phone screen and type into a friend's. */
  function randomSeed() {
    var A = ["gr", "br", "kr", "dr", "tr", "sk", "sn", "cl", "gl", "st"];
    var B = ["um", "ok", "ash", "ist", "ork", "ust", "elt", "amp", "unk", "ilt"];
    var r = Math.random;
    return A[Math.floor(r() * A.length)] + B[Math.floor(r() * B.length)] +
      "-" + Math.floor(100 + r() * 900);
  }

  H.makeRng = makeRng;
  H.randomSeed = randomSeed;
  H.hashStr = hashStr;
})();
