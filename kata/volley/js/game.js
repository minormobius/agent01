/* VOLLEY — the rules. No DOM. One archer on a 4D bicycle against the many, who live in a single slice (w = 0).

   THE WORLD: 4D, (x, y, z, w), y up, flat ground at y = 0. The MANY are 3D people: they stand, see and shoot in the slice
   w = 0 and nowhere else. Some stand in the open; some sit in BUNKERS, closed boxes of their own 3D world (four walls and
   a roof, each a slab with a little thickness in w). You ride Lean's track, which leaves their slice: an oval in
   (x, z) whose w is C·sin 2t, so it swings ana of them (w > 0), then kata, twice a lap, and crosses their world four
   times.

   WHAT FOLLOWS FROM THAT, and is all this game is:
   - They see you only while your body cuts their slice (|w| < SEE). The rest of the lap you don't exist for them.
   - Their arrows never leave w = 0. They can hit you only at a crossing.
   - Your arrows cross w. An arrow loosed from w = 9 is in their slice only at the end of its flight: it doesn't pass
     their walls, it arrives inside them. A closed bunker is open from ana. (Loosed from inside their slice, the same
     arrow flies as theirs do, and the wall stops it. And from too far off, or too little w, its last metres run inside
     the slice and can still catch a wall: get closer, or further out.)

   The bicycle is Lean's (../../lean/js/dyn.js: the Whipple benchmark in 4D, an LQR rider, pure pursuit), ridden by its
   autopilot round the track; your hands are on the bow. Arrows are points under gravity; the bow solves the arc (the
   low one) to the point you choose, leading a walking target. Lengths in metres, time in seconds. */
import { Bike, followLean, lookahead } from "../../lean/js/dyn.js";
import { parts, BIKE } from "../../lean/js/bike.js";

import { PTS as LEAN_PTS, S as LEAN_S, NS, LAP as LEAN_LAP, BASIN, OVAL } from "../../lean/js/world.js";
/* the arena is Lean's: its basin, its track (an oval 55 × 48 m whose w swings ±10 m, twice a lap: four crossings of
   w = 0). Everything here is in the arena's own coordinates: the basin's middle is the origin and their slice is w = 0;
   ORIGIN takes them to Lean's world (and the ground there is 11 m up) */
export const ORIGIN = [BASIN.c[0], BASIN.c[1], BASIN.c[2]]; // (x, z, w)
export const COURSE = { A: OVAL.a, B: OVAL.b, C: OVAL.c, N: NS };
export const G = 9.81, V_BIKE = 8, V_ARROW = 22, V_THEIRS = 24, SEE = 0.6, BODY = 0.65, RIDER = 0.6, DRAW = 0.5, RANGE_THEIRS = 40, WALL_W = 0.3, WALL_T = 0.25, HP = 5;
const { A, B, C, N } = COURSE;
export const PTS = LEAN_PTS.slice(0, N).map((p) => [p[0] - ORIGIN[0], p[1] - ORIGIN[1], p[2] - ORIGIN[2]]), S = LEAN_S, LAP = LEAN_LAP; // (x, z, w)
const to4 = (g, y = 0) => [g[0], y, g[1], g[2]];
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), sc = (a, k) => a.map((v) => v * k), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), unit = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------------------------------------------------------------- arrows */
/* the low arc from P to Q (4D) at speed v: the launch velocity and the time of flight, or null if out of range.
   Gravity acts along −y; everything else of the displacement (x, z and w alike) is "along the ground" */
export function arc(P, Q, v) {
  const D = add(Q, P, -1), h = D[1], H = [D[0], 0, D[2], D[3]], L = Math.hypot(...H); if (L < 1e-6) return null;
  const disc = v ** 4 - G * (G * L * L + 2 * h * v * v); if (disc < 0) return null;
  const th = Math.atan((v * v - Math.sqrt(disc)) / (G * L)), vel = add(sc(H, (v * Math.cos(th)) / L), [0, 1, 0, 0], v * Math.sin(th));
  return { vel, tof: L / (v * Math.cos(th)) };
}
/* where a segment P0→P1 first meets a 4D box (0..1), or Infinity */
function segBox(P0, P1, lo, hi) {
  let t0 = 0, t1 = 1;
  for (let k = 0; k < 4; k++) { const d = P1[k] - P0[k]; if (Math.abs(d) < 1e-12) { if (P0[k] < lo[k] || P0[k] > hi[k]) return Infinity; continue; }
    let a = (lo[k] - P0[k]) / d, b = (hi[k] - P0[k]) / d; if (a > b) [a, b] = [b, a]; if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return Infinity; }
  return t0;
}
/* where a segment first comes within r of a point (0..1), or Infinity */
function segBall(P0, P1, c, r) {
  const d = add(P1, P0, -1), o = add(P0, c, -1), a = dot(d, d), b = 2 * dot(o, d), cc = dot(o, o) - r * r; if (cc <= 0) return 0;
  const disc = b * b - 4 * a * cc; if (disc < 0 || a < 1e-12) return Infinity; const t = (-b - Math.sqrt(disc)) / (2 * a); return t >= 0 && t <= 1 ? t : Infinity;
}

