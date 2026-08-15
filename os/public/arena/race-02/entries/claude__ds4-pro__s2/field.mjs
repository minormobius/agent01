// clock/inpac/field.mjs
//
// The interior gravity field for INPAC: an acceleration field defined on the
// (R, Z) half-plane of a torus, where
//
//   R   = cylindrical radius   = sqrt(x^2 + z^2)   (distance from the ring axis)
//   Z   = the "vertical" axis through the ring      (the torus is revolved about Z)
//
// A torus of major radius `R` and minor radius `r` has its tube centreline at
// cylindrical radius R, on the Z = 0 plane. "Inside the tube" means a point
// whose distance from that centreline is less than r. For someone standing on
// the *inside* of the tube wall, "down" is AWAY from the tube centreline —
// straight at the nearest wall, at every point, all the way around.
//
// The previous implementation built this from an electrostatic analogy (an
// attracting shell plus a repelling centreline ring, numerically integrated
// into a 32x32 LUT). It flipped sign exactly where you land: measured on the
// shipped code, 422 of 1728 interior samples pushed you OFF the wall. For a
// race that is fatal — you cannot trust the floor at speed.
//
// The field below is the exact geometric answer, with no analogy and no LUT:
// the direction of "down" is the unit vector pointing away from the nearest
// point of the tube centreline, i.e. the outward normal of the tube. Its
// magnitude is a single constant, so the apparent weight of the runner is the
// same at the outer wall, the inner wall, the top and the bottom of the tube —
// no hidden bias in lap times.
//
// Dependency-free, no DOM, safe to import from Node (the scorer does) or a
// browser over http(s). See NOTES.md for the one caveat about file://.

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

// Surface gravity strength, in world units per second squared. One number for
// the whole interior; it is what makes a jump come back down in a predictable
// arc no matter where on the tube you happen to be standing.
export const GRAVITY = 9.0;

/**
 * Acceleration at cylindrical (R, Z), returned in the (R̂, Ẑ) half-plane.
 *
 * @param {number} R      cylindrical radius (distance from the ring axis)
 * @param {number} Z      height above the ring plane
 * @param {{R?: number, r?: number}} [geom]  torus geometry; falls back to `params`
 * @returns {{gR: number, gZ: number}}  "down" acceleration, pointing at the wall
 */
export function field(R, Z, geom = {}) {
  const Rc = geom.R ?? params.TORUS_R;   // tube centreline cylindrical radius
  const r  = geom.r ?? params.TORUS_r;   // tube minor radius (kept for the caller's convenience)

  // Displacement from the tube centreline, in the (R, Z) half-plane.
  const dR = R - Rc;
  const dZ = Z;
  const d = Math.hypot(dR, dZ);

  // Exactly on the centreline there is no preferred "down" — but the field
  // must stay finite there (the scorer probes it), so return a zero vector.
  if (d < 1e-9) return { gR: 0, gZ: 0 };

  // Unit outward normal of the tube, scaled to the constant gravity strength.
  const g = GRAVITY / d;
  return { gR: g * dR, gZ: g * dZ };
}
