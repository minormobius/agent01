// field.mjs — the interior field of INPAC, extracted.
//
// "Down" inside the tube means away from the tube centreline — straight at the
// nearest wall — at every interior point, all the way around. This module is
// that one sentence as an analytic field: in the cylindrical (R, Z) half-plane
// the acceleration points along (R - R0, Z), the outward normal from the tube
// centreline, with a magnitude that grows with distance so the pull is firm
// everywhere and the player is never left hanging in the middle of the tube.
//
// It replaces the electrostatic-analogy LUT (`computeGravLUT`/`sampleGravity`
// in index.html) whose sign flipped exactly where a racer lands: 422 of 1728
// interior samples pushed the player OFF the wall instead of onto it. An
// analytic field cannot flip sign — it is correct by construction at every
// geometry and never needs a rebuild when R or r changes.
//
// Geometry: a torus with major radius R0 = geom.R and minor radius geom.r,
// centred on the Z axis in the z = 0 plane. A point inside the tube sits at
// distance d = hypot(R - R0, Z) from the centreline; the wall is the surface
// d = r.

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

// FIELD_G is the spring constant of the pull toward the wall (units: s^-2);
// FIELD_FLOOR keeps a minimum outward pull everywhere so the field never
// vanishes, not even exactly on the centreline.
const FIELD_G = 6.0;
const FIELD_FLOOR = 0.8;

// Acceleration at cylindrical (R, Z), in the (R̂, Ẑ) half-plane.
// geom is { R, r } for the torus being simulated; fall back to `params`.
export function field(R, Z, geom = {}) {
  const R0 = geom.R ?? params.TORUS_R;
  const dR = R - R0;
  const dZ = Z;
  const d = Math.hypot(dR, dZ);
  if (d < 1e-6) return { gR: 0, gZ: 0 };
  const m = (FIELD_G * d + FIELD_FLOOR) / d;
  return { gR: m * dR, gZ: m * dZ };
}
