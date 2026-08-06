// plant/test/placement.selftest.mjs — certifies that "can I build here?" is
// answered the same way by `placement.mjs` and by the foam itself.
//
// Run: node plant/test/placement.selftest.mjs
//
// ----------------------------------------------------------- what is proven --
//
// The claim under test is NOT that the predicate is self-consistent — a
// predicate that agrees only with itself is worth nothing. It is that the
// predicate agrees with `reformPocket`, the thing that actually plants seeds.
// So every verdict below is checked against a real insert into a real pocket.
//
// THE ORACLE is `attempt()`: it calls `reformPocket` and asks whether the seed
// LANDED WHERE IT WAS ASKED FOR. That is stricter than `!== null` on purpose.
// `reformPocket` clamps an out-of-bounds point instead of refusing it, so
// "succeeded" and "planted what you asked for" are different questions, and
// only the second one is what a summon needs.
//
// THE TWO DIRECTIONS, and they are not symmetric:
//
//   1. ok:false ⟹ the foam does not plant it.   ASSERTED ON EVERY SAMPLE.
//      This is a theorem — the predicate reproduces `reformPocket`'s own
//      pre-checks — so it is safe to assert unconditionally, and it is the
//      direction a UI depends on.
//
//   2. the foam DOES plant it ⟹ ok:true.        ASSERTED ON PROVEN POINTS.
//      Not a theorem: `reformPocket` also returns null when the reformed
//      complex fails its closure gate or the target chamber loses its floor,
//      and neither is decidable in advance. So this direction is asserted on
//      points that `foamworld.selftest.mjs` — which passes today — already
//      proves are reformable. That is enough to kill the degenerate answer:
//      a predicate that always returned false would satisfy direction 1
//      perfectly and fail every check in this section.
//
// Between them: constant-false dies on direction 2, constant-true dies on
// direction 1, and a predicate that names an arbitrary seed dies on the
// independent refusal-radius check in section 3.

import { generatePocket, reformPocket, reformPocketAll } from '../foamworld.js';
import { constellation } from '../solids.mjs';
import {
  legalSeed, legalSummon, summonAt, nearestSeed, hullBounds, clampToHull,
  hullViolation, hullFaceIds, coarselyClear, MIN_SEED_GAP,
} from '../placement.mjs';

let checks = 0, failures = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('  ✗ ' + msg); }
}

// The macro fixture: few big rooms. `foamworld.selftest.mjs` uses exactly these
// opts and this seed for its own reform block, which is what makes the two
// "proven point" assertions below free rather than hopeful.
const MACRO = { nx: 4, nz: 4, layers: 3, subLayers: 1, cell: 20, layerH: 9, parMin: 3, parTarget: 6 };
const P = generatePocket({ seed: 2, ...MACRO });

/** The oracle: did the foam plant this exact point? `null` (refused) and a
 *  clamped relocation both count as "no". */
function attempt(pocket, p) {
  const q = reformPocket(pocket, p);
  if (!q) return { ok: false, q: null, why: 'refused' };
  const planted = q.seeds[q.seeds.length - 1];
  const same = planted[0] === p[0] && planted[1] === p[1] && planted[2] === p[2];
  return { ok: same, q: same ? q : null, why: same ? 'planted' : 'relocated' };
}

// ------------------------------------------------------------- the fixture --
ok(P.W === 80 && P.H === 36 && P.D === 80, `fixture: 80×36×80 pocket (got ${P.W}×${P.H}×${P.D})`);
ok(P.seeds.length === 64, `fixture: 64 seeds (got ${P.seeds.length})`);
ok(P.opts.aniso === 2.2, `fixture: aniso 2.2 (got ${P.opts.aniso})`);

