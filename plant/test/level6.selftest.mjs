#!/usr/bin/env node
// Known-answer tests for LEVEL_6 (plant/levels/level6.mjs) — the first level
// neither autoSplit() nor a straight line can express: fan-out into two
// PROCESSORS with different yields (0.6 vs 1.0 ingot per ore), so the choice
// is genuinely "which recipe gets more of the ore", not just "who gets more
// of the raw resource" (LEVEL_5's fan-out is into two sinks with no
// conversion in between).
//
// House style matches plant/test/level5.selftest.mjs: every case is checked
// against a value computed by hand, not just truthiness (lp-a427fe: the
// oracle killed 6/6 mutations, so it is trusted as the judge here); every
// positive is paired with a CONTROL; the fair point is computed as a fraction
// in-test, never a rounded literal (lp-dff7a6's lesson about not disguising
// derived numbers as given ones); no slider sweep — exactly the shipped
// state, the two boundary-bracketing controls, and the fair point, since
// production.mjs's linear per-processor arithmetic does not branch on
// shareA and a full sweep would add no marginal detection value.
//
// Run: node plant/test/level6.selftest.mjs

import { feasible, band } from '../production.mjs';
import { LEVEL_6, withShareA } from '../levels/level6.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

const before = JSON.stringify(LEVEL_6);

console.log('\nLEVEL_6 as shipped (shareA=0.4): depotA exactly met, depotB has slack, overall margin 0 (tight)');
{
  const r = feasible(LEVEL_6);

  // smelterA supply = 100*0.4 = 40, scale = min(100, 40/1) = 40, output = 40*0.6 = 24
  // depotA achieved = 24 (demand 24, margin (24-24)/24 = 0)
  // smelterB supply = 100*0.6 = 60, scale = min(100, 60/1) = 60, output = 60*1.0 = 60
  // depotB achieved = 60 (demand 50, margin (60-50)/50 = 0.2)
  ok('feasible as shipped', r.ok);
  ok('achieved.depotA matches hand calc (24)', Math.abs(r.achieved.depotA - 24) < 1e-9, `${r.achieved.depotA}`);
  ok('achieved.depotB matches hand calc (60)', Math.abs(r.achieved.depotB - 60) < 1e-9, `${r.achieved.depotB}`);
  ok('no deficits', r.deficits.length === 0);
  // overall margin = min((24-24)/24, (60-50)/50) = min(0, 0.2) = 0
  ok('overall margin matches hand calc (0)', Math.abs(r.margin - 0) < 1e-9, `${r.margin}`);
  ok('band(0) is tight — opens feasible, barely, same texture as every prior level', band(r.margin) === 'tight', band(r.margin));
}

console.log('\nCONTROL below window — withShareA(LEVEL_6, 0.3): smelterA starves depotA, smelterB is untouched');
{
  const r = feasible(withShareA(LEVEL_6, 0.3));

  // smelterA supply = 100*0.3 = 30, output = 30*0.6 = 18 (demand 24, short by 6)
  // smelterB supply = 100*0.7 = 70, output = 70*1.0 = 70 (demand 50, well fed)
  ok('CONTROL below: infeasible', !r.ok);
  ok('CONTROL below: achieved.depotA matches hand calc (18)', Math.abs(r.achieved.depotA - 18) < 1e-9, `${r.achieved.depotA}`);
  ok('CONTROL below: achieved.depotB matches hand calc (70)', Math.abs(r.achieved.depotB - 70) < 1e-9, `${r.achieved.depotB}`);
  ok('CONTROL below: exactly one deficit', r.deficits.length === 1, `${r.deficits.length}`);
  ok('CONTROL below: the deficit names depotA', r.deficits[0].sinkId === 'depotA', r.deficits[0].sinkId);
  ok('CONTROL below: depotA short by exactly 6 units (24-18)',
    Math.abs((r.deficits[0].demand - r.deficits[0].achieved) - 6) < 1e-9);
  const marginA = (r.achieved.depotA - 24) / 24;
  ok('CONTROL below: margin matches hand calc (-0.25)', Math.abs(marginA - (-0.25)) < 1e-9, `${marginA}`);
  ok('CONTROL below: overall margin matches hand calc (-0.25)', Math.abs(r.margin - (-0.25)) < 1e-9, `${r.margin}`);
  ok('CONTROL below: band is infeasible', band(r.margin) === 'infeasible', band(r.margin));
  ok('CONTROL below: depotB is NOT short (70 >= demand 50)', r.achieved.depotB >= 50, `${r.achieved.depotB}`);
}

