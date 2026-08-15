#!/usr/bin/env node
// Known-answer tests for plant/pocketLevel.mjs — session legality AND pocket
// legality, against a REAL `generatePocket` fixture.
//
// Run: node plant/test/pocket-level.selftest.mjs
//
// ------------------------------------------------------------ what is proven --
//
// `pocketLevel.mjs` composes three things that are each already pinned
// elsewhere: `placement.mjs`'s pocket predicate (`placement.selftest.mjs`),
// `production.mjs`'s feasibility (`production.selftest.mjs`), and `level.mjs`'s
// drop-the-refused-object rule (`level.selftest.mjs`). Re-asserting any of them
// here would pass whatever this file did. So every assertion below is about the
// COMPOSITION, and there are exactly four claims worth making:
//
//   1. a set of well-separated legal placements produces the hand-computed
//      production numbers;
//   2. an object on a pocket seed is refused for `'seed'`, names the seed, and
//      its edges are dropped;
//   3. an object outside the hull is REFUSED and not clamped;
//   4. THE HEADLINE — two objects that are each legal against the STATIC pocket
//      but collide with each other's planted seeds are caught.
//
// Claim 4 is the whole substance of the ticket, and it is the one an assertion
// can most easily fake. `report[1].ok === false` passes for an implementation
// that refuses everything, and it passes for one that got the refusal from a
// pocket seed rather than from the earlier object. So the section proves the
// failure mode is REACHABLE first — it asserts `legalSummon(P, conB).ok` is
// TRUE, i.e. the cheap static implementation really would have said yes — and
// only then asserts that the accumulating one says no, names the earlier object,
// and reports the independently recomputed gap.
//
// §6 is a different kind of claim and is deliberately last: the exact KEY SET
// of every record these two functions emit, one literal per reason. It asserts
// no VALUES at all, so retuning a fixture cannot fail it — and it is the only
// thing in the tree that states how `level.mjs`'s report and `pocketLevel.mjs`'s
// really differ, which the ledger records as "close enough to look like
// duplication, and they are not". The inner `refusals[]` elements are
// `legalSummon`'s own and are pinned by `placement.selftest.mjs` §8; only the
// two fields `classify()` ADDS to them are pinned here, differentially.
//
// §7 is the `dropped` summary — what the verdict stopped judging. It is the only
// section here that is about a claim the verdict makes rather than about one it
// merely guards: `ok` has always been false when a sink was refused, and
// `dropped.vacuous` is the first field that says WHY the production half looks
// happy. Four fixtures, each killing a different wrong implementation of that
// one boolean; the reasoning is at the head of the section rather than here,
// because it is about the fixtures and not about the file.
//
// TWO HOUSE RULES, from the ledger:
//   · every gap this file grades against is recomputed from `reformPocket`'s own
//     formula below, never read back from `seedGap`/`pairGap`. An assertion that
//     checks a function against itself is decoration.
//   · the fixture is CHOSEN BY SWEEP, not by hand-picked coordinates. Nobody can
//     know where `generatePocket(seed: 2)` put its 64 seeds without running it,
//     and a hard-coded centre that happened to be occupied would fail this gate
//     for a reason that has nothing to do with `pocketLevel.mjs`.

import { generatePocket } from '../foamworld.js';
import { constellation } from '../solids.mjs';
import { legalSummon, MIN_SEED_GAP } from '../placement.mjs';
import { feasible } from '../production.mjs';
import { pocketPlacementReport, pocketLevelVerdict, REASON_OF } from '../pocketLevel.mjs';
// §6 only. `placementReport` is `level.mjs`'s session-local walk and its own gate
// is `level.selftest.mjs`; it is imported HERE because the claim §6 makes is a
// COMPARISON between the two reports, and a comparison has to live in one file.
import { placementReport } from '../level.mjs';
import { BLAME_PRECEDENCE } from '../buildcert.mjs';

let checks = 0, failures = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.error('  ✗ ' + msg); } };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const messageOf = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

// The macro fixture, byte-identical to `placement.selftest.mjs`'s and
// `foamworld.selftest.mjs`'s, so a disagreement here is about this file.
const MACRO = { nx: 4, nz: 4, layers: 3, subLayers: 1, cell: 20, layerH: 9, parMin: 3, parTarget: 6 };
const P = generatePocket({ seed: 2, ...MACRO });
const ANISO = P.opts.aniso;
const BASE = P.seeds.length;
const R = 1.6;

// `reformPocket`'s refusal metric, written out (foamworld.js:721-722) rather
// than imported — see the header.
const gapLocal = (a, b, aniso) =>
  Math.hypot(a[0] - b[0], (a[1] - b[1]) * Math.sqrt(aniso), a[2] - b[2]);
const minGapLocal = (conA, conB) => {
  let m = Infinity;
  for (const a of conA.seeds) for (const b of conB.seeds) m = Math.min(m, gapLocal(a, b, ANISO));
  return m;
};
/** The tightest anisotropic gap between any seed of `con` and any seed of the
 *  ORIGINAL pocket. This is what "legal against the static pocket" means, and
 *  it is computed here so the sweep does not depend on the module under test. */
const clearOf = (con) => {
  let m = Infinity;
  for (const a of con.seeds) for (const s of P.seeds) m = Math.min(m, gapLocal(a, s, ANISO));
  return m;
};
const cube = (c) => constellation('cube', { centre: c, r: R, aniso: ANISO });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ------------------------------------------------------------- the fixture --
ok(P.W === 80 && P.H === 36 && P.D === 80, `fixture: 80×36×80 pocket (got ${P.W}×${P.H}×${P.D})`);
ok(BASE === 64, `fixture: 64 seeds (got ${BASE})`);
ok(ANISO === 2.2, `fixture: aniso 2.2 (got ${ANISO})`);
ok(cube([40, 18, 40]).seeds.length === 7, 'fixture: a cube constellation is 7 seeds (centre + 6 faces)');

