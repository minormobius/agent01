#!/usr/bin/env node
// Known-answer tests for the level certificate (plant/level.mjs).
//
// `level.mjs` composes two things that were already proven separately —
// `solids.mjs`'s geometry and `production.mjs`'s feasibility — so the ONLY
// thing worth testing here is the composition itself: the order the walk runs
// in, which objects block which, and what happens to the factory when a summon
// is refused. Re-asserting that a tetrahedron is a tetrahedron would pass
// whatever `level.mjs` did.
//
// House rules, same as production.selftest.mjs and solids.selftest.mjs:
//   · every positive case carries a paired CONTROL that must FAIL;
//   · every number is checked against a hand computation, never truthiness;
//   · the geometric fixtures are the ones those two files already pin, so a
//     disagreement here is about composition and not about the primitives.
//
// One deliberate addition: `minGapLocal()` below recomputes the anisotropic
// minimum gap from the FORMULA rather than by calling `pairGap()`. An assertion
// that checks a function's output against the same function is decoration; the
// ledger has already paid for that lesson twice (lp-c46a0c, and the buildcert
// clearance finding). The local version is what the reported `gap` is graded
// against.
//
// Run: node plant/test/level.selftest.mjs

import { constellation } from '../solids.mjs';
import { feasible } from '../production.mjs';
import { placementReport, levelVerdict } from '../level.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const messageOf = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

const ANISO = 2.2;

// The anisotropic distance, written out from `reformPocket`'s own formula
// (y scaled by sqrt(aniso), then a Euclidean norm) rather than imported — see
// the header. Brute force over every seed pair, no shortcuts.
const gapLocal = (a, b, aniso) =>
  Math.hypot(a[0] - b[0], (a[1] - b[1]) * Math.sqrt(aniso), a[2] - b[2]);
const minGapLocal = (conA, conB) => {
  let min = Infinity;
  for (const a of conA.seeds) for (const b of conB.seeds) {
    min = Math.min(min, gapLocal(a, b, ANISO));
  }
  return min;
};

// Cube at r=1.0 is the workhorse fixture here and the numbers are why.
//
// For the x and z normals `constellation()`'s algebra is EXACT with no rounding
// anywhere: û is a unit basis vector, so q = ûᵀM⁻¹û = 1 exactly, t = 2r/q = 2
// exactly, and the seed lands on centre ± 2 with the y term identically zero.
// (The ±y seeds land at ~2 as well, but via 1/aniso × 2/(1/aniso), which is NOT
// guaranteed bit-exact — nothing below depends on them, and the comment says so
// rather than claiming an exactness the arithmetic does not have.)
//
// So: the cube's own minimum self-gap is exactly 2r = 2.0 (ledger finding
// "cube's minimum self-seed-gap is EXACTLY 2*r"), and for two cubes offset
// along z the binding pair is always a z-seed against a z-seed — dy = 0, so no
// sqrt(aniso) enters and the gap is a plain difference of exactly-representable
// numbers. Every collision number below is therefore hand-computable to the
// digit, which is what lets these use a 1e-12 tolerance instead of a fudge.
const cube = (z, r = 1.0) => constellation('cube', { centre: [0, 0, z], r, aniso: ANISO });

console.log('\nself-collision is checked first, and needs no neighbours at all');
{
  // solids.selftest.mjs's own CONTROL: an icosahedron squeezed to r=0.35 has
  // its own seeds inside the 1.5 gap and could never be summoned anywhere.
  const tiny = constellation('icosahedron', { r: 0.35, aniso: ANISO });
  const r = placementReport([{ id: 'tiny', con: tiny }]);
  ok('one entry for one object', r.length === 1, `${r.length}`);
  ok('the very first object in an empty session is still refused', r[0].ok === false);
  ok("reason is exactly 'self-collision'", r[0].reason === 'self-collision', `${r[0].reason}`);
  // THE discriminating assertion: an implementation that only ran the pairwise
  // check would report ok:true here (there is nothing to collide with), and one
  // that ran self-check and pair-check in the wrong order would still name a
  // blocker.
  ok('...and it names no blocker, because there is nothing to blame',
    !('blockedBy' in r[0]), JSON.stringify(r[0]));

  console.log('  CONTROL — the same solid family at a legal radius passes alone');
  // solids.selftest.mjs pins a tetrahedron at r=1.0 as self-compatible.
  const fine = placementReport([{ id: 'fine', con: constellation('tetrahedron', { r: 1.0, aniso: ANISO }) }]);
  ok('CONTROL: a self-compatible object alone is legal', fine[0].ok === true);
  ok('CONTROL: ...with reason null, not undefined', fine[0].reason === null, `${fine[0].reason}`);
}

