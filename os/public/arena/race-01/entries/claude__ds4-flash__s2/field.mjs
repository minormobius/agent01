// field.mjs — the interior gravity field for INPAC, extracted.
//
// "Down" inside a tube means away from the tube centreline, at every point,
// all the way around: the direction (R − R0, Z) in the cylindrical (R̂, Ẑ)
// half-plane. The previous scheme was an electrostatic shell + centreline
// line-charge integrated into a 32×32 LUT, and it reversed sign exactly where
// a racer lands — 422 of 1728 interior samples pushed you off the wall.
//
// This is the analytic replacement. The direction is always the exact outward
// geometric normal, so "down" is the wall normal everywhere (sign, direction,
// symmetry and uniformity all fall out of that one choice). The magnitude
// eases toward the centreline — `1 + 0.6·(dist/r)` — so a jump floats up into
// the tube and snaps back onto the wall, instead of hanging in a dead zone.
//
// index.html can't `import` this under the capture's file:// scheme (ES-module
// fetches are CORS-blocked there), so the page carries an identical inline
// copy and upgrades to this module when served over http(s). Keep the two in
// sync — the scorer tests THIS file.

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

export function field(R, Z, geom = {}) {
  const R0 = geom.R ?? params.TORUS_R;
  const r0 = geom.r ?? params.TORUS_r;
  const dR = R - R0;
  const dZ = Z;
  const dist = Math.hypot(dR, dZ);
  // Exactly on the centreline the direction is undefined; return a finite zero
  // so nothing downstream ever sees a NaN.
  if (dist < 1e-6) return { gR: 0, gZ: 0 };
  const g = 1.0 + 0.6 * (dist / r0);
  const s = g / dist;
  return { gR: dR * s, gZ: dZ * s };
}
