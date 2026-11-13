// HYPERBALL's physics, no DOM. The arena is the inside of a small hollow 3-sphere (radius R): its floor is a whole
// three-dimensional world with no edges, "down" is straight out from the centre everywhere, and the two goals stand at
// opposite poles. habitat.js is a byte-identical copy of ana's (ana.mino.mobi/habitat): the selftest checks the copy.
//
// Gravity, two ways:
//   arcade (the default): g straight down (outward) everywhere, nothing else. Flights arc as on a planet's surface.
//   spin: the honest version. The arena spins at equal rates in two planes (ω = √(g/R)); in the turning frame a free
//     body feels ω²x − 2ωJv: the same g on the floor, plus Coriolis, which curves every flight and boost.
// On the ground the bike drives along the floor; the spin only acts on things in the air.
import * as H from './habitat.js';

export const ARENA = {
  R: 40, g: 0.6 * 9.80665,
  ball: { r: 1.6, restitution: 0.62, drag: 0.03, roll: 0.16, maxSpeed: 30, lift: 0.35 },
  bike: { r: 1.0, height: 1.0, accel: 9, brake: 16, maxSpeed: 14, boostSpeed: 23, boostAcc: 18, boostDrain: 33, boostRegen: 9,
    leanMax: 0.95, turnMax: 2.6, airTurn: 2.4, jump: 6.5, hit: 2.2, aim: 0.6 },
  goal: { r: 10, h: 6 },
};
// your goal (cyan) and theirs (orange) at opposite poles; kickoff on the equator between them
export const OWN = [1, 0, 0, 0], ENEMY = [-1, 0, 0, 0], SPOT = [0, 0, 1, 0];

const { dot, add, scale, norm, unit, J } = H;
export const up = (x) => scale(unit(x), -1);                       // toward the centre
export const height = (x, R = ARENA.R) => R - norm(x);              // above the floor
export const along = (a, b, R = ARENA.R) => R * Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b)))));   // floor distance

/** The field a free body feels: arcade, g outward; spin, ω²x − 2ωJv. */
export function gravity(x, v, mode, A = ARENA) {
  if (mode === 'spin') { const w = Math.sqrt(A.g / A.R); return add(scale(x, w * w), J(v), -2 * w); }
  return scale(unit(x), A.g);
}

// ------------------------------------------------------------------ the ball --
export function makeBall(at = SPOT, h = 3, A = ARENA) { return { x: scale(unit(at), A.R - A.ball.r - h), v: [0, 0, 0, 0] }; }
/** One step: gravity, a little air drag, then the floor (|x| = R − r): bounce with restitution, and rolling friction
 *  while it's on the floor. */
export function stepBall(b, dt, mode, A = ARENA) {
  const B = A.ball;
  b.v = add(b.v, gravity(b.x, b.v, mode, A), dt);
  b.v = scale(b.v, 1 - B.drag * dt);
  b.x = add(b.x, b.v, dt);
  const r = norm(b.x), lim = A.R - B.r;
  if (r > lim) {
    const n = unit(b.x);
    b.x = scale(n, lim);
    const vn = dot(b.v, n);
    if (vn > 0) b.v = add(b.v, n, -(1 + B.restitution) * vn);
    if (Math.abs(dot(b.v, n)) < 1.0) { b.v = add(b.v, n, -dot(b.v, n)); b.v = scale(b.v, 1 - B.roll * dt); }   // rolling
  }
}

// ------------------------------------------------------------------ the bike --
/** A bike on the floor at x̂ facing F, its across-space spanned by Rt (right) and N (ana). */
export function makeBike(at, facing, A = ARENA) {
  const xh = unit(at), F = unit(add(facing, xh, -dot(facing, xh)));
  const [f, r, n] = H.orthonormalTo(xh, [F, [0, 1, 0, 0], [0, 0, 0, 1]]);
  return { x: scale(xh, A.R), F: f, Rt: r, N: n, speed: 0, v: [0, 0, 0, 0], ground: true, boost: 33, lean: [0, 0, 0, 0], boosting: false };
}
/** Turn the heading F toward the across direction s (a vector in span{Rt, N}) by angle a: rotate the pair (F, ŝ); the
 *  across direction perpendicular to ŝ stays put. */