// ------------------------------------------------------- choosing centres ---
// A deterministic lattice. Every candidate is far enough from every wall that
// the whole constellation is inside the hull (cube neighbours land at ±3.2 on
// all three axes at r=1.6, and the hull is x,z ∈ [1, 79], y ∈ [0.8, 35.2]), so
// any refusal found in this sweep is a SEED refusal — which is what makes the
// legal/illegal split below mean something.
const CANDS = [];
for (let x = 8; x <= P.W - 8; x += 4) {
  for (let z = 8; z <= P.D - 8; z += 4) {
    for (const y of [10, 14, 18, 22, 26]) {
      const c = [x, y, z];
      CANDS.push({ c, con: cube(c), clear: clearOf(cube(c)) });
    }
  }
}
ok(CANDS.length > 500, `sweep: a real lattice of candidate centres (${CANDS.length})`);
ok(CANDS.some((k) => k.clear >= MIN_SEED_GAP) && CANDS.some((k) => k.clear < MIN_SEED_GAP),
  'sweep: the lattice contains both clear and occupied centres — not a constant');

// The single most open spot in the lattice. First-wins on ties, so this is
// deterministic. It has to be genuinely open, and the threshold is derived
// rather than picked: section 4 shifts a copy of it `SHIFT` metres along x, and
// that copy must ITSELF be clear of every pocket seed or the section proves
// nothing. A translation of `SHIFT` changes any anisotropic gap by at most
// `SHIFT` (x is the unscaled axis, and the triangle inequality holds in the
// scaled metric), so `clear ≥ MIN_SEED_GAP + SHIFT` is sufficient.
const SHIFT = 1;
const NUDGE = (c) => [c[0] + SHIFT, c[1], c[2]];
const roomy = CANDS.reduce((a, b) => (b.clear > a.clear ? b : a));
ok(roomy.clear >= MIN_SEED_GAP + SHIFT + 0.1,
  `sweep: the fixture has a genuinely open spot (best clearance ${roomy.clear.toFixed(2)} m, `
  + `need ≥ ${(MIN_SEED_GAP + SHIFT + 0.1).toFixed(1)})`);

// Two more clear centres, each ≥ 20 m from `roomy` and from each other, so no
// pair of the three can possibly interact (their seeds span ±3.2, so 20 m of
// centre separation leaves ≥ 13.6 m of gap).
const far = [];
for (const k of CANDS) {
  if (k.clear < 2.5) continue;
  if (dist(k.c, roomy.c) < 20) continue;
  if (far.some((f) => dist(f.c, k.c) < 20)) continue;
  far.push(k);
  if (far.length === 2) break;
}
ok(far.length === 2, `sweep: two further well-separated clear centres (got ${far.length})`);

const [FAR1, FAR2] = far;

// The three nodes every section below reuses. Rates are production.selftest's
// very first fixture, unchanged, so the numbers are already hand-computed there:
//   source iron 10 → proc scale = min(capacity 1, 10/5) = 1 → gear 5
//   → sink demand 4   ⇒   achieved 5, margin (5-4)/4 = 0.25
const SRC = { kind: 'source', id: 'src', resource: 'iron', rate: 10 };
const PROC = {
  kind: 'processor', id: 'proc',
  inputs: [{ resource: 'iron', rate: 5 }],
  outputs: [{ resource: 'gear', rate: 5 }],
  capacity: 1,
};
const SNK = { kind: 'sink', id: 'snk', resource: 'gear', demand: 4 };
const EDGES = [{ from: 'src', to: 'proc' }, { from: 'proc', to: 'snk' }];

const level = (cSrc, cProc, cSnk) => ([
  { id: 'src', con: cube(cSrc), node: SRC },
  { id: 'proc', con: cube(cProc), node: PROC },
  { id: 'snk', con: cube(cSnk), node: SNK },
]);

// ================================================================ 1. LEGAL ===
// Three well-separated placements in a real pocket, wired into a real factory.
console.log('\n1. three well-separated legal placements → the hand-computed factory');
{
  const objects = level(roomy.c, FAR1.c, FAR2.c);

  // Independently: each is clear of the pocket, and no pair is close.
  ok(clearOf(objects[0].con) >= MIN_SEED_GAP && clearOf(objects[1].con) >= MIN_SEED_GAP
    && clearOf(objects[2].con) >= MIN_SEED_GAP, 'each chosen constellation clears the pocket seeds');
  ok(minGapLocal(objects[0].con, objects[1].con) >= MIN_SEED_GAP
    && minGapLocal(objects[1].con, objects[2].con) >= MIN_SEED_GAP
    && minGapLocal(objects[0].con, objects[2].con) >= MIN_SEED_GAP,
    'and no pair of them is within the seed gap of each other');

  const v = pocketLevelVerdict(P, objects, EDGES);
  ok(v.placement.every((p) => p.ok), `every placement is legal (${JSON.stringify(v.placement.map((p) => p.reason))})`);
  ok(v.placement.every((p) => p.reason === null), 'legal entries report reason null, not undefined');
  ok(v.network.ok && v.ok === true, 'the network is satisfiable and the verdict is ok');
  ok(Math.abs(v.network.achieved.snk - 5) < 1e-12, `achieved matches the hand calc, 5 (got ${v.network.achieved.snk})`);
  ok(Math.abs(v.network.margin - 0.25) < 1e-12, `margin matches the hand calc, 0.25 (got ${v.network.margin})`);
  ok(v.network.deficits.length === 0, 'no deficits');

  // The accumulated indexing, stated as a fact rather than left implicit: three
  // legal cubes commit 7 seeds each, contiguously, starting at the pocket's own
  // seed count.
  ok(v.placement[0].seedIndices[0] === BASE && v.placement[0].seedIndices.length === 7,
    `src takes seeds ${BASE}..${BASE + 6} (got ${v.placement[0].seedIndices[0]}, ${v.placement[0].seedIndices.length})`);
  ok(v.placement[1].seedIndices[0] === BASE + 7, `proc takes seeds from ${BASE + 7} (got ${v.placement[1].seedIndices[0]})`);
  ok(v.placement[2].seedIndices[0] === BASE + 14, `snk takes seeds from ${BASE + 14} (got ${v.placement[2].seedIndices[0]})`);
}

