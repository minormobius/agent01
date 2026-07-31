// forge.selftest.mjs — the FORGE: the ship's closed-loop industrial metabolism.
//   node hoop/forge/test/forge.selftest.mjs
//
// The spine has to PROVABLY CLOSE before any factory is draped over it. Pins: (1) mass is conserved to
// machine precision over a long run (structural, not tuned); (2) the wild-type factory CLOSES (usable
// stock holds, scrap bounded, products maintained); (3) the oracle CATCHES the failure modes — kill the
// reclaimer and it collapses (the Biosphere-2 lesson), starve the energy budget and it throttles; (4) the
// published verticals match the recipes; (5) determinism.

import {
  COMMODITIES, COMMODITY_IDS, PRODUCTS, PRODUCT_IDS, DEFAULT_CONFIG,
  initState, step, integrate, totalMass, conservationDrift, boundMass,
  wearDemand, verticals, oracle, rollConfig,
} from '../forge.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── 1. STRUCTURAL CONSERVATION — total mass per commodity is invariant to machine precision ──
{
  const { state, maxDrift, hist } = integrate(DEFAULT_CONFIG, { steps: 800, trace: true });
  ok(maxDrift < 1e-6, `mass conserved across 800 steps (max drift ${maxDrift.toExponential(2)})`);
  for (const c of COMMODITY_IDS) ok(Math.abs(totalMass(state, c) - DEFAULT_CONFIG.totals[c]) < 1e-6, `${c}: total mass invariant (stock+scrap+bound = initial)`);
  // mass genuinely MOVED and the cycle is LIVE (not frozen): products got deployed (stock→bound), and the
  // factory holds them against continuous wear while spending energy — which it can only do by continuously
  // reclaiming scrap→stock and rebuilding stock→bound every step. (A tightly-closed loop keeps standing
  // scrap near zero — it's a within-step transient — so scrap-as-a-real-form is proven by the broken-loop
  // test below, where it piles up instead of being cleared.)
  const deployed = COMMODITY_IDS.some((c) => boundMass(state)[c] > 1);
  ok(deployed, 'mass moved stock→bound: products are deployed');
  ok(state.energyUsed > 0, 'the cycle is live each step: energy spent reclaiming + rebuilding against wear');
}

// ── 2. THE WILD TYPE CLOSES — the default factory is viable (reclaim ≥ wear demand everywhere) ──
const WILD = oracle(DEFAULT_CONFIG, { steps: 600 });
{
  const o = WILD;
  ok(o.conserved && o.drift < 1e-6, `oracle confirms conservation (drift ${o.drift.toExponential(2)})`);
  ok(o.closes, `wild type CLOSES (no commodity starves / runs away) — tier ${o.tier} (${o.score})`);
  ok(o.score >= 80, `wild type scores healthy (${o.score}, ${o.tier})`);
  ok(o.maintained >= PRODUCT_IDS.length - 1, `wild type maintains its product setpoints (${o.maintained}/${PRODUCT_IDS.length})`);
  ok(o.keystone != null, `oracle names a keystone reclaim valve (${o.keystone})`);
  // the closure condition is literally reclaimCap ≥ wearDemand for every commodity
  const d = wearDemand(DEFAULT_CONFIG);
  ok(COMMODITY_IDS.every((c) => DEFAULT_CONFIG.reclaimCap[c] >= d[c]), 'wild-type reclaimCap ≥ wear demand for every commodity');
}

