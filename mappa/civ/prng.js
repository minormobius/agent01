// mappa/civ/prng.js — the determinism substrate for the civ sim.
//
// Everything downstream inherits mappa's discipline: a bit-exact mulberry32 PRNG,
// orthogonal named streams keyed by (seed, streamId), and integer hashing. No
// Math.random, no Date.now, no wall-clock, no unordered iteration that leaks into
// results. Same (world, config, civSeed, ticks) ⇒ byte-identical chronicle.
//
// Pure + dependency-free so it unit-tests in plain node and ports to Rust/WASM.

import { mulberry32 } from '../engine.js';
export { mulberry32 };

// 32-bit string hash (xmur3 finaliser style) — turns a stream name into a salt.
export function hashStr(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

// A named RNG stream. Orthogonal: two different streamIds off the same seed never
// share draws, so subsystems (demography, dispersal, innovation…) don't interfere.
export function stream(seed, streamId) {
  return mulberry32(((seed >>> 0) ^ hashStr(streamId)) >>> 0);
}

// THE GENE TRICK (mappa's orthogonality move): draw the seed-derived default FIRST,
// then override with a pinned config value. So changing one config knob leaves the
// others' seed-character intact — dimensions stay orthogonal under mutation.
// def(rng, pinned) advances the stream every call, then returns pinned if provided.
export function def(rng, pinned) {
  const d = rng();
  return pinned == null ? d : pinned;
}

// integer draw in [0, n)
export function irnd(rng, n) { return Math.floor(rng() * n) % n; }

// FNV-1a 32-bit over a string — the chronicle hash (determinism gate).
export function fnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// fixed-point: continuous knob ⇔ integer (×1000), for PDS/DAG-CBOR + token stability.
export const FX = 1000;
export const toFx = v => Math.round(v * FX);
export const fromFx = i => i / FX;

// stable rounded number for hashing / serialization (kills float drift in output).
export const q = (x, p = 1000) => Math.round(x * p) / p;

// softmax pick over a scored candidate list using a single rng draw. Deterministic.
// scores: Float array; returns the chosen index. tau = temperature (>0).
export function softmaxPick(rng, scores, n, tau = 1) {
  let mx = -Infinity;
  for (let i = 0; i < n; i++) if (scores[i] > mx) mx = scores[i];
  let sum = 0;
  for (let i = 0; i < n; i++) { scores[i] = Math.exp((scores[i] - mx) / tau); sum += scores[i]; }
  let r = rng() * sum;
  for (let i = 0; i < n; i++) { r -= scores[i]; if (r <= 0) return i; }
  return n - 1;
}
