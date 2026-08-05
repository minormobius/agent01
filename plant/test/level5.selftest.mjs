#!/usr/bin/env node
// Known-answer tests for LEVEL_5 (plant/levels/level5.mjs) — the first level
// where the PLAYER's own explicit-share choice decides who gets fed, not a
// formula (LEVEL_4's autoSplit() removes that choice; this level's shares are
// player-set literals, `shareA` and `1 - shareA`, always summing to 1).
//
// House style matches plant/test/level4.selftest.mjs: every case is checked
// against a value computed by hand, not just truthiness (lp-a427fe: the
// oracle killed 6/6 mutations, so it is trusted as the judge here); every
// positive is paired with a CONTROL; a no-mutation check; a no-throw
// invariant specific to this level (its shares always sum to exactly 1, so
// unlike LEVEL_4's autoSplit path it never needs a try/catch).
//
// Run: node plant/test/level5.selftest.mjs

import { feasible, band } from '../production.mjs';
import { LEVEL_5, withShareA } from '../levels/level5.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

const before = JSON.stringify(LEVEL_5);

console.log('\nLEVEL_5 as shipped (shareA=0.3): fieldA exactly met, fieldB has slack, overall margin 0 (tight)');
{
  const r = feasible(LEVEL_5);

  // achieved.fieldA = 100*0.3 = 30 (demand 30, margin (30-30)/30 = 0)
  // achieved.fieldB = 100*0.7 = 70 (demand 50, margin (70-50)/50 = 0.4)
  ok('feasible as shipped', r.ok);
  ok('achieved.fieldA matches hand calc (30)', Math.abs(r.achieved.fieldA - 30) < 1e-9, `${r.achieved.fieldA}`);
  ok('achieved.fieldB matches hand calc (70)', Math.abs(r.achieved.fieldB - 70) < 1e-9, `${r.achieved.fieldB}`);
  ok('no deficits', r.deficits.length === 0);
  // overall margin = min((30-30)/30, (70-50)/50) = min(0, 0.4) = 0
  ok('overall margin matches hand calc (0)', Math.abs(r.margin - 0) < 1e-9, `${r.margin}`);
  ok('band(0) is tight — opens feasible, barely, same texture as LEVEL_1/LEVEL_3/LEVEL_4', band(r.margin) === 'tight', band(r.margin));
}

console.log('\nwithShareA(LEVEL_5, 0.5) — the other edge of the valid window: fieldB exactly met, fieldA has slack');
{
  const r = feasible(withShareA(LEVEL_5, 0.5));

  // achieved.fieldA = 100*0.5 = 50 (demand 30, margin (50-30)/30 = 0.667)
  // achieved.fieldB = 100*0.5 = 50 (demand 50, margin (50-50)/50 = 0)
  ok('feasible at the other window edge', r.ok);
  ok('achieved.fieldA matches hand calc (50)', Math.abs(r.achieved.fieldA - 50) < 1e-9, `${r.achieved.fieldA}`);
  ok('achieved.fieldB matches hand calc (50)', Math.abs(r.achieved.fieldB - 50) < 1e-9, `${r.achieved.fieldB}`);
  ok('no deficits', r.deficits.length === 0);
  ok('overall margin matches hand calc (0)', Math.abs(r.margin - 0) < 1e-9, `${r.margin}`);
  ok('band(0) is tight', band(r.margin) === 'tight', band(r.margin));
}

console.log('\nwithShareA(LEVEL_5, 0.375) — the fair-split optimum: equal margins on both sinks (max-min-fair signature)');
{
  const r = feasible(withShareA(LEVEL_5, 0.375));

  // achieved.fieldA = 100*0.375 = 37.5 (demand 30)
  // achieved.fieldB = 100*0.625 = 62.5 (demand 50)
  ok('feasible at the fair-split optimum', r.ok);
  ok('achieved.fieldA matches hand calc (37.5)', Math.abs(r.achieved.fieldA - 37.5) < 1e-9, `${r.achieved.fieldA}`);
  ok('achieved.fieldB matches hand calc (62.5)', Math.abs(r.achieved.fieldB - 62.5) < 1e-9, `${r.achieved.fieldB}`);

  const marginA = (r.achieved.fieldA - 30) / 30;
  const marginB = (r.achieved.fieldB - 50) / 50;
  ok('marginA matches hand calc (0.25)', Math.abs(marginA - 0.25) < 1e-9, `${marginA}`);
  ok('marginB matches hand calc (0.25)', Math.abs(marginB - 0.25) < 1e-9, `${marginB}`);
  ok('marginA === marginB — the max-min-fair signature', Math.abs(marginA - marginB) < 1e-9);
  ok('overall margin matches hand calc (0.25)', Math.abs(r.margin - 0.25) < 1e-9, `${r.margin}`);
  ok('band(0.25) is comfortable', band(r.margin) === 'comfortable', band(r.margin));
}

