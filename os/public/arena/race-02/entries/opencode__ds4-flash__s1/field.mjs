// field.mjs — interior gravity for INPAC, extracted and fixed.
//
// "Down" inside the tube means AWAY from the tube centreline — straight at
// the nearest wall — at every point. The shipped code computed this as an
// electrostatic shell+line LUT that reversed sign where the player stands.
//
// This is the analytic replacement: gravity is exactly along the outward
// normal from the tube centreline (R0, 0) at every interior point, with a
// gentle magnitude profile — heaviest at the wall, lightest (but never zero)
// on the centreline. The centreline is a liminal place; a small climb up the
// wall should still come back down.
//
// No DOM, no dependencies. `geom` overrides the default torus geometry; the
// caller may pass nothing and get the shipped `params`.

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

const G0 = 6.0; // strength at the wall (tuned to the shipped jump speeds)

export function field(R, Z, geom = {}) {
  const R0 = geom.R ?? params.TORUS_R;
  const r = geom.r ?? params.TORUS_r;

  const dR = R - R0;
  const d = Math.hypot(dR, Z);

  // Weight grows from the centreline out to the wall: 0.55 G0 at the axis,
  // G0 on the floor. Direction is always the outward normal.
  const w = (0.55 + 0.45 * Math.min(1, d / r)) * G0;

  if (d < 1e-9) return { gR: w, gZ: 0 }; // centreline: finite, toward outer wall

  const inv = w / d;
  return { gR: dR * inv, gZ: Z * inv };
}
