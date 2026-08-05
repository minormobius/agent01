#!/usr/bin/env node
// Known-answer tests for the production feasibility oracle (plant/production.mjs).
//
// Gate 5 (FACTORIO.md §2/§3): "is this recipe set satisfiable?" is exact
// linear feasibility over a flow network — no search, no model opinion. This
// is the gate for that gate, and it is written against the standing findings
// that (1) a self-authored gate certifies absence-of-regression, not
// presence-of-correctness, and (2) a checker that fails correct work is worse
// than no checker (solids.mjs's header, lp-b5b0b1/lp-20c414 in the ledger).
// So every positive case below carries a paired CONTROL that must fail, and
// every margin is checked against a value computed by hand, not just
// "truthy".
//
// Run: node plant/test/production.selftest.mjs

import { feasible, band, autoSplit, buildOrder } from '../production.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
// Catches and returns the thrown Error's message (or null if it didn't throw)
// so a refusal can be checked for WHY, not just THAT — FACTORIO.md's "no
// model opinion anywhere in this file" extends to the wording once anything
// downstream (e.g. the LEVEL_6 proposal) pattern-matches on err.message.
const messageOf = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

console.log('\na feasible chain: source -> processor -> sink, positive margin');
{
  const chain = (rate) => ({
    nodes: [
      { kind: 'source', id: 'src', resource: 'iron', rate },
      { kind: 'processor', id: 'proc', inputs: [{ resource: 'iron', rate: 5 }], outputs: [{ resource: 'gear', rate: 5 }], capacity: 1 },
      { kind: 'sink', id: 'snk', resource: 'gear', demand: 4 },
    ],
    edges: [{ from: 'src', to: 'proc' }, { from: 'proc', to: 'snk' }],
  });

  // source rate 10 -> proc scale = min(1, 10/5) = 1 -> gear out 5 -> demand 4
  const good = feasible(chain(10));
  ok('ok is true', good.ok);
  ok('achieved matches hand calc (5)', Math.abs(good.achieved.snk - 5) < 1e-12, `${good.achieved.snk}`);
  ok('margin matches hand calc ((5-4)/4 = 0.25)', Math.abs(good.margin - 0.25) < 1e-12, `${good.margin}`);
  ok('no deficits', good.deficits.length === 0);

  console.log('  CONTROL — same chain, source rate lowered until it starves');
  // source rate 3 -> proc scale = min(1, 3/5) = 0.6 -> gear out 3 -> short of 4
  const bad = feasible(chain(3));
  ok('CONTROL: ok is false', !bad.ok);
  ok('CONTROL: deficit names the right sink and resource',
    bad.deficits.length === 1 && bad.deficits[0].sinkId === 'snk' && bad.deficits[0].resource === 'gear');
  ok('CONTROL: deficit demand/achieved are the hand-computed numbers',
    bad.deficits[0].demand === 4 && Math.abs(bad.deficits[0].achieved - 3) < 1e-12,
    JSON.stringify(bad.deficits[0]));
  ok('CONTROL: margin matches hand calc ((3-4)/4 = -0.25)', Math.abs(bad.margin - (-0.25)) < 1e-12, `${bad.margin}`);
}

console.log('\nconvergence: a two-input processor (A+B->C) fed by two separate sources');
{
  const net = (rateB) => ({
    nodes: [
      { kind: 'source', id: 'a', resource: 'a', rate: 6 },
      { kind: 'source', id: 'b', resource: 'b', rate: rateB },
      { kind: 'processor', id: 'p', inputs: [{ resource: 'a', rate: 3 }, { resource: 'b', rate: 2 }], outputs: [{ resource: 'c', rate: 1 }], capacity: 10 },
      { kind: 'sink', id: 's', resource: 'c', demand: 1 },
    ],
    edges: [{ from: 'a', to: 'p' }, { from: 'b', to: 'p' }, { from: 'p', to: 's' }],
  });

  // supply a=6,b=4 -> ratios 6/3=2, 4/2=2 -> scale=min(10,2,2)=2 -> c=2 >= demand 1
  const good = feasible(net(4));
  ok('feasible when both inputs clear their ratio', good.ok);
  ok('achieved matches hand calc (2)', Math.abs(good.achieved.s - 2) < 1e-12, `${good.achieved.s}`);
  ok('margin matches hand calc ((2-1)/1 = 1)', Math.abs(good.margin - 1) < 1e-12, `${good.margin}`);

  console.log('  CONTROL — starve the second input alone, first is untouched');
  // supply a=6,b=1 -> ratios 2, 0.5 -> scale=min(10,2,0.5)=0.5 -> c=0.5 < 1
  const bad = feasible(net(1));
  ok('CONTROL: starving one input alone makes the whole thing infeasible', !bad.ok);
  ok('CONTROL: the deficit is on the sink (the shortfall propagates downstream)',
    bad.deficits.length === 1 && bad.deficits[0].sinkId === 's');
  ok('CONTROL: achieved matches hand calc (0.5)', Math.abs(bad.achieved.s - 0.5) < 1e-12, `${bad.achieved.s}`);
}

console.log('\ncapacity actually caps scale, even with ample supply of every input');
{
  const net = {
    nodes: [
      { kind: 'source', id: 'a', resource: 'a', rate: 6 },
      { kind: 'source', id: 'b', resource: 'b', rate: 4 },
      { kind: 'processor', id: 'p', inputs: [{ resource: 'a', rate: 3 }, { resource: 'b', rate: 2 }], outputs: [{ resource: 'c', rate: 1 }], capacity: 0.3 },
      { kind: 'sink', id: 's', resource: 'c', demand: 1 },
    ],
    edges: [{ from: 'a', to: 'p' }, { from: 'b', to: 'p' }, { from: 'p', to: 's' }],
  };
  // both input ratios are 2 (6/3, 4/2) — capacity 0.3 is the binding term.
  const r = feasible(net);
  ok('capacity sets the scale, not the (much larger) input ratio',
    Math.abs(r.achieved.s - 0.3) < 1e-12, `${r.achieved.s}`);
  ok('so it is infeasible despite ample supply of both inputs', !r.ok);
  ok('margin matches hand calc ((0.3-1)/1 = -0.7)', Math.abs(r.margin - (-0.7)) < 1e-12, `${r.margin}`);
}

console.log('\nfan-out without an explicit share is refused, same as before shares existed');
{
  const fanOut = {
    nodes: [
      { kind: 'source', id: 'src', resource: 'x', rate: 1 },
      { kind: 'sink', id: 's1', resource: 'x', demand: 1 },
      { kind: 'sink', id: 's2', resource: 'x', demand: 1 },
    ],
    edges: [{ from: 'src', to: 's1' }, { from: 'src', to: 's2' }],
  };
  ok('a node splitting a resource with no shares throws (fan-out)', throws(() => feasible(fanOut)));
  ok('...and the message names the cause (fan-out)',
    (messageOf(() => feasible(fanOut)) || '').includes('fan-out'), messageOf(() => feasible(fanOut)));

  console.log('  CONTROL — the same source with only ONE of those two edges is fine');
  const noFanOut = { ...fanOut, edges: [fanOut.edges[0]] };
  ok('CONTROL: dropping the second edge makes it valid (not a broken source/sink)',
    !throws(() => feasible(noFanOut)));
}

