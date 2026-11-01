/* FALL LINE's solver and difficulty, no DOM.

   THE ORACLE rides one route down (trails.js routes(): a chain of trails from the top to one trail's end) as a person
   would on the page: the Cheshire cat's bike in easy mode (the lean asked for, taken in a twentieth of a second), its
   speed from the slope (trails.js speedStep: the grade along its heading under it, the trail's rolling or the
   hillside's), a pure-pursuit rider looking 2 + 0.9v metres ahead along the route, its stick limited to THROW, and a
   reaction time τ it doesn't make up for. It fails if it leaves its route (further than R from it).

   PAR is the fastest route's time. Each route's DIFFICULTY (/10) is 10 (0.3 timing + 0.25 w + 0.15 lean + 0.3 speed):
   timing 1 − τ⋆/MAX_TAU (τ⋆ the slowest reaction that still gets down it), w half the share of its bending that's out of
   the plane you start in and half how many directions it mixes, lean its biggest lean at the speed it's ridden
   (against 20°), speed its top speed against 8 m/s. A level's difficulty is its par route's: the quick way down. */
import { Bike } from "../../lean/js/dyn.js";
import { catBench } from "../../lean/js/catbike.js";
import { DS, G } from "../../tailspin/js/course.js";
import { routes, sampler, speedStep, BASIN } from "./trails.js";

export const MAX_TAU = 1.2, HZ = 60, THROW = 0.45, V0 = 1.5;
const add = (a, b, k = 1) => a.map((x, i) => x + k * b[i]), sc = (a, k) => a.map((x) => x * k), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function startBike(route, at = 0) {
  const b = new Bike({ P: catBench(), mech: "one-axis", v: V0 }); b.limits = false;
  const f = route.fr[at]; b.place(route.pts[at], f.T, f.e1); b.dist = at * DS; return b;
}
/* the grade under the bike along its heading (dh/ds), and whether it's on a trail */
export function underBike(S, b, R) {
  const p = b.pos, f = add(p, b.T, 0.5), r = add(p, b.T, -0.5);
  return { grade: S.height(f) - S.height(r), on: S.dist(p) < R, h: S.height(p) };
}
const near = (route, g, hint, span = 120) => {
  let best = Infinity, bi = hint; const lo = Math.max(0, hint - span), hi = Math.min(route.pts.length - 1, hint + span);
  for (let i = lo; i <= hi; i++) { const q = route.pts[i], d = Math.hypot(g[0] - q[0], g[1] - q[1], g[2] - q[2]); if (d < best) { best = d; bi = i; } }
  return { i: bi, d: best };
};
/* ride a route: { done, time, vmax, maxOff, maxLean } */
export function ride(B, route, R, tau = 0) {
  const S = sampler(B), bike = startBike(route), dt = 1 / HZ, lag = Math.round(tau * HZ), hist = [];
  let v = V0, hint = 0, t = 0, vmax = 0, maxOff = 0, maxLean = 0;
  const tMax = route.len / 1.0 + 10;
  while (t < tMax) {
    hist.push({ pos: bike.pos.slice(), T: bike.T.slice(), i: hint, v }); if (hist.length > lag + 1) hist.shift();
    const seen = hist[0], ahead = Math.min(route.pts.length - 1, seen.i + Math.round((2 + 0.9 * seen.v) / DS)), aim = route.pts[ahead];
    const r = add(aim, seen.pos, -1), lat = add(r, seen.T, -dot(r, seen.T));
    let want = sc(lat, ((2 / Math.max(dot(r, r), 1e-6)) * v * v) / G); const m = Math.hypot(...want); if (m > THROW) want = sc(want, THROW / m);
    const u = underBike(S, bike, R); v = speedStep(v, u.grade, u.on, dt); bike.v = v;
    bike.step(dt, want, null, true); t += dt; vmax = Math.max(vmax, v); maxLean = Math.max(maxLean, Math.hypot(...bike.lean));
    const nr = near(route, bike.pos, hint); hint = nr.i; maxOff = Math.max(maxOff, nr.d);
    if (nr.d > R) return { done: false, time: t, vmax, maxOff, maxLean, s: hint * DS };
    if (hint * DS >= route.len - 0.5) return { done: true, time: t, vmax, maxOff, maxLean, s: hint * DS };
  }
  return { done: false, time: t, vmax, maxOff, maxLean, s: hint * DS };
}
/* every route's time and difficulty, par, and the level's difficulty (its par route's) */
export function solve(B, o = {}) {
  const built = B.built, R = built.R, step = o.step ?? 0.1, out = [];
  for (const route of routes(built)) {
    const r0 = ride(B, route, R, 0);
    if (!r0.done) { out.push({ route, done: false }); continue; }
    let tau = 0; for (let t = step; t <= MAX_TAU + 1e-9; t += step) { if (!ride(B, route, R, t).done) break; tau = t; }
    // its bending: in the rider's frame (the route's bends), how much is out of the starting plane, how many directions
    let intoW = 0, all = 0; const dirs = [];
    for (const b of route.bend) { const k = Math.hypot(...b); all += k; intoW += Math.abs(b[1]); if (k > 1e-3) { const d = ((Math.atan2(b[1], b[0]) * 180) / Math.PI + 360) % 360; if (!dirs.some((e) => Math.min(Math.abs(e - d), 360 - Math.abs(e - d)) < 30)) dirs.push(d); } }
    const parts = { timing: 1 - tau / MAX_TAU, w: 0.5 * (all ? intoW / all : 0) + 0.5 * Math.min(1, Math.max(0, dirs.length - 1) / 3), lean: Math.min(1, r0.maxLean / ((20 * Math.PI) / 180)), speed: Math.min(1, r0.vmax / 8) };
    const score = Math.round(1000 * (0.3 * parts.timing + 0.25 * parts.w + 0.15 * parts.lean + 0.3 * parts.speed)) / 100;
    out.push({ route, done: true, time: r0.time, vmax: r0.vmax, tau, parts, score });
  }
  const ok = out.filter((r) => r.done), par = ok.length ? ok.reduce((a, b) => (b.time < a.time ? b : a)) : null;
  return { routes: out, par, score: par ? par.score : Infinity, solvable: out.length > 0 && out.every((r) => r.done) };
}
export { BASIN };
