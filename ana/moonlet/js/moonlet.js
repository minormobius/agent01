// MOONLET: a bicycle on the OUTSIDE of a small 3-sphere: a 4-ball of rock, R across, whose surface is a whole closed
// three-dimensional world. No spin: what holds you down is the rock's own gravity, four's pinned law (potential −GM/r,
// so the pull is GM/r², orbits close as ours do), weak: g ≈ 1/20 of Earth's. No DOM; main.js draws it, the selftest
// holds every claim the page makes.
//
// What microgravity does to a bicycle:
//  - your weight is g − v²/R: ride faster and you get lighter, and at the orbital speed √(gR) you weigh nothing;
//  - the tyres can push (speed up, slow down, turn) with at most μ times that weight. So pedalling can't get you to
//    orbit (the grip runs out first), turns at speed are wide, and a jump flies for seconds;
//  - the rocket isn't grip-limited: it can take you up, round, and away (escape speed √2·√(gR)).
//
// The surface is a 3-sphere, so it has room for knots: the painted roads are the Hopf link (two great circles in
// completely orthogonal planes, linked) and a trefoil (the (2,3) torus knot on the Clifford torus between them). In the
// 4D space around the rock nothing is knotted (a circle can always be untied in four dimensions); on its surface, which
// is three-dimensional, they're as linked as rope.
import { dot, add, scale, norm, unit, walk, orthonormalTo } from '../../habitat/js/habitat.js';
export { dot, add, scale, norm, unit };

export const WORLD = { R: 100, g: 0.5 };   // m, m/s² (about 1/20 g)
export const BIKE = {
  mu: 1.0,          // tyre grip on regolith: the push the tyres can give, over your weight
  pedal: 1.2,       // the most your legs give (m/s²), less as you near vPedal
  vPedal: 6.5,      // flat out on the pedals (m/s)
  thrust: 1.6,      // the rocket (m/s², about 3 local g)
  burn: 10,         // fuel per second of rocket (out of 100)
  regen: 5,         // fuel per second back while on the ground (solar)
  jump: 2.2,        // a jump's push (m/s): a 5 m hop, nine seconds in the air
  turnSlow: 1.4,    // turning at a crawl (rad/s): you can always walk the bike round
  airTurn: 0.9,     // turning the nose in flight (rad/s): gyros
  land: 3.0,        // land softer than this (m/s straight down) and you keep riding; harder and you bounce
  bounce: 0.3,
};
export const GM = WORLD.g * WORLD.R * WORLD.R;
export const vOrbit = (r = WORLD.R) => Math.sqrt(GM / r);
export const vEscape = (r = WORLD.R) => Math.sqrt((2 * GM) / r);
export const gravity = (x) => { const r = norm(x); return scale(x, -GM / (r * r * r)); };
/** Your weight per kg riding at speed v on the surface: the pull less what the curve needs. Zero or less: you fly. */
export const weight = (v, R = WORLD.R) => GM / (R * R) - (v * v) / R;

export function makeBike(at = [1, 0, 0, 0], facing = [0, 1, 0, 0]) {
  const xh = unit(at);
  const [F, Rt, N] = orthonormalTo(xh, [facing, [0, 0, 1, 0], [0, 0, 0, 1]]);
  return { x: scale(xh, WORLD.R), v: [0, 0, 0, 0], F, Rt, N, U: xh, ground: true, speed: 0, fuel: 100, burning: false, lean: [0, 0, 0, 0], skid: 0 };
}
const rotate = (a, b, th) => { const c = Math.cos(th), s = Math.sin(th); return [add(scale(a, c), b, s), add(scale(b, c), a, -s)]; };

/** Turn the heading toward the across-direction s (a combination of Rt and N) by angle th, carrying the frame. */
function yaw(k, s, th) {
  const m = norm(s);
  if (m < 1e-9 || th === 0) return;
  const sh = scale(s, 1 / m);
  // the plane of F and sh turns; the across-vector orthogonal to sh within (Rt, N) is untouched
  const [F2, S2] = rotate(k.F, sh, th);
  const a = dot(k.Rt, sh), b = dot(k.N, sh);       // sh = a Rt + b N
  const o = add(scale(k.Rt, -b), k.N, a);          // the other across-direction
  const Rt = add(scale(S2, a), o, -b), N = add(scale(S2, b), o, a);
  k.F = F2; k.Rt = Rt; k.N = N;
}

