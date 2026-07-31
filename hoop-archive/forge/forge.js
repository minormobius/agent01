// hoop/forge/forge.js — THE FORGE: the ship's INDUSTRIAL METABOLISM (closed-loop production).
//
// The everything-factory of a generation ship, modelled the way biome models a closed ECOSYSTEM: a
// generation ship is a CLOSED system — every atom is already aboard, nothing is mined fresh — so
// production is not extraction from an infinite ground, it is CYCLING a fixed stock of conserved
// commodities through transformation and back. The loop:
//
//     scrap ──[reclaim]──▶ stock ──[build]──▶ deployed (machines/fixtures/…) ──[wear]──▶ scrap
//        ▲                                                                                   │
//        └───────────────────────────────────────────────────────────────────────────────┘
//
// THE BIOME LESSON, applied to industry: conservation is STRUCTURAL, not tuned — every flow is a paired
// transfer (from -= x; to += x), so total mass per commodity is invariant by construction. The RECLAIMER
// is the industrial DECOMPOSER: under-build it and scrap accumulates while usable stock drains to zero —
// the factory starves (the Biosphere-2 failure mode). The oracle MEASURES whether the loop closes.
//
// THE TIDE LESSON: every transformation costs ENERGY from a fixed budget (tide's `energyLedger().total_GW`)
// and dumps waste heat — production is energy-bounded, not free. Energy is tracked but NOT a conserved mass.
//
// THE SEAMS (documented, not yet active): biomass exchanges with biome (photosynthesis grows it from
// volatiles+water+light; eating returns it); water/heat with iris+tide. v1 runs FULLY CLOSED so
// conservation is exact; the seams are the coupling points the wings plug into later.
//
// Pure, zero-dep, deterministic (seeded) — node-tested in test/forge.selftest.mjs. No DOM. The cousin of
// biome's deck→roll→oracle: rollConfig breeds a factory, the oracle scores whether it CLOSES + is viable.

// ── the conserved commodities: the ship's fixed material budget (grounded but legible) ──
export const COMMODITIES = [
  { id: 'metal',     name: 'Metal',     glyph: '⬡', note: 'structure · machines · circuits (Fe·Al·Cu)' },
  { id: 'polymer',   name: 'Polymer',   glyph: '◇', note: 'plastics · composites · insulation (C·H)' },
  { id: 'silicate',  name: 'Silicate',  glyph: '◈', note: 'glass · ceramic · substrate (Si·O)' },
  { id: 'volatiles', name: 'Volatiles', glyph: '≈', note: 'chemical feedstock — solvent · fuel base (C·H·O·N)' },
  { id: 'water',     name: 'Water',     glyph: '∿', note: 'coolant · solvent · life-support (seam: iris·tide)' },
  { id: 'biomass',   name: 'Biomass',   glyph: '❧', note: 'food · fiber · bio-feedstock (seam: biome)' },
  { id: 'trace',     name: 'Trace',     glyph: '✦', note: 'catalysts · dopants · rare elements — the scarce keystone' },
];
export const COMMODITY_IDS = COMMODITIES.map((c) => c.id);

// ── the products the factory builds: cross-commodity bills of materials (the broad verticals' OUTPUTS).
// `recipe` is mass of each commodity per unit. `wear` is the fraction of deployed units that degrade to
// scrap per step (consumables wear nearly fully; structure wears slowest). `serves` is its purpose. ──
export const PRODUCTS = [
  { id: 'structure',  name: 'Structure',  glyph: '⛓', wear: 0.008, recipe: { metal: 5, silicate: 4 },                          serves: 'the hull & decks — mass-heavy, slow-wearing' },
  { id: 'fixture',    name: 'Fixture',    glyph: '▣', wear: 0.020, recipe: { metal: 3, silicate: 3, polymer: 1 },              serves: 'rooms — beds, consoles, vats, the built world' },
  { id: 'machine',    name: 'Machine',    glyph: '⚙', wear: 0.040, recipe: { metal: 6, polymer: 2, trace: 1 },                 serves: 'the factory itself — robots, tools, the lines' },
  { id: 'circuit',    name: 'Circuit',    glyph: '⊞', wear: 0.050, recipe: { metal: 1, silicate: 2, trace: 2 },                serves: 'control — the Seven, the nav, the Signal gear' },
  { id: 'consumable', name: 'Consumable', glyph: '◯', wear: 0.900, recipe: { polymer: 1, volatiles: 2, biomass: 1, water: 2 }, serves: 'daily use — food, medicine, packaging (used up fast)' },
];
export const PRODUCT_IDS = PRODUCTS.map((p) => p.id);
const PRODUCT = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

