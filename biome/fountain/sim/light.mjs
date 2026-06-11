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

// The full budget for flooding the rim canopy at a target light level.
//   target: { suns } OR { ppfd } OR { E_total }   (one of)
//   R, L:   rim radius (m), cylinder length to power (m)
//   emissivity: external radiator emissivity (heat closure)
export function budget({ suns, ppfd, E_total, R = 3200, L = 1000, emissivity = 0.9,
                         food = {} } = {}) {
  // resolve the requested surface irradiance
  let E = E_total;
  if (E == null && ppfd != null) E = parFromPPFD(ppfd) / PAR_FRACTION;   // total from PAR target
  if (E == null && suns != null) E = sunsToIrradiance(suns);
  if (E == null) E = SUN_WM2;
  const E_par = E * PAR_FRACTION;
  const ppfdOut = ppfdFromPAR(E_par);

  const linePower = linePowerForIrradiance(E, R);          // W per metre of length (the axial lamp)
  const total = linePower * L;                              // W for the whole lit length
  const lux = E * LUM_EFFICACY;                             // illuminance at the rim

  // heat closure: essentially all of it becomes heat the shell must radiate. At steady
  // state εσT⁴ = E at the rim ⇒ the external radiator equilibrium temperature.
  const radiatorTemp_K = Math.pow(E / (emissivity * SIGMA), 0.25);

  const floor = foodLightFloor(food);
  return {
    E_total: E, E_par, ppfd: ppfdOut, suns: irradianceToSuns(E),
    linePower_W_per_m: linePower, linePower_MW_per_m: linePower / 1e6,
    total_W: total, total_GW: total / 1e9,
    lux,
    radiatorTemp_K, radiatorTemp_C: radiatorTemp_K - 273.15,
    foodFloor_W: floor.minLightPower_W,
    // how over-built the floodlight is vs the bare food need (the "LOT" made explicit)
    overbuildVsFood: total / floor.minLightPower_W,
    // lit canopy area that would meet the food need at THIS irradiance
    foodLitArea_m2: floor.minLightPower_W / E,
    floorArea_m2: 2 * Math.PI * R * L,
  };
}

export const KNOWN_SIMPLIFICATIONS = [
  '"1 sun" = 1000 W/m² with a 45% PAR fraction and 4.57 µmol/J — a daylight-spectrum stand-in; a tuned grow-spectrum lamp shifts the PAR fraction and efficacy.',
  'The axial source is an ideal line (irradiance ∝ 1/r); a real luminous tube has finite radius and self-shadowing by the canopy/atmosphere is neglected.',
  'Heat closure assumes all delivered light becomes heat the shell radiates (plant storage ≈1–2% is dropped); conduction/active cooling not modelled.',
  'Food floor uses one overall light→harvest efficiency; real diets mix crops, livestock and light levels.',
];

const Light = {
  SUN_WM2, PAR_FRACTION, UMOL_PER_J_PAR, LUM_EFFICACY, SIGMA,
  irradianceAtRadius, linePowerForIrradiance, ppfdFromPAR, parFromPPFD,
  sunsToIrradiance, irradianceToSuns, foodLightFloor, budget, KNOWN_SIMPLIFICATIONS,
};
if (typeof globalThis !== 'undefined') globalThis.Light = Light;
export default Light;
