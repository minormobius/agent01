// bismuth — seeded PRNG, the repo lineage (borges / idol / wormhole):
// xmur3 hashes any string into a 32-bit state, mulberry32 streams from it.
// Every decision in the growth engine draws from ONE of these streams in a
// fixed order, so a seed is the whole crystal, forever.

export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A named sub-stream: stream(seed, "growth") and stream(seed, "oxide") never
// share state, so adding a draw to one cannot perturb the other.
export function stream(seed, label) {
  const h = xmur3(String(seed) + " " + label);
  return mulberry32(h());
}

// Uniform integer in [lo, hi] inclusive.
export function rint(r, lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }
// Uniform float in [lo, hi).
export function rf(r, lo, hi) { return lo + r() * (hi - lo); }
// Weighted pick over an array of non-negative weights; returns the index.
export function pick(r, weights) {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  let x = r() * total;
  for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x < 0) return i; }
  return weights.length - 1;
}