// ── a tiny seeded PRNG (zero-dep, like biome) so rollConfig is deterministic ──
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ── the genome: a factory configuration. WILD TYPE is a balanced, closing factory. ──
// totals: the fixed mass aboard per commodity. target: the deployed mass the factory tries to MAINTAIN per
// product (its setpoint). reclaimCap/buildCap: throughput ceilings per step. energyBudget: tide's GW→units
// per step. eReclaim/eBuild: energy per unit of work. The wild type is sized so reclaim ≥ wear (it closes).
export const DEFAULT_CONFIG = {
  totals:   { metal: 6000, polymer: 2500, silicate: 4000, volatiles: 1800, water: 3000, biomass: 1500, trace: 600 },
  target:   { structure: 320, fixture: 220, machine: 90, circuit: 60, consumable: 40 },   // deployed units
  // reclaimCap is sized ABOVE each commodity's wearDemand (see wearDemand()) with ~20% headroom — that
  // IS the closure condition: a valve narrower than its wear demand lets scrap pile and stock drain.
  reclaimCap: { metal: 66, polymer: 60, silicate: 40, volatiles: 90, water: 90, biomass: 46, trace: 13 },
  buildCap: { structure: 8, fixture: 8, machine: 5, circuit: 5, consumable: 60 },          // units/step
  energyBudget: 900, eReclaim: 0.5, eBuild: 0.4,
};

// recipe mass of one unit of product p
const unitMass = (p) => Object.values(PRODUCT[p].recipe).reduce((a, b) => a + b, 0);
// the per-commodity wear demand at the genome's target (replacement throughput the loop must sustain)
export function wearDemand(config = DEFAULT_CONFIG) {
  const d = Object.fromEntries(COMMODITY_IDS.map((c) => [c, 0]));
  for (const p of PRODUCTS) { const churn = (config.target[p.id] || 0) * p.wear; for (const [c, m] of Object.entries(p.recipe)) d[c] += churn * m; }
  return d;   // mass/step of each commodity that wears out at steady state → the reclaim the loop must match
}

// ── initial state: all non-deployed mass starts as usable STOCK; nothing worn yet, nothing deployed. ──
export function initState(config = DEFAULT_CONFIG) {
  const stock = {}, scrap = {}, deployed = {};
  for (const c of COMMODITY_IDS) { stock[c] = config.totals[c] || 0; scrap[c] = 0; }
  for (const p of PRODUCT_IDS) deployed[p] = 0;
  return { t: 0, stock, scrap, deployed, energyUsed: 0, wasteHeat: 0, throttled: 0, starved: false };
}

// mass currently locked in deployed products, per commodity (bound form)
export function boundMass(state) {
  const b = Object.fromEntries(COMMODITY_IDS.map((c) => [c, 0]));
  for (const p of PRODUCTS) { const n = state.deployed[p.id] || 0; for (const [c, m] of Object.entries(p.recipe)) b[c] += n * m; }
  return b;
}
// total mass of a commodity across ALL forms — the conserved invariant
export function totalMass(state, c) { return state.stock[c] + state.scrap[c] + boundMass(state)[c]; }
export function conservationDrift(state, config = DEFAULT_CONFIG) {
  let max = 0; const b = boundMass(state);
  for (const c of COMMODITY_IDS) max = Math.max(max, Math.abs(state.stock[c] + state.scrap[c] + b[c] - (config.totals[c] || 0)));
  return max;   // should be ~0 (machine precision) — conservation is structural
}

