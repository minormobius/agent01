// econ.js — THE UPPERRIND PRODUCTION SOLVER. The map (upperrind) SUPPOSES the material flows; this SOLVES
// them. It is the industrial cousin of hoop/econ + hoop/forge: a closed-loop production economy over the
// eight engines (engines.js), with the FLOWS computed from a demand setpoint and TWO populations that gate
// throughput — logistics bots (the haulers) and the six white-collar ops. Pure, deterministic, node-tested.
//
// WHY A SOLVER. engines.js carries the topology (who feeds whom) but no RATES — intake is a list, not an
// amount. So the map can only draw "assembly takes stock+polymer+circuit+cloth", never "…at 2:1:1:1, so a
// throughput of P products needs the foundry running at 2P". This module adds the missing stoichiometry
// (RECIPES) and back-propagates a product setpoint through the supply chain to every engine's run-rate and
// every edge's flow — the Factorio solve, forge-style.
//
// THE TWO POPULATIONS (the thing the map hand-waved). Production is not free: it is run by people and bots.
//   • LOGISTICS BOTS — the droids. They haul every commodity along every supply-chain edge; their capacity
//     is a hard ceiling on how much material can move. Under-crewed ⇒ the whole factory throttles.
//   • THE SIX WHITE-COLLAR OPS — the whites aren't decoration, they RUN the plant. Each governs one lever:
//       perfusion → maintenance (machine uptime)      schedule → planning (throughput coordination)
//       dispatch  → logistics (bot routing/efficiency) inventory → buffers (stall protection)
//       telemetry → monitoring (recovery yield/closure) gate → QC + flow control (final yield)
//     Each has a headcount; the load it must cover scales with the production it governs; under-staff a
//     lever and it throttles (or, for dispatch/telemetry, stops boosting).
//
// THE ORACLE. Solve the achievable throughput against demand, bays, bots and whites; report per-engine
// utilisation, material CLOSURE (reclaim recovery vs raw demand — the generation-ship leak), the binding
// KEYSTONE (press-perturbation, biome/forge-style), and a vitality TIER. Node-tested by econ.selftest.mjs.

import { ENGINES, ENGINE_RING, supplyChain } from '../ops/engines.js';

// ── stoichiometry the topology lacks: intake units per 1 unit of the engine's primary output ──
export const RECIPES = {
  fluid:     { out: 'coolant', per: { scrap_water: 1 } },
  foundry:   { out: 'metal',   per: { scrap_metal: 1, coolant: 0.15 } },
  chemworks: { out: 'polymer', per: { feedstock: 1, coolant: 0.15 } },
  fab:       { out: 'circuit', per: { silicon: 1 } },
  weave:     { out: 'cloth',   per: { fiber: 1 } },
  mill:      { out: 'stock',   per: { metal: 1 } },
  assembly:  { out: 'product', per: { stock: 2, polymer: 1, circuit: 1, cloth: 1 } },
  // reclaim is the decomposer: worn product → raws, per-raw recovery < 1 (the recycling loss = the leak).
  // the raws EMBODIED in one product, and how well each is recovered (water/coolant dissipates worst).
  reclaim:   { out: null, embodied: { scrap_metal: 2, feedstock: 1, silicon: 1, fiber: 1, scrap_water: 0.45 } },
};
export const RECOVERY = { scrap_metal: 0.95, feedstock: 0.88, silicon: 0.93, fiber: 0.85, scrap_water: 0.55 };   // reclaim yields
export const RAWS = ['scrap_metal', 'feedstock', 'silicon', 'fiber', 'scrap_water'];
export const PROD_ENGINES = ['fluid', 'foundry', 'chemworks', 'fab', 'weave', 'mill', 'assembly', 'reclaim'];

// the six white-collar ops, keyed by the role id engines/whites use, → the lever each one governs
export const WHITES = [
  { role: 'perfusion', lever: 'uptime',   governs: 'total run-rate',   note: 'maintenance — machine uptime' },
  { role: 'schedule',  lever: 'planning', governs: 'total run-rate',   note: 'planning — throughput coordination' },
  { role: 'inventory', lever: 'buffers',  governs: 'edge throughput',  note: 'buffers — stall protection' },
  { role: 'dispatch',  lever: 'logistics',governs: 'haul demand',      note: 'logistics — bot routing/efficiency' },
  { role: 'telemetry', lever: 'recovery', governs: 'reclaim throughput', note: 'monitoring — recovery yield' },
  { role: 'gate',      lever: 'yield',    governs: 'product rate',     note: 'QC + flow control — final yield' },
];

