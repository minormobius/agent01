// hoop/forge/ledger.js — THE UNIFIED ELEMENT LEDGER: biome (life-support) ⊕ forge (industry) on ONE ledger.
//
// The package's zeroth question is biome's: can the life-support loop close as stocks and flows? This is
// the SAME question one element-ledger wider — adding the industrial half (robots, chips, pumps) the forge
// makes, coupled to the living half biome runs. biome is vendored verbatim (vendor/biome/) and owns the
// BIOTIC elements C·H·O·N (it conserves them by construction). The forge owns the INDUSTRIAL elements
// (Si·Fe·Al·Cu·Ti·Ni·P·S·Ca·RE) and the industrial fluxes of carbon. They couple at the shared pools:
//
//   biome ──(biomass / food: organic C,H,O)──► forge living products (carbon fiber, bioplastic, food goods)
//   forge ──(CO₂ + mineral N, from recyclers/digester)──► biome   ← closes the bio elements
//   the CREW eats O₂+food+water (biome) and wears products (forge) — the node that joins them
//
// THE CARBON PUMP, mechanical: the forge locks biomass-carbon into long-lived structure (woven carbon
// fiber → hull/cable). At steady state biome must FIX CO₂ at the rate the forge sequesters it. The pump
// rate = the forge's net carbon into structure. Your hypothesis falls out of the ledger.
//
// Unit: kilograms. biome runs in mol (atom-mol from its `elements()`); we convert via atomic masses. The
// forge is in product-units × a nominal unit mass (1 kg/unit for v1) × composition. Pure + deterministic;
// node-tested in test/ledger.selftest.mjs. (Energetics — tide — is the next seam, tracked but not here.)

import { step, defaultParams, defaultState, elements as biomeElements, snapshot as biomeSnap } from './vendor/biome/cycles.mjs';
import { ELEMENTS, ELEMENT, PRODUCTS, PRODUCT, composition } from './catalogue.js';
import { populationDemand } from './needs.js';
import { COVERED, chemCycle } from './chem.js';

export const ATOMIC = { H: 1.008, C: 12.011, N: 14.007, O: 15.999, Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Ca: 40.078, Ti: 47.867, Fe: 55.845, Ni: 58.693, Cu: 63.546, RE: 144.24 };
export const BIOTIC = ['C', 'H', 'O', 'N'];                                            // biome's conserved ledger
export const INDUSTRIAL = ELEMENTS.map((e) => e.sym).filter((s) => !BIOTIC.includes(s));
export const UNIT_MASS_KG = 1;                                                          // nominal kg per product-unit (v1)

// ── biome side: integrate the vendored box model to (near) steady state, read its element ledger (atom-mol
// → kg) + life-support fluxes (the crew's O₂/food, and the NPP surplus the forge can draw on). biome is
// SIZED to the population (crew = people, producer area scaled from its crew:100 default) and a `growFactor`
// over-grows it — the dial that decides whether there's carbon surplus to feed industry + run the pump.
// A forge "step" is one DAY, so its flows are commensurate with biome's per-day fluxes. ──
export function biomeState({ days = 250, dtHours = 6, people = 100, growFactor = 1, params } = {}) {
  const p = params || defaultParams();
  const areaScale = (people / (p.crew || 100)) * growFactor;
  p.crew = people;
  if (p.fixArea_m2) p.fixArea_m2 *= areaScale;
  for (const sp of (p.species || [])) if (sp.area_m2) sp.area_m2 *= areaScale;          // scale the producers (NPP ∝ area)
  const dt = dtHours * 3600, steps = Math.round((days * 86400) / dt);
  let s = defaultState(p);
  for (let i = 0; i < steps; i++) s = step(s, p, dt);
  const elMol = biomeElements(s, p), snap = biomeSnap(s, p);
  const elKg = {}; for (const e of BIOTIC) elKg[e] = elMol[e] * ATOMIC[e] / 1000;       // atom-mol → kg
  // life-support + carbon throughput (mol C/day → kg C/day): photosynthesis fixes carbon; NPP surplus is
  // what's left after the crew eats — the budget the forge's living products draw from.
  const co2FixKgDay = Math.max(0, snap.foodIn_molday) * ATOMIC.C / 1000;               // organic C fixed into food/biomass
  const crewFoodKgDay = Math.max(0, snap.foodDemand_molday) * ATOMIC.C / 1000;         // carbon the crew consumes
  return { p, s, elMol, snap, elKg, o2NetKgDay: snap.o2_net_molday * ATOMIC.O * 2 / 1000, co2FixKgDay, crewFoodKgDay, nppSurplusKgC: Math.max(0, co2FixKgDay - crewFoodKgDay) };
}