// ---------------------------------------------------- 1. the hull bounds ----
// These constants are `reformPocket`'s clamp, restated. If the kernel's clamp
// ever moves, this is the check that says so.
{
  const b = hullBounds(P);
  ok(b.x[0] === 1 && Math.abs(b.x[1] - 79) < 1e-12, `hull: x ∈ [1, 79] (got [${b.x}])`);
  ok(Math.abs(b.y[0] - 0.8) < 1e-12 && Math.abs(b.y[1] - 35.2) < 1e-9, `hull: y ∈ [0.8, 35.2] (got [${b.y}])`);
  ok(b.z[0] === 1 && Math.abs(b.z[1] - 79) < 1e-12, `hull: z ∈ [1, 79] (got [${b.z}])`);

  // the margins are asymmetric between axes — 1 on x/z, 0.8 on y. Pinned
  // because it looks like a typo and is not.
  ok(b.y[0] !== b.x[0], 'hull: the y margin really is different from x/z');

  const p = [40, 18, 40];
  ok(clampToHull(P, p).every((v, i) => v === p[i]), 'clamp: an interior point is untouched');
  ok(hullViolation(P, p) === null, 'hull: an interior point violates nothing');

  // each wall, named by the same `src` id foamworld puts on its boundary faces
  const cases = [
    { p: [0.5, 18.9, 38], wall: 'B4', axis: 'x', depth: 0.5 },
    { p: [79.5, 18.9, 38], wall: 'B5', axis: 'x', depth: 0.5 },
    { p: [42, 0.5, 38], wall: 'B2', axis: 'y', depth: 0.3 },
    { p: [42, 35.6, 38], wall: 'B3', axis: 'y', depth: 0.4 },
    { p: [42, 18.9, 0.4], wall: 'B0', axis: 'z', depth: 0.6 },
    { p: [42, 18.9, 79.8], wall: 'B1', axis: 'z', depth: 0.8 },
  ];
  for (const c of cases) {
    const v = legalSeed(P, c.p);
    ok(!v.ok && v.reason === 'hull' && v.wall === c.wall && v.axis === c.axis && Math.abs(v.depth - c.depth) < 1e-9,
       `hull: [${c.p}] refused against ${c.wall} by ${c.depth}m (got ${v.reason}/${v.wall}/${v.depth})`);
    ok(hullFaceIds(P, c.wall).length > 0, `hull: ${c.wall} is a real boundary face in this pocket`);
  }

  // deepest violation wins; equal depths break x → y → z. Deterministic, not
  // "whichever the loop happened to see last".
  ok(legalSeed(P, [0.5, 0.6, 38]).wall === 'B4', 'hull: the deeper violation (x by 0.5) is named over y by 0.2');
  ok(legalSeed(P, [0.9, 0.2, 38]).wall === 'B2', 'hull: …and the other way round (y by 0.6 beats x by 0.1)');
  // x and z carry the SAME margin, so both depths come out of `1 - 0` and the
  // tie is exact — no floating-point ambiguity to make the tie-break moot.
  ok(legalSeed(P, [0, 18, 0]).wall === 'B4', 'hull: an exact tie between x and z breaks toward x');

  // AGREEMENT, direction 1: the foam does not plant an out-of-hull point where
  // it was asked. Either it refuses, or it clamps and plants somewhere else —
  // both are "no", and this is why out-of-hull is a refusal here at all.
  const a = attempt(P, [0.5, 18.9, 38]);
  ok(!a.ok, `hull: the foam does not plant [0.5, 18.9, 38] as asked (${a.why})`);
}

// ------------------------------- 2. agreement on points the foam accepts ----
// Both points come from `foamworld.selftest.mjs`'s reform block, where they are
// already asserted to plant successfully at this same seed and these same opts.
// So direction 2 is checked against evidence that exists independently of this
// file, rather than against this file's own opinion.
const A = [P.W / 2 + 2, P.H / 2 + 0.9, P.D / 2 - 2];   // proven: plants into P
const B = [P.W / 2 - 5, P.H / 2, P.D / 2 + 4];         // proven: plants into P+A
let Q = null;
{
  const va = legalSeed(P, A);
  ok(va.ok, `accept: the predicate allows [${A}], which the foam really plants (${va.reason || 'ok'})`);
  const a = attempt(P, A);
  ok(a.ok, `accept: [${A}] really plants (${a.why})`);
  Q = a.q;
  ok(Q !== null && Q.seeds.length === P.seeds.length + 1, 'accept: the reformed pocket carries exactly one more seed');

  // the predicate tracks the pocket's STATE, not a snapshot: the point that was
  // legal a moment ago is now occupied by the seed that was planted there.
  const vb = legalSeed(Q, A);
  ok(!vb.ok && vb.reason === 'seed' && vb.seedIndex === Q.seeds.length - 1 && vb.gap === 0,
     `accept: after planting, the same point is refused and names the new seed (got ${vb.reason}/${vb.seedIndex})`);

  // and a second, independent proven point — in the REFORMED pocket, which is
  // where foamworld's own test proves it plants
  const vc = legalSeed(Q, B);
  ok(vc.ok, `accept: the predicate allows [${B}] in the reformed pocket (${vc.reason || 'ok'})`);
  ok(attempt(Q, B).ok, `accept: [${B}] really plants into the reformed pocket`);
}

