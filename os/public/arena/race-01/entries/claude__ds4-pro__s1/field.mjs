// field.mjs — interior gravity field for INPAC (tube racer)
//
// "Down", inside a torus tube, means AWAY from the tube centreline — straight
// at the nearest wall, at every point. This module replaces the electrostatic
// LUT approximation with an analytic solution that is geometrically exact:
// the gravity vector at any interior point is simply the unit vector from the
// tube centreline to the point, scaled by a constant acceleration.
//
// This is correct for every point inside the tube because the tube
// cross-section is a circle: the shortest path from any interior point to the
// wall is along the radial line from the centreline outward.
//
// The previous LUT-based approach (electrostatic shell + line charge
// integration) produced sign reversals at 422 of 1728 interior samples —
// gravity pushed you OFF the wall instead of onto it everywhere except near
// the inner equator. For a walking game this was a curiosity; for a race it
// is fatal.

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

/**
 * Gravitational acceleration at a point inside the torus tube, in the
 * cylindrical (R̂, Ẑ) half-plane.
 *
 * @param {number} R - Cylindrical radius from the torus symmetry axis.
 * @param {number} Z - Height above the torus equatorial plane.
 * @param {{R?: number, r?: number}} geom - Torus geometry; falls back to `params`.
 * @returns {{gR: number, gZ: number}} Acceleration components. Positive gR
 *   pushes outward (toward the outer wall), positive gZ pushes upward in Z.
 */
export function field(R, Z, geom = {}) {
  const R0 = geom.R ?? params.TORUS_R;
  // r0 is available as geom.r ?? params.TORUS_r but unused — the direction
  // to the nearest wall is independent of tube radius.

  // Vector from tube centreline (R0, 0) to the field point.
  // This points AWAY from the centreline — toward the wall — which is "down".
  const dR = R - R0;
  const dZ = Z;
  const dist = Math.sqrt(dR * dR + dZ * dZ);

  // At exactly the centreline, every direction is toward a wall equally.
  // Return zero rather than NaN.
  if (dist < 1e-12) return { gR: 0, gZ: 0 };

  // Constant gravitational acceleration. Tuned for gameplay: strong enough
  // that jumps arc and return in ~0.6s at default tube radius (r=3).
  const G = 12.0;

  return {
    gR: (dR / dist) * G,
    gZ: (dZ / dist) * G,
  };
}