// ── forge side: a product-demand vector (units/step) → element MASS flow (kg/step), split into the carbon
// drawn from BIOMASS (living products) vs the industrial elements drawn from forge reserves. ──
export function forgeElementFlow(demand = {}) {
  const flow = Object.fromEntries(ELEMENTS.map((e) => [e.sym, 0]));
  let bioCarbonKg = 0, industrialKg = 0;
  for (const [id, units] of Object.entries(demand)) {
    const p = PRODUCT[id]; if (!p || units <= 0) continue;
    const comp = composition(id), massKg = units * UNIT_MASS_KG;
    for (const [el, frac] of Object.entries(comp)) {
      const kg = massKg * frac; flow[el] += kg;
      if (p.living && BIOTIC.includes(el)) bioCarbonKg += el === 'C' ? kg : 0;          // living products' carbon comes from biome
      if (INDUSTRIAL.includes(el)) industrialKg += kg;
    }
  }
  return { flow, bioCarbonKg, industrialKg };
}

// ── the coupling + the carbon pump: how much of the forge's living-product carbon is LOCKED into long-lived
// structure (the pump) vs cycles back fast, and whether biome's NPP surplus can feed the draw. ──
const STRUCTURAL_LIVING = new Set(['carbon_fiber', 'cf_cable']);   // the carbon that gets parked in the hull
export function carbonPump(demand = {}) {
  let lockedKgC = 0, fastKgC = 0;
  for (const [id, units] of Object.entries(demand)) {
    const p = PRODUCT[id]; if (!p || !p.living || units <= 0) continue;
    const cKg = units * UNIT_MASS_KG * (composition(id).C || 0);
    if (STRUCTURAL_LIVING.has(id)) lockedKgC += cKg; else fastKgC += cKg;
  }
  return { lockedKgC, fastKgC, totalDrawKgC: lockedKgC + fastKgC };
}

// ── THE UNIFIED ENGINE: a population's needs → biome life-support + forge production on one element ledger.
// Reports, per element: which metabolism moves it (biotic / industrial / shared), the flow, and whether the
// loop CLOSES — biome closes C/H/O/N by construction; the forge's industrial elements close via recycling
// (small makeup); the SHARED carbon closes only if biome's NPP surplus covers the forge's carbon draw. ──
export function unifiedLedger({ people = 1000, biomeDays = 250, growFactor = 1 } = {}) {
  const { demand } = populationDemand(people);
  const biome = biomeState({ days: biomeDays, people, growFactor });
  const forge = forgeElementFlow(demand);
  const pump = carbonPump(demand);
  const perElement = {};
  for (const e of ELEMENTS) {
    const sym = e.sym, biotic = BIOTIC.includes(sym);
    const forgeKg = forge.flow[sym] || 0;
    const row = { sym, name: e.name, metabolism: biotic ? (forgeKg > 0 ? 'shared' : 'biotic') : 'industrial', forgeFlowKg: +forgeKg.toFixed(2) };
    if (biotic) row.biomeStockKg = +(biome.elKg[sym] || 0).toFixed(1);
    perElement[sym] = row;
  }
  // the shared-carbon closure: biome must fix the forge's carbon draw on top of feeding the crew.
  const carbonClosed = biome.nppSurplusKgC >= pump.totalDrawKgC;
  perElement.C.closes = carbonClosed;
  perElement.C.nppSurplusKgCDay = +biome.nppSurplusKgC.toFixed(2);
  perElement.C.forgeCarbonDrawKg = +pump.totalDrawKgC.toFixed(2);
  perElement.C.pumpLockedKgC = +pump.lockedKgC.toFixed(2);
  return {
    people, demand, biome: { o2NetKgDay: +biome.o2NetKgDay.toFixed(1), crewFoodKgDay: +biome.crewFoodKgDay.toFixed(2), nppSurplusKgC: +biome.nppSurplusKgC.toFixed(2), elKg: biome.elKg, snap: biome.snap },
    forge: { industrialKg: +forge.industrialKg.toFixed(1), bioCarbonKg: +forge.bioCarbonKg.toFixed(2) },
    pump, perElement, carbonClosed,
    elements: ELEMENTS,
  };
}

