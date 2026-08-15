// field.mjs — interior gravity of a torus tube.
//
// "Down", inside a tube, means AWAY from the tube centreline — straight at the
// nearest wall — at every point, all the way around. The tube centreline is the
// circle (R = R0, Z = 0) in the (R̂, Ẑ) half-plane, so the correct direction at
// any interior point is the unit vector from the centreline through the point.
//
// The shipped code built "down" from an electrostatic analogy (a charged shell
// on the torus surface plus a same-charge ring on the centreline), numerically
// integrated into a 32×32 lookup table. It reverses sign exactly where the
// player lands: 422 of 1728 interior samples pushed you off the wall instead of
// onto it. This file replaces that with the geometric normal the grounded
// camera was already using, now used by the integrator too — so "down" is right
// while airborne, which is the only place the field is actually integrated.
//
// Dependency-free: no DOM, no imports. `field` runs 8× per physics frame, so it
// is a handful of arithmetic ops and nothing else.

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

// Gravity strength, world units/s². Constant across the tube so the floor is
// uniform: you weigh the same standing on the outer equator as on the inner
// one, and the field is never so weak that a jump hangs.
const GRAVITY = 22.0;

// Acceleration at cylindrical (R, Z), in the (R̂, Ẑ) half-plane.
// `geom` is { R, r } for the torus being simulated; falls back to `params`.
export function field(R, Z, geom = {}) {
  const R0 = geom.R ?? params.TORUS_R;
  const dR = R - R0;
  const dZ = Z;
  const dist = Math.hypot(dR, dZ);
  if (dist < 1e-9) return { gR: 0, gZ: 0 }; // exact centreline: no "down" is defined
  return { gR: (dR / dist) * GRAVITY, gZ: (dZ / dist) * GRAVITY };
}
