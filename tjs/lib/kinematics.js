// kinematics.js — HBot / CoreXY belt kinematics for the gantry plane.
//
// An HBot drives the X-Y plane with two STATIONARY steppers (A and B) and a
// single belt routed in an "H". Both motors move for any motion; the mapping is
// the CoreXY transform. Belt displacement of each motor (in mm of belt travel):
//
//     a = x + y            x = (a + b) / 2
//     b = x - y            y = (a - b) / 2
//
// The same linear transform carries velocity and acceleration. The consequence
// that makes this worth simulating: a pure +X move spins A and B the same way;
// a pure +Y move spins them opposite; a 45° diagonal puts the ENTIRE demand on
// one motor (a = x+y, the other belt barely moves). So the "easy" diagonal is
// where a motor stalls first — exactly the thing the scope is here to reveal.
//
// HBot (vs symmetric CoreXY) additionally suffers a frame-RACKING moment: the
// two belt spans act on the moving gantry at different heights/offsets, so a
// tension imbalance yaws the gantry beam. We surface that as a readout too.
//
// Pure module — no DOM, no three.js.

export const GRAVITY = 9.81; // m/s²

// Cartesian (x, y) -> belt travel (a, b) in the same length units.
export function ikBelt(x, y) {
  return { a: x + y, b: x - y };
}
// Belt travel (a, b) -> Cartesian (x, y).
export function fkCart(a, b) {
  return { x: (a + b) / 2, y: (a - b) / 2 };
}

// Map a Cartesian kinematic sample (vel/accel) onto the two belt motors. Returns
// belt-space scalars for each motor; combine with pulley radius for rotor units.
export function beltMotion(cart) {
  // cart: { vx, vy, ax, ay }
  return {
    A: { v: cart.vx + cart.vy, a: cart.ax + cart.ay },
    B: { v: cart.vx - cart.vy, a: cart.ax - cart.ay },
  };
}

// Belt linear motion (mm, mm/s, mm/s²) -> motor rotor motion through a pulley of
// pitch radius r (mm). Returns rev, rad/s, rad/s².
export function beltToRotor(linear, rPulleyMm) {
  const r = rPulleyMm;
  return {
    theta: linear.p !== undefined ? linear.p / r : undefined, // rad
    omega: linear.v / r,   // rad/s
    alpha: linear.a / r,   // rad/s²
  };
}

// Coupled belt forces from the two Cartesian inertial demands. With Fx = Mx*ax
// and Fy = My*ay (Cartesian net force needed), the belt forces dual the position
// map:  F_A = (Fx + Fy)/2,  F_B = (Fx - Fy)/2.  Each motor's belt force is what
// it must deliver at the pulley on top of spinning its own rotor inertia.
export function beltForces(Fx, Fy) {
  return { A: (Fx + Fy) / 2, B: (Fx - Fy) / 2 };
}

// HBot frame-racking moment: the imbalance between the two belt tensions, times
// the gantry span, is the yaw torque trying to skew the moving beam (N·m).
// `spanMm` is the distance between the two belt runs on the gantry.
export function rackingMoment(F_A, F_B, spanMm) {
  return Math.abs(F_A - F_B) * (spanMm / 1000);
}

// Lead-screw axis (Z): linear motion -> rotor motion. lead = mm advanced per rev.
export function screwToRotor(linear, leadMm) {
  const k = (2 * Math.PI) / leadMm; // rad per mm
  return {
    theta: linear.p !== undefined ? linear.p * k : undefined,
    omega: linear.v * k,
    alpha: linear.a * k,
  };
}

// Reflected inertia of a linear mass M (kg) seen at the rotor.
//   belt drive:  J = M * r²              (r in metres)
//   lead screw:  J = M * (lead / 2π)²    (lead in metres)
export function reflectedInertiaBelt(massKg, rMm) {
  const r = rMm / 1000;
  return massKg * r * r;
}
export function reflectedInertiaScrew(massKg, leadMm) {
  const l = (leadMm / 1000) / (2 * Math.PI);
  return massKg * l * l;
}

if (typeof globalThis !== 'undefined') {
  globalThis.KINEMATICS = {
    ikBelt, fkCart, beltMotion, beltToRotor, beltForces, rackingMoment,
    screwToRotor, reflectedInertiaBelt, reflectedInertiaScrew, GRAVITY,
  };
}
