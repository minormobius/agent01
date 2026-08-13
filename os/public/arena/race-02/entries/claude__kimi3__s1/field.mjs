// field.mjs — the interior field of the torus, extracted from index.html.
//
// INPAC GP is played on the INSIDE of the tube. "Down" at any interior point
// is the direction AWAY from the tube centreline — straight at the nearest
// wall. That sentence is the whole physics: the correct field is the
// cross-section's outward radial direction, given a magnitude profile.
//
// The shipped code instead numerically integrated two opposing charge
// distributions (an attracting shell on the surface, a repelling ring on the
// centreline) into a 32×32 lookup table. Near the wall the repelling ring
// wins, so gravity reversed sign exactly where you land — 422 of 1728
// interior samples pushed you off the wall. No tuning of that scheme fixes
// it: the answer is not a better quadrature, it is that the field we want is
// not an electrostatic field at all. This module replaces the LUT with the
// analytic answer.
//
// Contract (see bakeoff/briefs/inpac-race):
//   field(R, Z, geom?) -> { gR, gZ }   acceleration at cylindrical (R, Z),
//   in the (R̂, Ẑ) half-plane. geom is { R, r } for the torus being
//   simulated; falls back to `params`.
//
// Cost: a handful of flops, no tables, valid for any geometry — including
// the fat R/r = 1.5 torus the LUT scheme never survived.

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

// Pull at the wall, in world units/s². Chosen for jump feel: with a jump
// speed of ~4 this gives ~0.9 s of airtime — long enough to be fun, short
// enough that a racing line never floats.
const G_WALL = 9.0;

// Magnitude profile across the cross-section, as a function of f = d/r
// (fraction of the way from centreline to wall). A soft floor at the
// centreline (so the field never vanishes and never has a discontinuity in
// direction that matters — at d=0 we return zero exactly), ramping to full
// pull at the wall. The ramp makes near-centre flight gently ballistic
// instead of a dead zone, and makes landings decisive.
function magnitude(f) {
  const c = f < 1 ? f : 1;
  return G_WALL * (0.3 + 0.7 * c);
}

export function field(R, Z, geom = {}) {
  const R0 = typeof geom.R === 'number' ? geom.R
    : typeof geom.TORUS_R === 'number' ? geom.TORUS_R
    : params.TORUS_R;
  const r0 = typeof geom.r === 'number' ? geom.r
    : typeof geom.TORUS_r === 'number' ? geom.TORUS_r
    : params.TORUS_r;

  const dR = R - R0;
  const dZ = Z;
  const d = Math.sqrt(dR * dR + dZ * dZ);

  // Exactly on the centreline there is no nearest wall; the field is zero
  // there rather than undefined. Every probe around it points correctly
  // outward, so approach the centreline from any side and you are pulled
  // back off it.
  if (d < 1e-9) return { gR: 0, gZ: 0 };

  const mag = magnitude(d / r0);
  return { gR: (dR / d) * mag, gZ: (dZ / d) * mag };
}