// ================================================== 2. CONTROL — a pocket seed
console.log('\n2. CONTROL — one object moved onto a pocket seed');
{
  // Seeds are clamped to y ∈ [0.3, H-0.3] at generation but the PLACEABLE hull
  // is y ∈ [0.8, H-0.8], so some pocket seeds sit where nothing can be planted
  // (recorded finding). Filter to seeds far enough inside that a whole cube
  // constellation fits around them, or a `hull` verdict would shadow the `seed`
  // one this section exists to check.
  const inner = P.seeds
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s[0] >= 8 && s[0] <= P.W - 8 && s[1] >= 6 && s[1] <= P.H - 6
      && s[2] >= 8 && s[2] <= P.D - 8);
  ok(inner.length >= 1, `at least one comfortably-interior pocket seed (got ${inner.length})`);

  const { s, i } = inner[0];
  const objects = level(roomy.c, FAR1.c, s);   // the SINK stands on the seed
  const v = pocketLevelVerdict(P, objects, EDGES);

  ok(v.placement[0].ok && v.placement[1].ok, 'the source and processor are untouched and still legal');
  ok(v.placement[2].ok === false, 'the sink is refused');
  ok(v.placement[2].reason === 'seed', `…for the pocket-seed reason (got "${v.placement[2].reason}")`);
  ok(v.placement[2].seedIndex === i, `…naming pocket seed ${i} (got ${v.placement[2].seedIndex})`);
  ok(v.placement[2].gap === 0, `…at gap exactly 0, the constellation centre standing on it (got ${v.placement[2].gap})`);
  ok(v.placement[2].summonSeed === 0 && v.placement[2].role === 'centre',
    '…and blaming the summon\'s own centre seed, index 0');
  ok(v.placement[2].seed[0] === s[0] && v.placement[2].seed[1] === s[1] && v.placement[2].seed[2] === s[2],
    'the refusal carries the pocket seed\'s coordinates');
  // `seedIndex` for a pocket blame indexes P.seeds directly — the whole point of
  // the base split. An implementation that reported the accumulated index would
  // pass every assertion above except this one.
  ok(v.placement[2].seedIndex < BASE, `…and it is a POCKET index, below the base ${BASE}`);

  // THE EDGES. Three outcomes are distinguishable and only one is correct:
  //   (1) sink kept and fed          → achieved.snk === 5   (a lie)
  //   (2) node dropped, edge kept    → feasible() THROWS on an unknown node
  //   (3) both dropped               → no achieved entry at all   ← correct
  ok(!('snk' in v.network.achieved), `the refused sink is ABSENT from achieved (${JSON.stringify(v.network.achieved)})`);
  ok(v.network.achieved.snk === undefined, '…and absent is not zero — the key does not exist');
  ok(throws(() => feasible({ nodes: [SRC, PROC], edges: EDGES })),
    'CONTROL: had the edge survived the drop, feasible() would have thrown');
  ok((messageOf(() => feasible({ nodes: [SRC, PROC], edges: EDGES })) || '').includes('unknown node'),
    '…naming the unknown node');

  // THE VACUOUS TRAP, asserted in full rather than inferred from `ok`. What
  // survives is src → proc with nothing consuming the gear: a network with NO
  // SINKS, which production.mjs documents as vacuously satisfiable at margin 0.
  // So the factory "passes" on a level whose depot is standing inside a rock,
  // and a caller reading the field that sounds like the answer would say so.
  ok(v.network.ok === true, 'the surviving network is VACUOUSLY satisfiable (no sinks left)');
  ok(v.network.margin === 0, `…with production.mjs's documented no-sink margin of 0 (got ${v.network.margin})`);
  ok(v.ok === false, 'and the VERDICT is still false — `ok` requires both halves, never network.ok alone');
}

// ======================================================= 3. CONTROL — the hull
console.log('\n3. CONTROL — one object moved outside the hull (refused, NOT clamped)');
{
  // Centre x = 2 puts the cube's −x neighbour at x = −1.2, and the placeable
  // hull starts at x = 1, so the violation is 2.2 m deep against wall B4. The
  // centre itself is legal (2 ≥ 1), which is what makes this a constellation
  // verdict rather than a point verdict.
  const OUT = [2, 18, 40];
  const objects = level(roomy.c, OUT, FAR1.c);   // the PROCESSOR pokes out
  const v = pocketLevelVerdict(P, objects, EDGES);

  ok(v.placement[1].ok === false, 'the processor is refused');
  ok(v.placement[1].reason === 'hull', `…for the hull reason (got "${v.placement[1].reason}")`);
  ok(v.placement[1].wall === 'B4', `…naming the −x wall B4 (got ${v.placement[1].wall})`);
  ok(v.placement[1].axis === 'x' && Math.abs(v.placement[1].depth - 2.2) < 1e-9,
    `…2.2 m deep on x (got ${v.placement[1].axis}/${v.placement[1].depth})`);
  ok(v.placement[1].role === 'neighbour' && v.placement[1].summonSeed >= 1,
    '…blaming a NEIGHBOUR seed, not the centre, which is inside');
  ok(v.placement[1].value < 1 && v.placement[1].limit === 1,
    `…and the offending coordinate really is below the limit (${v.placement[1].value} vs ${v.placement[1].limit})`);

  // THE DIVERGENCE. `reformPocket` would clamp this point to x = 1 and plant
  // somewhere else; a constellation whose seed moved is not the solid that was
  // verified. So `clamped` is REPORTED and not APPLIED, and the two differ —
  // an implementation that mirrored the kernel's clamp would report ok:true here.
  ok(Array.isArray(v.placement[1].clamped) && v.placement[1].clamped[0] === 1,
    `the clamp the kernel WOULD have applied is reported (${JSON.stringify(v.placement[1].clamped)})`);
  ok(v.placement[1].at[0] !== v.placement[1].clamped[0],
    'and it differs from the requested point — refused, not silently relocated');

  // A refused PROCESSOR drops BOTH its edges, so the sink survives with nothing
  // feeding it. This is the non-vacuous direction of section 2: the factory
  // genuinely degrades rather than passing on an empty network.
  ok(v.placement[0].ok && v.placement[2].ok, 'the source and sink are still legal');
  ok(v.network.ok === false, 'the surviving network is INFEASIBLE, not vacuous');
  ok(v.network.achieved.snk === 0, `the sink achieved exactly 0 (got ${v.network.achieved.snk})`);
  ok(Math.abs(v.network.margin - (-1)) < 1e-12, `margin matches the hand calc (0-4)/4 = -1 (got ${v.network.margin})`);
  ok(v.network.deficits.length === 1 && v.network.deficits[0].sinkId === 'snk'
    && v.network.deficits[0].resource === 'gear' && v.network.deficits[0].demand === 4
    && v.network.deficits[0].achieved === 0,
    `the deficit names the sink and the hand-computed numbers (${JSON.stringify(v.network.deficits)})`);
  ok(v.ok === false, 'and the verdict is false');
}

