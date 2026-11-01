/* TAILSPIN's solver and difficulty, no DOM.

   THE ORACLE rides a course as a person would on the page: the Cheshire cat's bike (the benchmark × 0.4, one-axis,
   catbike.js) at V_CAT, in easy mode (dyn.js: the bike takes the lean asked for in a twentieth of a second, with the
   steady turn's steer), its lean asked for by a rider who looks ahead along the track (pure pursuit: the lean of the
   circle through the point a lookahead ahead) and whose stick is limited to the level's throw. The rider has a
   reaction time τ: it acts now on what it saw τ ago (it doesn't make up for it: a person doesn't). It rides
   until it passes the finish or the bike leaves the track (further than R from the centreline).

   THE DIFFICULTY is how quick you have to be. τ⋆ is the slowest reaction (on a grid of 25 ms up to MAX_TAU) at which
   the oracle still finishes, every quicker one finishing too; the score is 10·(1 − τ⋆/MAX_TAU), so a course anyone
   could ride half asleep scores near 0 and one that needs a racer's reflexes near 10. A course the oracle can't ride
   at τ = 0 isn't a level. */
import { Bike } from "../../lean/js/dyn.js";
import { catBench } from "../../lean/js/catbike.js";
import { V_CAT, DS, nearest, G, demands } from "./course.js";

export const MAX_TAU = 1.2; // s
export const HZ = 60;
const add = (a, b, k = 1) => a.map((x, i) => x + k * b[i]), sc = (a, k) => a.map((x) => x * k), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* the stick's full throw for a course: twice the biggest lean it asks for, at least 8° (so there's room to correct,
   and fine control where the course is gentle) */
export function throwFor(C) { let k = 0; for (const b of C.bend) k = Math.max(k, Math.hypot(...b)); return Math.max((8 * Math.PI) / 180, 2 * Math.atan((V_CAT * V_CAT * k) / G)); }

/* a cat bike at the start of a course, heading along it, its frame the course's (c = e1, so the camera's ana is e2) */
export function startBike(C, at = 0) {
  const b = new Bike({ P: catBench(), mech: "one-axis", v: V_CAT }); b.limits = false;
  const f = C.fr[at]; b.place(C.pts[at], f.T, f.e1); b.dist = at * DS; return b;
}
/* the lean the rider asks for, from a pose (pos, T) and the course point it aims at */
export function pursuit(bike, pos, T, aim) {
  const r = add(aim, pos, -1), lat = add(r, T, -dot(r, T)), d2 = dot(r, r);
  return sc(lat, ((2 / Math.max(d2, 1e-6)) * bike.v * bike.v) / G); // small angles: lean ≈ v²κ/g
}
/* ride a course with reaction time tau: { done, s (how far it got, m), maxOff, meanOff, time } */
export function ride(C, tau = 0, o = {}) {
  const bike = startBike(C), dt = 1 / HZ, lag = Math.round(tau * HZ), hist = [], thr = o.throw ?? throwFor(C), L0 = 2.5 + 0.8 * V_CAT;
  let hint = 0, maxOff = 0, sumOff = 0, n = 0, t = 0;
  const endS = C.len - 0.5, tMax = (C.len / V_CAT) * 1.6 + 5;
  while (t < tMax) {
    hist.push({ pos: bike.pos.slice(), T: bike.T.slice(), i: hint }); if (hist.length > lag + 1) hist.shift();
    const seen = hist[0], ahead = Math.min(C.pts.length - 1, seen.i + Math.round(L0 / DS));
    let want = pursuit(bike, seen.pos, seen.T, C.pts[ahead]);
    const m = Math.hypot(...want); if (m > thr) want = sc(want, thr / m);
    bike.step(dt, want, null, true); t += dt;
    const nr = nearest(C, bike.pos, hint, 60); hint = nr.i; maxOff = Math.max(maxOff, nr.d); sumOff += nr.d; n++;
    if (nr.d > C.R) return { done: false, s: nr.s, maxOff, meanOff: sumOff / n, time: t };
    if (nr.s >= endS) return { done: true, s: nr.s, maxOff, meanOff: sumOff / n, time: t };
  }
  return { done: false, s: hint * DS, maxOff, meanOff: sumOff / Math.max(1, n), time: t };
}
/* the difficulty, out of 10, from four parts, each 0 to 1:
     timing  1 − τ⋆/MAX_TAU, τ⋆ the slowest reaction that still finishes (every quicker one finishing too)
     w       out of plane: half how much of the course's bending is out of the plane you start in (into w, where you
             can't see it), half how many directions it mixes (distinct bend directions, 30° apart, past the first,
             of 3; a twisting bend counts as all of them)
     twist   the fastest the bend's direction turns as you ride (a segment's twist), against TWIST_FULL degrees a metre
     lean    the biggest lean it asks for, against LEAN_FULL
   score = 10 (0.35 timing + 0.3 w + 0.2 twist + 0.15 lean). The cat bike at 3 m/s is forgiving of slow hands (a
   rider who sees everything finishes most courses reacting in a second), so the 4D parts carry the most weight:
   what's hard here is what you can't see */
export const TWIST_FULL = 8, LEAN_FULL = (20 * Math.PI) / 180, WEIGHTS = { timing: 0.35, w: 0.3, twist: 0.2, lean: 0.15 };
export function difficulty(C, o = {}) {
  const step = o.step ?? 0.025;
  if (!ride(C, 0, o).done) return { solvable: false, tau: 0, score: Infinity };
  let tau = 0;
  for (let t = step; t <= MAX_TAU + 1e-9; t += step) { if (!ride(C, t, o).done) break; tau = t; }
  const dm = demands(C), tw = Math.max(0, ...C.segs.map((g) => (g.r && isFinite(g.r) ? Math.abs(g.twist || 0) : 0)));
  const dirs = [], bends = C.segs.filter((g) => g.r && isFinite(g.r));
  let mixAll = false; for (const g of bends) { if (g.twist) mixAll = true; const d = (((g.dir || 0) % 360) + 360) % 360; if (!dirs.some((e) => Math.min(Math.abs(e - d), 360 - Math.abs(e - d)) < 30)) dirs.push(d); }
  const mix = mixAll ? 1 : Math.min(1, Math.max(0, dirs.length - 1) / 3);
  const parts = { timing: 1 - tau / MAX_TAU, w: 0.5 * dm.wShare + 0.5 * mix, twist: Math.min(1, tw / TWIST_FULL), lean: Math.min(1, dm.lean / LEAN_FULL) };
  const score = 10 * Object.keys(WEIGHTS).reduce((a, k) => a + WEIGHTS[k] * parts[k], 0);
  return { solvable: true, tau, parts, score: Math.round(100 * score) / 100 };
}