console.log('\nfan-out WITH explicit shares: the network supplies the split, the oracle does not solve for it');
{
  // source rate 10, resource x -> s1 gets share 0.3 (achieved 3), s2 gets
  // share 0.7 (achieved 7). Hand-calc: 10*0.3=3, 10*0.7=7.
  const split = (shareA, shareB) => ({
    nodes: [
      { kind: 'source', id: 'src', resource: 'x', rate: 10 },
      { kind: 'sink', id: 's1', resource: 'x', demand: 2 },
      { kind: 'sink', id: 's2', resource: 'x', demand: 6 },
    ],
    edges: [
      { from: 'src', to: 's1', share: shareA },
      { from: 'src', to: 's2', share: shareB },
    ],
  });

  const good = feasible(split(0.3, 0.7));
  ok('explicit shares split the source output rather than throwing', good.ok, JSON.stringify(good));
  ok('s1 achieved matches hand calc (10*0.3=3)', Math.abs(good.achieved.s1 - 3) < 1e-12, `${good.achieved.s1}`);
  ok('s2 achieved matches hand calc (10*0.7=7)', Math.abs(good.achieved.s2 - 7) < 1e-12, `${good.achieved.s2}`);
  // margin = min over sinks: s1 (3-2)/2=0.5, s2 (7-6)/6=1/6 -> min is s2's 1/6
  ok('margin matches hand calc (min(0.5, 1/6) = 1/6)', Math.abs(good.margin - (1 / 6)) < 1e-12, `${good.margin}`);

  console.log('  CONTROL — shares summing above 1 over-allocate the resource and throw');
  ok('shares 0.3 + 0.8 (sum 1.1) throws', throws(() => feasible(split(0.3, 0.8))));
  ok('...and the message names the cause (over-allocate)',
    (messageOf(() => feasible(split(0.3, 0.8))) || '').includes('over-allocate'),
    messageOf(() => feasible(split(0.3, 0.8))));

  console.log('  CONTROL — a group is all-explicit or entirely rejected, never a mix');
  const mixed = {
    nodes: [
      { kind: 'source', id: 'src', resource: 'x', rate: 10 },
      { kind: 'sink', id: 's1', resource: 'x', demand: 1 },
      { kind: 'sink', id: 's2', resource: 'x', demand: 1 },
    ],
    edges: [
      { from: 'src', to: 's1', share: 0.5 },
      { from: 'src', to: 's2' }, // no share field — sibling in same group has one
    ],
  };
  ok('one explicit share + one implicit sibling throws (fan-out)', throws(() => feasible(mixed)));
  ok('...and the message names the cause (fan-out)',
    (messageOf(() => feasible(mixed)) || '').includes('fan-out'), messageOf(() => feasible(mixed)));

  console.log('  CONTROL — a single edge with a partial share leaves the remainder simply unrouted');
  // source rate 10, one edge share 0.6 -> sink achieves exactly 6, no error
  // even though 0.4 of the source's output is never delivered anywhere.
  const partial = {
    nodes: [
      { kind: 'source', id: 'src', resource: 'x', rate: 10 },
      { kind: 'sink', id: 's1', resource: 'x', demand: 5 },
    ],
    edges: [{ from: 'src', to: 's1', share: 0.6 }],
  };
  const partialResult = feasible(partial);
  ok('a single partial share is legal, not an error', !throws(() => feasible(partial)));
  ok('sink receives exactly rate*share (10*0.6=6)', Math.abs(partialResult.achieved.s1 - 6) < 1e-12, `${partialResult.achieved.s1}`);
  ok('margin matches hand calc ((6-5)/5=0.2)', Math.abs(partialResult.margin - 0.2) < 1e-12, `${partialResult.margin}`);
}

console.log('\na processor with two distinct outputs fans each out independently — grouping is by resource, not by node');
{
  // 'gear' fans out to two sinks (shares 0.4, 0.6); 'scrap' goes to a third
  // sink over a single edge with no share field. If grouping were per-node
  // instead of per-(node,resource), the 'scrap' edge would land in the same
  // group as the two 'gear' edges and either be forced to carry a share it
  // was never given, or corrupt the 'gear' group's sum — this is the
  // behaviour most likely to regress silently under that wrong grouping.
  const net = {
    nodes: [
      { kind: 'source', id: 'ore', resource: 'iron', rate: 100 },
      {
        kind: 'processor', id: 'mill',
        inputs: [{ resource: 'iron', rate: 1 }],
        outputs: [{ resource: 'gear', rate: 1 }, { resource: 'scrap', rate: 1 }],
        capacity: 10,
      },
      { kind: 'sink', id: 'gearSink1', resource: 'gear', demand: 1 },
      { kind: 'sink', id: 'gearSink2', resource: 'gear', demand: 1 },
      { kind: 'sink', id: 'scrapSink', resource: 'scrap', demand: 1 },
    ],
    edges: [
      { from: 'ore', to: 'mill' },
      { from: 'mill', to: 'gearSink1', share: 0.4 },
      { from: 'mill', to: 'gearSink2', share: 0.6 },
      { from: 'mill', to: 'scrapSink' }, // no share — different resource, own group
    ],
  };
  // scale = min(10, 100/1) = 10 -> gear out 10, scrap out 10
  const r = feasible(net);
  ok('the scrap edge (own group, no share needed) is unaffected by the gear group', r.ok, JSON.stringify(r));
  ok('gearSink1 gets 10*0.4=4', Math.abs(r.achieved.gearSink1 - 4) < 1e-12, `${r.achieved.gearSink1}`);
  ok('gearSink2 gets 10*0.6=6', Math.abs(r.achieved.gearSink2 - 6) < 1e-12, `${r.achieved.gearSink2}`);
  ok('scrapSink gets the full 10 (defaulted share=1, own group)', Math.abs(r.achieved.scrapSink - 10) < 1e-12, `${r.achieved.scrapSink}`);
}

console.log('\ncycles are refused outright, not partially solved');
{
  const cycle = {
    nodes: [
      { kind: 'processor', id: 'a', inputs: [{ resource: 'x', rate: 1 }], outputs: [{ resource: 'y', rate: 1 }], capacity: 1 },
      { kind: 'processor', id: 'b', inputs: [{ resource: 'y', rate: 1 }], outputs: [{ resource: 'x', rate: 1 }], capacity: 1 },
    ],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
  };
  ok('a two-node cycle throws', throws(() => feasible(cycle)));
  ok('...and the message names the cause (cycle)',
    (messageOf(() => feasible(cycle)) || '').includes('cycle'), messageOf(() => feasible(cycle)));

  console.log('  CONTROL — the same two processors with the cycle-closing edge removed');
  const noCycle = { ...cycle, edges: [cycle.edges[0]] };
  ok('CONTROL: dropping the back-edge makes it a valid (if unfed) chain',
    !throws(() => feasible(noCycle)));
}

console.log('\nresource matching on an edge — no shared resource, and more than one, both refuse');
{
  const absent = {
    nodes: [
      { kind: 'source', id: 'src', resource: 'iron', rate: 1 },
      { kind: 'sink', id: 'snk', resource: 'copper', demand: 1 },
    ],
    edges: [{ from: 'src', to: 'snk' }],
  };
  ok('an edge with no shared resource throws', throws(() => feasible(absent)));
  ok('...and the message names the cause (no shared resource)',
    (messageOf(() => feasible(absent)) || '').includes('no shared resource'), messageOf(() => feasible(absent)));

  const ambiguous = {
    nodes: [
      { kind: 'processor', id: 'p', inputs: [{ resource: 'x', rate: 1 }], outputs: [{ resource: 'a', rate: 1 }, { resource: 'b', rate: 1 }], capacity: 1 },
      { kind: 'processor', id: 'q', inputs: [{ resource: 'a', rate: 1 }, { resource: 'b', rate: 1 }], outputs: [{ resource: 'z', rate: 1 }], capacity: 1 },
    ],
    edges: [{ from: 'p', to: 'q' }],
  };
  ok('an edge matching more than one shared resource throws', throws(() => feasible(ambiguous)));
  ok('...and the message names the cause (ambiguous)',
    (messageOf(() => feasible(ambiguous)) || '').includes('ambiguous'), messageOf(() => feasible(ambiguous)));
}