function turnToward(k, s, a) {
  const m = norm(s); if (m < 1e-9 || a === 0) return;
  const sh = scale(s, 1 / m);
  const sr = dot(sh, k.Rt), sn = dot(sh, k.N);
  const q = add(scale(k.Rt, -sn), k.N, sr);              // the other across direction
  const F2 = add(scale(k.F, Math.cos(a)), sh, Math.sin(a)), s2 = add(scale(sh, Math.cos(a)), k.F, -Math.sin(a));
  k.F = F2; k.Rt = add(scale(s2, sr), q, -sn); k.N = add(scale(s2, sn), q, sr);
}
/** How hard the bike can turn at speed v: no more than the lean limit allows (v·ω = g·tan φ), nor the bars. */
export const turnRate = (v, A = ARENA) => Math.min(A.bike.turnMax, (A.g * Math.tan(A.bike.leanMax)) / Math.max(1, Math.abs(v)));

/**
 * One step of the bike. input: { throttle −1…1, steer [right, ana] each −1…1, jump (pressed this step), jumpHeld,
 * boost }. On the floor it drives; in the air it flies under gravity and its boost, steering its nose.
 */
export function stepBike(k, input, dt, mode, A = ARENA) {
  const P = A.bike, s = add(scale(k.Rt, input.steer[0]), k.N, input.steer[1]);
  const boosting = input.boost && k.boost > 0;
  k.boosting = boosting;
  if (boosting) k.boost = Math.max(0, k.boost - P.boostDrain * dt); else k.boost = Math.min(100, k.boost + P.boostRegen * dt);
  if (k.ground) {
    const xh = unit(k.x);
    if (boosting) k.speed = Math.min(P.boostSpeed, k.speed + P.boostAcc * dt);
    else if (input.throttle > 0) k.speed = k.speed < P.maxSpeed ? Math.min(P.maxSpeed, k.speed + P.accel * input.throttle * dt) : Math.max(P.maxSpeed, k.speed - 4 * dt);
    else if (input.throttle < 0) k.speed = Math.max(-5, k.speed + P.brake * input.throttle * dt);
    else k.speed = k.speed > 0 ? Math.max(0, k.speed - 3 * dt) : Math.min(0, k.speed + 3 * dt);
    const rate = norm(s) > 1e-9 ? turnRate(k.speed, A) * Math.min(1, norm(s)) : 0;
    turnToward(k, s, rate * dt * Math.sign(k.speed || 1));
    // the balanced lean: centripetal v·rate toward the turn, over g
    k.lean = norm(s) > 1e-9 ? scale(unit(s), Math.abs(k.speed) * rate / A.g) : [0, 0, 0, 0];
    const w = H.walk(xh, k.F, k.speed * dt, A.R, [k.F, k.Rt, k.N]);
    k.x = scale(w.xhat, A.R); [k.F, k.Rt, k.N] = w.vectors;
    k.v = scale(k.F, k.speed);
    if (input.jump) { k.ground = false; k.v = add(k.v, up(k.x), P.jump); k.x = add(k.x, up(k.x), 0.05); }
  } else {
    let a = gravity(k.x, k.v, mode, A);
    if (boosting) {
      const dir = input.jumpHeld ? unit(add(k.F, up(k.x))) : k.F;
      a = add(a, dir, P.boostAcc);
    }
    k.v = add(k.v, a, dt);
    k.x = add(k.x, k.v, dt);
    turnToward(k, s, P.airTurn * Math.min(1, norm(s)) * dt);
    k.lean = [0, 0, 0, 0];
    if (norm(k.x) >= A.R) {                                    // landing
      const xh = unit(k.x);
      k.x = scale(xh, A.R);
      const vt = add(k.v, xh, -dot(k.v, xh));
      [k.F, k.Rt, k.N] = H.orthonormalTo(xh, [norm(add(k.F, xh, -dot(k.F, xh))) > 0.2 ? k.F : vt, k.Rt, k.N]);
      k.speed = Math.max(-5, Math.min(P.boostSpeed, dot(vt, k.F)));
      k.v = scale(k.F, k.speed); k.ground = true;
    }
  }
  // keep the frame orthonormal against the local up (the nose may point off the floor in the air)
  const u = up(k.x);
  const fr = H.orthonormalTo(u, k.ground ? [k.F, k.Rt, k.N] : [k.F, k.Rt, k.N]);
  if (k.ground) [k.F, k.Rt, k.N] = fr;
  else { const g = gramSchmidt([k.F, k.Rt, k.N]); [k.F, k.Rt, k.N] = g; }
}
function gramSchmidt(vs) {
  const out = [];
  for (let v of vs) { for (const u of out) v = add(v, u, -dot(v, u)); out.push(unit(v)); }
  return out;
}
/** Where the bike's body is: a ball of radius r, its height above the bike's floor point. */
export const bikeBody = (k, A = ARENA) => add(k.x, up(k.x), A.bike.height);

