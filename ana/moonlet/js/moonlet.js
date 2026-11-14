// MOONLET: a bicycle on the OUTSIDE of a small 3-sphere: a 4-ball of rock, 100 m in radius, whose surface is a whole
// closed three-dimensional world, with hills. No spin: what holds you down is the rock's own gravity, four's pinned
// law (potential −GM/r, pull GM/r², orbits close as ours do), weak: 0.5 m/s², a twentieth of Earth's. No DOM.
//
// The bike is a point mass with a body frame, and every step sums real forces, ground or air:
//   gravity      m·(−GM x/r³), always;
//   thrust       a cold-gas rocket along the nose, T newtons, burning T/vₑ kg/s of a finite tank, so the mass drops
//                and the Δv is Tsiolkovsky's vₑ·ln(m₀/m₁);
//   the ground   the normal force N SOLVED from the contact: whatever keeps you on the surface given its curvature
//                along your velocity (N/m = −(gravity + thrust)·n − κv²). When that comes out negative, the ground
//                can't hold you and you fly: over a crest, past the orbital speed, or under thrust. No rule says when;
//   the tyres    pedals (a rider's power), brakes, and the sideways force that makes the bike go where it points, all
//                inside the friction circle |f| ≤ μN. Ask more and the tyres slide.
// In the air nothing turns the bike but its reaction wheels, at the rates you command. Two assists, both labelled:
// SAS (the wheels hold your wheels toward the ground, never the nose) and the steering limiter (holds a turn to what
// the tyres can grip, as traction control does). Turn them off and it's all yours.
//
// The surface has room for knots: the painted roads are the Hopf link and a trefoil. A slalom of gates runs along
// ring 1: on a three-dimensional ground a gate is a ring of posts round the course, and you pass through its disk.
import { dot, add, scale, norm, unit, walk, orthonormalTo } from '../../habitat/js/habitat.js';
export { dot, add, scale, norm, unit, orthonormalTo };

export const WORLD = { R: 100, g: 0.5 };   // m, m/s² at the datum radius R
export const BIKE = {
  dry: 100,          // kg: bike, rider, empty tank
  tank: 2,           // kg of nitrogen at full
  thrust: 180,       // N
  ve: 716,           // m/s exhaust speed (cold nitrogen, Isp 73 s)
  power: 300,        // W at the pedals
  pedalMax: 150,     // N: the most the legs push at a standstill
  mu: 1.0,           // tyre grip on regolith
  crr: 0.01,         // rolling resistance (times N)
  wheelbase: 1.1,    // m
  steerMax: 0.6,     // rad of handlebar
  turnSlow: 1.4,     // rad/s: walking the bike round at a crawl
  jump: 220,         // N·s: a rider's jump (2.2 m/s at full mass)
  wheelRate: 1.2,    // rad/s: the reaction wheels' slew rate
  crash: 3.0,        // m/s into the ground: more and you bounce
  bounce: 0.3,
  refuel: 0.4,       // kg/s at the pad
};
export const GM = WORLD.g * WORLD.R * WORLD.R;
export const vOrbit = (r = WORLD.R) => Math.sqrt(GM / r);
export const vEscape = (r = WORLD.R) => Math.sqrt((2 * GM) / r);
export const gravity = (x) => { const r = norm(x); return scale(x, -GM / (r * r * r)); };
/** On flat ground at the datum: your weight per kg riding at speed v (the pull less what the curve needs). */
export const weight = (v, R = WORLD.R) => GM / (R * R) - (v * v) / R;
export const mass = (k) => BIKE.dry + k.fuel;
/** Δv left in the tank: Tsiolkovsky. */
export const dvLeft = (k) => BIKE.ve * Math.log(mass(k) / BIKE.dry);

