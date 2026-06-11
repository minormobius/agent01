// biome/cycles/sim/global.mjs — the GLOBAL food web: land + lake in one box.
//
// The terrestrial roster (roster.mjs) and the lake bioengine (lake.mjs) are each a closed
// food web. This composes them into ONE community and runs it in ONE abiotic box, to answer
// the question a ship's life-support engineer actually has: not "does the orchard close?" or
// "does the lake close?" but "does the WHOLE interior close, and how much crew does it carry?"
//
// ── How the two ecosystems interact ──────────────────────────────────────────────────────
// They are trophically DISJOINT but abiotically FUSED. No land animal eats a lake plankter in
// this model (the rosters share no trophic edge — buildCommunity only wires an edge when both
// endpoints are in the roster, and none cross), yet the two webs are tightly coupled through
// every shared reservoir the box model tracks:
//   • THE AIR  (one well-mixed CO₂/O₂/H₂O box). Both producer sets draw the same CO₂ down and
//     both respirer sets put it back. This is the dominant coupling: the union's steady-state
//     CO₂ is LOWER than either web alone, because combined fixation over-draws the shared air.
//   • THE NITROGEN  (one mineral-N pool). Land legumes' fixation and the lake's plants compete
//     for and replenish the same dissolved N.
//   • THE DETRITUS  (one litter pool). The orchard's springtail and the lake's benthic
//     detritivores + mussels + tilapia all mineralise the same standing detritus — so the
//     ship's organic-waste treatment is a JOINT service of both webs.
//   • THE LARDER + THE CREW  (one food store, one crew). The crew eats from a single store fed
//     by BOTH webs — duckweed and crops and fruit and fish — and its waste loads the shared
//     detritus + N pools that both webs then process. The crew is the knot that ties them.
//
// ── The barrier between them ─────────────────────────────────────────────────────────────
// In this model there is NO abiotic barrier — both webs breathe the same air and drain to the
// same pools. The only real barrier is SPATIAL: land is the cylinder floor, the lake is a basin
// in it, and a shoreline separates leaf-litter on soil from benthic detritus in water. This
// non-spatial box model deliberately abstracts space away (its stated zeroth-order premise), so
// it runs the fully-mixed limit: the barrier is null by construction. Putting the shoreline back
// — splitting litter/N into land vs. lake compartments joined by a one-way runoff flux, which is
// what turns the lake into the ship's kidney (it strips the land's leached nutrients) — is the
// next stake, and it lands naturally on the planned radius-niche coupling to `tide` (radius is
// altitude is where-the-water-pools). Until then: one box, no barrier, and that is the honest
// statement of this model's resolution.
//
// Pure, zero-dep, node + browser. Conserves C/H/O/N exactly — it is the same paired-flux engine.

import { defaultParams, defaultState, run, KCAL_PER_MOL_CH2O } from './cycles.mjs';
import { ROSTER, buildCommunity } from './roster.mjs';
import { LAKE_ROSTER, fishSurplus, waterTreatment, molCtoKgWet } from './lake.mjs';

export const LAND_IDS = ROSTER.map((o) => o.id);
export const LAKE_IDS = LAKE_ROSTER.map((o) => o.id);

// The combined roster, with the global default tuned so the union closes at a healthy CO₂ band
// (both producer sets share the air, so areas are trimmed vs. the lake running solo).
export function globalRoster() {
  const union = JSON.parse(JSON.stringify([...ROSTER, ...LAKE_ROSTER]));
  union.find((o) => o.id === 'algae').area_m2 = 13000;
  union.find((o) => o.id === 'duckweed').area_m2 = 9000;
  return union;
}

export function globalParams(roster = globalRoster()) {
  const p = defaultParams();
  const c = buildCommunity(roster);
  p.species = c.species;
  p.interactions = c.interactions;
  // One ship, both ecosystems: a crew bigger than either web feeds alone, one shared box.
  p.crew = 140;
  p.airVolume_m3 = p.crew * 50000;
  p.waterReservoir_L = p.crew * 13000;
  p.fixArea_m2 = 8000;            // soil legumes + cyanobacteria, blended
  p.fixation_molN_m2_day = 0.010;
  return p;
}