/** The bike meets the ball: push the ball out and hit it, along the line between their centres, with the bike's
 *  closing speed plus a kick. Returns true on a touch. */
export function collide(k, b, A = ARENA) {
  const c = bikeBody(k, A), d = add(b.x, c, -1), dist = norm(d), min = A.ball.r + A.bike.r;
  if (dist >= min || dist < 1e-9) return false;
  const n = scale(d, 1 / dist);
  b.x = add(c, n, min);
  // the push: from the ground, mostly along the floor (the body is lower than the ball's centre, so the line between
  // them points up; hit along it and every touch lobs the ball across the arena's sky). Keep `lift` of the upward part.
  let dir = n;
  if (k.ground) { const u = up(k.x), nu = dot(n, u); if (nu > 0) { const flat = add(n, u, -nu * (1 - A.ball.lift)); dir = norm(flat) > 1e-6 ? unit(flat) : n; } }
  // hits go mostly where the bike points, not just along the contact line: aiming is driving. On a 3D floor a shot
  // has to be right in two directions at once, and nobody (bot or human) can place the exact contact point that well
  if (k.speed > 2 && dot(n, k.F) > 0.3) dir = unit(add(scale(dir, 1 - A.bike.aim), k.F, A.bike.aim));
  const vn = dot(add(k.v, b.v, -1), dir);
  if (vn > 0) b.v = add(b.v, dir, vn * (1 + A.ball.restitution) + A.bike.hit);
  else b.v = add(b.v, dir, A.bike.hit * 0.5);
  // two bikes squeezing it in one moment mustn't add up to a cannon shot
  const sp = norm(b.v);
  if (sp > A.ball.maxSpeed) b.v = scale(b.v, A.ball.maxSpeed / sp);
  if (k.ground) k.speed *= 0.85;
  return true;
}

// ------------------------------------------------------------------ goals --
/** A goal is a spherinder standing on the floor at a pole: every point within r of the pole along the floor, up to
 *  height h. Open all round; the roof is its top. A goal is scored when the ball's centre is inside. */
export function inGoal(x, pole, A = ARENA) { return along(x, pole, A.R) < A.goal.r && height(x, A.R) < A.goal.h; }

// ------------------------------------------------------------------ aiming --
/** Ball lock: turn the bike's across-space about its heading so the ball lies in its slice (span of F, up and Rt).
 *  The ball is one point, so some 3D slice through you always holds it. Two things keep this from wrenching the view:
 *  the slice holds the ball on your right AND on your left, so it turns to whichever is nearer (never more than 90°:
 *  turning Rt "toward" a ball on your left meant spinning the whole across-plane 180°, a mirror-flip of the world);
 *  and it's lazy: it turns only far enough to bring the ball within `tol` metres of the slice. Near the ball its
 *  direction across your heading swings wildly while its distance from your slice stays small, so a lazy lock barely
 *  moves. rate limits the turn (rad/s). Returns the ball's offset out of the slice before the turn, in metres. */
export function lockSlice(k, target, dt = 1, rate = Infinity, tol = 0) {
  const u = up(k.x), d = add(target, k.x, -1);
  const h = add(add(d, k.F, -dot(d, k.F)), u, -dot(d, u));      // the ball's direction across your heading
  const off = dot(d, k.N), hn = norm(h);
  if (hn < 1e-6 || Math.abs(off) <= tol) return off;
  let ang = Math.atan2(dot(h, k.N), dot(h, k.Rt));              // from Rt to the ball, within the across-plane
  if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;   // the nearer of ±Rt
  const allowed = Math.asin(Math.min(1, tol / hn));
  ang -= Math.sign(ang) * allowed;                              // stop where the offset is tol
  const turn = Math.max(-rate * dt, Math.min(rate * dt, ang));
  const c = Math.cos(turn), s = Math.sin(turn), R0 = k.Rt, N0 = k.N;
  k.Rt = add(scale(R0, c), N0, s); k.N = add(scale(N0, c), R0, -s);
  return off;
}

