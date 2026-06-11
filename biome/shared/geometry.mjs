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
// Spun for 1 g at the habitat wall ⇒ ω ≈ 0.035 rad/s (480× Earth). A cylinder this big
// has a LARGE thermodynamic span — ~39 K adiabat axis→rim and a ~37% pressure drop — far
// more than the ~16 K / 17% of an Island-Three-scale (3.2 km) habitat. Bigger barrel,
// thinner colder axis.
//
// Pure data + tiny helpers, zero-dep.

const R_hab = 8000, g0 = 9.81;

export const CYLINDER = {
  R_hab,                          // habitat / canopy inner surface, m (gravity ref, atmosphere rim)
  rindInner: 8000,                // foam rind inner face, m
  rindOuter: 9000,                // foam rind outer face, m (1 km of foam)
  R_out: 10000,                   // outer skin / radiator, m
  g0,                             // design gravity at the habitat wall (1 g)
  omega: Math.sqrt(g0 / R_hab),   // spin rate for 1 g at R_hab (≈0.035 rad/s)
  foam: { k: 0.03, rho: 60 },     // foam rind: thermal conductivity (W/m/K), density (kg/m³)
};

// spin rate for gravity g at radius R
export const omegaFor = (g, R) => Math.sqrt(g / R);
// the speed that just reaches the axis from the rim (climbs the full centrifugal potential)
export const axisReachSpeed = (omega, R) => omega * R;

export default CYLINDER;
