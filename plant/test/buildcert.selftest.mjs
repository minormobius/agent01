// plant/test/buildcert.selftest.mjs — gate 6, the build certificate.
//
// Run: node plant/test/buildcert.selftest.mjs
//
// ----------------------------------------------------------- what is proven --
//
// 1. AGREEMENT WITH THE KERNEL. A certificate is a *plan*, and a plan nobody
//    executed is an opinion. So section 1 certifies a two-node chain into a real
//    `generatePocket` and then BUILDS it — every seed, in the certified order,
//    through `reformPocket` — asserting each insert lands at the point the
//    certificate named AND at the seed index it predicted. Same oracle as
//    `placement.selftest.mjs`: "did the foam plant this exact point", not
//    "did it return non-null", because `reformPocket` clamps rather than
//    refusing and "succeeded" and "planted what you asked for" are different
//    questions.
//
// 2. THE TWO ORACLES ARE INDEPENDENT, in both directions. A layout that is
//    `feasible()`-ok and not buildable, and a network that is buildable and not
//    feasible. Neither implies the other, and one example each way is what shows
//    that rather than asserts it.
//
// 3. THE REORDERABLE / UNFIXABLE DISTINCTION, which is the whole content of the
//    certificate. Section 3 exhibits the same node failing under one order and
//    succeeding under another — and the dependency case where no order can help.
//
// 4. THE SUGGESTION IS EXECUTED, NOT ARGUED. Section 3b builds the fixture that
//    breaks the old argument: a step blocked ONLY by a non-ancestor earlier
//    step — precisely the shape that used to return `reorderable: true` — whose
//    constructed order is refused anyway, because a node that originally came
//    LATER is scheduled ahead of it there and takes the space. `blockedBy` could
//    never have named that node: it was not in the pocket state the step was
//    judged against. The CONTROL is the same network, same layout, same blocker,
//    same gap, with that one late node DELETED — and it comes back `verified`.
//    One node's existence is the only difference between the two runs.
//
// ---------------------------------- a deviation from the ticket, stated up front
//
// The ticket asks for "a layout that fails in one order and succeeds in
// another". For the BUILD AS A WHOLE that is impossible, and it is a theorem
// rather than a limitation: the constraint set is "every pair of seeds is at
// least `minSeedGap` apart and every seed is inside the hull", pairwise gap is
// symmetric and the hull does not move, so buildability is a property of the SET
// of seeds and not of the sequence. Section 3 therefore does something strictly
// stronger than assert one lucky pair of orders: it enumerates EVERY topological
// order and asserts the verdict — and the minimum clearance — is identical
// across all of them, while the *step* that fails moves. The per-step version of
// the ticket's request is exhibited exactly: node "b" is refused under the
// default order and certified under the suggested one.

import { generatePocket, reformPocket } from '../foamworld.js';
import { constellation, seedGap, pairGap } from '../solids.mjs';
import { feasible, buildOrder } from '../production.mjs';
import { certify, topoOrders, orderPreferring, BLAME_PRECEDENCE } from '../buildcert.mjs';

let checks = 0, failures = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('  ✗ ' + msg); }
}
function throws(fn, re, msg) {
  checks++;
  try { fn(); } catch (e) { if (re.test(e.message)) return; failures++; console.error(`  ✗ ${msg} (threw "${e.message}")`); return; }
  failures++; console.error(`  ✗ ${msg} (did not throw)`);
}

// The macro fixture — few big rooms. `foamworld.selftest.mjs` and
// `placement.selftest.mjs` both use exactly these opts and this seed, which is
// what keeps section 1's real inserts cheap and its fixture facts free.
const MACRO = { nx: 4, nz: 4, layers: 3, subLayers: 1, cell: 20, layerH: 9, parMin: 3, parTarget: 6 };
const P = generatePocket({ seed: 2, ...MACRO });
const ANISO = P.opts.aniso;

ok(P.W === 80 && P.H === 36 && P.D === 80, `fixture: 80×36×80 pocket (got ${P.W}×${P.H}×${P.D})`);
ok(P.seeds.length === 64, `fixture: 64 seeds (got ${P.seeds.length})`);
ok(ANISO === 2.2, `fixture: aniso 2.2 (got ${ANISO})`);

// A seedless stub with the same box and metric. `certify` reads exactly W/H/D,
// `seeds`, `faces` and `opts`, so this is the same question asked of an empty
// world — and in it `hull`, `self` and `metric` refusals cannot be shadowed by a
// pocket seed, which is what makes section 4's taxonomy assertions exact.
const EMPTY = { W: 80, H: 36, D: 80, seeds: [], faces: [], opts: { aniso: ANISO } };

const con = (solid, centre, r = 1.6, aniso = ANISO) => constellation(solid, { centre, r, aniso });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Is every seed of `c` at least `need` anisotropic metres from every seed of
 *  `pocket`? A stricter filter than legality (1.5) on purpose — section 3
 *  perturbs nothing, but a marginal centre would make an existence claim depend
 *  on a rounding difference. */
function clearOf(pocket, c, need) {
  for (const s of pocket.seeds) {
    for (const t of c.seeds) if (seedGap(s, t, pocket.opts.aniso) < need) return false;
  }
  return true;
}