console.log('\nother refusals — one cause each');
{
  const unknownKind = { nodes: [{ kind: 'sprocket', id: 'x' }], edges: [] };
  ok('an unknown node kind throws', throws(() => feasible(unknownKind)));
  ok('...and the message names the cause (unknown node kind)',
    (messageOf(() => feasible(unknownKind)) || '').includes('unknown node kind'), messageOf(() => feasible(unknownKind)));

  const dupId = {
    nodes: [
      { kind: 'source', id: 'x', resource: 'a', rate: 1 },
      { kind: 'source', id: 'x', resource: 'b', rate: 1 },
    ], edges: [],
  };
  ok('a duplicate id throws', throws(() => feasible(dupId)));
  ok('...and the message names the cause (duplicate id)',
    (messageOf(() => feasible(dupId)) || '').includes('duplicate id'), messageOf(() => feasible(dupId)));

  const unknownTo = {
    nodes: [{ kind: 'source', id: 'x', resource: 'a', rate: 1 }],
    edges: [{ from: 'x', to: 'ghost' }],
  };
  ok('an edge naming an unknown "to" node throws', throws(() => feasible(unknownTo)));
  ok('...and the message names the cause (unknown node)',
    (messageOf(() => feasible(unknownTo)) || '').includes('unknown node'), messageOf(() => feasible(unknownTo)));

  const unknownFrom = {
    nodes: [{ kind: 'sink', id: 'x', resource: 'a', demand: 1 }],
    edges: [{ from: 'ghost', to: 'x' }],
  };
  ok('an edge naming an unknown "from" node throws', throws(() => feasible(unknownFrom)));
  ok('...and the message names the cause (unknown node)',
    (messageOf(() => feasible(unknownFrom)) || '').includes('unknown node'), messageOf(() => feasible(unknownFrom)));

  const badRate = { nodes: [{ kind: 'source', id: 'x', resource: 'a', rate: 0 }], edges: [] };
  ok('a non-positive source rate throws', throws(() => feasible(badRate)));
  ok('...and the message names the cause (must be positive)',
    (messageOf(() => feasible(badRate)) || '').includes('must be positive'), messageOf(() => feasible(badRate)));

  const badDemand = { nodes: [{ kind: 'sink', id: 'x', resource: 'a', demand: -1 }], edges: [] };
  ok('a non-positive sink demand throws', throws(() => feasible(badDemand)));
  ok('...and the message names the cause (must be positive)',
    (messageOf(() => feasible(badDemand)) || '').includes('must be positive'), messageOf(() => feasible(badDemand)));

  const badCapacity = {
    nodes: [{ kind: 'processor', id: 'x', inputs: [{ resource: 'a', rate: 1 }], outputs: [{ resource: 'b', rate: 1 }], capacity: 0 }],
    edges: [],
  };
  ok('a non-positive processor capacity throws', throws(() => feasible(badCapacity)));
  ok('...and the message names the cause (must be positive)',
    (messageOf(() => feasible(badCapacity)) || '').includes('must be positive'), messageOf(() => feasible(badCapacity)));

  const zeroInputs = {
    nodes: [{ kind: 'processor', id: 'x', inputs: [], outputs: [{ resource: 'b', rate: 1 }], capacity: 1 }],
    edges: [],
  };
  ok('a processor with zero inputs throws', throws(() => feasible(zeroInputs)));
  ok('...and the message names the cause (zero inputs)',
    (messageOf(() => feasible(zeroInputs)) || '').includes('zero inputs'), messageOf(() => feasible(zeroInputs)));

  const zeroOutputs = {
    nodes: [{ kind: 'processor', id: 'x', inputs: [{ resource: 'a', rate: 1 }], outputs: [], capacity: 1 }],
    edges: [],
  };
  ok('a processor with zero outputs throws', throws(() => feasible(zeroOutputs)));
  ok('...and the message names the cause (zero outputs)',
    (messageOf(() => feasible(zeroOutputs)) || '').includes('zero outputs'), messageOf(() => feasible(zeroOutputs)));
}

console.log('\nband(margin) — the difficulty dial, reusing the margins already hand-checked above');
{
  // margin 0.25 (the basic feasible chain) -> 'tight' (0.15 <= 0.25 < 0.5)
  const tightMargin = feasible({
    nodes: [
      { kind: 'source', id: 'src', resource: 'iron', rate: 10 },
      { kind: 'processor', id: 'proc', inputs: [{ resource: 'iron', rate: 5 }], outputs: [{ resource: 'gear', rate: 5 }], capacity: 1 },
      { kind: 'sink', id: 'snk', resource: 'gear', demand: 4 },
    ],
    edges: [{ from: 'src', to: 'proc' }, { from: 'proc', to: 'snk' }],
  }).margin;
  ok('sanity: reused fixture still gives margin 0.25', Math.abs(tightMargin - 0.25) < 1e-12, `${tightMargin}`);
  // 0.25 is COMFORTABLE, not tight — band()'s documented boundary is 0.15, and
  // this assertion originally claimed 'tight' because it reused a convenient
  // fixture without checking the fixture's margin fell in the band it was
  // asserting. The implementation was right and its own test contradicted it.
  // Both sides are now pinned, so the boundary cannot drift in either direction.
  ok('band(0.25) is comfortable — 0.25 is above the 0.15 tight boundary',
    band(tightMargin) === 'comfortable', band(tightMargin));
  ok('band just BELOW the boundary is tight', band(0.149) === 'tight', band(0.149));
  ok('band just ABOVE the boundary is comfortable', band(0.15) === 'comfortable', band(0.15));
  ok('band at the slack boundary', band(0.5) === 'slack', band(0.5));
  ok("level 1's 2% margin is tight — which is the point of it", band(0.02) === 'tight', band(0.02));

  // margin -0.25 (the same chain's CONTROL, starved source) -> 'infeasible'
  const infeasibleMargin = feasible({
    nodes: [
      { kind: 'source', id: 'src', resource: 'iron', rate: 3 },
      { kind: 'processor', id: 'proc', inputs: [{ resource: 'iron', rate: 5 }], outputs: [{ resource: 'gear', rate: 5 }], capacity: 1 },
      { kind: 'sink', id: 'snk', resource: 'gear', demand: 4 },
    ],
    edges: [{ from: 'src', to: 'proc' }, { from: 'proc', to: 'snk' }],
  }).margin;
  ok('band(-0.25) is infeasible', band(infeasibleMargin) === 'infeasible', band(infeasibleMargin));

  // margin 1 (the convergence case) -> 'slack'
  const slackMargin = feasible({
    nodes: [
      { kind: 'source', id: 'a', resource: 'a', rate: 6 },
      { kind: 'source', id: 'b', resource: 'b', rate: 4 },
      { kind: 'processor', id: 'p', inputs: [{ resource: 'a', rate: 3 }, { resource: 'b', rate: 2 }], outputs: [{ resource: 'c', rate: 1 }], capacity: 10 },
      { kind: 'sink', id: 's', resource: 'c', demand: 1 },
    ],
    edges: [{ from: 'a', to: 'p' }, { from: 'b', to: 'p' }, { from: 'p', to: 's' }],
  }).margin;
  ok('band(1) is slack', band(slackMargin) === 'slack', band(slackMargin));

  // margin -0.7 (the capacity-cap case) -> 'infeasible'
  const capacityMargin = feasible({
    nodes: [
      { kind: 'source', id: 'a', resource: 'a', rate: 6 },
      { kind: 'source', id: 'b', resource: 'b', rate: 4 },
      { kind: 'processor', id: 'p', inputs: [{ resource: 'a', rate: 3 }, { resource: 'b', rate: 2 }], outputs: [{ resource: 'c', rate: 1 }], capacity: 0.3 },
      { kind: 'sink', id: 's', resource: 'c', demand: 1 },
    ],
    edges: [{ from: 'a', to: 'p' }, { from: 'b', to: 'p' }, { from: 'p', to: 's' }],
  }).margin;
  ok('band(-0.7) is infeasible', band(capacityMargin) === 'infeasible', band(capacityMargin));

  console.log('  CONTROL — boundary pair, literal numbers, since off-by-one is the likeliest bug');
  ok('band(0.15) is comfortable (the boundary belongs to comfortable, not tight)', band(0.15) === 'comfortable', band(0.15));
  ok('band(0.1499999) is tight (just under the boundary)', band(0.1499999) === 'tight', band(0.1499999));

  console.log('  CONTROL — custom thresholds are actually read, not hardcoded');
  ok("band(0.2, { tight: 0.3 }) is tight, where the default thresholds would say 'comfortable'",
    band(0.2, { tight: 0.3 }) === 'tight', band(0.2, { tight: 0.3 }));
}