console.log('\nprecedence: self-collision wins over a collision it also has');
{
  // Both refusals apply — the tiny icosahedron sits exactly on the cube's own
  // centre seed — so this pins WHICH is reported.
  const r = placementReport([
    { id: 'big', con: cube(0) },
    { id: 'tiny', con: constellation('icosahedron', { centre: [0, 0, 0], r: 0.35, aniso: ANISO }) },
  ]);
  ok('the legal object is legal', r[0].ok === true);
  ok('the doubly-illegal one reports self-collision, not the collision',
    r[1].ok === false && r[1].reason === 'self-collision', JSON.stringify(r[1]));
  ok('...and still names no blocker', !('blockedBy' in r[1]));
}

console.log('\ntwo tetrahedra, the fixture solids.selftest.mjs already pins');
{
  // That file asserts pairGap >= 1.5 for these two and < 1.5 for the 0.5-apart
  // pair. Here the same geometry has to produce the right VERDICT.
  const farA = constellation('tetrahedron', { centre: [0, 0, 0], r: 1.0, aniso: ANISO });
  const farB = constellation('tetrahedron', { centre: [0, 0, 20], r: 1.0, aniso: ANISO });
  const far = placementReport([{ id: 'a', con: farA }, { id: 'b', con: farB }]);
  ok('two tetrahedra 20 apart are both legal', far[0].ok === true && far[1].ok === true,
    JSON.stringify(far));
  // Independently recomputed, not read back from pairGap.
  ok('...and the independently computed min gap really does clear 1.5',
    minGapLocal(farA, farB) >= 1.5, `min gap ${minGapLocal(farA, farB).toFixed(3)}`);

  console.log('  CONTROL — recentre the second 0.5 away and it collides');
  const closeA = constellation('tetrahedron', { centre: [0, 0, 0], r: 1.0, aniso: ANISO });
  const closeB = constellation('tetrahedron', { centre: [0, 0, 0.5], r: 1.0, aniso: ANISO });
  const close = placementReport([{ id: 'a', con: closeA }, { id: 'b', con: closeB }]);
  ok('CONTROL: the first is still legal', close[0].ok === true);
  ok('CONTROL: the second is refused', close[1].ok === false);
  ok("CONTROL: reason is exactly 'collides with existing summon'",
    close[1].reason === 'collides with existing summon', `${close[1].reason}`);
  ok("CONTROL: blockedBy names the first object 'a'", close[1].blockedBy === 'a', `${close[1].blockedBy}`);
  // conB is conA translated by exactly (0,0,0.5), so every matched seed pair is
  // 0.5 apart with dy = 0. No cross pair can beat it: the tetrahedron's own
  // minimum self-gap at r=1.0 is ~2.21, so by the triangle inequality in this
  // metric a cross pair is at least 2.21 - 0.5 = 1.71 > 0.5.
  ok('CONTROL: the reported gap is the hand-computed 0.5',
    Math.abs(close[1].gap - 0.5) < 1e-12, `${close[1].gap}`);
  ok('CONTROL: ...and it agrees with the independent recomputation',
    Math.abs(close[1].gap - minGapLocal(closeA, closeB)) < 1e-12,
    `${close[1].gap} vs ${minGapLocal(closeA, closeB)}`);
}

