// golf.js — golf-ball ballistics in the two reference frames, plus the course
// model the designer builds and the play surface runs.
//
// THE WHOLE POINT: a golf ball is a near-pure ballistic projectile, so it is the
// cleanest possible probe of the frame it flies in. We hit the SAME ball with the
// SAME club under two body forces and watch where it lands:
//
//   • EARTH    — uniform g₀ down. The ball flies (and the green breaks) the way
//                every golfer's intuition expects. The control group.
//   • CYLINDER — the co-rotating frame of an O'Neill cylinder. The ball feels
//                centrifugal "gravity" (ω²r, outward = down) that WEAKENS as it
//                climbs toward the axis, plus the Coriolis force (−2Ω×v) that
//                bends every shot sideways — and keeps bending a putt as it rolls.
//                Aim straight and you miss; you have to read the spin of the world.
//
// The field accelerations come straight from the proven kernel in physics.js
// (pinned by test/physics.selftest.mjs, which rotates a free trajectory back into
// the inertial frame and checks it comes out a straight line). On top of the field
// the ball carries two aerodynamic terms that make it a GOLF ball and not a
// cannonball: quadratic air drag, and a Magnus force from spin (backspin → lift =
// carry; sidespin → draw/fade). With spin and drag switched off, stepBall reduces
// EXACTLY to the proven free particle — the selftest asserts this.
//
// Everything here is pure, deterministic and zero-dep: it runs identically in node
// and the browser and is gated by test/golf.selftest.mjs.

import { vec3 } from './math.js';
import { earthAccel, cylinderAccel, downDir, G0 } from './physics.js';
import { mulberry32 } from './geometry.js';

// ── the ball + air model (SI; ball mass folded into the coefficients) ──
// Tuned so a full driver (~70 m/s, ~12° loft, backspin) carries a few hundred
// metres under 1 g — the right ballpark for a golf hole — while keeping the
// Coriolis bend clearly visible at hoop scale and wild in the tight rings.
export const BALL = {
  radius: 0.9,          // visual/collision radius (m) — oversized so it reads on screen
  dragK: 0.0009,        // quadratic drag: a_drag = −dragK·|v|·v
  magnusK: 0.00022,     // Magnus: a_mag = magnusK·(spin × v)  (spin in rad/s-ish units)
  spinDecay: 0.18,      // spin bleeds e^(−spinDecay·t) per second
  rollFriction: 5.5,    // ground rolling deceleration (m/s²) on the fairway
  greenFriction: 2.4,   // slicker on the green (so putts run + break)
  restitution: 0.38,    // normal-velocity retention per bounce
  rollGrip: 6.0,        // how fast a grounded ball is pulled onto the floor tangent
  holeR: 2.2,           // cup capture radius (m) — generous, the ball is oversized
  captureSpeed: 9.0,    // must be rolling slower than this to drop in the cup
  stopSpeed: 0.6,       // below this on the ground, the ball is at rest
};

// ── club presets: the player picks one, then sets aim / power / spin ──
// speed = ball speed off the face (m/s); loft = launch elevation (deg); backspin
// is the natural backspin that gives the club its carry.
export const CLUBS = [
  { id: 'driver', label: 'Driver',   speed: 72, loft: 11, backspin: 280 },
  { id: 'wood',   label: '3 Wood',   speed: 64, loft: 15, backspin: 320 },
  { id: 'iron',   label: '5 Iron',   speed: 54, loft: 23, backspin: 360 },
  { id: 'wedge',  label: 'Wedge',    speed: 38, loft: 46, backspin: 520 },
  { id: 'putter', label: 'Putter',   speed: 18, loft: 1,  backspin: 0   },
];

// ── floor geometry ──────────────────────────────────────────────────────────
// A course lives on the floor. To keep the SAME course data meaningful in both
// frames we store every feature as a floor coordinate {u, v}:
//   • cylinder: u = angle θ around the hull (rad), v = z along its length (m)
//   • earth:    u = x (m), v = z (m)
// floorToWorld lifts a floor point to a world position `lift` metres "up" (inward
// in the cylinder, +Y on Earth).

export function floorToWorld(out, mode, R, pt, lift = 0) {
  if (mode === 'cylinder') {
    const rho = R - lift;
    out[0] = Math.cos(pt.u) * rho;
    out[1] = Math.sin(pt.u) * rho;
    out[2] = pt.v;
  } else {
    out[0] = pt.u;
    out[1] = lift;
    out[2] = pt.v;
  }
  return out;
}

// Walking distance between two floor points (arc length around the hull in the
// cylinder, plain planar distance on Earth). This is the honest "yardage".
export function floorDistance(mode, R, a, b) {
  if (mode === 'cylinder') {
    let dth = a.u - b.u;
    dth = Math.atan2(Math.sin(dth), Math.cos(dth));   // shortest signed arc
    const arc = R * dth;
    const dz = a.v - b.v;
    return Math.hypot(arc, dz);
  }
  return Math.hypot(a.u - b.u, a.v - b.v);
}