// ------------------------------------- 3. refusals name the seed they hit ----
// Seeds are clamped to [0.3, H-0.3] at generation but the placeable hull is
// [0.8, H-0.8], so SOME pocket seeds sit outside the hull. Filter to seeds
// comfortably interior, so a `seed` verdict is not shadowed by a `hull` one.
const inner = P.seeds
  .map((s, i) => ({ s, i }))
  .filter(({ s }) => s[0] >= 3 && s[0] <= P.W - 3 && s[1] >= 3 && s[1] <= P.H - 3 && s[2] >= 3 && s[2] <= P.D - 3);
ok(inner.length >= 8, `fixture: at least 8 comfortably-interior seeds (got ${inner.length})`);

for (const pick of [inner[0], inner[Math.floor(inner.length / 2)], inner[inner.length - 1]]) {
  const { s, i } = pick;

  // exact coincidence: gap 0, names itself, and the foam refuses for real
  const v = legalSeed(P, s);
  ok(!v.ok && v.reason === 'seed' && v.seedIndex === i && v.gap === 0,
     `seed ${i}: standing on it is refused and names itself (got ${v.reason}/${v.seedIndex}/${v.gap})`);
  ok(v.seed[0] === s[0] && v.seed[1] === s[1] && v.seed[2] === s[2], `seed ${i}: the refusal carries the seed's coordinates`);
  ok(!attempt(P, s).ok, `seed ${i}: the foam really refuses its own seed`);

  // a near miss along +x (aniso does not touch x, so the gap is exactly 1.2)
  const near = [s[0] + 1.2, s[1], s[2]];
  const w = legalSeed(P, near);
  ok(!w.ok && w.reason === 'seed' && w.gap <= 1.2 + 1e-12,
     `seed ${i}: 1.2m away is still inside the gap (got ${w.reason}/${w.gap})`);
  ok(!attempt(P, near).ok, `seed ${i}: the foam really refuses 1.2m away`);

  // INDEPENDENT check that the named seed is the right one: re-run
  // `reformPocket`'s literal refusal arithmetic (foamworld.js:740-741) on the
  // seed the predicate blamed. A predicate that named an arbitrary seed would
  // pass everything above and die here.
  const dy = (w.seed[1] - near[1]) * Math.sqrt(P.opts.aniso);
  const sq = (w.seed[0] - near[0]) ** 2 + dy * dy + (w.seed[2] - near[2]) ** 2;
  ok(sq < 2.25, `seed ${i}: the blamed seed is genuinely inside the foam's own refusal radius (${sq.toFixed(4)} < 2.25)`);
}

// CONTROL: just outside the gap, along the same axis, is NOT refused for a
// seed reason. Without this the "1.2 is refused" assertions above would pass
// for a predicate that refuses everything near anything.
{
  const { s } = inner[0];
  const far = [s[0] + 1.6, s[1], s[2]];
  const v = legalSeed(P, far);
  ok(v.reason !== 'seed' || v.seedIndex !== inner[0].i,
     `control: 1.6m from seed ${inner[0].i} is not refused on account of that seed (got ${v.reason}/${v.seedIndex})`);
}

// --------------------------- 4. a solid: legal here, illegal there, same pocket
// Requirement (b): the predicate must DISCRIMINATE for one solid in one pocket.

