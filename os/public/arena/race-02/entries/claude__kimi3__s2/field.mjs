// field.mjs — the interior gravitational field of the INPAC torus.
//
// The shipped code built "down" from an electrostatic analogy (an attracting
// shell + a repelling centreline ring, numerically integrated into a 32×32 LUT
// over cylindrical (R, Z)). Measured, that field reverses sign near the wall
// everywhere except the inner equator: 422 of 1728 interior samples pushed the
// player OFF the floor. Fine for a walking curiosity, fatal for a race.
//
// The replacement is not a repair of the charge scheme; it is the geometric
// answer the brief states in one sentence: inside a tube, "down" at any point
// is the direction AWAY from the tube centreline — straight at the nearest
// wall. In the (R̂, Ẑ) half-plane the centreline is the circle (R0, 0), so the
// field is exactly radial about it:
//
//     g(R, Z) = g(d) · (R − R0, Z) / d,      d = √((R − R0)² + Z²)
//
// Only the magnitude profile g(d) is a design choice:
//
//   • g ∝ d² from the core makes the tube centreline a true unstable
//     equilibrium — jumps apex into a floaty low-g region and fall back to
//     whichever wall is nearest. Charged jumps across the tube diameter are
//     possible; hops are not.
//   • g at the wall is constant around the whole poloidal circle, so lap
//     times never depend on which side of the tube you are standing on.
//
// The page imports this module over https. The capture harness loads the page
// from file://, where Chromium refuses ALL module fetches (opaque origin), so
// index.html embeds a functionally identical copy of this source behind a
// `location.protocol === 'file:'` guard and imports it via a data: URL.
// If you change this file, change the copy — index.html says the same thing.

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

const G = 14.0;    // field strength at the wall (units/s²)
const CORE = 0.35; // fraction of full strength one third out from the core

export function field(R, Z, geom = {}) {
  const R0 = typeof geom.R === 'number' ? geom.R : params.TORUS_R;
  const r0 = typeof geom.r === 'number' ? geom.r : params.TORUS_r;
  const dR = R - R0;
  const dZ = Z;
  const d = Math.sqrt(dR * dR + dZ * dZ);
  if (d < 1e-9 || !(r0 > 0)) return { gR: 0, gZ: 0 };
  const t = d / r0;
  const g = G * (CORE + (1 - CORE) * t * t);
  return { gR: g * dR / d, gZ: g * dZ / d };
}
