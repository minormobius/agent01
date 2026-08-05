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

import { withSourceRate, verdictLine, drawLevel } from '../level-view.js';
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

console.log('\nverdictLine, fail path with TWO deficits: every starved sink must be named, not just deficits[0]');
{
  // A source fanning out (explicit shares, same shape as production.selftest.mjs's
  // "fan-out WITH explicit shares" block) to two sinks that are BOTH short, by
  // different absolute amounts — the exact shape lp-7e1c54 names in LEVEL_4's
  // CONTROL A (rate dropped to 60), reproduced here as an inline fixture per
  // this ticket's independence rule (R4) rather than importing levels/level4.mjs.
  // ore rate 10, share 0.3/0.7 -> stockpileA gets 3 (needs 5, short 2),
  // stockpileB gets 7 (needs 8, short 1).
  const twoDeficitNet = {
    nodes: [
      { kind: 'source', id: 'ore', resource: 'ore', rate: 10 },
      { kind: 'sink', id: 'stockpileA', resource: 'ore', demand: 5 },
      { kind: 'sink', id: 'stockpileB', resource: 'ore', demand: 8 },
    ],
    edges: [
      { from: 'ore', to: 'stockpileA', share: 0.3 },
      { from: 'ore', to: 'stockpileB', share: 0.7 },
    ],
  };
  const v = feasible(twoDeficitNet);
  ok('fixture sanity: both sinks are short', v.deficits.length === 2, JSON.stringify(v.deficits));

  const line = verdictLine(v);
  const occurrences = (needle) => line.split(needle).length - 1;

  ok('names stockpileA', line.includes('stockpileA'), line);
  ok('names stockpileB', line.includes('stockpileB'), line);
  ok("names stockpileA's demand (5)", line.includes('5'), line);
  ok("names stockpileA's achieved (3)", line.includes('3'), line);
  ok("names stockpileB's demand (8)", line.includes('8'), line);
  ok("names stockpileB's achieved (7)", line.includes('7'), line);

  console.log('  CONTROL — the old deficits[0]-only shape names stockpileA but never stockpileB');
  ok('stockpileA appears exactly once (not silently repeated)', occurrences('stockpileA') === 1, line);
  ok('stockpileB appears exactly once — proves it was not truncated away like the old code would',
    occurrences('stockpileB') === 1, line);
}

console.log('\ndrawLevel: layered layout — regression against the old single-chain walk');
{
  // drawLevel()'s only interaction with `svg` is `svg.innerHTML = ...` — it
  // never reads from it, so a plain object stands in for a real SVG element.
  const svg = { innerHTML: '' };
  drawLevel(svg, LEVEL_1, feasible(LEVEL_1));

  const idx = (s) => svg.innerHTML.indexOf(`>${s}<`);
  const [oreAt, smelterAt, depotAt] = ['ore', 'smelter', 'depot'].map(idx);

  ok('ore appears exactly once', svg.innerHTML.split('>ore<').length - 1 === 1);
  ok('smelter appears exactly once', svg.innerHTML.split('>smelter<').length - 1 === 1);
  ok('depot appears exactly once', svg.innerHTML.split('>depot<').length - 1 === 1);
  ok('ore, smelter, depot appear left-to-right, unchanged from the single-chain layout',
    oreAt >= 0 && oreAt < smelterAt && smelterAt < depotAt,
    `ore@${oreAt} smelter@${smelterAt} depot@${depotAt}`);
}

console.log('\ndrawLevel: convergence — two sources into one processor must not drop either');
{
  // The exact a/b/p/s network already hand-verified in this file's
  // verdictLine "slack" case above (production.selftest.mjs's convergence
  // fixture) — reused rather than importing a level module, per the ticket's
  // independence rule (R4): this test must not order against the paired
  // LEVEL_4 proposal.
  const convergenceNet = {
    nodes: [
      { kind: 'source', id: 'a', resource: 'a', rate: 6 },
      { kind: 'source', id: 'b', resource: 'b', rate: 4 },
      { kind: 'processor', id: 'p', inputs: [{ resource: 'a', rate: 3 }, { resource: 'b', rate: 2 }], outputs: [{ resource: 'c', rate: 1 }], capacity: 10 },
      { kind: 'sink', id: 's', resource: 'c', demand: 1 },
    ],
    edges: [{ from: 'a', to: 'p' }, { from: 'b', to: 'p' }, { from: 'p', to: 's' }],
  };

  const svg = { innerHTML: '' };
  let threw = false;
  try { drawLevel(svg, convergenceNet, feasible(convergenceNet)); } catch { threw = true; }

  ok('drawLevel does not throw on a converging network', !threw);
  ok('renders node "a"', svg.innerHTML.includes('>a<'));
  ok('renders node "b"', svg.innerHTML.includes('>b<'),
    'today\'s single-chain walk picks whichever source Array.prototype.find returns first and drops the other');
  ok('renders exactly 4 boxes, one per node', (svg.innerHTML.match(/<rect/g) || []).length === 4,
    `${(svg.innerHTML.match(/<rect/g) || []).length} boxes for a 4-node network`);
}

console.log('\ndrawLevel: fan-out — a node with two outgoing edges must render both arrows, not just the last');
{
  // production.selftest.mjs's own hand-verified explicit-share fixture:
  // source rate 10, resource x, edges src->s1 share 0.3 and src->s2 share 0.7.
  // Margins there are hand-computed as s1 (10*0.3-2)/2=0.5, s2 (10*0.7-6)/6=1/6.
  const fanOutNet = {
    nodes: [
      { kind: 'source', id: 'src', resource: 'x', rate: 10 },
      { kind: 'sink', id: 's1', resource: 'x', demand: 2 },
      { kind: 'sink', id: 's2', resource: 'x', demand: 6 },
    ],
    edges: [
      { from: 'src', to: 's1', share: 0.3 },
      { from: 'src', to: 's2', share: 0.7 },
    ],
  };

  const svg = { innerHTML: '' };
  let threw = false;
  try { drawLevel(svg, fanOutNet, feasible(fanOutNet)); } catch { threw = true; }

  ok('drawLevel does not throw on a fan-out network', !threw);
  ok('renders node "src" exactly once', svg.innerHTML.split('>src<').length - 1 === 1);
  ok('renders node "s1" exactly once', svg.innerHTML.split('>s1<').length - 1 === 1);
  ok('renders node "s2" exactly once', svg.innerHTML.split('>s2<').length - 1 === 1);

  const pathCount = (svg.innerHTML.match(/<path/g) || []).length;
  console.log('  CONTROL — under the old fromId-keyed Map, the second edge silently overwrote the first: 2 <path elements, not 4');
  ok('renders exactly 4 <path elements — 2 per edge (line + arrowhead), for 2 edges',
    pathCount === 4, `${pathCount} <path elements`);
}

console.log('');
if (failed) { console.log(`✗ level-view selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ level-view selftest passed\n');
