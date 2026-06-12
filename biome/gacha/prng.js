// biome/gacha/prng.js — the shared seeded PRNG (xmur3 + mulberry32), copied verbatim from the
// repo's generators (fable, mappa, borges). Determinism is load-bearing: a roll number `n` must
// yield the identical ecosystem on every machine, for ever, or the permalink /gacha/?n=<n> means
// nothing. Forkable so each subsystem (pick, diet, naming) gets an isolated stream from one seed.

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
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class Rand {
  constructor(seed) { this.seedStr = String(seed); const s = xmur3(this.seedStr); this.next = mulberry32(s()); }
  fork(name) { return new Rand(this.seedStr + '::' + name); }
  float() { return this.next(); }
  int(n) { return Math.floor(this.next() * n); }
  range(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  weighted(items) { let t = 0; for (const it of items) t += it.w; let r = this.next() * t;
    for (const it of items) { r -= it.w; if (r <= 0) return it.v; } return items[items.length - 1].v; }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  bool(p = 0.5) { return this.next() < p; }
}
const PRNG = { xmur3, mulberry32, Rand };
if (typeof globalThis !== 'undefined') globalThis.GachaPRNG = PRNG;
export default PRNG;