console.log('\nA REFUSED SUMMON OCCUPIES NO SPACE — it must not block what comes after');
{
  // Cubes at z = 0, 5, 10. Hand computation, all exact:
  //   A(z=0) seeds include (0,0,+2);  B(z=5) seeds include (0,0,3)  -> gap 1.0
  //   A(z=0) seeds include (0,0,+2);  C(z=10) seeds include (0,0,8) -> gap 6.0
  // So B is refused by A, and C is clear of A. C is only ~1.0 from B — but B
  // was never placed, so C must be LEGAL.
  const A = cube(0), B = cube(5), C = cube(10);
  ok('hand check: A-B min gap is 1.0', Math.abs(minGapLocal(A, B) - 1.0) < 1e-12, `${minGapLocal(A, B)}`);
  ok('hand check: A-C min gap is 6.0', Math.abs(minGapLocal(A, C) - 6.0) < 1e-12, `${minGapLocal(A, C)}`);
  ok('hand check: B-C min gap is 1.0 (so B WOULD block C, if B existed)',
    Math.abs(minGapLocal(B, C) - 1.0) < 1e-12, `${minGapLocal(B, C)}`);

  const r = placementReport([{ id: 'ca', con: A }, { id: 'cb', con: B }, { id: 'cc', con: C }]);
  ok('ca is legal', r[0].ok === true);
  ok('cb is refused by ca', r[1].ok === false && r[1].blockedBy === 'ca', JSON.stringify(r[1]));
  ok('cb reports the hand-computed gap 1.0', Math.abs(r[1].gap - 1.0) < 1e-12, `${r[1].gap}`);
  // THE assertion of this section. An implementation that checks against all
  // EARLIER objects rather than all earlier LEGAL objects refuses cc here.
  ok('cc IS LEGAL — the refused cb never occupied the space between them',
    r[2].ok === true, JSON.stringify(r[2]));

  console.log('  CONTROL — move the middle cube 1m further out so it IS legal, and now it blocks');
  // Cubes at z = 0, 6, 10. Only one number changes:
  //   A(0,0,+2) vs B'(0,0,4) -> gap 2.0, legal (>= 1.5)
  //   B'(0,0,8) vs C(0,0,8)  -> gap 0.0, refused
  const B2 = cube(6);
  ok('CONTROL hand check: A-B2 min gap is 2.0', Math.abs(minGapLocal(A, B2) - 2.0) < 1e-12, `${minGapLocal(A, B2)}`);
  ok('CONTROL hand check: B2-C min gap is 0.0 (coincident seeds)',
    Math.abs(minGapLocal(B2, C) - 0.0) < 1e-12, `${minGapLocal(B2, C)}`);
  const r2 = placementReport([{ id: 'ca', con: A }, { id: 'cb', con: B2 }, { id: 'cc', con: C }]);
  ok('CONTROL: cb is now legal', r2[1].ok === true, JSON.stringify(r2[1]));
  ok('CONTROL: and cc is now REFUSED, blocked by cb', r2[2].ok === false && r2[2].blockedBy === 'cb',
    JSON.stringify(r2[2]));
  ok('CONTROL: ...not by ca, which is 6.0 away and never binds',
    r2[2].blockedBy !== 'ca', `${r2[2].blockedBy}`);
  ok('CONTROL: the reported gap is the hand-computed 0.0', Math.abs(r2[2].gap - 0.0) < 1e-12, `${r2[2].gap}`);
}

console.log('\nthe threshold itself, pinned from both sides');
{
  // A(z=0) seed (0,0,2) vs B(z=5.5) seed (0,0,3.5): gap exactly 1.5, and every
  // value in that chain (5.5, 3.5, 2, 1.5) is exactly representable in binary
  // floating point, with dy = 0 so no sqrt(aniso) enters. The rule is "refuse
  // when gap < minSeedGap", so 1.5 is LEGAL at the default.
  const A = cube(0), B = cube(5.5);
  const measured = minGapLocal(A, B);
  ok('hand check: the min gap is 1.5', Math.abs(measured - 1.5) < 1e-12, `${measured}`);

  // The boundary is asserted against the MEASURED gap rather than against the
  // literal 1.5. Both are exactly representable and dy is 0 for the binding
  // pair, so they should be the same number to the bit — but staking a
  // pass/fail boundary on `Math.hypot` returning exactly 1.5 would make this
  // gate fail for a rounding reason that has nothing to do with level.mjs, and
  // a checker that fails correct work is worse than no checker. Using the
  // measured value pins the thing actually under test — that `gap === threshold`
  // is legal and anything strictly below it is not — with no float assumption.
  const atDefault = placementReport([{ id: 'a', con: A }, { id: 'b', con: B }], measured);
  ok('a gap of exactly minSeedGap is legal (the boundary is >=, not >)',
    atDefault[1].ok === true, JSON.stringify(atDefault[1]));

  const nudged = placementReport([{ id: 'a', con: A }, { id: 'b', con: B }], measured * (1 + 1e-9));
  ok('CONTROL: the smallest possible nudge past that gap refuses it',
    nudged[1].ok === false && nudged[1].reason === 'collides with existing summon',
    JSON.stringify(nudged[1]));

  const atLiteral = placementReport([{ id: 'a', con: A }, { id: 'b', con: B }]);
  ok('and at the DEFAULT 1.5 it is legal too (the two agree, as the hand calc says)',
    atLiteral[1].ok === true, JSON.stringify(atLiteral[1]));

  console.log('  CONTROL — same geometry, minSeedGap raised to 1.6');
  const raised = placementReport([{ id: 'a', con: A }, { id: 'b', con: B }], 1.6);
  ok('CONTROL: 1.5 < 1.6, so the same pair now collides', raised[1].ok === false);
  ok('CONTROL: it is a pair collision, not a self-collision — the cube\'s own '
    + 'min self-gap is 2.0 and still clears 1.6',
    raised[1].reason === 'collides with existing summon', `${raised[1].reason}`);
  ok('CONTROL: the first object is unaffected by the raised threshold',
    raised[0].ok === true);
}