/* ---------------------------------------------------------------- a game */
export function makeGame(seed = 1, wave = 1) {
  const R = rng(seed * 7919 + wave * 104729), g = { seed, wave, t: 0, state: "playing", hp: HP, loosed: 0, hits: 0, kills: 0, laps: 0, cool: 0, arrows: [], events: [], R };
  // the bunkers (in the infield), each with one of the many inside; then the ones in the open
  const nB = Math.min(6, 1 + wave), nO = Math.min(10, 3 + 2 * wave); g.bunkers = []; g.enemies = [];
  const inField = (x, z, k) => (x / A) ** 2 + (z / B) ** 2 < k * k;
  for (let tries = 0; g.bunkers.length < nB && tries < 400; tries++) { const x = (R() * 2 - 1) * A * 0.7, z = (R() * 2 - 1) * B * 0.7; if (!inField(x, z, 0.72) || g.bunkers.some((b) => Math.hypot(b.x - x, b.z - z) < 9)) continue; g.bunkers.push({ x, z, h: 2.2, H: 2.6 }); g.enemies.push({ x, z, vx: 0, vz: 0, kind: "bunker", alive: true, cool: 0, turn: 0 }); }
  for (let tries = 0; g.enemies.length < nB + nO && tries < 800; tries++) { const x = (R() * 2 - 1) * A * 0.8, z = (R() * 2 - 1) * B * 0.8; if (!inField(x, z, 0.8) || g.bunkers.some((b) => Math.hypot(b.x - x, b.z - z) < 5) || g.enemies.some((e) => Math.hypot(e.x - x, e.z - z) < 3)) continue;
    const a = R() * 6.283; g.enemies.push({ x, z, vx: 0.8 * Math.cos(a), vz: 0.8 * Math.sin(a), kind: "open", alive: true, cool: 1 + R() * 2, turn: 2 + R() * 3 }); }
  // the walls: each bunker's four sides and its roof, slabs with a little thickness in w
  g.slabs = [];
  for (const b of g.bunkers) { const { x, z, h, H } = b, T = WALL_T, W = WALL_W, S4 = (lo, hi) => g.slabs.push({ lo, hi });
    S4([x - h, 0, z - h, -W], [x - h + T, H, z + h, W]); S4([x + h - T, 0, z - h, -W], [x + h, H, z + h, W]); S4([x - h, 0, z - h, -W], [x + h, H, z - h + T, W]); S4([x - h, 0, z + h - T, -W], [x + h, H, z + h, W]); S4([x - h, H - T, z - h, -W], [x + h, H, z + h, W]); }
  // the bicycle, starting an eighth of the way round, furthest ana
  g.bike = new Bike({ mech: "two-axis", v: V_BIKE }); g.bike.limits = false; g.idx = N / 8; place(g, g.idx);
  g.total = g.enemies.length; pose(g);
  return g;
}
const tangent = (i) => unit(add(PTS[(i + 1) % N], PTS[(i + N - 1) % N], -1));
function place(g, i) { const T = tangent(i), acc = add(add(PTS[(i + 1) % N], PTS[i], -2), PTS[(i + N - 1) % N]), n = unit(add(acc, T, -dot(acc, T))); g.bike.place(PTS[i], T, n); g.bike.settle(followLean(g.bike, aheadPt(i, lookahead(g.bike.v)))); }
function aheadPt(i, L) { let s2 = (S[i] + L) % LAP, lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s2) lo = m; else hi = m; } return PTS[lo]; }
function nearIdx(pos, hint) { let best = Infinity, bi = hint; for (let k = -40; k <= 40; k++) { const i = (((hint + k) % N) + N) % N, q = PTS[i], d = Math.hypot(pos[0] - q[0], pos[1] - q[1], pos[2] - q[2]); if (d < best) { best = d; bi = i; } } return { i: bi, d: best }; }
/* the bike's pose for drawing (bike.js's parts() wants it), and the rider: the middle of the body, the shoulder the
   arrows leave from, the velocity */
