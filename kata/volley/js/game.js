/* VOLLEY — the rules. No DOM. One archer on a 4D bicycle against the many, who live in a single slice (w = 0).

   A game of ORIENTATION. The arena is Lean's basin: a flat floor that is a 3D space (x, z, w), y up. The MANY are 3D
   people: they stand, see and shoot in the slice w = 0 and nowhere else. Some stand in the open; some sit in BUNKERS,
   closed boxes of their own 3D world (four walls and a roof, each a slab with a little thickness in w).

   YOU RIDE (Lean's bicycle, ../../lean/js/dyn.js: two steering axes, an ideal rider who gives the lean you ask for). The
   stick asks for a lean: across your view (c), which turns you the ordinary way, and into the direction you can't see
   (d), which turns your heading, and with it your whole slice, into that direction. You see only your own 3D slice,
   spanned by your heading, your c and up. The many are in it only where it meets their world, so finding them is the
   game: ride to where they are, and turn until your slice holds them.

   - They see you only while your body cuts their slice (|w| < SEE), and their arrows never leave w = 0.
   - Your arrows fly in whatever slice you loose them in, at the point you tap. Loosed in a slice that crosses w, an
     arrow is in their world only at the end of its flight: it doesn't pass a bunker's walls, it arrives inside them.
     Loosed from inside their world it flies as theirs do, and the wall stops it.

   Coordinates: the basin's middle is the origin and their slice is w = 0; ORIGIN takes (x, z, w) to Lean's world, where
   the ground is 11 m up. Lengths in metres, time in seconds. */
import { Bike, followLean } from "../../lean/js/dyn.js";
import { parts, BIKE } from "../../lean/js/bike.js";
import { PTS as LEAN_PTS, NS, BASIN } from "../../lean/js/world.js";

export const ORIGIN = [BASIN.c[0], BASIN.c[1], BASIN.c[2]]; // (x, z, w)
export const ARENA = { a: BASIN.a[0], b: BASIN.a[1], c: BASIN.a[2], edge: 0.8 }; // the basin's half-axes; you are turned back at `edge` of them
export const G = 9.81, V_BIKE = 7, V_ARROW = 22, V_THEIRS = 24, SEE = 0.6, BODY = 0.65, RIDER = 0.6, DRAW = 0.5, RANGE_THEIRS = 40, WALL_W = 0.3, WALL_T = 0.25, HP = 5, LEAN = 0.4;
export const PTS = LEAN_PTS.slice(0, NS).map((p) => [p[0] - ORIGIN[0], p[1] - ORIGIN[1], p[2] - ORIGIN[2]]); // Lean's track (x, z, w): painted on the floor, a landmark
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
  const R = rng(seed * 7919 + wave * 104729), g = { seed, wave, t: 0, state: "playing", hp: HP, loosed: 0, hits: 0, kills: 0, cool: 0, arrows: [], events: [], R, stick: [0, 0] };
  // the bunkers, each with one of the many inside; then the ones in the open: anywhere on their floor
  const nB = Math.min(6, 1 + wave), nO = Math.min(10, 3 + 2 * wave), { a, b } = ARENA; g.bunkers = []; g.enemies = [];
  const inField = (x, z, k) => (x / a) ** 2 + (z / b) ** 2 < k * k;
  for (let tries = 0; g.bunkers.length < nB && tries < 400; tries++) { const x = (R() * 2 - 1) * a * 0.6, z = (R() * 2 - 1) * b * 0.6; if (!inField(x, z, 0.6) || g.bunkers.some((q) => Math.hypot(q.x - x, q.z - z) < 14)) continue; g.bunkers.push({ x, z, h: 2.2, H: 2.6 }); g.enemies.push({ x, z, vx: 0, vz: 0, kind: "bunker", alive: true, cool: 0, turn: 0 }); }
  for (let tries = 0; g.enemies.length < nB + nO && tries < 800; tries++) { const x = (R() * 2 - 1) * a * 0.65, z = (R() * 2 - 1) * b * 0.65; if (!inField(x, z, 0.65) || g.bunkers.some((q) => Math.hypot(q.x - x, q.z - z) < 5) || g.enemies.some((e) => Math.hypot(e.x - x, e.z - z) < 6)) continue;
    const an = R() * 6.283; g.enemies.push({ x, z, vx: 0.8 * Math.cos(an), vz: 0.8 * Math.sin(an), kind: "open", alive: true, cool: 1 + R() * 2, turn: 2 + R() * 3 }); }
  // the walls: each bunker's four sides and its roof, slabs with a little thickness in w
  g.slabs = [];
  for (const q of g.bunkers) { const { x, z, h, H } = q, T = WALL_T, W = WALL_W, S4 = (lo, hi) => g.slabs.push({ lo, hi });
    S4([x - h, 0, z - h, -W], [x - h + T, H, z + h, W]); S4([x + h - T, 0, z - h, -W], [x + h, H, z + h, W]); S4([x - h, 0, z - h, -W], [x + h, H, z - h + T, W]); S4([x - h, 0, z + h - T, -W], [x + h, H, z + h, W]); S4([x - h, H - T, z - h, -W], [x + h, H, z + h, W]); }
  // the bicycle: on Lean's track where it is furthest ana (10 m from their world), heading along it, your unseen
  // direction square to your view (w itself, near enough): their world is beside you, and you can't see it
  g.bike = new Bike({ mech: "two-axis", v: V_BIKE }); g.bike.limits = false;
  { const i = NS / 8, T = unit(add(PTS[i + 1], PTS[i - 1], -1)), flat = unit([T[0], T[1], 0]), c = [-flat[1], flat[0], 0]; g.bike.place(PTS[i], flat, c); }
  g.total = g.enemies.length; pose(g);
  return g;
}
/* the bike's pose for drawing (bike.js's parts() wants it); the rider (the middle of the body, the shoulder the arrows
   leave from, the velocity); and the frame you see by: F ahead, R across (your c), N the direction you can't see */