// -- the illegal position: a cube centred on an existing seed
{
  const { s, i } = inner[1];
  const bad = summonAt(P, 'cube', s, { r: 1.6 });
  ok(!bad.ok, 'cube: centring on an existing seed is refused');
  const centreRef = bad.verdict.refusals.find((r) => r.summonSeed === 0);
  ok(centreRef && centreRef.reason === 'seed' && centreRef.seedIndex === i && centreRef.gap === 0 && centreRef.role === 'centre',
     `cube: the refusal names seed ${i} under the centre (got ${centreRef && centreRef.reason}/${centreRef && centreRef.seedIndex})`);
  ok(bad.verdict.first === bad.verdict.refusals[0], 'cube: `first` is the first refusal, not a separate opinion');
  ok(!attempt(P, s).ok, 'cube: the foam really refuses that centre');
}

// -- buildable space: sweep a deterministic lattice of candidate centres.
// Every candidate is chosen so the whole constellation is inside the hull
// (x,z ∈ [6, 71] with neighbours at ±3.2; y ∈ {11,15,20,24}), so any refusal
// found here is a SEED refusal — which is what makes the split meaningful.
const CANDS = [];
for (let x = 6; x <= P.W - 6; x += 5) {
  for (let z = 6; z <= P.D - 6; z += 5) {
    for (const y of [11, 15, 20, 24]) {
      CANDS.push({ c: [x, y, z], con: constellation('cube', { centre: [x, y, z], r: 1.6, aniso: P.opts.aniso }) });
    }
  }
}
ok(CANDS.length > 100, `sweep: a real lattice of candidate centres (${CANDS.length})`);

const verdicts = CANDS.map((k) => ({ ...k, v: legalSummon(P, k.con) }));
const legal = verdicts.filter((k) => k.v.ok);
ok(legal.length > 0, `sweep: buildable space exists for a cube (${legal.length} centres)`);
ok(legal.length < CANDS.length, `sweep: and some centres are refused — not a constant (${CANDS.length - legal.length} blocked)`);
ok(verdicts.every((k) => k.v.ok || k.v.refusals.every((r) => r.reason === 'seed')),
   'sweep: every refusal in the lattice is a seed collision, as designed');

// -- and the legal side, verified against the real thing.
// This is an EXISTENCE claim, deliberately: `reformPocket` returns null for
// three different reasons and only one of them is decidable in advance, so a
// single candidate failing would not be evidence against the predicate. What
// the loop proves is that predicate-legal centres are genuinely plantable, not
// merely un-refused on paper. Candidates are spread across the lattice rather
// than taken from the front, so a single bad neighbourhood cannot decide it.
{
  const stride = Math.max(1, Math.floor(legal.length / 6));
  const spread = legal.filter((_, i) => i % stride === 0).slice(0, 6);
  let verified = null;
  for (const k of spread) {
    if (attempt(P, k.c).ok) { verified = k; break; }
  }
  ok(verified !== null, `sweep: a predicate-legal cube centre really plants (tried ${spread.length})`);
  if (verified) {
    ok(verified.con.seeds.every((s) => legalSeed(P, s).ok), 'sweep: every seed of that constellation is individually legal');
  }
}

// -- the coarse sphere test is SOUND: it never accepts something the exact
// per-seed check would refuse. Proof in placement.mjs; this is the measurement.
{
  let coarse = 0, contradicted = 0;
  for (const k of verdicts) {
    if (!coarselyClear(P, k.con)) continue;
    coarse++;
    if (k.v.refusals.some((r) => r.reason === 'seed')) contradicted++;
  }
  ok(coarse > 0, `coarse: the sphere test accepts something (${coarse} centres)`);
  ok(contradicted === 0, `coarse: nothing it accepts is refused on a seed (${contradicted} contradictions)`);
  ok(coarse < legal.length, `coarse: and it is strictly conservative — it misses legal centres (${coarse} vs ${legal.length})`);
}

