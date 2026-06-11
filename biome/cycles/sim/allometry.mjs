// biome/cycles/sim/allometry.mjs — body mass -> stat block.
//
// The data-driven engine (cycles.mjs) eats a `species` stat block: ingest, assim,
// resp, mort, capacityFrac. Hand-tuning eight numbers per organism doesn't scale to
// a roster of real creatures. This layer DERIVES the heterotroph stat block from ONE
// observable trait — body mass — plus two categorical tags (thermy, feeding guild).
// That's the bridge from "a real animal" (an iNaturalist identity with a known mass
// and a GloBI diet) to "a species the box model can integrate".
//
// The physics is Kleiber's law: whole-organism metabolic rate scales as M^(3/4), so
// the MASS-SPECIFIC rate — which is what the box model needs, because its pools are
// biomass (mol C), not individuals — scales as M^(-1/4). Small things live fast
// (high per-gram ingestion, respiration, mortality); big things live slow. Endotherms
// burn ~an order of magnitude faster than equal-mass ectotherms. Feeding guild sets
// assimilation efficiency (how much of what you eat you keep) and tissue C:N.
//
// References (constants are anchored, not invented):
//   Kleiber 1932; West/Brown/Enquist 1997 — 3/4-power metabolic scaling.
//   Nagy 2005 — field metabolic rate ≈ 2–3× BMR (folded into the anchors).
//   Makarieva et al. 2008 — endotherm/ectotherm mass-specific metabolism ~ ×10–30.
//   Yodzis & Innes 1992; Lindeman 1942 — assimilation efficiency by trophic guild.
//   Peterson & Wroblewski 1984 — natural mortality ∝ M^(−1/4).
//
// Calibration check (see the self-test): anchored on the honeybee (0.1 g ectotherm
// nectarivore → the tuned pollinator), this layer REPRODUCES the hand-tuned default
// predator as a ~0.3 g ectotherm carnivore to within a few percent — i.e. the working
// community was already allometrically consistent. That's the validation.
//
// Pure functions, no deps. Attaches to globalThis alongside Biome.

const M0 = 1;            // reference body mass, grams
const EXP = -0.25;       // mass-specific rate exponent (M^(3/4) per individual → M^(−1/4) per gram)

// Anchors at 1 g, ectotherm. Chosen so a 0.1 g ectotherm reproduces the tuned
// pollinator (resp 0.05/d, max ingest 0.25/d, mortality 0.02/d):
//   0.1^(−1/4) = 1.7783, so e.g. 0.0281 × 1.7783 = 0.0500.
const RESP_1G_ECTO   = 0.0281;   // maintenance respiration, /day, per unit biomass C
const INGEST_1G_ECTO = 0.1406;   // maximum specific ingestion, /day
const MORT_1G        = 0.01125;  // natural mortality, /day (no thermy term — see below)

// Endotherms pay ~×18 the maintenance & ingestion of an equal-mass ectotherm. Mortality
// is NOT multiplied: a warm body burns faster but isn't intrinsically shorter-lived at a
// given mass (Peterson–Wroblewski mortality tracks mass, not thermy).
const THERMY = { ecto: 1, endo: 18 };

// Feeding guilds. `assim` = assimilation efficiency (fraction of ingested C retained,
// the rest egested → litter). `cn` = tissue C:N molar (informational; the engine still
// uses one global C:N — animal biomass is a tiny share of total N). `kind`/`eatsKind`
// describe what the engine wires up. `capacityFrac` = default density-dependence.
export const GUILDS = {
  nectarivore: { assim: 0.55, cn: 6,  eatsKind: 'producer',    capacityFrac: 0.012, pollinates: true },
  herbivore:   { assim: 0.45, cn: 6,  eatsKind: 'producer',    capacityFrac: 0.012 },
  carnivore:   { assim: 0.85, cn: 5,  eatsKind: 'animal',      capacityFrac: 0.06  },
  omnivore:    { assim: 0.6,  cn: 6,  eatsKind: 'mixed',       capacityFrac: 0.04  },
  detritivore: { assim: 0.3,  cn: 8,  eatsKind: 'litter',      capacityFrac: 0     },
};

// ── Core scaling laws (mass-specific, per day) ──
export function specificRespiration(mass_g, thermy = 'ecto') {
  return RESP_1G_ECTO * (THERMY[thermy] ?? 1) * Math.pow(mass_g / M0, EXP);
}
export function maxIngestion(mass_g, thermy = 'ecto') {
  return INGEST_1G_ECTO * (THERMY[thermy] ?? 1) * Math.pow(mass_g / M0, EXP);
}
export function naturalMortality(mass_g) {
  return MORT_1G * Math.pow(mass_g / M0, EXP);
}

// ── Individuals <-> biomass pool (mol C) ──
// Animal wet mass → carbon: ~30% dry, ~50% C of dry ⇒ 0.15 g C / g wet ⇒ /12.011 g/mol.
const G_C_PER_G_WET = 0.15;
const G_PER_MOL_C = 12.011;
export const bodyToBiomass = (count, mass_g) => (count * mass_g * G_C_PER_G_WET) / G_PER_MOL_C;
export const biomassToBodies = (molC, mass_g) => (molC * G_PER_MOL_C) / (G_C_PER_G_WET * mass_g);

// ── The headline call: an organism's traits → a cycles.mjs heterotroph stat block ──
//   { id, name, mass_g, guild, thermy?, count?, capacityFrac? }
// Returns the species entry; pair it with an interaction edge (see makeAnimal).
export function animalStatBlock(o) {
  const g = GUILDS[o.guild];
  if (!g) throw new Error(`unknown guild '${o.guild}' (have: ${Object.keys(GUILDS).join(', ')})`);
  const thermy = o.thermy ?? 'ecto';
  return {
    id: o.id, name: o.name ?? o.id, kind: 'heterotroph', role: o.guild,
    mass_g: o.mass_g, thermy, guild: o.guild,
    initBio: o.count != null ? bodyToBiomass(o.count, o.mass_g) : (o.initBio ?? 1),
    ingest: maxIngestion(o.mass_g, thermy),
    assim: g.assim,
    resp: specificRespiration(o.mass_g, thermy),
    mort: naturalMortality(o.mass_g),
    capacityFrac: o.capacityFrac ?? g.capacityFrac,
    cn: g.cn,
  };
}

// Build {species, interactions[]} for one animal in one call. `eats` is a list of
// species ids (or 'litter'); `halfSat` is the Monod half-saturation for foraging.
// If the guild pollinates and `plant` is given, also emits a pollination edge.
export function makeAnimal(o) {
  const species = animalStatBlock(o);
  const interactions = [];
  if (o.eats?.length) {
    interactions.push({ type: 'trophic', consumer: o.id, resources: o.eats, halfSat: o.halfSat ?? 1000 });
  }
  if (GUILDS[o.guild].pollinates && o.plant) {
    interactions.push({ type: 'pollinates', animal: o.id, plant: o.plant,
      halfSat: o.pollHalfSat ?? 200, fruitPerday: o.fruitPerday ?? 0.02 });
  }
  return { species, interactions };
}

const Allometry = {
  GUILDS, specificRespiration, maxIngestion, naturalMortality,
  bodyToBiomass, biomassToBodies, animalStatBlock, makeAnimal,
  M0, EXP, THERMY,
};
if (typeof globalThis !== 'undefined') globalThis.Allometry = Allometry;
export default Allometry;