console.log('\nCONTROL A — withShareA(LEVEL_5, 0.2): favoring fieldB too far, fieldA starves, fieldB is untouched');
{
  const r = feasible(withShareA(LEVEL_5, 0.2));

  // achieved.fieldA = 100*0.2 = 20 (demand 30, short by 10)
  // achieved.fieldB = 100*0.8 = 80 (demand 50, well fed)
  ok('CONTROL A: infeasible', !r.ok);
  ok('CONTROL A: achieved.fieldA matches hand calc (20)', Math.abs(r.achieved.fieldA - 20) < 1e-9, `${r.achieved.fieldA}`);
  ok('CONTROL A: exactly one deficit', r.deficits.length === 1);
  ok('CONTROL A: the deficit names fieldA', r.deficits[0].sinkId === 'fieldA', r.deficits[0].sinkId);
  const marginA = (r.achieved.fieldA - 30) / 30;
  ok('CONTROL A: margin matches hand calc (-1/3)', Math.abs(marginA - (-1 / 3)) < 1e-9, `${marginA}`);
  ok('CONTROL A: overall margin matches hand calc (-1/3)', Math.abs(r.margin - (-1 / 3)) < 1e-9, `${r.margin}`);
  ok('CONTROL A: band is infeasible', band(r.margin) === 'infeasible', band(r.margin));
  ok('CONTROL A: fieldB is NOT short (80 >= demand 50)', r.achieved.fieldB >= 50, `${r.achieved.fieldB}`);
}

console.log('\nCONTROL B — withShareA(LEVEL_5, 0.6): favoring fieldA too far, fieldB starves, fieldA is untouched');
{
  const r = feasible(withShareA(LEVEL_5, 0.6));

  // achieved.fieldA = 100*0.6 = 60 (demand 30, well fed)
  // achieved.fieldB = 100*0.4 = 40 (demand 50, short by 10)
  ok('CONTROL B: infeasible', !r.ok);
  ok('CONTROL B: achieved.fieldB matches hand calc (40)', Math.abs(r.achieved.fieldB - 40) < 1e-9, `${r.achieved.fieldB}`);
  ok('CONTROL B: exactly one deficit', r.deficits.length === 1);
  ok('CONTROL B: the deficit names fieldB', r.deficits[0].sinkId === 'fieldB', r.deficits[0].sinkId);
  const marginB = (r.achieved.fieldB - 50) / 50;
  ok('CONTROL B: margin matches hand calc (-0.2)', Math.abs(marginB - (-0.2)) < 1e-9, `${marginB}`);
  ok('CONTROL B: overall margin matches hand calc (-0.2)', Math.abs(r.margin - (-0.2)) < 1e-9, `${r.margin}`);
  ok('CONTROL B: band is infeasible', band(r.margin) === 'infeasible', band(r.margin));
  ok('CONTROL B: fieldA is NOT short (60 >= demand 30)', r.achieved.fieldA >= 30, `${r.achieved.fieldA}`);
}

console.log('\nno-throw invariant: shares always sum to exactly 1, so this level is always legal input to feasible()');
{
  for (const shareA of [0.05, 0.3, 0.375, 0.5, 0.95]) {
    ok(`feasible(withShareA(LEVEL_5, ${shareA})) does not throw`,
      !throws(() => feasible(withShareA(LEVEL_5, shareA))));
  }
}

console.log('\nwithShareA does not mutate LEVEL_5');
{
  const patched = withShareA(LEVEL_5, 0.6);
  ok('the returned copy carries the new shares',
    patched.edges.find((e) => e.to === 'fieldA').share === 0.6
    && Math.abs(patched.edges.find((e) => e.to === 'fieldB').share - 0.4) < 1e-9);
  ok('LEVEL_5\'s own edges are still 0.3/0.7 — no mutation',
    LEVEL_5.edges.find((e) => e.to === 'fieldA').share === 0.3
    && LEVEL_5.edges.find((e) => e.to === 'fieldB').share === 0.7);
  ok('LEVEL_5 itself is unchanged overall (re-stringify matches the pre-call snapshot)', JSON.stringify(LEVEL_5) === before);
}

console.log('');
if (failed) { console.log(`✗ level5 selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ level5 selftest passed\n');