export function pose(g) {
  const bike = g.bike, UP = [0, 1, 0, 0], p = to4(bike.pos), T = to4(bike.T), L = to4(bike.lean), phi = Math.min(Math.hypot(...L), 1.45), lh = phi > 1e-6 ? unit(L) : to4(bike.a);
  const u = add(sc(UP, Math.cos(phi)), lh, Math.sin(phi)), tilt = (x) => unit(add(x, u, -dot(x, u))), Sv = to4(bike.steer), del = Math.min(Math.hypot(...Sv), 1.2), sd = del > 1e-6 ? unit(Sv) : to4(bike.a);
  const st = { p, T, u, a: tilt(to4(bike.a)), b: tilt(to4(bike.b)), Np: tilt(sd), Tf: add(sc(T, Math.cos(del)), sd, Math.sin(del)), delta: del, phi, mech: bike.mech, s: bike.dist, front: add(p, T, BIKE.WB) };
  g.st = st; g.rider = add(add(p, T, 0.45), u, 1.2); g.shoulder = add(add(p, T, 0.6), u, 1.5); g.vel = sc(T, bike.v); g.w = p[3];
  g.frame = { F: T, R: to4(bike.c), N: to4(bike.d) };
  return st;
}
export const bikeParts = (g) => parts(g.st);
const enemyPos = (e, dt = 0) => [e.x + e.vx * dt, 1.0, e.z + e.vz * dt, 0];
/* how far one of the many is out of your slice (along the direction you can't see): you see it while this is under
   its radius */
export const offSlice = (g, e) => dot(add(enemyPos(e), to4(g.bike.pos, 1.0), -1), g.frame.N);

/* loose an arrow at one of the many (led by its walk), or at a point. False if the bow isn't drawn yet or the point is
   out of range */
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

