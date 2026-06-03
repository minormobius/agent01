/* borges — the seeded engine's random core.

   The Book of Sand is endless but not arbitrary: every page number n yields
   exactly the same tale, for ever, on any machine. That stability is what lets
   a robot post a tale's mythograph to the Tabard *before* the telling and have
   the permalink mean something. The determinism lives here.

   mulberry32 — a tiny, fast, well-distributed 32-bit PRNG. Seeded from a string
   hash of the page number (plus a salt, so different sub-streams of one tale —
   cast names vs. motif draws vs. prose — don't correlate). No crypto; we only
   need it to look unrepeatable to a reader, and to be identical across reloads.

   Attaches to the shared namespace (window in the browser, globalThis in node,
   so the generator can be unit-tested off-page). */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var B = NS.BORGES = NS.BORGES || {};

  // xmur3 string hash → 32-bit seed
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

  /* A small random-context object: rng + the convenience samplers the
     generator leans on. Salt the seed so independent draws stay independent. */
  function Rand(seedStr) {
    var seedFn = hashStr(String(seedStr));
    var next = mulberry32(seedFn());
    var self = {
      next: next,
      // float in [0,1)
      f: function () { return next(); },
      // int in [min, max] inclusive
      int: function (min, max) { return min + Math.floor(next() * (max - min + 1)); },
      // true with probability p
      chance: function (p) { return next() < p; },
      // pick one element
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      // pick one, weighted by w(item) -> number
      pickWeighted: function (arr, w) {
        var total = 0, i, ws = [];
        for (i = 0; i < arr.length; i++) { var x = Math.max(0, w(arr[i], i)); ws.push(x); total += x; }
        if (total <= 0) return self.pick(arr);
        var r = next() * total;
        for (i = 0; i < arr.length; i++) { r -= ws[i]; if (r <= 0) return arr[i]; }
        return arr[arr.length - 1];
      },
      // pick k distinct elements (Fisher–Yates partial), order preserved-ish
      sample: function (arr, k) {
        var pool = arr.slice(), out = [];
        k = Math.min(k, pool.length);
        for (var i = 0; i < k; i++) {
          var j = Math.floor(next() * pool.length);
          out.push(pool[j]); pool.splice(j, 1);
        }
        return out;
      },
      // shuffle a copy
      shuffle: function (arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(next() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
        return a;
      },
      // a fresh independent sub-stream, named (so prose draws don't disturb cast draws)
      fork: function (name) { return Rand(seedStr + "::" + name); }
    };
    return self;
  }

  B.prng = { hashStr: hashStr, mulberry32: mulberry32, Rand: Rand };
})();
