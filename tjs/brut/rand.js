// tjs/brut/rand.js — THE SEED ALGEBRA, and nothing else.
//
// One deterministic stream, addressed by a seed and a SALT. Every generator in
// /brut draws from `Rand(seed, 'stage')` rather than from a shared cursor, and
// that one decision is why adding a stage to the middle of the pipeline does
// not reshuffle every building that came before it: the streams are independent
// by construction, not by discipline.
//
// It lives in its own file because the city is about to need it to be an
// ADDRESS. `Rand(seed, 'plot/3')` is a plot, `Rand(seed, 'plot/3/building')` is
// what stands on it — the same algebra doing hierarchical naming, so a
// permalink can name one building inside a district without carrying the
// district. Three copies of that would be three cities that disagree.
//
// xmur3 for the string→state hash, mulberry32 for the stream. Both are the
// standard small-state generators; neither is cryptographic and neither needs
// to be. What they must be is STABLE — a change here changes every permalink
// in the repo, so this file does not get "improved".

function xmur3(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function Rand(seed, salt = '') {
  const next = mulberry32(xmur3(String(seed) + '::' + salt)());
  const R = {
    f: () => next(),
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    // pick weighted by an [item, weight] table
    pickW: (table) => {
      let total = 0; for (const t of table) total += t[1];
      let r = next() * total;
      for (const t of table) { r -= t[1]; if (r <= 0) return t[0]; }
      return table[table.length - 1][0];
    },
    // snap a length to a multiple of `step`, at least `min` steps
    snap: (v, step, minSteps = 1) => Math.max(minSteps, Math.round(v / step)) * step,
    shuffle: (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  };
  return R;
}