// ------------------------------------------------- deterministic candidates --
// A fixed lattice, comfortably inside the hull for both solids used below
// (cube extent 3.2, tetrahedron extent ≈3.36 at r=1.6, aniso 2.2), filtered to
// centres where BOTH solids clear every pocket seed by 2.8m, then thinned so no
// two chosen centres are within 14m — far enough that two constellations placed
// on them cannot interact (14 − 3.36 − 3.36 = 7.3m of slack).
const CLEAR = [];
for (let x = 10; x <= 70; x += 6) {
  for (let z = 10; z <= 70; z += 6) {
    for (const y of [11, 16, 21, 26]) {
      const c = [x, y, z];
      if (clearOf(P, con('tetrahedron', c), 2.8) && clearOf(P, con('cube', c), 2.8)) CLEAR.push(c);
    }
  }
}
const SPREAD = [];
for (const c of CLEAR) {
  if (SPREAD.every((o) => dist(o, c) >= 14)) SPREAD.push(c);
  if (SPREAD.length === 6) break;
}
ok(CLEAR.length > 20, `sweep: buildable space exists for both solids (${CLEAR.length} centres)`);
ok(CLEAR.length < 484, `sweep: …and it is not everywhere — some centres are too near a pocket seed (${484 - CLEAR.length} rejected)`);
ok(SPREAD.length >= 4, `sweep: at least 4 mutually-clear centres (${SPREAD.length})`);

// ------------------------------------------------------------- 1. the chain --
// Requirement (a): certify a two-node chain and verify it against the kernel.
const CHAIN = {
  nodes: [
    { id: 'ore', kind: 'source', resource: 'ore', rate: 60 },
    { id: 'depot', kind: 'sink', resource: 'ore', demand: 50 },
  ],
  edges: [{ from: 'ore', to: 'depot' }],
};
const layoutAt = (a, b) => ({
  ore: { solid: 'tetrahedron', centre: a, r: 1.6 },
  depot: { solid: 'cube', centre: b, r: 1.6 },
});

ok(JSON.stringify(buildOrder(CHAIN)) === '["ore","depot"]', `chain: buildOrder is ore→depot (got ${JSON.stringify(buildOrder(CHAIN))})`);
ok(feasible(CHAIN).ok && Math.abs(feasible(CHAIN).margin - 0.2) < 1e-12,
   `chain: the network is satisfiable with margin 0.2 (got ${feasible(CHAIN).margin})`);

{
  const cert = certify(P, CHAIN, layoutAt(SPREAD[0], SPREAD[1]));
  ok(cert.ok, `certify: the chain is buildable at [${SPREAD[0]}] / [${SPREAD[1]}] (${cert.ok ? '' : cert.failure.why})`);
  ok(JSON.stringify(cert.order) === '["ore","depot"]', 'certify: it used buildOrder, unchanged');
  ok(cert.steps.length === 2, `certify: two steps (got ${cert.steps.length})`);
  // 5 seeds for a tetrahedron (centre + 4), 7 for a cube (centre + 6)
  ok(cert.plan.length === 12, `certify: the plan is 5 + 7 = 12 seeds (got ${cert.plan.length})`);
  ok(cert.steps[0].seedIndices.length === 5 && cert.steps[1].seedIndices.length === 7,
     'certify: the per-step seed counts match the solids');
  ok(cert.plan.every((s, i) => s.seedIndex === P.seeds.length + i),
     'certify: the plan predicts consecutive seed indices from the pocket\'s current end');
  ok(cert.plan[0].node === 'ore' && cert.plan[0].summonSeed === 0,
     'certify: the first planned seed is the first step\'s centre');
  ok(cert.margin > 0 && Math.abs(cert.clearance - (cert.margin + 1.5)) < 1e-12,
     `certify: the certificate reports real headroom (clearance ${cert.clearance.toFixed(3)}m, margin ${cert.margin.toFixed(3)}m)`);
  ok(cert.steps.every((s) => s.margin > 0), 'certify: every step has positive margin');
  // step 1 measured against step 0 by pairGap — the check a single summon never needs
  ok(cert.steps[0].pairGaps.length === 0 && cert.steps[1].pairGaps.length === 1
     && cert.steps[1].pairGaps[0].node === 'ore',
     'certify: the second step reports its pairGap against the first, and the first has nothing to compare to');
  ok(Math.abs(cert.steps[1].pairGaps[0].gap - pairGap(con('cube', SPREAD[1]), con('tetrahedron', SPREAD[0]))) < 1e-12,
     'certify: …and that number is solids.mjs\'s pairGap, not a private re-derivation');

  // THE HEADLINE NUMBER, pinned against an independent derivation. Every
  // assertion above checks `clearance`/`margin` only for SELF-consistency —
  // positive, and `margin === clearance − 1.5` — which is true of whatever
  // number the walk cares to return. A `nearest` that took the max, or that
  // measured against the pocket alone and forgot the seeds the earlier steps
  // just committed, passes all of them. So recompute it here from `solids.mjs`
  // primitives only:
  //
  //   step 0 — against the 64 pocket seeds.
  //   step 1 — against the pocket seeds AND the 5 seeds step 0 committed, which
  //            is the entire point of certifying against the pocket "as it will
  //            be" rather than as it is. Get that wrong and the certificate is
  //            `legalSummon` in a loop, which is the thing this file exists to
  //            not be.
  const conOre = con('tetrahedron', SPREAD[0]);
  const conDepot = con('cube', SPREAD[1]);
  const toPocket = (c) => {
    let m = Infinity;
    for (const s of P.seeds) for (const t of c.seeds) m = Math.min(m, seedGap(s, t, ANISO));
    return m;
  };
  const want0 = toPocket(conOre);
  const want1 = Math.min(toPocket(conDepot), pairGap(conDepot, conOre));
  ok(Math.abs(cert.steps[0].clearance - want0) < 1e-12,
     `clearance: step 0 is measured against the pocket (want ${want0.toFixed(4)}, got ${cert.steps[0].clearance.toFixed(4)})`);
  ok(Math.abs(cert.steps[1].clearance - want1) < 1e-12,
     `clearance: step 1 is measured against the pocket AND step 0 (want ${want1.toFixed(4)}, got ${cert.steps[1].clearance.toFixed(4)})`);
  ok(Math.abs(cert.clearance - Math.min(want0, want1)) < 1e-12,
     'clearance: the certificate\'s headline number is the tightest step');
  ok(Math.abs(cert.steps[1].margin - (want1 - 1.5)) < 1e-12,
     'clearance: …and margin really is that clearance minus the 1.5m refusal radius');

  // The owner bookkeeping, which nothing else in this file reads. A `nearest`
  // pointing into the pocket must report owner `null`; one pointing at a
  // planted seed must name the node that planted it. The whole failure taxonomy
  // ('pocket' — unfixable, vs 'step' — possibly reorderable) is built on that
  // distinction, so an off-by-one in `owners` would silently reclassify every
  // refusal in section 3.
  for (const s of cert.steps) {
    ok(s.nearest.owner === (s.nearest.seedIndex < P.seeds.length ? null : 'ore'),
       `clearance: step ${s.step}'s nearest seed is attributed correctly (index ${s.nearest.seedIndex}, owner ${JSON.stringify(s.nearest.owner)})`);
  }
}