// ── one timestep. EVERY flow is a paired transfer, so mass is conserved by construction. Order: WEAR
// (deployed→scrap) → RECLAIM (scrap→stock, the valve) → BUILD (stock→deployed toward target). Energy
// demand is summed; if it exceeds the budget, all work throttles proportionally (energy-bounded). ──
export function step(state, config = DEFAULT_CONFIG) {
  const s = state, eB = config.energyBudget;
  // 1) WEAR — deployed units degrade to scrap (mass moves bound→scrap, per recipe). Passive, no energy.
  const worn = {};
  for (const p of PRODUCTS) {
    const n = s.deployed[p.id] || 0, w = n * p.wear; if (w <= 0) continue;
    worn[p.id] = w; s.deployed[p.id] = n - w;
    for (const [c, m] of Object.entries(p.recipe)) s.scrap[c] += w * m;
  }
  // 2) plan RECLAIM (scrap→stock) and BUILD (stock→deployed), then scale by the energy budget.
  const reclaimWant = {}; let eReclaim = 0;
  for (const c of COMMODITY_IDS) { const r = Math.min(s.scrap[c], config.reclaimCap[c] || 0); reclaimWant[c] = r; eReclaim += r * config.eReclaim; }
  const buildWant = {}; let eBuild = 0;
  for (const p of PRODUCTS) {
    const gap = Math.max(0, (config.target[p.id] || 0) - (s.deployed[p.id] || 0));
    const n = Math.min(gap, config.buildCap[p.id] || 0); buildWant[p.id] = n; eBuild += n * unitMass(p.id) * config.eBuild;
  }
  const eDemand = eReclaim + eBuild;
  const scale = eDemand > eB && eDemand > 0 ? eB / eDemand : 1;   // energy-bounded: throttle all work alike
  s.throttled = scale < 1 ? 1 - scale : 0;
  // 3) RECLAIM (scrap→stock)
  for (const c of COMMODITY_IDS) { const r = reclaimWant[c] * scale; s.scrap[c] -= r; s.stock[c] += r; }
  // 4) BUILD (stock→deployed), each product limited ALSO by available stock for every commodity in its recipe
  let starved = false;
  for (const p of PRODUCTS) {
    let n = buildWant[p.id] * scale; if (n <= 0) continue;
    for (const [c, m] of Object.entries(p.recipe)) if (m > 0) n = Math.min(n, s.stock[c] / m);   // can't build past the stock
    if (n < buildWant[p.id] * scale - 1e-9) starved = true;
    for (const [c, m] of Object.entries(p.recipe)) s.stock[c] -= n * m;
    s.deployed[p.id] = (s.deployed[p.id] || 0) + n;
  }
  s.energyUsed = eDemand * scale; s.wasteHeat = s.energyUsed; s.starved = starved;
  s.t += 1;
  return s;
}

// integrate `steps` timesteps from a fresh state; optionally record a trace of key signals.
export function integrate(config = DEFAULT_CONFIG, { steps = 400, trace = false } = {}) {
  const s = initState(config), hist = [];
  let maxDrift = 0;
  for (let i = 0; i < steps; i++) {
    step(s, config); maxDrift = Math.max(maxDrift, conservationDrift(s, config));
    if (trace) hist.push({ t: s.t, stock: { ...s.stock }, scrap: { ...s.scrap }, deployed: { ...s.deployed }, throttled: s.throttled, wasteHeat: s.wasteHeat });
  }
  return { state: s, maxDrift, hist };
}

// ── the published VERTICALS: per commodity, its closed chain — who reclaims it, which products draw it,
// what the loop must sustain. The spec the doc + (later) the spec page render. ──
export function verticals(config = DEFAULT_CONFIG) {
  const demand = wearDemand(config);
  return COMMODITIES.map((c) => ({
    commodity: c.id, name: c.name, glyph: c.glyph, note: c.note,
    total: config.totals[c.id] || 0,
    reclaimCap: config.reclaimCap[c.id] || 0,
    wearDemand: +demand[c.id].toFixed(2),
    headroom: +((config.reclaimCap[c.id] || 0) - demand[c.id]).toFixed(2),   // >0 ⇒ the valve can keep up
    drawnBy: PRODUCTS.filter((p) => p.recipe[c.id]).map((p) => ({ product: p.id, glyph: p.glyph, perUnit: p.recipe[c.id] })),
    chain: ['scrap', 'reclaim', 'stock', 'build', 'deployed', 'wear', 'scrap'],   // the closed cycle
  }));
}