console.log('\nEND TO END: three legal placements wired into a real factory');
{
  // Geometry: cubes at z = 0, 10, 20. Min gaps 6.0 (0-10), 6.0 (10-20) and
  // 16.0 (0-20) — all comfortably clear.
  // Rates: production.selftest.mjs's very first fixture, unchanged.
  //   source iron 10 -> proc scale = min(capacity 1, 10/5) = 1 -> gear 5
  //   -> sink demand 4  =>  achieved 5, margin (5-4)/4 = 0.25
  const objects = [
    { id: 'src', con: cube(0), node: { kind: 'source', id: 'src', resource: 'iron', rate: 10 } },
    {
      id: 'proc',
      con: cube(10),
      node: {
        kind: 'processor', id: 'proc',
        inputs: [{ resource: 'iron', rate: 5 }],
        outputs: [{ resource: 'gear', rate: 5 }],
        capacity: 1,
      },
    },
    { id: 'snk', con: cube(20), node: { kind: 'sink', id: 'snk', resource: 'gear', demand: 4 } },
  ];
  const edges = [{ from: 'src', to: 'proc' }, { from: 'proc', to: 'snk' }];

  const v = levelVerdict(objects, edges);
  ok('every placement is legal', v.placement.every((p) => p.ok), JSON.stringify(v.placement));
  ok('the network is satisfiable', v.network.ok);
  ok('the verdict is ok', v.ok === true);
  ok('achieved matches production.selftest.mjs\'s hand calc (5)',
    Math.abs(v.network.achieved.snk - 5) < 1e-12, `${v.network.achieved.snk}`);
  ok('margin matches production.selftest.mjs\'s hand calc (0.25)',
    Math.abs(v.network.margin - 0.25) < 1e-12, `${v.network.margin}`);
  ok('no deficits', v.network.deficits.length === 0);

  console.log('  CONTROL — recentre the sink ON TOP OF the processor');
  // Same centre => the two constellations share every seed => min gap 0.
  const collided = objects.map((o) => (o.id === 'snk' ? { ...o, con: cube(10) } : o));
  ok('CONTROL hand check: the sink and the processor now have min gap 0.0',
    Math.abs(minGapLocal(cube(10), cube(10)) - 0) < 1e-12);

  const c = levelVerdict(collided, edges);
  ok('CONTROL: the verdict is NOT ok', c.ok === false);
  ok('CONTROL: the sink is the refused one, blocked by the processor',
    c.placement[2].ok === false
    && c.placement[2].reason === 'collides with existing summon'
    && c.placement[2].blockedBy === 'proc', JSON.stringify(c.placement[2]));
  ok('CONTROL: the source and processor are still legal',
    c.placement[0].ok === true && c.placement[1].ok === true);

  // THE assertion this CONTROL exists for. Three outcomes are distinguishable
  // and only one of them is correct:
  //   (1) the sink is kept and fed        -> achieved.snk === 5  (a lie)
  //   (2) the node is dropped, edge kept  -> feasible() THROWS on an unknown node
  //   (3) both dropped                    -> no achieved entry at all  ← correct
  ok('CONTROL: the refused sink is ABSENT from achieved, not fed',
    !('snk' in c.network.achieved), JSON.stringify(c.network.achieved));
  ok('CONTROL: ...and absent is not the same as zero — the key does not exist',
    c.network.achieved.snk === undefined);
  // The surviving network is src -> proc with nothing consuming the gear, so it
  // has NO sinks and is vacuously satisfiable. This is exactly why `ok` cannot
  // be read off `network.ok`: the factory "passes" and the level does not.
  ok('CONTROL: the surviving network is vacuously satisfiable (no sinks left)',
    c.network.ok === true, JSON.stringify(c.network.deficits));
  ok('CONTROL: with production.mjs\'s documented no-sink margin of 0',
    c.network.margin === 0, `${c.network.margin}`);
  ok('CONTROL: so the false verdict comes from the PLACEMENT half alone',
    c.ok === false && c.network.ok === true);

  // Proof that dropping the edge was load-bearing rather than incidental: keep
  // it, drop only the node, and production.mjs refuses the network outright.
  // Without this, "the edge was dropped" is an assumption, not a finding.
  const orphaned = { nodes: [objects[0].node, objects[1].node], edges };
  ok('CONTROL: had the edge survived the drop, feasible() would have thrown',
    throws(() => feasible(orphaned)));
  ok('CONTROL: ...naming the unknown node',
    (messageOf(() => feasible(orphaned)) || '').includes('unknown node'),
    messageOf(() => feasible(orphaned)));
}

