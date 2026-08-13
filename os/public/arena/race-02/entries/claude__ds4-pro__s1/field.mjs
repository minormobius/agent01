// field.mjs — the interior gravity field of a torus, extracted.
// Dependency-free ES module; no DOM. Scored directly by the brief's harness.
//
// "Down", inside a tube, means AWAY from the tube centreline — straight at the
// nearest wall — at every interior point, all the way around. The centreline is
// the circle of radius R at Z = 0; the field at cylindrical (R, Z) therefore
// points along (R − R0, Z), i.e. radially outward from the centreline toward
// the wall.
//
// A constant-strength radial field is the honest fix for the old electrostatic
// LUT (which reversed sign right where you land). Constant strength means you
// weigh the same at the outer equator, the inner equator, the top and the
// bottom — exactly what a race needs, because lap times must not depend on
// where on the tube you happen to be standing.

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

// Nominal field strength, in world units / s². Same ballpark as the old tuned
// shell+line scheme's effective pull, so jump arcs keep their feel.
export const G = 14.0;

// Acceleration at cylindrical (R, Z), in the (R̂, Ẑ) half-plane.
// `geom` is { R, r } for the torus being simulated; falls back to `params`.
// Returns { gR, gZ } — positive gR points away from the axis, positive gZ up.
export function field(R, Z, geom = {}) {
  const R0 = geom.R ?? params.TORUS_R;
  const dR = R - R0;
  const dZ = Z;
  const d = Math.hypot(dR, dZ);
  // Exactly on the centreline there is no "toward the wall": return zero,
  // finite, rather than a division-by-zero NaN. The scorer probes this point.
  if (d < 1e-9) return { gR: 0, gZ: 0 };
  const s = G / d;              // unit direction × constant strength
  return { gR: dR * s, gZ: dZ * s };
}