// ── THE ORACLE — does the loop CLOSE and is the factory viable? biome's cousin: conserves? stable stock?
// scrap bounded? within energy budget? which process is the keystone bottleneck? ──
export function oracle(config = DEFAULT_CONFIG, { steps = 600 } = {}) {
  const { state, hist } = integrate(config, { steps, trace: true });
  const tail = hist.slice(-Math.max(1, Math.floor(steps * 0.1)));   // last 10% = "steady state"
  // per-commodity closure: usable stock holds above a floor AND scrap isn't running away
  const floors = {}, signals = [];
  let closes = true, stockOk = 0, scrapOk = 0;
  for (const c of COMMODITY_IDS) {
    const endStock = state.stock[c], endScrap = state.scrap[c];
    const tot = config.totals[c] || 1;
    const stockFrac = endStock / tot;                          // healthy: enough usable stock survives
    const scrapTrend = tail.length > 1 ? (tail[tail.length - 1].scrap[c] - tail[0].scrap[c]) : 0;
    const stockHeld = stockFrac > 0.02, scrapBounded = scrapTrend <= tot * 0.01;   // not draining to ~0; scrap not climbing
    floors[c] = { stockFrac: +stockFrac.toFixed(3), scrap: +endScrap.toFixed(1), scrapClimbing: !scrapBounded };
    if (stockHeld) stockOk++; if (scrapBounded) scrapOk++;
    if (!stockHeld || !scrapBounded) { closes = false; signals.push(`${c}: ${!stockHeld ? 'stock starved' : ''}${!stockHeld && !scrapBounded ? ' + ' : ''}${!scrapBounded ? 'scrap accumulating' : ''}`); }
  }
  // deployed maintenance: did the factory hold its product setpoints?
  let maintained = 0; const deployFrac = {};
  for (const p of PRODUCT_IDS) { const f = (config.target[p] || 0) ? state.deployed[p] / config.target[p] : 1; deployFrac[p] = +f.toFixed(2); if (f > 0.85) maintained++; }
  // energy: was the factory chronically throttled?
  const throttle = tail.reduce((a, h) => a + h.throttled, 0) / tail.length;
  const energyOk = throttle < 0.02;
  // keystone: which reclaim valve, removed, breaks the loop worst? (press-perturbation, biome-style)
  const baseScore = (stockOk + scrapOk) / (2 * COMMODITY_IDS.length);
  let keystone = null, keyDamage = -1;
  for (const c of COMMODITY_IDS) {
    if ((config.reclaimCap[c] || 0) === 0) continue;
    const cut = { ...config, reclaimCap: { ...config.reclaimCap, [c]: 0 } };
    const o = integrate(cut, { steps: Math.min(steps, 400), trace: true });
    let ok = 0; for (const cc of COMMODITY_IDS) if (o.state.stock[cc] / (config.totals[cc] || 1) > 0.02) ok++;
    const damage = baseScore - ok / COMMODITY_IDS.length;
    if (damage > keyDamage) { keyDamage = damage; keystone = c; }
  }
  const score = Math.round(100 * (0.45 * (stockOk / COMMODITY_IDS.length) + 0.25 * (scrapOk / COMMODITY_IDS.length) + 0.20 * (maintained / PRODUCT_IDS.length) + 0.10 * (energyOk ? 1 : 0)));
  const tier = score >= 85 ? 'Closed' : score >= 65 ? 'Lean' : score >= 45 ? 'Leaking' : score >= 25 ? 'Draining' : 'Collapsing';
  return {
    score, tier, closes, conserved: conservationDrift(state, config) < 1e-6, drift: conservationDrift(state, config),
    floors, deployFrac, maintained, throttle: +throttle.toFixed(3), energyOk, wasteHeat: +state.wasteHeat.toFixed(1),
    keystone, signals, steps,
  };
}

// ── rollConfig: the "pull" — breed a factory from a seed (deck→roll→oracle parity with biome/econ). It
// jitters the wild type; some rolls under-build the reclaimers and the oracle will score them Draining/
// Collapsing — which is the point (a closed loop is something you have to GET RIGHT, not the default). ──
export function rollConfig(n, base = DEFAULT_CONFIG) {
  const rng = mulberry32((n | 0) >>> 0 || 1), j = (x, amt) => x * (1 + (rng() * 2 - 1) * amt);
  const c = { totals: { ...base.totals }, target: { ...base.target }, reclaimCap: {}, buildCap: { ...base.buildCap }, energyBudget: j(base.energyBudget, 0.3), eReclaim: base.eReclaim, eBuild: base.eBuild };
  for (const k of COMMODITY_IDS) c.reclaimCap[k] = Math.max(0, j(base.reclaimCap[k], 0.6));   // the risky gene: reclaim sizing
  for (const k of PRODUCT_IDS) c.target[k] = Math.max(0, Math.round(j(base.target[k], 0.4)));
  for (const k of PRODUCT_IDS) c.buildCap[k] = Math.max(0, j(base.buildCap[k], 0.4));
  return c;
}