console.log('\na refused SUPPLIER starves what is left — the drop reshapes the factory');
{
  // The other direction of the same rule. Cubes at z = 0, 3, 20:
  //   src(0,0,+2) vs proc(0,0,1) -> gap 1.0, so the processor is REFUSED
  //   src vs snk(z=20)           -> gap 16.0, so the sink is legal
  // Both edges name the refused processor, so both are dropped and the sink is
  // left with nothing at all: achieved 0 against demand 4, margin (0-4)/4 = -1.
  const objects = [
    { id: 'src', con: cube(0), node: { kind: 'source', id: 'src', resource: 'iron', rate: 10 } },
    {
      id: 'proc',
      con: cube(3),
      node: {
        kind: 'processor', id: 'proc',
        inputs: [{ resource: 'iron', rate: 5 }],
        outputs: [{ resource: 'gear', rate: 5 }],
        capacity: 1,
      },
    },
    { id: 'snk', con: cube(20), node: { kind: 'sink', id: 'snk', resource: 'gear', demand: 4 } },
  ];
  ok('hand check: src-proc min gap is 1.0', Math.abs(minGapLocal(cube(0), cube(3)) - 1.0) < 1e-12,
    `${minGapLocal(cube(0), cube(3))}`);
  ok('hand check: src-snk min gap is 16.0', Math.abs(minGapLocal(cube(0), cube(20)) - 16.0) < 1e-12,
    `${minGapLocal(cube(0), cube(20))}`);

  const v = levelVerdict(objects, [{ from: 'src', to: 'proc' }, { from: 'proc', to: 'snk' }]);
  ok('the processor is refused', v.placement[1].ok === false && v.placement[1].blockedBy === 'src');
  ok('the sink is legal — it is far from everything', v.placement[2].ok === true);
  ok('the verdict is not ok', v.ok === false);
  // This is the half the previous section could not show: here the surviving
  // network still HAS a sink, so the factory verdict genuinely degrades rather
  // than going vacuous.
  ok('the surviving network is INFEASIBLE, not vacuous', v.network.ok === false);
  ok('the sink achieved exactly 0 — both its supply edges were dropped',
    v.network.achieved.snk === 0, `${v.network.achieved.snk}`);
  ok('margin matches the hand calc ((0-4)/4 = -1)',
    Math.abs(v.network.margin - (-1)) < 1e-12, `${v.network.margin}`);
  ok('the deficit names the sink, its resource, and the hand-computed numbers',
    v.network.deficits.length === 1
    && v.network.deficits[0].sinkId === 'snk'
    && v.network.deficits[0].resource === 'gear'
    && v.network.deficits[0].demand === 4
    && v.network.deficits[0].achieved === 0, JSON.stringify(v.network.deficits));

  console.log('  CONTROL — move the processor clear and the identical level passes');
  // One number changes: z = 3 becomes z = 10 (min gaps 6.0 and 6.0).
  const clear = objects.map((o) => (o.id === 'proc' ? { ...o, con: cube(10) } : o));
  const c = levelVerdict(clear, [{ from: 'src', to: 'proc' }, { from: 'proc', to: 'snk' }]);
  ok('CONTROL: with the processor moved clear the verdict is ok', c.ok === true);
  ok('CONTROL: and the sink is fed the hand-computed 5',
    Math.abs(c.network.achieved.snk - 5) < 1e-12, `${c.network.achieved.snk}`);
}

