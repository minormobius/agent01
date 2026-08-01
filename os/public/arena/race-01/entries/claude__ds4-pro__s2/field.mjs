// field.mjs — interior gravity for a torus tube.
// Dependency-free ES module. No DOM, no imports.
//
// "Down", inside a tube, means AWAY from the tube centreline — straight at the
// nearest wall — at every point, all the way around. This module computes that
// field analytically: the gravity vector always points away from the centreline
// ring, which is the geometric outward normal of the tube cross-section.
//
// Strength is a constant base plus a linear term proportional to distance from
// the wall, so the field is smooth, never reverses sign inside the tube, and
// remains strong enough to pull a jumping player back to the wall quickly.

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

// ── tunables ──────────────────────────────────────────────────────────
// These are hardcoded rather than param'd because the brief asks for a race,
// not a physics sandbox. Tune here and reload.
const GRAVITY_BASE = 8.0;   // constant pull (N/kg) — present even at the wall
const GRAVITY_DEPTH = 8.0;  // extra pull proportional to (depth / r₀)

// ── field ─────────────────────────────────────────────────────────────
// Acceleration at cylindrical coordinates (R, Z) in the (R̂, Ẑ) half-plane.
// R  — radial distance from the torus's central symmetry axis
// Z  — height above/below the equatorial plane
// geom — { R, r } for the torus being simulated; falls back to `params`.
//
// Returns { gR, gZ } where positive gR points away from the central axis and
// positive gZ points upward. The vector always points away from the tube
// centreline (the ring at R = geom.R, Z = 0), which is the geometric outward
// normal — "down" for someone standing on the inside of the tube.
export function field(R, Z, geom = {}) {
  const R0 = geom.R ?? params.TORUS_R;
  const r0 = geom.r ?? params.TORUS_r;

  // Vector from tube centreline to the field point.
  const dR = R - R0;
  const dZ = Z;

  // Distance from the centreline ring.
  const dist = Math.hypot(dR, dZ);

  // On the centreline the direction is undefined; return zero.
  if (dist < 1e-12) return { gR: 0, gZ: 0 };

  // Unit vector pointing away from centreline = toward the nearest wall.
  const nR = dR / dist;
  const nZ = dZ / dist;

  // Depth: positive inside the tube, zero at the wall, negative outside.
  // Strength is always ≥ GRAVITY_BASE inside the tube; it rises linearly
  // toward the centreline so a deep jump feels a firm pull back.
  const depth = r0 - dist;
  const strength = GRAVITY_BASE + GRAVITY_DEPTH * Math.max(0, depth) / r0;

  return { gR: nR * strength, gZ: nZ * strength };
}