// ===================================== 4. THE HEADLINE — accumulation is REAL
console.log('\n4. two objects each legal against the STATIC pocket, colliding with each other');
{
  // Both centres come from the most open spot in the pocket, SHIFT = 1 m apart
  // on x. The arithmetic is exact enough to state in full: B is A translated by
  // (1, 0, 0), so every MATCHED pair of seeds is exactly 1 m apart with dy = 0
  // and no √aniso enters at all. Nothing beats it — the unmatched pairs differ
  // by 3.2 m on some axis and the closest of those is |3.2 − 1| = 2.2 m — so the
  // minimum is exactly 1.0 m, comfortably under the 1.5 threshold.
  const cA = roomy.c;
  const cB = NUDGE(roomy.c);
  const conA = cube(cA), conB = cube(cB);

  // ---- FIRST, prove the failure mode is REACHABLE. Without this the refusal
  // below could have come from a pocket seed and the section would be asserting
  // nothing about accumulation at all.
  ok(clearOf(conA) >= MIN_SEED_GAP, `A is clear of every pocket seed (${clearOf(conA).toFixed(2)} m)`);
  ok(clearOf(conB) >= MIN_SEED_GAP, `B is clear of every pocket seed too (${clearOf(conB).toFixed(2)} m)`);
  ok(legalSummon(P, conA).ok === true && legalSummon(P, conB).ok === true,
    'THE CHEAP IMPLEMENTATION WOULD SAY YES: both are legal against the static pocket');
  const measured = minGapLocal(conA, conB);
  ok(Math.abs(measured - SHIFT) < 1e-9, `…and yet they are only ${measured.toFixed(6)} m apart (hand calc: ${SHIFT})`);
  ok(measured < MIN_SEED_GAP, 'which is inside the seed gap — so the static answer is WRONG');

  // ---- NOW the accumulating one.
  const objects = [
    { id: 'src', con: conA, node: SRC },
    { id: 'proc', con: conB, node: PROC },
    { id: 'snk', con: cube(FAR1.c), node: SNK },
  ];
  const v = pocketLevelVerdict(P, objects, EDGES);

  ok(v.placement[0].ok === true, 'A (the source) is legal — nothing was placed before it');
  ok(v.placement[1].ok === false, 'B (the processor) IS REFUSED, though the static pocket allows it');
  ok(v.placement[1].reason === 'collides with existing summon',
    `…for level.mjs's own reason string (got "${v.placement[1].reason}")`);
  ok(v.placement[1].blockedBy === 'src', `…naming the earlier object (got ${v.placement[1].blockedBy})`);
  ok(v.placement[1].blame === 'step', '…blamed on a step seed, not a pocket seed');
  // Graded against the INDEPENDENT recomputation, not read back from pairGap.
  ok(Math.abs(v.placement[1].gap - measured) < 1e-12,
    `…and the reported gap is the independently computed ${measured} (got ${v.placement[1].gap})`);
  ok(v.placement[1].seedIndex >= BASE,
    `…with an ACCUMULATED seed index, at or above the base ${BASE} (got ${v.placement[1].seedIndex})`);
  ok(v.placement[1].blockers.length === 1 && v.placement[1].blockers[0].id === 'src',
    `blockers lists exactly the one earlier object hit (${JSON.stringify(v.placement[1].blockers)})`);

  // A REFUSED OBJECT COMMITS NOTHING. The sink is far away and legal, and its
  // seeds must start immediately after the source's — if B had been committed
  // they would start 7 higher. This is the cheapest discriminating assertion in
  // the file and it needs no geometry at all.
  ok(v.placement[2].ok === true, 'the far-away sink is still legal');
  ok(v.placement[2].seedIndices[0] === BASE + 7,
    `…and takes seed ${BASE + 7}, immediately after the source — the refused B committed nothing `
    + `(got ${v.placement[2].seedIndices[0]})`);

  // And the factory reshapes: both of the processor's edges go with it.
  ok(v.network.achieved.snk === 0, `the sink is starved, achieved 0 (got ${v.network.achieved.snk})`);
  ok(Math.abs(v.network.margin - (-1)) < 1e-12, `margin (0-4)/4 = -1 (got ${v.network.margin})`);
  ok(v.ok === false, 'the verdict is false');

  console.log('  CONTROL — move the processor to the far centre and the identical level passes');
  // ONE number set changes. Without this, every assertion above passes for an
  // implementation that refuses the second object unconditionally.
  const clear = pocketLevelVerdict(P, level(cA, FAR2.c, FAR1.c), EDGES);
  ok(clear.placement.every((p) => p.ok), 'CONTROL: all three are legal');
  ok(clear.ok === true, 'CONTROL: and the verdict is ok');
  ok(Math.abs(clear.network.achieved.snk - 5) < 1e-12,
    `CONTROL: the sink is fed the hand-computed 5 (got ${clear.network.achieved.snk})`);
}

// ============================================= 5. the vocabulary really bridges
console.log('\n5. the two vocabularies meet — level.mjs\'s words and placement.mjs\'s');
{
  // A self-colliding summon: solids.selftest pins an icosahedron at r=0.35 as
  // having its own seeds inside the 1.5 gap. It sits at the most open spot in
  // the pocket and its seeds span barely 1 m, so `hull` and `seed` are both out
  // of reach and only `self` can fire — which is what makes the reason string,
  // rather than the refusal, the thing under test.
  const tiny = constellation('icosahedron', { centre: roomy.c, r: 0.35, aniso: ANISO });
  const r1 = pocketPlacementReport(P, [{ id: 'tiny', con: tiny }]);
  ok(r1[0].ok === false && r1[0].reason === 'self-collision',
    `a self-colliding summon reports level.mjs's word 'self-collision' (got "${r1[0].reason}")`);
  ok(r1[0].blame === 'self', '…mapped from placement.mjs\'s blame \'self\'');
  ok(!('blockedBy' in r1[0]), '…and names no blocker, because there is nothing to blame');

  // A metric mismatch outranks everything: a constellation built for a different
  // aniso comes out rotated (solids.mjs's 22° trap) wherever you put it.
  const wrong = constellation('cube', { centre: roomy.c, r: R, aniso: 3.5 });
  const r2 = pocketPlacementReport(P, [{ id: 'wrong', con: wrong }]);
  ok(r2[0].ok === false && r2[0].reason === 'metric', `an aniso mismatch reports 'metric' (got "${r2[0].reason}")`);
  ok(r2[0].conAniso === 3.5 && r2[0].pocketAniso === ANISO, 'and carries both metrics');

  console.log('  CONTROL — the same shapes at legal parameters are accepted');
  const r3 = pocketPlacementReport(P, [{ id: 'fine', con: cube(roomy.c) }]);
  ok(r3[0].ok === true && r3[0].reason === null, 'CONTROL: an ordinary cube at the open spot is legal');

  console.log('  CONTROL — malformed input throws rather than refusing');
  ok(throws(() => pocketPlacementReport(P, [{ id: 'a', con: cube(roomy.c) }, { id: 'a', con: cube(FAR1.c) }])),
    'CONTROL: a duplicate object id throws');
  ok(throws(() => pocketPlacementReport(P, [{ id: '', con: cube(roomy.c) }])), 'CONTROL: an empty id throws');
  ok(throws(() => pocketPlacementReport(P, [{ id: 'a' }])), 'CONTROL: an object with no constellation throws');
  ok((messageOf(() => pocketLevelVerdict(P, [{ id: 'x', con: cube(roomy.c) }], [])) || '').includes('"x"'),
    'CONTROL: a legal object with no node throws, naming it');
  ok((messageOf(() => pocketLevelVerdict(
    P, [{ id: 'src', con: cube(roomy.c), node: SRC }], [{ from: 'src', to: 'typo' }],
  )) || '').includes('unknown node'),
    'CONTROL: an edge naming a non-object is NOT swallowed — feasible() still raises it');
}