// -- and now BUILD it. An EXISTENCE claim over up to three layouts, deliberately:
// `reformPocket` also refuses on closure and on a target chamber losing its
// floor, and neither is decidable in advance, so one refusing layout would be
// evidence about voronoi stitching rather than about the certificate. Same
// reasoning `placement.selftest.mjs` gives for the same fixture.
{
  const pairs = [];
  for (let i = 0; i + 1 < SPREAD.length; i += 2) pairs.push([SPREAD[i], SPREAD[i + 1]]);
  ok(pairs.length >= 2, `build: at least two candidate layouts to try (${pairs.length})`);

  let built = null, tried = 0, indexAgreed = true, pointAgreed = true;
  for (const [a, b] of pairs) {
    const cert = certify(P, CHAIN, layoutAt(a, b));
    if (!cert.ok) continue;
    tried++;
    let q = P, fine = true;
    for (const s of cert.plan) {
      if (q.seeds.length !== s.seedIndex) { indexAgreed = false; fine = false; break; }
      const nq = reformPocket(q, s.point);
      if (!nq) { fine = false; break; }
      const landed = nq.seeds[nq.seeds.length - 1];
      if (!(landed[0] === s.point[0] && landed[1] === s.point[1] && landed[2] === s.point[2])) {
        pointAgreed = false; fine = false; break;      // clamped and relocated — not what was certified
      }
      q = nq;
    }
    if (fine) { built = { cert, q }; break; }
  }
  ok(built !== null, `build: a certified layout really plants, seed by seed, in the certified order (tried ${tried})`);
  ok(indexAgreed, 'build: every insert landed at the seed index the certificate predicted');
  ok(pointAgreed, 'build: no insert was clamped to a different position than the certificate named');
  if (built) {
    ok(built.q.seeds.length === P.seeds.length + 12,
       `build: the finished pocket carries 12 more seeds (got ${built.q.seeds.length - P.seeds.length})`);
    // the certificate's own prediction, read back off the real pocket
    ok(built.cert.plan.every((s) => {
      const got = built.q.seeds[s.seedIndex];
      return got[0] === s.point[0] && got[1] === s.point[1] && got[2] === s.point[2];
    }), 'build: every planned seed is at its planned index in the finished pocket');
    // and the pocket is genuinely different — the build was not a no-op
    ok(built.q.cells.length !== P.cells.length || built.q.faces.length !== P.faces.length,
       'build: the lattice really reformed around the factory');
    // CONTROL: the same certificate re-run against the FINISHED pocket must now
    // refuse — its own seeds are in the way. Without this, "it plants" would
    // pass for a certificate that never looked at the pocket at all.
    const again = certify(built.q, CHAIN, layoutAt(built.cert.steps[0].centre, built.cert.steps[1].centre));
    ok(!again.ok && again.failure.blame === 'pocket' && again.failure.step === 0,
       `control: re-certifying the same layout into the built pocket is refused on a pocket seed (got ${again.ok ? 'ok' : again.failure.blame})`);
  }
}

