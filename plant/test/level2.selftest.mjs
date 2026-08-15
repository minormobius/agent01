#!/usr/bin/env node
// Known-answer tests for LEVEL_2 (plant/levels/level2.mjs) — the discrete
// three-way machine choice, the direct alternative to LEVEL_1's continuous
// ore-rate drag.
//
// House style matches plant/test/level1.selftest.mjs: every case is checked
// against a value computed by hand, not just truthiness, and every positive
// is paired with a CONTROL (lp-a427fe: the oracle killed 6/6 mutations, so it
// is trusted as the judge here).
//
// Run: node plant/test/level2.selftest.mjs

import { feasible } from '../production.mjs';
import { withProcessorCapacity } from '../level-view.js';
import { LEVEL_2_BASE, SMELTER_OPTIONS } from '../levels/level2.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

const before = JSON.stringify(LEVEL_2_BASE);
const optionById = (id) => SMELTER_OPTIONS.find((o) => o.id === id);

console.log('\nLEVEL_2_BASE ships with the cheap smelter — already infeasible on load');
{
  const cheap = optionById('cheap');
  ok('cheap is capacity 30 (the shipped base)', cheap.capacity === 30, `${cheap.capacity}`);
  ok('LEVEL_2_BASE ships pre-loaded with cheap\'s capacity',
    LEVEL_2_BASE.nodes.find((n) => n.id === 'smelter').capacity === cheap.capacity);

  const r = feasible(LEVEL_2_BASE);
  // scale = min(capacity 30, supply 55 / inputRate 1) = 30 (capacity-bound) -> gear out = 30.
  ok('shipped base is infeasible', !r.ok);
  ok('achieved matches hand calc (30, capacity-bound)', Math.abs(r.achieved.depot - 30) < 1e-9, `${r.achieved.depot}`);
  ok('margin matches hand calc ((30-50)/50 = -0.4)', Math.abs(r.margin - (-0.4)) < 1e-9, `${r.margin}`);
}

console.log('\ncheap (30): the wildly-short decoy');
{
  const cheap = optionById('cheap');
  const lvl = withProcessorCapacity(LEVEL_2_BASE, 'smelter', cheap.capacity);
  const r = feasible(lvl);

  // scale = min(30, 55/1) = 30 (capacity-bound) -> achieved 30, demand 50.
  ok('cheap: infeasible', !r.ok);
  ok('cheap: achieved matches hand calc (30)', Math.abs(r.achieved.depot - 30) < 1e-9, `${r.achieved.depot}`);
  ok('cheap: margin matches hand calc (-0.4)', Math.abs(r.margin - (-0.4)) < 1e-9, `${r.margin}`);
  ok('cheap: exactly one deficit naming depot/gear',
    r.deficits.length === 1 && r.deficits[0].sinkId === 'depot' && r.deficits[0].resource === 'gear');
}

console.log('\ngood (48): the near-miss decoy — short by only 2, do not let the label pass it by inspection');
{
  const good = optionById('good');
  const lvl = withProcessorCapacity(LEVEL_2_BASE, 'smelter', good.capacity);
  const r = feasible(lvl);

  // scale = min(48, 55/1) = 48 (capacity-bound) -> achieved 48, demand 50.
  ok('good: still infeasible', !r.ok);
  ok('good: achieved matches hand calc (48, capacity-bound)', Math.abs(r.achieved.depot - 48) < 1e-9, `${r.achieved.depot}`);
  ok('good: margin matches hand calc ((48-50)/50 = -0.04)', Math.abs(r.margin - (-0.04)) < 1e-9, `${r.margin}`);
  ok('good: short by exactly 2', Math.abs((50 - r.achieved.depot) - 2) < 1e-9, `${r.achieved.depot}`);
}

console.log('\ngolden (90): the only feasible choice — and its own capacity is not what limits it');
{
  const golden = optionById('golden');
  const lvl = withProcessorCapacity(LEVEL_2_BASE, 'smelter', golden.capacity);
  const r = feasible(lvl);

  // scale = min(90, 55/1) = 55 — ORE-rate-capped (55 < 90), not its own
  // capacity -> achieved 55, ahead of demand 50.
  ok('golden: feasible', r.ok);
  ok('golden: achieved matches hand calc (55, ore-capped not capacity-capped)',
    Math.abs(r.achieved.depot - 55) < 1e-9, `${r.achieved.depot}`);
  ok('golden: achieved is NOT its own capacity (90) — the ore source is the real limit',
    Math.abs(r.achieved.depot - 90) > 1e-9);
  ok('golden: margin matches hand calc ((55-50)/50 = 0.10)', Math.abs(r.margin - 0.10) < 1e-9, `${r.margin}`);
  ok('golden: no deficits', r.deficits.length === 0);
}

console.log('\nexactly one of the three options is feasible (golden)');
{
  const results = SMELTER_OPTIONS.map((o) => ({
    id: o.id,
    ok: feasible(withProcessorCapacity(LEVEL_2_BASE, 'smelter', o.capacity)).ok,
  }));
  const feasibleIds = results.filter((r) => r.ok).map((r) => r.id);
  ok('exactly one option is feasible', feasibleIds.length === 1, JSON.stringify(results));
  ok('that option is golden', feasibleIds[0] === 'golden', JSON.stringify(results));
}

console.log('\nwithProcessorCapacity does not mutate its input');
{
  const patched = withProcessorCapacity(LEVEL_2_BASE, 'smelter', 90);
  ok('smelter capacity is overridden on the returned copy',
    patched.nodes.find((n) => n.id === 'smelter').capacity === 90);
  ok('LEVEL_2_BASE\'s own smelter node still reads capacity 30 — no mutation',
    LEVEL_2_BASE.nodes.find((n) => n.id === 'smelter').capacity === 30);
  ok('LEVEL_2_BASE itself is unchanged overall (re-stringify matches the pre-call snapshot)',
    JSON.stringify(LEVEL_2_BASE) === before);

  console.log('  CONTROL — withProcessorCapacity ignores a node id that is not a processor');
  const untouched = withProcessorCapacity(LEVEL_2_BASE, 'ore', 999);
  ok('CONTROL: a non-processor id (the source) is left alone',
    untouched.nodes.find((n) => n.id === 'ore').rate === 55 && untouched.nodes.find((n) => n.id === 'ore').capacity === undefined);
}

console.log('');
if (failed) { console.log(`✗ level2 selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ level2 selftest passed\n');