// ============================== 6. THE FIELD LIST — an exact key set per reason
console.log('\n6. the exact key set of every record these two functions emit');
{
  // WHY EXACT SETS RATHER THAN PRESENCE CHECKS. A presence check can only find a
  // field you already expected to be there, so it can never find an
  // IRREGULARITY — a field on three shapes out of four. Nobody looks for
  // `nonFinite` on an entry, so nobody discovers it is missing. Putting the
  // shapes side by side is what makes the odd one out visible, and it is what
  // turned up the two findings at the foot of this section.
  //
  // NOTHING HERE ASSERTS A VALUE, except where a value decides WHICH shape is
  // under test (the two `blame` checks in the non-finite block, commented
  // there). A fixture retune must not fail a field-list check.
  const keysOf = (o) => Object.keys(o).sort();
  const kset = (o) => keysOf(o).join(',');
  /** Keys of `a` that `b` does not have. Sorted, so the result is stable. */
  const missingFrom = (a, b) => { const s = new Set(Object.keys(b)); return keysOf(a).filter((k) => !s.has(k)); };

  // ---- fixtures, one per reason. Each is a shape some earlier section already
  // proves routes the way it says: §5 for metric and self, §3 for hull, §2 for
  // the pocket seed, §4 for step. They are rebuilt here rather than shared so a
  // later edit to one section cannot silently change what this one measures.
  const CON_LEGAL = cube(roomy.c);
  const CON_METRIC = constellation('cube', { centre: roomy.c, r: R, aniso: 3.5 });
  const CON_HULL = cube([2, 18, 40]);
  const CON_SELF = constellation('icosahedron', { centre: roomy.c, r: 0.35, aniso: ANISO });
  const seedSpot = P.seeds
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s[0] >= 8 && s[0] <= P.W - 8 && s[1] >= 6 && s[1] <= P.H - 6
      && s[2] >= 8 && s[2] <= P.D - 8)[0];
  // Fall back to a legal centre rather than throwing: a missing fixture must
  // surface as the SENTINEL below naming the reason it could not produce, not as
  // a TypeError that kills every remaining assertion in the file.
  const CON_POCKET = seedSpot ? cube(seedSpot.s) : CON_LEGAL;

  // Keyed by the entry's OWN verdict, never by which fixture produced it — so a
  // fixture that routes somewhere unexpected reports itself as a missing reason
  // instead of as a confusing literal mismatch.
  const ENTRY = new Map();
  const record = (e) => {
    const k = e.ok ? 'legal' : (e.blame ?? 'refused');
    if (!ENTRY.has(k)) ENTRY.set(k, e);
  };
  for (const con of [CON_LEGAL, CON_METRIC, CON_HULL, CON_SELF, CON_POCKET]) {
    record(pocketPlacementReport(P, [{ id: 'a', con }])[0]);
  }
  record(pocketPlacementReport(P, [
    { id: 'a', con: cube(roomy.c) }, { id: 'b', con: cube(NUDGE(roomy.c)) },
  ])[1]);

  const SHAPE = {
    legal: 'first,id,ok,reason,refusals,seedIndices',
    metric: 'blame,blames,conAniso,first,id,ok,pocketAniso,reason,refusals',
    hull: 'at,axis,blame,blames,clamped,depth,first,id,limit,ok,reason,refusals,role,summonSeed,value,wall',
    self: 'blame,blames,first,gap,id,need,ok,otherSummonSeed,reason,refusals,summonSeed',
    pocket: 'blame,blames,first,gap,id,need,ok,reason,refusals,role,seed,seedIndex,summonSeed',
    step: 'blame,blames,blockedBy,blockers,first,gap,id,need,ok,reason,refusals,seedIndex,summonSeed',
  };
  for (const k of Object.keys(SHAPE)) {
    // THE SENTINEL, and it is a returned string rather than a throw on purpose:
    // one missing fixture must cost one named assertion, not the whole section.
    ok(ENTRY.has(k), `a fixture produced a "${k}" entry — without one, its shape below is unchecked`);
    const got = ENTRY.has(k) ? kset(ENTRY.get(k)) : `<NO FIXTURE PRODUCED "${k}">`;
    ok(got === SHAPE[k], `pocketPlacementReport "${k}" key set — want [${SHAPE[k]}] got [${got}]`);
  }

  // ---- level.mjs's own report, the session-local one this file's subject wraps.
  const LEV = new Map();
  const recordLev = (e) => LEV.set(e.ok ? 'legal' : e.reason, e);
  for (const e of placementReport([
    { id: 'a', con: cube(roomy.c) }, { id: 'b', con: cube(NUDGE(roomy.c)) },
  ])) recordLev(e);
  for (const e of placementReport([{ id: 't', con: CON_SELF }])) recordLev(e);

  const LEVEL_SHAPE = {
    legal: 'id,ok,reason',
    'self-collision': 'id,ok,reason',
    'collides with existing summon': 'blockedBy,gap,id,ok,reason',
  };
  for (const k of Object.keys(LEVEL_SHAPE)) {
    ok(LEV.has(k), `a fixture produced level.mjs's "${k}" entry`);
    const got = LEV.has(k) ? kset(LEV.get(k)) : `<NO FIXTURE PRODUCED "${k}">`;
    ok(got === LEVEL_SHAPE[k], `placementReport "${k}" key set — want [${LEVEL_SHAPE[k]}] got [${got}]`);
  }
  // A legal entry and a self-collision are INDISTINGUISHABLE BY SHAPE in
  // level.mjs — the same three fields, differing only in value. Asserted against
  // the two OBSERVED entries, never against the two literals above: comparing
  // `LEVEL_SHAPE.legal` to `LEVEL_SHAPE['self-collision']` compares two strings
  // I typed in the same object and cannot fail, whatever level.mjs does.
  ok(LEV.has('legal') && LEV.has('self-collision')
    && kset(LEV.get('legal')) === kset(LEV.get('self-collision')),
    'level.mjs tells a legal object from a self-colliding one by VALUE only, never by shape');

  // ---- THE COMPARISON, which is the whole reason both live in one section.
  // pocketLevel.mjs's docstring claims every entry carries "level.mjs's shape,
  // plus more". That is a checkable claim and nothing checked it.
  console.log('  the two reports compared — pocketLevel is a strict superset, per its own docstring');
  for (const [pk, lk] of [['legal', 'legal'], ['self', 'self-collision'],
    ['step', 'collides with existing summon']]) {
    if (!ENTRY.has(pk) || !LEV.has(lk)) { ok(false, `the superset check needs both "${pk}" and "${lk}"`); continue; }
    const extra = missingFrom(LEV.get(lk), ENTRY.get(pk));
    ok(extra.length === 0,
      `pocketLevel's "${pk}" entry carries every field level.mjs's "${lk}" does (missing: ${extra.join(',') || 'nothing'})`);
    // …and STRICTLY more, or "plus more" is a restatement rather than a claim.
    ok(keysOf(ENTRY.get(pk)).length > keysOf(LEV.get(lk)).length,
      `…and strictly more of them (${keysOf(ENTRY.get(pk)).length} vs ${keysOf(LEV.get(lk)).length})`);
  }

  // ---- FINDING 1: the entry silently drops `nonFinite`.
  // A point with a NaN coordinate refuses for `hull` — but the reason a UI needs
  // is not "2.2 m outside the west wall", it is "this position is not a number",
  // which is a bug in the caller rather than a move the player made.
  // `summon-session.mjs` treats exactly that distinction as blame:'caller'.
  // `hullViolation` flags it with `nonFinite: true`; `classify` copies nine named
  // fields and that is not one of them.
  console.log('  a non-finite coordinate — the entry cannot tell it from an ordinary wall');
  {
    const nanCon = { ...CON_LEGAL, seeds: CON_LEGAL.seeds.map((s) => [NaN, s[1], s[2]]) };
    const nanEntry = pocketPlacementReport(P, [{ id: 'a', con: nanCon }])[0];
    // The only two VALUE assertions in this section. They decide WHICH shape is
    // under test; without them the comparison below is between two unknowns.
    ok(nanEntry.ok === false, 'a constellation with a non-finite coordinate is refused');
    ok(nanEntry.blame === 'hull', '…and blamed on the hull, so it is comparable with the ordinary case');

    ok(kset(nanEntry) === SHAPE.hull,
      `…with the SAME entry key set as an ordinary out-of-hull refusal (got [${kset(nanEntry)}])`);
    // KNOWN GAP, pinned deliberately rather than logged. A key-set gate exists
    // precisely so that changing a field list is a decision somebody makes on
    // purpose — so if you are here because you just taught `classify` to carry
    // `nonFinite`, that is the right fix: flip this to `in` and add the field to
    // SHAPE.hull. A log would have gone stale silently; this says what to do.
    ok(!('nonFinite' in nanEntry),
      'KNOWN GAP: the entry does NOT carry `nonFinite` — the flag is dropped on the way out');

    if (ENTRY.has('hull')) {
      const finiteInner = ENTRY.get('hull').first;
      const nanInner = nanEntry.first;
      const gained = missingFrom(nanInner, finiteInner);
      ok(gained.join(',') === 'nonFinite',
        `the INNER refusal does carry it, and it is the only difference (got [${gained.join(',') || 'nothing'}])`);
      ok(missingFrom(finiteInner, nanInner).length === 0,
        '…and the finite inner refusal has no field the non-finite one lacks — the difference is one-directional');
    }
  }

  // ---- FINDING 2: two names for one thing, one field apart.
  // The entry says `blockedBy`; the refusal inside it says `blockedByNode`. Both
  // are the id of the earlier object whose seed was hit. This is the same shape
  // the ledger already records for preview's `first` versus place's `refusal`,
  // and it fails the same way: a renderer that walks `refusals` and reaches for
  // `blockedBy` gets undefined, silently, with every word around it intact.
  if (ENTRY.has('step')) {
    const e = ENTRY.get('step');
    ok('blockedBy' in e && !('blockedByNode' in e), 'the step ENTRY names the blocker `blockedBy`, and only that');
    const inner = e.refusals.find((r) => r.blame === 'step');
    ok(!!inner, 'the step entry carries at least one step-blamed refusal to inspect');
    ok(!!inner && 'blockedByNode' in inner && !('blockedBy' in inner),
      '…and the refusal inside it names the same thing `blockedByNode` — two names, one field apart');
    ok(Array.isArray(e.blockers) && e.blockers.length > 0
      && kset(e.blockers[0]) === 'gap,id,need,seedIndex,summonSeed',
      `a blockers[] entry key set (got [${Array.isArray(e.blockers) && e.blockers[0] ? kset(e.blockers[0]) : 'none'}])`);
  }

  // ---- THE UNREACHABLE SHAPE, asserted by CONSTRUCTION rather than skipped.
  // `classify` falls through to `reason: 'refused'` with NO detail fields at all
  // when a blame is not in BLAME_PRECEDENCE. No fixture can produce it, and it is
  // unreachable BY CONSTRUCTION: the blames `classify` mints are exactly
  // REASON_OF's keys. So assert the construction — that is a real check, and it
  // goes red the day somebody adds a reason to one list and not the other.
  console.log('  the fallback shape is unreachable BY CONSTRUCTION — so the construction is what is asserted');
  ok(Object.keys(REASON_OF).sort().join(',') === [...BLAME_PRECEDENCE].sort().join(','),
    'REASON_OF and BLAME_PRECEDENCE name the same blames — diverge and classify() emits reason "refused" with no detail at all');
  ok([...ENTRY.keys()].every((k) => k === 'legal' || BLAME_PRECEDENCE.includes(k)),
    `every blame any fixture produced is in BLAME_PRECEDENCE (saw ${[...ENTRY.keys()].join(',')})`);
  ok(!ENTRY.has('refused'), 'and no fixture reached the fallback shape');

  // ---- THE COMPARATOR, in BOTH directions. An added-key control alone does not
  // rule out a comparator that is over-sensitive, and one that fails correct work
  // is worse than no comparator. A spread copy MUST compare equal.
  console.log('  CONTROL — the comparator sees a real difference and does not invent one');
  {
    const sample = ENTRY.get('pocket') ?? ENTRY.get('legal');
    ok(kset({ ...sample }) === kset(sample),
      'CONTROL: a spread COPY compares EQUAL — the comparator is about fields, not object identity');
    ok(kset({ ...sample, probeKey: 1 }) !== kset(sample), 'CONTROL: one ADDED key compares unequal');
    const fewer = { ...sample };
    delete fewer.reason;
    ok(kset(fewer) !== kset(sample), 'CONTROL: one REMOVED key compares unequal — it bites in both directions');
  }
}