// A right-handed surface basis at a floor point: {up, fwd, right}. `up` is the
// local "away from the floor" (negative apparent gravity); `fwd` is the reference
// heading a 0° aim points along (down the cylinder's length / world −Z on Earth);
// `right` completes the frame. Aim angles are measured in this basis so the
// designer and the play surface agree on where "straight at the pin" is.
const _dn = [0, 0, 0];
export function surfaceBasis(mode, pos) {
  downDir(_dn, mode, pos);
  const up = [-_dn[0], -_dn[1], -_dn[2]];
  let fwd = mode === 'cylinder' ? [0, 0, 1] : [0, 0, -1];
  // project fwd onto the tangent plane and normalise (it is already ⟂ up in both
  // frames, but stay robust if a caller passes an odd up)
  const d = vec3.dot(fwd, up);
  fwd = vec3.normalize([0, 0, 0], [fwd[0] - up[0] * d, fwd[1] - up[1] * d, fwd[2] - up[2] * d]);
  const right = vec3.normalize([0, 0, 0], vec3.cross([0, 0, 0], fwd, up));
  return { up, fwd, right };
}

// The heading on the floor from a tee toward the pin, as an aim angle (rad) in the
// surfaceBasis at `from`. 0 = along `fwd`, positive = toward `right`. This is the
// "straight line" a player would aim on Earth — in the cylinder the Coriolis bend
// means the correct aim is offset from it.
export function bearingTo(mode, R, from, to) {
  const fromW = floorToWorld([0, 0, 0], mode, R, from, 0);
  const toW = floorToWorld([0, 0, 0], mode, R, to, 0);
  const { up, fwd, right } = surfaceBasis(mode, fromW);
  let d = vec3.sub([0, 0, 0], toW, fromW);
  const dn = vec3.dot(d, up);                          // strip the vertical part
  d = [d[0] - up[0] * dn, d[1] - up[1] * dn, d[2] - up[2] * dn];
  return Math.atan2(vec3.dot(d, right), vec3.dot(d, fwd));
}

// ── the shot: aim/power/spin → initial velocity + spin vector ─────────────────
// params: { aim (rad, in surfaceBasis), club (CLUBS entry), power (0..1 scales
// club speed), backspin (override, else club.backspin), sidespin (rad/s-ish; + =
// curve toward `right` via Magnus) }.
//
// Backspin axis is `right` of the aim: a ball moving forward with backspin has its
// angular-velocity vector pointing to the launch-right, and magnusK·(spin×v) then
// has a component along `up` — lift, i.e. carry. The selftest pins that sign.
export function launch(mode, ballPos, params) {
  const { up, fwd, right } = surfaceBasis(mode, ballPos);
  const club = params.club || CLUBS[0];
  const speed = club.speed * (params.power == null ? 1 : params.power);
  const loft = (params.loft == null ? club.loft : params.loft) * Math.PI / 180;
  const aim = params.aim || 0;

  // horizontal launch direction (in the tangent plane), then tilt up by the loft
  const ca = Math.cos(aim), sa = Math.sin(aim);
  const horiz = [
    fwd[0] * ca + right[0] * sa,
    fwd[1] * ca + right[1] * sa,
    fwd[2] * ca + right[2] * sa,
  ];
  const cl = Math.cos(loft), sl = Math.sin(loft);
  const dir = vec3.normalize([0, 0, 0], [
    horiz[0] * cl + up[0] * sl,
    horiz[1] * cl + up[1] * sl,
    horiz[2] * cl + up[2] * sl,
  ]);
  const vel = vec3.scale([0, 0, 0], dir, speed);

  // spin = backspin about `right` (lift) + sidespin about `up` (draw/fade)
  const back = params.backspin == null ? club.backspin : params.backspin;
  const side = params.sidespin || 0;
  const spin = [
    right[0] * back + up[0] * side,
    right[1] * back + up[1] * side,
    right[2] * back + up[2] * side,
  ];
  return { vel, spin };
}

// ── the airborne ball: field + drag + Magnus, semi-implicit Euler ─────────────
// Pure. b = { pos:[3], vel:[3], spin:[3] }. With dragK = magnusK = 0 and spin = 0
// this is byte-for-byte the free particle of physics.js (proven straight-in-
// inertial) — the selftest checks that reduction explicitly.
const _a = [0, 0, 0], _mag = [0, 0, 0];
export function stepBall(b, mode, omega, dt) {
  if (mode === 'cylinder') cylinderAccel(_a, b.pos, b.vel, omega);
  else earthAccel(_a);
  const speed = vec3.len(b.vel);
  // quadratic air drag
  _a[0] -= BALL.dragK * speed * b.vel[0];
  _a[1] -= BALL.dragK * speed * b.vel[1];
  _a[2] -= BALL.dragK * speed * b.vel[2];
  // Magnus lift/curve: perpendicular to velocity (does no work)
  vec3.cross(_mag, b.spin, b.vel);
  _a[0] += BALL.magnusK * _mag[0];
  _a[1] += BALL.magnusK * _mag[1];
  _a[2] += BALL.magnusK * _mag[2];
  vec3.scaleAndAdd(b.vel, b.vel, _a, dt);
  vec3.scaleAndAdd(b.pos, b.pos, b.vel, dt);
  // spin bleeds off
  const k = Math.exp(-BALL.spinDecay * dt);
  b.spin[0] *= k; b.spin[1] *= k; b.spin[2] *= k;
  return b;
}

