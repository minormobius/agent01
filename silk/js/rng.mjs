// rng.mjs — the only source of randomness in the weaver.
//
// EVERY stochastic choice the agent makes draws from one of these streams, and
// the streams are seeded. That is not tidiness: the whole claim of this surface
// is that a set of boundary conditions admits a *family* of correct webs, and
// you cannot exhibit a family unless you can re-draw a member of it exactly.
// Determinism is what makes "same boundary, 24 seeds" a measurement rather than
// an anecdote — and it is what lets the path-dependence view perturb ONE
// decision and hold every other decision fixed.
//
// mulberry32: 32-bit state, period 2^32, passes gjrand's smallcrush. Plenty for
// a spider. No dependencies, byte-identical in node and every browser.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash a string to a 32-bit seed, so the UI can take "garden" as a seed.
export function hashSeed(s) {
  let h = 2166136261 >>> 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// A named bundle of streams.
//
// SEPARATE STREAMS PER DECISION CLASS, deliberately. If bridging, framing,
// radius placement and spiral pitch all drew from one stream, changing the
// number of radii would reshuffle every later draw, and the path-dependence
// view could not tell "the perturbation propagated" from "the noise changed".
// With one stream per class, perturbing radius #3 leaves the spiral's own
// draws bit-identical — so any difference downstream is *structure*, not luck.
export class Streams {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.bridge = mulberry32(this.seed ^ 0x9e3779b9);
    this.frame = mulberry32(this.seed ^ 0x85ebca6b);
    this.radius = mulberry32(this.seed ^ 0xc2b2ae35);
    this.aux = mulberry32(this.seed ^ 0x27d4eb2f);
    this.capture = mulberry32(this.seed ^ 0x165667b1);
    this.wobble = mulberry32(this.seed ^ 0xd3a2646c);
  }
}

// uniform in [lo, hi)
export const uni = (rnd, lo, hi) => lo + (hi - lo) * rnd();

// Symmetric triangular deviate on [-1, 1]: the sum of two uniforms, centred.
// Used instead of a gaussian because it is bounded — an unbounded tail in a
// leg-span or pitch draw produces a web with a thread on the far side of the
// garden, and one such outlier ruins a family plot for no biological reason.
export const tri = (rnd) => rnd() + rnd() - 1;

// A bounded deviate around `mid`, spread `s`, clamped to [lo, hi].
export const around = (rnd, mid, s, lo, hi) =>
  Math.min(hi, Math.max(lo, mid + tri(rnd) * s));
