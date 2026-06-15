// physics.js — the two reference frames the duck can fly in.
//
// The whole point of this sim: fly the SAME aerodynamic duck under two different
// BODY forces and feel the difference.
//
//   • EARTH      — a uniform downward field, g0 = 9.81 m/s². Boring, correct, the
//                  control group.
//   • CYLINDER   — the co-rotating ("spin-gravity") frame of an O'Neill cylinder.
//                  We sit in the frame that turns WITH the hull, so the landscape
//                  is stationary and the player walks/flies on the inside. In that
//                  frame a free body feels two fictitious accelerations:
//                     centrifugal  a_cf  = Ω²·r⊥          (radially OUTWARD)
//                     Coriolis     a_cor = −2 Ω × v_rot
//                  The cylinder axis is world +Z, so r⊥ = (x, y, 0) and, with
//                  Ω = (0,0,ω):  a_cf = ω²(x,y,0),  a_cor = (2ω·vy, −2ω·vx, 0).
//                  "Down" is radially outward; "up" is toward the axis; gravity
//                  WEAKENS as you climb toward the axis (a_cf → 0 there). Throw a
//                  breadcrumb and Coriolis bends its fall — the headline effect.
//
// The canonical numbers come straight from hoop's research dossier
// (hoop/js/research.js): floor radius R = 8 km, hull R_out = 10 km, spun so the
// outer skin sees 1 g ⇒ ω = √(g0/R_out) ≈ 0.0313 rad/s ⇒ 0.8 g at the 8 km floor.
//
// Everything here is pure, deterministic and zero-dep — it runs identically in
// node and the browser and is pinned by test/physics.selftest.mjs (which proves
// the rotating-frame integrator by rotating a free trajectory back into the
// inertial frame and checking it comes out STRAIGHT).

import { vec3 } from './math.js';

export const G0 = 9.81; // m/s²

// O'Neill cylinder presets. Each spins so the FLOOR sees `g` gravities.
// ω = √(g·g0 / R). The "hoop" preset is the canonical 8 km / 0.8 g hull from
// research.js; the smaller habitats spin faster, so their Coriolis force is far
// more vivid — handy because at 8 km the effect, while real and measurable, is
// gentle. `len` is the playable axial extent we model (the real cylinders are
// ~32 km long; we model a walkable slice).
export const CYLINDERS = [
  { id: 'hoop',     label: "Hoop · 8 km hull, 0.8 g",       R: 8000, g: 0.8, len: 6000 },
  { id: 'island3',  label: "Island Three · 3.2 km, 1 g",    R: 3200, g: 1.0, len: 5000 },
  { id: 'stanford', label: "Stanford torus · 900 m, 1 g",   R: 900,  g: 1.0, len: 1400 },
  { id: 'oneill1',  label: "Island One · 320 m, 1 g",       R: 320,  g: 1.0, len: 900  },
  { id: 'snug',     label: "Snug ring · 120 m, 1 g (wild Coriolis)", R: 120, g: 1.0, len: 520 },
];

export function makeCylinder(preset) {
  const omega = Math.sqrt((preset.g * G0) / preset.R); // rad/s for floor gravity
  return {
    ...preset,
    omega,
    gFloor: omega * omega * preset.R,    // = preset.g * G0, the floor acceleration
    rimSpeed: omega * preset.R,          // m/s, the hull's tangential velocity
    spinPeriod: (2 * Math.PI) / omega,   // s per revolution
  };
}

// ── body accelerations (the fictitious / real field only — no aerodynamics) ──

// Earth: a uniform field. `out` may alias nothing of `pos/vel`.
export function earthAccel(out) {
  out[0] = 0; out[1] = -G0; out[2] = 0; return out;
}

// Cylinder co-rotating frame. Axis = +Z. Returns centrifugal + Coriolis.
//   a_cf  = ω²·(x, y, 0)
//   a_cor = −2 Ω × v  with Ω=(0,0,ω)  ⇒  (2ω·vy, −2ω·vx, 0)
export function cylinderAccel(out, pos, vel, omega) {
  const w2 = omega * omega;
  out[0] = w2 * pos[0] + 2 * omega * vel[1];
  out[1] = w2 * pos[1] - 2 * omega * vel[0];
  out[2] = 0;
  return out;
}

// Split the cylinder field into its two named parts (for the HUD readout).
export function cylinderForces(pos, vel, omega) {
  const w2 = omega * omega;
  const cf = [w2 * pos[0], w2 * pos[1], 0];                 // outward
  const cor = [2 * omega * vel[1], -2 * omega * vel[0], 0]; // velocity-dependent
  return { cf, cor };
}

// "Down" = the local apparent-gravity direction (unit). Earth: world −Y.
// Cylinder: radially OUTWARD in the X-Y plane (toward the floor under your feet).
export function downDir(out, mode, pos) {
  if (mode === 'cylinder') {
    const r = Math.hypot(pos[0], pos[1]) || 1;
    out[0] = pos[0] / r; out[1] = pos[1] / r; out[2] = 0;
  } else { out[0] = 0; out[1] = -1; out[2] = 0; }
  return out;
}

// ── a free particle (the breadcrumb): only the field + a little air drag ──
// Semi-implicit Euler. dragK is per-second quadratic air resistance.
const _a = [0, 0, 0];
export function stepFreeParticle(p, mode, omega, dt, dragK = 0.02) {
  if (mode === 'cylinder') cylinderAccel(_a, p.pos, p.vel, omega);
  else earthAccel(_a);
  const speed = vec3.len(p.vel);
  _a[0] -= dragK * speed * p.vel[0];
  _a[1] -= dragK * speed * p.vel[1];
  _a[2] -= dragK * speed * p.vel[2];
  vec3.scaleAndAdd(p.vel, p.vel, _a, dt);
  vec3.scaleAndAdd(p.pos, p.pos, p.vel, dt);
  return p;
}

// The conserved quantity in each frame, for the selftest + an honest HUD.
//   Earth:    specific energy  ½|v|² + g0·y
//   Cylinder: the JACOBI integral  ½|v_rot|² − ½ω²(x²+y²)
// Both are invariant for a FREE particle (no drag/thrust). The cylinder one is
// the rigorous statement that "gravity" here is just a rotating frame.
export function invariant(mode, pos, vel, omega) {
  const v2 = vec3.dot(vel, vel);
  if (mode === 'cylinder') {
    return 0.5 * v2 - 0.5 * omega * omega * (pos[0] * pos[0] + pos[1] * pos[1]);
  }
  return 0.5 * v2 + G0 * pos[1];
}

// Map a co-rotating position into the INERTIAL (non-spinning) frame at time t.
// The frame turns by +ωt about Z, so r_inertial = Rz(ωt) · r_rot. Used by the
// selftest to verify a free particle flies STRAIGHT in the inertial frame.
export function toInertial(out, pos, omega, t) {
  const c = Math.cos(omega * t), s = Math.sin(omega * t);
  out[0] = c * pos[0] - s * pos[1];
  out[1] = s * pos[0] + c * pos[1];
  out[2] = pos[2];
  return out;
}