// ---------------------------------------------------------------- terrain --
// Hills: h(û) = Σ A·exp(−θ²/s²), θ the angle from each hill's centre (as 2·asin(|û − c|/2): exact near 0). The
// surface is r = R + h(û). Three gentle kickers on the slalom course, and bigger hills elsewhere.
const ring1 = (t) => [Math.cos(t), Math.sin(t), 0, 0];
export const COURSE = { t0: 0.45, dt: 0.36, n: 10, offset: 4, r: 2.6, post: 4 };
export const HILLS = [
  ...[1, 4, 7].map((i) => ({ c: ring1(COURSE.t0 + (i + 0.5) * COURSE.dt), A: 2.2, s: 12 / WORLD.R })),
  { c: unit([0.3, -0.6, 0.6, 0.4]), A: 9, s: 28 / WORLD.R },
  { c: unit([-0.7, 0.1, 0.4, -0.55]), A: 7, s: 22 / WORLD.R },
  { c: unit([-0.2, -0.75, -0.5, 0.35]), A: 11, s: 32 / WORLD.R },
  { c: unit([0.1, 0.3, -0.8, -0.5]), A: 6, s: 18 / WORLD.R },
  { c: unit([-0.8, -0.45, -0.1, 0.35]), A: 8, s: 26 / WORLD.R },
];
const ang = (u, c) => 2 * Math.asin(Math.min(1, norm(add(u, c, -1)) / 2));
export function height(u) {
  let h = 0;
  for (const H of HILLS) { const th = ang(u, H.c); h += H.A * Math.exp(-(th * th) / (H.s * H.s)); }
  return h;
}
/** The gradient of h on the unit sphere (tangent, metres per radian). */
export function gradH(u) {
  let g = [0, 0, 0, 0];
  for (const H of HILLS) {
    const th = ang(u, H.c), t = add(H.c, u, -dot(H.c, u)), sn = Math.sin(th);
    const f = th < 1e-6 ? 1 : th / sn;
    g = add(g, t, ((2 * H.A) / (H.s * H.s)) * Math.exp(-(th * th) / (H.s * H.s)) * f);
  }
  return g;
}
export const surfaceR = (u) => WORLD.R + height(u);
export const onSurface = (x) => { const u = unit(x); return scale(u, surfaceR(u)); };
/** The outward normal of the surface over x. */
export function normalAt(x) {
  const u = unit(x);
  return unit(add(u, gradH(u), -1 / surfaceR(u)));
}
/** The surface's curvature along the unit tangent d at x (1/R on flat ground; more over a crest, less in a dip). */
export function curvature(x, d, e = 0.25) {
  const p0 = onSurface(x), n0 = normalAt(p0), p1 = onSurface(add(p0, d, e)), n1 = normalAt(p1);
  return dot(add(n1, n0, -1), d) / norm(add(p1, p0, -1));
}

// ---------------------------------------------------------------- the bike --
export function makeBike(at = [1, 0, 0, 0], facing = [0, 1, 0, 0]) {
  const x = onSurface(unit(at)), n = normalAt(x);
  const [F, Rt, N] = orthonormalTo(n, [facing, [0, 0, 1, 0], [0, 0, 0, 1]]);
  return { x, v: [0, 0, 0, 0], F, Rt, N, U: n, ground: true, fuel: BIKE.tank, burning: false, lean: [0, 0, 0, 0],
    normal: 0, grip: 0, tyre: [0, 0, 0, 0], skid: false, slip: 0, crashes: 0, holdPitch: false, forces: null };
}
const rotate = (a, b, th) => { const c = Math.cos(th), s = Math.sin(th); return [add(scale(a, c), b, s), add(scale(b, c), a, -s)]; };
/** Rotate the whole frame in the plane of a (one of its vectors) and the unit vector b (in the frame's span). */
function turnFrame(k, a, b, th) {
  if (th === 0) return;
  const c = Math.cos(th), s = Math.sin(th);
  const rot = (v) => { const pa = dot(v, a), pb = dot(v, b); return add(add(v, a, pa * (c - 1) - pb * s), b, pa * s + pb * (c - 1)); };
  k.F = rot(k.F); k.U = rot(k.U); k.Rt = rot(k.Rt); k.N = rot(k.N);
}
/** Turn the heading toward the across-direction s (a combination of Rt and N) by th. */
function yaw(k, s, th) { const m = norm(s); if (m > 1e-9 && th) turnFrame(k, k.F, scale(s, 1 / m), th); }
function gsAgainst(vs, against) {
  const out = [];
  for (const v0 of vs) {
    let v = v0;
    for (const u of [...against, ...out]) v = add(v, u, -dot(v, u));
    if (norm(v) < 1e-6) for (const ax of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) { v = ax; for (const u of [...against, ...out]) v = add(v, u, -dot(v, u)); if (norm(v) > 0.3) break; }
    out.push(unit(v));
  }
  return out;
}
/** Square the frame up on the ground: U the surface normal, F along the ground, the across pair after. */
function seat(k, n) { k.U = n; [k.F, k.Rt, k.N] = gsAgainst([k.F, k.Rt, k.N], [n]); }
function squareUp(k) { const F = unit(k.F); const [U, Rt, N] = gsAgainst([k.U, k.Rt, k.N], [F]); k.F = F; k.U = U; k.Rt = Rt; k.N = N; }

