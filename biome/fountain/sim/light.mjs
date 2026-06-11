// biome/fountain/sim/light.mjs — the luminous-flux budget for the axial sun.
//
// The sun is a LINE on the axis, so its irradiance falls as 1/r (not 1/r²): the same
// luminous power spreads over the cylinder wall 2πr per unit length. To flood the rim
// canopy with daylight you must pour an enormous line power down the axis — and almost
// all of it lands as heat the shell has to radiate. This module makes "a LOT of light"
// a number, and ties it to the food Module 1 actually needs.
//
// Conventions: "1 sun" = 1000 W/m² total surface irradiance (bright clear day). PAR is
// the ~45% that plants use; PPFD is its photon flux. Pure, zero-dep, deterministic.
//
// The heat closure is geometric and it's the punchline: light is absorbed at the habitat
// wall (R_hab = 8 km) but radiated from the larger outer skin (R_out = 10 km), and it
// CANNOT conduct out through the 1 km foam rind (the conductive ΔT is millions of K), so
// it must be actively pumped to the radiator. The radiator's own equilibrium temperature
// is set by the outer area — and at half a sun it's a benign ~24 °C.

import { CYLINDER } from '../../shared/geometry.mjs';

export const SUN_WM2 = 1000;           // total surface irradiance of "1 sun", W/m²
export const PAR_FRACTION = 0.45;      // fraction of solar-spectrum irradiance that is PAR
export const UMOL_PER_J_PAR = 4.57;    // µmol photons per joule of PAR (daylight spectrum)
export const LUM_EFFICACY = 105;       // luminous efficacy of daylight, lm/W (total spectrum)
export const SIGMA = 5.670374e-8;      // Stefan–Boltzmann, W/m²/K⁴
const KCAL_J = 4184;

// Line source on the axis: irradiance at radius r from a line power of `linePower` W per
// metre of cylinder length. E = linePower / (2πr).
export const irradianceAtRadius = (linePower, r) => linePower / (2 * Math.PI * r);
// Inverse: line power (W/m of length) to deliver irradiance E at radius R.
export const linePowerForIrradiance = (E, R) => E * 2 * Math.PI * R;

// PAR ↔ PPFD (photosynthetic photon flux density, µmol/m²/s) ↔ "suns".
export const ppfdFromPAR = (E_par) => E_par * UMOL_PER_J_PAR;
export const parFromPPFD = (ppfd) => ppfd / UMOL_PER_J_PAR;
export const sunsToIrradiance = (suns) => suns * SUN_WM2;
export const irradianceToSuns = (E) => E / SUN_WM2;

// Minimum radiant power (W) to GROW the crew's food, from Module 1's calorie demand.
// overallEfficiency = light→harvestable-chemical-energy (good intensive crops ≈ 1.5–3% of
// total incident). This is the floor; you light far more to cover area.
export function foodLightFloor({ crew = 100, kcalPerDay = 2550, overallEfficiency = 0.02 } = {}) {
  const foodPower_W = (crew * kcalPerDay * KCAL_J) / 86400;   // continuous chemical power in food
  return { foodPower_W, minLightPower_W: foodPower_W / overallEfficiency, overallEfficiency };
}

// The full budget for flooding the habitat canopy at a target light level.
//   target:  { suns } OR { ppfd } OR { E_total }     (one of)
//   R_hab:   habitat wall radius where light is absorbed (m)
//   R_out:   outer radiator radius where heat leaves (m)
//   rindInner/rindOuter: foam rind faces (m); foamK: rind conductivity (W/m/K)
//   L:       cylinder length to power (m); emissivity: radiator emissivity
export function budget({ suns, ppfd, E_total,
  R_hab = CYLINDER.R_hab, R_out = CYLINDER.R_out,
  rindInner = CYLINDER.rindInner, rindOuter = CYLINDER.rindOuter, foamK = CYLINDER.foam.k,
  L = 1000, emissivity = 0.9, food = {} } = {}) {
  // resolve the requested habitat-wall irradiance
  let E = E_total;
  if (E == null && ppfd != null) E = parFromPPFD(ppfd) / PAR_FRACTION;   // total from PAR target
  if (E == null && suns != null) E = sunsToIrradiance(suns);
  if (E == null) E = SUN_WM2;
  const E_par = E * PAR_FRACTION;
  const ppfdOut = ppfdFromPAR(E_par);

  const linePower = linePowerForIrradiance(E, R_hab);      // W per metre of length (the axial lamp)
  const total = linePower * L;                             // W for the whole lit length
  const lux = E * LUM_EFFICACY;                            // illuminance at the habitat wall

  // Heat closure. All absorbed light becomes heat = linePower per metre of length. It is
  // radiated from the OUTER skin (area 2πR_out per metre), so the radiator equilibrium is
  //   εσT⁴ · 2πR_out = linePower   ⇒   εσT⁴ = E · R_hab/R_out.
  const E_rad = E * R_hab / R_out;
  const radiatorTemp_K = Math.pow(E_rad / (emissivity * SIGMA), 0.25);
  // But it CANNOT conduct out through the foam rind: cylindrical conduction
  //   ΔT = Q'·ln(rOut/rIn)/(2πk),  Q' = linePower per metre — astronomically large for foam,
  // which is the point: the foam insulates; heat must be actively pumped to the radiator.
  const foamConductiveDeltaT_K = (linePower * Math.log(rindOuter / rindInner)) / (2 * Math.PI * foamK);

  const floor = foodLightFloor(food);
  return {
    E_total: E, E_par, ppfd: ppfdOut, suns: irradianceToSuns(E),
    linePower_W_per_m: linePower, linePower_MW_per_m: linePower / 1e6,
    total_W: total, total_GW: total / 1e9,
    lux,
    radiatorTemp_K, radiatorTemp_C: radiatorTemp_K - 273.15,
    foamConductiveDeltaT_K,                                // ≫ feasible ⇒ active heat transport required
    activeCoolingRequired: foamConductiveDeltaT_K > 1000,
    foodFloor_W: floor.minLightPower_W,
    overbuildVsFood: total / floor.minLightPower_W,        // floodlight vs bare food need
    foodLitArea_m2: floor.minLightPower_W / E,             // lit canopy that meets the calories
    floorArea_m2: 2 * Math.PI * R_hab * L,
  };
}

export const KNOWN_SIMPLIFICATIONS = [
  '"1 sun" = 1000 W/m² with a 45% PAR fraction and 4.57 µmol/J — a daylight-spectrum stand-in; a tuned grow-spectrum lamp shifts the PAR fraction and efficacy.',
  'The axial source is an ideal line (irradiance ∝ 1/r); a real luminous tube has finite radius and self-shadowing by the canopy/atmosphere is neglected.',
  'Heat closure assumes all delivered light becomes heat (plant storage ≈1–2% dropped); the radiator equilibrium is passive at the outer skin, and the foam conductive ΔT flags that active heat transport — not conduction — must carry it there.',
  'Food floor uses one overall light→harvest efficiency; real diets mix crops, livestock and light levels.',
];

const Light = {
  SUN_WM2, PAR_FRACTION, UMOL_PER_J_PAR, LUM_EFFICACY, SIGMA,
  irradianceAtRadius, linePowerForIrradiance, ppfdFromPAR, parFromPPFD,
  sunsToIrradiance, irradianceToSuns, foodLightFloor, budget, KNOWN_SIMPLIFICATIONS,
};
if (typeof globalThis !== 'undefined') globalThis.Light = Light;
export default Light;
