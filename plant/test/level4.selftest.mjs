#!/usr/bin/env node
// Known-answer tests for LEVEL_4 (plant/levels/level4.mjs) — the first level
// with a real fan-out: one source, two sinks with different demand, whose
// fates are coupled through autoSplit()'s proportional share rather than each
// having its own private bottleneck (levels 1-3 are all straight lines).
//
// House style matches plant/test/level1.selftest.mjs and
// plant/test/level3.selftest.mjs: every case is checked against a value
// computed by hand, not just truthiness (lp-a427fe: the oracle killed 6/6
// mutations, so it is trusted as the judge here); every positive is paired
// with a CONTROL; exactly the boundary-bracketing cases, no slider sweep
// (lp-dff7a6: a full grid has zero marginal detection value when the
// implementation does not branch per case — LEVEL_4's arithmetic is the same
// shape regardless of which rate you pick, so four rates that bracket
// infeasible/tight/comfortable/slack are the whole story, one per band()).
//
// Run: node plant/test/level4.selftest.mjs

import { feasible, band, autoSplit } from '../production.mjs';
import { withSourceRate } from '../level-view.js';
import { LEVEL_4 } from '../levels/level4.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const messageOf = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

const before = JSON.stringify(LEVEL_4);

console.log('\nLEVEL_4 as shipped is NOT valid feasible() input on its own — it needs autoSplit() first');
{
  ok('feasible(LEVEL_4) throws (unsplit fan-out, same refusal as before shares existed)',
    throws(() => feasible(LEVEL_4)));
  ok('...and the message names the cause (fan-out)',
    (messageOf(() => feasible(LEVEL_4)) || '').includes('fan-out'), messageOf(() => feasible(LEVEL_4)));
}

console.log('\nautoSplit(LEVEL_4) fills the proportional shares: 30/100=0.3, 70/100=0.7');
{
  const split = autoSplit(LEVEL_4);
  const eA = split.edges.find((e) => e.to === 'stockpileA');
  const eB = split.edges.find((e) => e.to === 'stockpileB');
  ok('share to stockpileA is 30/100 = 0.3', Math.abs(eA.share - 0.3) < 1e-12, `${eA.share}`);
  ok('share to stockpileB is 70/100 = 0.7', Math.abs(eB.share - 0.7) < 1e-12, `${eB.share}`);
}

console.log('\nLEVEL_4 as shipped: rate 102 against total demand 100, small positive margin on both sinks');
{
  const r = feasible(autoSplit(LEVEL_4));

  // achieved.stockpileA = 102 * 0.3 = 30.6 (demand 30)
  // achieved.stockpileB = 102 * 0.7 = 71.4 (demand 70)
  ok('feasible as shipped', r.ok);
  ok('achieved.stockpileA matches hand calc (30.6)', Math.abs(r.achieved.stockpileA - 30.6) < 1e-9, `${r.achieved.stockpileA}`);
  ok('achieved.stockpileB matches hand calc (71.4)', Math.abs(r.achieved.stockpileB - 71.4) < 1e-9, `${r.achieved.stockpileB}`);
  ok('no deficits', r.deficits.length === 0);

  // margin_A = (30.6-30)/30 = 0.02, margin_B = (71.4-70)/70 = 0.02 — EQUAL,
  // the signature of a proportional split (production.mjs's autoSplit proof).
  const marginA = (r.achieved.stockpileA - 30) / 30;
  const marginB = (r.achieved.stockpileB - 70) / 70;
  ok('margin_A matches hand calc (0.02)', Math.abs(marginA - 0.02) < 1e-9, `${marginA}`);
  ok('margin_B matches hand calc (0.02)', Math.abs(marginB - 0.02) < 1e-9, `${marginB}`);
  ok('the two sinks\' margins are equal — proportional split, not favoritism', Math.abs(marginA - marginB) < 1e-9);
  ok('overall margin matches hand calc (0.02)', Math.abs(r.margin - 0.02) < 1e-9, `${r.margin}`);
  ok('band(margin) is tight — opens feasible, barely, same texture as LEVEL_1/LEVEL_3', band(r.margin) === 'tight', band(r.margin));
}

console.log('\nrate raised to 130: both sinks land in the COMFORTABLE band, not tight or slack');
{
  const r = feasible(autoSplit(withSourceRate(LEVEL_4, 130)));

  // achieved.stockpileA = 130*0.3 = 39 (demand 30)
  // achieved.stockpileB = 130*0.7 = 91 (demand 70)
  ok('feasible', r.ok);
  ok('achieved.stockpileA matches hand calc (39)', Math.abs(r.achieved.stockpileA - 39) < 1e-9, `${r.achieved.stockpileA}`);
  ok('achieved.stockpileB matches hand calc (91)', Math.abs(r.achieved.stockpileB - 91) < 1e-9, `${r.achieved.stockpileB}`);
  ok('no deficits', r.deficits.length === 0);
  // margin = 130/100 - 1 = 0.3, comfortably between the tight (0.15) and slack (0.5) boundaries
  ok('overall margin matches hand calc (0.3)', Math.abs(r.margin - 0.3) < 1e-9, `${r.margin}`);
  ok('band(0.3) is comfortable', band(r.margin) === 'comfortable', band(r.margin));
}

