// prng.js — deterministic seeded randomness for the sprite engine.
//
// Determinism is load-bearing (same rule as hoop/borges): a seed `n` must yield the SAME item
// and the SAME sprite on every machine, for ever, so that `/sprite/item/?n=…` is a stable
// permalink and a rolled item can be persisted as an ATProto record and re-derived. Never reach
// for unseeded Math.random() in generation — fork a stream off the seed instead.
//
// mulberry32 + xmur3 are the same primitives borges/js/prng.js uses. Zero-dep; attaches to
// globalThis so it can be used from an inline <script type=module> or imported in node tests.

// xmur3: string → 32-bit seed generator (lets us name sub-streams: "kind", "material", …).
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

// mulberry32: fast, well-distributed 32-bit PRNG. Returns a () => float in [0,1).
export function mulberry32(a) {
  a >>>= 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fork a named, deterministic sub-stream off a base seed `n`. `rng(n, 'material')` and
// `rng(n, 'affix')` are independent but both reproduce from `n`.
export function rng(n, stream = '') {
  const mix = (((n >>> 0) ^ 0x9e3779b9) >>> 0) ^ xmur3(String(stream))();
  return mulberry32(mix >>> 0 || 1);
}

// Handy seeded helpers built on a rng() function.
export const R = {
  int: (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1)),       // inclusive
  pick: (rnd, arr) => arr[Math.floor(rnd() * arr.length)],
  // weighted pick over [[key, weight], …] or [{...}, weight] — returns the key/item.
  weighted: (rnd, entries, weightOf = (e) => e[1], keyOf = (e) => e[0]) => {
    let tot = 0; for (const e of entries) tot += weightOf(e);
    let r = rnd() * tot;
    for (const e of entries) { r -= weightOf(e); if (r <= 0) return keyOf(e); }
    return keyOf(entries[entries.length - 1]);
  },
};

const PRNG = { xmur3, mulberry32, rng, R };
if (typeof globalThis !== 'undefined') globalThis.PRNG = PRNG;
export default PRNG;