// ------------------------------------------- 5. a summon's own seeds fight ---
// Self-compatibility has nothing to do with any particular pocket — it asks
// whether a shape could be planted ANYWHERE — so it is pinned against a
// seedless stub, where `hull` and `seed` refusals are impossible by
// construction and only the `self` rule can fire. `legalSummon` reads exactly
// these fields off a pocket, which is what makes the stub honest rather than a
// shortcut.
{
  const EMPTY = { W: 80, H: 36, D: 80, seeds: [], faces: [], opts: { aniso: 2.2 } };
  const centre = [40, 18, 40];

  // A cube's minimum self-gap is EXACTLY 2r: its neighbours land at Euclidean
  // 2r on all three axes, and the pair that matters (centre ↔ an x or z
  // neighbour) has dy = 0, so the anisotropic scaling never enters. No
  // floating-point slack, so the threshold can be pinned from both sides.
  const tight = legalSummon(EMPTY, constellation('cube', { centre, r: 0.74, aniso: 2.2 }));
  ok(!tight.ok && tight.refusals.every((r) => r.reason === 'self'),
     'self: r=0.74 → min self-gap 1.48 < 1.5, refused, and for the self reason only');
  const t0 = tight.refusals[0];
  ok(t0 && Math.abs(t0.gap - 1.48) < 1e-12 && t0.need === MIN_SEED_GAP,
     `self: the refusal reports the real gap 1.48 (got ${t0 && t0.gap})`);
  ok(t0 && t0.summonSeed !== t0.otherSummonSeed, 'self: a self refusal names two distinct seeds of the summon');

  const loose = legalSummon(EMPTY, constellation('cube', { centre, r: 0.76, aniso: 2.2 }));
  ok(loose.ok, 'self: r=0.76 → min self-gap 1.52 ≥ 1.5, allowed (the boundary is pinned from both sides)');

  // an ordinary summon is comfortably self-compatible
  for (const solid of ['tetrahedron', 'cube', 'octahedron', 'dodecahedron', 'icosahedron']) {
    ok(legalSummon(EMPTY, constellation(solid, { centre, r: 1.6, aniso: 2.2 })).ok,
       `self: a ${solid} at r=1.6 is self-compatible in clear space`);
  }

  // and the hull still bites in the stub — a summon whose NEIGHBOUR pokes out
  // is refused even though its centre is fine
  const edge = legalSummon(EMPTY, constellation('cube', { centre: [2, 18, 40], r: 1.6, aniso: 2.2 }));
  const hullRef = edge.refusals.find((r) => r.reason === 'hull');
  ok(hullRef && hullRef.summonSeed !== 0 && hullRef.role === 'neighbour' && hullRef.wall === 'B4',
     `hull: a neighbour outside the wall refuses the whole summon (got ${hullRef && hullRef.wall}/${hullRef && hullRef.role})`);
  ok(legalSeed(EMPTY, [2, 18, 40]).ok, 'hull: …while the centre on its own is perfectly legal');
}

// ------------------------------------------------- 6. the metric mismatch ---
// A constellation built for a different `aniso` than the pocket uses would come
// out rotated (solids.mjs's 22° trap). Refused, not warned.
{
  const wrong = constellation('cube', { centre: [40, 18, 40], r: 1.6, aniso: 3.5 });
  const v = legalSummon(P, wrong);
  ok(!v.ok && v.refusals.some((r) => r.reason === 'metric'), 'metric: an aniso mismatch is a refusal');
  ok(summonAt(P, 'cube', [40, 18, 40], { r: 1.6 }).con.aniso === P.opts.aniso,
     'metric: summonAt takes aniso from the pocket, so the mismatch is unreachable through it');
}

