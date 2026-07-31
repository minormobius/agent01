// biome/cycles/sim/roster.mjs — a roster of REAL organisms → a runnable community.
//
// The allometry layer turns one trait (body mass) into a stat block; this layer is the
// roster that supplies those traits for actual species and wires up who-eats-whom. Each
// entry is a real organism with a scientific name (→ iNaturalist identity + imagery) and
// a hand-curated diet that GloBI (Global Biotic Interactions) corroborates. The compiler
// `buildCommunity()` runs every animal through `makeAnimal()` (allometry) and resolves the
// diet names into the engine's `interactions` edges, so picking organisms by name yields a
// `{species, interactions}` the box model integrates unchanged.
//
// Provenance is fetched and committed by scripts/enrich-roster.mjs into roster.enriched.json
// (iNat taxon id + photo URL, GloBI eats list). The engine NEVER depends on that file —
// it's documentation/imagery; the curated ROSTER below is the source of truth and runs offline.
//
// Producers stay area-based (a canopy is parameterised by area, not body mass — see the
// allometry layer's note). The microbial decomposer is the one guild where body-mass
// allometry is a stand-in: real decomposition is bacteria/fungi (≈unmeasurable body mass),
// so the roster represents it with a small soil detritivore (a springtail) whose fast
// per-gram rates approximate the microbial compartment. That's flagged on the entry.

import { defaultParams } from './cycles.mjs';
import { makeAnimal } from './allometry.mjs';

// ── The curated roster. id is the engine pool name; sciName drives enrichment. ──
export const ROSTER = [
  // ── Producers (area-based) ──
  { id: 'crop', kind: 'producer', sciName: 'Ipomoea batatas', common: 'Sweet potato',
    area_m2: 3000, fix: 1.7, autoResp: 0.35, turnover: 0.034, harvestIndex: 0.44, initDensity: 6,
    note: 'High-harvest-index ground staple; the calorie workhorse.' },
  { id: 'tree', kind: 'producer', sciName: 'Malus domestica', common: 'Apple', area_m2: 6000,
    fix: 1.1, autoResp: 0.35, turnover: 0.0068, harvestIndex: 0, initDensity: 40, pollinatedBy: 'bee',
    note: 'Perennial standing biomass; fruit is pollinator-gated (no bees ⇒ no apples).' },
  { id: 'reed', kind: 'producer', sciName: 'Phragmites australis', common: 'Common reed', area_m2: 4000,
    fix: 2.0, autoResp: 0.35, turnover: 0.02, harvestIndex: 0.1, initDensity: 10,
    note: 'Fast wetland C4-ish fixer; cycles carbon hard, little direct food.' },

  // ── Animals (mass-based, via allometry) ──
  { id: 'bee', kind: 'animal', sciName: 'Apis mellifera', common: 'Western honey bee',
    mass_g: 0.1, guild: 'nectarivore', thermy: 'ecto', count: 60000,
    eats: ['crop', 'tree', 'reed'], halfSat: 4000, pollinates: 'tree', fruitPerday: 0.02,
    note: 'Forages all three producers and gates apple fruit set.' },
  { id: 'spider', kind: 'animal', sciName: 'Araneus diadematus', common: 'European garden spider',
    mass_g: 0.27, guild: 'carnivore', thermy: 'ecto', count: 1500, eats: ['bee'], halfSat: 120,
    note: 'Top-down control on pollinators; a bloom cascades into the harvest.' },
  { id: 'springtail', kind: 'animal', sciName: 'Folsomia candida', common: 'Springtail',
    mass_g: 0.0008, guild: 'detritivore', thermy: 'ecto', initBio: 20000, eats: ['litter'], halfSat: 10000,
    microbialProxy: true,
    note: 'Stand-in for the soil decomposer compartment (microbes have no body mass to scale); fast per-gram rates approximate it.' },
];

// ── Validate the roster: diet targets exist, guilds/masses sane. Returns problems[]. ──
export function validateRoster(roster = ROSTER) {
  const ids = new Set(roster.map((o) => o.id));
  const problems = [];
  for (const o of roster) {
    if (ids.size !== roster.length) problems.push('duplicate id');
    if (o.kind === 'animal') {
      if (!(o.mass_g > 0)) problems.push(`${o.id}: mass_g must be > 0`);
      for (const food of o.eats ?? []) {
        if (food !== 'litter' && !ids.has(food)) problems.push(`${o.id} eats unknown '${food}'`);
      }
      if (o.pollinates && !ids.has(o.pollinates)) problems.push(`${o.id} pollinates unknown '${o.pollinates}'`);
    } else if (o.kind === 'producer') {
      if (!(o.area_m2 >= 0)) problems.push(`${o.id}: area_m2 must be ≥ 0`);
    } else problems.push(`${o.id}: unknown kind '${o.kind}'`);
  }
  return problems;
}

// ── Compile the roster into the engine's {species, interactions}. ──
export function buildCommunity(roster = ROSTER) {
  const problems = validateRoster(roster);
  if (problems.length) throw new Error('invalid roster: ' + problems.join('; '));
  const species = [], interactions = [];
  for (const o of roster) {
    if (o.kind === 'producer') {
      species.push({
        id: o.id, name: o.common, kind: 'producer', role: 'producer', sciName: o.sciName,
        initDensity: o.initDensity, area_m2: o.area_m2, fix: o.fix, autoResp: o.autoResp,
        turnover: o.turnover, harvestIndex: o.harvestIndex,
      });
    } else {
      const { species: sp, interactions: edges } = makeAnimal({
        id: o.id, name: o.common, mass_g: o.mass_g, guild: o.guild, thermy: o.thermy,
        count: o.count, initBio: o.initBio, eats: o.eats, halfSat: o.halfSat,
        plant: o.pollinates, fruitPerday: o.fruitPerday, pollHalfSat: o.pollHalfSat,
        capacityFrac: o.capacityFrac,
      });
      sp.sciName = o.sciName;
      if (o.override) Object.assign(sp, o.override);  // escape hatch for non-allometric guilds
      species.push(sp);
      interactions.push(...edges);
    }
  }
  return { species, interactions };
}

// ── Convenience: full params with the roster as the community. ──
export function rosterParams(roster = ROSTER) {
  const p = defaultParams();
  const c = buildCommunity(roster);
  p.species = c.species;
  p.interactions = c.interactions;
  return p;
}

const Roster = { ROSTER, validateRoster, buildCommunity, rosterParams };
if (typeof globalThis !== 'undefined') globalThis.Roster = Roster;
export default Roster;
