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

import { feasible, band } from '../production.mjs';

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

console.log('');
if (failed) { console.log(`✗ production selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ production selftest passed\n');