/**
 * The chase camera: behind the bike, looking toward the ball (ball cam) or ahead, ALWAYS with the bike in view.
 * Everything lives in the bike's slice, span{F, up, Rt}, so ball lock's work is kept. cs persists between frames.
 *  - its direction (where "behind" is measured from) is the floor direction from the bike to the ball, within the
 *    slice, turned toward smoothly as an angle in the (F, Rt) plane (never a vector average, which can pass through 0);
 *  - the look aims at the ball but is held within maxAng of the bike, and below maxUp of straight up, then followed
 *    smoothly and never faster than maxTurn rad/s;
 *  - the camera's right is built from its look and up inside the slice (a cross product in the F, Rt, up basis), so it
 *    never degenerates when the look runs along Rt or toward the sky.
 */
export function chaseCamera(cs, k, ball, { ballCam = true, maxAng = 0.5, maxUp = 0.62, maxTurn = 1.6 } = {}, dt = 1 / 60, A = ARENA) {
  const u = up(k.x), base = bikeBody(k, A);
  const inPlane = (v) => [dot(v, k.F), dot(v, k.Rt)];          // a direction's place in the (F, Rt) plane
  const fromAngle = (a) => add(scale(k.F, Math.cos(a)), k.Rt, Math.sin(a));
  // where to stand behind
  let want = null;
  if (ballCam) {
    const hb = add(add(ball, base, -1), u, -dot(add(ball, base, -1), u));
    const [f, r] = inPlane(hb);
    if (Math.hypot(f, r) > 3) want = Math.atan2(r, f);
  }
  if (want === null) {
    const vF = k.ground ? k.F : add(k.v, u, -dot(k.v, u));
    const [f, r] = inPlane(vF);
    want = Math.hypot(f, r) > 0.2 ? Math.atan2(r, f) : (cs.dirA ?? 0);
  }
  let cur = cs.dir ? Math.atan2(...inPlane(cs.dir).reverse()) : want;
  if (!cs.dir || !Number.isFinite(cur)) cur = want;
  let diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
  diff = Math.max(-3 * dt, Math.min(3 * dt, diff * (1 - Math.exp(-5 * dt))));
  cs.dirA = cur + diff;
  cs.dir = fromAngle(cs.dirA);
  // where the camera wants to be, kept inside the arena, smoothed
  let eyeW = add(add(base, cs.dir, -7), u, 2.7);
  if (norm(eyeW) > A.R - 0.4) eyeW = scale(unit(eyeW), A.R - 0.4);
  cs.eye = cs.eye ? add(cs.eye, add(eyeW, cs.eye, -1), 1 - Math.exp(-10 * dt)) : eyeW;
  const eye = cs.eye, ue = up(eye);
  // the look: at the ball (or ahead), held so the bike stays in frame and the sky doesn't take over
  const toBike = unit(add(base, eye, -1));
  let look = unit(add(ballCam ? ball : add(add(base, cs.dir, 6), u, 0.6), eye, -1));
  const ang = Math.acos(Math.max(-1, Math.min(1, dot(look, toBike))));
  if (ang > maxAng) { const t = maxAng / ang, s0 = Math.sin((1 - t) * ang) / Math.sin(ang), s1 = Math.sin(t * ang) / Math.sin(ang); look = unit(add(scale(toBike, s0), look, s1)); }
  const e = dot(look, ue);
  if (e > maxUp) { const flat = unit(add(look, ue, -e)); look = unit(add(scale(flat, Math.sqrt(1 - maxUp * maxUp)), ue, maxUp)); }
  // follow the wanted look smoothly, and never faster than maxTurn (rad/s): a hit flings the ball away in an instant
  if (cs.look) {
    const a0 = Math.acos(Math.max(-1, Math.min(1, dot(cs.look, look))));
    const step = Math.min(a0 * (1 - Math.exp(-8 * dt)), maxTurn * dt);
    if (a0 > 1e-9) { const t = step / a0, s0 = Math.sin((1 - t) * a0) / Math.sin(a0), s1 = Math.sin(t * a0) / Math.sin(a0); cs.look = unit(add(scale(cs.look, s0), look, s1)); }
  } else cs.look = look;
  // the frame: look, up (made perpendicular), right as up × look in the slice's (F, Rt, up) coordinates
  const L = cs.look, Up = unit(add(ue, L, -dot(ue, L)));
  const l3 = [dot(L, k.F), dot(L, k.Rt), dot(L, u)], u3 = [dot(Up, k.F), dot(Up, k.Rt), dot(Up, u)];
  const r3 = [u3[1] * l3[2] - u3[2] * l3[1], u3[2] * l3[0] - u3[0] * l3[2], u3[0] * l3[1] - u3[1] * l3[0]];
  const right = unit(add(add(scale(k.F, r3[0]), k.Rt, r3[1]), u, r3[2]));
  return { eye, look: L, up: Up, right, w: k.N, bikeAngle: Math.acos(Math.max(-1, Math.min(1, dot(L, unit(add(base, eye, -1)))))) };
}