console.log('\nautoSplit() — closed-form split for the simplest fan-out case');
{
  const net = (rate) => ({
    nodes: [
      { kind: 'source', id: 'src', resource: 'x', rate },
      { kind: 'sink', id: 's1', resource: 'x', demand: 30 },
      { kind: 'sink', id: 's2', resource: 'x', demand: 70 },
    ],
    edges: [
      { from: 'src', to: 's1' },
      { from: 'src', to: 's2' },
    ],
  });

  const split = autoSplit(net(100));
  ok('autoSplit fills share1 = 30/100 = 0.3', Math.abs(split.edges[0].share - 0.3) < 1e-12, `${split.edges[0].share}`);
  ok('autoSplit fills share2 = 70/100 = 0.7', Math.abs(split.edges[1].share - 0.7) < 1e-12, `${split.edges[1].share}`);

  const r = feasible(split);
  ok('feasible on the auto-split network is ok', r.ok, JSON.stringify(r));
  ok('achieved.s1 matches hand calc (30)', Math.abs(r.achieved.s1 - 30) < 1e-12, `${r.achieved.s1}`);
  ok('achieved.s2 matches hand calc (70)', Math.abs(r.achieved.s2 - 70) < 1e-12, `${r.achieved.s2}`);
  const margin1 = (r.achieved.s1 - 30) / 30;
  const margin2 = (r.achieved.s2 - 70) / 70;
  ok('margin_s1 equals 0 — the max-min-optimal signature (equalized ratios)', Math.abs(margin1) < 1e-12, `${margin1}`);
  ok('margin_s2 equals 0 — the max-min-optimal signature (equalized ratios)', Math.abs(margin2) < 1e-12, `${margin2}`);
  ok('overall margin (min of the two) is also 0', Math.abs(r.margin) < 1e-12, `${r.margin}`);

  console.log('  CONTROL — dropped below what an optimal split can satisfy: shares stay proportional, both starve equally');
  const shortSplit = autoSplit(net(60));
  ok('shares are unchanged by feasibility (still 0.3/0.7 — proportional to demand, not to what is available)',
    Math.abs(shortSplit.edges[0].share - 0.3) < 1e-12 && Math.abs(shortSplit.edges[1].share - 0.7) < 1e-12);
  const shortR = feasible(shortSplit);
  ok('CONTROL: achieved.s1 matches hand calc (60*0.3=18)', Math.abs(shortR.achieved.s1 - 18) < 1e-12, `${shortR.achieved.s1}`);
  ok('CONTROL: achieved.s2 matches hand calc (60*0.7=42)', Math.abs(shortR.achieved.s2 - 42) < 1e-12, `${shortR.achieved.s2}`);
  const shortMargin1 = (shortR.achieved.s1 - 30) / 30;
  const shortMargin2 = (shortR.achieved.s2 - 70) / 70;
  ok('CONTROL: margin_s1 equals -0.4', Math.abs(shortMargin1 - (-0.4)) < 1e-12, `${shortMargin1}`);
  ok('CONTROL: margin_s2 equals -0.4', Math.abs(shortMargin2 - (-0.4)) < 1e-12, `${shortMargin2}`);
  ok('CONTROL: both sinks share the shortfall equally — nobody is starved to protect the other',
    Math.abs(shortMargin1 - shortMargin2) < 1e-12);

  console.log('  CONTROL — a group with an explicit share already on one edge is left untouched');
  {
    const explicitNet = {
      nodes: [
        { kind: 'source', id: 'src', resource: 'x', rate: 10 },
        { kind: 'sink', id: 's1', resource: 'x', demand: 3 },
        { kind: 'sink', id: 's2', resource: 'x', demand: 7 },
      ],
      edges: [
        { from: 'src', to: 's1', share: 0.5 },
        { from: 'src', to: 's2' },
      ],
    };
    const result = autoSplit(explicitNet);
    ok('CONTROL: edges are byte-identical to the input (partially-explicit group untouched)',
      JSON.stringify(result.edges) === JSON.stringify(explicitNet.edges), JSON.stringify(result.edges));
  }

  console.log('  CONTROL — a fan-out group whose destinations are not all sinks is left untouched');
  {
    // Still refused after the relay extension, and for a sharper reason than
    // "p is not a sink": p relays to NOTHING (whole-network out-degree 0), so
    // there is no sink behind it whose demand the split could be aimed at.
    // The relay extension's own CONTROLs are in their own section below.
    const processorNet = {
      nodes: [
        { kind: 'source', id: 'src', resource: 'x', rate: 10 },
        { kind: 'sink', id: 's1', resource: 'x', demand: 3 },
        { kind: 'processor', id: 'p', inputs: [{ resource: 'x', rate: 1 }], outputs: [{ resource: 'y', rate: 1 }], capacity: 1 },
      ],
      edges: [
        { from: 'src', to: 's1' },
        { from: 'src', to: 'p' },
      ],
    };
    const result = autoSplit(processorNet);
    ok('CONTROL: edges are byte-identical to the input (a destination is a processor, not a sink)',
      JSON.stringify(result.edges) === JSON.stringify(processorNet.edges), JSON.stringify(result.edges));
    ok('CONTROL: feasible() on the untouched result still throws with "fan-out" in the message',
      (messageOf(() => feasible(result)) || '').includes('fan-out'), messageOf(() => feasible(result)));
  }

  console.log('  CONTROL — a sink fed from more than one edge in the whole network is left untouched');
  {
    const sharedSinkNet = {
      nodes: [
        { kind: 'source', id: 'src', resource: 'x', rate: 10 },
        { kind: 'source', id: 'other', resource: 'x', rate: 5 },
        { kind: 'sink', id: 's1', resource: 'x', demand: 3 },
        { kind: 'sink', id: 's2', resource: 'x', demand: 7 },
      ],
      edges: [
        { from: 'src', to: 's1' },
        { from: 'src', to: 's2' },
        { from: 'other', to: 's1' }, // s1's second supplier — its demand isn't purely this group's to satisfy
      ],
    };
    const result = autoSplit(sharedSinkNet);
    ok('CONTROL: edges are byte-identical to the input (destination sink has another supplier)',
      JSON.stringify(result.edges) === JSON.stringify(sharedSinkNet.edges), JSON.stringify(result.edges));
  }

  console.log('  extension — the OTHER supplier is a plain single-edge source with rate < demand: split proportional to effectiveDemand');
  {
    // s1's outside supplier 'other' (rate 10, out-degree 1) contributes less
    // than s1's demand (30), so s1 still has 20 of positive effective demand
    // for the group to fill. s2 has no outside supplier at all — unchanged
    // from the plain case. Source rate (90) is chosen to exactly equal the
    // sum of effective demands (20 + 70), so this reproduces the same
    // zero-margin, equalized-ratio optimal signature as the plain-case test
    // above, with effectiveDemand standing in for demand.
    const extendedNet = {
      nodes: [
        { kind: 'source', id: 'src', resource: 'x', rate: 90 },
        { kind: 'source', id: 'other', resource: 'x', rate: 10 },
        { kind: 'sink', id: 's1', resource: 'x', demand: 30 },
        { kind: 'sink', id: 's2', resource: 'x', demand: 70 },
      ],
      edges: [
        { from: 'src', to: 's1' },
        { from: 'src', to: 's2' },
        { from: 'other', to: 's1' },
      ],
    };
    const result = autoSplit(extendedNet);
    ok('share_s1 = effectiveDemand(20) / total(90) = 2/9',
      Math.abs(result.edges[0].share - 20 / 90) < 1e-12, `${result.edges[0].share}`);
    ok('share_s2 = effectiveDemand(70) / total(90) = 7/9',
      Math.abs(result.edges[1].share - 70 / 90) < 1e-12, `${result.edges[1].share}`);
    ok("the 'other' -> s1 edge is untouched (it was never part of the group being split)",
      result.edges[2].share === undefined, `${result.edges[2].share}`);

    const r = feasible(result);
    ok('feasible on the extended-split network is ok', r.ok, JSON.stringify(r));
    ok('achieved.s1 = 90*(20/90) + 10 = 30, exactly meeting demand',
      Math.abs(r.achieved.s1 - 30) < 1e-9, `${r.achieved.s1}`);
    ok('achieved.s2 = 90*(70/90) = 70, exactly meeting demand',
      Math.abs(r.achieved.s2 - 70) < 1e-9, `${r.achieved.s2}`);
    ok('margin_s1 is 0 — the max-min-optimal signature carries over', Math.abs(r.margin) < 1e-9, `${r.margin}`);
  }

  console.log("  extension CONTROL — the lone outside source's rate alone already meets or exceeds demand: that sink is excluded, the rest split normally");
  {
    // sinkA's outside supplier 'other' (rate 50) alone already covers
    // sinkA's demand (10), so sinkA fails the extended condition and is
    // excluded from the split entirely — its edge stays untouched. sinkB
    // and sinkC have no outside supplier and split between themselves as if
    // sinkA were never in the group (their math is unaffected by it).
    const excludedNet = {
      nodes: [
        { kind: 'source', id: 'src', resource: 'x', rate: 100 },
        { kind: 'source', id: 'other', resource: 'x', rate: 50 },
        { kind: 'sink', id: 'sinkA', resource: 'x', demand: 10 },
        { kind: 'sink', id: 'sinkB', resource: 'x', demand: 30 },
        { kind: 'sink', id: 'sinkC', resource: 'x', demand: 70 },
      ],
      edges: [
        { from: 'src', to: 'sinkA' },
        { from: 'src', to: 'sinkB' },
        { from: 'src', to: 'sinkC' },
        { from: 'other', to: 'sinkA' },
      ],
    };
    const result = autoSplit(excludedNet);
    ok('sinkA edge is untouched — excluded (its lone outside source already meets its demand)',
      result.edges[0].share === undefined, `${result.edges[0].share}`);
    ok("share_sinkB = 30/100 = 0.3, unaffected by sinkA's exclusion",
      Math.abs(result.edges[1].share - 0.3) < 1e-12, `${result.edges[1].share}`);
    ok("share_sinkC = 70/100 = 0.7, unaffected by sinkA's exclusion",
      Math.abs(result.edges[2].share - 0.7) < 1e-12, `${result.edges[2].share}`);
    ok("the 'other' -> sinkA edge is untouched (own group of one, never a fan-out)",
      result.edges[3].share === undefined, `${result.edges[3].share}`);

    ok("CONTROL: feasible() on the result still throws — sinkA's edge has no share and the group as a whole is only partially split",
      (messageOf(() => feasible(result)) || '').includes('fan-out'), messageOf(() => feasible(result)));
  }

  console.log('  CONTROL — a single-edge (non-fan-out) group is a complete no-op');
  {
    const chainNet = {
      nodes: [
        { kind: 'source', id: 'src', resource: 'iron', rate: 10 },
        { kind: 'processor', id: 'proc', inputs: [{ resource: 'iron', rate: 5 }], outputs: [{ resource: 'gear', rate: 5 }], capacity: 1 },
        { kind: 'sink', id: 'snk', resource: 'gear', demand: 4 },
      ],
      edges: [{ from: 'src', to: 'proc' }, { from: 'proc', to: 'snk' }],
    };
    const result = autoSplit(chainNet);
    ok('CONTROL: edges are byte-identical to the input (no fan-out anywhere)',
      JSON.stringify(result.edges) === JSON.stringify(chainNet.edges), JSON.stringify(result.edges));

    const direct = feasible(chainNet);
    const viaAutoSplit = feasible(autoSplit(chainNet));
    ok('CONTROL: feasible(autoSplit(net)) matches feasible(net) exactly for a non-fan-out network',
      JSON.stringify(direct) === JSON.stringify(viaAutoSplit));
  }

  console.log('  no-mutation check — autoSplit does not touch its input');
  {
    const mutNet = net(100);
    const before = JSON.stringify(mutNet);
    autoSplit(mutNet);
    ok('input network is unchanged after calling autoSplit', JSON.stringify(mutNet) === before);
  }
}

