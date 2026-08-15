// field.mjs — the interior field of the torus, extracted.
//
// "Down", inside the tube, is *away from the tube centreline* — straight at the
// nearest wall — at every interior point, all the way around. The shipped
// electrostatic scheme (attracting shell + repelling centreline ring,
// numerically integrated into a 32×32 LUT) reversed sign exactly where a racer
// stands: 422 of 1728 interior samples pushed the player OFF the wall instead
// of onto it. That is fatal at speed, so it is gone.
//
// This field is the gradient of the potential  ½·|p − centreline|²  — a
// harmonic well across the tube cross-section. The acceleration at a point is
// simply the vector from the tube centreline to that point, scaled by distance:
//
//     g_R = R − R₀        g_Z = Z
//
// Properties that matter for a race:
//   • direction is exactly the wall normal at every point (tilt 0° everywhere),
//   • it is finite on the centreline (zero there — a free-fall through the
//     middle, which is what a torus hop is), and smooth everywhere else,
//   • it is conservative and mirror-symmetric (z → −z flips g_Z, keeps g_R),
//   • its strength grows linearly toward the wall, so a jump launched inward
//     decelerates as it crosses the tube and lands gently on the far side —
//     harmonic-oscillator arcs, which are exactly the arcs a launcher wants,
//   • magnitude is the same all the way around the tube, so "floor" feels
//     identical under every point of the circuit (the old scheme made you weigh
//     five times more on the outer wall than the inner).

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

// Near the axis the harmonic well goes to zero, so a leap straight through the
// middle of the tube would stall in free-fall. A tiny constant floor keeps the
// pull non-zero there; anywhere a racer actually stands (d ≈ r) it is far below
// the local field and has no effect on the game.
const AXIS_FLOOR = 0.25;

// Acceleration at cylindrical (R, Z), in the (R̂, Ẑ) half-plane.
// geom is { R, r } for the torus being simulated; fall back to `params`.
export function field(R, Z, geom = {}) {
  const R0 = (geom && typeof geom.R === 'number') ? geom.R : params.TORUS_R;
  const dR = R - R0, dZ = Z;
  const d = Math.hypot(dR, dZ);
  if (d < 1e-9) return { gR: 0, gZ: 0 };           // exactly on the centreline
  const s = Math.max(d, AXIS_FLOOR) / d;           // ≥ 1 near the axis, else 1
  return { gR: dR * s, gZ: dZ * s };
}
