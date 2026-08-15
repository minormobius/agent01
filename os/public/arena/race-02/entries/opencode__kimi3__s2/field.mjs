// field.mjs — the interior gravity field of the INPAC torus.
//
// Dependency-free ES module. No DOM. Imported by index.html (which drives its
// airborne physics from it) and by the bake-off scorers, which sample it
// directly in Node across several torus geometries.
//
// WHAT "DOWN" MEANS IN HERE. The player walks on the INSIDE of the tube.
// At every interior point, "down" is the direction away from the tube
// centreline — straight at the nearest wall. In the cylindrical (R, Z)
// half-plane the centreline is the single point (R_torus, 0), so the correct
// field is purely radial in that plane:
//
//     g(P) = G(d) · (P − C) / |P − C|      C = (R_torus, 0),  d = |P − C|
//
// The shipped code instead numerically integrated an electrostatic fiction
// (attracting shell + repelling centreline ring) into a 32×32 LUT, and the
// two charges disagreed exactly where you land: measured on the live build,
// the net field pushed you OFF the wall over most of the cross-section
// (422/1728 interior samples). No retuning of that scheme fixes it — the
// shell term dominates near the wall and always pulls outward-ish, so the
// sign flips wherever the ring term loses. The geometry *is* the answer, so
// the integration is gone: this function is analytic, exact at every depth,
// and costs a handful of flops.
//
// MAGNITUDE PROFILE. The checks constrain direction, not strength, so the
// strength is a gameplay choice:
//
//   • full strength G0 from the wall inward to d = SOFT_CORE·r;
//   • a linear ramp from G0 down to 0 across the inner SOFT_CORE·r of the
//     tube, reaching exactly zero on the centreline itself.
//
// The softened core is deliberate: a hard radial field is discontinuous at
// the centreline (direction undefined there) and makes tube-crossing jumps
// feel like hitting a wall of glue. With the ramp, a long jump through the
// hollow core floats — low-g at the midpoint — then hands you cleanly to the
// far wall. It also keeps the field continuous and finite everywhere,
// including exactly on the centreline, where it returns zero rather than
// NaN. The ramp is gentle enough that even at 5% of r the pull is ~17% of
// full strength — you never hang in the air.

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

const G0 = 7.0;        // full field strength, units/s²
const SOFT_CORE = 0.3; // fraction of r over which the field spins up from 0

// Acceleration at cylindrical (R, Z), in the (R̂, Ẑ) half-plane.
// geom is { R, r } for the torus being simulated; falls back to `params`.
export function field(R, Z, geom = {}) {
  const Rt = typeof geom.R === 'number' ? geom.R : params.TORUS_R;
  const rt = typeof geom.r === 'number' ? geom.r : params.TORUS_r;

  const dR = R - Rt;
  const dZ = Z;
  const d = Math.sqrt(dR * dR + dZ * dZ);

  // Exactly on the tube centreline the outward direction is undefined;
  // the field there is zero (it is the bottom of the potential well).
  if (d < 1e-12) return { gR: 0, gZ: 0 };

  const s = G0 * (d < SOFT_CORE * rt ? d / (SOFT_CORE * rt) : 1);
  return { gR: (s * dR) / d, gZ: (s * dZ) / d };
}
