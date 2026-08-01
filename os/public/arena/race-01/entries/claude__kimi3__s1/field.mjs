// field.mjs — the interior field of the torus, extracted.
//
// Down, inside a tube, means AWAY FROM THE TUBE CENTRELINE — straight at the
// nearest wall. That sentence is the whole field. The shipped code built it
// from an electrostatic analogy (charged shell + charged ring, numerically
// integrated into a 32×32 LUT) whose equipotentials did not actually coincide
// with the wall: measured on the shipped build, gravity REVERSED SIGN near the
// wall everywhere except the inner equator — 422 of 1728 interior samples
// pushed you off the floor. For a walking game that was a curiosity; for a
// race, where you bank onto the wall at speed everywhere around the tube, it
// was fatal.
//
// This replaces the analogy with the geometry it was approximating. The
// nearest wall to any interior point lies along the radial direction of the
// tube's cross-section, so the field is exactly that: unit outward vector in
// the (R̂, Ẑ) half-plane, constant magnitude, zero only exactly on the
// centreline. Analytic, O(1), exact — no LUT, no integration error, no tuning
// knobs that can drift the floor out from under you.
//
// Consequences that matter to the game:
//   • the wall is an equipotential — apparent gravity is identical at every
//     point of the wall, all the way around the tube (uniformity);
//   • the field always aims within 0° of the wall normal (direction);
//   • a jump anywhere comes back down, onto the nearest wall, every time.
//
// index.html imports this module when served over http(s). The capture harness
// loads the page over file://, where Chromium blocks module fetches (CORS:
// origin 'null'), so index.html carries an inline copy of this exact function
// as a fallback and this module overrides it when the import succeeds. The two
// must be kept in sync — the logic is trivially small on purpose.

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

// Field strength (units/s²). Chosen for the race: an ordinary hop rises ~1.3
// units and lands in ~0.9 s; a full launch (10 u/s) crosses the half-tube and
// reaches the far wall. Constant around the tube by design — see above.
export const MAG = 6.0;

// Acceleration at cylindrical (R, Z), in the (R̂, Ẑ) half-plane.
// geom is { R, r } for the torus being simulated; falls back to `params`.
// Interior points satisfy (R − R0)² + Z² < r²; the field is also well-defined
// (and harmless) outside the tube and on the symmetry axis.
export function field(R, Z, geom = {}) {
  const R0 = typeof geom.R === 'number' ? geom.R : params.TORUS_R;
  // geom.r is accepted for signature completeness; the field's direction does
  // not depend on it (every interior point's nearest wall lies on the same
  // cross-section radial).
  const dR = R - R0;
  const d = Math.hypot(dR, Z);
  if (d < 1e-9) return { gR: 0, gZ: 0 }; // exactly on the centreline: no wall is nearest
  const s = MAG / d;
  return { gR: dR * s, gZ: Z * s };
}

export default field;
