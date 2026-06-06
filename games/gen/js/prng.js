/* The Ludographer — the seeded core.

   A procedurally generated board-game catalogue that is endless but not
   arbitrary: every catalogue number n yields exactly the same game, for ever,
   on any machine. That determinism is what makes /gen/game.html?n=<n> a real
   permalink — the same rules, board, components and designer's notes resolve
   from the number alone, with nothing stored anywhere.

   This is the borges/ trick (mulberry32 + xmur3) re-pointed at games instead of
   tales. No crypto; we only need draws that look unrepeatable to a player and
   are byte-identical across reloads and across node (so the generator can be
   unit-tested off-page).

   Attaches to the shared namespace (window in the browser, globalThis in node). */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var L = NS.LUDO = NS.LUDO || {};

  // xmur3 string hash -> 32-bit seed
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
      f: function () { return next(); },
      int: function (min, max) { return min + Math.floor(next() * (max - min + 1)); },
      chance: function (p) { return next() < p; },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      pickWeighted: function (arr, w) {
        var total = 0, i, ws = [];
        for (i = 0; i < arr.length; i++) { var x = Math.max(0, w(arr[i], i)); ws.push(x); total += x; }
        if (total <= 0) return self.pick(arr);
        var r = next() * total;
        for (i = 0; i < arr.length; i++) { r -= ws[i]; if (r <= 0) return arr[i]; }
        return arr[arr.length - 1];
      },
      // pick k distinct elements (Fisher-Yates partial)
      sample: function (arr, k) {
        var pool = arr.slice(), out = [];
        k = Math.min(k, pool.length);
        for (var i = 0; i < k; i++) {
          var j = Math.floor(next() * pool.length);
          out.push(pool[j]); pool.splice(j, 1);
        }
        return out;
      },
      shuffle: function (arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(next() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
        return a;
      },
      // a fresh independent sub-stream, named (so prose draws don't disturb structural draws)
      fork: function (name) { return Rand(seedStr + "::" + name); }
    };
    return self;
  }

  L.prng = { hashStr: hashStr, mulberry32: mulberry32, Rand: Rand };
})();