console.log('\nCONTROL A — rate dropped to 60: both sinks starve by the SAME fraction, but not the same amount');
{
  const r = feasible(autoSplit(withSourceRate(LEVEL_4, 60)));

  // achieved.stockpileA = 60*0.3 = 18 (demand 30, short by 12)
  // achieved.stockpileB = 60*0.7 = 42 (demand 70, short by 28)
  ok('CONTROL A: infeasible once the source is starved', !r.ok);
  ok('CONTROL A: achieved.stockpileA matches hand calc (18)', Math.abs(r.achieved.stockpileA - 18) < 1e-9, `${r.achieved.stockpileA}`);
  ok('CONTROL A: achieved.stockpileB matches hand calc (42)', Math.abs(r.achieved.stockpileB - 42) < 1e-9, `${r.achieved.stockpileB}`);
  ok('CONTROL A: exactly two deficits, one per sink', r.deficits.length === 2);

  const marginA = (r.achieved.stockpileA - 30) / 30;
  const marginB = (r.achieved.stockpileB - 70) / 70;
  ok('CONTROL A: margin_A matches hand calc (-0.4)', Math.abs(marginA - (-0.4)) < 1e-9, `${marginA}`);
  ok('CONTROL A: margin_B matches hand calc (-0.4)', Math.abs(marginB - (-0.4)) < 1e-9, `${marginB}`);
  ok('CONTROL A: both sinks share the SAME percentage shortfall — nobody is favored over the other',
    Math.abs(marginA - marginB) < 1e-9);

  const deficitA = r.deficits.find((d) => d.sinkId === 'stockpileA');
  const deficitB = r.deficits.find((d) => d.sinkId === 'stockpileB');
  ok('CONTROL A: stockpileA is short by exactly 12 units (30-18)', Math.abs((deficitA.demand - deficitA.achieved) - 12) < 1e-9);
  ok('CONTROL A: stockpileB is short by exactly 28 units (70-42)', Math.abs((deficitB.demand - deficitB.achieved) - 28) < 1e-9);
  ok('CONTROL A: stockpileB loses MORE ABSOLUTE units than stockpileA despite an equal PERCENTAGE shortfall — the new lesson',
    (deficitB.demand - deficitB.achieved) > (deficitA.demand - deficitA.achieved));
  ok('CONTROL A: overall margin matches hand calc (-0.4)', Math.abs(r.margin - (-0.4)) < 1e-9, `${r.margin}`);
  ok('band(-0.4) is infeasible', band(r.margin) === 'infeasible', band(r.margin));
}

console.log('\nCONTROL B — rate raised to 200: both sinks comfortably fed, well past slack');
{
  const r = feasible(autoSplit(withSourceRate(LEVEL_4, 200)));

  // achieved.stockpileA = 200*0.3 = 60 (demand 30, double)
  // achieved.stockpileB = 200*0.7 = 140 (demand 70, double)
  ok('CONTROL B: feasible with plenty to spare', r.ok);
  ok('CONTROL B: achieved.stockpileA matches hand calc (60)', Math.abs(r.achieved.stockpileA - 60) < 1e-9, `${r.achieved.stockpileA}`);
  ok('CONTROL B: achieved.stockpileB matches hand calc (140)', Math.abs(r.achieved.stockpileB - 140) < 1e-9, `${r.achieved.stockpileB}`);
  ok('CONTROL B: overall margin matches hand calc (1.0)', Math.abs(r.margin - 1) < 1e-9, `${r.margin}`);
  ok('band(1) is slack', band(r.margin) === 'slack', band(r.margin));

  console.log('  CONTROL of the CONTROL — the demands themselves (30, 70) are untouched by a rate change');
  ok('stockpileA demand in the raised-rate variant is still 30 (unchanged)',
    withSourceRate(LEVEL_4, 200).nodes.find((n) => n.id === 'stockpileA').demand === 30);
  ok('stockpileB demand in the raised-rate variant is still 70 (unchanged)',
    withSourceRate(LEVEL_4, 200).nodes.find((n) => n.id === 'stockpileB').demand === 70);
}

console.log('\nwithSourceRate / autoSplit do not mutate LEVEL_4');
{
  const patched = withSourceRate(LEVEL_4, 60);
  ok('ore rate is overridden on the returned copy', patched.nodes.find((n) => n.id === 'ore').rate === 60);
  ok('LEVEL_4\'s own ore node still reads rate 102 — no mutation', LEVEL_4.nodes.find((n) => n.id === 'ore').rate === 102);
  autoSplit(LEVEL_4);
  ok('LEVEL_4 itself is unchanged overall (re-stringify matches the pre-call snapshot)', JSON.stringify(LEVEL_4) === before);
}

console.log('');
if (failed) { console.log(`✗ level4 selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ level4 selftest passed\n');