/**
 * One step. input: { throttle −1…1 (ground: pedal / brake; air: pitch the nose down / up), steer [right, ana] (ground:
 * the handlebars; air: the reaction wheels yaw the nose), jump (pressed this step), boost (the rocket), sas (default
 * true), limiter (default true), assist: 'circularize' | null }.
 */
export function step(k, input, dt) {
  const P = BIKE, m = mass(k);
  const st = input.steer || [0, 0], s = add(scale(k.Rt, st[0]), k.N, st[1]), sm = Math.min(1, norm(s));
  const g = gravity(k.x);
  let thrust = [0, 0, 0, 0];
  let burning = !!input.boost && k.fuel > 0;
  if (!k.ground && input.assist === 'circularize') burning = circularize(k, dt) && k.fuel > 0;
  if (burning) { thrust = scale(k.F, P.thrust / m); k.fuel = Math.max(0, k.fuel - (P.thrust / P.ve) * dt); }
  k.burning = burning;
  const forces = { gravity: scale(g, m), thrust: scale(thrust, m), normal: [0, 0, 0, 0], tyre: [0, 0, 0, 0] };
  if (k.ground) {
    const n = normalAt(k.x);
    const ext = add(g, thrust);
    let v = add(k.v, n, -dot(k.v, n));
    const sp = norm(v), kap = sp > 1e-6 ? curvature(k.x, scale(v, 1 / sp)) : 1 / surfaceR(unit(k.x));
    const Nk = -dot(ext, n) - kap * sp * sp;            // the normal force per kg the ground must give
    if (input.jump) {                                    // legs: an impulse off the ground
      k.v = add(v, n, P.jump / m); k.ground = false; k.holdPitch = true; k.x = add(k.x, n, 0.01);
      k.forces = forces; return;
    }
    if (Nk <= 0) { k.ground = false; k.holdPitch = true; return airStep(k, input, dt, g, thrust, forces); }
    // handlebars: the bicycle's yaw rate v·tan(δ)/L, held (with the limiter) to what the grip can turn
    const vf = dot(v, k.F), grip = P.mu * Nk;
    let rate = 0;
    if (sm > 1e-6) {
      rate = Math.abs(vf) < 0.3 ? P.turnSlow * sm : (Math.abs(vf) * Math.tan(P.steerMax * sm)) / P.wheelbase;
      if (input.limiter !== false && Math.abs(vf) >= 0.3) rate = Math.min(rate, (0.95 * grip) / Math.abs(vf));
    }
    yaw(k, s, rate * dt * Math.sign(vf || 1));
    // the tyres: along (pedals, brakes, rolling resistance) and across (whatever kills the sideways slip), in the circle
    const th = input.throttle || 0, vf2 = dot(v, k.F);
    let along;
    if (th > 0) along = th * Math.min(P.power / (m * Math.max(Math.abs(vf2), 0.5)), P.pedalMax / m);
    else if (th < 0) along = -Math.sign(vf2) * Math.min(-th * grip, Math.abs(vf2) / dt);
    else along = -Math.sign(vf2) * Math.min(P.crr * Nk, Math.abs(vf2) / dt);
    const slipV = add(v, k.F, -dot(v, k.F));
    let tyre = add(scale(k.F, along), slipV, -1 / dt);
    const tm = norm(tyre);
    k.skid = tm > grip * 1.0001;
    if (k.skid) tyre = scale(tyre, grip / tm);
    k.slip = norm(slipV);
    // integrate: everything the bike feels, then back onto the surface (the constraint the normal force kept)
    const a = add(add(ext, tyre), n, Nk);
    v = add(v, a, dt);
    const x = onSurface(add(k.x, v, dt)), n2 = normalAt(x);
    k.x = x; k.v = add(v, n2, -dot(v, n2));
    seat(k, n2);
    k.normal = Nk * m; k.grip = grip * m; k.tyre = scale(tyre, m);
    const lat = add(tyre, k.F, -dot(tyre, k.F));
    k.lean = scale(lat, 1 / Math.max(Nk, 1e-6));        // tan(lean) toward the turn: the bike balances its tyre force
    forces.normal = scale(n, Nk * m); forces.tyre = k.tyre;
    k.forces = forces;
    return;
  }
  airStep(k, input, dt, g, thrust, forces);
}
function airStep(k, input, dt, g, thrust, forces) {
  const P = BIKE;
  k.v = add(k.v, add(g, thrust), dt);                 // semi-implicit Euler: symplectic, orbits hold
  k.x = add(k.x, k.v, dt);
  k.normal = 0; k.grip = 0; k.tyre = [0, 0, 0, 0]; k.skid = false; k.lean = [0, 0, 0, 0];
  if (input.assist !== 'circularize') {
    const st = input.steer || [0, 0], s = add(scale(k.Rt, st[0]), k.N, st[1]), sm = Math.min(1, norm(s));
    yaw(k, s, P.wheelRate * sm * dt);
    // pitch: the throttle, once you've let go of it since leaving the ground (holding it to pedal shouldn't pitch you)
    const th = input.throttle || 0;
    if (!th) k.holdPitch = false;
    if (th && !k.holdPitch) turnFrame(k, k.F, k.U, -th * P.wheelRate * dt);
  }
  if (input.sas !== false) sas(k, dt);
  squareUp(k);
  k.forces = forces;
  const u = unit(k.x);
  if (norm(k.x) <= surfaceR(u) && dot(k.v, normalAt(k.x)) < 0) touchdown(k);
}
/** SAS: the reaction wheels turn the bike about its nose so its wheels face the ground (U toward the outward normal's
 *  part across the nose), at their slew rate. It never moves the nose. */