console.log('\nCONTROL above window — withShareA(LEVEL_6, 0.6): smelterB starves depotB, smelterA is untouched — the OPPOSITE sink from the low control');
{
  const r = feasible(withShareA(LEVEL_6, 0.6));

  // smelterA supply = 100*0.6 = 60, output = 60*0.6 = 36 (demand 24, well fed)
  // smelterB supply = 100*0.4 = 40, output = 40*1.0 = 40 (demand 50, short by 10)
  ok('CONTROL above: infeasible', !r.ok);
  ok('CONTROL above: achieved.depotA matches hand calc (36)', Math.abs(r.achieved.depotA - 36) < 1e-9, `${r.achieved.depotA}`);
  ok('CONTROL above: achieved.depotB matches hand calc (40)', Math.abs(r.achieved.depotB - 40) < 1e-9, `${r.achieved.depotB}`);
  ok('CONTROL above: exactly one deficit', r.deficits.length === 1, `${r.deficits.length}`);
  ok('CONTROL above: the deficit names depotB', r.deficits[0].sinkId === 'depotB', r.deficits[0].sinkId);
  ok('CONTROL above: depotB short by exactly 10 units (50-40)',
    Math.abs((r.deficits[0].demand - r.deficits[0].achieved) - 10) < 1e-9);
  const marginB = (r.achieved.depotB - 50) / 50;
  ok('CONTROL above: margin matches hand calc (-0.2)', Math.abs(marginB - (-0.2)) < 1e-9, `${marginB}`);
  ok('CONTROL above: overall margin matches hand calc (-0.2)', Math.abs(r.margin - (-0.2)) < 1e-9, `${r.margin}`);
  ok('CONTROL above: band is infeasible', band(r.margin) === 'infeasible', band(r.margin));
  ok('CONTROL above: depotA is NOT short (36 >= demand 24)', r.achieved.depotA >= 24, `${r.achieved.depotA}`);
}

console.log('\nfair point — withShareA(LEVEL_6, 4/9): equal margins on both sinks, still tight (a tighter window than LEVEL_5\'s)');
{
  const shareA = 4 / 9; // solved by hand: 2.5*shareA - 1 == 1 - 2*shareA => shareA = 2/4.5 = 4/9
  const r = feasible(withShareA(LEVEL_6, shareA));

  // smelterA supply = 100*(4/9), output = 100*(4/9)*0.6 = 240/9 (demand 24 = 216/9)
  // smelterB supply = 100*(5/9), output = 100*(5/9)*1.0 = 500/9 (demand 50 = 450/9)
  const achievedA = (240 / 9);
  const achievedB = (500 / 9);
  ok('feasible at the fair-split point', r.ok);
  ok('achieved.depotA matches hand calc (240/9)', Math.abs(r.achieved.depotA - achievedA) < 1e-9, `${r.achieved.depotA}`);
  ok('achieved.depotB matches hand calc (500/9)', Math.abs(r.achieved.depotB - achievedB) < 1e-9, `${r.achieved.depotB}`);

  const marginA = (r.achieved.depotA - 24) / 24;
  const marginB = (r.achieved.depotB - 50) / 50;
  ok('marginA matches hand calc (1/9)', Math.abs(marginA - (1 / 9)) < 1e-9, `${marginA}`);
  ok('marginB matches hand calc (1/9)', Math.abs(marginB - (1 / 9)) < 1e-9, `${marginB}`);
  ok('marginA === marginB — the max-min-fair signature', Math.abs(marginA - marginB) < 1e-9);
  ok('overall margin matches hand calc (1/9)', Math.abs(r.margin - (1 / 9)) < 1e-9, `${r.margin}`);
  ok('band(1/9) is tight — a tighter window than LEVEL_5\'s comfortable fair point', band(r.margin) === 'tight', band(r.margin));
}

console.log('\nwithShareA does not mutate LEVEL_6');
{
  const patched = withShareA(LEVEL_6, 0.6);
  ok('the returned copy carries the new shares',
    patched.edges.find((e) => e.to === 'smelterA').share === 0.6
    && Math.abs(patched.edges.find((e) => e.to === 'smelterB').share - 0.4) < 1e-9);
  ok('LEVEL_6\'s own edges are still 0.4/0.6 — no mutation',
    LEVEL_6.edges.find((e) => e.to === 'smelterA').share === 0.4
    && LEVEL_6.edges.find((e) => e.to === 'smelterB').share === 0.6);
  ok('LEVEL_6 itself is unchanged overall (re-stringify matches the pre-call snapshot)', JSON.stringify(LEVEL_6) === before);
}

console.log('');
if (failed) { console.log(`✗ level6 selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ level6 selftest passed\n');
