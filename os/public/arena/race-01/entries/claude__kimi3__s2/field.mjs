// field.mjs — the interior gravity field of INPAC, extracted and fixed.
//
// The old code numerically integrated an electrostatic analogy (attracting
// shell + repelling centreline ring) into a 32×32 LUT. Measured on the shipped
// game, that field REVERSED SIGN near the wall everywhere except the inner
// equator — exactly where you land. For a walking game it was a curiosity;
// for a race it is fatal.
//
// The fix is not a better integration of the wrong model. It is deleting the
// model. Inside a tube there is exactly one direction "down" can mean — away
// from the tube centreline, straight at the nearest wall — and one strength
// profile that is fair to race on: the same everywhere around the tube. So the
// field here is analytic, two lines of math, and correct by construction:
//
//   direction: the unit vector from the centreline to the field point
//   magnitude: constant GRAV, ramped linearly to zero only inside 5% of r so
//              the field is continuous (and finite) on the centreline itself
//
// No lookup table, no integration, no tunable charges. The whole point of the
// old scheme's knobs (GRAV_SCALE, LINE_SCALE) was to chase a field this module
// simply states.
//
// Dependency-free ES module. index.html imports it (with a byte-identical
// inline fallback for file:// pages, where module fetches are CORS-blocked).

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

// Race gravity. Strong enough that jumps are short, committed arcs — you are
// never left floating while the clock runs.
const GRAV = 9.0;

// Acceleration at cylindrical (R, Z), in the (R̂, Ẑ) half-plane.
// geom is { R, r } for the torus being simulated; falls back to `params`.
export function field(R, Z, geom = {}) {
  const R0 = geom.R ?? params.TORUS_R;
  const r0 = geom.r ?? params.TORUS_r;

  const dR = R - R0;
  const dZ = Z;
  const d = Math.sqrt(dR * dR + dZ * dZ);

  // Exactly on the centreline there is no nearest wall; the field is zero
  // there by symmetry, not by singularity.
  if (d < 1e-12) return { gR: 0, gZ: 0 };

  // Constant strength, faded in over the innermost 5% of the tube so the
  // centreline is continuous. Everywhere a player can actually be — standing,
  // landing, or mid-jump — the magnitude is exactly GRAV, so you weigh the
  // same on every wall of the tube. Lap times stop depending on where you
  // happen to be standing.
  const m = GRAV * Math.min(1, d / (0.05 * r0));
  return { gR: (dR / d) * m, gZ: (dZ / d) * m };
}