/**
 * One step of the bike. input: { throttle −1…1 (pedal / brake, on the ground), steer [right, ana] each −1…1 (on the
 * ground the lean; in the air the gyros turn the nose), jump (pressed this step), jumpHeld (with the rocket: burn 45°
 * up), boost, assist: 'circularize' | null }. In the air the nose holds itself level (along the ground below), so the
 * rocket pushes you along it, or 45° up with jump held: a rider's controls, not a pilot's.
 */
export function step(k, input, dt) {
  const P = BIKE, R = WORLD.R;
  const st = input.steer || [0, 0], s = add(scale(k.Rt, st[0]), k.N, st[1]), sm = Math.min(1, norm(s));
  let burning = !!input.boost && k.fuel > 0;
  if (k.ground) {
    const xh = unit(k.x), w = weight(k.speed);
    const grip = Math.max(0, P.mu * w);
    // along: legs (up to the grip, fading toward vPedal) or brakes (up to the grip)
    let along = 0;
    const th = input.throttle || 0;
    if (th > 0) along = Math.min(th * P.pedal * Math.max(0, 1 - Math.abs(k.speed) / P.vPedal), grip);
    else if (th < 0) along = -Math.sign(k.speed || 1) * Math.min(-th * grip, Math.abs(k.speed) / dt);
    // across: whatever grip is left, to turn
    const side = Math.sqrt(Math.max(0, grip * grip - along * along));
    let rate = 0;
    if (sm > 1e-6) rate = Math.min(P.turnSlow, (side * sm) / Math.max(Math.abs(k.speed), 0.3));
    k.skid = sm > 1e-6 && Math.abs(k.speed) > 0.5 && (side * sm) / Math.abs(k.speed) < 0.5 * P.turnSlow * sm ? 1 : 0;   // asking for more turn than the grip gives
    yaw(k, s, rate * dt * Math.sign(k.speed || 1));
    k.lean = sm > 1e-6 ? scale(unit(s), Math.atan2(Math.abs(k.speed) * rate, Math.max(w, 1e-6))) : [0, 0, 0, 0];
    // the rocket: along the heading, or 45° up with jump held; not limited by grip
    let up = 0;
    if (burning) {
      const tilt = input.jumpHeld ? Math.SQRT1_2 : 0, fw = input.jumpHeld ? Math.SQRT1_2 : 1;
      along += P.thrust * fw; up = P.thrust * tilt;
    }
    k.speed += along * dt;
    const pos = walk(xh, k.F, k.speed * dt, R, [k.F, k.Rt, k.N]);
    k.x = scale(pos.xhat, R); [k.F, k.Rt, k.N] = pos.vectors; k.U = pos.xhat;
    k.v = scale(k.F, k.speed);
    // off the ground: weightless at orbital speed, a jump, or a rocket pushing up harder than you weigh
    const lift = (input.jump ? P.jump : 0) + (up > weight(k.speed) ? (up - Math.max(0, weight(k.speed))) * dt : 0);
    if (weight(k.speed) <= 0 || lift > 0) {
      k.ground = false; k.lean = [0, 0, 0, 0];
      k.v = add(k.v, k.U, Math.max(lift, 0.01));
      k.x = add(k.x, k.U, 0.01);
    }
  } else {
    // in the air: gravity and the rocket; the stick yaws the nose, the throttle pitches it (forward: nose down)
    let a = gravity(k.x);
    if (input.assist === 'circularize') burning = circularize(k, dt) && k.fuel > 0;
    if (burning) a = add(a, input.jumpHeld && input.assist !== 'circularize' ? unit(add(k.F, k.U)) : k.F, P.thrust);
    k.v = add(k.v, a, dt);                      // semi-implicit Euler: keeps orbits (symplectic)
    k.x = add(k.x, k.v, dt);
    if (input.assist !== 'circularize') {
      yaw(k, s, P.airTurn * sm * dt);
      holdLevel(k, dt);
    }
    level(k, dt);
    k.lean = [0, 0, 0, 0];
    if (norm(k.x) <= R && dot(k.v, k.x) < 0) touchdown(k);
  }
  k.burning = burning;
  if (burning) k.fuel = Math.max(0, k.fuel - P.burn * dt);
  else if (k.ground) k.fuel = Math.min(100, k.fuel + P.regen * dt);
}
/** The nose eases back to level (its part along the ground below), turning in the plane of F and up. */
function holdLevel(k, dt) {
  const xh = unit(k.x), up = dot(k.F, xh);
  if (Math.abs(up) < 1e-6) return;
  const flat = add(k.F, xh, -up);
  if (norm(flat) < 1e-6) return;
  const ang = Math.asin(Math.max(-1, Math.min(1, up))), th = Math.sign(ang) * Math.min(Math.abs(ang), 1.2 * dt);
  // turn F toward flat (down by th if pitched up): in the plane of F and the across-part of x̂
  const side = unit(add(xh, k.F, -up));       // x̂'s part orthogonal to F
  const c = Math.cos(th), sn = Math.sin(th);
  const F2 = add(scale(k.F, c), side, -sn), S2 = add(scale(side, c), k.F, sn);
  // carry U (and the across pair) by the same rotation
  const rot = (v) => { const a = dot(v, k.F), b = dot(v, side); return add(add(v, k.F, a * (c - 1) + b * sn), side, -a * sn + b * (c - 1)); };
  k.U = rot(k.U); k.Rt = rot(k.Rt); k.N = rot(k.N); k.F = F2; void S2;
}
/** In flight the bike's up eases toward "away from the rock" (as a rider would hold it), turning about the nose. */
function level(k, dt) {
  const xh = unit(k.x);
  const want = add(xh, k.F, -dot(xh, k.F));
  if (norm(want) > 1e-3) {
    const wn = unit(want), ang = Math.acos(Math.max(-1, Math.min(1, dot(wn, k.U))));
    if (ang > 1e-6) {
      const d = add(wn, k.U, -dot(wn, k.U));
      if (norm(d) > 1e-9) k.U = rotate(k.U, unit(d), Math.min(ang, 1.2 * dt))[0];
    }
  }
  // keep {F, U, Rt, N} orthonormal (F first, then U, then the across pair in their order)
  const F = unit(k.F);
  let U = add(k.U, F, -dot(k.U, F)); U = norm(U) > 1e-6 ? unit(U) : unit(add(xh, F, -dot(xh, F)));
  const across = gs([k.Rt, k.N], [F, U]);
  k.F = F; k.U = U; [k.Rt, k.N] = across;
}
function gs(vs, against) {
  const out = [];
  for (const v0 of vs) {
    let v = v0;
    for (const u of [...against, ...out]) v = add(v, u, -dot(v, u));
    if (norm(v) < 1e-6) for (const ax of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) { v = ax; for (const u of [...against, ...out]) v = add(v, u, -dot(v, u)); if (norm(v) > 0.3) break; }
    out.push(unit(v));
  }
  return out;
}
/** Coming down: soft, and you ride on with what of your speed lies along your heading; hard, and you bounce. */
export function touchdown(k) {
  const xh = unit(k.x), vr = -dot(k.v, xh);
  k.x = scale(xh, WORLD.R);
  if (vr > BIKE.land) { k.v = add(k.v, xh, (1 + BIKE.bounce) * vr); k.bounced = (k.bounced || 0) + 1; return 'bounce'; }
  const vt = add(k.v, xh, -dot(k.v, xh));
  let F = add(k.F, xh, -dot(k.F, xh));
  if (norm(F) < 0.2) F = norm(vt) > 1e-3 ? vt : orthonormalTo(xh, [k.Rt])[0];
  [k.F, k.Rt, k.N] = orthonormalTo(xh, [F, k.Rt, k.N]);
  k.U = xh; k.speed = dot(vt, k.F); k.v = scale(k.F, k.speed); k.ground = true;
  return 'land';
}

