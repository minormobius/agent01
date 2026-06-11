// biome/cycles/sim/maximal.mjs — the MAXIMALIST closed ecology: every web, intermingled.
//
// global.mjs composes land ∪ lake as two trophically-DISJOINT webs sharing only abiotic pools.
// This goes the other way: it is the deliberately MAXIMAL community — terrestrial + aquatic +
// a full chthonic ("brown") soil web — wired together by real cross-web couplers:
//
//   • the SOIL web (brown channel): earthworm + saprotroph fungus eat the detritus the whole
//     ship sheds; a ground-beetle preys on them and on the springtail — and the spider also
//     takes springtails, so the green (herbivore) and brown (detritivore) channels are coupled.
//   • the AMPHIBIAN (marsh frog): tadpoles graze the lake (daphnia), adults eat soil springtails
//     → one organism whose diet spans lake AND soil. The canonical land↔water trophic bridge.
//   • the WATERBIRD (dabbling duck): a mobile generalist coupling THREE containers at once —
//     lake duckweed + daphnia, land crop, soil springtails.
//
// So unlike global.mjs there ARE cross-web trophic edges here (that is the whole point). It is
// still the same paired-flux engine, so C/H/O/N conserve by construction no matter how tangled
// the web gets. Three "containers" partition the organisms by habitat for the /graph view:
// LAND (surface/canopy), LAKE (the water basin), SOIL (the chthonic floor). Couplers belong to
// no single container — they bridge them.
//
// Pure, zero-dep, node + browser.

import { defaultParams, defaultState, run, KCAL_PER_MOL_CH2O } from './cycles.mjs';
import { ROSTER, buildCommunity } from './roster.mjs';
import { LAKE_ROSTER, fishSurplus, waterTreatment, molCtoKgWet } from './lake.mjs';

// ── the chthonic (brown) soil web ──────────────────────────────────────────────────────────
// Three detritivores, no soil predator: a fast ectotherm predator (a ground beetle) over the
// brown channel over-eats the worm and then starves — exactly the reactivity-spiking destabiliser
// the intermingling lab flags. So the stable maximal web keeps the brown web predator-free; its
// top-down coupling instead comes from the amphibian (which eats springtails).
export const SOIL_ROSTER = [
  { id: 'worm', kind: 'animal', sciName: 'Lumbricus terrestris', common: 'Earthworm',
    mass_g: 0.5, guild: 'detritivore', thermy: 'ecto', initBio: 50000, eats: ['litter'], halfSat: 9000,
    note: 'Ecosystem engineer; bulk litter detritivore, the heart of the brown channel.' },
  { id: 'fungus', kind: 'animal', sciName: 'Pleurotus ostreatus', common: 'Saprotroph fungus',
    mass_g: 0.001, guild: 'detritivore', thermy: 'ecto', initBio: 30000, eats: ['litter'], halfSat: 9000,
    microbialProxy: true,
    note: 'Stand-in for the saprotrophic fungal mat that mineralises lignin-rich litter the worm leaves.' },
];

// ── the cross-web couplers (belong to no single container; they bridge them) ───────────────
// Tuned (see /tmp tuning + the lab) to the WEAK regime so the tangled web persists: the frog is
// few + a high half-saturation prey refuge; the duck is a farmed herbivore (heavy harvest) so it
// can't release into the producer base and collapse the small fauna.
export const COUPLER_ROSTER = [
  { id: 'frog', kind: 'animal', sciName: 'Pelophylax ridibundus', common: 'Marsh frog',
    mass_g: 30, guild: 'carnivore', thermy: 'ecto', count: 180, eats: ['daphnia', 'springtail'], halfSat: 12000,
    override: { capacityFrac: 0.05 },
    note: 'Larvae graze the lake (daphnia), adults eat soil springtails — one diet spanning lake↔soil.' },
  { id: 'duck', kind: 'animal', sciName: 'Anas platyrhynchos', common: 'Dabbling duck',
    mass_g: 1000, guild: 'herbivore', thermy: 'endo', count: 120, eats: ['duckweed', 'crop'], halfSat: 7000,
    override: { harvest: 0.06 },
    note: 'Farmed waterfowl grazing lake duckweed + land crop — a harvested bridge spanning lake↔land.' },
];

// Which container each organism lives in (springtail is reassigned land→soil here; couplers float).
export const CONTAINERS = {
  land: ['crop', 'tree', 'reed', 'bee', 'spider'],
  lake: ['algae', 'duckweed', 'daphnia', 'mussel', 'microbe', 'fish'],
  soil: ['springtail', 'worm', 'fungus'],
  bridge: ['frog', 'duck'],
};
export const containerOf = (id) => {
  for (const [c, ids] of Object.entries(CONTAINERS)) if (ids.includes(id)) return c;
  return 'bridge';
};