export function globalState(p = globalParams()) { return defaultState(p); }

// Split the food inflow by ORIGIN — the whole point is that the ship eats from both
// ecosystems. Land food is crops + reeds + pollinated fruit; lake food is harvested duckweed
// + fish + shellfish. (Total comes from the engine; lake is summed from its harvest taps and
// land is the remainder, so the fruit flux — which the engine folds into foodIn — lands on land.)
export function foodSplit(last, p) {
  const DAYrate = (sp) => sp.kind === 'producer'
    ? (sp.turnover || 0) * (sp.harvestIndex || 0) * (last[sp.id] || 0)   // producer harvest, mol C/day
    : (sp.harvest || 0) * (last[sp.id] || 0);                            // animal harvest, mol C/day
  const lakeSet = new Set(LAKE_IDS);
  let lake = 0, animal = 0;
  for (const sp of p.species) {
    const flux = DAYrate(sp);
    if (lakeSet.has(sp.id)) lake += flux;
    if (sp.kind !== 'producer') animal += flux;
  }
  const total = last.foodIn_molday ?? 0;
  const land = Math.max(0, total - lake);
  const plant = Math.max(0, total - animal);
  return {
    total_molday: total,
    land_molday: land, lake_molday: lake,
    plant_molday: plant, animal_molday: animal,
    landShare: total > 0 ? land / total : 0,
    lakeShare: total > 0 ? lake / total : 0,
    plantShare: total > 0 ? plant / total : 0,
    animalShare: total > 0 ? animal / total : 0,
    land_kcalday: land * KCAL_PER_MOL_CH2O,
    lake_kcalday: lake * KCAL_PER_MOL_CH2O,
  };
}

export function globalReport(p = globalParams(), { days = 700, dtHours = 3, sampleDays = 4 } = {}) {
  const traj = run(p, globalState(p), days, dtHours, sampleDays);
  const last = traj[traj.length - 1];
  const fish = fishSurplus(last, p);
  const water = waterTreatment(last, p);
  const food = foodSplit(last, p);

  const crewDemand_molday = (p.crew * p.human_kcal_day) / KCAL_PER_MOL_CH2O;
  const foodDays = last.food_molC / Math.max(crewDemand_molday, 1e-9);
  const o2OK = last.o2_kPa > 17 && last.o2_kPa < 24;
  const co2OK = last.co2_ppm > 150 && last.co2_ppm < 5000;
  const beesOK = (last.bee ?? 0) > 50;          // pollination still works in the joined web
  const fedOK = last.calorieRatio >= 1 && foodDays > 3;
  const supports = o2OK && co2OK && beesOK && fedOK && water.treated;

  return {
    traj, last, fish, water, food, foodDays, crew: p.crew,
    o2OK, co2OK, beesOK, fedOK, supports, calorieRatio: last.calorieRatio,
    verdict: globalVerdict({ supports, p, last, fish, water, food, foodDays }),
  };
}