// Distance from a point to the floor surface, signed: >0 above the floor (in
// play), <0 means it has sunk through and must be projected back up.
export function heightAboveFloor(mode, R, pos) {
  if (mode === 'cylinder') return R - Math.hypot(pos[0], pos[1]);
  return pos[1];
}

// Is the ball holed? Within holeR of the pin on the floor, and rolling slowly.
export function holed(mode, R, ballPos, pinPt, speed) {
  if (speed > BALL.captureSpeed) return false;
  const bp = mode === 'cylinder'
    ? { u: Math.atan2(ballPos[1], ballPos[0]), v: ballPos[2] }
    : { u: ballPos[0], v: ballPos[2] };
  return floorDistance(mode, R, bp, pinPt) <= BALL.holeR;
}

// ── the course model + sharing ────────────────────────────────────────────────
// A course is plain data the designer writes and the play surface reads. Stored
// in a URL hash (base64url of JSON) so a designed hole is a shareable link.
//   { v, name, preset (CYLINDERS index), mode, tee, pin, par, hazards[] }
// hazards: { kind: 'water'|'sand'|'rough', u, v, r } discs on the floor.

export const COURSE_VERSION = 1;

export function par(distance) {
  if (distance < 170) return 3;
  if (distance < 400) return 4;
  if (distance < 620) return 5;
  return 6;
}

// base64url that works in both node and the browser (no deps).
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = (typeof btoa !== 'undefined') ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64decode(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = (typeof atob !== 'undefined') ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeCourse(course) {
  return b64encode(JSON.stringify({ v: COURSE_VERSION, ...course }));
}
export function decodeCourse(code) {
  try {
    const c = JSON.parse(b64decode(code));
    if (!c || !c.tee || !c.pin) return null;
    c.hazards = c.hazards || [];
    return c;
  } catch { return null; }
}

// A deterministic procedural hole: a tee and a pin a sensible distance apart, a
// few hazards strewn between them. `presetIdx` indexes CYLINDERS (from physics).
// `geom = { mode, R, len }` is the active world. Used for the designer's default
// and its "randomise" button.
export function randomCourse(seed, presetIdx, geom) {
  const rnd = mulberry32((seed * 2654435761) >>> 0 || 1);
  const { mode, R, len } = geom;
  let tee, pin, reach;
  if (mode === 'cylinder') {
    const z0 = len * (0.18 + rnd() * 0.12);
    // hole length scales with the hull: a fraction of the floor, clamped sane
    reach = Math.min(len * 0.55, Math.max(140, R * (0.06 + rnd() * 0.08)));
    const dz = reach * (0.45 + rnd() * 0.4);
    const arc = Math.sqrt(Math.max(0, reach * reach - dz * dz));
    const dth = (arc / R) * (rnd() < 0.5 ? 1 : -1);
    const u0 = rnd() * Math.PI * 2;
    tee = { u: u0, v: z0 };
    pin = { u: u0 + dth, v: Math.min(len - 40, z0 + dz) };
  } else {
    reach = 180 + rnd() * 320;
    const ang = (rnd() - 0.5) * 0.9;
    tee = { u: (rnd() - 0.5) * 200, v: 200 + rnd() * 200 };
    pin = { u: tee.u + Math.sin(ang) * reach, v: tee.v - Math.cos(ang) * reach };
  }
  const dist = floorDistance(mode, R, tee, pin);
  const hazards = [];
  const kinds = ['water', 'sand', 'rough'];
  const nh = 1 + (rnd() * 3 | 0);
  for (let i = 0; i < nh; i++) {
    const t = 0.3 + rnd() * 0.5;                       // somewhere along the hole
    const u = tee.u + (pin.u - tee.u) * t + (rnd() - 0.5) * (mode === 'cylinder' ? 0.02 : 60);
    const v = tee.v + (pin.v - tee.v) * t + (rnd() - 0.5) * (mode === 'cylinder' ? 40 : 60);
    hazards.push({ kind: kinds[(rnd() * kinds.length) | 0], u, v, r: 14 + rnd() * 26 });
  }
  return {
    name: 'Hole ' + (1 + (seed % 18)),
    preset: presetIdx, mode, tee, pin, par: par(dist), hazards,
  };
}

// Which hazard (if any) does a floor point sit inside? Returns the hazard or null.
export function hazardAt(mode, R, hazards, pt) {
  for (const h of hazards || []) {
    if (floorDistance(mode, R, { u: h.u, v: h.v }, pt) <= h.r) return h;
  }
  return null;
}