console.log('\nautoSplit() relay extension — a SOURCE fanning out into single-in/single-out processors that each feed a private sink');
{
  // ore (rate 100) fans out to two smelters with DIFFERENT recipe ratios,
  // each relaying its whole output to its own depot:
  //
  //   ore --+--> smelterA (1 ore -> 0.6 ingot, cap 100) --> depotA (demand 10)
  //         +--> smelterB (1 ore -> 1.0 ingot, cap 100) --> depotB (demand 30)
  //
  // The whole point of the extension is that the SPLIT IS OVER ORE, not over
  // ingots, so a depot's demand has to be pulled back through its smelter's
  // recipe ratio before the shares mean anything:
  //   effectiveDemand_A = 10 / 0.6 = 16.666… ore
  //   effectiveDemand_B = 30 / 1.0 = 30      ore
  // A naive implementation that split proportionally to the DEPOTS' demands
  // (10 : 30 = 0.25 : 0.75) starves A and over-feeds B; that specific wrong
  // answer is asserted against explicitly below, because it is the single
  // likeliest way to get this wrong and it looks completely reasonable.
  const relayNet = (capA = 100) => ({
    nodes: [
      { kind: 'source', id: 'ore', resource: 'ore', rate: 100 },
      { kind: 'processor', id: 'smelterA', inputs: [{ resource: 'ore', rate: 1 }], outputs: [{ resource: 'ingot', rate: 0.6 }], capacity: capA },
      { kind: 'processor', id: 'smelterB', inputs: [{ resource: 'ore', rate: 1 }], outputs: [{ resource: 'ingot', rate: 1.0 }], capacity: 100 },
      { kind: 'sink', id: 'depotA', resource: 'ingot', demand: 10 },
      { kind: 'sink', id: 'depotB', resource: 'ingot', demand: 30 },
    ],
    edges: [
      { from: 'ore', to: 'smelterA' },
      { from: 'ore', to: 'smelterB' },
      { from: 'smelterA', to: 'depotA' },
      { from: 'smelterB', to: 'depotB' },
    ],
  });

  const effA = 10 / 0.6;   // 16.666…
  const effB = 30 / 1.0;   // 30
  const total = effA + effB;

  const split = autoSplit(relayNet());
  ok('share to smelterA = (10/0.6) / (10/0.6 + 30)',
    Math.abs(split.edges[0].share - effA / total) < 1e-12, `${split.edges[0].share}`);
  ok('share to smelterB = 30 / (10/0.6 + 30)',
    Math.abs(split.edges[1].share - effB / total) < 1e-12, `${split.edges[1].share}`);
  ok('the two shares sum to 1 (the whole source output is routed)',
    Math.abs(split.edges[0].share + split.edges[1].share - 1) < 1e-12,
    `${split.edges[0].share + split.edges[1].share}`);
  ok('the shares are NOT proportional to raw sink demand (0.25/0.75) — the recipe ratio is read',
    Math.abs(split.edges[0].share - 0.25) > 0.05, `${split.edges[0].share}`);
  ok("the relays' own output edges are left alone (each is a group of one, share defaults to 1)",
    split.edges[2].share === undefined && split.edges[3].share === undefined,
    JSON.stringify([split.edges[2], split.edges[3]]));

  const r = feasible(split);
  ok('feasible on the relay-split network is ok', r.ok, JSON.stringify(r));
  // supplyA = 100*shareA = 100*(10/0.6)/total; smelterA is supply-bound (headroom),
  // so scale = supplyA and out = supplyA*0.6 = 100*10/total = 21.428571…
  ok('achieved.depotA = 100*shareA*0.6 = 1000/total',
    Math.abs(r.achieved.depotA - 1000 / total) < 1e-9, `${r.achieved.depotA}`);
  ok('achieved.depotB = 100*shareB*1.0 = 3000/total',
    Math.abs(r.achieved.depotB - 3000 / total) < 1e-9, `${r.achieved.depotB}`);
  const marginA = (r.achieved.depotA - 10) / 10;
  const marginB = (r.achieved.depotB - 30) / 30;
  ok('marginA equals marginB — the max-min-optimal signature, across DIFFERENT recipe ratios',
    Math.abs(marginA - marginB) < 1e-9, `${marginA} vs ${marginB}`);
  ok('and both equal the closed form R/total - 1 = 100/(10/0.6+30) - 1',
    Math.abs(marginA - (100 / total - 1)) < 1e-9, `${marginA} vs ${100 / total - 1}`);
  ok('overall margin is that same number', Math.abs(r.margin - (100 / total - 1)) < 1e-9, `${r.margin}`);

  console.log('  CONTROL (1) — headroom violated: a relay whose capacity*inputRate < R voids the WHOLE group');
  {
    // smelterA capacity 50 -> 50*1 = 50 < R = 100. At share = 1 it would be
    // capacity-bound, so what reaches depotA stops being linear in share and
    // the closed form no longer holds. Refuse rather than approximate.
    const starved = relayNet(50);
    const result = autoSplit(starved);
    ok('CONTROL: edges are byte-identical to the input (headroom precondition fails)',
      JSON.stringify(result.edges) === JSON.stringify(starved.edges), JSON.stringify(result.edges));
    ok('CONTROL: feasible() on the untouched result still throws with "fan-out" in the message',
      (messageOf(() => feasible(result)) || '').includes('fan-out'), messageOf(() => feasible(result)));
  }

  console.log('  CONTROL (1b) — the headroom boundary is >=, pinned from both sides');
  {
    // capacity exactly 100 qualifies (that is the main fixture above, whose
    // shares were filled in). 99.9 does not, by a tenth.
    const justUnder = relayNet(99.9);
    ok('CONTROL: capacity*inputRate = 99.9 < R = 100 leaves the group untouched',
      JSON.stringify(autoSplit(justUnder).edges) === JSON.stringify(justUnder.edges),
      JSON.stringify(autoSplit(justUnder).edges));
    ok('capacity*inputRate = 100 >= R = 100 qualifies (the boundary belongs to qualifying)',
      autoSplit(relayNet(100)).edges[0].share !== undefined);
  }

  console.log('  CONTROL (2) — a relay with two inputs voids the whole group (convergence is not this closed form)');
  {
    const twoInput = relayNet();
    twoInput.nodes[1] = {
      kind: 'processor', id: 'smelterA',
      inputs: [{ resource: 'ore', rate: 1 }, { resource: 'flux', rate: 1 }],
      outputs: [{ resource: 'ingot', rate: 0.6 }], capacity: 100,
    };
    const result = autoSplit(twoInput);
    ok('CONTROL: edges are byte-identical to the input (relay has 2 inputs)',
      JSON.stringify(result.edges) === JSON.stringify(twoInput.edges), JSON.stringify(result.edges));
    ok('CONTROL: feasible() on the untouched result still throws with "fan-out" in the message',
      (messageOf(() => feasible(result)) || '').includes('fan-out'), messageOf(() => feasible(result)));
  }

  console.log("  CONTROL (3) — a relay whose OWN output fans out further voids the group it is a destination of");
  {
    const doubleDownstream = {
      nodes: [
        { kind: 'source', id: 'ore', resource: 'ore', rate: 100 },
        { kind: 'processor', id: 'smelterA', inputs: [{ resource: 'ore', rate: 1 }], outputs: [{ resource: 'ingot', rate: 1 }], capacity: 100 },
        { kind: 'processor', id: 'smelterB', inputs: [{ resource: 'ore', rate: 1 }], outputs: [{ resource: 'ingot', rate: 1 }], capacity: 100 },
        { kind: 'sink', id: 'depotA1', resource: 'ingot', demand: 10 },
        { kind: 'sink', id: 'depotA2', resource: 'ingot', demand: 30 },
        { kind: 'sink', id: 'depotB', resource: 'ingot', demand: 30 },
      ],
      edges: [
        { from: 'ore', to: 'smelterA' },     // 0
        { from: 'ore', to: 'smelterB' },     // 1
        { from: 'smelterA', to: 'depotA1' }, // 2
        { from: 'smelterA', to: 'depotA2' }, // 3
        { from: 'smelterB', to: 'depotB' },  // 4
      ],
    };
    const result = autoSplit(doubleDownstream);
    ok('CONTROL: the ore group is untouched (smelterA relays to two sinks, not one)',
      result.edges[0].share === undefined && result.edges[1].share === undefined,
      JSON.stringify([result.edges[0], result.edges[1]]));
    // Byte-identity is NOT the right assertion here, and that is worth being
    // explicit about: smelterA's own downstream group IS an ordinary
    // all-sinks fan-out from a processor, which autoSplit has split since
    // before this extension existed. Pinning that keeps the two behaviours
    // from being confused for each other.
    ok('CONTROL: the pre-existing all-sinks behaviour still splits smelterA\'s OWN group 10:30 = 0.25/0.75',
      Math.abs(result.edges[2].share - 0.25) < 1e-12 && Math.abs(result.edges[3].share - 0.75) < 1e-12,
      JSON.stringify([result.edges[2].share, result.edges[3].share]));
    ok('CONTROL: feasible() still throws with "fan-out" — the ore group was left unshared',
      (messageOf(() => feasible(result)) || '').includes('fan-out'), messageOf(() => feasible(result)));
  }

  console.log('  CONTROL (4) — the sink behind a relay has another supplier: whole group untouched');
  {
    const sharedDepot = relayNet();
    sharedDepot.nodes.push({ kind: 'source', id: 'extraIngot', resource: 'ingot', rate: 5 });
    sharedDepot.edges.push({ from: 'extraIngot', to: 'depotA' });
    const result = autoSplit(sharedDepot);
    ok('CONTROL: edges are byte-identical to the input (depotA is fed from outside the relay chain)',
      JSON.stringify(result.edges) === JSON.stringify(sharedDepot.edges), JSON.stringify(result.edges));
    ok('CONTROL: feasible() on the untouched result still throws with "fan-out" in the message',
      (messageOf(() => feasible(result)) || '').includes('fan-out'), messageOf(() => feasible(result)));
  }

  console.log('  CONTROL (4b) — the RELAY ITSELF has another supplier: whole group untouched');
  {
    // Not in the ticket's list, and it has to be here: if smelterA is fed by
    // anything but this group, its supply is no longer R*share, so the
    // headroom argument and the closed form both stop being true.
    const sharedRelay = relayNet();
    sharedRelay.nodes.push({ kind: 'source', id: 'extraOre', resource: 'ore', rate: 5 });
    sharedRelay.edges.push({ from: 'extraOre', to: 'smelterA' });
    const result = autoSplit(sharedRelay);
    ok('CONTROL: edges are byte-identical to the input (smelterA is fed from outside the group)',
      JSON.stringify(result.edges) === JSON.stringify(sharedRelay.edges), JSON.stringify(result.edges));
  }

  console.log('  CONTROL (4c) — a relay that already splits its own output explicitly: whole group untouched');
  {
    const explicitRelay = relayNet();
    explicitRelay.edges[2] = { from: 'smelterA', to: 'depotA', share: 0.5 };
    const result = autoSplit(explicitRelay);
    ok('CONTROL: edges are byte-identical to the input (relay output carries an explicit share)',
      JSON.stringify(result.edges) === JSON.stringify(explicitRelay.edges), JSON.stringify(result.edges));
  }

  console.log("  CONTROL (5) — `from` is a PROCESSOR, so R is not a constant: whole group untouched");
  {
    // mill fans 'slab' out to one direct sink and one otherwise-perfectly-
    // qualifying relay. Every relay condition holds; the only thing wrong is
    // that mill's own output rate depends on mill's own supply, so the
    // headroom precondition has no constant R to be stated against.
    const processorSource = {
      nodes: [
        { kind: 'source', id: 'ore', resource: 'ore', rate: 100 },
        { kind: 'processor', id: 'mill', inputs: [{ resource: 'ore', rate: 1 }], outputs: [{ resource: 'slab', rate: 1 }], capacity: 100 },
        { kind: 'sink', id: 'depotSlab', resource: 'slab', demand: 10 },
        { kind: 'processor', id: 'refiner', inputs: [{ resource: 'slab', rate: 1 }], outputs: [{ resource: 'bar', rate: 1 }], capacity: 100 },
        { kind: 'sink', id: 'depotBar', resource: 'bar', demand: 20 },
      ],
      edges: [
        { from: 'ore', to: 'mill' },
        { from: 'mill', to: 'depotSlab' },
        { from: 'mill', to: 'refiner' },
        { from: 'refiner', to: 'depotBar' },
      ],
    };
    const result = autoSplit(processorSource);
    ok('CONTROL: edges are byte-identical to the input (`from` is a processor, not a source)',
      JSON.stringify(result.edges) === JSON.stringify(processorSource.edges), JSON.stringify(result.edges));
    ok('CONTROL: feasible() on the untouched result still throws with "fan-out" in the message',
      (messageOf(() => feasible(result)) || '').includes('fan-out'), messageOf(() => feasible(result)));
  }

  console.log('  (6) — a MIXED group: one direct sink and one relay, split by the same unified formula');
  {
    //   ore (100) --+--> depotOre  (sink, demand 20)            eff = 20
    //               +--> smelter (1 ore -> 1 ingot) --> depotIngot (demand 30)  eff = 30
    //   total 50 -> shares 0.4 / 0.6
    //   depotOre  gets 100*0.4 = 40  -> margin (40-20)/20 = 1
    //   smelter   gets 100*0.6 = 60, out 60 -> margin (60-30)/30 = 1
    const mixedNet = {
      nodes: [
        { kind: 'source', id: 'ore', resource: 'ore', rate: 100 },
        { kind: 'sink', id: 'depotOre', resource: 'ore', demand: 20 },
        { kind: 'processor', id: 'smelter', inputs: [{ resource: 'ore', rate: 1 }], outputs: [{ resource: 'ingot', rate: 1 }], capacity: 100 },
        { kind: 'sink', id: 'depotIngot', resource: 'ingot', demand: 30 },
      ],
      edges: [
        { from: 'ore', to: 'depotOre' },
        { from: 'ore', to: 'smelter' },
        { from: 'smelter', to: 'depotIngot' },
      ],
    };
    const result = autoSplit(mixedNet);
    ok('share to the direct sink = 20/50 = 0.4', Math.abs(result.edges[0].share - 0.4) < 1e-12, `${result.edges[0].share}`);
    ok('share to the relay = 30/50 = 0.6', Math.abs(result.edges[1].share - 0.6) < 1e-12, `${result.edges[1].share}`);
    ok("the relay's own output edge is untouched", result.edges[2].share === undefined, `${result.edges[2].share}`);

    const mixedR = feasible(result);
    ok('feasible on the mixed split is ok', mixedR.ok, JSON.stringify(mixedR));
    ok('achieved.depotOre = 100*0.4 = 40', Math.abs(mixedR.achieved.depotOre - 40) < 1e-9, `${mixedR.achieved.depotOre}`);
    ok('achieved.depotIngot = 100*0.6*1 = 60', Math.abs(mixedR.achieved.depotIngot - 60) < 1e-9, `${mixedR.achieved.depotIngot}`);
    const mDirect = (mixedR.achieved.depotOre - 20) / 20;
    const mRelay = (mixedR.achieved.depotIngot - 30) / 30;
    ok('margin at the direct sink is 1', Math.abs(mDirect - 1) < 1e-9, `${mDirect}`);
    ok('margin behind the relay is 1 too — equalised across the two DIFFERENT destination shapes',
      Math.abs(mRelay - 1) < 1e-9, `${mRelay}`);
  }

  console.log('  (7) — no-mutation check on the new code path');
  {
    const mutNet = relayNet();
    const before = JSON.stringify(mutNet);
    autoSplit(mutNet);
    ok('input network is unchanged after autoSplit takes the relay path', JSON.stringify(mutNet) === before);
  }
}