// ============================ 7. WHAT THE VERDICT STOPPED JUDGING — `dropped`
console.log('\n7. `dropped` — the verdict says what it left out, and names the vacuous trap');
{
  // WHY THIS SECTION IS SHAPED LIKE THIS. `dropped.vacuous` is one boolean, and
  // a boolean is the easiest thing in the world to assert vacuously: a section
  // that only ever showed a level with nothing dropped would pass for
  // `vacuous: false` hardcoded, and one that only ever showed the trap would pass
  // for `vacuous = network.ok`. So there are FOUR fixtures and each rules out a
  // different wrong implementation:
  //
  //   (a) nothing dropped, network passes   → vacuous FALSE   kills `= network.ok`
  //   (b) the SINK dropped, network passes   → vacuous TRUE    kills `= false`
  //   (c) a PROCESSOR dropped, network fails → vacuous FALSE   the mirror
  //   (d) a SOURCE dropped, network PASSES   → vacuous FALSE   kills
  //                                                            `= ids.length > 0`
  //
  // (d) is the one that carries the ticket's actual distinction — "you failed to
  // place a spare processor" versus "you failed to place the thing being fed" —
  // and without it (b) and (c) together are satisfied by "something was dropped
  // and the network passed", which is a different and wrong predicate.
  const KIND_KEYS = 'processor,sink,source';
  const kindKeys = (d) => Object.keys(d.kinds).sort().join(',');
  const kindSum = (d) => d.kinds.source + d.kinds.processor + d.kinds.sink;

  console.log('  (a) nothing refused — `dropped` is empty and the passing network is NOT vacuous');
  {
    const v = pocketLevelVerdict(P, level(roomy.c, FAR1.c, FAR2.c), EDGES);
    ok(v.network.ok === true && v.ok === true, 'the §1 level still passes both halves');
    ok(Array.isArray(v.dropped.ids) && v.dropped.ids.length === 0,
      `nothing was dropped (got ${JSON.stringify(v.dropped.ids)})`);
    ok(kindKeys(v.dropped) === KIND_KEYS,
      `the kind breakdown carries exactly the three node kinds (got [${kindKeys(v.dropped)}])`);
    ok(kindSum(v.dropped) === 0, `…all zero (got ${JSON.stringify(v.dropped.kinds)})`);
    ok(Array.isArray(v.dropped.edges) && v.dropped.edges.length === 0, 'and no edge went with them');
    // §6's discipline applied to the VERDICT rather than to a report entry. A
    // presence check cannot find a field that is missing from one shape out of
    // several; here it cannot find a field that was quietly added or renamed
    // either, and every caller of this module reads these four names.
    ok(Object.keys(v).sort().join(',') === 'dropped,network,ok,placement',
      `the verdict's exact key set (got [${Object.keys(v).sort().join(',')}])`);
    ok(Object.keys(v.dropped).sort().join(',') === 'edges,ids,kinds,vacuous',
      `and dropped's own (got [${Object.keys(v.dropped).sort().join(',')}])`);
    // THE DISCRIMINATOR against `vacuous = network.ok`: the network is ok here.
    ok(v.dropped.vacuous === false,
      'vacuous is FALSE on a level that passes — so it is not a copy of network.ok');
  }

  console.log('  (b) THE DEFECT — the SINK is refused, the network reports ok, and vacuous says so');
  {
    // §2's fixture, rebuilt here so an edit to that section cannot silently
    // change what this one measures. The sink stands on a pocket seed.
    const seedSpot = P.seeds
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s[0] >= 8 && s[0] <= P.W - 8 && s[1] >= 6 && s[1] <= P.H - 6
        && s[2] >= 8 && s[2] <= P.D - 8)[0];
    // A returned sentinel rather than a throw: a missing fixture must cost one
    // named assertion, not every assertion after it.
    ok(!!seedSpot, 'fixture: a comfortably-interior pocket seed to stand the sink on');
    if (seedSpot) {
      const v = pocketLevelVerdict(P, level(roomy.c, FAR1.c, seedSpot.s), EDGES);
      ok(v.placement[2].ok === false, 'the sink is refused');
      ok(v.placement[0].ok && v.placement[1].ok, '…and the source and processor are not');

      // EXHIBIT THE DEFECT, not just the repair. Without these two the `vacuous`
      // assertion below is a claim about a situation nobody has shown exists.
      ok(v.network.ok === true,
        'THE DEFECT: the surviving network reports ok — every sink it has is fed, because it has none');
      ok(v.network.margin === 0, `…at production.mjs's documented no-sink margin 0 (got ${v.network.margin})`);
      ok(!('snk' in v.network.achieved), '…and the refused sink is absent from achieved entirely');

      ok(v.dropped.ids.join(',') === 'snk', `dropped.ids names the sink (got ${JSON.stringify(v.dropped.ids)})`);
      ok(v.dropped.kinds.sink === 1 && v.dropped.kinds.source === 0 && v.dropped.kinds.processor === 0,
        `…and the KIND breakdown says a sink went, not a spare (got ${JSON.stringify(v.dropped.kinds)})`);
      // `?? {}` so a wrong count fails with the named assertion above rather
      // than with a TypeError that kills every assertion after it.
      const e0 = v.dropped.edges[0] ?? {};
      ok(v.dropped.edges.length === 1 && e0.from === 'proc' && e0.to === 'snk',
        `the one edge naming it went too (got ${JSON.stringify(v.dropped.edges)})`);
      ok(Object.keys(e0).sort().join(',') === 'from,to',
        `a dropped edge is IDENTITY ONLY — its endpoints do not exist, so it is not a network `
        + `fragment (got [${Object.keys(e0).sort().join(',')}])`);

      // THE ASSERTION THE TICKET IS FOR.
      ok(v.dropped.vacuous === true,
        'VACUOUS: the network passed and a sink is missing from it — a renderer must not say "everything is fed"');
      ok(v.ok === false, 'and the verdict itself is still false, as it always was — `ok` was never the gap');
    }
  }

  console.log('  (c) THE MIRROR — a PROCESSOR is refused, the network legitimately fails, vacuous is false');
  {
    // §3's fixture: centre x = 2 puts the cube's −x neighbour outside the hull.
    const v = pocketLevelVerdict(P, level(roomy.c, [2, 18, 40], FAR1.c), EDGES);
    ok(v.placement[1].ok === false && v.placement[1].reason === 'hull', 'the processor is refused for the hull');
    ok(v.network.ok === false, 'the surviving network genuinely fails — the sink is still there and starved');
    ok(v.dropped.ids.join(',') === 'proc', `dropped.ids names the processor (got ${JSON.stringify(v.dropped.ids)})`);
    ok(v.dropped.kinds.processor === 1 && v.dropped.kinds.sink === 0,
      `…and no sink was dropped (got ${JSON.stringify(v.dropped.kinds)})`);
    ok(v.dropped.edges.length === 2, `BOTH edges named it and both went (got ${JSON.stringify(v.dropped.edges)})`);
    ok(v.dropped.vacuous === false, 'vacuous is false — the network failed on its own merits');
  }

  console.log('  (d) THE DISCRIMINATOR — a SOURCE is refused, the network still passes, and it is STILL not vacuous');
  {
    // Two spare objects nobody wired up. Both are self-colliding icosahedra
    // (solids.selftest pins r=0.35 as having its own seeds inside the 1.5 gap),
    // so both are refused wherever they stand and neither disturbs the three
    // wired objects — a refused object commits nothing, which §4 already proves.
    const tiny = () => constellation('icosahedron', { centre: roomy.c, r: 0.35, aniso: ANISO });
    const objects = [
      ...level(roomy.c, FAR1.c, FAR2.c),
      { id: 'spare', con: tiny(), node: { kind: 'source', id: 'spare', resource: 'coal', rate: 1 } },
      { id: 'ghost', con: tiny() },   // deliberately NO node — see below
    ];
    const v = pocketLevelVerdict(P, objects, EDGES);

    ok(v.placement[3].ok === false && v.placement[4].ok === false, 'both spares are refused');
    ok(v.placement[0].ok && v.placement[1].ok && v.placement[2].ok, 'and the three wired objects are untouched');
    ok(v.network.ok === true && Math.abs(v.network.achieved.snk - 5) < 1e-12,
      `so the factory still passes with the §1 numbers (got ${v.network.achieved.snk})`);

    ok(v.dropped.ids.join(',') === 'spare,ghost',
      `dropped.ids is in OBJECT order (got ${JSON.stringify(v.dropped.ids)})`);
    ok(v.dropped.edges.length === 0, 'no edge named either of them, so none was dropped');
    // THE ASSERTION THIS FIXTURE EXISTS FOR. Something was dropped AND the
    // network passed, and it is still not vacuous — so `vacuous` is about SINKS
    // and not about droppedness. (b) and (c) alone cannot say this.
    ok(v.dropped.vacuous === false,
      'DISCRIMINATOR: a dropped SOURCE with a passing network is NOT vacuous — losing a spare is not losing the depot');
    ok(v.ok === false, 'the verdict is still false, because a placement failed');

    // A refused object need not carry a node at all — `networkFrom` demands one
    // only of LEGAL objects, deliberately, so a merely-losing level is not
    // refused for a missing field. `ghost` is therefore in `ids` and in no kind
    // bucket, and the sum is UNDER the count. That is documented, not a bug, and
    // it is the one case where "how many sinks did I lose" is unanswerable.
    ok(v.dropped.kinds.source === 1 && v.dropped.kinds.processor === 0 && v.dropped.kinds.sink === 0,
      `only the one with a node is counted (got ${JSON.stringify(v.dropped.kinds)})`);
    ok(v.dropped.ids.length === 2 && kindSum(v.dropped) === 1,
      `…so ids (${v.dropped.ids.length}) exceeds the kind total (${kindSum(v.dropped)}) — a nodeless refusal has no kind`);
  }
}