// ------------------------------------------- 2. the two oracles are independent
// Requirement (b), and its converse — one example each way.
{
  // feasible-ok, NOT buildable: both summons on the same centre.
  const stacked = certify(P, CHAIN, layoutAt(SPREAD[0], SPREAD[0]));
  ok(feasible(CHAIN).ok, 'independence: the chain is satisfiable…');
  ok(!stacked.ok, 'independence: …and stacking both machines on one spot is not buildable');
  ok(stacked.failure.node === 'depot' && stacked.failure.step === 1,
     `independence: the refusal names the second step (got step ${stacked.failure.step} "${stacked.failure.node}")`);
  ok(stacked.failure.blame === 'step' && stacked.failure.blockedBy.length === 1
     && stacked.failure.blockedBy[0].node === 'ore' && stacked.failure.blockedBy[0].gap === 0,
     'independence: it names "ore" as what it hit, at gap 0 — the two centres coincide');
  ok(stacked.steps.length === 1 && stacked.plan.length === 5,
     `independence: the certified prefix is exactly the first step (got ${stacked.steps.length} steps, ${stacked.plan.length} seeds)`);

  // buildable, NOT feasible: the same geometry, a starved network.
  const STARVED = {
    nodes: [
      { id: 'ore', kind: 'source', resource: 'ore', rate: 10 },
      { id: 'depot', kind: 'sink', resource: 'ore', demand: 50 },
    ],
    edges: [{ from: 'ore', to: 'depot' }],
  };
  const f = feasible(STARVED);
  ok(!f.ok && Math.abs(f.margin + 0.8) < 1e-12, `independence: the starved network is infeasible, margin −0.8 (got ${f.margin})`);
  ok(certify(P, STARVED, layoutAt(SPREAD[0], SPREAD[1])).ok,
     'independence: …and it is perfectly buildable — geometry does not care about rates');
}

// ------------------------------------ 3. reorderable vs. unfixable, and order --
// Two independent chains: nothing in the network relates "a" to "b", so an
// order that builds either one first is legal.
const TWIN = {
  nodes: [
    { id: 'a', kind: 'source', resource: 'ore', rate: 60 },
    { id: 'sa', kind: 'sink', resource: 'ore', demand: 50 },
    { id: 'b', kind: 'source', resource: 'coal', rate: 60 },
    { id: 'sb', kind: 'sink', resource: 'coal', demand: 50 },
  ],
  edges: [{ from: 'a', to: 'sa' }, { from: 'b', to: 'sb' }],
};
const twinLayout = (ca, cb) => ({
  a: { solid: 'tetrahedron', centre: ca, r: 1.6 },
  sa: { solid: 'cube', centre: SPREAD[2], r: 1.6 },
  b: { solid: 'cube', centre: cb, r: 1.6 },
  sb: { solid: 'tetrahedron', centre: SPREAD[3], r: 1.6 },
});
const CLASH = twinLayout(SPREAD[0], SPREAD[0]);   // a and b want the same spot
const GOOD = twinLayout(SPREAD[0], SPREAD[1]);

ok(JSON.stringify(buildOrder(TWIN)) === '["a","b","sa","sb"]',
   `twin: buildOrder interleaves the two chains (got ${JSON.stringify(buildOrder(TWIN))})`);

{
  const orders = topoOrders(TWIN);
  // two independent chains of two = C(4,2) = 6 interleavings
  ok(!orders.truncated && orders.orders.length === 6,
     `twin: exactly 6 topological orders, none dropped (got ${orders.orders.length}, truncated=${orders.truncated})`);

  // THE INVARIANCE, measured rather than argued: same verdict, and the same
  // minimum clearance, under every legal order. Exact equality is safe —
  // `seedGap(a,b)` and `seedGap(b,a)` differ only by sign-flipped subtractions,
  // which `Math.hypot` squares away bit-for-bit.
  const goods = orders.orders.map((o) => certify(P, TWIN, GOOD, { order: o }));
  ok(goods.every((c) => c.ok), 'invariance: the good layout is buildable under every one of the 6 orders');
  ok(new Set(goods.map((c) => c.clearance)).size === 1,
     `invariance: …and reports the identical minimum clearance under all of them (${[...new Set(goods.map((c) => c.clearance))].map((v) => v.toFixed(4)).join(', ')})`);

  const clashes = orders.orders.map((o) => certify(P, TWIN, CLASH, { order: o }));
  ok(clashes.every((c) => !c.ok), 'invariance: the clashing layout fails under every one of the 6 orders — reordering cannot rescue the BUILD');
  ok(new Set(clashes.map((c) => c.failure.node)).size === 2,
     'invariance: …while WHICH step is blamed does move with the order — that is the half order controls');
  ok(clashes.every((c) => ['a', 'b'].includes(c.failure.node)), 'invariance: and it is always one of the two colliding nodes');
}