console.log('\nbound — WHICH term of min(capacity, min supply/inputRate) actually bound each processor');
{
  // The fixtures here are copied verbatim from the sections above so that the
  // reported `bound` is checked against a scale that is ALREADY pinned by a
  // hand-computed assertion earlier in this file. A new fixture would let the
  // scale and the reason drift together without either test noticing.

  console.log('  capacity-bound: the capacity-cap fixture (capacity 0.3, both input ratios 2)');
  {
    const net = {
      nodes: [
        { kind: 'source', id: 'a', resource: 'a', rate: 6 },
        { kind: 'source', id: 'b', resource: 'b', rate: 4 },
        { kind: 'processor', id: 'p', inputs: [{ resource: 'a', rate: 3 }, { resource: 'b', rate: 2 }], outputs: [{ resource: 'c', rate: 1 }], capacity: 0.3 },
        { kind: 'sink', id: 's', resource: 'c', demand: 1 },
      ],
      edges: [{ from: 'a', to: 'p' }, { from: 'b', to: 'p' }, { from: 'p', to: 's' }],
    };
    const b = feasible(net).bound.p;
    ok("by is 'capacity'", b.by === 'capacity', JSON.stringify(b));
    ok('resource is null (nothing is starved — supply is ample)', b.resource === null, `${b.resource}`);
    ok('scale is the capacity, 0.3 — the same number the walk used', b.scale === 0.3, `${b.scale}`);
    ok('headroom is exactly 0 (capacity-bound means no room left)', b.headroom === 0, `${b.headroom}`);
  }

  console.log("  input-bound: the convergence CONTROL (a = 6/3 = 2, b = 1/2 = 0.5, capacity 10)");
  {
    const net = (rateB) => ({
      nodes: [
        { kind: 'source', id: 'a', resource: 'a', rate: 6 },
        { kind: 'source', id: 'b', resource: 'b', rate: rateB },
        { kind: 'processor', id: 'p', inputs: [{ resource: 'a', rate: 3 }, { resource: 'b', rate: 2 }], outputs: [{ resource: 'c', rate: 1 }], capacity: 10 },
        { kind: 'sink', id: 's', resource: 'c', demand: 1 },
      ],
      edges: [{ from: 'a', to: 'p' }, { from: 'b', to: 'p' }, { from: 'p', to: 's' }],
    });

    const b = feasible(net(1)).bound.p;
    ok("by is 'input'", b.by === 'input', JSON.stringify(b));
    // THE assertion of this whole section: an implementation that only knows
    // "not capacity" passes everything else here and fails this one. 'a' is
    // ample (ratio 2) and 'b' is the one actually holding the processor back.
    ok("resource names the STARVED input 'b', not the ample 'a'", b.resource === 'b', `${b.resource}`);
    ok('scale is 0.5 — matching the hand-computed achieved above', b.scale === 0.5, `${b.scale}`);
    ok('headroom is 10 - 0.5 = 9.5', b.headroom === 9.5, `${b.headroom}`);

    console.log('    the input tie-break: both ratios 2, first declared input wins');
    // rateB = 4 gives ratios 6/3 = 2 and 4/2 = 2, so the minimum is achieved
    // twice. This pins declaration order as the tie-break, the same
    // determinism discipline analyse()'s Kahn queue already follows.
    const tied = feasible(net(4)).bound.p;
    ok("by is still 'input' (capacity 10 is nowhere near binding)", tied.by === 'input', JSON.stringify(tied));
    ok("resource is 'a', the first input achieving the minimum", tied.resource === 'a', `${tied.resource}`);
    ok('scale is 2 and headroom is 8', tied.scale === 2 && tied.headroom === 8, JSON.stringify(tied));
  }

  console.log('  THE TIE: capacity exactly equal to the binding input ratio resolves to capacity');
  {
    // source 6 / input rate 3 = ratio 2, exactly representable, so the tie is a
    // real tie and not a floating-point near-miss. This is the one judgement
    // call in the whole change, so it is pinned from both sides.
    const net = (capacity) => ({
      nodes: [
        { kind: 'source', id: 'src', resource: 'ore', rate: 6 },
        { kind: 'processor', id: 'p', inputs: [{ resource: 'ore', rate: 3 }], outputs: [{ resource: 'bar', rate: 1 }], capacity },
        { kind: 'sink', id: 'snk', resource: 'bar', demand: 1 },
      ],
      edges: [{ from: 'src', to: 'p' }, { from: 'p', to: 'snk' }],
    });

    const tie = feasible(net(2)).bound.p;
    ok("capacity === ratio resolves to 'capacity'", tie.by === 'capacity', JSON.stringify(tie));
    ok('...with resource null', tie.resource === null, `${tie.resource}`);
    ok('...and headroom exactly 0, so the two fields never disagree',
      tie.scale === 2 && tie.headroom === 0, JSON.stringify(tie));

    console.log('    CONTROL — a hair MORE capacity and the input becomes the binding term');
    const justOver = feasible(net(2 + 1e-9)).bound.p;
    ok("capacity a hair above the ratio is 'input'", justOver.by === 'input', JSON.stringify(justOver));
    ok("...naming the input 'ore'", justOver.resource === 'ore', `${justOver.resource}`);
    ok('...with scale still 2 and headroom now positive',
      justOver.scale === 2 && justOver.headroom > 0, JSON.stringify(justOver));

    console.log('    CONTROL — a hair LESS capacity stays capacity-bound (the boundary is not a range)');
    const justUnder = feasible(net(2 - 1e-9)).bound.p;
    ok("capacity a hair below the ratio is 'capacity'", justUnder.by === 'capacity', JSON.stringify(justUnder));
    ok('...and headroom is still exactly 0', justUnder.headroom === 0, `${justUnder.headroom}`);
  }

  console.log('  coverage: every processor appears — including one whose scale is 0 — and no source or sink does');
  {
    const net = {
      nodes: [
        { kind: 'source', id: 'src', resource: 'iron', rate: 10 },
        { kind: 'processor', id: 'fed', inputs: [{ resource: 'iron', rate: 5 }], outputs: [{ resource: 'gear', rate: 5 }], capacity: 1 },
        // 'starved' has no incoming edge at all: nothing in the network emits
        // copper, so its supply is 0 and its scale is 0. A processor that does
        // nothing is exactly the one a diagnostic verdict most needs to name.
        { kind: 'processor', id: 'starved', inputs: [{ resource: 'copper', rate: 2 }], outputs: [{ resource: 'plate', rate: 1 }], capacity: 4 },
        { kind: 'sink', id: 'snk', resource: 'gear', demand: 4 },
        { kind: 'sink', id: 'plateSnk', resource: 'plate', demand: 1 },
      ],
      edges: [{ from: 'src', to: 'fed' }, { from: 'fed', to: 'snk' }, { from: 'starved', to: 'plateSnk' }],
    };
    const r = feasible(net);
    ok('bound holds exactly the two processors',
      JSON.stringify(Object.keys(r.bound).sort()) === JSON.stringify(['fed', 'starved']),
      JSON.stringify(Object.keys(r.bound)));
    ok('no source appears in bound', !('src' in r.bound));
    ok('no sink appears in bound', !('snk' in r.bound) && !('plateSnk' in r.bound));

    const s = r.bound.starved;
    ok("the zero-scale processor is reported as input-bound on 'copper'",
      s.by === 'input' && s.resource === 'copper', JSON.stringify(s));
    ok('...with scale 0 and headroom equal to its whole capacity (4)',
      s.scale === 0 && s.headroom === 4, JSON.stringify(s));
    ok('...and it really does deliver nothing (the scale is not a cosmetic field)',
      r.achieved.plateSnk === 0, `${r.achieved.plateSnk}`);

    ok("the fed processor is capacity-bound (10/5 = 2 against capacity 1)",
      r.bound.fed.by === 'capacity' && r.bound.fed.headroom === 0, JSON.stringify(r.bound.fed));

    console.log('    the invariant, over every processor in every fixture in this section');
    const invariantHolds = (result) => Object.values(result.bound).every(
      (b) => b.headroom >= 0 && ((b.headroom === 0) === (b.by === 'capacity')),
    );
    ok('headroom >= 0, and headroom === 0 exactly when capacity-bound', invariantHolds(r));
  }

  console.log('  no-regression: bound is purely ADDITIVE — the pre-existing fields are untouched');
  {
    // The basic chain fixture, verbatim. Every value here is an exact integer
    // or a quarter, so a literal byte-comparison is safe from float printing.
    const chain = (rate) => ({
      nodes: [
        { kind: 'source', id: 'src', resource: 'iron', rate },
        { kind: 'processor', id: 'proc', inputs: [{ resource: 'iron', rate: 5 }], outputs: [{ resource: 'gear', rate: 5 }], capacity: 1 },
        { kind: 'sink', id: 'snk', resource: 'gear', demand: 4 },
      ],
      edges: [{ from: 'src', to: 'proc' }, { from: 'proc', to: 'snk' }],
    });

    const good = feasible(chain(10));
    ok('the result keys are the old four, in the old order, with bound appended last',
      Object.keys(good).join(',') === 'ok,achieved,deficits,margin,bound', Object.keys(good).join(','));

    const legacyView = (r) => JSON.stringify({ ok: r.ok, achieved: r.achieved, deficits: r.deficits, margin: r.margin });
    ok('the pre-existing fields are byte-identical to the literal they produced before this change',
      legacyView(good) === '{"ok":true,"achieved":{"snk":5},"deficits":[],"margin":0.25}', legacyView(good));

    const bad = feasible(chain(3));
    ok("a deficit entry's own keys are unchanged, in order",
      bad.deficits.length === 1 && Object.keys(bad.deficits[0]).join(',') === 'sinkId,resource,demand,achieved',
      JSON.stringify(bad.deficits[0]));
    ok('and a deficit carries no bound field of its own (bound is top-level only)',
      !('bound' in bad.deficits[0]));
    // Everything else in this file re-asserts achieved/deficits/margin against
    // hand-computed numbers on ~20 further fixtures; those assertions are
    // unchanged by this ticket and are the rest of the regression check.
  }
}

