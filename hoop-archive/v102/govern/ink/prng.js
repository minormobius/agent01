// prng.js — deterministic seeded randomness (xmur3 hash -> mulberry32 stream).
// Same seed -> same blot, for ever, on any machine. This is what makes /ink/<seed>
// permalinks meaningful and the future quiz reproducible. (Borges convention.)
(function (g) {
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
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
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // makeRng('seed') -> r() in [0,1) plus a few conveniences.
  function makeRng(seedStr) {
    const seed = xmur3(String(seedStr))();
    const r = mulberry32(seed);
    r.range = (a, b) => a + (b - a) * r();
    r.int = (a, b) => Math.floor(r.range(a, b + 1)); // inclusive both ends
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    r.sign = () => (r() < 0.5 ? -1 : 1);
    return r;
  }

  // A short, human-ish seed for the "new blot" roll (the one allowed unseeded roll).
  function freshSeed() {
    const a = (Math.random() * 1e9) >>> 0;
    const b = (Date.now() & 0xffff);
    return (a.toString(36) + b.toString(36)).slice(0, 9);
  }

  g.INKPRNG = { makeRng, xmur3, mulberry32, freshSeed };
})(typeof globalThis !== "undefined" ? globalThis : this);
