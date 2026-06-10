// biome/sim/cycles.mjs — closed-loop life-support box model for an infinite O'Neill cylinder.
//
// A *non-spatial* stocks-and-flows model. It answers the question that has to be
// answered before any HVAC or weather model matters: **does the loop close?** —
// can crop photosynthesis, human metabolism and microbial decomposition reach a
// steady state, how big do the atmospheric/water buffers have to be to ride out a
// shock, and where does the nitrogen go.
//
// Design choices that make this verifiable offline (the cylinder-solver ethos):
//
//   1. Carbon/oxygen/water loop is element-exact. Every heterotroph (human,
//      plant respiration, soil microbe) runs the SAME reaction
//          CH2O + O2 -> CO2 + H2O
//      and photosynthesis is its exact reverse
//          CO2 + H2O -> CH2O + O2.
//      Photosynthate is modelled as carbohydrate-equivalent (CH2O), so C, H and O
//      are conserved BY CONSTRUCTION. The self-test checks the integrator against
//      that invariant, not the algebra.
//
//   2. Nitrogen is a separate, element-conserving loop (fixation -> mineral ->
//      biomass -> litter -> mineral -> denitrify -> N2). N never enters the gas
//      O2 balance here; the O2 cost of nitrification is a documented omission
//      (see KNOWN_SIMPLIFICATIONS) — small next to soil C respiration, which IS
//      modelled and is the thing that sank Biosphere-2.
//
//   3. Pure functions, no deps, no DOM. Runs identically in node and the browser;
//      the engine attaches to globalThis so a <script type=module> or a node
//      import both see `Biome`.
//
// Units: moles for all reactive species (so stoichiometry is trivially balanced),
// seconds for time. Helpers convert to kg / litres / kcal / m^2 / days at the edges.

// ─────────────────────────────────────────────────────────────────────────────
// Physical constants & molar masses
// ─────────────────────────────────────────────────────────────────────────────
export const M = { O2: 31.998, CO2: 44.009, H2O: 18.015, N2: 28.014, CH2O: 30.026, N: 14.007 };
const DAY = 86400; // s
// CH2O carbohydrate energy: glucose 2805 kJ/mol / 6 C = 467.5 kJ per mol CH2O-C.
// 1 kcal = 4.184 kJ -> 111.7 kcal per mol CH2O. (Atwater carb factor ~4 kcal/g; 30 g/mol -> ~120; agrees.)
export const KCAL_PER_MOL_CH2O = 467.5 / 4.184; // ≈ 111.7