/** Where to meet the ball: run a copy of it forward and find the first moment you could be under it, driving at
 *  `speed`. Returns { t, x (the ball then), floor (its floor point) }, or the last point looked at. */
export function intercept(k, b, mode, speed, A = ARENA, horizon = 5, dt = 1 / 30) {
  const g = { x: b.x.slice(), v: b.v.slice() };
  let t = 0, last = null;
  for (; t <= horizon; t += dt) {
    const reach = Math.max(0, along(k.x, g.x, A.R) - A.ball.r - A.bike.r);
    last = { t, x: g.x.slice(), floor: scale(unit(g.x), A.R) };
    if (reach <= speed * t && height(g.x, A.R) < A.ball.r + 2.5) return last;
    stepBall(g, dt, mode, A);
  }
  return last;
}
/** The way to steer toward a floor point: the target's direction across your heading, as [right, ana], and how far
 *  off your heading it is (radians). */
export function steerToward(k, target) {
  const xh = unit(k.x), tu = unit(target);
  const d = add(tu, xh, -dot(tu, xh));                    // the target's direction along the floor
  if (norm(d) < 1e-9) return { steer: [0, 0], angle: 0 };
  const a = Math.atan2(Math.hypot(dot(d, k.Rt), dot(d, k.N)), dot(d, k.F));
  const across = [dot(d, k.Rt), dot(d, k.N)], m = Math.hypot(...across) || 1;
  const gain = Math.min(1, a * 2.2);
  return { steer: [(across[0] / m) * gain, (across[1] / m) * gain], angle: a };
}
/** The shot line: the floor direction from the ball toward a goal (theirs, by default); and the approach point, a
 *  little behind the ball along it, where you want to arrive to hit it goalward. */
export function approach(ballFloor, A = ARENA, back = 2.4, goal = ENEMY) {
  const bh = unit(ballFloor), g = unit(goal);
  const dir = unit(add(g, bh, -dot(g, bh)));
  return { dir, point: scale(H.walk(bh, scale(dir, -1), back, A.R, []).xhat, A.R) };
}

/** Kickoff: the ball 3 m over the centre spot, the bike 26 m from it, facing it. With no rnd, the bike stands on the
 *  line toward its own goal (the selftest's fixed case). With rnd (a function giving 0…1), solo practice: the bike's
 *  side of the ball is turned off that line (0.5 to 2.4 rad, toward any direction across it, ana and kata included),
 *  and the ball is already rolling, so no kickoff is a straight drive into their goal. */
export function kickoff(A = ARENA, rnd = null) {
  const ball = makeBall(SPOT, 3, A), sp = unit(SPOT);
  let toward = unit(add(OWN, sp, -dot(OWN, sp)));
  if (rnd) {
    const F = H.floorFrame(sp);
    // the floor directions at the spot orthogonal to "toward": pick one at random, and turn toward it
    const basis = H.orthonormalTo(sp, [toward, F.f, F.e]).slice(1);
    const phi = 2 * Math.PI * rnd(), off = unit(add(scale(basis[0], Math.cos(phi)), basis[1], Math.sin(phi)));
    const t = 0.5 + 1.9 * rnd();
    toward = unit(add(scale(toward, Math.cos(t)), off, Math.sin(t)));
    const roll = unit(add(scale(basis[0], Math.cos(phi + 2)), basis[1], Math.sin(phi + 2)));
    ball.v = scale(roll, 2 + 4 * rnd());
  }
  const at = H.walk(sp, toward, 26, A.R, []).xhat;
  const face = unit(add(sp, at, -dot(sp, at)));
  return { ball, bike: makeBike(at, face, A) };
}

