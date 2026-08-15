// Seeded deterministic RNG — xmur3 string hash + mulberry32.
//
// Every random decision in a game (the bag shuffle, the re-shuffle after an
// exchange) is a pure function of the game seed and the ply it happened on, so
// a game is fully replayable from `{seed, moves[]}` alone. Nothing here calls
// Math.random.

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

/** A random function from any string seed. */
export function rngFrom(seed) {
  return mulberry32(xmur3(String(seed))());
}

/**
 * Fisher-Yates, in place, using `rand`. Returns the same array.
 * Shuffling in a fixed direction with a fixed rng makes the result a pure
 * function of the seed — do not "improve" this with a different traversal.
 */
export function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** A short, human-typable, ambiguity-free code (no 0/O, 1/I/L). */
export function makeCode(rand, len = 5) {
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return s;
}