// ─────────────────────────────────────────────────────────────────────────────
// Default parameters. Sourced from closed-ecology literature (BIOS-3, MELiSSA,
// Biosphere-2) and human-factors handbooks (NASA BVAD). Every number is a knob.
// ─────────────────────────────────────────────────────────────────────────────
export function defaultParams() {
  return {
    crew: 100,                 // people
    cropArea_m2: 2200,         // total photosynthesising leaf-equivalent area
    legumeFraction: 0.15,      // share of crop that fixes N2

    // — Light / photosynthesis —
    // PPFD-limited gross fixation per m^2 at full illumination. BIOS-3 wheat under
    // intense light managed ~50 g dry mass m^-2 day^-1; carbohydrate-C is a slice
    // of that. We use gross CH2O-C fixation; net (NPP) = gross - autotrophic resp.
    grossFix_molC_m2_day: 1.6,     // mol CH2O-C per m^2 per (lit) day at full light (high-intensity CEA)
    photoperiod: 0.65,             // fraction of the 24h cycle the linear sun is on
    autotrophRespFraction: 0.35,   // plant respiration as fraction of gross fixation
    co2_halfSat_Pa: 12,            // Michaelis CO2 partial pressure for fixation (Pa)
    harvestIndex: 0.45,            // edible fraction of NET production (grain HI ~0.4-0.5)

    // — Humans —
    human_O2_molday: 26.3,         // ≈ 0.84 kg O2/person/day (BVAD)
    human_kcal_day: 2550,          // metabolic demand
    human_water_L_day: 3.2,        // drinking + food water turnover (hygiene water is recycled, excluded)
    human_N_gday: 13,              // protein N intake≈excretion at N balance (~13 g N/day)

    // — Crop maturity / harvest —
    // Standing biomass doesn't accumulate forever: a crop matures and is cut. This
    // is what brings the loop to a real steady state — without it, NPP piles up as
    // ever-growing biomass, sequesters carbon and crashes ambient CO2.
    cropTurnover_perday: 0.03,     // fraction of standing biomass harvested per day (≈33-day crop)

    // — Microbial decomposition (the Biosphere-2 term) —
    // First-order decay of the litter pool. Rich/biologically-active soil = fast.
    litterDecay_perday: 0.012,     // fraction of litter pool oxidised per day
    senescence_perday: 0.004,      // baseline leaf-drop to litter per day

    // — Nitrogen loop —
    biomassCN_molar: 30,           // whole-plant C:N (grain richer, straw poorer; 30 ≈ mix)
    fixation_molN_m2legume_day: 0.02,  // biological N fixation per m^2 of legume per day
    mineralizeFraction: 0.85,      // N released to mineral pool when litter decomposes (rest immobilised/lost)
    denitrify_perday: 0.004,       // fraction of mineral-N pool returned to N2 per day (loss)

    // — Atmosphere geometry (sets partial pressures & buffer sizes) —
    // Air inventory the loop breathes against. For an infinite cylinder we model a
    // per-crew "atmospheric column" volume; scale it to taste.
    airVolume_m3: 100 * 50_000,    // 50,000 m^3 of air per person (a tall column under spin)
    airTemp_K: 293.15,
    waterReservoir_L: 100 * 8000,  // free liquid water (lakes/soil/condensate), litres
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Initial state. All reactive inventories in mol; water split vapour/liquid.
// ─────────────────────────────────────────────────────────────────────────────
export function defaultState(p = defaultParams()) {
  // Seed the air to a roughly Earth-normal sea-level mix for the chosen volume.
  // n = pV/RT per partial pressure.
  const R = 8.314462618; // J/mol/K
  const V = p.airVolume_m3, T = p.airTemp_K;
  const molAt = (Pa) => (Pa * V) / (R * T);
  return {
    t: 0,
    // gases (mol)
    O2:  molAt(21_000),   // 21 kPa
    CO2: molAt(100),      // 100 Pa ≈ 1000 ppm — the habitat runs CO2-enriched, as controlled-environment ag does
    N2:  molAt(79_000),   // 79 kPa
    H2Ov: molAt(1_500),   // ~1.5 kPa vapour (≈ 55% RH at 20°C)
    // water (mol liquid)
    H2Ol: (p.waterReservoir_L * 1000) / M.H2O,
    // carbon pools (mol CH2O-C)
    bio:  p.cropArea_m2 * 6.0,   // standing crop carbon (≈ a few hundred g C/m^2)
    litter: p.cropArea_m2 * 4.0, // dead organic carbon
    food: p.crew * 30 * 22,      // ~30 days of food buffer, 22 mol C/person/day
    // nitrogen pools (mol N)
    nMineral: p.cropArea_m2 * 0.5,
    nBiomass: (p.cropArea_m2 * 6.0) / p.biomassCN_molar,
    nLitter:  (p.cropArea_m2 * 4.0) / p.biomassCN_molar,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const R_GAS = 8.314462618;
// partial pressure (Pa) of a gas given its mol inventory and the air box
export function partialPressure(mol, p) { return (mol * R_GAS * p.airTemp_K) / p.airVolume_m3; }
export function totalPressure(s, p) {
  return partialPressure(s.O2 + s.CO2 + s.N2 + s.H2Ov, p);
}
// saturation vapour pressure of water (Pa), Tetens, T in K
export function satVaporPressure_Pa(T_K) {
  const Tc = T_K - 273.15;
  return 610.78 * Math.exp((17.27 * Tc) / (Tc + 237.3));
}
export function relativeHumidity(s, p) {
  return partialPressure(s.H2Ov, p) / satVaporPressure_Pa(p.airTemp_K);
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivatives: d(state)/dt in mol/s. This is where the biology lives.
// Returns a delta object with the same keys as state (minus t) plus a `flux`
// breakdown for diagnostics.
// ─────────────────────────────────────────────────────────────────────────────
export function derivatives(s, p) {
  // — Photosynthesis (gross), CO2- and light-limited —
  const co2Pa = partialPressure(s.CO2, p);
  const co2Lim = co2Pa / (co2Pa + p.co2_halfSat_Pa);     // Michaelis-Menten in CO2
  const lightLim = p.photoperiod;                         // averaged duty cycle
  const grossFix = (p.grossFix_molC_m2_day * p.cropArea_m2 * co2Lim * lightLim) / DAY; // mol C/s
  const autoResp = grossFix * p.autotrophRespFraction;    // plant respiration (mol C/s)
  const npp = grossFix - autoResp;                         // net primary production

  // — Carbon flows through the standing crop (mol C/s) —
  // ALL net production grows standing biomass; biomass leaves by maturity (harvest)
  // plus a small baseline senescence. Without this turnover, NPP piles up as
  // ever-growing biomass that sequesters carbon and crashes ambient CO2 — so the
  // loop would never reach steady state. Harvest splits by harvest index into
  // edible food and structural residue (straw/roots) that becomes litter.
  const toBiomass = npp;
  const maturity = (p.cropTurnover_perday * s.bio) / DAY;       // crop cut at maturity
  const harvest = maturity * p.harvestIndex;                    // -> food store
  const residue = maturity * (1 - p.harvestIndex);             // -> litter
  const senescence = (p.senescence_perday * s.bio) / DAY;      // baseline leaf-drop -> litter
  const decomp = (p.litterDecay_perday * s.litter) / DAY;      // litter oxidised -> CO2

  // humans burn food carbon at their metabolic rate (RQ≈1 for a carb diet), but
  // can never draw the store negative: when food runs out they eat hand-to-mouth,
  // capped at the live harvest inflow. The calorie diagnostic still reports the
  // resulting deficit, so "the crop underfeeds the crew" shows as a number, not a
  // crash. This smooth floor keeps RK4 from overshooting below zero.
  const humanC = (p.human_O2_molday * p.crew) / DAY;            // demanded mol C/s
  const foodAvail = Math.max(0, s.food);
  const humanBurn = Math.min(humanC, harvest + foodAvail / DAY);

  // gas exchange (mol/s): photosynthesis fixes CO2 & releases O2; all heterotrophy reverses it
  const o2_prod = grossFix;                                  // O2 out of photosynthesis
  const o2_cons = autoResp + decomp + humanBurn;             // O2 into all respiration
  const co2_cons = grossFix;                                 // CO2 fixed
  const co2_prod = autoResp + decomp + humanBurn;            // CO2 respired

  // water: photosynthesis consumes H2O (per CH2O-C), respiration produces it.
  // Net vapour change also gets transpiration (liquid->vapour) toward equilibrium.
  const h2o_fromResp = o2_cons;          // 1 H2O per O2 in CH2O+O2->CO2+H2O
  const h2o_toPhoto = grossFix;          // 1 H2O per C fixed in CO2+H2O->CH2O+O2
  // relax vapour toward saturation·targetRH via the liquid reservoir (transpiration/condensation)
  const targetRH = 0.85;
  const satMol = (targetRH * satVaporPressure_Pa(p.airTemp_K) * p.airVolume_m3) / (R_GAS * p.airTemp_K);
  const vaporRelax = (satMol - s.H2Ov) / (3 * DAY);   // 3-day relaxation time

  // — Nitrogen loop (mol N/s), element-conserving —
  const fix = (p.fixation_molN_m2legume_day * p.cropArea_m2 * p.legumeFraction) / DAY; // N2 -> mineral
  const uptake = npp / p.biomassCN_molar;                 // mineral -> biomass, tied to NPP C:N
  // N leaves standing biomass with the carbon that leaves it (maturity + senescence).
  // Whether via crop residue or through the crew's gut to waste, it ends in litter —
  // at N-balance the crew retains none — so route all of it to the litter-N pool.
  const nBioOut = ((maturity + senescence) / Math.max(s.bio, 1e-9)) * s.nBiomass;
  const nMineralize = (p.litterDecay_perday * s.nLitter) * p.mineralizeFraction / DAY; // litter-N -> mineral
  const denitrify = (p.denitrify_perday * s.nMineral) / DAY;   // mineral -> N2 (loss)

  // limit uptake to available mineral N (no negative pools)
  const uptakeEff = Math.min(uptake, s.nMineral / DAY + fix + nMineralize);

  return {
    d: {
      O2:  o2_prod - o2_cons,
      CO2: co2_prod - co2_cons,
      N2:  (denitrify - fix) / 2,   // fluxes are mol-N atoms; N2 pool is mol-molecules
      // Reaction water (respiration makes it, photosynthesis consumes it) is a REAL
      // source/sink for total water — it enters the vapour pool and is balanced by
      // the CH2O/O2/CO2 element changes. vaporRelax is the only vapour↔liquid transfer.
      H2Ov: (h2o_fromResp - h2o_toPhoto) + vaporRelax,
      H2Ol: -vaporRelax,
      bio:  toBiomass - maturity - senescence,
      litter: residue + senescence - decomp,
      food: harvest - humanBurn,
      nMineral: fix + nMineralize - uptakeEff - denitrify,
      nBiomass: uptakeEff - nBioOut,
      nLitter: nBioOut - nMineralize,
    },
    flux: {
      grossFix, autoResp, npp, decomp, humanBurn, senescence, harvest, maturity,
      o2_net: o2_prod - o2_cons, co2_net: co2_prod - co2_cons,
      fix, uptake: uptakeEff, denitrify, vaporRelax,
      calorieSupply_kcalday: harvest * DAY * KCAL_PER_MOL_CH2O,
      calorieDemand_kcalday: p.crew * p.human_kcal_day,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Integrator: classic RK4. Deterministic. dt in seconds.
// ─────────────────────────────────────────────────────────────────────────────
const KEYS = ['O2','CO2','N2','H2Ov','H2Ol','bio','litter','food','nMineral','nBiomass','nLitter'];

function addScaled(base, delta, h) {
  const out = { ...base };
  for (const k of KEYS) out[k] = base[k] + h * delta[k];
  return out;
}

export function step(s, p, dt) {
  const k1 = derivatives(s, p).d;
  const k2 = derivatives({ ...addScaled(s, k1, dt / 2), t: s.t }, p).d;
  const k3 = derivatives({ ...addScaled(s, k2, dt / 2), t: s.t }, p).d;
  const k4 = derivatives({ ...addScaled(s, k3, dt), t: s.t }, p).d;
  const out = { ...s, t: s.t + dt };
  for (const k of KEYS) out[k] = s[k] + (dt / 6) * (k1[k] + 2 * k2[k] + 2 * k3[k] + k4[k]);
  // clamp tiny negatives from stiffness to zero (pools can't go negative)
  for (const k of KEYS) if (out[k] < 0 && out[k] > -1e-6) out[k] = 0;
  return out;
}

// run for `days`, returning trajectory sampled every `sampleDays`
export function run(p = defaultParams(), s0 = defaultState(p), days = 365, dtHours = 1, sampleDays = 1) {
  const dt = dtHours * 3600;
  const steps = Math.round((days * DAY) / dt);
  const sampleEvery = Math.max(1, Math.round((sampleDays * DAY) / dt));
  let s = s0;
  const traj = [snapshot(s, p)];
  for (let i = 1; i <= steps; i++) {
    s = step(s, p, dt);
    if (i % sampleEvery === 0) traj.push(snapshot(s, p));
  }
  return traj;
}

// ─────────────────────────────────────────────────────────────────────────────
// Element accounting — the conservation invariant the self-test leans on.
// Returns total mol of C, H, O, N across ALL reservoirs.
// CH2O = 1C 2H 1O ; CO2 = 1C 2O ; O2 = 2O ; H2O = 2H 1O ; N2 = 2N.
// ─────────────────────────────────────────────────────────────────────────────
export function elements(s) {
  const C = s.CO2 + s.bio + s.litter + s.food;
  const H = 2 * s.H2Ov + 2 * s.H2Ol + 2 * (s.bio + s.litter + s.food);
  const O = 2 * s.O2 + 2 * s.CO2 + s.H2Ov + s.H2Ol + (s.bio + s.litter + s.food);
  const N = 2 * s.N2 + s.nMineral + s.nBiomass + s.nLitter;
  return { C, H, O, N };
}

// human-readable snapshot at a point in time
export function snapshot(s, p) {
  const f = derivatives(s, p).flux;
  return {
    day: s.t / DAY,
    o2_kPa: partialPressure(s.O2, p) / 1000,
    co2_ppm: (partialPressure(s.CO2, p) / totalPressure(s, p)) * 1e6,
    rh: relativeHumidity(s, p),
    totalP_kPa: totalPressure(s, p) / 1000,
    bio_molC: s.bio, litter_molC: s.litter, food_molC: s.food, waterL: (s.H2Ol * M.H2O) / 1000,
    nMineral: s.nMineral, nBiomass: s.nBiomass, nLitter: s.nLitter,
    o2_net_molday: f.o2_net * DAY,
    calorieSupply: f.calorieSupply_kcalday, calorieDemand: f.calorieDemand_kcalday,
    calorieRatio: f.calorieSupply_kcalday / f.calorieDemand_kcalday,
  };
}

export const KNOWN_SIMPLIFICATIONS = [
  'Nitrification O2 cost not coupled to the gas balance (small vs. soil C respiration).',
  'Photosynthate is carbohydrate-equivalent (CH2O); lipids/protein energy density not separated.',
  'Single well-mixed air box: no vertical (radial) structure — that lives in the 1-D column tool.',
  'Temperature is a fixed parameter; no thermal feedback on rates yet.',
  'Trace-gas / ethylene buildup (a real closed-ecology hazard) not modelled.',
];

// Attach to globalThis so a browser <script type=module> and node both see `Biome`.
const Biome = {
  M, KCAL_PER_MOL_CH2O, defaultParams, defaultState, derivatives, step, run,
  elements, snapshot, partialPressure, totalPressure, relativeHumidity,
  satVaporPressure_Pa, KNOWN_SIMPLIFICATIONS,
};
if (typeof globalThis !== 'undefined') globalThis.Biome = Biome;
export default Biome;