/* one step. g.stick = [across, unseen], each −1..1: the lean you ask for along c and along d */
export function step(g, dt) {
  if (g.state !== "playing") return;
  g.t += dt; g.cool = Math.max(0, g.cool - dt);
  // the bicycle: your stick; and near the basin's rim, turned back toward the middle whatever you ask
  const bike = g.bike, sx = Math.max(-1, Math.min(1, g.stick[0])), sy = Math.max(-1, Math.min(1, g.stick[1]));
  let want = add(sc(bike.c, sx * LEAN), bike.d, sy * LEAN);
  { const { a, b, c, edge } = ARENA, p = bike.pos, e = Math.hypot(p[0] / a, p[1] / b, p[2] / c); g.edge = e;
    if (e > edge) { const mid = [0, 0, 0], back = followLean(bike, mid), k = Math.min(1, (e - edge) / 0.05), l = Math.hypot(...back) || 1; want = add(sc(want, 1 - k), back, (k * Math.min(l, 0.7)) / l); } }
  bike.step(dt, want, null, true);
  // (and the rim itself: nothing rides past it)
  { const { a, b, c } = ARENA, p = bike.pos, e = Math.hypot(p[0] / a, p[1] / b, p[2] / c); if (e > 0.93) bike.pos = p.map((x) => (x * 0.93) / e); }
  pose(g);
  const seen = Math.abs(g.w) < SEE; g.seen = seen;
  // the many: those in the open walk a little, and shoot when they can see you
  for (const e of g.enemies) { if (!e.alive || e.kind !== "open") continue;
    const out = (e.x / ARENA.a) ** 2 + (e.z / ARENA.b) ** 2 > 0.45;
    e.turn -= dt; if (e.turn <= 0 || out) { const an = g.R() * 6.283; e.vx = out ? -0.6 * Math.sign(e.x) : 0.8 * Math.cos(an); e.vz = out ? -0.6 * Math.sign(e.z) : 0.8 * Math.sin(an); e.turn = 2 + g.R() * 3; }
    e.x += e.vx * dt; e.z += e.vz * dt; e.cool -= dt;
    if (seen && e.cool <= 0) { const from = [e.x, 1.4, e.z, 0], d = Math.hypot(g.rider[0] - e.x, g.rider[2] - e.z); if (d < RANGE_THEIRS) {
      // they aim where you'll be, in their own world: your (x, y, z), w = 0, with an archer's error
      let a = null, tof = d / V_THEIRS; for (let k = 0; k < 3; k++) { const q = add(g.rider, g.vel, tof); q[3] = 0; q[0] += (g.R() - 0.5) * 0.9; q[2] += (g.R() - 0.5) * 0.9; a = arc(from, q, V_THEIRS); if (!a) break; tof = a.tof; }
      if (a) { a.vel[3] = 0; g.arrows.push({ p: from, v: a.vel, mine: false, age: 0 }); e.cool = 1.3 + g.R() * 0.9; } } }
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
/* a bot, for the tests and the demo button. It rides at the nearest of the many, aiming for a point 5 m ana of it (so
   it comes at their world from outside), circles when it gets close, and looses when it has it in its slice and the
   shot is clear */
export function bot(g) {
  if (g.state !== "playing") return; let best = -1, bd = Infinity; const p = g.bike.pos;
  g.enemies.forEach((e, i) => { if (!e.alive) return; const d = Math.hypot(e.x - p[0], e.z - p[1], p[2]); if (d < bd) { bd = d; best = i; } });
  if (best < 0) return; const e = g.enemies[best], aim = [e.x, e.z, 0], far = Math.hypot(e.x - p[0], e.z - p[1]);
  // far off, head for a point beside it in w; near, straight at it, which turns the slice onto it
  const want = followLean(g.bike, far > 25 ? [e.x, e.z, 5 * (p[2] >= 0 ? 1 : -1)] : aim);
  g.stick = [Math.max(-1, Math.min(1, dot(want, g.bike.c) / LEAN)), Math.max(-1, Math.min(1, dot(want, g.bike.d) / LEAN))];
  if (g.cool <= 0) for (let i = 0; i < g.enemies.length; i++) { const q = g.enemies[i]; if (q.alive && Math.abs(offSlice(g, q)) < BODY && preview(g, i) === "ok") { shoot(g, i); break; } }
}
