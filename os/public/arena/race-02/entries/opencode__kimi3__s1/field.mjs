// field.mjs — the interior gravity field of the INPAC torus.
//
// Dependency-free ES module, no DOM. Imported by index.html (which keeps a
// byte-identical inline copy for file:// contexts where module loads are
// CORS-blocked — see the boot comment there) and by the bake-off scorer.
//
// THE FIX. The shipped code built "down" from an electrostatic analogy — an
// attracting shell plus a repelling centreline ring, numerically integrated
// into a 32×32 LUT — and measured samples showed it pushes you OFF the wall
// over most of the cross-section. But inside a tube, "down" is not a field
// that needs simulating: it is a direction that needs stating. At every
// interior point, down is straight away from the tube centreline, at the
// nearest wall. That is exact, analytic, and costs two divisions.
//
// Cylindrical half-plane: a point is (R, Z); the tube centreline is the ring
// (R = TORUS_R, Z = 0). The wall direction is the unit vector of (R−R₀, Z).

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

// Acceleration scale, units/s². Tuned for the race: a 3.4 u/s jump gets ~1 s
// of air and ~0.9 u of apex — a hop that carries your momentum, not a flight.
// Exposed so the page can scale feel without forking the shape of the field.
export const FIELD_STRENGTH = 6.5;

// Acceleration at cylindrical (R, Z), in the (R̂, Ẑ) half-plane.
// geom is { R, r } for the torus being simulated; falls back to `params`.
//
// Direction: exactly along the outward wall normal (R−R₀, Z)/d.
// Magnitude: G · d/(d + 0.2r) — zero smoothly on the centreline (where the
// normal is undefined), ≈0.83G at the wall, independent of poloidal angle, so
// apparent weight never varies around the tube.
export function field(R, Z, geom = {}) {
  const R0 = typeof geom.R === 'number' ? geom.R : params.TORUS_R;
  const r0 = typeof geom.r === 'number' ? geom.r : params.TORUS_r;
  const G = typeof geom.strength === 'number' ? geom.strength : FIELD_STRENGTH;

  const dR = R - R0;
  const d = Math.hypot(dR, Z);
  if (!Number.isFinite(d) || d < 1e-9) return { gR: 0, gZ: 0 };

  const g = (G * d) / (d + 0.2 * r0);
  return { gR: (dR / d) * g, gZ: (Z / d) * g };
}

export default field;