{
  // the reorderable case: default order builds "a" first, so "b" is refused
  const first = certify(P, TWIN, CLASH);
  ok(!first.ok && first.failure.node === 'b' && first.failure.step === 1,
     `reorder: under buildOrder, "b" is the step that fails (got ${first.ok ? 'ok' : `"${first.failure.node}"`})`);
  ok(first.failure.blame === 'step' && first.failure.blockedBy.length === 1 && first.failure.blockedBy[0].node === 'a',
     'reorder: it was blocked by an earlier STEP, not by the pocket');
  ok(first.failure.dependencyBlocked.length === 0, 'reorder: and "b" does not depend on "a"');
  ok(first.failure.reorderable === true, 'reorder: so the certificate says a different order would have placed it');
  ok(Array.isArray(first.failure.suggestedOrder), 'reorder: …and hands back a concrete order rather than an assurance');

  const sug = first.failure.suggestedOrder;
  ok(topoOrders(TWIN).orders.some((o) => JSON.stringify(o) === JSON.stringify(sug)),
     `reorder: the suggested order ${JSON.stringify(sug)} is a legal topological order of the network`);
  ok(sug.indexOf('b') < sug.indexOf('a'), 'reorder: and it really does put "b" before "a"');

  // THE TICKET'S REQUIREMENT (c), at the level where it is true: the SAME step
  // fails under one order and is certified under another.
  const second = certify(P, TWIN, CLASH, { order: sug });
  ok(second.steps.some((s) => s.node === 'b'), 'reorder: under the suggested order, "b" IS certified — the step that failed now succeeds');
  ok(!second.ok && second.failure.node === 'a',
     `reorder: …and the failure moved to "a" — the build still cannot be completed (got ${second.ok ? 'ok' : `"${second.failure.node}"`})`);
  ok(second.failure.reorderable === true && second.failure.blockedBy[0].node === 'b',
     'reorder: symmetrically, "a" is now the reorderable one blocked by "b"');
  ok(orderPreferring(TWIN, 'b', ['a']).indexOf('b') === 0, 'reorder: orderPreferring puts a ready wanted node first');

  // the UNFIXABLE-BY-DEPENDENCY case: same collision shape, but the network
  // says the blocked node must come after the thing blocking it.
  const dep = certify(P, CHAIN, layoutAt(SPREAD[0], SPREAD[0]));
  ok(!dep.ok && dep.failure.node === 'depot' && dep.failure.blame === 'step',
     'depend: "depot" is blocked by the earlier step "ore"…');
  ok(JSON.stringify(dep.failure.dependencyBlocked) === '["ore"]',
     `depend: …and "ore" is one of its topological ancestors (got ${JSON.stringify(dep.failure.dependencyBlocked)})`);
  ok(dep.failure.reorderable === false, 'depend: so no legal order places it earlier — NOT reorderable');
  ok(dep.failure.suggestedOrder === null, 'depend: and no order is suggested, because none exists');
  ok(/DEPENDS on "ore"/.test(dep.failure.why), `depend: the reason says so in words (got "${dep.failure.why}")`);

  // CONTROL: the two cases differ ONLY in the dependency, not in the geometry —
  // both are "step 1 blocked by step 0 at gap 0". Without this the reorderable
  // flag could be reading the shape of the collision instead of the network.
  ok(first.failure.blame === dep.failure.blame && first.failure.blockedBy[0].gap === dep.failure.blockedBy[0].gap,
     'control: the reorderable and unfixable cases are geometrically identical');
  ok(first.failure.reorderable !== dep.failure.reorderable,
     'control: …and the certificate still tells them apart — the difference is the network, not the gap');
}