// ── 3. THE FAILURE MODES — the oracle must catch a broken loop (the whole point) ──
// (a) kill the metal reclaimer → metal scrap accumulates, stock drains → collapse (the decomposer lesson)
{
  const broken = { ...DEFAULT_CONFIG, reclaimCap: { ...DEFAULT_CONFIG.reclaimCap, metal: 0 } };
  const o = oracle(broken, { steps: 600 });
  ok(o.conserved, 'a broken loop still conserves mass (it just piles up as scrap — nothing is destroyed)');
  ok(!o.closes, 'oracle catches the no-reclaimer collapse (the loop does NOT close)');
  ok(o.floors.metal.stockFrac < 0.05, `metal stock drains toward zero without its reclaimer (${o.floors.metal.stockFrac})`);
  ok(o.floors.metal.scrap > 1000, `metal mass piles up as scrap instead (${o.floors.metal.scrap}) — conserved, not destroyed`);
  ok(o.signals.some((s) => s.includes('metal')), 'the oracle names metal as the broken loop');
  ok(o.score < WILD.score && o.tier !== 'Closed', `broken loop scores worse than wild (${o.score} < ${WILD.score}, tier ${o.tier})`);
}
// (b) starve the energy budget → chronic throttle
{
  const lowE = { ...DEFAULT_CONFIG, energyBudget: 30 };
  const o = oracle(lowE, { steps: 400 });
  ok(o.throttle > 0.1 && !o.energyOk, `oracle catches energy starvation (throttle ${o.throttle})`);
}
// (c) conservation holds even when totally starved (mass can't leak)
{
  const s = initState(DEFAULT_CONFIG);
  const noE = { ...DEFAULT_CONFIG, energyBudget: 0 };
  for (let i = 0; i < 50; i++) step(s, noE);
  ok(conservationDrift(s, noE) < 1e-6, 'mass conserved even with zero energy (wear still moves mass to scrap; nothing lost)');
}

// ── 4. wearDemand + published verticals are honest to the recipes ──
{
  const d = wearDemand(DEFAULT_CONFIG);
  // metal wear demand = sum over products of target*wear*recipe.metal — sanity: > 0 and finite
  ok(d.metal > 0 && isFinite(d.metal), `metal wear demand computed (${d.metal.toFixed(2)}/step)`);
  // a vertical lists exactly the products that draw its commodity
  const V = verticals(DEFAULT_CONFIG);
  ok(V.length === COMMODITIES.length, 'one vertical per commodity');
  const metalV = V.find((v) => v.commodity === 'metal');
  const drawMetal = PRODUCTS.filter((p) => p.recipe.metal).map((p) => p.id).sort();
  ok(metalV.drawnBy.map((x) => x.product).sort().join() === drawMetal.join(), 'the metal vertical lists exactly the products that use metal');
  ok(metalV.headroom === +(metalV.reclaimCap - metalV.wearDemand).toFixed(2), 'vertical headroom = reclaimCap − wearDemand');
  ok(V.every((v) => v.chain[0] === 'scrap' && v.chain[v.chain.length - 1] === 'scrap'), 'every vertical is a closed chain (scrap → … → scrap)');
  // trace is the scarce keystone — smallest total
  ok(Math.min(...COMMODITY_IDS.map((c) => DEFAULT_CONFIG.totals[c])) === DEFAULT_CONFIG.totals.trace, 'trace is the scarcest commodity (the keystone)');
}

// ── 5. determinism + rollConfig breeds both closing and failing factories ──
{
  const a = JSON.stringify(oracle(DEFAULT_CONFIG, { steps: 300 }));
  const b = JSON.stringify(oracle(DEFAULT_CONFIG, { steps: 300 }));
  ok(a === b, 'the oracle is deterministic');
  ok(JSON.stringify(rollConfig(7)) === JSON.stringify(rollConfig(7)), 'rollConfig is deterministic for a seed');
  // over many rolls, conservation ALWAYS holds, and the oracle spreads across tiers (closure isn't free)
  const tiers = new Set(); let allConserved = true;
  for (let n = 1; n <= 40; n++) { const o = oracle(rollConfig(n), { steps: 300 }); tiers.add(o.tier); if (!o.conserved) allConserved = false; }
  ok(allConserved, 'every rolled factory conserves mass (structural)');
  ok(tiers.size >= 2, `rolls spread across viability tiers (${[...tiers].join(', ')}) — closing the loop is a thing you must get right`);
}

console.log(`\nforge.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
