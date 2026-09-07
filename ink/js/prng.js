// Seeded deterministic PRNG — the xmur3 + mulberry32 pair used across the repo
// (borges, mappa, phylofiction, fable/forge, games/gen). Copied rather than
// imported: this is a static site, so it cannot import across directories.
// Keep it byte-compatible with fable/forge/js/prng.js.

export function xmur3(str) {
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

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rand {
  constructor(seed) {
    this.seedStr = String(seed);
    this.next = mulberry32(xmur3(this.seedStr)());
  }
  fork(name) { return new Rand(this.seedStr + '::' + name); }
  float() { return this.next(); }
  int(n) { return Math.floor(this.next() * n); }
  range(lo, hi) { return lo + this.next() * (hi - lo); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  // Irwin–Hall rather than Box–Muller: Math.log and Math.cos are
  // implementation-approximated, so Box–Muller is not portable, and anything
  // that reaches the simulation has to be. Twelve uniforms minus six is a good
  // standard normal out to about ±3 sigma, using only + and -.
  normal() {
    let s = 0;
    for (let i = 0; i < 12; i++) s += this.next();
    return s - 6;
  }
}