// The composed maximal roster. Tuned so the tangled web reaches a healthy steady state with
// every species persisting (the /graph view wants no node collapsing to zero).
export function maximalRoster() {
  const union = JSON.parse(JSON.stringify([...ROSTER, ...LAKE_ROSTER, ...SOIL_ROSTER, ...COUPLER_ROSTER]));
  // give the producers room to carry the extra mouths (couplers + brown web draw the shared air);
  // bump the springtail standing stock so the soil web has the biomass to feed the frog.
  union.find((o) => o.id === 'algae').area_m2 = 15000;
  union.find((o) => o.id === 'duckweed').area_m2 = 11000;
  union.find((o) => o.id === 'crop').area_m2 = 4500;
  union.find((o) => o.id === 'reed').area_m2 = 5000;
  union.find((o) => o.id === 'tree').area_m2 = 7000;
  union.find((o) => o.id === 'springtail').initBio = 50000;
  return union;
}

export function maximalParams(roster = maximalRoster()) {
  const p = defaultParams();
  const c = buildCommunity(roster);
  p.species = c.species;
  p.interactions = c.interactions;
  p.crew = 130;
  p.airVolume_m3 = p.crew * 52000;
  p.waterReservoir_L = p.crew * 13000;
  p.fixArea_m2 = 8500;
  p.fixation_molN_m2_day = 0.011;
  return p;
}
export function maximalState(p = maximalParams()) { return defaultState(p); }

export function maximalReport(p = maximalParams(), { days = 700, dtHours = 3, sampleDays = 4 } = {}) {
  const traj = run(p, maximalState(p), days, dtHours, sampleDays);
  const last = traj[traj.length - 1];
  const fish = fishSurplus(last, p);
  const water = waterTreatment(last, p);
  const crewDemand_molday = (p.crew * p.human_kcal_day) / KCAL_PER_MOL_CH2O;
  const foodDays = last.food_molC / Math.max(crewDemand_molday, 1e-9);
  const extinct = p.species.filter((s) => (last[s.id] ?? 0) < 1e-3).map((s) => s.id);
  const o2OK = last.o2_kPa > 17 && last.o2_kPa < 24;
  const co2OK = last.co2_ppm > 120 && last.co2_ppm < 6000;
  const fedOK = last.calorieRatio >= 1 && foodDays > 3;
  const supports = o2OK && co2OK && fedOK && !extinct.length && water.treated;
  return { traj, last, fish, water, foodDays, crew: p.crew, o2OK, co2OK, fedOK, extinct, supports,
    calorieRatio: last.calorieRatio };
}

// ── The drawable maximal graph: typed nodes/edges, each node tagged with its container. ──
export const POOLS = [
  { id: 'air',     label: 'Air · CO₂/O₂', kind: 'pool' },
  { id: 'nMineral',label: 'Mineral N',    kind: 'pool' },
  { id: 'litter',  label: 'Detritus',     kind: 'pool' },
  { id: 'food',    label: 'Food larder',  kind: 'pool' },
  { id: 'crew',    label: 'Crew',         kind: 'crew' },
];

export function buildMaximalGraph(p = maximalParams()) {
  const nodes = [];
  for (const sp of p.species) {
    nodes.push({ id: sp.id, label: sp.name || sp.id, kind: sp.kind, role: sp.role,
      container: containerOf(sp.id) });
  }
  for (const pool of POOLS) nodes.push({ ...pool, container: pool.kind === 'crew' ? 'crew' : 'pool' });

  const edges = [];
  const add = (from, to, type) => edges.push({ from, to, type });
  for (const sp of p.species) {
    if (sp.kind === 'producer') {
      add(sp.id, 'air', 'fix');
      add('nMineral', sp.id, 'uptake');
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
  add('food', 'crew', 'eat');
  add('crew', 'air', 'respire');
  add('crew', 'litter', 'waste');

  // tag each edge: which two containers it links (cross-container edges are the interface)
  const cont = (id) => { const n = nodes.find((x) => x.id === id); return n ? n.container : 'pool'; };
  for (const e of edges) { e.fromC = cont(e.from); e.toC = cont(e.to);
    e.cross = e.type === 'trophic' && e.fromC !== e.toC && e.fromC !== 'pool' && e.toC !== 'pool'; }
  return { nodes, edges, containers: CONTAINERS };
}

const Maximal = {
  SOIL_ROSTER, COUPLER_ROSTER, CONTAINERS, containerOf, POOLS,
  maximalRoster, maximalParams, maximalState, maximalReport, buildMaximalGraph, molCtoKgWet,
};
if (typeof globalThis !== 'undefined') globalThis.Maximal = Maximal;
export default Maximal;