// ------------------------------- 3b. the suggestion is RUN, not argued -------
//
// THE HOLE IN THE OLD ARGUMENT. `blockedBy` can only ever name steps that
// PRECEDED the failing one — those are the only seeds committed when it was
// judged — so a node that came LATER was invisible to it. `orderPreferring`
// fills the wait for the wanted node's ancestors with any ready non-`avoid`
// node, and the avoid set is built from `blockedBy`, so it can legally schedule
// exactly such a node first.
//
// THE FIXTURE, built to make that happen rather than hoped for. Two independent
// strands plus one loose node:
//
//     d0 → d1 → z          a0 → w          c0   (no edges)
//
// `w` sits one hop deep, `z` two, and Kahn's queue is level-order, so the
// default build order is  d0, a0, c0, d1, w, z  —  z comes AFTER w and its seeds
// are not in the pocket when w is judged. `c0`, `w` and `z` are all summoned at
// the SAME centre; `d0`, `d1`, `a0` are 14m away and interact with nothing.
//
// So under the default order w is refused by c0 alone — a non-ancestor earlier
// step, which is the textbook `reorderable: true` shape. But `orderPreferring`,
// told to dodge c0, spends the wait for a0 walking the OTHER strand: d0, d1, z —
// and z lands on the very spot w wanted. The suggestion refutes itself.
{
  const strand = [
    { id: 'd0', kind: 'source', resource: 'ore', rate: 60 },
    { id: 'd1', kind: 'processor', capacity: 60, inputs: [{ resource: 'ore', rate: 1 }], outputs: [{ resource: 'gear', rate: 1 }] },
    { id: 'z', kind: 'sink', resource: 'gear', demand: 10 },
    { id: 'a0', kind: 'source', resource: 'coal', rate: 60 },
    { id: 'c0', kind: 'source', resource: 'stone', rate: 10 },
    { id: 'w', kind: 'sink', resource: 'coal', demand: 50 },
  ];
  // NODE DECLARATION ORDER IS LOAD-BEARING TWICE and the two uses pull in
  // opposite directions, which is the whole reason this fixture works:
  // `analyse`'s Kahn queue seeds itself from it (so d0 before a0 puts z's
  // strand in motion first), and `orderPreferring` scans `ready` in it (so
  // d0/d1/z outrank a0 while w waits). Reordering `strand` breaks the section.
  const LATE = {
    nodes: strand,
    edges: [{ from: 'd0', to: 'd1' }, { from: 'd1', to: 'z' }, { from: 'a0', to: 'w' }],
  };
  // THE CONTROL: identical in every respect except that `z` does not exist.
  const NOLATE = {
    nodes: strand.filter((n) => n.id !== 'z'),
    edges: [{ from: 'd0', to: 'd1' }, { from: 'a0', to: 'w' }],
  };
  const spot = (id, centre) => [id, { solid: 'cube', centre, r: 1.6 }];
  const NOLATE_LAYOUT = Object.fromEntries([
    spot('d0', SPREAD[1]), spot('d1', SPREAD[2]), spot('a0', SPREAD[3]),
    spot('c0', SPREAD[0]), spot('w', SPREAD[0]),
  ]);
  const LATE_LAYOUT = { ...NOLATE_LAYOUT, z: { solid: 'cube', centre: SPREAD[0], r: 1.6 } };

  // -- the fixture's premise, pinned. Everything below is about z being LATE.
  ok(JSON.stringify(buildOrder(LATE)) === '["d0","a0","c0","d1","w","z"]',
     `late: the default order puts "z" AFTER "w" (got ${JSON.stringify(buildOrder(LATE))})`);
  ok(JSON.stringify(buildOrder(NOLATE)) === '["d0","a0","c0","d1","w"]',
     `late: …and deleting "z" changes nothing else about it (got ${JSON.stringify(buildOrder(NOLATE))})`);

  const late = certify(P, LATE, LATE_LAYOUT);
  const none = certify(P, NOLATE, NOLATE_LAYOUT);

  // -- both runs fail identically, at the same step, on the same blocker.
  for (const [name, c] of [['late', late], ['control', none]]) {
    ok(!c.ok && c.failure.node === 'w' && c.failure.step === 4,
       `${name}: "w" is the step that fails, at index 4 (got ${c.ok ? 'ok' : `"${c.failure.node}" at ${c.failure.step}`})`);
    ok(c.failure.blame === 'step' && c.failure.blockedBy.length === 1
       && c.failure.blockedBy[0].node === 'c0' && c.failure.blockedBy[0].gap === 0,
       `${name}: blocked by exactly one earlier step, "c0", at gap 0`);
    ok(c.failure.dependencyBlocked.length === 0,
       `${name}: …and "w" does not depend on "c0" — the naive argument's premise holds`);
  }

  // -- and the verdicts differ. THIS is the ticket.
  ok(late.failure.reorderCheck === 'refuted' && late.failure.reorderable === false
     && late.failure.suggestedOrder === null,
     `late: the constructed order was RUN and refused — not reorderable (got ${late.failure.reorderCheck})`);
  ok(none.failure.reorderCheck === 'verified' && none.failure.reorderable === true
     && Array.isArray(none.failure.suggestedOrder),
     `control: with "z" gone the same order is run and LANDS — reorderable (got ${none.failure.reorderCheck})`);
  ok(late.failure.reorderable !== none.failure.reorderable,
     'control: one node existing is the only difference between the two runs, and the certificate tells them apart');

  // -- the mechanism, exhibited rather than described: the order it tried puts a
  //    node that originally came LATER ahead of the node it was rescuing.
  const tried = late.failure.attemptedOrder;
  ok(JSON.stringify(tried) === '["d0","d1","z","a0","w","c0"]',
     `late: the order it constructed (got ${JSON.stringify(tried)})`);
  const bo = buildOrder(LATE);
  ok(bo.indexOf('z') > bo.indexOf('w') && tried.indexOf('z') < tried.indexOf('w'),
     'late: "z" is after "w" in the default order and before it in the suggested one — which is exactly why blockedBy could not see it');
  ok(topoOrders(LATE).orders.some((o) => JSON.stringify(o) === JSON.stringify(tried)),
     'late: …and the order it tried is a legal topological order, so the refusal is real and not a malformed attempt');

  // -- INDEPENDENT RE-EXECUTION. `reorderCheck: 'refuted'` is a claim about a
  //    run nobody watched. Run it again from outside, by hand, and check the
  //    refusal is the one the mechanism predicts: "w" refused by "z", the node
  //    the original walk never saw.
  const direct = certify(P, LATE, LATE_LAYOUT, { order: tried });
  ok(!direct.ok && direct.failure.node === 'w' && direct.failure.step === 4,
     `late: re-running the suggested order by hand refuses "w" too (got ${direct.ok ? 'ok' : `"${direct.failure.node}"`})`);
  ok(direct.failure.blockedBy.length === 1 && direct.failure.blockedBy[0].node === 'z'
     && direct.failure.blockedBy[0].gap === 0,
     'late: …and it is "z" that took the spot, at gap 0 — the collision the first run could not have detected');
  ok(direct.steps.length === 4 && !direct.steps.some((s) => s.node === 'w'),
     `late: "w" is genuinely absent from the certified prefix of that run (got ${JSON.stringify(direct.steps.map((s) => s.node))})`);

  // -- convergence: the SECOND suggestion, now dodging "z" as well, does land.
  //    Recorded because it is the reason the recursion is shallow in practice —
  //    the dodge set grows every round, so the greedy runs out of nodes to
  //    schedule ahead of the wanted one.
  ok(direct.failure.reorderCheck === 'verified'
     && direct.failure.suggestedOrder.indexOf('w') < direct.failure.suggestedOrder.indexOf('z')
     && direct.failure.suggestedOrder.indexOf('w') < direct.failure.suggestedOrder.indexOf('c0'),
     `late: the next suggestion dodges both blockers and is verified (got ${direct.failure.reorderCheck}, ${JSON.stringify(direct.failure.suggestedOrder)})`);

  // ---------------------------------------------- the recursion guard --------
  // Without it, each trial's own failure would construct and run another trial.
  // `reorderRuns` counts the nested runs behind a record, and it is the only
  // observable of the guard: on THIS fixture an unguarded implementation would
  // report 2, because the trial above fails and would suggest again.
  ok(late.failure.reorderRuns === 1,
     `guard: exactly one nested run produced this record (got ${late.failure.reorderRuns})`);
  ok(none.failure.reorderRuns === 1,
     `guard: …and one for the control, whose trial also fails, one step later (got ${none.failure.reorderRuns})`);

  const guarded = certify(P, LATE, LATE_LAYOUT, { suggest: false });
  ok(!guarded.ok && guarded.failure.node === 'w', 'guard: the guarded run reaches the same refusal');
  ok(guarded.failure.reorderCheck === 'unchecked' && guarded.failure.reorderable === false
     && guarded.failure.suggestedOrder === null && guarded.failure.reorderRuns === 0,
     `guard: with the guard on nothing is run and nothing is claimed — fail closed (got ${guarded.failure.reorderCheck}, reorderable ${guarded.failure.reorderable})`);
  ok(JSON.stringify(guarded.failure.attemptedOrder) === JSON.stringify(tried),
     'guard: …but the order it WOULD have tried is still reported, so "unchecked" means constructed-and-not-run rather than not-considered');

  // COST: the work does not grow with the size of the collision. Thirty nodes
  // stacked on one centre, every one of them refusing every other, still costs
  // exactly one nested run — and returns, rather than recursing to a stack
  // overflow. (A weak upper bound on depth is what this asserts; see the
  // finding — a fixture forcing an unguarded version to recurse deeply could
  // not be built, because the dodge set converges after about two rounds.)
  const N = 30;
  const PILE = {
    nodes: Array.from({ length: N }, (_, i) => ({ id: `n${i}`, kind: 'source', resource: 'ore', rate: 10 })),
    edges: [],
  };
  const PILE_LAYOUT = Object.fromEntries(PILE.nodes.map((n) => spot(n.id, SPREAD[0])));
  const pile = certify(P, PILE, PILE_LAYOUT);
  ok(!pile.ok && pile.failure.node === 'n1' && pile.failure.step === 1,
     `guard: 30 summons on one centre — the second one is refused (got ${pile.ok ? 'ok' : `"${pile.failure.node}"`})`);
  ok(pile.failure.reorderRuns === 1,
     `guard: one nested run for 30 colliding nodes, exactly as for 6 — the cost is not a function of the pile (got ${pile.failure.reorderRuns})`);
  ok(pile.failure.reorderCheck === 'verified' && pile.failure.suggestedOrder[0] === 'n1',
     `guard: …and building "n1" first really does land it (got ${pile.failure.reorderCheck})`);
}