// ------------------------------------------------------------------ teams --
// Two teams. Cyan defends OWN and attacks ENEMY (you're cyan); orange the other way round. The arena is symmetric under
// the reflection x₁ → −x₁, which swaps the goals and fixes the kickoff spot: orange's kickoff is cyan's, reflected.
export const TEAMS = { cyan: { defend: OWN, attack: ENEMY }, orange: { defend: ENEMY, attack: OWN } };
export const mirror = (v) => [-v[0], v[1], v[2], v[3]];

/** A kickoff for n a side: cyan's bikes 26 m from the ball on their own side, fanned out (the first straight toward its
 *  goal's line, the rest turned off it, toward random directions across it); orange's are cyan's mirrored. With rnd
 *  the fan's directions vary; the ball starts still, 3 m up (both teams have a fair go). */
export function teamKickoff(n, A = ARENA, rnd = null) {
  const ball = makeBall(SPOT, 3, A), sp = unit(SPOT), F = H.floorFrame(sp);
  const toward = unit(add(OWN, sp, -dot(OWN, sp)));
  const basis = H.orthonormalTo(sp, [toward, F.f, F.e]).slice(1);
  const cyan = [], orange = [];
  for (let i = 0; i < n; i++) {
    let dir = toward;
    if (i > 0) {
      const phi = rnd ? 2 * Math.PI * rnd() : (2 * Math.PI * i) / n, t = 0.7 + (rnd ? 0.5 * rnd() : 0.2);
      const off = unit(add(scale(basis[0], Math.cos(phi)), basis[1], Math.sin(phi)));
      dir = unit(add(scale(toward, Math.cos(t)), off, Math.sin(t)));
    }
    const dist = i === 0 ? 26 : 34;
    const at = H.walk(sp, dir, dist, A.R, []).xhat;
    const face = unit(add(sp, at, -dot(sp, at)));
    cyan.push(makeBike(at, face, A));
    orange.push(makeBike(mirror(at), mirror(face), A));
  }
  return { ball, cyan, orange };
}

/** Bikes bump: two bodies closer than twice the radius are pushed apart along the floor, and slowed. */
export function bump(a, b, A = ARENA) {
  const ca = bikeBody(a, A), cb = bikeBody(b, A), d = add(cb, ca, -1), dist = norm(d), min = 2 * A.bike.r;
  if (dist >= min || dist < 1e-9) return false;
  const n = scale(d, 1 / dist), push = (min - dist) / 2;
  for (const [k, sgn] of [[a, -1], [b, 1]]) {
    const xh = unit(k.x), m = add(n, xh, -dot(n, xh));
    if (norm(m) > 1e-9) { const w = H.walk(xh, unit(m), sgn * push, A.R, [k.F, k.Rt, k.N]); if (k.ground) { k.x = scale(w.xhat, A.R); [k.F, k.Rt, k.N] = w.vectors; } }
    if (k.ground) k.speed *= 0.8;
  }
  return true;
}

// ------------------------------------------------------------------ the bots --
/** How good the bots are: how often they rethink (s), how much of the throttle and boost they use, whether they jump
 *  for high balls, and how far off their aim wanders (m). */
export const SKILL = {
  easy: { think: 0.35, throttle: 0.72, boost: 0, jump: false, wobble: 2.5 },
  normal: { think: 0.18, throttle: 0.9, boost: 0.5, jump: true, wobble: 1.0 },
  hard: { think: 0.08, throttle: 1, boost: 1, jump: true, wobble: 0.3 },
};

/** Who does what in a team: the one who'd reach the ball first attacks, the rest defend. bikes is the team's list;
 *  returns their roles in order. */
export function roles(bikes, ball, mode, A = ARENA) {
  if (bikes.length === 1) return ['attack'];
  const time = bikes.map((k) => { const it = intercept(k, ball, mode, Math.max(9, Math.abs(k.speed)), A, 4, 1 / 15); return it ? it.t : 9; });
  const first = time.indexOf(Math.min(...time));
  return bikes.map((_, i) => (i === first ? 'attack' : 'defend'));
}

/**
 * A bot's next input. brain persists between calls (its target and the time to rethink). team is 'cyan' or 'orange';
 * role 'attack' (meet the ball from behind, on the line to their goal; go round the ball if it's between you and that
 * point; drive through it once lined up; boost when far and facing it; jump at a high ball close by) or 'defend' (stand
 * between the ball and your own goal, ten metres out, facing the ball, and clear it if it comes near).
 */
