#!/usr/bin/env node
// Known-answer tests for LEVEL_1 (plant/levels/level1.mjs) — the first
// concrete recipe network gate 5 grades, not a synthetic case invented to
// exercise a code path.
//
// House style matches plant/test/production.selftest.mjs: every positive
// case is paired with a CONTROL that must fail, and every number is checked
// against a value computed by hand, not just truthiness (lp-a427fe: the
// oracle killed 6/6 mutations, so it is trusted as the judge here; lp-dff7a6:
// do not sweep a grid — two cases that bracket the boundary beat twenty that
// don't, so this file has exactly two: the level as shipped, and the one
// change that starves it).
//
// Run: node plant/test/level1.selftest.mjs

import { feasible } from '../production.mjs';
import { LEVEL_1 } from '../levels/level1.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

// Deep-clone LEVEL_1 so the CONTROL below can mutate one number without
// touching the exported literal — no structuredClone dependency, plain JSON
// round-trip is enough for a plain-data network object.
const clone = (net) => JSON.parse(JSON.stringify(net));

console.log('\nLEVEL_1 as shipped: ore -> smelter -> depot, small positive margin');
{
  const r = feasible(LEVEL_1);

  // scale = min(capacity 51, supply 1000 / inputRate 1) = 51 (capacity-bound,
  // the source is deliberately far above what the smelter can ever use) ->
  // gear out = 51 * 1 = 51, against a depot demanding 50.
  ok('feasible as shipped', r.ok);
  ok('achieved matches hand calc (51, capacity-bound)', Math.abs(r.achieved.depot - 51) < 1e-9, `${r.achieved.depot}`);
  ok('no deficits', r.deficits.length === 0);

  // margin = (51 - 50) / 50 = 0.02 — positive, and small: FACTORIO.md §3
  // calls margin the difficulty dial, and a huge margin makes this a diagram
  // instead of a puzzle. 0.02 is comfortably inside "small": under 5%.
  ok('margin matches hand calc (0.02)', Math.abs(r.margin - 0.02) < 1e-9, `${r.margin}`);
  ok('margin is positive but small (0 < margin < 0.05)', r.margin > 0 && r.margin < 0.05, `${r.margin}`);
}

console.log('\nCONTROL — same level, ore source rate lowered until it (not the smelter\'s capacity) is the bottleneck');
{
  // The only change from LEVEL_1: ore's rate drops from 1000 to 30. Nothing
  // else moves — same smelter capacity (51), same input/output rates, same
  // depot demand (50) — so a failure here can only be attributed to the
  // source no longer out-supplying the smelter, not to a second, unrelated
  // change muddying which one thing broke it.
  const starved = clone(LEVEL_1);
  starved.nodes.find((n) => n.id === 'ore').rate = 30;

  const r = feasible(starved);

  // scale = min(capacity 51, supply 30 / inputRate 1) = 30 — now SOURCE-bound,
  // not capacity-bound (30 < 51) -> gear out = 30 * 1 = 30, short of demand 50.
  ok('CONTROL: infeasible once the source is starved', !r.ok);
  ok('CONTROL: exactly one sink deficit', r.deficits.length === 1);
  ok('CONTROL: deficit names the right sink and resource',
    r.deficits[0].sinkId === 'depot' && r.deficits[0].resource === 'gear');
  ok('CONTROL: deficit demand is unchanged (50) — depot was never touched',
    r.deficits[0].demand === 50);

  // The number that actually pins the bottleneck to the SOURCE and not the
  // smelter: achieved equals the lowered source rate (30) exactly, not the
  // smelter's untouched capacity (51). If capacity were still the binding
  // term, achieved would still read 51 and this network would be feasible.
  ok('CONTROL: achieved equals the starved source rate exactly (30) — the source is the bottleneck, not capacity',
    Math.abs(r.achieved.depot - 30) < 1e-9 && Math.abs(r.deficits[0].achieved - 30) < 1e-9,
    `${r.achieved.depot}`);

  ok('CONTROL: margin matches hand calc ((30-50)/50 = -0.4)', Math.abs(r.margin - (-0.4)) < 1e-9, `${r.margin}`);

  console.log('  CONTROL of the CONTROL — the smelter\'s capacity (51) is untouched, so it is not what changed');
  ok('smelter capacity in the starved variant is still 51 (unchanged)',
    starved.nodes.find((n) => n.id === 'smelter').capacity === 51);
}

console.log('');
if (failed) { console.log(`✗ level1 selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ level1 selftest passed\n');
