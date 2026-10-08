// rand.js — seeded randomness for the city engine: xmur3 + mulberry32, the repo's convention
// (polis/prng.js, tjs/brut/rand.js). One stream per SALT, so adding a draw in one place cannot move
// anything elsewhere; `noise2` and `fbm2` are stateless value noise (a point's value depends only on
// its coordinates and the seed). Pure: node and browser.

export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}
export function mulberry32(a) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function Rand(seed, salt) {
  const f = mulberry32(xmur3(`${seed}::${salt}`)());
  return {
    f, range: (a, b) => a + (b - a) * f(), int: (a, b) => a + Math.floor(f() * (b - a + 1)),
    chance: (p) => f() < p, pick: (xs) => xs[Math.floor(f() * xs.length)],
  };
}
/** A stateless hash of two integers and a seed, in [0, 1). */
export function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise in [0, 1). */
export function noise2(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Fractal value noise in [0, 1): `oct` octaves, each half the size and `gain` the amplitude. */
export function fbm2(x, y, s, oct = 5, gain = 0.5) {
  let amp = 1, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < oct; o++) { sum += amp * noise2(x * f, y * f, s + o * 131); norm += amp; amp *= gain; f *= 2.03; }
  return sum / norm;
}
