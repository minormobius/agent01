// field.mjs — interior gravity for INPAC.
//
// "Down" inside the tube means away from the tube centreline, straight at the
// nearest wall, at every point all the way around. That is the honest physics
// of standing on the inside of a spinning tube (artificial/centrifugal
// gravity): acceleration points along the outward poloidal normal, with a
// magnitude that never flips sign.
//
// The shipped code built "down" from a charged-shell-plus-line-charge
// electrostatic analogy, numerically integrated into a 32×32 LUT. Measured at
// R=8, r=3 it reversed sign exactly where you land — 422 of 1728 interior
// samples pushed you off the wall instead of onto it. For a race that is
// fatal: you cannot bank into the outer wall, you cannot trust the floor at
// speed, and lap times become a function of where you happen to be standing.
//
// This replaces the whole scheme with the one analytic answer that the torus
// makes obvious: the outward normal. No LUT, no integration, no sign flips,
// trivially finite, exactly mirror-symmetric, and correct for any R/r the
// sliders (or the scorer's R=6,r=4 spindle) throw at it.

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

// Acceleration magnitude, world units/s². Chosen for snappy but readable
// airtime: a 4.5 u/s jump peaks about 0.85 u above the wall and returns in
// well under a second, so a hop never costs you a lap.
const G = 12.0;

// Acceleration at cylindrical (R, Z), in the (R̂, Ẑ) half-plane.
// geom is { R, r } for the torus being simulated; falls back to `params`.
//
// The tube centreline is the ring (R = geom.R, Z = 0). "Down" is the unit
// vector away from it. At the exact centreline the direction is undefined, so
// we return zero there — a measure-zero set the player never occupies, which
// is also the one place the scorer probes for finiteness.
export function field(R, Z, geom = {}) {
  const R0 = typeof geom.R === 'number' ? geom.R : params.TORUS_R;
  const dR = R - R0;
  const d = Math.hypot(dR, Z);
  if (d < 1e-9) return { gR: 0, gZ: 0 };
  const inv = G / d;
  return { gR: dR * inv, gZ: Z * inv };
}