// -------------------------------------------- 4. every blame is reachable ----
const SOLO = { nodes: [{ id: 'x', kind: 'source', resource: 'ore', rate: 10 }], edges: [] };
{
  // hull — a cube whose −x neighbour (3.2m out) pokes through the wall
  const h = certify(EMPTY, SOLO, { x: { solid: 'cube', centre: [2, 18, 40], r: 1.6 } });
  ok(!h.ok && h.failure.blame === 'hull',
     `blame: an out-of-hull neighbour is refused as 'hull' (got ${h.ok ? 'ok' : h.failure.blame})`);
  ok(JSON.stringify(h.failure.blames) === '["hull"]', `blame: …and nothing else (got ${JSON.stringify(h.failure.blames)})`);
  ok(h.failure.refusals.some((r) => r.wall === 'B4' && r.summonSeed !== 0), 'blame: it names the −x wall and a neighbour, not the centre');
  ok(h.failure.reorderable === false && h.failure.blockedBy.length === 0, 'blame: no order changes where a wall is');
  ok(certify(EMPTY, SOLO, { x: { solid: 'cube', centre: [40, 18, 40], r: 1.6 } }).ok,
     'control: the same cube in the middle of the same empty box is fine');

  // self — a cube at r=0.74 has minimum self-gap exactly 1.48 < 1.5
  const s = certify(EMPTY, SOLO, { x: { solid: 'cube', centre: [40, 18, 40], r: 0.74 } });
  ok(!s.ok && JSON.stringify(s.failure.blames) === '["self"]',
     `blame: a constellation that fights itself is refused as 'self' (got ${s.ok ? 'ok' : JSON.stringify(s.failure.blames)})`);
  ok(Math.abs(s.failure.refusals[0].gap - 1.48) < 1e-12, `blame: …reporting the real gap 1.48 (got ${s.failure.refusals[0].gap})`);
  ok(certify(EMPTY, SOLO, { x: { solid: 'cube', centre: [40, 18, 40], r: 0.76 } }).ok,
     'control: r=0.76 → self-gap 1.52 ≥ 1.5 — the boundary is pinned from both sides');

  // metric — a constellation built for a different anisotropy
  const m = certify(EMPTY, SOLO, { x: { solid: 'cube', centre: [40, 18, 40], r: 1.6, aniso: 3.5 } });
  ok(!m.ok && m.failure.blame === 'metric' && m.failure.reorderable === false,
     `blame: an aniso mismatch is refused as 'metric' (got ${m.ok ? 'ok' : m.failure.blame})`);

  // pocket — a centre standing on a pre-existing seed. Seeds are clamped to
  // [0.3, H−0.3] at generation but the placeable hull is [0.8, H−0.8], so some
  // pocket seeds sit where nothing can be planted; filter to interior ones or a
  // 'hull' verdict shadows the 'pocket' one.
  const interior = P.seeds.filter((s2) => s2[0] >= 6 && s2[0] <= P.W - 6 && s2[1] >= 6 && s2[1] <= P.H - 6 && s2[2] >= 6 && s2[2] <= P.D - 6);
  ok(interior.length >= 4, `blame: the fixture has interior pocket seeds to stand on (${interior.length})`);
  const g = certify(P, SOLO, { x: { solid: 'cube', centre: interior[0], r: 1.6 } });
  ok(!g.ok && g.failure.blame === 'pocket', `blame: standing on a pocket seed is refused as 'pocket' (got ${g.ok ? 'ok' : g.failure.blame})`);
  ok(g.failure.refusals.some((r) => r.gap === 0), 'blame: …at gap 0, because the centre is exactly on it');
  ok(g.failure.reorderable === false && g.failure.blockedBy.length === 0 && g.failure.suggestedOrder === null,
     'blame: no order moves a seed that was already there');
  ok(/pre-existing pocket seed/.test(g.failure.why), `blame: and the reason says which (got "${g.failure.why}")`);

  ok(BLAME_PRECEDENCE.length === 5, 'blame: five kinds, and every one of them is exercised above');
}