// ------------------------------------------- 7. the finiteness contract -----
// A raycast that misses produces NaN. It is the commonest bad input a placement
// UI can hand a predicate, and NaN does not FAIL a range check — it PASSES one:
// every ordered comparison against NaN is false, so a chain of `<`/`>` falls
// through to whatever the final else says, and the final else in a validator is
// almost always "fine". This file shipped that bug: `legalSeed` returned
// ok:true with a NaN in `nearest.gap` while the kernel refused the same point.
//
// THE ORACLE here is `reformPocketAll`, not `attempt()`. The transaction runs
// every pre-check before it touches `rebuildWith`, so a non-finite point is
// refused by arithmetic and no lattice is ever built from a NaN seed —
// `reformPocket` would instead clamp (to NaN) and rebuild, which answers a
// different question expensively. The kernel reaches its refusal a DIFFERENT
// WAY (`clampSeed`, then `c[i] === p[i]`, which NaN fails) so this is two
// independent implementations agreeing rather than one checking itself.
{
  const BAD = [
    { name: 'NaN', v: NaN },
    { name: '+Infinity', v: Infinity },
    { name: '-Infinity', v: -Infinity },
  ];
  const AXIS = ['x', 'y', 'z'];
  // WHICH WALL a non-finite coordinate is blamed on, pinned as a literal and
  // not only against the kernel. `low = v < lo` is false for NaN, +∞, undefined
  // and an un-coerced string, so all of those name the HIGH wall; only −∞
  // compares low. The kernel-agreement assertion below is the stronger check of
  // the two, but two implementations agreeing on a WRONG wall is still a wrong
  // wall, and `wall` is the field a UI highlights.
  const HI = { x: 'B5', y: 'B3', z: 'B1' };
  const LO = { x: 'B4', y: 'B2', z: 'B0' };

  for (const { name, v } of BAD) {
    for (let i = 0; i < 3; i++) {
      const p = [40, 18, 40];
      p[i] = v;                                  // the other two are interior, so
      const axis = AXIS[i];                      // exactly one violation exists

      const r = legalSeed(P, p);
      ok(!r.ok, `finite: ${name} on ${axis} is refused (got ok=${r.ok})`);
      ok(r.reason === 'hull' && r.axis === axis,
         `finite: ${name} on ${axis} — a hull refusal naming ${axis} (got ${r.reason}/${r.axis})`);
      ok(r.nonFinite === true && r.depth === Infinity,
         `finite: ${name} on ${axis} — flagged nonFinite at unbounded depth (got ${r.nonFinite}/${r.depth})`);
      const expectWall = name === '-Infinity' ? LO[axis] : HI[axis];
      ok(r.wall === expectWall,
         `finite: ${name} on ${axis} — names wall ${expectWall} (got ${r.wall})`);

      // AGREEMENT with the transaction that does the planting: same verdict,
      // same reason, same axis, same wall.
      const k = reformPocketAll(P, [p]);
      ok(!k.ok && k.first.reason === 'hull',
         `finite: the kernel refuses ${name} on ${axis} too (got ok=${k.ok}/${k.first && k.first.reason})`);
      ok(k.first.axis === axis && k.first.wall === r.wall,
         `finite: ${name} on ${axis} — same axis and wall as the kernel (kernel ${k.first.axis}/${k.first.wall}, predicate ${r.axis}/${r.wall})`);

      // DEPTH is the one field that diverges, and only for NaN. The kernel
      // computes |clamped - requested|, which is NaN when the clamp is NaN;
      // this file reports Infinity, which is comparable and orders correctly.
      // Pinned from both sides so neither can drift unnoticed.
      ok(name === 'NaN' ? Number.isNaN(k.first.depth) : k.first.depth === Infinity,
         `finite: ${name} on ${axis} — the kernel depth is as expected (got ${k.first.depth})`);
    }
  }

  // A MIXED point: 0.5m outside the x wall AND not-a-number on y. Both refuse;
  // they blame different axes, and pinning that is the point. The predicate
  // blames y because Infinity outranks 0.5 — "no finite move fixes this" beats
  // "move half a metre". The kernel blames x because its comparison is
  // `NaN > 0.5`, which is false, so whichever axis it happened to see first
  // wins. The predicate's answer is the useful one; the kernel's is an artefact
  // of NaN being incomparable. What matters for safety is that neither plants.
  {
    const mixed = [0.5, NaN, 40];
    const pm = legalSeed(P, mixed);
    const km = reformPocketAll(P, [mixed]);
    ok(!pm.ok && pm.reason === 'hull' && pm.axis === 'y' && pm.nonFinite === true,
       `mixed: the predicate blames the non-finite axis (got ${pm.reason}/${pm.axis})`);
    ok(!km.ok && km.first.reason === 'hull' && km.first.axis === 'x',
       `mixed: the kernel refuses it too, blaming the finite violation (got ${km.ok}/${km.first && km.first.axis})`);
  }

  // Two non-finite axes tie at Infinity, and the tie breaks x → y → z, so the
  // answer is the same on every run rather than "whichever the loop saw last".
  ok(legalSeed(P, [NaN, NaN, 40]).axis === 'x', 'finite: an x/y tie between two non-finite axes breaks toward x');
  ok(legalSeed(P, [40, NaN, NaN]).axis === 'y', 'finite: …and a y/z tie breaks toward y');

  // The same hole by two other routes: a point with too few coordinates reads
  // `undefined` on the missing axis, and a string coordinate is not coerced.
  // Both used to pass the range check for exactly the reason NaN did.
  const missing = legalSeed(P, [40, 18]);
  ok(!missing.ok && missing.reason === 'hull' && missing.axis === 'z' && missing.nonFinite === true,
     `finite: a two-element point is refused on its missing z (got ${missing.ok}/${missing.axis})`);
  ok(missing.wall === HI.z, `finite: …naming the z wall ${HI.z} (got ${missing.wall})`);
  const str = legalSeed(P, [40, 18, '40']);
  ok(!str.ok && str.nonFinite === true, `finite: a string coordinate is refused rather than coerced (got ok=${str.ok})`);
  ok(str.reason === 'hull' && str.axis === 'z' && str.wall === HI.z,
     `finite: …as a hull violation on z/${HI.z}, even though '40' would have COMPARED fine (got ${str.reason}/${str.axis}/${str.wall})`);

  // …and it propagates through the summon, which is the call a UI actually
  // makes: every seed of a cube centred on NaN inherits the NaN x, so every one
  // is refused and there is no click to offer.
  const s = summonAt(P, 'cube', [NaN, 18, 40], { r: 1.6 });
  ok(!s.ok, 'finite: a summon centred on a NaN is refused');
  ok(s.verdict.refusals.length === s.con.seeds.length
     && s.verdict.refusals.every((rf) => rf.reason === 'hull' && rf.nonFinite === true),
     `finite: …at every one of its ${s.con.seeds.length} seeds, all for the hull reason (got ${s.verdict.refusals.length} refusals)`);

  // CONTROL — the finite path is untouched. This matters more than it looks:
  // `hullViolation` is called by `legalSeed` on every seed of every summon and
  // by the sweep in section 4 hundreds of times, so the real risk in this
  // change was a regression, not a wrong new assertion. The `nonFinite` key is
  // added ONLY on the non-finite branch, so a finite refusal is byte-identical
  // to the one this file has been asserting since it was written.
  ok(hullViolation(P, [40, 18, 40]) === null, 'control: an interior point still violates nothing');
  const fin = legalSeed(P, [0.5, 18.9, 38]);
  ok(fin.reason === 'hull' && fin.wall === 'B4' && fin.axis === 'x' && Math.abs(fin.depth - 0.5) < 1e-12,
     `control: a finite out-of-hull point is unchanged (got ${fin.wall}/${fin.axis}/${fin.depth})`);
  ok(!('nonFinite' in fin), 'control: …and carries no nonFinite key at all, so nothing that compares refusals sees a new field');
  // `A` and not `[40,18,40]`: nothing in this file establishes that the pocket
  // centre is seed-clear, and a control that asserts an unverified fixture fact
  // fails for a reason that has nothing to do with the code under test. `A` is
  // proven plantable by `foamworld.selftest.mjs` and asserted legal in §2.
  ok(legalSeed(P, A).ok, 'control: a proven-legal point is still legal');
  ok(legal.length > 0 && legal.length < CANDS.length, `control: the sweep still discriminates (${legal.length}/${CANDS.length} legal)`);
}

// ------------------------------------------------------------ determinism ---
{
  const c = constellation('cube', { centre: [40, 18, 40], r: 1.6, aniso: P.opts.aniso });
  ok(JSON.stringify(legalSummon(P, c)) === JSON.stringify(legalSummon(P, c)), 'determinism: the same question gets the same answer');
  ok(nearestSeed(P, [40, 18, 40]).index === nearestSeed(P, [40, 18, 40]).index, 'determinism: nearestSeed is stable');
}

console.log(failures === 0
  ? `✓ placement selftest — ${checks} checks pass (predicate vs. real inserts, pocket seed 2)`
  : `✗ placement selftest — ${failures}/${checks} FAILED`);
process.exit(failures === 0 ? 0 : 1);
