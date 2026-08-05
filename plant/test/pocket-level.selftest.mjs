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
import { pocketPlacementReport, pocketLevelVerdict } from '../pocketLevel.mjs';

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