// per-element index for the periodic-table → Sankey endpoint: for an element, which metabolism(s) carry it
// and which products embody it (the Sankey's nodes). The Sankey loops because both halves are closed.
export function elementFlows(sym) {
  const biotic = BIOTIC.includes(sym);
  const inProducts = PRODUCTS.map((p) => ({ id: p.id, loop: p.loop, living: !!p.living, frac: composition(p.id)[sym] || 0 }))
    .filter((x) => x.frac > 0).sort((a, b) => b.frac - a.frac);
  return { sym, name: (ELEMENT[sym] || {}).name, metabolism: biotic ? 'shared/biotic' : 'industrial', biotic, inProducts };
}

// ── the per-element CLOSED CYCLE — the looping-Sankey data. Every cycle returns to its source pool, so the
// chart loops back on itself. Magnitudes come from the unified ledger (kg/day). Three shapes: the carbon
// GRAND LOOP (biome + forge + the pump), a generic biotic loop (N/O/H), and the industrial ring (the rest).
function industrialCycle(sym, u) {
  const F = Math.max(0.1, u.perElement[sym].forgeFlowKg || 0), recycled = F * 0.92, makeup = F - recycled;
  return {
    unit: 'kg/day', flow: +F.toFixed(1),
    nodes: [
      { id: 'pool', label: sym + ' stock', kind: 'pool' }, { id: 'refine', label: 'Refine', kind: 'process' },
      { id: 'fab', label: 'Fabricate', kind: 'process' }, { id: 'asm', label: 'Assemble', kind: 'process' },
      { id: 'use', label: 'In use', kind: 'use' }, { id: 'wear', label: 'Wear', kind: 'process' },
      { id: 'reclaim', label: 'Reclaim', kind: 'recover' }, { id: 'reserve', label: 'Reserve', kind: 'reserve' },
    ],
    links: [
      { from: 'pool', to: 'refine', value: F, kind: 'flow' }, { from: 'refine', to: 'fab', value: F, kind: 'flow' },
      { from: 'fab', to: 'asm', value: F, kind: 'flow' }, { from: 'asm', to: 'use', value: F, kind: 'flow' },
      { from: 'use', to: 'wear', value: F, kind: 'flow' }, { from: 'wear', to: 'reclaim', value: F, kind: 'flow' },
      { from: 'reclaim', to: 'pool', value: recycled, kind: 'recycle' }, { from: 'reserve', to: 'pool', value: makeup, kind: 'makeup' },
    ],
  };
}
function carbonCycle(u) {
  const crew = Math.max(0.01, u.biome.crewFoodKgDay), forge = Math.max(0, u.pump.totalDrawKgC);
  const locked = Math.max(0, u.pump.lockedKgC), fast = Math.max(0, forge - locked), fix = crew + forge;
  return {
    unit: 'kgC/day', flow: +fix.toFixed(1),
    nodes: [
      { id: 'air', label: 'Atmosphere · CO₂', kind: 'pool' }, { id: 'photo', label: 'Photosynthesis', kind: 'biome' },
      { id: 'biomass', label: 'Biomass', kind: 'biome' }, { id: 'crew', label: 'Crew', kind: 'crew' },
      { id: 'forge', label: 'Forge', kind: 'forge' }, { id: 'fiber', label: 'Carbon fiber', kind: 'forge' },
      { id: 'struct', label: 'Structure · locked', kind: 'pump' },
    ],
    links: [
      { from: 'air', to: 'photo', value: fix, kind: 'flow' }, { from: 'photo', to: 'biomass', value: fix, kind: 'flow' },
      { from: 'biomass', to: 'crew', value: crew, kind: 'flow' }, { from: 'crew', to: 'air', value: crew, kind: 'recycle' },
      { from: 'biomass', to: 'forge', value: forge, kind: 'flow' }, { from: 'forge', to: 'fiber', value: forge, kind: 'flow' },
      { from: 'fiber', to: 'air', value: fast, kind: 'recycle' }, { from: 'fiber', to: 'struct', value: locked, kind: 'pump' },
      { from: 'struct', to: 'air', value: locked, kind: 'pump' },
    ],
  };
}
function bioticCycle(sym, u) {
  const F = Math.max(0.1, u.perElement[sym].forgeFlowKg || 0), bio = F * 4 + 10;   // biome cycles much more of it than the forge taps
  return {
    unit: 'kg/day', flow: +bio.toFixed(1),
    nodes: [
      { id: 'pool', label: sym + ' pool', kind: 'pool' }, { id: 'uptake', label: 'Biome uptake', kind: 'biome' },
      { id: 'biomass', label: 'Biomass', kind: 'biome' }, { id: 'litter', label: 'Litter', kind: 'biome' },
      { id: 'decomp', label: 'Decompose', kind: 'biome' }, { id: 'forge', label: 'Forge tap', kind: 'forge' },
    ],
    links: [
      { from: 'pool', to: 'uptake', value: bio, kind: 'flow' }, { from: 'uptake', to: 'biomass', value: bio, kind: 'flow' },
      { from: 'biomass', to: 'litter', value: bio - F, kind: 'flow' }, { from: 'litter', to: 'decomp', value: bio - F, kind: 'flow' },
      { from: 'decomp', to: 'pool', value: bio - F, kind: 'recycle' }, { from: 'biomass', to: 'forge', value: F, kind: 'flow' },
      { from: 'forge', to: 'pool', value: F, kind: 'recycle' },
    ],
  };
}
export function elementCycle(sym, { people = 1000, growFactor = 3, u } = {}) {
  u = u || unifiedLedger({ people, growFactor });
  const E = ELEMENT[sym] || {};
  const top = elementFlows(sym).inProducts.slice(0, 6).map((x) => ({ id: x.id, name: (PRODUCT[x.id] || {}).name, glyph: (PRODUCT[x.id] || {}).glyph, frac: +x.frac.toFixed(3) }));
  let base;
  if (COVERED.includes(sym)) {
    // the MOLECULAR cycle — real named processes + molecules + considered endpoints (chem.js), scaled to
    // this element's ledger flow. Carbon's throughput is the fixed carbon (crew + the pump draw).
    const flow = sym === 'C' ? (Math.max(0.01, u.biome.crewFoodKgDay) + Math.max(0, u.pump.totalDrawKgC))
      : BIOTIC.includes(sym) ? ((u.perElement[sym].forgeFlowKg || 0) * 4 + 10)
      : Math.max(0.1, u.perElement[sym].forgeFlowKg || 0);
    base = chemCycle(sym, flow); base.flow = +flow.toFixed(1); base.molecular = true;
  } else {
    base = BIOTIC.includes(sym) ? bioticCycle(sym, u) : industrialCycle(sym, u);
  }
  return { sym, name: E.name, metabolism: BIOTIC.includes(sym) ? (sym === 'C' ? 'shared' : 'biotic') : 'industrial', closes: sym === 'C' ? u.carbonClosed : true, topProducts: top, ...base };
}
