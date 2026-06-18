// field.js — the continuous, scale-free terrain field for a whole polis world.
//
// One global function of world coordinates (and the seed): elevation, moisture, a
// latitude-driven base temperature, and a resource roll. It is sampled SPARSELY by
// world.js to find a city-rich region and DENSELY by mesh.js to retile that region —
// "the same world, zoomed in with more detail." Sea level and a temperature shift are
// applied later (per era), so the same field gives an ice-age coast and a warm one.
//
// Pure; deterministic from the seed; node + browser.

import { hash2 } from './prng.js';

function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, y, s, oct = 5) {
  let amp = 1, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < oct; o++) { sum += amp * vnoise(x * f, y * f, s + o * 131); norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}

// WW × WH is the conceptual world size in "world units"; the field is continuous so
// any fractional coordinate inside is valid (that's what lets the region be retiled).
export function makeField(seed, { WW = 200, WH = 140 } = {}) {
  const eScale = 0.045, mScale = 0.05;
  return {
    seed, WW, WH,
    // 0..1, with continents warped a little for less-grid-like coastlines
    elevation(x, y) {
      const warp = fbm(x * 0.02 + 50, y * 0.02 + 50, seed ^ 0x1111) * 6;
      return fbm((x + warp) * eScale, (y + warp) * eScale, seed);
    },
    moisture(x, y) { return fbm(x * mScale + 17, y * mScale + 31, seed ^ 0x9e37); },
    // base temperature: warm equator band across the middle, cold toward the poles
    tempBase(y) { const lat = Math.abs((y / WH) * 2 - 1); return 1 - lat * 1.05; },
    resource(x, y) { return hash2(Math.floor(x * 2), Math.floor(y * 2), seed ^ 0x5a17); },
  };
}