export function botInput(k, brain, team, role, ball, mode, skill, dt, rnd = Math.random, A = ARENA, others = []) {
  const T = TEAMS[team], P = SKILL[skill] || SKILL.normal;
  brain.t = (brain.t ?? 0) - dt;
  brain.charge = Math.max(0, (brain.charge ?? 0) - dt);
  const d = along(k.x, ball.x, A.R), ballH = height(ball.x, A.R) - A.ball.r;
  // committed: having reached its spot (beside or behind the ball), it charges the ball for a moment, whoever's there
  // charging: at the ball, and in the last few metres steer for their goal, so the hit goes there
  if (role === 'attack' && brain.charge > 0) { brain.target = d < 5 && brain.aim ? brain.aim : scale(unit(ball.x), A.R); brain.t = 0.05; }
  else if (role === 'attack' && brain.target && brain.spot && along(k.x, brain.target, A.R) < 2.5 && d < 12) {
    brain.charge = 1.3; brain.side = null; brain.target = scale(unit(ball.x), A.R); brain.t = 0.05;
  }
  if ((brain.t <= 0 || !brain.target) && !(role === 'attack' && brain.charge > 0)) {
    brain.t = P.think;
    let target;
    brain.spot = false;
    if (role === 'attack') {
      const it = intercept(k, ball, mode, Math.max(9, Math.abs(k.speed)), A, 4, 1 / 15);
      const bf = unit(it.floor), xh = unit(k.x);
      // aim somewhere across their goal's mouth, not its dead centre (re-picked now and then), so two bots don't mirror
      if (!brain.aim || rnd() < 0.05) {
        const g = unit(T.attack), r3 = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5];
        const t3 = add(r3, g, -dot(r3, g));
        brain.aim = norm(t3) > 1e-6 ? scale(H.walk(g, unit(t3), (A.goal.r - 2) * rnd(), A.R, []).xhat, A.R) : scale(g, A.R);
      }
      const goalPt = brain.aim;
      // would ramming the ball from here send it toward their goal? (the direction you'd arrive in, at the ball,
      // against the ball's line to their goal)
      const arrive = unit(add(scale(bf, dot(xh, bf)), xh, -1));                // at the ball, pointing away from you
      const shot = approach(it.floor, A, 1, goalPt).dir;
      // an opponent at the ball, on its far side: a 50/50. Swing out sideways (a direction across the line between
      // you, ana and kata included: chosen once and kept) and come at the ball from there
      const rival = others.filter((o) => o.team !== team).map((o) => o.k).sort((p, q) => along(p.x, ball.x, A.R) - along(q.x, ball.x, A.R))[0];
      const contested = rival && along(rival.x, ball.x, A.R) < 7 && d < 14 && along(k.x, rival.x, A.R) > d;
      if (contested && !brain.side) {
        const line = unit(add(bf, xh, -dot(bf, xh))), r3 = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5];
        let side = add(add(r3, bf, -dot(r3, bf)), line, -dot(r3, line));
        brain.side = norm(side) > 1e-6 ? unit(side) : k.Rt;
      }
      if (!contested) brain.side = null;
      if (brain.side && d > 3.5) { target = scale(H.walk(bf, unit(add(brain.side, bf, -dot(brain.side, bf))), 6, A.R, []).xhat, A.R); brain.spot = true; }
      // lined up well enough to score from here? On a three-dimensional floor a goal is a small ball of it: a shot must
      // be right in two directions at once, to within about the goal's radius over its distance
      else if (dot(arrive, shot) > Math.cos(Math.min(1.2, Math.atan((A.goal.r * 0.7) / Math.max(1, along(it.floor, goalPt, A.R)))))) target = it.floor;
      else {
        // no: come round behind it, from far enough back to turn in
        const ap = approach(it.floor, A, 7, goalPt);
        target = ap.point; brain.spot = true;
        // the ball between you and that point: swing wide of it first
        const b = unit(add(bf, xh, -dot(bf, xh))), p = unit(add(unit(ap.point), xh, -dot(unit(ap.point), xh)));
        if (along(k.x, it.floor, A.R) < along(k.x, ap.point, A.R) && dot(b, p) > Math.cos(0.5)) {
          let side = add(p, b, -dot(p, b));
          side = norm(side) > 1e-6 ? unit(side) : k.Rt;
          target = scale(H.walk(bf, side, 7, A.R, []).xhat, A.R);
        }
      }
    } else {
      const own = unit(T.defend), bh = unit(ball.x);
      const from = Math.min(A.goal.r + 6, along(own, bh, A.R) * 0.5);
      const dir = add(bh, own, -dot(bh, own));
      target = norm(dir) > 1e-6 ? scale(H.walk(own, unit(dir), from, A.R, []).xhat, A.R) : scale(own, A.R);
      // the ball close and you goal-side of it: clear it
      if (d < 10 && along(k.x, own, A.R) < along(ball.x, own, A.R)) target = scale(unit(ball.x), A.R);
    }
    // a little wobble in the aim
    if (P.wobble > 0) {
      const xh = unit(target), w = unit(add([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], xh, -dot([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], xh)));
      if (Number.isFinite(w[0])) target = scale(H.walk(xh, w, P.wobble * rnd(), A.R, []).xhat, A.R);
    }
    brain.target = target;
  }
  const st = steerToward(k, brain.target), dist = along(k.x, brain.target, A.R);
  let throttle = P.throttle;
  // brake for the turn: the circle that reaches the target from your heading has radius dist / (2 sin angle); the
  // lean limit rides a circle of radius v²/(g tan φ), so go no faster than √(g tan φ · r)
  const rNeed = st.angle > 0.05 ? dist / (2 * Math.sin(Math.min(st.angle, Math.PI / 2))) : Infinity;
  const vMax = Math.max(3, Math.sqrt(A.g * Math.tan(A.bike.leanMax) * rNeed));
  if (k.speed > vMax + 1) throttle = -1;
  else if (k.speed > vMax) throttle = 0;
  if (role === 'defend' && dist < 2.5) throttle = 0;                     // in position: wait
  const boost = P.boost > 0 && k.ground && st.angle < 0.25 && dist > 14 && k.boost > 100 * (1 - P.boost) + 5;
  const jump = P.jump && k.ground && ballH > 1.8 && ballH < 5 && d < 4 + Math.abs(k.speed) * 0.25 && st.angle < 0.6;
  return { throttle, steer: st.steer, jump, jumpHeld: jump, boost };
}

