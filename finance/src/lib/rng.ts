// Deterministic seeded PRNG so a (seed) reproduces a dataset byte-for-byte.
// xmur3 to hash a string seed -> 32-bit state; mulberry32 for the stream.
// (Same family the borges engine uses; determinism is load-bearing for
// reproducible experiments.)

export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;
  constructor(seed: string) {
    const seedFn = xmur3(seed);
    this.next = mulberry32(seedFn());
  }
  /** uniform [0,1) */
  unit(): number {
    return this.next();
  }
  /** uniform [lo, hi) */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
  /** standard normal via Box–Muller */
  gauss(mean = 0, std = 1): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /** bernoulli(p) */
  bool(p: number): boolean {
    return this.next() < p;
  }
}
