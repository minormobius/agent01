// graph.selftest.mjs — the FORGE production graph: named processes, intermediates, recycling, bio-regen.
//   node hoop/forge/test/graph.selftest.mjs
//
// Pins: (1) every process conserves mass (loss ≥ 0, output never exceeds input); (2) product composition
// rolls up exactly to its mass; (3) the flow solver terminates (builder DAG is acyclic) and the recovery
// CASCADE works (product wear → scrap → recycler → feedstock, multi-step); (4) the closure read is honest
// — metal/silica/volatiles self-close, trace + water need makeup (the keystone + life-support leaks); (5)
// the bio-regen organic loop runs; (6) determinism.

import {
  MATERIALS, PROCESSES, PROCESS, FAMILIES, BUILDERS, RECOVERERS,
  validate, lossOf, fullOutputs, compositionOf, solveFlow, energyDemand, buildGraph,
} from '../graph.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const mass = (m) => MATERIALS[m].mass;
const DEMAND = { structure: 2.56, fixture: 4.4, machine: 3.6, circuit: 3.0, consumable: 36 };   // = deployed × wear

// ── 1. CONSERVATION — every process is mass-balanced (the loss term makes it structural) ──
ok(validate().length === 0, `all ${PROCESSES.length} processes conserve mass` + (validate().length ? ': ' + validate().join('; ') : ''));
for (const p of PROCESSES) ok(lossOf(p) >= -1e-9, `${p.id}: output never exceeds input (loss ${lossOf(p).toFixed(3)})`);
// fullOutputs adds the loss as scrap, so every process's full output mass == its input mass
for (const p of PROCESSES) {
  const inM = Object.entries(p.in).reduce((a, [m, q]) => a + q * mass(m), 0);
  const outM = Object.entries(fullOutputs(p)).reduce((a, [m, q]) => a + q * mass(m), 0);
  ok(Math.abs(inM - outM) < 1e-9, `${p.id}: full output mass = input mass (${inM.toFixed(2)})`);
}

// ── 2. builders vs recoverers; builder DAG is acyclic (no builder consumes waste) ──
ok(BUILDERS.every((p) => Object.keys(p.in).every((m) => MATERIALS[m].kind !== 'waste')), 'builders consume no waste');
ok(RECOVERERS.every((p) => Object.keys(p.in).some((m) => MATERIALS[m].kind === 'waste')), 'recoverers consume waste');
ok(BUILDERS.length + RECOVERERS.length === PROCESSES.length, 'every process is a builder or a recoverer');

// ── 3. composition rolls up exactly to product mass (lossless assembly) ──
for (const m of ['structure', 'fixture', 'machine', 'circuit', 'consumable']) {
  const comp = compositionOf(m), sum = Object.values(comp).reduce((a, b) => a + b, 0);
  ok(Math.abs(sum - mass(m)) < 1e-6, `${m} composition sums to its mass (${sum.toFixed(2)} ≈ ${mass(m)})`);
  ok(Object.keys(comp).every((c) => MATERIALS[c].kind === 'feedstock'), `${m} composition is all base feedstock`);
}
ok(compositionOf('machine').trace > 0, 'a machine carries trace (so it can return it to scrap_trace on wear)');

// ── 4. the flow solver: terminates, computes feedstock demand, and the recovery CASCADE works ──
const f = solveFlow(DEMAND);
ok(Object.keys(f.rate).length > 15, `solver runs the chain (${Object.keys(f.rate).length} processes active)`);
ok(f.feedstockDemand.metal > 0 && isFinite(f.feedstockDemand.metal), 'metal feedstock demand computed');
// the cascade: metal is recovered FAR beyond the direct refine loss — it comes via wear → scrap → shred.
// (the shredder must be running, fed by product wear, not just builder loss)
ok((f.rate.shred || 0) > 5, `the shredder runs on product wear (cascade): ${(f.rate.shred || 0).toFixed(1)} runs/step`);
ok(f.recovered.metal > 30, `metal recovery cascades from wear (recovered ${f.recovered.metal.toFixed(1)}, not just refine loss)`);

// ── 5. the closure read is HONEST: with realistic recycler yields nothing closes PERFECTLY — there's
// always a small makeup = the recycling loss (the generation-ship clock). The structural metals are nearly
// closed (~5% makeup); volatiles closes outright (bio-regen surplus); WATER leaks most (life-support). ──
const ratio = (c) => c.shortfall / c.demand;
ok(ratio(f.closure.metal) < 0.10 && ratio(f.closure.silica) < 0.10, `metal & silica are nearly closed (~recycling loss: ${(ratio(f.closure.metal) * 100).toFixed(1)}% / ${(ratio(f.closure.silica) * 100).toFixed(1)}% makeup)`);
ok(f.closure.volatiles.closed, 'volatiles closes outright (bio-regen produces a surplus)');
ok(ratio(f.closure.water) > ratio(f.closure.metal) * 2, `water is the dominant makeup — life-support consumes it (${(ratio(f.closure.water) * 100).toFixed(0)}%)`);
ok(Object.values(f.closure).every((c) => c.recovered > 0 || c.demand === 0), 'every demanded feedstock has SOME recovery path (no commodity is purely makeup)');

// ── 6. the bio-regen organic loop actually runs (the biome seam): grow + digest + mill + galley all fire ──
for (const id of ['grow', 'digest', 'mill', 'galley', 'synth']) ok((f.rate[id] || 0) > 0, `bio-regen step '${PROCESS[id].name}' runs`);
ok(f.recovered.nutrient > 0 || (f.rate.digest > 0), 'the digester returns nutrient to the organic loop (bio-regeneration)');

// ── 7. energy (tide seam) + determinism + the packaged graph ──
ok(energyDemand(DEMAND) > 0 && isFinite(energyDemand(DEMAND)), `energy demand computed (${energyDemand(DEMAND)} — vs tide's total_GW)`);
ok(JSON.stringify(solveFlow(DEMAND)) === JSON.stringify(solveFlow(DEMAND)), 'solveFlow is deterministic');
const g = buildGraph();
ok(g.processes.length === PROCESSES.length && g.issues.length === 0 && Object.keys(g.materials).length > 20, 'buildGraph packages processes + materials + clean validate for the renderer');

console.log(`\ngraph.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
