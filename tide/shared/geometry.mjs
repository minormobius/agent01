// biome/shared/geometry.mjs — the canonical cylinder, one source of truth.
//
// "Draw the geometry right." Every spatial module (the radial atmosphere, the fountain
// cross-section, the light budget) keys off these numbers, so they live in one place:
//
//   habitat surface   R_hab  = 8 km   — the vegetated inner wall: max gravity, the
//                                        atmosphere's rim, where the fountain launches.
//   foam rind         8 → 9 km        — 1 km of structural foam (insulator + shielding).
//   outer skin        R_out  = 10 km  — the radiator surface that dumps heat to space.
//
// Spun for 1 g at the OUTER radius (a deliberate choice — see below), so the habitat floor
// at 8 km sits at a comfortable ~0.8 g and the spin rate ω is lower (≈0.031 rad/s, 430×
// Earth). Lower ω is easier on the structure AND on the fountain: the speed to throw water
// clear across the bore drops with ω, and 0.8 g is a pleasant floor. A cylinder this big
// still has a LARGE thermodynamic span — ~31 K adiabat axis→floor and a ~31% pressure drop.
//
// Pure data + tiny helpers, zero-dep.

const R_hab = 8000, R_out = 10000, g0 = 9.81;
const gravityRefRadius = R_out;                 // put 1 g at the outer radius, not the floor
const omega = Math.sqrt(g0 / gravityRefRadius);

export const CYLINDER = {
  R_hab,                          // habitat / canopy floor (the air column's outer wall), m
  rindInner: 8000,                // foam rind inner face, m
  rindOuter: 9000,                // foam rind outer face, m (1 km of foam)
  R_out,                          // outer skin / radiator, m
  g0,                             // the design 1 g, placed at gravityRefRadius
  gravityRefRadius,               // radius at which gravity equals exactly 1 g
  omega,                          // spin rate (≈0.031 rad/s)
  gFloor: omega * omega * R_hab,  // actual gravity at the 8 km floor (≈0.80 g)
  foam: { k: 0.03, rho: 60 },     // foam rind: thermal conductivity (W/m/K), density (kg/m³)
};

// spin rate for gravity g at radius R
export const omegaFor = (g, R) => Math.sqrt(g / R);
// the speed that just reaches the axis from radius R (climbs the full centrifugal potential)
export const axisReachSpeed = (omega, R) => omega * R;

export default CYLINDER;

