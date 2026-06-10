// biome/cycles/sim/cycles.mjs — closed-ecosystem box model for an infinite O'Neill cylinder.
//
// A *non-spatial*, *data-driven* stocks-and-flows model of the cylinder interior as a
// living food web. The web is DATA: a list of `species` and a list of `interactions`
// between them. Adding a 7th, 12th, Nth organism is appending to those arrays — the
// derivative function loops over them, it has no per-species code. This is what makes
// the model an ecosystem *builder* rather than a fixed six-box farm.
//
// Why it stays verifiable no matter how many species you stack (the cylinder-solver
// ethos): conservation is STRUCTURAL, not per-species. Every flux is either
//   (a) the canonical respiration reaction  CH2O + O2 -> CO2 + H2O  (any living thing),
//       whose exact reverse is photosynthesis CO2 + H2O -> CH2O + O2, or
//   (b) a carbon transfer between tracked pools — eating decomposes into
//           ingestion = egestion(->litter) + assimilation(->consumer biomass),
//       and the assimilated carbon later leaves as maintenance respiration (->CO2) or
//       mortality (->litter). Nothing is created or destroyed; carbon just moves.
// Photosynthate is carbohydrate-equivalent (CH2O), so C, H and O conserve BY
// CONSTRUCTION; the self-test checks the RK4 INTEGRATOR against that invariant.
// Nitrogen rides a separate, independently conserving loop (fix -> mineral -> biomass
// -> litter -> mineralize -> denitrify -> N2), N moving with carbon at biomass C:N.
//
// Two species kinds:
//   • 'producer'   — fixes CO2 (light- and CO2-limited), respires a fraction back
//                    (autotroph respiration), turns biomass over into food + litter,
//                    and may set fruit gated by a pollinator (a pollination interaction).
//   • 'heterotroph'— grows only by eating (trophic interactions), pays maintenance
//                    respiration and density-dependent mortality. A "decomposer" is
//                    just a heterotroph whose trophic edge points at the litter pool;
//                    a "pollinator"/"predator" is one whose edge points at organisms.
//
// Pure functions, no deps, no DOM. Attaches to globalThis so node and a browser
// <script type=module> both see `Biome`. Units: mol for reactive species, seconds for t.

// ─────────────────────────────────────────────────────────────────────────────
// Physical constants & molar masses
// ─────────────────────────────────────────────────────────────────────────────
export const M = { O2: 31.998, CO2: 44.009, H2O: 18.015, N2: 28.014, CH2O: 30.026, N: 14.007 };
const DAY = 86400; // s
const R_GAS = 8.314462618; // J/mol/K
export const KCAL_PER_MOL_CH2O = 467.5 / 4.184; // ≈ 111.7 (glucose 2805 kJ/mol / 6C / 4.184)

// Non-species reservoirs that always exist.
const POOLS = ['O2', 'CO2', 'N2', 'H2Ov', 'H2Ol', 'litter', 'food', 'nMineral', 'nBiomass', 'nLitter'];
const mm = (x, half) => x / (x + half);   // Michaelis-Menten / Monod saturation
const safe = (x) => (x > 0 ? x : 0);