/** Step a whole match on its own (no rendering): bikes { k, team, brain }, the ball; scores { cyan, orange }.
 *  humanInput(k) gives the input for a human bike (null for bots). Returns 'cyan' or 'orange' when a goal goes in. */
export function stepMatch(m, dt, mode, skill, rnd = Math.random, humanInput = null, A = ARENA) {
  m.roleT = (m.roleT ?? 0) - dt;
  if (m.roleT <= 0) {
    m.roleT = 0.25;
    for (const team of ['cyan', 'orange']) {
      const mine = m.bikes.filter((b) => b.team === team);
      roles(mine.map((b) => b.k), m.ball, mode, A).forEach((r, i) => { mine[i].role = r; });
    }
  }
  for (const b of m.bikes) {
    const input = b.human && humanInput ? humanInput(b.k) : botInput(b.k, b.brain, b.team, b.role || 'attack', m.ball, mode, skill, dt, rnd, A, m.bikes);
    stepBike(b.k, input, dt, mode, A);
  }
  stepBall(m.ball, dt, mode, A);
  let touched = null;
  for (const b of m.bikes) if (collide(b.k, m.ball, A)) { touched = b; m.last = b; }
  for (let i = 0; i < m.bikes.length; i++) for (let j = i + 1; j < m.bikes.length; j++) bump(m.bikes[i].k, m.bikes[j].k, A);
  if (inGoal(m.ball.x, ENEMY, A)) return 'cyan';
  if (inGoal(m.ball.x, OWN, A)) return 'orange';
  return touched ? 'touch' : null;
}
/** A fresh match: n a side, the first cyan bike human if asked. */
export function newMatch(n, A = ARENA, rnd = null, human = true) {
  const ko = teamKickoff(n, A, rnd);
  const bikes = [];
  ko.cyan.forEach((k, i) => bikes.push({ k, team: 'cyan', brain: {}, human: human && i === 0, name: human && i === 0 ? 'you' : `cyan ${i + 1}` }));
  ko.orange.forEach((k, i) => bikes.push({ k, team: 'orange', brain: {}, human: false, name: `orange ${i + 1}` }));
  return { ball: ko.ball, bikes };
}
