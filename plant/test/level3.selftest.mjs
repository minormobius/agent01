#!/usr/bin/env node
// Known-answer tests for LEVEL_3 (plant/levels/level3.mjs) — the first level
// where TWO independently player-set processor capacities can each be the
// bottleneck, not just one.
//
// House style matches plant/test/level1.selftest.mjs and
// plant/test/level2.selftest.mjs: every case is checked against a value
// computed by hand, not just truthiness (lp-a427fe: the oracle killed 6/6
// mutations, so it is trusted as the judge here); every positive is paired
// with a CONTROL; exactly the boundary-bracketing cases, no slider sweep
// (lp-dff7a6: a full grid has zero marginal detection value when the
// implementation does not branch per case).
//
// Run: node plant/test/level3.selftest.mjs

import { feasible, band } from '../production.mjs';
import { withProcessorCapacity } from '../level-view.js';
import { LEVEL_3 } from '../levels/level3.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

const before = JSON.stringify(LEVEL_3);

console.log('\nLEVEL_3 as shipped: ore -> miner -> smelter -> depot, tight positive margin');
{
  const r = feasible(LEVEL_3);

  // scale_miner   = min(capacity 70, supply 300/1) = 70 -> ingot out = 70.
  // scale_smelter = min(capacity 45, supply 70/1)  = 45 -> gear out  = 45.
  // depot demand 44 -> achieved 45.
  ok('feasible as shipped', r.ok);
  ok('achieved matches hand calc (45, smelter capacity-bound)', Math.abs(r.achieved.depot - 45) < 1e-9, `${r.achieved.depot}`);
  ok('no deficits', r.deficits.length === 0);

  // margin = (45 - 44) / 44 = 1/44 ≈ 0.02272727...
  const expectedMargin = 45 / 44 - 1;
  ok('margin matches hand calc (45/44 - 1)', Math.abs(r.margin - expectedMargin) < 1e-9, `${r.margin}`);
  ok('band(margin) is tight — opens feasible, barely', band(r.margin) === 'tight', band(r.margin));
}

console.log('\nCONTROL A — miner capacity dropped to 40, smelter left untouched at 45');
{
  const lvl = withProcessorCapacity(LEVEL_3, 'miner', 40);
  const r = feasible(lvl);

  // scale_miner   = min(40, 300/1) = 40 -> ingot out = 40.
  // scale_smelter = min(45, 40/1)  = 40 (now ingot-supply-bound, not its own
  //                 capacity) -> gear out = 40, short of demand 44.
  ok('CONTROL A: infeasible once the miner is capped', !r.ok);
  ok('CONTROL A: achieved matches hand calc (40)', Math.abs(r.achieved.depot - 40) < 1e-9, `${r.achieved.depot}`);
  const expectedMarginA = 40 / 44 - 1; // = -4/44
  ok('CONTROL A: margin matches hand calc (-4/44)', Math.abs(r.margin - expectedMarginA) < 1e-9, `${r.margin}`);
  ok('CONTROL A: exactly one deficit naming depot/gear',
    r.deficits.length === 1 && r.deficits[0].sinkId === 'depot' && r.deficits[0].resource === 'gear');

  console.log('  CONTROL of the CONTROL — the smelter\'s own capacity (45) is untouched, so it is not what changed');
  ok('smelter capacity in the miner-capped variant is still 45 (unchanged)',
    lvl.nodes.find((n) => n.id === 'smelter').capacity === 45);
}

console.log('\nCONTROL B — smelter capacity dropped to 40, miner left untouched at 70');
{
  const lvl = withProcessorCapacity(LEVEL_3, 'smelter', 40);
  const r = feasible(lvl);

  // scale_miner   = min(70, 300/1) = 70 -> ingot out = 70 (unchanged from shipped).
  // scale_smelter = min(40, 70/1)  = 40 (now capacity-bound again, this time
  //                 at its own lowered ceiling) -> gear out = 40.
  ok('CONTROL B: infeasible once the smelter is capped', !r.ok);
  ok('CONTROL B: achieved matches hand calc (40)', Math.abs(r.achieved.depot - 40) < 1e-9, `${r.achieved.depot}`);
  const expectedMarginB = 40 / 44 - 1;
  ok('CONTROL B: margin matches hand calc (-4/44)', Math.abs(r.margin - expectedMarginB) < 1e-9, `${r.margin}`);

  console.log('  the whole point — either knob alone bottlenecks the depot to the SAME result');
  const rA = feasible(withProcessorCapacity(LEVEL_3, 'miner', 40));
  ok('CONTROL A and CONTROL B produce byte-identical achieved.depot',
    rA.achieved.depot === r.achieved.depot, `${rA.achieved.depot} vs ${r.achieved.depot}`);
  ok('CONTROL A and CONTROL B produce byte-identical margin',
    rA.margin === r.margin, `${rA.margin} vs ${r.margin}`);

  console.log('  CONTROL of the CONTROL — the miner\'s own capacity (70) is untouched, so it is not what changed');
  ok('miner capacity in the smelter-capped variant is still 70 (unchanged)',
    lvl.nodes.find((n) => n.id === 'miner').capacity === 70);
}

console.log('\nwithProcessorCapacity does not mutate its input');
{
  const patched = withProcessorCapacity(LEVEL_3, 'miner', 40);
  ok('miner capacity is overridden on the returned copy',
    patched.nodes.find((n) => n.id === 'miner').capacity === 40);
  ok('LEVEL_3\'s own miner node still reads capacity 70 — no mutation',
    LEVEL_3.nodes.find((n) => n.id === 'miner').capacity === 70);
  ok('LEVEL_3 itself is unchanged overall (re-stringify matches the pre-call snapshot)',
    JSON.stringify(LEVEL_3) === before);
}

console.log('');
if (failed) { console.log(`✗ level3 selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ level3 selftest passed\n');
