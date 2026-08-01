export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

export function field(R, Z, geom = {}) {
  const R0 = geom.R ?? params.TORUS_R;
  const r0 = geom.r ?? params.TORUS_r;

  const dR = R - R0;
  const dZ = Z;
  const dist = Math.sqrt(dR * dR + dZ * dZ);

  if (dist < 1e-9) return { gR: 0, gZ: 0 };

  // Linear radial field from tube centreline: zero at centre, strongest at wall.
  // Direction is radially outward from the centreline — toward the interior
  // surface at every interior point.
  const G = 6.0;
  const mag = G * (dist / r0);
  return { gR: mag * dR / dist, gZ: mag * dZ / dist };
}