function sas(k, dt) {
  const up = unit(k.x), want = add(up, k.F, -dot(up, k.F));
  if (norm(want) < 1e-3) return;
  const w = unit(want), a = Math.acos(Math.max(-1, Math.min(1, dot(w, k.U))));
  if (a < 1e-6) return;
  const d = add(w, k.U, -dot(w, k.U));
  if (norm(d) < 1e-9) return;
  turnFrame(k, k.U, unit(d), Math.min(a, BIKE.wheelRate * dt));
}
/** Hitting the ground: wheels down and gently, you ride on (the suspension takes the speed into the ground);
 *  otherwise a crash: you bounce at 30% and lose half your speed along the ground. */
export function touchdown(k) {
  k.x = onSurface(k.x);
  const n = normalAt(k.x), vn = -dot(k.v, n), upright = dot(k.U, n);
  if (vn > BIKE.crash || upright < 0.6) {
    k.crashes++;
    const vt = add(k.v, n, vn);
    k.v = add(scale(vt, 0.5), n, BIKE.bounce * vn);
    k.U = n; squareUp(k);
    if (BIKE.bounce * vn > 0.4) return 'crash';
    // too slow to bounce: put it on its wheels
  }
  const vt = add(k.v, n, -dot(k.v, n));
  let F = add(k.F, n, -dot(k.F, n));
  if (norm(F) < 0.2) F = norm(vt) > 1e-3 ? vt : gsAgainst([k.Rt], [n])[0];
  k.F = F; seat(k, n);
  k.v = vt; k.ground = true;
  return upright < 0.6 || vn > BIKE.crash ? 'crash' : 'land';
}
/** Refuel at the pad (the start): slowly, standing still. */
export function refuel(k, dt) {
  const near = WORLD.R * Math.acos(Math.max(-1, Math.min(1, dot(unit(k.x), START.at)))) < 5;
  if (k.ground && near && norm(k.v) < 0.5 && k.fuel < BIKE.tank) { k.fuel = Math.min(BIKE.tank, k.fuel + BIKE.refuel * dt); return true; }
  return false;
}

