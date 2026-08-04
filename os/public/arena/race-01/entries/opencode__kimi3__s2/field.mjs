// field.mjs — the interior gravity field of the torus tube.
//
// INPAC is played on the INSIDE of the tube, so "down" at any interior point
// is the direction AWAY from the tube centreline — straight at the nearest
// wall — at every point, all the way around. The shipped code approximated
// this with an electrostatic analogy (charged shell + charged ring, numerically
// integrated into a 32×32 LUT) whose field reversed sign near the wall almost
// everywhere except the inner equator. This module replaces that with the
// analytic answer: no lookup table, no integration, no tunable charges.
//
//   direction — exactly the outward wall normal (d from centreline, unitised)
//   magnitude — G at the wall, ramping gently to 0.55·G at the centreline so
//               a dead-centre jump crossing doesn't slingshot; the centreline
//               itself is the one point where "nearest wall" is undefined, and
//               there the field is exactly zero (balanced), never NaN.
//
// Dependency-free ES module, no DOM. Also consumed by the scoring harness.

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

// Acceleration at the wall, units/s². Chosen so a 5 u/s jump rises ~1 unit
// and lands in ~0.8s — brisk enough for a racing line that uses the walls.
export const G = 14.0;

// Acceleration at cylindrical (R, Z), in the (R̂, Ẑ) half-plane.
// geom is { R, r } for the torus being simulated; falls back to `params`.
export function field(R, Z, geom = {}) {
  const Rt = typeof geom.R === 'number' ? geom.R : params.TORUS_R;
  const rt = typeof geom.r === 'number' ? geom.r : params.TORUS_r;
  const dR = R - Rt;
  const dZ = Z;
  const d = Math.hypot(dR, dZ);
  if (!(d > 1e-9)) return { gR: 0, gZ: 0 }; // on the centreline: balanced
  const mag = G * (0.55 + 0.45 * Math.min(1, d / rt));
  const s = mag / d;
  return { gR: dR * s, gZ: dZ * s };
}