function globalVerdict({ supports, p, last, fish, water, food, foodDays }) {
  if (supports) {
    return `The closed interior carries ${p.crew} crew on both ecosystems. Food supply `
      + `${(last.calorieRatio * 100).toFixed(0)}% of demand — ${(food.landShare * 100).toFixed(0)}% from land `
      + `(crops, fruit, reeds), ${(food.lakeShare * 100).toFixed(0)}% from the lake (duckweed + ${fish.fishYield_kgday.toFixed(1)} kg fish/day). `
      + `Air holds (O₂ ${last.o2_kPa.toFixed(1)} kPa, CO₂ ${Math.round(last.co2_ppm)} ppm), fruit sets at ${Math.round(last.fruitSet * 100)}%, `
      + `and the lake treats the whole ship's waste — clearing ${water.clearance.toFixed(0)}× the daily load, dissolved N ${water.mineralN_mmol_perL.toFixed(2)} mmol/L. `
      + `${foodDays.toFixed(0)} days of food buffer.`;
  }
  const why = [];
  if (!(last.o2_kPa > 17 && last.o2_kPa < 24)) why.push(`O₂ off-nominal (${last.o2_kPa.toFixed(1)} kPa)`);
  if (!(last.co2_ppm > 150 && last.co2_ppm < 5000)) why.push(`CO₂ off-band (${Math.round(last.co2_ppm)} ppm — combined fixation over-draws the shared air)`);
  if (!((last.bee ?? 0) > 50)) why.push(`pollinators collapsed (${Math.round(last.bee ?? 0)}) — fruit set ${Math.round(last.fruitSet * 100)}%`);
  if (!(last.calorieRatio >= 1 && foodDays > 3)) why.push(`underfeeds the crew (${(last.calorieRatio * 100).toFixed(0)}% of demand, ${foodDays.toFixed(1)} d buffer)`);
  if (!water.treated) why.push(`water off-spec (clearing ${water.clearance.toFixed(1)}×, N ${water.mineralN_mmol_perL.toFixed(2)} mmol/L)`);
  return `The interior does not close for ${p.crew} crew: ${why.join('; ')}.`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// The drawable global food web. Returns a typed node/edge graph: the two species clusters plus
// the shared abiotic pools that bridge them, with edges tagged by the kind of flux. This is the
// data the global.html page renders — the picture of "two trophic islands, one set of pools".
// ─────────────────────────────────────────────────────────────────────────────────────────
export const POOLS = [
  { id: 'air',     label: 'Air · CO₂/O₂',  kind: 'pool' },
  { id: 'nMineral',label: 'Mineral N',     kind: 'pool' },
  { id: 'litter',  label: 'Detritus',      kind: 'pool' },
  { id: 'food',    label: 'Food larder',   kind: 'pool' },
  { id: 'crew',    label: 'Crew',          kind: 'crew' },
];

export function buildGlobalGraph(p = globalParams()) {
  const landSet = new Set(LAND_IDS), lakeSet = new Set(LAKE_IDS);
  const group = (id) => (landSet.has(id) ? 'land' : lakeSet.has(id) ? 'lake' : 'pool');
  const nodes = [];
  for (const sp of p.species) {
    nodes.push({ id: sp.id, label: sp.name || sp.id, kind: sp.kind, role: sp.role, group: group(sp.id) });
  }
  for (const pool of POOLS) nodes.push({ ...pool, group: pool.kind === 'crew' ? 'crew' : 'pool' });

  const edges = [];
  const add = (from, to, type) => edges.push({ from, to, type });
  for (const sp of p.species) {
    if (sp.kind === 'producer') {
      add(sp.id, 'air', 'fix');           // fixes CO₂ (and respires a fraction back)
      add('nMineral', sp.id, 'uptake');   // strips mineral N
      if (sp.harvestIndex) add(sp.id, 'food', 'harvest');
    } else {
      add(sp.id, 'air', 'respire');
      if (sp.harvest) add(sp.id, 'food', 'harvest');
    }
  }
  for (const e of p.interactions) {
    if (e.type === 'trophic') for (const r of e.resources) add(r, e.consumer, 'trophic');
    else if (e.type === 'pollinates') add(e.animal, e.plant, 'pollinates');
  }
  // the crew: eats the larder, breathes the air, voids to the detritus + N pools
  add('food', 'crew', 'eat');
  add('crew', 'air', 'respire');
  add('crew', 'litter', 'waste');
  return { nodes, edges, landIds: LAND_IDS, lakeIds: LAKE_IDS, pools: POOLS.map((x) => x.id) };
}

const Global = {
  LAND_IDS, LAKE_IDS, POOLS, globalRoster, globalParams, globalState,
  globalReport, foodSplit, buildGlobalGraph, molCtoKgWet,
};
if (typeof globalThis !== 'undefined') globalThis.Global = Global;
export default Global;