export function pose(g) {
  const bike = g.bike, UP = [0, 1, 0, 0], p = to4(bike.pos), T = to4(bike.T), L = to4(bike.lean), phi = Math.min(Math.hypot(...L), 1.45), lh = phi > 1e-6 ? unit(L) : to4(bike.a);
  const u = add(sc(UP, Math.cos(phi)), lh, Math.sin(phi)), tilt = (x) => unit(add(x, u, -dot(x, u))), Sv = to4(bike.steer), del = Math.min(Math.hypot(...Sv), 1.2), sd = del > 1e-6 ? unit(Sv) : to4(bike.a);
  const st = { p, T, u, a: tilt(to4(bike.a)), b: tilt(to4(bike.b)), Np: tilt(sd), Tf: add(sc(T, Math.cos(del)), sd, Math.sin(del)), delta: del, phi, mech: bike.mech, s: bike.dist, front: add(p, T, BIKE.WB) };
  g.st = st; g.rider = add(add(p, T, 0.45), u, 1.2); g.shoulder = add(add(p, T, 0.6), u, 1.5); g.vel = sc(T, bike.v); g.w = p[3];
  return st;
}
export const bikeParts = (g) => parts(g.st);
const enemyPos = (e, dt = 0) => [e.x + e.vx * dt, 1.0, e.z + e.vz * dt, 0];

/* loose an arrow at one of the many (led by its walk), or at a point of their slice. False if the bow isn't drawn yet
   or the point is out of range */
export function shoot(g, target) {
  if (g.state !== "playing" || g.cool > 0) return false;
  let a = null;
  if (typeof target === "number") { const e = g.enemies[target]; let tof = 0.6; for (let k = 0; k < 4; k++) { a = arc(g.shoulder, enemyPos(e, tof), V_ARROW); if (!a) return false; tof = a.tof; } }
  else a = arc(g.shoulder, target, V_ARROW);
  if (!a) return false;
  g.arrows.push({ p: g.shoulder.slice(), v: a.vel, mine: true, age: 0 }); g.cool = DRAW; g.loosed++; return true;
}
/* would an arrow loosed now at enemy i arrive? "ok", "range" (too far), or "wall" (its last metres catch a wall) */
export function preview(g, i) {
  const e = g.enemies[i]; let a = null, tof = 0.6; for (let k = 0; k < 4; k++) { a = arc(g.shoulder, enemyPos(e, tof), V_ARROW); if (!a) return "range"; tof = a.tof; }
  let p = g.shoulder.slice(); const v = a.vel.slice(), dt = 1 / 120;
  for (let t = 0; t < a.tof - 1e-9; t += dt) { const h = Math.min(dt, a.tof - t), q = [p[0] + v[0] * h, p[1] + v[1] * h - 0.5 * G * h * h, p[2] + v[2] * h, p[3] + v[3] * h]; v[1] -= G * h;
    if (Math.abs(q[3]) < WALL_W + 0.05 || Math.abs(p[3]) < WALL_W + 0.05) for (const s of g.slabs) if (segBox(p, q, s.lo, s.hi) < Infinity) { const target = enemyPos(e, a.tof); if (Math.hypot(...add(q, target, -1)) > BODY) return "wall"; }
    p = q; }
  return "ok";
}