/** The circularizing autopilot: the wheels turn the nose toward the Δv that would make the orbit circular here, at
 *  their slew rate, and it burns when lined up. Returns whether to burn. */
export function circularize(k, dt) {
  const xh = unit(k.x), r = norm(k.x);
  let h = add(k.v, xh, -dot(k.v, xh));
  if (norm(h) < 0.05) h = add(k.F, xh, -dot(k.F, xh));
  if (norm(h) < 1e-6) h = k.Rt;
  const want = add(scale(unit(h), vOrbit(r)), k.v, -1), mm = norm(want);
  if (mm < 0.03) return false;
  const d = scale(want, 1 / mm), a = Math.acos(Math.max(-1, Math.min(1, dot(d, k.F))));
  if (a > 1e-6) {
    let sd = add(d, k.F, -dot(d, k.F));
    if (norm(sd) < 1e-9) sd = k.U;
    turnFrame(k, k.F, unit(sd), Math.min(a, 2 * BIKE.wheelRate * dt));
  }
  return a < 0.2;
}

// ---------------------------------------------------------------- orbits --
/** Kepler's elements of a flight (x, v): energy, periapsis, apoapsis (Infinity when escaping), eccentricity, period. */
export function elements(x, v) {
  const r = norm(x), v2 = dot(v, v), E = v2 / 2 - GM / r, rv = dot(x, v);
  const h = Math.sqrt(Math.max(0, r * r * v2 - rv * rv));
  const e = Math.sqrt(Math.max(0, 1 + (2 * E * h * h) / (GM * GM)));
  const p = (h * h) / GM;
  const a = E < 0 ? -GM / (2 * E) : Infinity;
  const peri = p / (1 + e), apo = E < 0 ? 2 * a - peri : Infinity;   // (2a − peri, not p/(1 − e): straight up, e = 1)
  return { E, h, e, peri, apo, a, period: E < 0 ? 2 * Math.PI * Math.sqrt((a * a * a) / GM) : Infinity, escaping: E >= 0 };
}
/** Where a flight goes with no more rocket: RK4 points every dt until it meets the ground (hills included). */
export function predict(x0, v0, { dt = 0.1, T = 600, max = 400 } = {}) {
  let x = x0.slice(), v = v0.slice(), t = 0;
  const pts = [x.slice()];
  const every = Math.max(1, Math.ceil(T / dt / max));
  const below = (p) => norm(p) <= surfaceR(unit(p));
  let n = 0;
  while (t < T) {
    const f = (xx, vv) => [vv, gravity(xx)];
    const [k1x, k1v] = f(x, v), [k2x, k2v] = f(add(x, k1x, dt / 2), add(v, k1v, dt / 2));
    const [k3x, k3v] = f(add(x, k2x, dt / 2), add(v, k2v, dt / 2)), [k4x, k4v] = f(add(x, k3x, dt), add(v, k3v, dt));
    const dx = [0, 1, 2, 3].map((i) => (dt / 6) * (k1x[i] + 2 * k2x[i] + 2 * k3x[i] + k4x[i]));
    const dv = [0, 1, 2, 3].map((i) => (dt / 6) * (k1v[i] + 2 * k2v[i] + 2 * k3v[i] + k4v[i]));
    const x2 = add(x, dx), v2 = add(v, dv);
    t += dt;
    if (below(x2) && t > dt * 1.5) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (!below(add(x, add(x2, x, -1), mid))) lo = mid; else hi = mid; }
      const hit = add(x, add(x2, x, -1), lo);
      pts.push(hit);
      return { pts, impact: { x: onSurface(hit), t: t - dt * (1 - lo), v: v2 }, t };
    }
    x = x2; v = v2;
    if (++n % every === 0) pts.push(x.slice());
  }
  return { pts, impact: null, t };
}

