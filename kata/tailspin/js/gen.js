/* TAILSPIN's made levels, no DOM: a seed and a tier (0 easy to 1 nutty) make a course, the same every time.
   The tier sets what it may ask: how many bends, how tight (radius from 22 m down to 6), which ways (left and right
   only, then ana and kata, then the diagonals, then any angle), how often a bend twists and how fast, and how narrow
   the track is (radius 3 m down to 1.5). A draw that doesn't fit the stadium, comes near itself, or that the oracle
   can't ride (τ = 0) is thrown away and the next drawn, so every made level can be finished. */
import { build, fits } from "./course.js";
import { ride } from "./oracle.js";

export function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const TIERS = { easy: 0.2, medium: 0.5, hard: 0.8 };
/* the segments for one draw */
export function draw(r, t) {
  const segs = [{ len: 12 + 6 * r() }], nb = 2 + Math.round(4 * t + 2 * r()), R = Math.max(1.5, 3 - 1.5 * t);
  const pickDir = () => {
    if (t < 0.2) return r() < 0.5 ? 0 : 180;
    if (t < 0.4) return 90 * Math.floor(4 * r());
    if (t < 0.6) return 45 * Math.floor(8 * r());
    return Math.round(360 * r());
  };
  for (let i = 0; i < nb; i++) {
    const rad = (22 - 16 * t) * (0.8 + 0.4 * r()), len = 14 + 16 * r(), twist = r() < 0.8 * t ? (r() < 0.5 ? -1 : 1) * (2 + 9 * t * r()) : 0;
    segs.push({ len: Math.round(len), r: Math.round(rad * 10) / 10, dir: pickDir(), ...(twist ? { twist: Math.round(twist * 10) / 10 } : {}) });
    if (r() < 0.75 - 0.5 * t) segs.push({ len: Math.round(4 + 8 * r() * (1 - t)) });
  }
  segs.push({ len: 12 });
  return { segs, R: Math.round(R * 10) / 10 };
}
/* the made level for (seed, tier): the first draw that fits and the oracle can ride */
export function make(seed, tier) {
  const r = rng(seed * 2654435761 + Math.round(tier * 1000));
  for (let k = 0; k < 60; k++) {
    const d = draw(r, tier), C = build(d.segs, d.R);
    if (!fits(C).ok) continue;
    if (!ride(C, 0).done) continue;
    return { ...d, seed, tier, tries: k + 1, C };
  }
  return null;
}
/* today's: the date as the seed, medium */
export const todaySeed = (d = new Date()) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