/* one step */
export function step(g, dt) {
  if (g.state !== "playing") return;
  g.t += dt; g.cool = Math.max(0, g.cool - dt);
  // the bicycle, on its autopilot
  const nb = nearIdx(g.bike.pos, g.idx); if (nb.i < g.idx - N / 2) g.laps++; g.idx = nb.i; g.off = nb.d;
  g.bike.step(dt, followLean(g.bike, aheadPt(nb.i, lookahead(g.bike.v)))); pose(g);
  const seen = Math.abs(g.w) < SEE; g.seen = seen;
  // the many: those in the open walk a little, and shoot when they can see you
  for (const e of g.enemies) { if (!e.alive || e.kind !== "open") continue;
    e.turn -= dt; if (e.turn <= 0 || (e.x / A) ** 2 + (e.z / B) ** 2 > 0.72) { const a = g.R() * 6.283, back = (e.x / A) ** 2 + (e.z / B) ** 2 > 0.72; e.vx = back ? -0.8 * Math.sign(e.x) * 0.7 : 0.8 * Math.cos(a); e.vz = back ? -0.8 * Math.sign(e.z) * 0.7 : 0.8 * Math.sin(a); e.turn = 2 + g.R() * 3; }
    e.x += e.vx * dt; e.z += e.vz * dt; e.cool -= dt;
    if (seen && e.cool <= 0) { const from = [e.x, 1.4, e.z, 0], d = Math.hypot(g.rider[0] - e.x, g.rider[2] - e.z); if (d < RANGE_THEIRS) {
      // they aim where you'll be, in their own world: your (x, y, z), w = 0, with an archer's error
      let a = null, tof = d / V_THEIRS; for (let k = 0; k < 3; k++) { const q = add(g.rider, g.vel, tof); q[3] = 0; q[0] += (g.R() - 0.5) * 0.9; q[2] += (g.R() - 0.5) * 0.9; a = arc(from, q, V_THEIRS); if (!a) break; tof = a.tof; }
      if (a) { g.arrows.push({ p: from, v: a.vel, mine: false, age: 0 }); e.cool = 1.3 + g.R() * 0.9; } } }
  }
  // the arrows
  for (const ar of g.arrows) { if (ar.stuck) { ar.age += dt; continue; }
    const p0 = ar.p, p1 = [p0[0] + ar.v[0] * dt, p0[1] + ar.v[1] * dt - 0.5 * G * dt * dt, p0[2] + ar.v[2] * dt, p0[3] + ar.v[3] * dt]; ar.v = [ar.v[0], ar.v[1] - G * dt, ar.v[2], ar.v[3]]; ar.age += dt;
    let tWall = Infinity; if (Math.min(Math.abs(p0[3]), Math.abs(p1[3])) < WALL_W + 1e-9 || p0[3] * p1[3] < 0) for (const s of g.slabs) tWall = Math.min(tWall, segBox(p0, p1, s.lo, s.hi));
    let tHit = Infinity, who = -1;
    if (ar.mine) g.enemies.forEach((e, i) => { if (!e.alive) return; const t = segBall(p0, p1, enemyPos(e), BODY); if (t < tHit) { tHit = t; who = i; } });
    else { const t = segBall(p0, p1, g.rider, RIDER); if (t < tHit) { tHit = t; who = 0; } }
    const at = (t) => p0.map((x, k) => x + t * (p1[k] - x));
    if (tHit <= tWall && tHit < Infinity) { ar.p = at(tHit); ar.stuck = true; ar.gone = true;
      if (ar.mine) { const e = g.enemies[who]; e.alive = false; g.kills++; g.events.push({ t: g.t, kind: "kill", p: ar.p, bunker: e.kind === "bunker" }); }
      else { g.hp--; g.hits++; g.events.push({ t: g.t, kind: "hurt", p: ar.p }); } }
    else if (tWall < Infinity) { ar.p = at(tWall); ar.stuck = true; ar.age = 0; g.events.push({ t: g.t, kind: "wall", p: ar.p, mine: ar.mine }); }
    else if (p1[1] <= 0) { ar.p = at(p0[1] / (p0[1] - p1[1] || 1)); ar.stuck = true; ar.age = 0; }
    else ar.p = p1;
  }
  g.arrows = g.arrows.filter((a) => !a.gone && !(a.stuck && a.age > 4) && a.age < 12);
  g.events = g.events.filter((e) => g.t - e.t < 1.5);
  if (g.kills >= g.total) g.state = "won"; else if (g.hp <= 0) g.state = "fell";
}
/* a bot, for the tests and the demo button: looses at the nearest of the many it has a clear shot at */
export function bot(g) {
  if (g.cool > 0 || g.state !== "playing") return; let best = -1, bd = Infinity;
  g.enemies.forEach((e, i) => { if (!e.alive) return; const d = Math.hypot(e.x - g.rider[0], e.z - g.rider[2], g.w); if (d < bd && preview(g, i) === "ok") { bd = d; best = i; } });
  if (best >= 0) shoot(g, best);
}
