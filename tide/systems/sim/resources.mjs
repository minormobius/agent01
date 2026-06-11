// biome/systems/sim/resources.mjs — the water & energy ledger that ties the habitat together.
//
// The spatial modules each conserve their own books; this closes the two that cross all of
// them: ENERGY (reactors → light + jets, the only consumers so far) and WATER (a closed loop
// of lake → jet → spray → fog/dew/soil → drainage → lake). It answers the system questions:
// how big a reactor, how deep the lakes, how long water lingers (treatment + thermal buffer),
// and how much fish that water can sustainably feed.
//
// Two parts:
//   • energyLedger()  — instantaneous power accounting (no storage yet). Reuses the light
//     budget. The headline it surfaces: light dwarfs everything mechanical by ~1000×, so the
//     reactor is sized entirely by lighting.
//   • a WATER box model — stocks {lake, soil, vapour, fog} in m³, every flow paired so total
//     water conserves exactly (same discipline as Module 1). Lake DEPTH falls out of the
//     reservoir charge and the lake footprint; aquaticCapacity() turns that into fish.
//
// Pure, zero-dep beyond the shared geometry + the light budget. SI units (m³, s, W).

import { CYLINDER } from '../../shared/geometry.mjs';
import { budget } from '../../fountain/sim/light.mjs';

const RHO_W = 1000;     // water density, kg/m³
const YEAR = 365 * 86400;

export function defaultParams() {
  return {
    // habitat extent
    litLength: 1000,                 // length of cylinder lit & irrigated, m
    waterFraction: 0.05,             // fraction of the floor that is lake surface (the 3 reservoirs)
    nLakes: 3,                       // three corkscrewing lakes at the ratchet low points

    // ENERGY
    suns: 0.5,                       // canopy light level
    lampEfficiency: 0.5,             // electrical → delivered radiant (grow-spectrum LED)
    pumpEfficiency: 0.7,             // electrical → hydraulic (jet pumps)
    jetV0: 160,                      // jet exit speed, m/s (sets the pump pressure ½ρv²)
    jetFlow_m3s: 1.0,                // per-jet volumetric flow (irrigation-scale, ~ET demand)
    nJets: 3,                        // one jet per lake
    reactorCapacity_GW: 60,          // installed reactor electrical capacity

    // WATER box-model fluxes (per second, first-order rate constants)
    totalWater_m3: 1.4e7,            // the reservoir charge (the parameter that drives depth)
    sprayEvapFraction: 0.25,         // fraction of jet spray that evaporates in flight → vapour
    kET: 6e-7,                       // evapotranspiration rate (soil → vapour), 1/s, ×sun
    kCond: 5e-6,                     // night condensation (vapour → fog), 1/s
    kBurn: 8e-6,                     // daytime Mie burn-off (fog → vapour), 1/s, ×sun
    kDew: 3e-6,                      // fog settling (fog → soil), 1/s
    kDrain: 2e-6,                    // soil drainage / runoff (soil → lake), 1/s above field capacity
    soilFieldCap_m3: 5e5,            // soil holding capacity before it drains
    photoperiod: 0.55, dayLength: 86400,

    // AQUATIC
    fishArealStanding_kg_m2: 0.05,   // sustainable standing fish stock per m² of lake surface
    fishHarvestFraction: 0.3,        // fraction of standing stock harvestable per year
    crew: 100, fishPerCapita_kg_yr: 110,  // ~0.3 kg fish/person/day
  };
}

export const lakeArea = (p) => p.waterFraction * 2 * Math.PI * CYLINDER.R_hab * p.litLength;

// ── ENERGY — instantaneous demand vs reactor capacity ───────────────────────
export function energyLedger(p = defaultParams()) {
  const lit = budget({ suns: p.suns, L: p.litLength });
  const lightRadiant_W = lit.total_W;
  const lightElectrical_W = lightRadiant_W / p.lampEfficiency;
  const jetHydraulic_W = p.nJets * (0.5 * RHO_W * p.jetV0 * p.jetV0) * p.jetFlow_m3s;
  const jetElectrical_W = jetHydraulic_W / p.pumpEfficiency;
  const total = lightElectrical_W + jetElectrical_W;
  const cap = p.reactorCapacity_GW * 1e9;
  return {
    lightElectrical_W, jetElectrical_W, total_W: total,
    light_GW: lightElectrical_W / 1e9, jet_MW: jetElectrical_W / 1e6, total_GW: total / 1e9,
    reactorCapacity_GW: p.reactorCapacity_GW, margin_GW: (cap - total) / 1e9,
    lightFraction: lightElectrical_W / total,
    reactorsNeeded_3GW: Math.ceil(total / 3e9),
    radiatorTemp_C: lit.radiatorTemp_C,
  };
}

