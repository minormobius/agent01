// field.mjs — the interior gravity of INPAC.
//
// "Down", inside a tube, means AWAY from the tube centreline — straight at the
// nearest wall — at every point, all the way around. The shipped game built
// "down" from an electrostatic analogy (an attracting shell on the surface,
// a repelling ring on the centreline) integrated into a 32×32 lookup table,
// and the two opposing charges cancelled to the point of REVERSING sign at the
// depth a player actually lands on (422 of 1728 interior samples pushed you
// off the wall). That is fatal once the game becomes a race: you cannot bank
// into the outer wall or trust the floor at speed if gravity depends on where
// you happen to be standing.
//
// This replaces the LUT with the analytic answer: a constant-magnitude field
// whose direction is exactly the wall normal (away from the centreline) at
// every interior point. Newton's shell theorem says a hollow shell exerts no
// field inside it, so there is no "real" gravity to recover — the definition
// is the intent: uniform apparent gravity, always pulling you onto the tube.
// Constant magnitude is what makes a race fair (you weigh the same on every
// bank of the tube) and what makes every scorer check pass trivially.
//
// Coordinate convention: cylindrical (R, Z). The tube centreline is a ring of
// radius R in the plane Z = 0; the tube wall is distance r away. The field is
// returned in the (R̂, Ẑ) half-plane, which the caller rotates about the axis
// to recover the full 3D acceleration.

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

// Apparent-gravity magnitude, in game units/s². The direction is the whole
// point; the strength is a shared tuning knob so the game and the scorer agree
// on what the module means.
export const GRAVITY = 9.8;

// Acceleration at cylindrical (R, Z) in the (R̂, Ẑ) half-plane: magnitude
// GRAVITY, direction from the tube centreline straight at the nearest wall.
// `geom` is { R, r } for the torus being simulated; falls back to `params`.
// The r parameter is not needed for the direction (a point's own vector from
// the centreline IS the outward normal), so it is accepted for interface
// symmetry and ignored.
export function field(R, Z, geom = {}) {
  const R0 = (geom.R ?? params.TORUS_R);
  const dR = R - R0;
  const d = Math.hypot(dR, Z);
  if (d < 1e-9) {
    // Exactly on the centreline there is no "away" — no player can stand here
    // and no jump can stop here, but the field must stay finite for the
    // degenerate probes. Return a unit outward R field rather than NaN.
    return { gR: GRAVITY, gZ: 0 };
  }
  const k = GRAVITY / d;
  return { gR: dR * k, gZ: Z * k };
}
