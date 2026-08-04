// field.mjs — interior gravity field for INPAC RACE.
//
// "Down" on the inside of a torus is, at every point, straight away from the
// tube centreline — toward the nearest wall. The shipped code approximated
// this with an electrostatic analogue (an oppositely-charged shell attracting
// the player plus a same-charge ring on the centreline repelling them,
// numerically integrated into a 32×32 LUT over cylindrical (R, Z)) and it
// reversed sign exactly where you land — 422 of 1728 interior samples pushed
// you OFF the wall.
//
// This is the analytic version of the same sentence: a constant-strength
// field, radial, outward from the centreline in the (R, Z) half-plane.
//
//   • sign      — points at the wall everywhere inside the tube (by definition)
//   • direction — exactly along the wall normal, at every depth
//   • uniformity — the same magnitude on every wall, so a race is fair:
//     you weigh the same at the inner equator, the outer equator and the top
//     of the tube. Lap times are a function of driving, not of where gravity
//     happened to flip.
//   • finite    — zero field exactly on the centreline (direction undefined
//     there); nowhere to divide by zero.
//
// Units: positions are torus-world units (TORUS_R ≈ 8, TORUS_r ≈ 3). The
// returned acceleration has constant magnitude G (default 20 world units/s²).
// A race needs gravity you can trust at speed; a field that varies around the
// tube would re-introduce the very "lap time depends on where you stand"
// failure the LUT caused.

export const params = {
  TORUS_R: 8.0,
  TORUS_r: 3.0,
  G: 20.0,
};

// Acceleration at cylindrical (R, Z), in the (R̂, Ẑ) half-plane.
// geom is { R, r } for the torus being simulated; fall back to "params".
export function field(R, Z, geom = {}) {
  const R0 = geom.R ?? params.TORUS_R;
  const dR = R - R0;
  const dZ = Z;
  const dist = Math.hypot(dR, dZ);
  if (dist < 1e-6) {
    // Exactly on the centreline the direction is undefined (0/0). Return a
    // finite, symmetric zero field so the page never divides by nothing.
    return { gR: 0, gZ: 0 };
  }
  const k = params.G / dist;
  return { gR: dR * k, gZ: dZ * k };
}
