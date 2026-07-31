// hoop/forge/needs.js — the NAVE SOCIAL FABRIC → NEEDS bridge.
//
// The nave (the civic economy: econ.js ROLES/verbs) is the DEMAND side; the forge (catalogue.js) is the
// SUPPLY side; biome is life-support. This maps the nave's verbs onto the forge's loops, and turns a
// population into a concrete product-demand + life-support-demand vector — the input to the unified
// element engine (ledger.js). "Once you build the supply cycle for robots you have one for most things":
// every product wears and is replaced, so demand = standing per-capita stock × wear, the same shape the
// logistics droid uses. Pure, zero-dep, deterministic.

import { PRODUCTS, PRODUCT, LOOPS, byLoop } from './catalogue.js';

// the nave's verbs (econ roles) → the forge loops they drive. The social fabric IS the demand programme:
// who does what determines what the ship must make + grow.
export const ROLE_LOOPS = {
  dwell:   ['habitat', 'textiles'],          // homes: fixtures, furniture, clothing
  grow:    ['food'],                          // the biome interface — farming IS life support
  make:    ['labor', 'structure', 'habitat'], // fabrication drives most made goods
  mend:    ['labor', 'waste'],                // repair + the recyclers
  trade:   ['mobility'],                      // moving goods
  serve:   ['food', 'body'],                  // hospitality, food prep, care
  play:    ['society'],                        // recreation, culture
  heal:    ['body'],                           // medicine
  learn:   ['society', 'compute'],             // knowledge, records, instruments
  worship: ['society'],                        // ritual, meaning
  govern:  ['society', 'compute'],             // administration, control
  move:    ['mobility', 'propulsion'],         // transport, the drive
  store:   ['mobility', 'waste'],              // logistics, buffering
};

// wear by loop (fraction of deployed per-capita stock that wears out per step → the replacement demand).
// Consumables churn fast; structure barely. Set per loop so we don't author 50 values.
export const LOOP_WEAR = {
  air: 0.02, water: 0.02, food: 0.9, waste: 0.1, body: 0.5, textiles: 0.04, habitat: 0.01,
  structure: 0.004, energy: 0.02, compute: 0.03, labor: 0.04, mobility: 0.02, propulsion: 0.01,
  society: 0.05, continuity: 0.002,
};

// per-capita STANDING STOCK (units held per person) by loop — how much of each loop's goods a person's
// life is backed by. Rough but legible; products in a loop split the loop's stock evenly.
export const LOOP_STOCK = {
  air: 0.4, water: 0.6, food: 2.0, waste: 0.3, body: 0.8, textiles: 1.5, habitat: 3.0,
  structure: 6.0, energy: 1.2, compute: 1.0, labor: 0.8, mobility: 0.6, propulsion: 0.2,
  society: 0.5, continuity: 0.1,
};
export const LIFE_SUPPORT_LOOPS = ['air', 'water', 'food'];   // supplied by biome, not manufactured

// population → per-product replacement DEMAND (units/step). demand = people × perCapitaStock × wear, with
// a loop's stock split across its products. Life-support loops (air/water/food) are flagged separately —
// biome supplies them; the forge only AUGMENTS them.
export function populationDemand(people = 1000) {
  const demand = {}, lifeSupport = {};
  for (const L of LOOPS) {
    const prods = byLoop(L.id), n = prods.length || 1;
    const perProd = (people * (LOOP_STOCK[L.id] || 0) * (LOOP_WEAR[L.id] || 0)) / n;
    for (const p of prods) {
      if (LIFE_SUPPORT_LOOPS.includes(L.id)) lifeSupport[p.id] = perProd;   // biome's job (forge augments)
      else demand[p.id] = perProd;
    }
  }
  return { people, demand, lifeSupport };
}

// the nave's role census → which loops are emphasised (a flavour multiplier on demand). A nave heavy in
// `make` pushes labor/structure; one heavy in `grow` leans on biome. Returns loop → weight (mean 1).
export function roleEmphasis(roleCounts = {}) {
  const w = Object.fromEntries(LOOPS.map((l) => [l.id, 0]));
  let total = 0;
  for (const [role, c] of Object.entries(roleCounts)) { for (const loop of (ROLE_LOOPS[role] || [])) { w[loop] += c; total += c; } }
  if (total <= 0) return Object.fromEntries(LOOPS.map((l) => [l.id, 1]));
  const mean = total / LOOPS.length;
  return Object.fromEntries(LOOPS.map((l) => [l.id, mean > 0 ? Math.max(0.2, w[l.id] / mean) : 1]));
}
