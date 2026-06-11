// biome/cycles/sim/lake.mjs — the lake bioengine: a closed aquatic food web tuned to
// two figures of merit the ship actually wants out of its water.
//
// The terrestrial community in cycles.mjs answers "does the loop close?". A LAKE answers
// a sharper, dual-purpose question: can one body of water be BOTH the crew's protein farm
// AND its sewage plant? On Earth those are separate machines; in a closed cylinder the
// cheapest design makes them the same ecosystem — the fish you eat are grown on the
// nutrients you would otherwise have to strip out with hardware. That is the "living
// machine" / integrated-aquaculture idea (Todd's eco-machines; Chinese integrated
// poly-culture; constructed treatment wetlands), run as a trophic web.
//
// Nothing here is new engine: it is the SAME data-driven box model, just a community whose
// species were each picked for a ROLE in the two figures of merit, plus the one capability
// the food-web solver was missing for an animal crop — `harvest` (cull animal biomass into
// the food store), added to cycles.mjs. The figures of merit are read off the trajectory:
//
//   • FISH SURPLUS    — sustainable fishery yield (the `harvest` flux at steady state),
//                       in kg/day, kcal/day, and as a share of crew calorie demand.
//   • WATER TREATMENT — how clean the water is held: standing organic (BOD) load and
//                       mineral-N per litre, and the clearance ratio (detrital + nutrient
//                       throughput ÷ the crew's daily waste loading). ≥1 ⇒ the lake keeps up.
//
// Every species is justified by which figure it serves (see LAKE_ROSTER notes). Pure,
// zero-dep, node + browser; conserves C/H/O/N exactly because it rides the same paired flux.

import { defaultParams, defaultState, run, KCAL_PER_MOL_CH2O } from './cycles.mjs';
import { buildCommunity } from './roster.mjs';

