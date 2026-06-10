// biome/cycles/sim/cycles.mjs — closed-loop life-support box model for an infinite O'Neill cylinder.
//
// A *non-spatial* stocks-and-flows model of the cylinder interior run as a closed
// ECOSYSTEM (not a farm). It answers the question that has to be answered before any
// HVAC or weather model matters: **does the loop close?** — can a food web of
// producers, consumers and decomposers reach a steady state that feeds the crew and
// holds the air, how big must the buffers be, and where does the nitrogen go.
//
// Why an ecosystem and not a crop: a single crop pool with a passive litter-decay
// term has nothing vigorously cycling carbon, so ambient CO2 falls, productivity
// self-strangles, and the food store collapses to zero. Living decomposers, perennial
// standing biomass (fruit trees, swamp reeds), pollinators and their predators pump
// carbon around fast enough that the harvest outpaces the crew and food accumulates.
//
// Design choices that make this verifiable offline (the cylinder-solver ethos):
//
//   1. The carbon/oxygen/water loop is element-exact. EVERY interaction is either a
//      carbon transfer between pools or the canonical respiration reaction
//          CH2O + O2 -> CO2 + H2O        (respiration of any living thing)
//      whose exact reverse is photosynthesis
//          CO2 + H2O -> CH2O + O2.
//      Eating decomposes into ingestion = egestion(->litter) + respiration(->CO2) +
//      production(->consumer biomass): I = F + R + P, paired flux by paired flux.
//      Photosynthate is carbohydrate-equivalent (CH2O), so C, H and O conserve BY
//      CONSTRUCTION — the self-test checks the INTEGRATOR against that invariant,
//      not the algebra, no matter how many trophic levels are stacked.
//
//   2. Nitrogen rides a separate, element-conserving loop: fixation -> mineral ->
//      biomass -> litter -> mineralize -> denitrify -> N2. N moves with carbon on
//      every transfer (at the average biomass C:N), so N conserves exactly too.
//      The O2 cost of nitrification is a documented omission (KNOWN_SIMPLIFICATIONS)
//      — small next to the biotic C respiration that IS modelled.
//
//   3. Pure functions, no deps, no DOM. Runs identically in node and the browser;
//      the engine attaches to globalThis so a <script type=module> and a node import
//      both see `Biome`.
//
// Units: moles for all reactive species (so stoichiometry is trivially balanced),
// seconds for time. Helpers convert to kg / litres / kcal / m^2 / days at the edges.

// ─────────────────────────────────────────────────────────────────────────────
// Physical constants & molar masses
// ─────────────────────────────────────────────────────────────────────────────
export const M = { O2: 31.998, CO2: 44.009, H2O: 18.015, N2: 28.014, CH2O: 30.026, N: 14.007 };
const DAY = 86400; // s
const R_GAS = 8.314462618; // J/mol/K
// CH2O carbohydrate energy: glucose 2805 kJ/mol / 6 C = 467.5 kJ per mol CH2O-C.
export const KCAL_PER_MOL_CH2O = 467.5 / 4.184; // ≈ 111.7

// The living carbon pools (autotroph + heterotroph biomass) and the detritus pool.
// Order matters only for readability; all are mol CH2O-C.
export const PRODUCERS = ['crop', 'tree', 'reed'];           // autotroph guilds
export const CONSUMERS = ['pollinator', 'predator'];          // animal guilds
export const LIVING = [...PRODUCERS, ...CONSUMERS, 'decomposer'];
// Full integrated state keys (everything that evolves).
const KEYS = [
  'O2', 'CO2', 'N2', 'H2Ov', 'H2Ol',
  'crop', 'tree', 'reed', 'pollinator', 'predator', 'decomposer',
  'litter', 'food',
  'nMineral', 'nBiomass', 'nLitter',
];

