/* FALL LINE's made hills, no DOM: a seed and a tier make a level, the same every time. The tier sets how steep (grade
   6% to 18%), how many bends on the main trail and how tight, which ways they go (left and right, then ana and kata,
   then any), how many ways off it (one to three forks, steeper than the main trail), and how narrow. A draw that
   doesn't fit the valley, comes near itself, or has a way down the oracle can't ride is thrown away. */
import { buildTrails, bake } from "./trails.js";
import { solve } from "./descent.js";
export { rng, todaySeed } from "../../tailspin/js/gen.js";
import { rng } from "../../tailspin/js/gen.js";
export const TIERS = { easy: 0.2, medium: 0.5, hard: 0.8 };
export function draw(r, t) {
  const dir = () => (t < 0.25 ? (r() < 0.5 ? 0 : 180) : t < 0.5 ? 90 * Math.floor(4 * r()) : Math.round(360 * r()));
  const g = Math.round((0.06 + 0.08 * t + 0.03 * r()) * 100) / 100, segs = [{ len: 12 + Math.round(8 * r()) }], nb = 2 + Math.round(2 * t + r());
  for (let i = 0; i < nb; i++) { segs.push({ len: Math.round(18 + 10 * r()), r: Math.round(34 - 16 * t + 6 * r()), dir: dir(), ...(t > 0.5 && r() < t - 0.3 ? { twist: (r() < 0.5 ? -1 : 1) * Math.round(2 + 3 * r()) } : {}) }); segs.push({ len: Math.round(6 + 6 * r()) }); }
  const trails = [{ segs }], L = segs.reduce((a, q) => a + q.len, 0), nf = 1 + Math.round(1.6 * t * r() + 0.4 * r());
  for (let k = 0; k < nf; k++) {
    const d = dir(), at = Math.round(10 + (L - 30) * ((k + 0.3 + 0.4 * r()) / nf)), steep = Math.round((g + 0.04 + 0.04 * r()) * 100) / 100, rr = Math.round(12 + 4 * r());
    trails.push({ from: 0, at, segs: [{ len: 12, r: rr, dir: d, grade: steep }, { len: 10, r: rr, dir: (d + 180) % 360 }, { len: Math.round(18 + 12 * r()), grade: steep }] });
  }
  return { R: Math.round((3 - 0.6 * t) * 10) / 10, grade: g, trails };
}
export function make(seed, tier) {
  const r = rng(seed * 2654435761 + Math.round(tier * 1000) + 17);
  for (let k = 0; k < 60; k++) {
    const lvl = draw(r, tier), b = buildTrails(lvl);
    if (!b.fit.ok) continue;
    const B = bake(lvl, b, seed), s = solve(B, { step: 0.2 });
    if (!s.solvable) continue;
    return { ...lvl, seed, tier, tries: k + 1, B, sol: s };
  }
  return null;
}