// ----------------------------------------- 5. malformed input throws, loudly --
{
  throws(() => certify(P, CHAIN, { ore: { solid: 'cube', centre: SPREAD[0] } }),
         /no layout for node "depot"/, 'input: a layout missing a node throws');
  throws(() => certify(P, CHAIN, { ...layoutAt(SPREAD[0], SPREAD[1]), ghost: { solid: 'cube', centre: SPREAD[2] } }),
         /layout names unknown node "ghost"/, 'input: a layout naming a node the network does not have throws');
  throws(() => certify(P, CHAIN, layoutAt(SPREAD[0], SPREAD[1]), { order: ['depot', 'ore'] }),
         /order puts "depot" before "ore"/, 'input: an order that violates an edge throws, naming the edge');
  throws(() => certify(P, CHAIN, layoutAt(SPREAD[0], SPREAD[1]), { order: ['ore'] }),
         /order has 1 nodes, network has 2/, 'input: a short order throws');
  throws(() => certify(P, CHAIN, layoutAt(SPREAD[0], SPREAD[1]), { order: ['ore', 'ore'] }),
         /order repeats node "ore"/, 'input: a repeated node throws');
  throws(() => certify(P, CHAIN, { ore: { solid: 'cube', centre: [1, 2] }, depot: { solid: 'cube', centre: SPREAD[1] } }),
         /needs a 3-vector centre/, 'input: a malformed centre throws');
  throws(() => certify(P, {
    nodes: [
      { id: 'p', kind: 'processor', capacity: 1, inputs: [{ resource: 'ore', rate: 1 }], outputs: [{ resource: 'gear', rate: 1 }] },
      { id: 'q', kind: 'processor', capacity: 1, inputs: [{ resource: 'gear', rate: 1 }], outputs: [{ resource: 'ore', rate: 1 }] },
    ],
    edges: [{ from: 'p', to: 'q' }, { from: 'q', to: 'p' }],
  }, {}), /has a cycle/, 'input: a cyclic network is refused by production.mjs and the refusal comes through');
}

// ------------------------------------------------------------ determinism ----
{
  const a = certify(P, TWIN, GOOD), b = certify(P, TWIN, GOOD);
  ok(JSON.stringify(a) === JSON.stringify(b), 'determinism: the same question gets the same certificate');
  const c = certify(P, TWIN, CLASH), d = certify(P, TWIN, CLASH);
  ok(JSON.stringify(c) === JSON.stringify(d), 'determinism: …including the failure record');
}

console.log(failures === 0
  ? `✓ buildcert selftest — ${checks} checks pass (certificate vs. real inserts, pocket seed 2)`
  : `✗ buildcert selftest — ${failures}/${checks} FAILED`);
process.exit(failures === 0 ? 0 : 1);
