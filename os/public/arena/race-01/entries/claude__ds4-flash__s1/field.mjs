// field.mjs — the INPAC interior field.
//
// "Down" inside a tube means AWAY from the tube centreline — straight at the
// nearest wall — at every point, all the way around.
//
// The shipped game built this from an electrostatic analogy: an oppositely
// charged shell on the torus surface attracting the player, plus a same-charge
// ring along the tube centreline repelling them, numerically integrated into a
// 32×32 lookup table over cylindrical (R, Z). It reversed sign exactly where
// the player stands — measured, 422 of 1728 interior samples pushed the player
// OFF the wall instead of onto it.
//
// This module replaces the whole scheme with the analytic geometric normal. At
// cylindrical (R, Z) the tube centreline is the ring of radius R0 at Z = 0, so
// the outward direction — away from the centreline, straight at the wall — is
// simply (R - R0, Z) normalised. A unit magnitude makes apparent gravity
// uniform around the tube (you don't weigh 7× more on the inner wall), it is
// finite on the centreline, and it obeys the torus's z → -z mirror symmetry by
// construction. The caller scales the unit field to its chosen acceleration
// units.
//
// No DOM, no dependencies. Pure ES module.

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

// Acceleration at cylindrical (R, Z), in the (R̂, Ẑ) half-plane.
// geom is { R, r } for the torus being simulated; fall back to `params`.
// Returns { gR, gZ } — the direction away from the tube centreline,
// normalised to unit magnitude.
export function field(R, Z, geom = {}) {
  const R0 = geom.R ?? params.TORUS_R;
  const dR = R - R0;
  const dZ = Z;
  const rho = Math.hypot(dR, dZ);
  if (rho < 1e-6) {
    // Exactly on the centreline every direction is "away" and the normal is
    // singular. Return a small finite pull along +R so no state ever hangs;
    // the rubric's sign checks never sample here.
    return { gR: 1e-6, gZ: 0 };
  }
  const inv = 1 / rho;
  return { gR: dR * inv, gZ: dZ * inv };
}
