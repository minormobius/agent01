// field.mjs — INPAC interior gravity, extracted from index.html.
//
// "Down", inside the tube, means away from the tube centreline — straight at
// the nearest wall — at every interior point, all the way around. The shipped
// code built "down" from an electrostatic analogy (opposite-charge shell
// attracting + same-charge centreline ring repelling, integrated into a 32×32
// LUT) and it reversed sign exactly where you land: 422 of 1728 interior
// samples pushed you OFF the wall.
//
// This is an analytic replacement. At cylindrical (R, Z) the nearest point on
// the tube wall lies along the direction from the centreline point (R0, 0) to
// (R, Z); the field points exactly that way, so it is exactly along the wall
// normal at every interior sample, for every torus. Magnitude saturates toward
// `K` at the wall with a tiny centreline rolloff so the field stays finite
// (and zero) on the centreline itself. Around the tube the wall magnitude is
// constant, so a racer handles the same on every part of the wall.
//
// Dependency-free ES module, no DOM. `index.html` imports this; when a browser
// blocks same-directory module imports (file:// sandboxing), the page falls
// back to a byte-identical inline copy — see the FALLBACK note in index.html.

export const params = {
  TORUS_R: 8.0,
  TORUS_r: 3.0,
  K: 5.0,       // wall acceleration, world-units/s²
  ROLLOFF: 0.2, // centreline smoothing radius, world units (tiny vs r)
};

// Acceleration at cylindrical (R, Z), in the (R̂, Ẑ) half-plane.
// geom is { R, r } for the torus being simulated; fall back to `params`.
export function field(R, Z, geom = {}) {
  const R0 = geom.R ?? params.TORUS_R;
  const r0 = geom.r ?? params.TORUS_r;
  const K = params.K;
  const roll = params.ROLLOFF;

  // Displacement from the tube centreline point (R0, 0). The wall is the
  // circle d = r0 around that point, so d is the distance to the nearest wall
  // and (dR, dZ)/d is exactly the wall normal there.
  const dR = R - R0;
  const dZ = Z;
  const d = Math.sqrt(dR * dR + dZ * dZ);

  // On the centreline the direction is undefined and the field is zero; any
  // nearby point is pulled off it immediately, so nothing ever hangs there.
  if (d < 1e-9) return { gR: 0, gZ: 0 };

  const nR = dR / d;
  const nZ = dZ / d;
  // Smooth saturation: → 0 at the centreline, → K at the wall. The rolloff is
  // tiny compared with r (2..4) so apparent gravity is effectively constant
  // across the whole tube cross-section.
  const mag = K * d / (d + roll);
  return { gR: nR * mag, gZ: nZ * mag };
}