/** The circularizing autopilot: point the nose along the Δv that would make the orbit circular here, and burn when
 *  it's lined up. Returns whether to burn. */
export function circularize(k, dt) {
  const xh = unit(k.x), r = norm(k.x);
  let h = add(k.v, xh, -dot(k.v, xh));
  if (norm(h) < 0.05) h = add(k.F, xh, -dot(k.F, xh));
  if (norm(h) < 1e-6) h = k.Rt;
  const want = add(scale(unit(h), vOrbit(r)), k.v, -1), m = norm(want);
  if (m < 0.03) return false;
  const d = scale(want, 1 / m), ang = Math.acos(Math.max(-1, Math.min(1, dot(d, k.F))));
  if (ang > 1e-6) {
    let side = add(d, k.F, -dot(d, k.F));
    if (norm(side) < 1e-9) side = k.U;
    side = unit(side);
    const turn = Math.min(ang, 2.5 * BIKE.airTurn * dt);
    // rotate F toward d; carry whichever of U, Rt, N by the same rotation (a rotation in the plane F–side)
    const rot = (v) => { const a = dot(v, k.F), b = dot(v, side), c = Math.cos(turn), s = Math.sin(turn); return add(add(v, k.F, a * (c - 1) - b * s), side, a * s + b * (c - 1)); };
    k.F = rot(k.F); k.U = rot(k.U); k.Rt = rot(k.Rt); k.N = rot(k.N);
  }
  return ang < 0.2 && m > 0.03;
}