// wet-mass conversion mirrors allometry.mjs: 0.15 g C per g wet, 12.011 g/mol C.
const G_C_PER_G_WET = 0.15, G_PER_MOL_C = 12.011;
export const molCtoKgWet = (molC) => (molC * G_PER_MOL_C) / (G_C_PER_G_WET * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// The roster. Each entry names the real organism and the ROLE it plays in the two
// figures of merit. `harvest` (animals) / `harvestIndex` (producers) is the yield tap;
// `eats` wires the trophic web. Masses drive the allometric stat blocks (allometry.mjs).
// ─────────────────────────────────────────────────────────────────────────────
export const LAKE_ROSTER = [
  // ── Producers (area = lit water surface; strip dissolved nutrients = water treatment) ──
  { id: 'algae', kind: 'producer', sciName: 'Chlorella vulgaris', common: 'Phytoplankton',
    area_m2: 15000, fix: 2.8, autoResp: 0.35, turnover: 0.09, harvestIndex: 0, initDensity: 1.6,
    role: 'water-treatment + base of the web',
    note: 'Fast-turnover primary producer. Strips mineral N/CO₂ (the nutrient sink) and feeds the grazers; not eaten directly by crew.' },
  { id: 'duckweed', kind: 'producer', sciName: 'Lemna minor', common: 'Duckweed', area_m2: 10000,
    fix: 2.0, autoResp: 0.35, turnover: 0.06, harvestIndex: 0.4, initDensity: 10,
    role: 'water-treatment + the calorie base (harvested)',
    note: 'Floating macrophyte; the classic constructed-wetland nutrient stripper. High-protein, the bulk of the harvested plant food.' },

  // ── Animals (mass-based via allometry; override carries the harvest tap) ──
  { id: 'daphnia', kind: 'animal', sciName: 'Daphnia magna', common: 'Water flea',
    mass_g: 0.0006, guild: 'herbivore', thermy: 'ecto', initBio: 1200, eats: ['algae'], halfSat: 3000,
    role: 'water-clarity (grazes algae) + forage for fish',
    note: 'Zooplankton grazer: converts a turbid algal bloom into clear water and into fish-edible biomass.' },
  { id: 'mussel', kind: 'animal', sciName: 'Anodonta cygnea', common: 'Swan mussel',
    mass_g: 30, guild: 'detritivore', thermy: 'ecto', initBio: 9000, eats: ['algae', 'litter'], halfSat: 8000,
    override: { harvest: 0.0015 },
    role: 'water-treatment (filter feeder) + secondary harvest',
    note: 'Filter feeder: polishes suspended algae and detritus out of the column. Slow-growing, lightly harvested.' },
  { id: 'microbe', kind: 'animal', sciName: 'aquatic detritus community', common: 'Benthic detritivores',
    mass_g: 0.0008, guild: 'detritivore', thermy: 'ecto', initBio: 26000, eats: ['litter'], halfSat: 9000,
    microbialProxy: true,
    role: 'water-treatment (BOD removal)',
    note: 'Stand-in for the benthic microbial community that mineralises the organic (BOD) load back to CO₂ + mineral N. Fast per-gram rates approximate the microbes.' },
  { id: 'fish', kind: 'animal', sciName: 'Oreochromis niloticus', common: 'Nile tilapia',
    mass_g: 400, guild: 'omnivore', thermy: 'ecto', count: 9000, capacityFrac: 0.2,
    eats: ['algae', 'duckweed', 'daphnia', 'litter'], halfSat: 6000,
    override: { harvest: 0.012 },
    role: 'FISH SURPLUS — the harvestable protein crop',
    note: 'Omnivorous foodfish: eats plankton, duckweed, zooplankton and detritus, so it grazes across the whole web and turns it into harvest. The headline yield.' },
];

// The harvestable FISH (vs. shellfish): which yields count toward the protein figure of merit.
const FISH_IDS = new Set(['fish']);

// ─────────────────────────────────────────────────────────────────────────────
// Params: the standard global params, the lake community, and lake-tuned reservoirs.
// ─────────────────────────────────────────────────────────────────────────────
export function lakeParams(roster = LAKE_ROSTER) {
  const p = defaultParams();
  const c = buildCommunity(roster);
  p.species = c.species;
  p.interactions = c.interactions;
  // A lake is a big standing water body, not a thin soil film: more water per head, and
  // the N loop is fed by the crew's waste, not by heavy biological fixation (open water
  // fixes little). The crew is the nutrient source the lake is built to process.
  p.waterReservoir_L = p.crew * 12000;   // ~12 m³/person of lake
  p.fixation_molN_m2_day = 0.004;        // modest cyanobacterial fixation only
  p.fixArea_m2 = 8000;
  return p;
}

export function lakeState(p = lakeParams()) { return defaultState(p); }

// ─────────────────────────────────────────────────────────────────────────────
// Figure of merit 1 — FISH SURPLUS. At steady state the standing stock is constant, so
// the harvest flux IS the sustainable yield. Reported as mass, calories, and crew-demand
// share, plus the standing stock and the share of total food supply that is animal.
// ─────────────────────────────────────────────────────────────────────────────
export function fishSurplus(last, p) {
  const byId = Object.fromEntries(p.species.map((s) => [s.id, s]));
  let fishYield = 0, fishStock = 0, shellfishYield = 0;   // mol C/day, mol C, mol C/day
  for (const sp of p.species) {
    if (!sp.harvest) continue;
    const bio = last[sp.id] ?? last.bio?.[sp.id] ?? 0;
    const yieldMolDay = sp.harvest * bio;
    if (FISH_IDS.has(sp.id)) { fishYield += yieldMolDay; fishStock += bio; }
    else shellfishYield += yieldMolDay;
  }
  const totalAnimalYield = fishYield + shellfishYield;
  const crewKcalDemand = p.crew * p.human_kcal_day;
  const fishKcalDay = fishYield * KCAL_PER_MOL_CH2O;
  const animalKcalDay = totalAnimalYield * KCAL_PER_MOL_CH2O;
  // share of the food store's INFLOW that came from animals (vs. plant harvest/fruit)
  const supplyMolDay = last.foodIn_molday ?? 0;
  return {
    fishYield_kgday: molCtoKgWet(fishYield),
    fishYield_kcalday: fishKcalDay,
    fishStock_kg: molCtoKgWet(fishStock),
    shellfishYield_kgday: molCtoKgWet(shellfishYield),
    animalYield_kgday: molCtoKgWet(totalAnimalYield),
    fishShareOfDemand: fishKcalDay / Math.max(crewKcalDemand, 1e-9),     // fraction of crew kcal
    animalShareOfSupply: supplyMolDay > 0 ? (totalAnimalYield / supplyMolDay) : 0,
    perPerson_gday: (molCtoKgWet(fishYield) * 1000) / Math.max(p.crew, 1),
    byId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Figure of merit 2 — WATER TREATMENT. The lake holds the water clean while recycling the
// crew's waste. Two standing-quality numbers (lower = cleaner) and a clearance ratio.
//   clearance     — detrital throughput ÷ crew waste loading (≥1 ⇒ the lake keeps up with
//                   the load; the primary "is it being treated" signal).
//   mineralN      — dissolved mineral N per litre: the eutrophication / nutrient signal. A
//                   working lake strips it toward zero via plant uptake + denitrification;
//                   when treatment fails it spikes (nutrients accumulate).
//   organicLoad   — standing detritus (BOD proxy) per litre. In a healthy lake this is a
//                   stable, cycling detrital biomass; the gate is a generous runaway cap,
//                   so a collapse (detritus piling up) trips it.
// ─────────────────────────────────────────────────────────────────────────────
const MINERAL_N_OK_mmol_perL = 1.5;   // low-eutrophy dissolved N
const ORGANIC_RUNAWAY_molC_perL = 0.25; // above the healthy cycling band ⇒ detritus piling up

export function waterTreatment(last, p) {
  const waterL = last.waterL || (p.waterReservoir_L);
  const organicLoad = last.litter_molC / Math.max(waterL, 1e-9);          // mol C / L
  const mineralN = (last.nMineral / Math.max(waterL, 1e-9)) * 1000;        // mmol N / L
  const wasteLoad = last.wasteLoad_molday || 1e-9;                         // crew organic load, mol C/day
  const clear = last.litterClear_molday || 0;                             // detrital clearance, mol C/day
  const clearance = clear / wasteLoad;                                    // ×: how many crew-loads cleared
  const treated = clearance >= 1
               && mineralN <= MINERAL_N_OK_mmol_perL
               && organicLoad <= ORGANIC_RUNAWAY_molC_perL;
  return {
    organicLoad_molC_perL: organicLoad,
    mineralN_mmol_perL: mineralN,
    clearance,
    nStripped_molday: last.nUptake_molday ?? 0,
    wasteLoad_molday: wasteLoad,
    treated,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The headline call: run the lake to steady state and report both figures of merit plus
// a single verdict on whether the bioengine supports the ship.
// ─────────────────────────────────────────────────────────────────────────────
export function lakeReport(p = lakeParams(), { days = 600, dtHours = 3, sampleDays = 4 } = {}) {
  const traj = run(p, lakeState(p), days, dtHours, sampleDays);
  const last = traj[traj.length - 1];
  const fish = fishSurplus(last, p);
  const water = waterTreatment(last, p);

  const crewDemand_molday = (p.crew * p.human_kcal_day) / KCAL_PER_MOL_CH2O;
  const foodDays = last.food_molC / Math.max(crewDemand_molday, 1e-9);
  const o2OK = last.o2_kPa > 17 && last.o2_kPa < 24;
  const fishOK = fish.fishYield_kcalday > 0 && fish.fishStock_kg > 1;
  const fedOK = last.calorieRatio >= 1 && foodDays > 3;
  const supports = o2OK && fishOK && water.treated && fedOK;

  return {
    traj, last, fish, water,
    foodDays, o2OK, fishOK, fedOK, supports,
    calorieRatio: last.calorieRatio,
    verdict: lakeVerdict({ supports, fish, water, last, foodDays }),
  };
}

function lakeVerdict({ supports, fish, water, last, foodDays }) {
  if (supports) {
    return `The lake bioengine supports the ship. It yields ${fish.fishYield_kgday.toFixed(1)} kg of fish/day `
      + `(${(fish.fishShareOfDemand * 100).toFixed(0)}% of crew calories, ${fish.perPerson_gday.toFixed(0)} g/person·day) `
      + `while holding the water treated — organic load ${water.organicLoad_molC_perL.toFixed(3)} mol C/L, `
      + `dissolved N ${water.mineralN_mmol_perL.toFixed(2)} mmol/L, clearing ${water.clearance.toFixed(1)}× the daily waste. `
      + `O₂ ${last.o2_kPa.toFixed(1)} kPa, ${foodDays.toFixed(0)} days of food buffer.`;
  }
  const why = [];
  if (!(last.o2_kPa > 17 && last.o2_kPa < 24)) why.push(`O₂ off-nominal (${last.o2_kPa.toFixed(1)} kPa)`);
  if (!(fish.fishYield_kcalday > 0 && fish.fishStock_kg > 1)) why.push(`fish stock collapses (${fish.fishStock_kg.toFixed(1)} kg standing)`);
  if (!water.treated) {
    if (water.clearance < 1) why.push(`waste outpaces treatment (clearing only ${water.clearance.toFixed(2)}× the load)`);
    else why.push(`water off-spec (organic ${water.organicLoad_molC_perL.toFixed(3)} mol C/L, N ${water.mineralN_mmol_perL.toFixed(2)} mmol/L)`);
  }
  if (!(last.calorieRatio >= 1 && foodDays > 3)) why.push(`underfeeds the crew (supply ${(last.calorieRatio * 100).toFixed(0)}% of demand, ${foodDays.toFixed(1)} d buffer)`);
  return `The lake bioengine does not yet support the ship: ${why.join('; ')}.`;
}

const Lake = {
  LAKE_ROSTER, lakeParams, lakeState, fishSurplus, waterTreatment, lakeReport, molCtoKgWet,
};
if (typeof globalThis !== 'undefined') globalThis.Lake = Lake;
export default Lake;
