// prng.js — deterministic randomness for polis.
//
// mulberry32 is bit-exact with mappa/hoop, so a polis seed reproduces the same
// region and the same proto-towns on any machine — the whole point of the
// determinism rule. hash2 is a stateless 2-D hash for value noise (a cell's
// terrain depends only on its coordinates + the seed, not on iteration order).
//
// Pure; attaches nothing global; works in node and the browser unchanged.

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// stateless hash of (x, y, seed) → [0,1)
export function hash2(x, y, s) {
  let h = (((x >>> 0) * 0x9e3779b1) ^ ((y >>> 0) * 0x85ebca77) ^ ((s >>> 0) * 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 1 | h);
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h;
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}
