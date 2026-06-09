/* phylofiction — seeded random core.
 *
 * Ported from borges/js/prng.js (mulberry32 + xmur3). The whole point of
 * phylofiction is that page number `n` yields the same tree of life for ever,
 * on any machine — that's what makes a permalink /t/<n> mean something and the
 * "natural history" telling postable before render. Determinism lives here.
 *
 * ES module so it imports cleanly in both the browser (<script type=module>)
 * and node (--test), with no build step.
 */

// xmur3 string hash → 32-bit seed generator
export function hashStr(str) {
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

// mulberry32 — tiny fast well-distributed 32-bit PRNG
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A small random-context object: the rng plus the samplers the engine leans on.
 * Salt the seed (fork) so independent draws — topology vs. mutation vs. naming —
 * never correlate. Mirrors borges's Rand(). */
export function Rand(seedStr) {
  const seedFn = hashStr(String(seedStr));
  const next = mulberry32(seedFn());
  const self = {
    next,
    f: () => next(),                                   // float [0,1)
    int: (min, max) => min + Math.floor(next() * (max - min + 1)), // int inclusive
    chance: (p) => next() < p,                         // true w.p. p
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    pickWeighted: (arr, w) => {
      let total = 0; const ws = [];
      for (let i = 0; i < arr.length; i++) { const x = Math.max(0, w(arr[i], i)); ws.push(x); total += x; }
      if (total <= 0) return self.pick(arr);
      let r = next() * total;
      for (let i = 0; i < arr.length; i++) { r -= ws[i]; if (r <= 0) return arr[i]; }
      return arr[arr.length - 1];
    },
    // standard-normal sample (Box–Muller) — the fluoddity mutation operator needs it
    randn: () => {
      let u = 0, v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    // a fresh independent sub-stream, named
    fork: (name) => Rand(seedStr + "::" + name),
  };
  return self;
}
