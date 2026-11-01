/* WAKE's oracle and difficulty, no DOM.

   THE ORACLE helms a course as a person on the page would: it steers straight for the next buoy (the rudder's
   direction is where the buoy lies across the bow, its size GAIN × how far off the bow it lies), full throttle, easing
   to a third before a turn that would heel the boat past 0.45 of the way to capsizing (the steady heel, u ω arm / g GM
   along the turn) and turning no harder than would heel it 0.6 of the way, and a reaction time τ it doesn't make up for. It fails
   if it capsizes, runs aground or runs out of time.

   PAR is its time at τ = 0. The DIFFICULTY (/10) is 10 (0.25 timing + 0.3 w + 0.2 rudder + 0.25 heel): timing
   1 − τ⋆/MAX_TAU (τ⋆ the slowest reaction that still gets round), w half the share of its turning that was into w
   (across e2, out of the slice you start in) and half how many directions across the bow it turned (of four), rudder the share of the time it held the rudder over past 0.7, heel its biggest
   heel against the capsize angle. */
import { Boat, CAPSIZE, RMIN, G } from "./boat.js";
import { place, depthAt, GATE } from "./lake.js";
export const MAX_TAU = 1.5, HZ = 30;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function startBoat(P, kind = P.boat) { return new Boat(kind, P.start.p, P.start.T, P.start.e1); }
/* the oracle's helm: from what it sees (pos, T, e1, e2, heel), the rudder and throttle */
export const GAIN = 1.3;
export function helm(seen, buoy, H) {
  const r = buoy.map((x, i) => x - seen.pos[i]), ahead = dot(r, seen.T), lat = [dot(r, seen.e1), dot(r, seen.e2)], m = Math.hypot(...lat);
  const th = Math.atan2(m, ahead); let k = Math.min(1, GAIN * th); const d = m > 1e-9 ? lat.map((x) => x / m) : [1, 0];
  // the heel this turn would settle at, u ω arm / (g GM along it): throttle back before a turn that would lay her over,
  // and turn no harder than six tenths of the way to capsizing
  const gd = d[0] * (H.GM[0][0] * d[0] + H.GM[0][1] * d[1]) + d[1] * (H.GM[1][0] * d[0] + H.GM[1][1] * d[1]), u = Math.max(seen.u, 0);
  const heelAt = (kk) => (gd > 0 ? (u * kk * (Math.max(u, 1.2) / RMIN) * H.arm) / (G * gd) : Infinity);
  let throttle = 1; if (heelAt(k) > 0.45 * CAPSIZE || Math.hypot(...seen.h) > 0.5 * CAPSIZE) throttle = 0.3;
  if (heelAt(k) > 0.6 * CAPSIZE) k = Math.max(0.1, k * (0.6 * CAPSIZE) / heelAt(k));
  return { turn: d.map((x) => x * k), throttle };
}
export function ride(level, tau = 0, kind) {
  const P = level.buoys && level.start.p ? level : place(level), b = startBoat(P, kind), dt = 1 / HZ, lag = Math.round(tau * HZ), hist = [];
  let next = 0, t = 0, wIn = 0, wAll = 0, hard = 0, maxHeel = 0, grounded = false; const dirs = [];
  const dist = P.buoys.reduce((s, q, i) => s + Math.hypot(...q.map((x, j) => x - (i ? P.buoys[i - 1] : P.start.p)[j])), 0), tMax = dist / 2 + 30;
  const depth = (g) => depthAt(P, g);
  while (t < tMax) {
    hist.push({ pos: b.pos.slice(), T: b.T.slice(), e1: b.e1.slice(), e2: b.e2.slice(), h: b.h.slice(), u: b.u }); if (hist.length > lag + 1) hist.shift();
    const c = helm(hist[0], P.buoys[next], b.H);
    b.step(dt, c.turn, c.throttle, depth); t += dt;
    if (b.capsized) return { done: false, why: "capsized", time: t, next };
    if (b.aground) { grounded = true; return { done: false, why: "aground", time: t, next }; }
    wIn += Math.abs(b.w[1]) * dt; wAll += Math.hypot(...b.w) * dt; if (Math.hypot(...c.turn) > 0.7) hard += dt;
    if (Math.hypot(...c.turn) > 0.3) { const a = ((Math.atan2(c.turn[1], c.turn[0]) * 180) / Math.PI + 360) % 360; if (!dirs.some((e) => Math.min(Math.abs(e - a), 360 - Math.abs(e - a)) < 40)) dirs.push(a); } maxHeel = Math.max(maxHeel, Math.hypot(...b.h));
    if (Math.hypot(...P.buoys[next].map((x, i) => x - b.pos[i])) < GATE) { next++; if (next === P.buoys.length) return { done: true, time: t, wShare: wAll ? wIn / wAll : 0, dirs: dirs.length, hard: hard / t, maxHeel, grounded }; }
  }
  return { done: false, why: "time", time: t, next };
}
export function solve(level, o = {}) {
  const P = level.buoys && level.start.p ? level : place(level), step = o.step ?? 0.1, r0 = ride(P, 0);
  if (!r0.done) return { solvable: false, why: r0.why, at: r0.next, score: Infinity };
  let tau = 0; for (let t = step; t <= MAX_TAU + 1e-9; t += step) { if (!ride(P, t).done) break; tau = t; }
  const parts = { timing: 1 - tau / MAX_TAU, w: 0.5 * r0.wShare + 0.5 * Math.min(1, Math.max(0, r0.dirs - 1) / 3), rudder: Math.min(1, r0.hard), heel: Math.min(1, r0.maxHeel / CAPSIZE) };
  const score = Math.round(1000 * (0.25 * parts.timing + 0.3 * parts.w + 0.2 * parts.rudder + 0.25 * parts.heel)) / 100;
  return { solvable: true, par: Math.round(r0.time * 10) / 10, tau, parts, score };
}
