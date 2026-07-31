// Seeded deterministic PRNG — the same xmur3 + mulberry32 pair used across the
// repo (borges, mappa, phylofiction, games/gen). Determinism is load-bearing:
// page number `n` must yield the identical puzzle on every machine, for ever,
// or the permalink /puzz/?n=<n> means nothing.

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

// A seeded RNG with the conveniences a generator wants. Forkable so each
// subsystem (layout, carving, naming) gets an isolated stream from one seed.
export class Rand {
  constructor(seed) {
    this.seedStr = String(seed);
    const seedFn = xmur3(this.seedStr);
    this.next = mulberry32(seedFn());
  }
  fork(name) {
    return new Rand(this.seedStr + '::' + name);
  }
  float() {
    return this.next();
  }
  // integer in [0, n)
  int(n) {
    return Math.floor(this.next() * n);
  }
  // integer in [lo, hi] inclusive
  range(lo, hi) {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  // weighted pick: items = [{v, w}, ...]
  weighted(items) {
    let total = 0;
    for (const it of items) total += it.w;
    let r = this.next() * total;
    for (const it of items) {
      r -= it.w;
      if (r <= 0) return it.v;
    }
    return items[items.length - 1].v;
  }
  // Fisher–Yates shuffle, in place, deterministic
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