// ---------------------------------------------------------------- the slalom --
/** Gates along ring 1, every 36 m, each centre 4 m off the course in turn right, ana, left, kata: you have to steer in
 *  all four directions across. A gate is a ring of posts of radius r round its centre, in the plane across the course
 *  (on a 3D ground that's a circle), posts `post` m tall. Pass through its disk. */
export const GATES = Array.from({ length: COURSE.n }, (_, i) => {
  const t = COURSE.t0 + i * COURSE.dt, c0 = ring1(t), Fg = [-Math.sin(t), Math.cos(t), 0, 0];
  const phi = (i * Math.PI) / 2, dir = [0, 0, Math.cos(phi), Math.sin(phi)];
  const w = walk(c0, dir, COURSE.offset, WORLD.R, [Fg, [0, 0, 1, 0], [0, 0, 0, 1]]);
  const c = onSurface(w.xhat), n = normalAt(c);
  const [F, A, B] = gsAgainst(w.vectors, [n]);
  return { i, c, n, F, A, B, r: COURSE.r, side: ['right', 'ana', 'left', 'kata'][i % 4] };
});
/** Did going from x0 to x1 cross gate G's plane, and through its disk (and under its posts' tops)? */
export function gateCross(G, x0, x1) {
  const a0 = dot(add(x0, G.c, -1), G.F), a1 = dot(add(x1, G.c, -1), G.F);
  if (!(a0 < 0 && a1 >= 0)) return null;
  const f = a0 / (a0 - a1), p = add(x0, add(x1, x0, -1), f), q = add(p, G.c, -1);
  const across = Math.hypot(dot(q, G.A), dot(q, G.B)), up = dot(q, G.n);
  return across < G.r && up < COURSE.post ? 'pass' : 'miss';
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
/** The nearest point of each road to u (unit), the shader's roadPt twinned. For the trefoil: step from (α, β) along the
 *  knot's normal on the flat torus, (3, −2)/13 times the offset, which lands exactly on a line 3α − 2β ≡ 0. */
export function roadPt(which, u) {
  if (which === 'ring1') { const m = Math.hypot(u[0], u[1]) || 1; return [u[0] / m, u[1] / m, 0, 0]; }
  if (which === 'ring2') { const m = Math.hypot(u[2], u[3]) || 1; return [0, 0, u[2] / m, u[3] / m]; }
  const al = Math.atan2(u[1], u[0]), be = Math.atan2(u[3], u[2]), c = wrap(3 * al - 2 * be);
  const a2 = al - (3 * c) / 13, b2 = be + (2 * c) / 13;
  return [Math.cos(a2), Math.sin(a2), Math.cos(b2), Math.sin(b2)].map((v) => v * Math.SQRT1_2);
}
/** The road as a tube in the three-dimensional surface, half this wide (m). */
export const ROAD_HALF = 2.5;
/** Which side of a road's centre the point u lies, against a slice whose hidden direction is w: +1 ana, −1 kata, 0 in
 *  it (the kerb colours: teal ana, pink kata, white). Seeing teal kerbs means you're ana of the road: lean kata. */
export function side(which, u, w) {
  const off = add(u, roadPt(which, u), -1), m = norm(off);
  return m < 1e-12 ? 0 : dot(off, w) / m;
}
/** Beacons to collect: eight points spread over the rock, two on each road and two away from all of them. */
export const BEACONS = [
  ROADS.ring1(0.6), ROADS.ring1(3.6), ROADS.ring2(1.9), ROADS.ring2(5.0),
  ROADS.trefoil(0.9), ROADS.trefoil(3.3),
  unit([0.5, -0.5, 0.5, 0.5]), unit([-0.6, 0.2, -0.3, 0.7]),
].map((p, i) => ({ name: 'ABCDEFGH'[i], p: unit(p) }));
export const START = { at: [1, 0, 0, 0], facing: [0, 1, 0, 0] };   // on ring 1, facing along it: the pad
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