// ================================================================ determinism
console.log('\ndeterminism');
{
  const objects = level(roomy.c, FAR1.c, FAR2.c);
  ok(JSON.stringify(pocketPlacementReport(P, objects)) === JSON.stringify(pocketPlacementReport(P, objects)),
    'two pocketPlacementReport() calls are byte-identical');
  ok(JSON.stringify(pocketLevelVerdict(P, objects, EDGES)) === JSON.stringify(pocketLevelVerdict(P, objects, EDGES)),
    'two pocketLevelVerdict() calls are byte-identical');

  // Without this, every determinism assertion above passes for a comparator
  // stuck on "equal" — the same control multi-insert.selftest.mjs puts on its
  // deep comparator.
  console.log('  CONTROL — a genuinely different level must NOT stringify the same');
  const moved = level(roomy.c, NUDGE(roomy.c), FAR1.c);
  ok(JSON.stringify(pocketLevelVerdict(P, objects, EDGES)) !== JSON.stringify(pocketLevelVerdict(P, moved, EDGES)),
    'CONTROL: colliding the processor changes the serialized verdict');
}

console.log('');
console.log(failures === 0
  ? `✓ pocket-level selftest — ${checks} checks pass (pocket seed 2, ${BASE} seeds, aniso ${ANISO})`
  : `✗ pocket-level selftest — ${failures}/${checks} FAILED`);
process.exit(failures === 0 ? 0 : 1);