// ─────────────────────────────────────────────────────────────────────────────
// The default community — the six-organism web, now expressed as data. Each entry
// is an honest little "stat block"; new organisms follow the same shape. Rates are
// per-day; the engine divides by DAY internally.
//
// species fields:
//   id, name, kind('producer'|'heterotroph'), role (display label), initBio (mol C)
//   producer:    area_m2, fix(mol C/m²/lit-day), autoResp(0..1),
//                turnover/day (->food by harvestIndex, rest ->litter), harvestIndex
//   heterotroph: ingest/day (max, per unit biomass), assim(0..1),
//                resp/day (maintenance), mort/day, capacityFrac (K = frac × food base)
// interactions:
//   {type:'trophic',     consumer, resources:[ids or 'litter'], halfSat}  // who eats whom
//   {type:'pollinates',  animal, plant, halfSat, fruitPerday}             // gates plant fruit -> food
// ─────────────────────────────────────────────────────────────────────────────
export function defaultCommunity() {
  return {
    species: [
      // ── producers ── (initDensity is mol C/m²; starting biomass scales with area)
      { id: 'crop', name: 'Ground crops', kind: 'producer', role: 'producer',
        initDensity: 6, area_m2: 3000, fix: 1.7, autoResp: 0.35, turnover: 0.034, harvestIndex: 0.44 },
      { id: 'tree', name: 'Fruit trees', kind: 'producer', role: 'producer',
        initDensity: 40, area_m2: 6000, fix: 1.1, autoResp: 0.35, turnover: 0.0068, harvestIndex: 0 },
      { id: 'reed', name: 'Swamp reeds', kind: 'producer', role: 'producer',
        initDensity: 10, area_m2: 4000, fix: 2.0, autoResp: 0.35, turnover: 0.02, harvestIndex: 0.1 },
      // ── heterotrophs ──
      { id: 'pollinator', name: 'Pollinators', kind: 'heterotroph', role: 'pollinator',
        initBio: 300, ingest: 0.25, assim: 0.55, resp: 0.05, mort: 0.02, capacityFrac: 0.012 },
      { id: 'predator', name: 'Pollinator predators', kind: 'heterotroph', role: 'predator',
        initBio: 60, ingest: 0.20, assim: 0.40, resp: 0.04, mort: 0.015, capacityFrac: 0.06 },
      { id: 'decomposer', name: 'Decomposers', kind: 'heterotroph', role: 'decomposer',
        initBio: 20000, ingest: 0.6, assim: 0.35, resp: 0.04, mort: 0.025 },
    ],
    interactions: [
      { type: 'trophic', consumer: 'pollinator', resources: ['crop', 'tree', 'reed'], halfSat: 4000 },
      { type: 'trophic', consumer: 'predator', resources: ['pollinator'], halfSat: 120 },
      { type: 'trophic', consumer: 'decomposer', resources: ['litter'], halfSat: 10000 },
      { type: 'pollinates', animal: 'pollinator', plant: 'tree', halfSat: 200, fruitPerday: 0.02 },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Global parameters (everything not specific to one organism) + the community.
// ─────────────────────────────────────────────────────────────────────────────
export function defaultParams() {
  return {
    crew: 100,
    photoperiod: 0.7,            // fraction of 24h the linear sun is on
    co2_halfSat_Pa: 12,          // Michaelis CO2 partial pressure for fixation (Pa)

    // crew
    human_kcal_day: 2550,        // metabolic demand (single source of truth for C burn)
    human_N_gday: 13,
    foodSpoilage_perday: 0.01,   // surplus food rots -> litter (bounds the store)

    // nitrogen loop
    biomassCN_molar: 30,
    nTurnover_perday: 0.01,      // biomass-N -> litter
    fixation_molN_m2_day: 0.015, // biological N fixation per m² of fixing area
    fixArea_m2: 2000,
    mineralizeFraction: 0.85,
    denitrify_perday: 0.004,

    // atmosphere / water reservoir
    airVolume_m3: 100 * 50_000,
    airTemp_K: 293.15,
    waterReservoir_L: 100 * 8000,

    // the food web (data — append to grow it)
    ...defaultCommunity(),
  };
}

// the integrated state keys for a given community: every species + the fixed pools
export function stateKeys(p) { return [...p.species.map((s) => s.id), ...POOLS]; }

// ─────────────────────────────────────────────────────────────────────────────
// Initial state.
// ─────────────────────────────────────────────────────────────────────────────
// starting biomass: producers scale with area (initDensity × area), heterotrophs fixed.
const initBioOf = (sp) => sp.initDensity != null ? sp.initDensity * (sp.area_m2 || 0) : (sp.initBio || 0);

export function defaultState(p = defaultParams()) {
  const V = p.airVolume_m3, T = p.airTemp_K;
  const molAt = (Pa) => (Pa * V) / (R_GAS * T);
  const totalBio = p.species.reduce((a, s) => a + initBioOf(s), 0);
  const s = {
    t: 0,
    O2: molAt(21_000), CO2: molAt(100), N2: molAt(79_000), H2Ov: molAt(1_500),
    H2Ol: (p.waterReservoir_L * 1000) / M.H2O,
    litter: 6000,
    food: p.crew * 30 * 22,
    nMineral: 1500,
    nBiomass: totalBio / p.biomassCN_molar,
    nLitter: 6000 / p.biomassCN_molar,
  };
  for (const sp of p.species) s[sp.id] = initBioOf(sp);
  return s;
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

// ─────────────────────────────────────────────────────────────────────────────
// Derivatives: d(state)/dt in mol/s. Loops over species then interactions, so the
// code is independent of WHICH organisms are present. Two running totals — gross
// photosynthesis `fix` and total respiration `resp` — drive the gas exchange, and
// because every other flux moves carbon between tracked pools, carbon conserves.
// ─────────────────────────────────────────────────────────────────────────────
export function derivatives(s, p) {
  const d = {}; for (const k of stateKeys(p)) d[k] = 0;
  let fix = 0;       // total gross photosynthesis (mol C/s) — O2 out, CO2 in
  let resp = 0;      // total respiration carbon (mol C/s)   — O2 in, CO2 out
  let npp = 0;       // total net primary production -> drives mineral-N uptake
  let litterConsumed = 0;  // net C pulled out of the litter pool by detritivores
  const flux = { perSpecies: {}, fruitSet: 0, foodIn: 0 };
  const byId = Object.fromEntries(p.species.map((sp) => [sp.id, sp]));

  const co2Pa = partialPressure(s.CO2, p);
  const co2Lim = mm(co2Pa, p.co2_halfSat_Pa);
  const light = p.photoperiod;

  // ── Per-species autotrophy / metabolism / turnover ──
  for (const sp of p.species) {
    const B = safe(s[sp.id]);
    const f = flux.perSpecies[sp.id] = { bio: B, growth: 0, loss: 0 };
    if (sp.kind === 'producer') {
      const gross = (sp.fix * sp.area_m2 * co2Lim * light) / DAY;
      const ar = gross * sp.autoResp;
      const nppC = gross - ar;
      fix += gross; resp += ar; npp += nppC;
      const turn = (sp.turnover * B) / DAY;
      const harvest = turn * (sp.harvestIndex || 0);
      const toLitter = turn - harvest;
      d[sp.id] += nppC - turn;
      d.food += harvest; d.litter += toLitter;
      f.gross = gross; f.npp = nppC; f.harvest = harvest;
      flux.foodIn += harvest;
    } else {
      // heterotroph maintenance respiration + density-dependent mortality.
      // (growth is added by the interaction loop below.)
      const maint = ((sp.resp || 0) * B) / DAY;
      resp += maint; d[sp.id] -= maint;
      f.maint = maint;
    }
  }

  // ── Interactions: trophic transfers + pollination gates ──
  // First pass: compute per-consumer carrying-capacity base = Σ resource biomass.
  const capBase = {};
  for (const e of p.interactions) {
    if (e.type === 'trophic') {
      capBase[e.consumer] = (capBase[e.consumer] || 0) + e.resources.reduce((a, k) => a + safe(s[k]), 0);
    }
  }
  for (const e of p.interactions) {
    if (e.type === 'trophic') {
      const c = byId[e.consumer];
      const B = safe(s[e.consumer]);
      const forage = e.resources.reduce((a, k) => a + safe(s[k]), 0);
      const ingest = (c.ingest * B) / DAY * mm(forage, e.halfSat);
      const totalSrc = forage || 1e-9;
      for (const k of e.resources) {
        const pull = ingest * (safe(s[k]) / totalSrc);
        d[k] -= pull;
        if (k === 'litter') litterConsumed += pull;
      }
      const egest = ingest * (1 - c.assim);
      d.litter += egest;
      if (e.resources.includes('litter')) litterConsumed -= egest; // egest returns to litter
      d[e.consumer] += ingest * c.assim;     // assimilated -> growth
      flux.perSpecies[e.consumer].growth += ingest * c.assim;
    } else if (e.type === 'pollinates') {
      const plant = byId[e.plant];
      const set = mm(safe(s[e.animal]), e.halfSat);      // 0..1 fruit set
      const fruit = (e.fruitPerday * safe(s[e.plant])) / DAY * set;
      d[e.plant] -= fruit; d.food += fruit;
      flux.fruitSet = set; flux.foodIn += fruit;
      flux.perSpecies[e.plant].fruit = fruit;
    }
  }

  // ── Density-dependent mortality for heterotrophs (logistic; damps predator–prey) ──
  for (const sp of p.species) {
    if (sp.kind !== 'heterotroph') continue;
    const B = safe(s[sp.id]);
    const K = sp.capacityFrac ? sp.capacityFrac * (capBase[sp.id] || 0) : Infinity;
    const mort = ((sp.mort || 0) * B * (1 + B / Math.max(K, 1e-9))) / DAY;
    d[sp.id] -= mort; d.litter += mort;
    flux.perSpecies[sp.id].mort = mort;
  }

  // ── Humans: eat food, respire it, waste -> litter ──
  const humanC = (p.human_kcal_day * p.crew / KCAL_PER_MOL_CH2O) / DAY;   // mol C/s demand
  const foodAvail = safe(s.food);
  const eaten = Math.min(humanC, foodAvail / DAY + Math.max(0, d.food));
  resp += eaten * 0.92; d.litter += eaten * 0.08; d.food -= eaten;
  const spoil = (p.foodSpoilage_perday * foodAvail) / DAY;
  d.food -= spoil; d.litter += spoil;

  // ── Gas exchange from the two running totals ──
  d.O2 += fix - resp; d.CO2 += resp - fix;
  const targetRH = 0.85;
  const satMol = (targetRH * satVaporPressure_Pa(p.airTemp_K) * p.airVolume_m3) / (R_GAS * p.airTemp_K);
  const vaporRelax = (satMol - s.H2Ov) / (3 * DAY);
  d.H2Ov += (resp - fix) + vaporRelax;   // 1 H2O per O2 respired, consumed per C fixed
  d.H2Ol += -vaporRelax;

  // ── Nitrogen: four paired transfers, conserves total N exactly ──
  const litterCN = safe(s.nLitter) > 0 ? safe(s.litter) / s.nLitter : p.biomassCN_molar;
  const fixN = (p.fixation_molN_m2_day * p.fixArea_m2) / DAY;
  const mineralizeN = (Math.max(litterConsumed, 0) / Math.max(litterCN, 1e-9)) * p.mineralizeFraction;
  const denitrify = (p.denitrify_perday * safe(s.nMineral)) / DAY;
  const uptakeWant = npp / p.biomassCN_molar;
  const uptake = Math.min(uptakeWant, safe(s.nMineral) / DAY + fixN + mineralizeN);
  const senescenceN = (p.nTurnover_perday * safe(s.nBiomass)) / DAY;
  d.nBiomass += uptake - senescenceN;
  d.nLitter += senescenceN - mineralizeN;
  d.nMineral += fixN + mineralizeN - uptake - denitrify;
  d.N2 += (denitrify - fixN) / 2;

  return {
    d,
    flux: {
      ...flux,
      grossFix: fix, totalResp: resp,
      o2_net: fix - resp, co2_net: resp - fix,
      humanDemand: humanC, eaten, spoil, fixN, denitrify, uptake,
      calorieSupply_kcalday: flux.foodIn * DAY * KCAL_PER_MOL_CH2O,
      calorieDemand_kcalday: p.crew * p.human_kcal_day,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Integrator: classic RK4. Deterministic. dt in seconds.
// ─────────────────────────────────────────────────────────────────────────────
function addScaled(base, delta, keys, h) {
  const out = { ...base };
  for (const k of keys) out[k] = base[k] + h * delta[k];
  return out;
}
export function step(s, p, dt) {
  const keys = stateKeys(p);
  const k1 = derivatives(s, p).d;
  const k2 = derivatives({ ...addScaled(s, k1, keys, dt / 2), t: s.t }, p).d;
  const k3 = derivatives({ ...addScaled(s, k2, keys, dt / 2), t: s.t }, p).d;
  const k4 = derivatives({ ...addScaled(s, k3, keys, dt), t: s.t }, p).d;
  const out = { ...s, t: s.t + dt };
  for (const k of keys) out[k] = s[k] + (dt / 6) * (k1[k] + 2 * k2[k] + 2 * k3[k] + k4[k]);
  for (const k of keys) if (out[k] < 0 && out[k] > -1e-6) out[k] = 0;
  return out;
}

export function run(p = defaultParams(), s0 = defaultState(p), days = 600, dtHours = 3, sampleDays = 4) {
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
// Organic C = every living pool + litter + food; CH2O = 1C 2H 1O.
// ─────────────────────────────────────────────────────────────────────────────
export function elements(s, p) {
  const orgC = p.species.reduce((a, sp) => a + s[sp.id], 0) + s.litter + s.food;
  return {
    C: s.CO2 + orgC,
    H: 2 * s.H2Ov + 2 * s.H2Ol + 2 * orgC,
    O: 2 * s.O2 + 2 * s.CO2 + s.H2Ov + s.H2Ol + orgC,
    N: 2 * s.N2 + s.nMineral + s.nBiomass + s.nLitter,
  };
}

export function snapshot(s, p) {
  const f = derivatives(s, p).flux;
  const totalBio = p.species.reduce((a, sp) => a + s[sp.id], 0);
  const snap = {
    day: s.t / DAY,
    o2_kPa: partialPressure(s.O2, p) / 1000,
    co2_ppm: (partialPressure(s.CO2, p) / totalPressure(s, p)) * 1e6,
    rh: relativeHumidity(s, p),
    totalP_kPa: totalPressure(s, p) / 1000,
    litter_molC: s.litter, food_molC: s.food, totalBio_molC: totalBio,
    waterL: (s.H2Ol * M.H2O) / 1000,
    nMineral: s.nMineral, nBiomass: s.nBiomass, nLitter: s.nLitter,
    o2_net_molday: f.o2_net * DAY,
    foodIn_molday: f.foodIn * DAY, foodDemand_molday: f.humanDemand * DAY,
    fruitSet: f.fruitSet,
    calorieSupply: f.calorieSupply_kcalday, calorieDemand: f.calorieDemand_kcalday,
    calorieRatio: f.calorieSupply_kcalday / f.calorieDemand_kcalday,
    bio: {},
  };
  for (const sp of p.species) { snap[sp.id] = s[sp.id]; snap.bio[sp.id] = s[sp.id]; }
  return snap;
}

export const KNOWN_SIMPLIFICATIONS = [
  'Nitrification O2 cost not coupled to the gas balance (small vs. biotic C respiration).',
  'All biomass shares one average C:N; per-guild stoichiometry not separated (N still conserves).',
  'Photosynthate is carbohydrate-equivalent (CH2O); lipid/protein energy density not split.',
  'Single well-mixed air box: no vertical (radial) structure — that lives in the atmosphere module.',
  'Temperature is a fixed parameter; no thermal feedback on metabolic rates yet.',
  'Pollination is a population gate, not individual flower visitation.',
  'Metabolic rates are entered per-species, not yet derived from body mass (allometry layer is next).',
];

const Biome = {
  M, KCAL_PER_MOL_CH2O, defaultCommunity, defaultParams, defaultState, stateKeys,
  derivatives, step, run, elements, snapshot, partialPressure, totalPressure,
  relativeHumidity, satVaporPressure_Pa, KNOWN_SIMPLIFICATIONS,
};
if (typeof globalThis !== 'undefined') globalThis.Biome = Biome;
export default Biome;
