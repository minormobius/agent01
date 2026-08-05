#!/usr/bin/env node
// Known-answer tests for level-view.js's two pure functions — withSourceRate
// and verdictLine — which shipped with zero coverage until this file existed.
// Both are exactly the "confident lie" risk view.selftest.mjs's own header
// warns about: index.html renders verdictLine's return value directly as
// Level 1's pass/fail verdict, so a drift here is not a bug a player notices,
// it is a wrong verdict presented as a right one.
//
// House style matches production.selftest.mjs / level1.selftest.mjs: every
// margin below is taken from a fixture already hand-verified in an existing
// test file, so this file adds no new arithmetic of its own to get wrong.
//
// Run: node plant/test/level-view.selftest.mjs

import { withSourceRate, verdictLine } from '../level-view.js';
import { feasible } from '../production.mjs';
import { LEVEL_1 } from '../levels/level1.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\nwithSourceRate: overrides only the source node\'s rate, leaves everything else byte-identical');
{
  const before = JSON.stringify(LEVEL_1);
  const patched = withSourceRate(LEVEL_1, 42);

  const source = patched.nodes.find((n) => n.kind === 'source');
  ok('source rate is overridden', source.rate === 42, `${source.rate}`);

  const untouched = patched.nodes.filter((n) => n.kind !== 'source');
  const untouchedOrig = LEVEL_1.nodes.filter((n) => n.kind !== 'source');
  ok('every non-source node is byte-identical to LEVEL_1',
    JSON.stringify(untouched) === JSON.stringify(untouchedOrig));
  ok('edges are byte-identical to LEVEL_1',
    JSON.stringify(patched.edges) === JSON.stringify(LEVEL_1.edges));

  ok("LEVEL_1's own source node still reads rate 1000 — withSourceRate did not mutate it",
    LEVEL_1.nodes.find((n) => n.kind === 'source').rate === 1000);
  ok('LEVEL_1 itself is unchanged overall (re-stringify matches the pre-call snapshot)',
    JSON.stringify(LEVEL_1) === before);
}

console.log('\nverdictLine, ok path: band()\'s label now appears alongside the percentage');
{
  // LEVEL_1 as shipped -> margin 0.02 (pinned by level1.selftest.mjs) -> tight.
  const tight = verdictLine(feasible(LEVEL_1));
  ok('tight case names its band', tight.includes('tight'), tight);
  ok('tight case still carries the percentage (2%)', tight.includes('2'), tight);

  // production.selftest.mjs's basic chain at source rate 10 -> margin 0.25 -> comfortable.
  const comfortableNet = {
    nodes: [
      { kind: 'source', id: 'src', resource: 'iron', rate: 10 },
      { kind: 'processor', id: 'proc', inputs: [{ resource: 'iron', rate: 5 }], outputs: [{ resource: 'gear', rate: 5 }], capacity: 1 },
      { kind: 'sink', id: 'snk', resource: 'gear', demand: 4 },
    ],
    edges: [{ from: 'src', to: 'proc' }, { from: 'proc', to: 'snk' }],
  };
  const comfortable = verdictLine(feasible(comfortableNet));
  ok('comfortable case names its band', comfortable.includes('comfortable'), comfortable);

  // production.selftest.mjs's convergence fixture at rateB=4 -> margin 1 -> slack.
  const slackNet = {
    nodes: [
      { kind: 'source', id: 'a', resource: 'a', rate: 6 },
      { kind: 'source', id: 'b', resource: 'b', rate: 4 },
      { kind: 'processor', id: 'p', inputs: [{ resource: 'a', rate: 3 }, { resource: 'b', rate: 2 }], outputs: [{ resource: 'c', rate: 1 }], capacity: 10 },
      { kind: 'sink', id: 's', resource: 'c', demand: 1 },
    ],
    edges: [{ from: 'a', to: 'p' }, { from: 'b', to: 'p' }, { from: 'p', to: 's' }],
  };
  const slack = verdictLine(feasible(slackNet));
  ok('slack case names its band', slack.includes('slack'), slack);

  console.log('  CONTROL — a stub that always emits "tight" would pass the tight case and fail here');
  ok('tight and slack cases do not share a band word',
    !tight.includes('slack') && !slack.includes('tight'),
    `tight="${tight}" slack="${slack}"`);
}

console.log('\nverdictLine, fail path: unchanged by this edit');
{
  // level1.selftest.mjs's starved CONTROL: ore rate dropped 1000 -> 30, which
  // makes the source (not the smelter's untouched capacity 51) the bottleneck
  // -> achieved 30, short of the depot's demand of 50.
  const starved = JSON.parse(JSON.stringify(LEVEL_1));
  starved.nodes.find((n) => n.id === 'ore').rate = 30;
  const line = verdictLine(feasible(starved));

  ok('names the starved sink', line.includes('depot'), line);
  ok('names the demand (50)', line.includes('50'), line);
  ok('names what was achieved (30)', line.includes('30'), line);
}

console.log('');
if (failed) { console.log(`✗ level-view selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ level-view selftest passed\n');