export const DEFAULT_POPS = {
  bots: 120,                                  // logistics droids
  whites: { perfusion: 14, schedule: 12, inventory: 12, dispatch: 12, telemetry: 8, gate: 8 },
};
// capacity constants (per head / per bay / per bot, per step), sized so the default populations comfortably
// staff a demand of ~40 (every lever ≈1 with ~20% headroom, forge-style) and each starvation binds cleanly.
// Loads at demand P: totalRun ≈ 9.45P, haul ≈ 15.9P, reclaim = P, product = P, tightest engine run = 2P.
export const CAP = { bayRate: 9, botHaul: 5, headRun: 32, headEdge: 64, headHaul: 6, headRecl: 6, headProd: 6 };

// default machine-bay counts per engine (the map feeds real counts; this is the nominal fallback = steps×2)
export function defaultBays() { const b = {}; for (const id of PROD_ENGINES) b[id] = (ENGINES[id].steps || []).length * 2; return b; }

// ── SOLVE the material flows from a product setpoint P (products/step at steady state) ──
export function solveFlows(P) {
  const run = { assembly: P, mill: 2 * P, chemworks: P, fab: P, weave: P, foundry: 2 * P, reclaim: P, fulfillment: P };
  run.fluid = 0.15 * run.foundry + 0.15 * run.chemworks;    // coolant demand from both smelters
  // every supply-chain edge's flow = what the consumer intakes of that commodity at its run-rate
  const consume = (eng, commodity) => {
    if (eng === 'reclaim' || eng === 'fulfillment') return commodity === 'product' || commodity === 'waste' ? P : 0;
    const r = RECIPES[eng]; return r && r.per && r.per[commodity] ? run[eng] * r.per[commodity] : 0;
  };
  const edges = supplyChain().map((e) => ({ ...e, rate: consume(e.to, e.commodity) })).filter((e) => e.rate > 0);
  // raw demand (what the refiners pull) vs raw supply (what reclaim recovers from P worn products)
  const rawDemand = {}, rawSupply = {};
  for (const c of RAWS) { rawDemand[c] = 0; rawSupply[c] = P * RECIPES.reclaim.embodied[c] * RECOVERY[c]; }
  rawDemand.scrap_metal = run.foundry * RECIPES.foundry.per.scrap_metal;
  rawDemand.feedstock = run.chemworks * RECIPES.chemworks.per.feedstock;
  rawDemand.silicon = run.fab * RECIPES.fab.per.silicon;
  rawDemand.fiber = run.weave * RECIPES.weave.per.fiber;
  rawDemand.scrap_water = run.fluid * RECIPES.fluid.per.scrap_water;
  const haul = edges.reduce((s, e) => s + e.rate, 0);       // total material to move (units/step)
  return { P, run, edges, rawDemand, rawSupply, haul };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const eff = (have, need) => (need <= 0 ? 1 : clamp01(have / need));   // a lever's efficiency: staffed/required, capped at 1

// ── the full economy solve: demand + populations + bays → achievable throughput, utilisation, closure, tier ──
export function solveEconomy(opts = {}) {
  const demand = opts.demand ?? 40;
  const pops = { ...DEFAULT_POPS, ...opts.pops, whites: { ...DEFAULT_POPS.whites, ...(opts.pops && opts.pops.whites) } };
  const bays = opts.bays || defaultBays();
  const recBoost = opts.recovery || 1;   // (kept for callers; telemetry handles recovery below)
  const f = solveFlows(demand);
  const totalRun = PROD_ENGINES.reduce((s, id) => s + (f.run[id] || 0), 0);

  // white-collar levers (efficiency 0..1 = staffed / required-for-this-load)
  const w = pops.whites;
  const lever = {
    uptime:   eff(w.perfusion * CAP.headRun,  totalRun),
    planning: eff(w.schedule  * CAP.headRun,  totalRun),
    buffers:  eff(w.inventory * CAP.headEdge, f.edges.length ? f.haul : 0),
    logistics: w.dispatch * CAP.headHaul,       // dispatch heads → extra haul capacity (added to bots below)
    recovery: eff(w.telemetry * CAP.headRecl, f.run.reclaim),
    yield:    eff(w.gate * CAP.headProd, demand),
  };
  // logistics ceiling: bots + dispatched routing move `haul` units/step
  const haulCap = pops.bots * CAP.botHaul + lever.logistics;
  const logisticsEff = eff(haulCap, f.haul);
  // engine ceilings: bays × bayRate vs the run-rate each engine needs
  const engine = {}; let worstEngineUtil = 0, tightestEngine = null;
  for (const id of PROD_ENGINES) {
    const cap = (bays[id] || 0) * CAP.bayRate, util = cap > 0 ? f.run[id] / cap : Infinity;
    engine[id] = { run: +f.run[id].toFixed(2), cap, util: +util.toFixed(3) };
    if (util > worstEngineUtil) { worstEngineUtil = util; tightestEngine = id; }
  }
  // the throughput is throttled by the WORST binding constraint (a utilisation > 1 or a lever < 1)
  const constraints = [
    { id: 'bays:' + tightestEngine, slack: 1 - clamp01(worstEngineUtil), util: worstEngineUtil },
    { id: 'logistics/bots', slack: logisticsEff, util: f.haul / Math.max(1e-9, haulCap) },
    { id: 'ops:perfusion', slack: lever.uptime, util: totalRun / Math.max(1e-9, w.perfusion * CAP.headRun) },
    { id: 'ops:schedule', slack: lever.planning, util: totalRun / Math.max(1e-9, w.schedule * CAP.headRun) },
    { id: 'ops:inventory', slack: lever.buffers, util: f.haul / Math.max(1e-9, w.inventory * CAP.headEdge) },
    { id: 'ops:gate', slack: lever.yield, util: demand / Math.max(1e-9, w.gate * CAP.headProd) },
  ];
  const throughputEff = Math.min(lever.uptime, lever.planning, lever.buffers, lever.yield, logisticsEff, 1 / Math.max(1, worstEngineUtil));
  const achievable = +(demand * throughputEff).toFixed(2);

  // material CLOSURE: reclaim recovery (telemetry-boosted) vs raw demand, per raw (the generation-ship leak)
  const recoveryEff = lever.recovery;   // under-monitored ⇒ worse recovery
  const closure = {}; let closedRaws = 0;
  for (const c of RAWS) {
    const supply = f.rawSupply[c] * recoveryEff * recBoost, demandC = f.rawDemand[c];
    const frac = demandC > 0 ? supply / demandC : 1;
    closure[c] = { supply: +supply.toFixed(2), demand: +demandC.toFixed(2), frac: +frac.toFixed(3), leak: +Math.max(0, demandC - supply).toFixed(2) };
    if (frac >= 0.999) closedRaws++;
  }
  const meanClosure = RAWS.reduce((s, c) => s + Math.min(1, closure[c].frac), 0) / RAWS.length;

  // KEYSTONE — the binding constraint: the one whose utilisation is highest (add capacity here first)
  const keystone = constraints.slice().sort((a, b) => b.util - a.util)[0];

  // hub degree — for the map: how many OTHER threads each engine touches (feeds the assembly/reclaim ring idea)
  const hub = hubDegrees();

  // vitality score: throughput viability (can it meet demand) + closure (does the loop hold) + balance
  const balance = 1 - clamp01((worstEngineUtil - meanUtil(engine)) / 2);   // no single engine wildly hotter than the rest
  const score = Math.round(100 * (0.45 * throughputEff + 0.35 * meanClosure + 0.20 * balance));
  const tier = score >= 85 ? 'Thriving' : score >= 68 ? 'Healthy' : score >= 50 ? 'Stable' : score >= 30 ? 'Fragile' : 'Failing';

  return {
    demand, achievable, throughputEff: +throughputEff.toFixed(3),
    engine, lever: Object.fromEntries(Object.entries(lever).map(([k, v]) => [k, +(+v).toFixed(3)])),
    logisticsEff: +logisticsEff.toFixed(3), haul: +f.haul.toFixed(2), haulCap: +haulCap.toFixed(2),
    closure, meanClosure: +meanClosure.toFixed(3), closedRaws,
    keystone: keystone.id, keystoneUtil: +keystone.util.toFixed(3),
    score, tier, hub, flows: f, pops, bays,
  };
}

function meanUtil(engine) { const v = Object.values(engine).map((e) => e.util).filter((u) => isFinite(u)); return v.reduce((s, u) => s + u, 0) / (v.length || 1); }

// how many OTHER production/ops threads each engine directly exchanges a commodity with (its map degree)
export function hubDegrees() {
  const edges = supplyChain(), deg = {};
  for (const id of [...ENGINE_RING, 'fulfillment']) {
    const nbrs = new Set();
    for (const e of edges) { if (e.from === id) nbrs.add(e.to); if (e.to === id) nbrs.add(e.from); }
    deg[id] = { degree: nbrs.size, neighbours: [...nbrs] };
  }
  return deg;
}

if (typeof globalThis !== 'undefined') globalThis.RindEcon = { RECIPES, WHITES, solveFlows, solveEconomy, hubDegrees, DEFAULT_POPS };