// ---------------------------------------------------------------- orbits --
/** Kepler's elements of a flight (x, v): energy, the orbit's plane (as its two vectors), periapsis, apoapsis (Infinity
 *  when escaping), eccentricity, period. */
export function elements(x, v) {
  const r = norm(x), v2 = dot(v, v), E = v2 / 2 - GM / r, rv = dot(x, v);
  const h = Math.sqrt(Math.max(0, r * r * v2 - rv * rv));
  const e = Math.sqrt(Math.max(0, 1 + (2 * E * h * h) / (GM * GM)));
  const p = (h * h) / GM;
  const a = E < 0 ? -GM / (2 * E) : Infinity;
  const peri = p / (1 + e), apo = E < 0 ? 2 * a - peri : Infinity;   // (2a − peri, not p/(1 − e): straight up, e = 1)
  return { E, h, e, peri, apo, a, period: E < 0 ? 2 * Math.PI * Math.sqrt((a * a * a) / GM) : Infinity, escaping: E >= 0 };
}
/** Where a flight goes with no more rocket: points every dt until it comes down (or T runs out). */
export function predict(x0, v0, { dt = 0.1, T = 600, max = 400 } = {}) {
  let x = x0.slice(), v = v0.slice(), t = 0;
  const pts = [x.slice()];
  const every = Math.max(1, Math.ceil(T / dt / max));
  let n = 0;
  while (t < T) {
    // RK4: the forecast should be better than the game's own stepping, not the same
    const f = (xx, vv) => [vv, gravity(xx)];
    const [k1x, k1v] = f(x, v), [k2x, k2v] = f(add(x, k1x, dt / 2), add(v, k1v, dt / 2));
    const [k3x, k3v] = f(add(x, k2x, dt / 2), add(v, k2v, dt / 2)), [k4x, k4v] = f(add(x, k3x, dt), add(v, k3v, dt));
    const dx = [0, 1, 2, 3].map((i) => (dt / 6) * (k1x[i] + 2 * k2x[i] + 2 * k3x[i] + k4x[i]));
    const dv = [0, 1, 2, 3].map((i) => (dt / 6) * (k1v[i] + 2 * k2v[i] + 2 * k3v[i] + k4v[i]));
    const x2 = add(x, dx), v2 = add(v, dv);
    t += dt;
    if (norm(x2) <= WORLD.R && dot(v2, x2) < 0) {
      // bisect the crossing
      let lo = 0, hi = 1;
      for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (norm(add(x, add(x2, x, -1), m)) > WORLD.R) lo = m; else hi = m; }
      const hit = add(x, add(x2, x, -1), lo);
      pts.push(hit);
      return { pts, impact: { x: scale(unit(hit), WORLD.R), t: t - dt * (1 - lo), v: v2 }, t };
    }
    x = x2; v = v2;
    if (++n % every === 0) pts.push(x.slice());
  }
  return { pts, impact: null, t };
}

// ---------------------------------------------------------------- the world --
/** The roads: the Hopf link (two great circles in completely orthogonal planes) and the trefoil (the (2,3) torus knot
 *  on the Clifford torus). Each as a function of t ∈ [0, 2π) on the unit 3-sphere. */
