// field.mjs — interior gravity field for the inside of a torus tube.
// "Down" = outward from the tube centreline, toward the nearest wall.
// A simple analytic spring-force field: acceleration ∝ displacement from centreline.

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

/**
 * Acceleration at cylindrical (R, Z), in the (R̂, Ẑ) half-plane.
 * The field points radially outward from the tube centreline —
 * toward the inner surface of the tube, which is "down" inside a tube.
 *
 * @param {number} R cylindrical radial coordinate
 * @param {number} Z height in the half-plane
 * @param {{ R?: number, r?: number }} geom torus geometry, defaults to params
 * @returns {{ gR: number, gZ: number }}
 */
export function field(R, Z, geom = {}) {
  const R0 = geom.R ?? params.TORUS_R;
  const r0 = geom.r ?? params.TORUS_r;
  const dR = R - R0;
  const dZ = Z;
  const k = 2.0;
  return { gR: k * dR, gZ: k * dZ };
}