console.log('\nthe node contract is enforced on LEGAL objects only');
{
  const legalCon = cube(0);
  ok('a legal object with no node throws',
    throws(() => levelVerdict([{ id: 'x', con: legalCon }], [])));
  ok('...and the message names the object',
    (messageOf(() => levelVerdict([{ id: 'x', con: legalCon }], [])) || '').includes('"x"'),
    messageOf(() => levelVerdict([{ id: 'x', con: legalCon }], [])));

  const mismatched = [{
    id: 'x', con: legalCon,
    node: { kind: 'source', id: 'y', resource: 'iron', rate: 1 },
  }];
  ok('a node whose id disagrees with the object id throws',
    throws(() => levelVerdict(mismatched, [])));
  ok('...and the message names both ids',
    (messageOf(() => levelVerdict(mismatched, [])) || '').includes('"y"'),
    messageOf(() => levelVerdict(mismatched, [])));

  console.log('  CONTROL — an ILLEGAL object with no node is fine, because it is never used');
  // The refused object contributes nothing to the network, so demanding a node
  // from it would refuse levels that are merely losing. A check scoped to every
  // object rather than every legal object fails this.
  const tiny = constellation('icosahedron', { r: 0.35, aniso: ANISO });
  const v = levelVerdict([
    { id: 'ghost', con: tiny },
    { id: 'snk', con: cube(20), node: { kind: 'sink', id: 'snk', resource: 'gear', demand: 4 } },
  ], []);
  ok('CONTROL: no throw — the illegal object was never asked for a node',
    v.placement[0].ok === false && v.placement[0].reason === 'self-collision');
  ok('CONTROL: the level is still not ok (an illegal placement is a loss)', v.ok === false);
  ok('CONTROL: and the surviving sink is starved, achieved 0',
    v.network.achieved.snk === 0, `${v.network.achieved.snk}`);

  console.log('  CONTROL — a duplicate object id throws');
  ok('CONTROL: two objects with the same id are refused',
    throws(() => placementReport([{ id: 'a', con: cube(0) }, { id: 'a', con: cube(20) }])));

  console.log('  CONTROL — an edge naming a node that is not an object at all is NOT swallowed');
  // Dropping it would hide a typo in a level literal. It is passed through so
  // production.mjs raises its own error.
  ok('CONTROL: feasible()\'s unknown-node error still surfaces',
    (messageOf(() => levelVerdict(
      [{ id: 'src', con: cube(0), node: { kind: 'source', id: 'src', resource: 'iron', rate: 10 } }],
      [{ from: 'src', to: 'typo' }],
    )) || '').includes('unknown node'));
}

console.log('\ndeterminism — same discipline as production.selftest.mjs\'s own check');
{
  const objects = [
    { id: 'src', con: cube(0), node: { kind: 'source', id: 'src', resource: 'iron', rate: 10 } },
    {
      id: 'proc',
      con: cube(10),
      node: {
        kind: 'processor', id: 'proc',
        inputs: [{ resource: 'iron', rate: 5 }],
        outputs: [{ resource: 'gear', rate: 5 }],
        capacity: 1,
      },
    },
    { id: 'snk', con: cube(20), node: { kind: 'sink', id: 'snk', resource: 'gear', demand: 4 } },
  ];
  const edges = [{ from: 'src', to: 'proc' }, { from: 'proc', to: 'snk' }];

  ok('two placementReport() calls are byte-identical',
    JSON.stringify(placementReport(objects)) === JSON.stringify(placementReport(objects)));
  ok('two levelVerdict() calls are byte-identical',
    JSON.stringify(levelVerdict(objects, edges)) === JSON.stringify(levelVerdict(objects, edges)));

  // Without this, every determinism assertion above would pass for a comparator
  // that always says "equal" — the same control multi-insert.selftest.mjs puts
  // on its deep comparator.
  console.log('  CONTROL — a genuinely different level must NOT stringify the same');
  const moved = objects.map((o) => (o.id === 'snk' ? { ...o, con: cube(10) } : o));
  ok('CONTROL: colliding the sink changes the serialized verdict',
    JSON.stringify(levelVerdict(objects, edges)) !== JSON.stringify(levelVerdict(moved, edges)));
}

console.log('');
if (failed) { console.log(`✗ level selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ level selftest passed\n');