export const ROADS = {
  ring1: (t) => [Math.cos(t), Math.sin(t), 0, 0],
  ring2: (t) => [0, 0, Math.cos(t), Math.sin(t)],
  trefoil: (t) => [Math.cos(2 * t), Math.sin(2 * t), Math.cos(3 * t), Math.sin(3 * t)].map((c) => c * Math.SQRT1_2),
};
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
/** How far (as an angle on the unit 3-sphere) the point u is from each road: the shader's formula, twinned here. */
export function roadDist(u) {
  const r1 = Math.hypot(u[0], u[1]), r2 = Math.hypot(u[2], u[3]);
  const psi = Math.atan2(r2, r1);
  const al = Math.atan2(u[1], u[0]), be = Math.atan2(u[3], u[2]);
  // on the Clifford torus the metric is ½(dα² + dβ²); the knot is the line 3α − 2β ≡ 0, lines 2π apart in that measure
  const across = Math.abs(wrap(3 * al - 2 * be)) / Math.sqrt(13) * Math.SQRT1_2;
  return { ring1: psi, ring2: Math.PI / 2 - psi, trefoil: Math.hypot(psi - Math.PI / 4, across) };
}
/** Beacons to collect: eight points spread over the rock, two on each road and two away from all of them. */
export const BEACONS = [
  ROADS.ring1(0.6), ROADS.ring1(3.6), ROADS.ring2(1.9), ROADS.ring2(5.0),
  ROADS.trefoil(0.9), ROADS.trefoil(3.3),
  unit([0.5, -0.5, 0.5, 0.5]), unit([-0.6, 0.2, -0.3, 0.7]),
].map((p, i) => ({ name: 'ABCDEFGH'[i], p: unit(p) }));
export const START = { at: ROADS.ring1(0), facing: [0, 1, 0, 0] };   // on ring 1, facing along it
/** The two pebble moons: circular orbits of one radius in completely orthogonal planes (e₁e₂ and e₃e₄). They never
 *  meet, and on the 3-sphere of that radius their circles are linked once (a Hopf link). */
export const PEBBLE = { r: 1.8 * WORLD.R, size: 7 };
export function pebbles(t) {
  const w = vOrbit(PEBBLE.r) / PEBBLE.r, a = w * t, r = PEBBLE.r;
  return [[r * Math.cos(a), r * Math.sin(a), 0, 0], [0, 0, r * Math.cos(a + 1), r * Math.sin(a + 1)]];
}

// ---------------------------------------------------------------- topology --
/** The linking number of two closed curves on the 3-sphere: stereographic projection to R³ (from a point on neither),
 *  then Gauss's double integral. Integers, up to the quadrature's error. */
export function linking(c1, c2, n = 400, pole = unit([0.31, -0.47, 0.6, 0.57])) {
  const proj = (p) => {
    // rotate pole to (0,0,0,1) by a reflection, then project from it
    const u = unit(add(pole, [0, 0, 0, 1], -1)), q = add(p, u, -2 * dot(p, u));
    return [q[0] / (1 - q[3]), q[1] / (1 - q[3]), q[2] / (1 - q[3])];
  };
  const A = [], B = [];
  for (let i = 0; i < n; i++) { A.push(proj(c1((2 * Math.PI * i) / n))); B.push(proj(c2((2 * Math.PI * i) / n))); }
  let L = 0;
  for (let i = 0; i < n; i++) {
    const a = A[i], da = A[(i + 1) % n].map((v, j) => v - a[j]);
    for (let j = 0; j < n; j++) {
      const b = B[j], db = B[(j + 1) % n].map((v, k) => v - b[k]);
      const r = [a[0] + da[0] / 2 - b[0] - db[0] / 2, a[1] + da[1] / 2 - b[1] - db[1] / 2, a[2] + da[2] / 2 - b[2] - db[2] / 2];
      const rr = Math.hypot(...r);
      const cr = [da[1] * db[2] - da[2] * db[1], da[2] * db[0] - da[0] * db[2], da[0] * db[1] - da[1] * db[0]];
      L += (r[0] * cr[0] + r[1] * cr[1] + r[2] * cr[2]) / (rr * rr * rr);
    }
  }
  return L / (4 * Math.PI);
}
/** The map (habitat.js mapOf, re-exported for the page). */
export { mapOf } from '../../habitat/js/habitat.js';
