// econ.selftest.mjs — pin the upperrind production solver: solved flows (back-propagation + conservation),
// the two populations as throttles, material closure, and the keystone. Pure, no canvas. Run:
//   node rind/upperrind/econ.selftest.mjs
import { solveFlows, solveEconomy, RECIPES, RAWS, hubDegrees, defaultBays, DEFAULT_POPS } from './econ.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ── 1. the flow solve back-propagates a setpoint to real run-rates ──
{
  const P = 50, f = solveFlows(P);
  ok(f.run.assembly === P, 'assembly runs at the product setpoint');
  ok(f.run.mill === 2 * P, 'mill runs 2× (2 stock per product)');
  ok(f.run.foundry === 2 * P, 'foundry runs 2× (2 metal → 2 stock)');
  ok(f.run.chemworks === P && f.run.fab === P && f.run.weave === P, 'the single-feed refiners run at P');
  ok(near(f.run.fluid, 0.15 * f.run.foundry + 0.15 * f.run.chemworks), 'fluid runs to meet both smelters\' coolant');
  // edges carry the consumer's intake amount
  const metalEdge = f.edges.find((e) => e.from === 'foundry' && e.to === 'mill');
  ok(metalEdge && near(metalEdge.rate, 2 * P), 'foundry→mill carries 2P metal');
  const coolantToFoundry = f.edges.find((e) => e.from === 'fluid' && e.to === 'foundry');
  ok(coolantToFoundry && near(coolantToFoundry.rate, 0.15 * f.run.foundry), 'fluid→foundry carries the coolant intake');
}

// ── 2. flows scale linearly with the setpoint (a real solve, not a fixed picture) ──
{
  const a = solveFlows(10), b = solveFlows(20);
  ok(near(b.haul, 2 * a.haul), 'doubling the setpoint doubles the haul demand');
  for (const c of RAWS) ok(near(b.rawDemand[c], 2 * a.rawDemand[c]), `raw demand for ${c} scales linearly`);
}

// ── 3. raw demand is conserved against reclaim's embodied recovery (closure math) ──
{
  const P = 100, f = solveFlows(P);
  // embodied scrap_metal per product is 2 → demand 2P; reclaim supplies 2P × recovery
  ok(near(f.rawDemand.scrap_metal, 2 * P), 'scrap_metal demand = 2P (2 metal per product)');
  ok(f.rawSupply.scrap_metal < f.rawDemand.scrap_metal, 'recovery < 1 ⇒ a real leak (makeup needed)');
  ok(f.rawSupply.scrap_water / f.rawDemand.scrap_water < f.rawSupply.scrap_metal / f.rawDemand.scrap_metal, 'water closes worst (it dissipates)');
}

// ── 4. a well-staffed baseline runs at (near) full demand and closes reasonably ──
{
  const r = solveEconomy({ demand: 30 });
  ok(r.achievable > 0, 'baseline produces');
  ok(r.throughputEff > 0.9, 'a well-staffed plant meets ~all of a modest demand');
  ok(r.tier === 'Thriving' || r.tier === 'Healthy' || r.tier === 'Stable', `baseline is viable (got ${r.tier})`);
  ok(Object.keys(r.engine).length === 8, 'reports all eight engines');
  ok(r.meanClosure > 0.5 && r.meanClosure <= 1, 'closure is a real fraction');
}

// ── 5. THE POPULATIONS BITE — starve each and throughput throttles; the keystone names the cause ──
{
  const base = solveEconomy({ demand: 60 });
  // starve logistics bots
  const noBots = solveEconomy({ demand: 60, pops: { ...DEFAULT_POPS, bots: 4 } });
  ok(noBots.achievable < base.achievable, 'too few bots throttles throughput');
  ok(noBots.keystone === 'logistics/bots', `bot starvation names logistics as keystone (got ${noBots.keystone})`);
  // starve a white-collar lever (maintenance)
  const noPerf = solveEconomy({ demand: 60, pops: { ...DEFAULT_POPS, whites: { ...DEFAULT_POPS.whites, perfusion: 1 } } });
  ok(noPerf.achievable < base.achievable, 'gutting maintenance (perfusion) throttles throughput');
  ok(noPerf.keystone === 'ops:perfusion', `perfusion starvation names it keystone (got ${noPerf.keystone})`);
  // under-monitoring (telemetry) worsens recovery/closure, not raw throughput
  const noTel = solveEconomy({ demand: 60, pops: { ...DEFAULT_POPS, whites: { ...DEFAULT_POPS.whites, telemetry: 1 } } });
  ok(noTel.meanClosure < base.meanClosure, 'under-monitoring (telemetry) worsens material closure');
}

// ── 6. bays bind: a starved engine becomes the keystone ──
{
  const bays = defaultBays(); bays.foundry = 1;   // choke the foundry
  const r = solveEconomy({ demand: 80, bays });
  ok(r.engine.foundry.util > 1, 'the choked foundry is over capacity');
  ok(r.keystone.startsWith('bays:'), `a starved engine surfaces as a bays keystone (got ${r.keystone})`);
  ok(r.achievable < 80, 'the bottleneck caps achievable throughput below demand');
}

// ── 7. hub degree — assembly & reclaim touch the most other threads (the map-feedback signal) ──
{
  const hub = hubDegrees();
  const ranked = Object.entries(hub).sort((a, b) => b[1].degree - a[1].degree).map(([k]) => k);
  ok(ranked[0] === 'assembly' || ranked[0] === 'reclaim', 'the top hub is assembly or reclaim');
  ok(hub.assembly.degree >= 5 && hub.reclaim.degree >= 5, 'both assembly & reclaim exchange with ≥5 other threads (ring candidates)');
  ok(hub.assembly.degree > hub.mill.degree && hub.reclaim.degree > hub.fab.degree, 'the hubs out-degree the line engines');
}

// ── 8. determinism ──
{
  const a = JSON.stringify(solveEconomy({ demand: 45 })), b = JSON.stringify(solveEconomy({ demand: 45 }));
  ok(a === b, 'deterministic — identical output for identical input');
}

console.log(`\necon.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