// ─────────────────────────────────────────────────────────────────────────────
// Default parameters. Sourced from closed-ecology literature (BIOS-3, MELiSSA,
// Biosphere-2), ecological energetics, and NASA BVAD human factors. Every number
// is a knob; the dashboard exposes the load-bearing ones with generous ranges.
// ─────────────────────────────────────────────────────────────────────────────
export function defaultParams() {
  return {
    crew: 100,

    // ── Producer guilds: area (m^2) + gross fixation (mol CH2O-C / m^2 / lit-day) ──
    // Three guilds with different roles:
    //   crop  — annual, fast turnover, high harvest index → grain/veg to the food store
    //   tree  — perennial, large standing wood, fruit set GATED by pollinators
    //   reed  — wetland/swamp, very productive, mostly feeds detritus (and processes water/N)
    cropArea_m2: 3000,   cropFix: 1.7,
    treeArea_m2: 6000,   treeFix: 1.1,
    reedArea_m2: 4000,   reedFix: 2.0,
    photoperiod: 0.7,                 // fraction of 24h the linear sun is on
    autotrophRespFraction: 0.35,      // plant respiration as fraction of gross fixation
    co2_halfSat_Pa: 12,               // Michaelis CO2 partial pressure for fixation (Pa)

    // crop: turnover (harvest) and allocation
    cropTurnover_perday: 0.03,        // crop matures/cut per day (~33-day crop)
    cropHarvestIndex: 0.5,            // edible fraction of cut crop -> food
    cropSenescence_perday: 0.004,

    // tree: fruiting is pollinator-gated; wood/leaf cycles slowly
    treeFruitPotential_perday: 0.02,  // fraction of tree bio that COULD become fruit per day
    pollinatorHalfSat: 200,           // pollinator mol-C giving half-max fruit set
    treeLitterfall_perday: 0.006,     // leaf/branch drop -> litter
    treeMortality_perday: 0.0008,     // whole-tree death -> litter

    // reed: detritus factory + a little harvest (reedmace/cattail are edible)
    reedHarvestIndex: 0.1,            // small direct food contribution
    reedTurnover_perday: 0.02,        // reed dieback -> mostly litter

    // ── Consumers (ecological energetics: ingestion = egestion + respiration + production) ──
    // pollinators forage producer carbon (nectar/pollen). The carrying-capacity cap
    // (pollinatorCapFrac × producer biomass) prevents over-grazing structurally, so
    // ingestion is tuned for viability, not suppressed.
    pollinatorIngest_perday: 0.25,    // max ingestion per unit pollinator bio per day
    pollinatorForageHalfSat: 4000,    // producer bio giving half-max foraging (mol C)
    pollinatorAssim: 0.55,            // assimilation efficiency (rest egested -> litter)
    pollinatorResp_perday: 0.05,      // maintenance respiration per unit bio per day
    pollinatorMortality_perday: 0.02,
    pollinatorCapFrac: 0.012,         // carrying capacity = this × producer biomass (nesting/territory limit)

    // predators eat pollinators (bounded Lotka-Volterra + density dependence)
    predatorIngest_perday: 0.20,
    predatorPreyHalfSat: 120,         // pollinator bio giving half-max predation
    predatorAssim: 0.4,
    predatorResp_perday: 0.04,
    predatorMortality_perday: 0.015,
    predatorCapFrac: 0.06,            // carrying capacity = this × pollinator biomass

    // ── Decomposers: a LIVING pool that eats litter (replaces passive decay) ──
    // This makes decomposition a population that can bloom and crash — the
    // Biosphere-2 dynamic becomes emergent rather than a fixed rate.
    decomposerIngest_perday: 0.6,     // max litter ingestion per unit decomposer bio per day (microbes are fast)
    decomposerHalfSat: 10000,         // litter giving half-max decomposition (mol C)
    decomposerAssim: 0.35,            // assimilated fraction (rest egested back to litter)
    decomposerResp_perday: 0.04,      // of the assimilate, most is respired -> CO2 (the resupply)
    decomposerMortality_perday: 0.025,// dead microbes return to litter

    // ── Humans ── crew carbon burn derives from the calorie demand (single source of
    // truth): kcal/day ÷ (kcal per mol CH2O) = mol C/day respired, O2 consumed to match.
    // 2550 kcal/day ≈ 22.8 mol C/day ≈ 0.73 kg O2/day (consistent with BVAD's ~0.84).
    human_kcal_day: 2550,
    human_N_gday: 13,                 // protein N throughput at N balance
    foodSpoilage_perday: 0.01,        // surplus food rots -> litter (bounds the store, closes C)

    // ── Nitrogen loop ──
    biomassCN_molar: 30,              // average whole-biomass C:N
    nTurnover_perday: 0.01,           // biomass-N returning to litter per day (senescence/death)
    fixation_molN_m2_day: 0.015,      // biological N fixation per m^2 of reed+legume swamp
    fixArea_m2: 2000,                 // effective N-fixing wetland/legume area
    mineralizeFraction: 0.85,         // N released to mineral pool as litter is decomposed
    denitrify_perday: 0.004,          // mineral-N -> N2 (loss)

    // ── Atmosphere / water reservoir (sets partial pressures + buffer sizes) ──
    airVolume_m3: 100 * 50_000,       // 50,000 m^3 of air per person (a tall spun column)
    airTemp_K: 293.15,
    waterReservoir_L: 100 * 8000,     // free liquid water (lakes/swamp/soil/condensate), litres
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Initial state. Reactive inventories in mol; water split vapour/liquid.
// ─────────────────────────────────────────────────────────────────────────────
export function defaultState(p = defaultParams()) {
  const V = p.airVolume_m3, T = p.airTemp_K;
  const molAt = (Pa) => (Pa * V) / (R_GAS * T);
  const totalProducerC =
    p.cropArea_m2 * 6 + p.treeArea_m2 * 40 + p.reedArea_m2 * 10; // trees carry far more standing C
  return {
    t: 0,
    // gases (mol)
    O2:  molAt(21_000),
    CO2: molAt(100),     // 100 Pa ≈ 1000 ppm — habitat runs CO2-enriched, as controlled-env ag does
    N2:  molAt(79_000),
    H2Ov: molAt(1_500),
    H2Ol: (p.waterReservoir_L * 1000) / M.H2O,
    // living carbon pools (mol CH2O-C)
    crop: p.cropArea_m2 * 6,
    tree: p.treeArea_m2 * 40,
    reed: p.reedArea_m2 * 10,
    pollinator: 300,
    predator: 60,
    decomposer: 20000,
    // detritus + food
    litter: 6000,
    food: p.crew * 30 * 22,   // ~30 days of food buffer, 22 mol C/person/day
    // nitrogen pools (mol N)
    nMineral: 1500,
    nBiomass: totalProducerC / p.biomassCN_molar,
    nLitter: 15000 / p.biomassCN_molar,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
export function partialPressure(mol, p) { return (mol * R_GAS * p.airTemp_K) / p.airVolume_m3; }
export function totalPressure(s, p) { return partialPressure(s.O2 + s.CO2 + s.N2 + s.H2Ov, p); }
export function satVaporPressure_Pa(T_K) {
  const Tc = T_K - 273.15;
  return 610.78 * Math.exp((17.27 * Tc) / (Tc + 237.3));
}
export function relativeHumidity(s, p) {
  return partialPressure(s.H2Ov, p) / satVaporPressure_Pa(p.airTemp_K);
}
const mm = (x, half) => x / (x + half);       // Michaelis-Menten / Monod saturation
const safe = (x) => (x > 0 ? x : 0);

// ─────────────────────────────────────────────────────────────────────────────
// Derivatives: d(state)/dt in mol/s. The food web lives here.
//
// Convention: we accumulate every pool's rate into `d`, and the gas exchange is
// assembled from two running totals — total photosynthetic fixation (O2 out, CO2
// in, H2O in) and total respiration carbon (O2 in, CO2 out, H2O out). Because
// every eating event is split into egestion/respiration/production that all land
// in tracked pools, carbon is conserved regardless of how many couplings we add.
// ─────────────────────────────────────────────────────────────────────────────
export function derivatives(s, p) {
  const d = {}; for (const k of KEYS) d[k] = 0;
  let fix = 0;     // total gross photosynthesis (mol C/s) — O2 produced, CO2 fixed
  let resp = 0;    // total respiration carbon (mol C/s)    — O2 consumed, CO2 released
  let npp = 0;     // total net primary production (mol C/s) — drives mineral-N uptake
  const flux = {};

  // ── Producers: photosynthesis, autotroph respiration, allocation ──
  const co2Pa = partialPressure(s.CO2, p);
  const co2Lim = mm(co2Pa, p.co2_halfSat_Pa);
  const light = p.photoperiod;

  // crop
  {
    const gross = (p.cropFix * p.cropArea_m2 * co2Lim * light) / DAY;
    const ar = gross * p.autotrophRespFraction;
    const nppC = gross - ar;
    fix += gross; resp += ar; npp += nppC;
    const mat = (p.cropTurnover_perday * safe(s.crop)) / DAY;
    const harvest = mat * p.cropHarvestIndex;
    const residue = mat * (1 - p.cropHarvestIndex);
    const sen = (p.cropSenescence_perday * safe(s.crop)) / DAY;
    d.crop += nppC - mat - sen;
    d.food += harvest;
    d.litter += residue + sen;
    flux.cropHarvest = harvest;
  }

  // tree — fruit set gated by pollinator population (the mutualism the user wanted)
  {
    const gross = (p.treeFix * p.treeArea_m2 * co2Lim * light) / DAY;
    const ar = gross * p.autotrophRespFraction;
    const nppC = gross - ar;
    fix += gross; resp += ar; npp += nppC;
    const fruitSet = mm(safe(s.pollinator), p.pollinatorHalfSat);   // 0..1
    const fruit = (p.treeFruitPotential_perday * safe(s.tree)) / DAY * fruitSet;
    const fall = (p.treeLitterfall_perday * safe(s.tree)) / DAY;
    const mort = (p.treeMortality_perday * safe(s.tree)) / DAY;
    d.tree += nppC - fruit - fall - mort;
    d.food += fruit;
    d.litter += fall + mort;
    flux.treeFruit = fruit; flux.fruitSet = fruitSet;
  }

  // reed — detritus factory, small harvest
  {
    const gross = (p.reedFix * p.reedArea_m2 * co2Lim * light) / DAY;
    const ar = gross * p.autotrophRespFraction;
    const nppC = gross - ar;
    fix += gross; resp += ar; npp += nppC;
    const turn = (p.reedTurnover_perday * safe(s.reed)) / DAY;
    const harvest = turn * p.reedHarvestIndex;
    const detritus = turn * (1 - p.reedHarvestIndex);
    d.reed += nppC - turn;
    d.food += harvest;
    d.litter += detritus;
    flux.reedHarvest = harvest;
  }

  // ── A generic trophic transfer: ingestion split into egestion/respiration/production ──
  // Draws `ingest` mol C/s out of source pool(s) (by share), egests (1-assim) to
  // litter, respires `respRate*bio` of the consumer to CO2, and grows the consumer
  // with the remainder. Conserves carbon: ingest = egest + (assim->[resp+growth]).
  const eat = (consumerKey, ingest, assim, respPerday, sources) => {
    const bio = safe(s[consumerKey]);
    // pull ingestion proportionally from the source pools by their standing share
    const totalSrc = sources.reduce((a, k) => a + safe(s[k]), 0) || 1e-9;
    for (const k of sources) d[k] -= ingest * (safe(s[k]) / totalSrc);
    const egest = ingest * (1 - assim);            // feces -> litter
    const assimilated = ingest * assim;
    const maint = (respPerday * bio) / DAY;        // maintenance respiration -> CO2
    d.litter += egest;
    resp += maint;
    d[consumerKey] += assimilated - maint;         // production = net of respiration
  };

  // Density-dependent mortality: extra death as a pool approaches its carrying
  // capacity K (nesting sites / territory / disease). Logistic, so the population
  // saturates near K instead of blowing up and over-grazing — this is what damps
  // the predator–prey oscillation into a coexisting steady state.
  const crowdMort = (key, baseMortPerday, K) => {
    const bio = safe(s[key]);
    const mort = (baseMortPerday * bio * (1 + bio / Math.max(K, 1e-9))) / DAY;
    d[key] -= mort; d.litter += mort;
  };

  // pollinators forage producer biomass (nectar/pollen); gate tree fruit above
  {
    const forageBase = safe(s.crop) + safe(s.tree) + safe(s.reed);
    const ingest = (p.pollinatorIngest_perday * safe(s.pollinator)) / DAY
                 * mm(forageBase, p.pollinatorForageHalfSat);
    eat('pollinator', ingest, p.pollinatorAssim, p.pollinatorResp_perday, ['crop', 'tree', 'reed']);
    crowdMort('pollinator', p.pollinatorMortality_perday, p.pollinatorCapFrac * forageBase);
    flux.pollinatorIngest = ingest;
  }

  // predators eat pollinators (keep them from over-grazing / stabilise the web)
  {
    const ingest = (p.predatorIngest_perday * safe(s.predator)) / DAY
                 * mm(safe(s.pollinator), p.predatorPreyHalfSat);
    eat('predator', ingest, p.predatorAssim, p.predatorResp_perday, ['pollinator']);
    crowdMort('predator', p.predatorMortality_perday, p.predatorCapFrac * safe(s.pollinator));
    flux.predatorIngest = ingest;
  }

  // decomposers eat litter (the active, living decomposition term)
  {
    const ingest = (p.decomposerIngest_perday * safe(s.decomposer)) / DAY
                 * mm(safe(s.litter), p.decomposerHalfSat);
    eat('decomposer', ingest, p.decomposerAssim, p.decomposerResp_perday, ['litter']);
    const mort = (p.decomposerMortality_perday * safe(s.decomposer)) / DAY;
    d.decomposer -= mort; d.litter += mort;
    flux.decompIngest = ingest;
  }

  // ── Humans: eat food, respire it, waste -> litter ──
  const humanC = (p.human_kcal_day * p.crew / KCAL_PER_MOL_CH2O) / DAY;  // mol C/s demand (RQ≈1)
  const foodAvail = safe(s.food);
  const eaten = Math.min(humanC, foodAvail / DAY + Math.max(0, d.food)); // can't overdraw the store
  const humanResp = eaten * 0.92;        // most eaten C respired to CO2
  const humanWaste = eaten * 0.08;       // the rest egested -> litter
  d.food -= eaten;
  resp += humanResp;
  d.litter += humanWaste;
  // surplus food spoils back to the loop (bounds the store; this is what stops the
  // old runaway/collapse — inflow now balances against consumption + spoilage)
  const spoil = (p.foodSpoilage_perday * foodAvail) / DAY;
  d.food -= spoil; d.litter += spoil;

  // ── Gas exchange assembled from the two running totals ──
  d.O2  += fix - resp;
  d.CO2 += resp - fix;
  const h2o_fromResp = resp;     // 1 H2O per O2 in CH2O+O2->CO2+H2O
  const h2o_toPhoto = fix;       // 1 H2O per C fixed in CO2+H2O->CH2O+O2
  // relax vapour toward target RH via the liquid reservoir (transpiration/condensation)
  const targetRH = 0.85;
  const satMol = (targetRH * satVaporPressure_Pa(p.airTemp_K) * p.airVolume_m3) / (R_GAS * p.airTemp_K);
  const vaporRelax = (satMol - s.H2Ov) / (3 * DAY);
  d.H2Ov += (h2o_fromResp - h2o_toPhoto) + vaporRelax;
  d.H2Ol += -vaporRelax;

  // ── Nitrogen loop — four paired transfers, conserves total N exactly ──
  // Decoupled from the exact carbon routing (a documented simplification) but each
  // flux is matched mineral↔biomass↔litter↔mineral, with N2 as fixation/denitrify
  // endpoints. Uptake is driven by NPP (new tissue needs N) and limited by what's
  // available; mineralization tracks the litter carbon decomposers actually consume.
  const litterCN = safe(s.nLitter) > 0 ? safe(s.litter) / s.nLitter : p.biomassCN_molar;
  const fixN = (p.fixation_molN_m2_day * p.fixArea_m2) / DAY;                 // N2 -> mineral
  const mineralizeN = ((flux.decompIngest || 0) / Math.max(litterCN, 1e-9)) * p.mineralizeFraction; // litter -> mineral
  const denitrify = (p.denitrify_perday * safe(s.nMineral)) / DAY;           // mineral -> N2
  const uptakeWant = npp / p.biomassCN_molar;                                // mineral -> biomass (NPP demand)
  const uptake = Math.min(uptakeWant, safe(s.nMineral) / DAY + fixN + mineralizeN);
  const senescenceN = (p.nTurnover_perday * safe(s.nBiomass)) / DAY;         // biomass -> litter

  d.nBiomass += uptake - senescenceN;
  d.nLitter  += senescenceN - mineralizeN;
  d.nMineral += fixN + mineralizeN - uptake - denitrify;
  d.N2       += (denitrify - fixN) / 2;   // fluxes are mol-N atoms; N2 pool is mol-molecules

  return {
    d,
    flux: {
      ...flux,
      grossFix: fix, totalResp: resp,
      o2_net: fix - resp, co2_net: resp - fix,
      foodIn: (flux.cropHarvest || 0) + (flux.treeFruit || 0) + (flux.reedHarvest || 0),
      humanDemand: humanC, eaten, spoil,
      fixN, denitrify, uptake,
      calorieSupply_kcalday: ((flux.cropHarvest || 0) + (flux.treeFruit || 0) + (flux.reedHarvest || 0)) * DAY * KCAL_PER_MOL_CH2O,
      calorieDemand_kcalday: p.crew * p.human_kcal_day,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Integrator: classic RK4. Deterministic. dt in seconds.
// ─────────────────────────────────────────────────────────────────────────────
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
// Living pools + litter + food + CO2 are the carbon reservoirs; CH2O = 1C 2H 1O.
// ─────────────────────────────────────────────────────────────────────────────
export function elements(s) {
  const orgC = LIVING.reduce((a, k) => a + s[k], 0) + s.litter + s.food;
  const C = s.CO2 + orgC;
  const H = 2 * s.H2Ov + 2 * s.H2Ol + 2 * orgC;
  const O = 2 * s.O2 + 2 * s.CO2 + s.H2Ov + s.H2Ol + orgC;
  const N = 2 * s.N2 + s.nMineral + s.nBiomass + s.nLitter;
  return { C, H, O, N };
}

// human-readable snapshot at a point in time
export function snapshot(s, p) {
  const f = derivatives(s, p).flux;
  const totalBio = LIVING.reduce((a, k) => a + s[k], 0);
  return {
    day: s.t / DAY,
    o2_kPa: partialPressure(s.O2, p) / 1000,
    co2_ppm: (partialPressure(s.CO2, p) / totalPressure(s, p)) * 1e6,
    rh: relativeHumidity(s, p),
    totalP_kPa: totalPressure(s, p) / 1000,
    crop: s.crop, tree: s.tree, reed: s.reed,
    pollinator: s.pollinator, predator: s.predator, decomposer: s.decomposer,
    litter_molC: s.litter, food_molC: s.food, totalBio_molC: totalBio,
    waterL: (s.H2Ol * M.H2O) / 1000,
    nMineral: s.nMineral, nBiomass: s.nBiomass, nLitter: s.nLitter,
    o2_net_molday: f.o2_net * DAY,
    foodIn_molday: f.foodIn * DAY, foodDemand_molday: f.humanDemand * DAY,
    fruitSet: f.fruitSet,
    calorieSupply: f.calorieSupply_kcalday, calorieDemand: f.calorieDemand_kcalday,
    calorieRatio: f.calorieSupply_kcalday / f.calorieDemand_kcalday,
  };
}

export const KNOWN_SIMPLIFICATIONS = [
  'Nitrification O2 cost not coupled to the gas balance (small vs. biotic C respiration).',
  'All biomass shares one average C:N; per-guild stoichiometry not separated (N still conserves).',
  'Photosynthate is carbohydrate-equivalent (CH2O); lipid/protein energy density not split.',
  'Single well-mixed air box: no vertical (radial) structure — that lives in the atmosphere module.',
  'Temperature is a fixed parameter; no thermal feedback on metabolic rates yet.',
  'Trace-gas / ethylene buildup (a real closed-ecology hazard) not modelled.',
  'Pollination is a population gate, not individual flower visitation; predator guild is lumped.',
];

const Biome = {
  M, KCAL_PER_MOL_CH2O, PRODUCERS, CONSUMERS, LIVING,
  defaultParams, defaultState, derivatives, step, run,
  elements, snapshot, partialPressure, totalPressure, relativeHumidity,
  satVaporPressure_Pa, KNOWN_SIMPLIFICATIONS,
};
if (typeof globalThis !== 'undefined') globalThis.Biome = Biome;
export default Biome;