console.log('\ndeterminism');
{
  const net = {
    nodes: [
      { kind: 'source', id: 'src', resource: 'iron', rate: 10 },
      { kind: 'processor', id: 'proc', inputs: [{ resource: 'iron', rate: 5 }], outputs: [{ resource: 'gear', rate: 5 }], capacity: 1 },
      { kind: 'sink', id: 'snk', resource: 'gear', demand: 4 },
    ],
    edges: [{ from: 'src', to: 'proc' }, { from: 'proc', to: 'snk' }],
  };
  const r1 = feasible(net);
  const r2 = feasible(net);
  ok('two calls on the same network are byte-identical', JSON.stringify(r1) === JSON.stringify(r2));
}

console.log('\nbuildOrder() — the topological construction order analyse() already computes, gate 6\'s non-spatial half');
{
  // reused verbatim from the basic chain fixture above: source 'src' -> processor 'proc' -> sink 'snk'
  const chain = {
    nodes: [
      { kind: 'source', id: 'src', resource: 'iron', rate: 10 },
      { kind: 'processor', id: 'proc', inputs: [{ resource: 'iron', rate: 5 }], outputs: [{ resource: 'gear', rate: 5 }], capacity: 1 },
      { kind: 'sink', id: 'snk', resource: 'gear', demand: 4 },
    ],
    edges: [{ from: 'src', to: 'proc' }, { from: 'proc', to: 'snk' }],
  };
  ok('a straight chain orders src, proc, snk',
    JSON.stringify(buildOrder(chain)) === JSON.stringify(['src', 'proc', 'snk']), JSON.stringify(buildOrder(chain)));

  // reused verbatim from the convergence fixture above: sources a,b -> processor p -> sink s,
  // nodes declared in that order. Both sources start in-degree 0 and queue in
  // nodes-declaration order (a before b); b is what finally drops p's
  // in-degree to 0, so the order is a, b, p, s.
  const convergence = {
    nodes: [
      { kind: 'source', id: 'a', resource: 'a', rate: 6 },
      { kind: 'source', id: 'b', resource: 'b', rate: 4 },
      { kind: 'processor', id: 'p', inputs: [{ resource: 'a', rate: 3 }, { resource: 'b', rate: 2 }], outputs: [{ resource: 'c', rate: 1 }], capacity: 10 },
      { kind: 'sink', id: 's', resource: 'c', demand: 1 },
    ],
    edges: [{ from: 'a', to: 'p' }, { from: 'b', to: 'p' }, { from: 'p', to: 's' }],
  };
  ok('a convergence orders a, b, p, s (declaration order breaks the source tie)',
    JSON.stringify(buildOrder(convergence)) === JSON.stringify(['a', 'b', 'p', 's']), JSON.stringify(buildOrder(convergence)));

  console.log('  CONTROL — a two-node cycle throws, same message as feasible() on the identical fixture');
  const cycle = {
    nodes: [
      { kind: 'processor', id: 'a', inputs: [{ resource: 'x', rate: 1 }], outputs: [{ resource: 'y', rate: 1 }], capacity: 1 },
      { kind: 'processor', id: 'b', inputs: [{ resource: 'y', rate: 1 }], outputs: [{ resource: 'x', rate: 1 }], capacity: 1 },
    ],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
  };
  ok('a two-node cycle throws', throws(() => buildOrder(cycle)));
  ok('...and the message names the cause (cycle)',
    (messageOf(() => buildOrder(cycle)) || '').includes('cycle'), messageOf(() => buildOrder(cycle)));

  console.log('  determinism — same discipline as feasible()\'s determinism section');
  ok('two buildOrder() calls on the same network are byte-identical',
    JSON.stringify(buildOrder(chain)) === JSON.stringify(buildOrder(chain)));

  console.log('  CONTROL — returned array length equals the node count, on a multi-node fixture');
  ok('convergence buildOrder length matches node count (4)',
    buildOrder(convergence).length === convergence.nodes.length, `${buildOrder(convergence).length}`);
}

console.log('');
if (failed) { console.log(`✗ production selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ production selftest passed\n');