// ── WATER — a conserving box model {lake, soil, vapour, fog} ─────────────────
const sunlit = (p, t) => ((t % p.dayLength) / p.dayLength) < p.photoperiod ? 1 : 0;
const jetActive = (p, lit) => p.jetMode === 'day' ? lit : p.jetMode === 'night' ? 1 - lit : 1;

export function initWater(p = defaultParams()) {
  // start with most of the charge in the lake, a little in soil/vapour
  return { t: 0, lake: p.totalWater_m3 * 0.9, soil: p.totalWater_m3 * 0.08,
           vapor: p.totalWater_m3 * 0.015, fog: p.totalWater_m3 * 0.005 };
}

export function waterDerivs(s, p) {
  const lit = sunlit(p, s.t);
  const J = (s.lake > 0 ? 1 : 0) * jetActive(p, lit) * p.nJets * p.jetFlow_m3s;  // pumped from lake
  const toVapor = J * p.sprayEvapFraction, toSoil = J * (1 - p.sprayEvapFraction);
  const et = p.kET * Math.max(0, s.soil) * (lit ? 1 : 0.15);
  const cond = p.kCond * Math.max(0, s.vapor) * (1 - lit);        // condenses at night
  const burn = p.kBurn * Math.max(0, s.fog) * lit;               // Mie burn-off by day
  const dew = p.kDew * Math.max(0, s.fog);
  const drain = p.kDrain * Math.max(0, s.soil - p.soilFieldCap_m3);
  return {
    lake: -J + drain,
    soil: toSoil + dew - et - drain,
    vapor: toVapor + et + burn - cond,
    fog: cond - burn - dew,
    _flux: { J, et, cond, burn, dew, drain, lit },
  };
}

export function stepWater(s, p, dt) {
  const d = waterDerivs(s, p);
  return {
    t: s.t + dt,
    lake: s.lake + d.lake * dt, soil: s.soil + d.soil * dt,
    vapor: s.vapor + d.vapor * dt, fog: s.fog + d.fog * dt,
  };
}

export function runWater(p = defaultParams(), days = 120, dtMin = 10) {
  const dt = dtMin * 60; let s = initWater(p);
  for (let k = 0; k < Math.round((days * 86400) / dt); k++) s = stepWater(s, p, dt);
  return s;
}

export const totalWater = (s) => s.lake + s.soil + s.vapor + s.fog;

// Lake geometry + residence time from a water state (or a lake volume).
export function lakeMetrics(p, lakeVolume_m3) {
  const area = lakeArea(p);
  const depth = lakeVolume_m3 / area;                            // mean depth (m)
  const throughput = p.nJets * p.jetFlow_m3s;                    // m³/s cycling through the jets
  return {
    area_m2: area, area_per_lake_m2: area / p.nLakes,
    meanDepth_m: depth, residenceTime_days: lakeVolume_m3 / throughput / 86400,
    throughput_m3s: throughput,
  };
}

// ── AQUATIC — fish the lakes can sustainably carry ──────────────────────────
export function aquaticCapacity(p = defaultParams(), lakeVolume_m3 = p.totalWater_m3 * 0.9) {
  const area = lakeArea(p);
  const standing_kg = area * p.fishArealStanding_kg_m2;
  const yield_kg_yr = standing_kg * p.fishHarvestFraction;
  const crewNeed_kg_yr = p.crew * p.fishPerCapita_kg_yr;
  return {
    lakeArea_m2: area, meanDepth_m: lakeVolume_m3 / area,
    standing_t: standing_kg / 1000, yield_t_yr: yield_kg_yr / 1000,
    crewNeed_t_yr: crewNeed_kg_yr / 1000, feedsCrewFraction: yield_kg_yr / crewNeed_kg_yr,
  };
}

export const KNOWN_SIMPLIFICATIONS = [
  'Energy is instantaneous demand vs capacity — no battery/thermal storage, and light is the only large load (jets are <0.1%).',
  'Water is a four-box mean-field model (lake/soil/vapour/fog); it does not resolve where the dew drips, just the closed mass balance and the lake depth.',
  'Lake depth is a mean (volume ÷ footprint); the beach-to-cliff bathymetry that makes the reservoir is not modelled.',
  'Fish carrying capacity is one areal-productivity number, not a modelled aquatic food web (that is the natural place to reuse Module 1).',
  'The three lakes are treated as one pooled reservoir; their corkscrew along the axial direction is out of this non-axial scope.',
];

const Resources = {
  defaultParams, lakeArea, energyLedger, initWater, waterDerivs, stepWater, runWater,
  totalWater, lakeMetrics, aquaticCapacity, KNOWN_SIMPLIFICATIONS,
};
if (typeof globalThis !== 'undefined') globalThis.Resources = Resources;
export default Resources;
