/* WAKE's made courses, no DOM: a seed and a tier make a course, the same every time. The tier sets how many buoys,
   how far each turns from the last leg (and into which directions: left and right, then ana and kata, then any), how
   many islands, and the boat (the catamaran more often, harder). A course that doesn't sit in the lake, or that the
   oracle can't get round, is thrown away. */
import { place, check, basinE, MID } from "./lake.js";
import { solve } from "./oracle.js";
import { rng } from "../../tailspin/js/gen.js";
export { rng, todaySeed } from "../../tailspin/js/gen.js";
export const TIERS = { easy: 0.2, medium: 0.5, hard: 0.8 };
const add = (a, b, k = 1) => a.map((x, i) => x + k * b[i]), unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
export function draw(r, t) {
  const n = 4 + Math.round(3 * t + r()), buoys = [], start = [-65, 0, 0];
  let p = start, h = [1, 0, 0];
  for (let i = 0; i < n; i++) {
    let q = null, hq = null;
    for (let tries = 0; tries < 16 && !q; tries++) { // a leg that stays well inside the lake
      const ang = ((15 + (25 + 55 * t) * r()) * Math.PI) / 180, side = t < 0.3 ? (r() < 0.5 ? 0 : Math.PI) : t < 0.55 ? (Math.PI / 2) * Math.floor(4 * r()) : 2 * Math.PI * r();
      let a = unit([-h[1], h[0], 0]); if (Math.abs(h[2]) > 0.9) a = [0, 1, 0]; a = unit(add(a, h, -a.reduce((s, x, k) => s + x * h[k], 0)));
      const b = [h[1] * a[2] - h[2] * a[1], h[2] * a[0] - h[0] * a[2], h[0] * a[1] - h[1] * a[0]], lat = add(a.map((x) => x * Math.cos(side)), b, Math.sin(side));
      const hh = unit(add(h.map((x) => x * Math.cos(ang)), lat, Math.sin(ang))), pp = add(p, hh, 22 + 12 * r());
      if (basinE(add(MID, pp)) < 0.7) { q = pp; hq = hh; }
    }
    if (!q) break;
    h = hq; p = q; buoys.push(p.map((x) => Math.round(x)));
  }
  const islands = [];
  for (let k = 0, want = t < 0.3 ? 0 : 1 + Math.round(2 * t * r()); k < 40 && islands.length < want; k++) {
    const c = [Math.round(-50 + 100 * r()), Math.round(-45 + 90 * r()), Math.round(-28 + 56 * r())], rr = Math.round(7 + 5 * r()), path = [start, ...buoys];
    const segD = (q, a, b) => { const ab = add(b, a, -1), L2 = ab.reduce((s, x) => s + x * x, 0), s = Math.max(0, Math.min(1, add(q, a, -1).reduce((u, x, j) => u + x * ab[j], 0) / L2)); return Math.hypot(...add(q, add(a, ab, s), -1)); };
    if (path.slice(1).some((q, j) => segD(c, path[j], q) < rr + 6)) continue;
    islands.push({ c, r: rr, h: Math.round(2 + 2 * r()) });
  }
  return { boat: r() < 1.3 * t - 0.35 ? "catamaran" : "triad", start, buoys, islands };
}
export function make(seed, tier) {
  const r = rng(seed * 2654435761 + Math.round(tier * 1000) + 29);
  for (let k = 0; k < 80; k++) {
    const lvl = draw(r, tier); if (lvl.buoys.length < 4) continue; const P = place(lvl);
    if (P.buoys.some((b) => basinE(b) > 0.76) || !check(P).ok) continue;
    const s = solve(P, { step: 0.2 }); if (!s.solvable) continue;
    return { ...lvl, seed, tier, tries: k + 1, sol: s };
  }
  return null;
}
export { MID };
