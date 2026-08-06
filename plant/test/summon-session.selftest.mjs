// plant/test/summon-session.selftest.mjs — certifies that a player can summon
// into a real pocket, and that the pocket REMEMBERS.
//
// Run: node plant/test/summon-session.selftest.mjs
//
// ----------------------------------------------------------- what is proven --
//
// The ticket's three requirements, and a fourth the first three would be weak
// without.
//
//   (a) A PLAYER-CAUSED REFUSAL IN A BOUNDED NUMBER OF MOVES — TWO, asserted.
//
//       "A refusal is possible" is worth nothing: the generated foam refuses
//       plenty of points before anyone touches it, and a controller that
//       discarded the pocket on every call would still produce refusals. What
//       is asserted here is that the refusal was caused BY THE PLAYER:
//
//         · a spot is previewed LEGAL on the freshly generated pocket;
//         · one cube is summoned five metres away, and it lands;
//         · the same spot is now previewed ILLEGAL — and the refusal names a
//           seed the player themselves planted, `blame:'player'`,
//           `blameMove:1`, with the pocket seed index recomputed independently
//           here rather than read back from the session.
//
//       The fixture is exact arithmetic, not a search. Two cubes at r=1.6 whose
//       centres are 5m apart in x: `solids.mjs` puts an axis-aligned neighbour
//       at exactly 2r = 3.2 (q = 1 for a unit axis normal, so the anisotropy
//       cannot move it), so A's +x neighbour sits at +3.2 and B's −x neighbour
//       at 5 − 3.2 = 1.8. Gap 1.4, against a refusal radius of 1.5. Every other
//       pair of the fourteen seeds is ≥ 1.8 — worked out in the comment at
//       section 4 — so the refusal count is 1, exactly, and it is asserted.
//
//   (b) A REFUSAL CHANGES NOTHING. Deep-compared against a snapshot taken
//       immediately before the refused move — every field, every Map, every
//       Infinity. `JSON.stringify` is NOT adequate: it renders `pocket.basinOf`
//       (a Map) as `{}` and every vertical membrane's `slope:Infinity` as null,
//       so a comparator built on it is blind to two whole classes of mutation.
//       The serializer is `multi-insert.selftest.mjs`'s, deliberately, so
//       "unchanged" means the same thing in both files.
//
//       And it is only worth something if the comparator can SEE a change, so a
//       CONTROL asserts it distinguishes the post-summon pocket from the
//       generated one. Without that, every assertion in section 5 would pass
//       for `() => true`.
//
//   (c) A SUCCESS IS VISIBLE, AND LANDS WHERE IT WAS ASKED. `state()` reports
//       the placement; the pocket grew by exactly |seeds|; and every planted
//       seed is compared componentwise with `===` against the constellation the
//       session built. That last one is the assertion that matters, because
//       `reformPocket` CLAMPS an out-of-bounds point and plants somewhere else —
//       "it succeeded" and "it planted what you asked for" are different
//       questions and only the second one is a summon.
//
//   (d) PREVIEW AND PLACE AGREE. The controller has two verdict paths — the
//       cheap predicate and the transaction — and a UI that greys ground out
//       with one while planting with the other is a UI that lies. Asserted in
//       the direction that is a theorem: preview refuses ⟹ place refuses, with
//       the same reason. The converse is NOT asserted and must not be; the
//       rebuild can still fail on closure or nav, neither decidable in advance.
//
//   (e) THE TWO VERBS RETURN THE SAME SHAPE. `preview` used to name the first
//       refusal `first` and `place` used to name it `refusal`, so a renderer
//       serving both had to write `res.refusal || res.first` — an expression
//       that goes silently wrong the moment either verb gains the other name.
//       Both now set both, to the same object, and §10 asserts it on a preview
//       refusal, a place refusal, a bad point on each verb, AND BOTH SUCCESS
//       PATHS — the last being the case an alias applied only to the failure
//       branches would get wrong while passing everything else. The field-list
//       assertion beside it is not tidiness: `first === refusal` passes for an
//       implementation that sets NEITHER, so the key set is the only check that
//       the names exist at all.
//
//   (f) …AND THEY NAME THE SAME PART OF THE SHAPE. A second asymmetry, and a
//       worse one, because it produced no suspicious expression anywhere: a
//       preview refusal carried `summonSeed` and a place refusal carried
//       `point`. A renderer doing `highlight(rf.summonSeed)` worked on every
//       preview and highlighted `undefined` — nothing at all, with no error —
//       for exactly the summons the player actually attempted. `_attribute` now
//       copies the kernel's index into `summonSeed` while keeping `point`, and
//       §10 asserts the claim a per-verb field check CANNOT make: one geometry
//       through BOTH verbs, and they name the same index. `closure` and `nav`
//       are exempt and must stay exempt — they name the whole batch, and an
//       invented index would be a lie a renderer would then highlight.
//
// Every blame value in the taxonomy is exercised against a real fixture —
// 'player', 'pocket', 'hull', 'self', 'caller' — because a classifier that is
// only ever shown one class is not a classifier.

import { reformPocketAll, seedGapSq, clampSeed, MIN_SEED_GAP_SQ } from '../foamworld.js';
import { constellation } from '../solids.mjs';
import { legalSeed, nearestSeed, MIN_SEED_GAP } from '../placement.mjs';
import { SummonSession, startSession, DEFAULT_R, BLAME } from '../summon-session.mjs';

let checks = 0, failures = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('  ✗ ' + msg); }
}

// ---------------------------------------------------------------- snapshot ---
// Verbatim from multi-insert.selftest.mjs. See the header for why JSON.stringify
// will not do.
function snap(v) {
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(snap).join(',') + ']';
  if (v instanceof Map) return 'Map{' + [...v.entries()].map(([k, x]) => JSON.stringify(String(k)) + ':' + snap(x)).join(',') + '}';
  if (v instanceof Set) return 'Set{' + [...v].map(snap).join(',') + '}';
  return '{' + Object.keys(v).map((k) => JSON.stringify(k) + ':' + snap(v[k])).join(',') + '}';
}

const SEED = 2;
const OFFSET = 5;        // metres in x between the two cube centres — see header

// ------------------------------------------------- 0. guards before start ----
{
  const cold = new SummonSession();
  let threw = 0;
  for (const f of [() => cold.preview([1, 1, 1]), () => cold.place('cube', [1, 1, 1]), () => cold.candidates()]) {
    try { f(); } catch (e) { if (/start\(\)/.test(e.message)) threw++; }
  }
  ok(threw === 3, `guard: preview/place/candidates all refuse before start() (${threw}/3)`);
  ok(cold.state().started === false && cold.state().seedCount === 0, 'guard: an unstarted session says so');

  let bad = 0;
  try { new SummonSession({ solid: 'trapezohedron' }); } catch { bad++; }
  try { cold.select('trapezohedron'); } catch { bad++; }
  ok(bad === 2, `guard: an unknown solid throws — it comes from a fixed enum, not from the world (${bad}/2)`);
}

// ------------------------------------------------- 1. start() and determinism --
const S = new SummonSession({ solid: 'cube' });
S.start(SEED);
const S0 = snap(S.pocket);      // the generated pocket, before anything happened

ok(S.pocket.seeds.length === 64 && S.pocket.W === 80 && S.pocket.H === 36 && S.pocket.D === 80,
   `fixture: 64 seeds in 80×36×80 (got ${S.pocket.seeds.length}, ${S.pocket.W}×${S.pocket.H}×${S.pocket.D})`);
ok(S.originCount === 64 && S.moves === 0 && S.placed.length === 0,
   'start: the session begins with nothing placed and no moves made');
ok(S.state().plantedCount === 0 && S.state().seed === SEED, 'start: …and reports that in state()');
ok(S.pocket.opts.aniso === 2.2, `fixture: the pocket metric is anisotropic (${S.pocket.opts.aniso}) — the whole reason a summon can go 22° wrong`);

// The scripted session, generated independently. Byte-identical, which is what
// makes it safe to run the bounded playthrough on a second session below.
const G = new SummonSession({ solid: 'cube' });
G.start(SEED);
ok(snap(G.pocket) === S0, 'start: two sessions on the same seed hold byte-identical pockets');
ok(startSession(SEED, { solid: 'cube' }).pocket.seeds.length === 64, 'start: the startSession() helper constructs and starts in one call');

// ------------------------------------------------- 2. candidates() ------------
// A highlight layer, and it must not lie about its own coverage.
const CAND = S.candidates({ solid: 'cube', clear: 2.2 });
ok(CAND.list.length > 0, `candidates: legal, comfortably-clear cube placements exist (${CAND.list.length} of ${CAND.found} found, ${CAND.scanned} scanned)`);
ok(CAND.scanned >= CAND.found && CAND.found >= CAND.list.length, 'candidates: scanned ≥ found ≥ listed');
ok(CAND.truncated === (CAND.found > CAND.list.length), 'candidates: `truncated` states outright whether the cap hid anything');
ok(CAND.list.every((c) => S.preview(c.centre, { solid: 'cube' }).ok), 'candidates: every centre it offers really does preview legal');
ok(CAND.list.every((c) => c.con.seeds.every((q) => nearestSeed(S.pocket, q).gap >= 2.2)),
   'candidates: …and the `clear` margin it was asked for was actually applied, seed by seed');
{
  const again = S.candidates({ solid: 'cube', clear: 2.2 });
  ok(snap(again.list.map((c) => c.centre)) === snap(CAND.list.map((c) => c.centre)),
     'candidates: the sweep is deterministic — same order, same points, every call');

  // CONTROL: the `clear` filter is applied at all. Without this, `clear` could
  // be ignored entirely and every assertion above would still pass.
  const loose = S.candidates({ solid: 'cube', clear: 0 });
  ok(loose.found >= CAND.found, `candidates: relaxing the clearance cannot find fewer (${loose.found} >= ${CAND.found})`);
  const impossible = S.candidates({ solid: 'cube', clear: 1e9 });
  ok(impossible.found === 0 && impossible.list.length === 0 && impossible.truncated === false,
     `candidates: an impossible clearance admits nothing (got ${impossible.found})`);

  // and the cap is REPORTED rather than silently applied
  const capped = S.candidates({ solid: 'cube', clear: 2.2, limit: 1 });
  ok(capped.list.length === 1 && capped.found === CAND.found && capped.truncated === (CAND.found > 1),
     `candidates: a cap truncates the list and says so, while still counting what it dropped (${capped.found})`);
}

// ------------------------------------------------- 3. choose the fixture ------
// Pairs where BOTH centres preview legal on the freshly generated pocket. That
// is the precondition the whole of (a) rests on: the second spot must be legal
// BEFORE the player acts, or its later refusal proves nothing.
const PAIRS = [];
for (const c of CAND.list) {
  const c2 = [c.centre[0] + OFFSET, c.centre[1], c.centre[2]];
  if (!S.preview(c2, { solid: 'cube' }).ok) continue;
  PAIRS.push({ c1: c.centre.slice(), c2 });
}
ok(PAIRS.length > 0, `fixture: centre pairs ${OFFSET}m apart with BOTH legal on the fresh pocket (${PAIRS.length})`);

// EXISTENCE, deliberately, exactly as multi-insert.selftest.mjs argues it: the
// closure gate and the nav gate are not decidable in advance, so one candidate
// refusing is evidence about voronoi degeneracy and not about this controller.
// Attempts are spread across the lattice so one bad neighbourhood cannot decide
// the run. A refused attempt leaves S untouched, so only the successful one
// changes anything.
const MAX_TRIES = 6;
const stride = Math.max(1, Math.floor(PAIRS.length / MAX_TRIES));
const TRIES = PAIRS.filter((_, i) => i % stride === 0).slice(0, MAX_TRIES);
let FIX = null, tried = 0;
for (const p of TRIES) {
  tried++;
  const r = S.place('cube', p.c1);
  if (r.ok) { FIX = p; break; }
}
ok(FIX !== null, `fixture: a cube really commits into the pocket (tried ${tried} of ${TRIES.length})`);
if (FIX) console.log(`  · fixture: cube A at [${FIX.c1.map((v) => v.toFixed(2))}], cube B at [${FIX.c2.map((v) => v.toFixed(2))}], after ${tried} attempt(s)`);

// ------------------------------------------------- 4. (a) the playthrough -----
// TWO MOVES on a fresh session. Everything above ran on S; G has been touched by
// nothing, so the move count below is the script's and only the script's.
let M1 = null, M2 = null, BOUND = -1, AFTER1 = null;
if (FIX) {
  const beforeLegal = G.preview(FIX.c2, { solid: 'cube' });
  ok(beforeLegal.ok, 'playthrough: spot B is LEGAL on the freshly generated pocket — before the player does anything');

  M1 = G.place('cube', FIX.c1);
  ok(M1.ok, 'playthrough: move 1 — the cube lands');
  AFTER1 = snap(G.pocket);

  const nowIllegal = G.preview(FIX.c2, { solid: 'cube' });
  ok(!nowIllegal.ok, 'playthrough: spot B is now REFUSED — the same question, a different answer, because the pocket advanced');
  ok(nowIllegal.first && nowIllegal.first.blame === 'player',
     `playthrough: …and the preview blames the PLAYER, not the foam (got ${nowIllegal.first && nowIllegal.first.blame})`);

  M2 = G.place('cube', FIX.c2);
  BOUND = G.moves;

  ok(!M2.ok, 'playthrough: move 2 — the summon is refused');
  ok(BOUND === 2, `playthrough: THE BOUND — a player-caused refusal is reached in exactly 2 moves (got ${BOUND})`);
  ok(G.placed.length === 1, `playthrough: …of which exactly one succeeded (${G.placed.length})`);

  // -- and the refusal is attributed to the player, precisely.
  //
  // Cube neighbours sit at exactly 2r = 3.2 along each axis (q = 1 for a unit
  // axis normal, so the metric cannot move them). Relative to A's centre the
  // fourteen seeds are:
  //     A: (0,0,0) (±3.2,0,0) (0,±3.2,0) (0,0,±3.2)
  //     B: (5,0,0) (5±3.2,0,0) (5,±3.2,0) (5,0,±3.2)
  // The only pair under 1.5 is A(+3.2,0,0) ↔ B(+1.8,0,0), gap 1.4. The next
  // closest are 1.8 (A centre ↔ B −x, and A +x ↔ B centre); anything involving
  // a y offset is ≥ 3.2·√2.2 ≈ 4.75. So: ONE refusal, and it names A's +x
  // neighbour — which is `placed.first + 1`, since `solids.mjs` orders cube
  // normals +x, −x, +y, −y, +z, −z after the centre.
  const f = M2.refusal;
  ok(M2.refusals.length === 1, `blame: exactly one pair is too close, and exactly one refusal is reported (${M2.refusals.length})`);
  ok(f && f.reason === 'seed', `blame: the reason is a seed collision (got ${f && f.reason})`);
  ok(f && f.blame === 'player', `blame: …caused by the player (got ${f && f.blame})`);
  ok(f && f.blameMove === 1 && f.blameSolid === 'cube', `blame: …by their move 1, a cube (got ${f && f.blameMove}/${f && f.blameSolid})`);
  ok(f && f.blameCentre && f.blameCentre.every((v, i) => v === FIX.c1[i]), 'blame: …and carries that summon’s centre, so a UI can light the offender up');
  ok(f && f.seedIndex === M1.placed.first + 1,
     `blame: the seed named is A’s +x neighbour — index ${M1.placed.first + 1} (got ${f && f.seedIndex})`);
  ok(f && f.seedIndex >= G.originCount, 'blame: …which is beyond the generated pocket, i.e. the player put it there');
  ok(f && f.point === 2, `blame: …and it says WHICH point of the new summon hit it — B’s −x neighbour, index 2 (got ${f && f.point})`);
  ok(f && Math.abs(f.gap - 1.4) < 1e-9, `blame: the gap is the 1.4m derived above (got ${f && f.gap})`);
  ok(f && f.gap < MIN_SEED_GAP && f.need === MIN_SEED_GAP, `blame: …which is inside the 1.5m refusal radius (${f && f.need})`);

  // INDEPENDENT RECOMPUTATION, from a different direction: run the kernel's own
  // literal refusal test on the blamed seed and the blamed point, taking both
  // from the pocket and from a constellation rebuilt here. A controller that
  // named an arbitrary seed passes everything above and dies on this.
  const conB = constellation('cube', { centre: FIX.c2, r: DEFAULT_R, aniso: G.pocket.opts.aniso });
  ok(f && seedGapSq(G.pocket.seeds[f.seedIndex], conB.seeds[f.point], G.pocket.opts.aniso) < MIN_SEED_GAP_SQ,
     'blame: the blamed seed is genuinely inside the kernel’s refusal radius of the blamed point');
  ok(f && G.ownerOf(f.seedIndex) && G.ownerOf(f.seedIndex).move === 1,
     'blame: and the session’s own ownership map agrees the player planted it');
  ok(G.ownerOf(0) === null && G.ownerOf(G.originCount - 1) === null,
     'blame: every seed the GENERATOR made is owned by nobody — the pocket/player boundary is originCount');
}

// ------------------------------------------------- 5. (b) rollback ------------
if (FIX && M2) {
  ok(M2.pocketChanged === false && M2.planted.length === 0, 'rollback: the refused move reports that it changed nothing');
  ok(snap(G.pocket) === AFTER1,
     'rollback: the pocket is BYTE-FOR-BYTE what it was before the refused move — deep-compared field by field, including basinOf (a Map) and every Infinity slope, not a length check');
  ok(M2.pocket === G.pocket, 'rollback: …and the pocket handed back is the session’s own, unchanged');
  ok(G.pocket.seeds.length === G.originCount + M1.placed.count, 'rollback: no seed of the refused summon leaked in');
  ok(G.state().plantedCount === M1.placed.count && G.placed.length === 1, 'rollback: …and the session still knows about exactly one placement');

  // THE CONTROL. Without it every assertion above would pass for a comparator
  // stuck on "equal".
  ok(AFTER1 !== S0, 'control: the snapshot comparator distinguishes the post-summon pocket from the generated one');
  // …and it is sensitive to exactly the two things JSON.stringify is blind to,
  // which is the entire justification for carrying a serializer at all.
  const rich = { m: new Map([['k', 1]]), s: Infinity };
  const poor = { m: new Map(), s: null };
  ok(snap(rich) !== snap(poor) && JSON.stringify(rich) === JSON.stringify(poor),
     'control: the serializer sees a Map’s contents and an Infinity; JSON.stringify calls those two objects identical, which is why it is not used here');
}

// ------------------------------------------------- 6. (c) the success ---------
if (FIX && M1) {
  const st = G.state();
  ok(st.placed.length === 1 && st.placed[0].move === 1 && st.placed[0].solid === 'cube',
     'success: the placement is visible in state() — move number and solid');
  ok(st.placed[0].centre.every((v, i) => v === FIX.c1[i]), 'success: …at the centre it was asked for');
  ok(st.seedCount === st.originCount + 7 && st.plantedCount === 7,
     `success: a cube is 7 seeds and all 7 are in the pocket (got ${st.plantedCount})`);
  ok(M1.planted.length === 7 && M1.planted.every((ix, i) => ix === G.originCount + i),
     'success: `planted` indexes the new seeds in the order they were given');

  // THE assertion that matters: the foam clamps rather than refuses, so
  // "it worked" and "it planted what you asked for" are different questions.
  ok(M1.planted.every((ix, i) => G.pocket.seeds[ix].every((v, k) => v === M1.con.seeds[i][k])),
     'success: every planted seed is EXACTLY where it was asked for — componentwise ===, no clamp, no relocation');
  ok(G.pocket.seeds[M1.planted[0]].every((v, k) => v === FIX.c1[k]), 'success: and planted[0] is the constellation’s centre');
  ok(G.pocket.cells.length === 64 + 7, `success: each planted seed became a chamber (${G.pocket.cells.length - 64})`);
  ok(G.pocket.startCell === S.pocket.startCell, 'success: the start chamber survived the reform');

  // state() must COPY. A renderer that mutates what it was handed must not be
  // able to rewrite the session's history.
  const grab = G.state();
  grab.placed[0].centre[0] = 999;
  ok(G.placed[0].centre[0] !== 999, 'success: state() hands out copies, not the session’s own arrays');
}

// ------------------------------------------------- 7. (d) preview ⟹ place -----
// Asserted only in the direction that is a theorem. S has one cube in it from
// section 3, which is what makes the 'player' case reachable here too.
if (FIX) {
  const cases = [
    { name: 'a spot the player blocked', p: FIX.c2, reason: 'seed', blame: 'player' },
    { name: 'outside the x=0 wall', p: [0.5, 18.9, 38], reason: 'hull', blame: 'hull' },
    { name: 'standing on a generated seed', p: clampSeed(S.pocket, S.pocket.seeds[10]), reason: 'seed', blame: 'pocket' },
  ];
  for (const c of cases) {
    const pv = S.preview(c.p, { solid: 'cube' });
    const before = snap(S.pocket);
    const pl = S.place('cube', c.p);
    ok(!pv.ok, `agreement: preview refuses ${c.name}`);
    ok(!pl.ok, `agreement: …and so does place (${c.name})`);
    ok(pv.first.reason === c.reason && pl.refusal.reason === c.reason,
       `agreement: …for the same reason, '${c.reason}' (preview ${pv.first.reason}, place ${pl.refusal.reason})`);
    ok(pv.first.blame === c.blame && pl.refusal.blame === c.blame,
       `agreement: …blamed on '${c.blame}' by both (preview ${pv.first.blame}, place ${pl.refusal.blame})`);
    ok(snap(S.pocket) === before, `agreement: …and the pocket is untouched (${c.name})`);
  }
  // the 'pocket' case must NOT carry a blameMove — nobody placed it
  const gen = S.preview(clampSeed(S.pocket, S.pocket.seeds[10]), { solid: 'cube' });
  ok(gen.first.blameMove === undefined, 'agreement: a refusal blamed on the generated foam names no move');
  ok(S.preview([0.5, 18.9, 38], { solid: 'cube' }).first.wall === 'B4',
     'agreement: the hull refusal still names its wall, so a UI can highlight the face');
}

// §10 needs a real `batch` refusal, which costs a fixture sweep to site. It
// borrows the one section 8 already pays for, the same way it borrows section
// 9's landed summon.
let TINY_AT = null;

// ------------------------------------------------- 8. the rest of the taxonomy
if (FIX) {
  // 'self' — a solid so small its own seeds are inside each other's gap. Both
  // layers report it and they use DIFFERENT words ('self' in placement.mjs,
  // 'batch' in the kernel); the session normalises both to blame 'self', which
  // is the point of having a taxonomy at all.
  //
  // The spot must have ROOM, and FIX.c1 will not do — the player's own cube
  // centre is sitting on it, so the seed refusal would SHADOW the self refusal
  // this block is about (`legalSummon` reports per-seed refusals before self
  // ones, so `first` would be the wrong kind). A centre 3.5m clear of every seed
  // is enough by the triangle inequality: a tiny cube's neighbours are 1.0m away
  // in x/z and 1.0·√2.2 = 1.483m in y, and 3.5 − 1.483 = 2.02 > 1.5.
  const ROOMY = S.candidates({ solid: 'cube', clear: 3.5 });
  ok(ROOMY.list.length > 0, `taxonomy fixture: spots 3.5m clear of every seed exist (${ROOMY.list.length})`);
  TINY_AT = ROOMY.list.length ? ROOMY.list[0].centre : FIX.c1;
  ok(S.preview(TINY_AT, { solid: 'cube' }).ok, 'taxonomy fixture: …and at full size that spot is perfectly legal, so only `r` is doing the work below');

  const tiny = { r: 0.5 };
  const pv = S.preview(TINY_AT, { solid: 'cube', ...tiny });
  const pl = S.place('cube', TINY_AT, tiny);
  ok(!pv.ok && pv.first.reason === 'self' && pv.first.blame === 'self',
     `taxonomy: a cube at r=0.5 fights itself — preview says 'self' (got ${pv.first && pv.first.reason})`);
  ok(!pl.ok && pl.refusal.reason === 'batch' && pl.refusal.blame === 'self',
     `taxonomy: …the kernel calls the same thing 'batch', and the session blames both on 'self' (got ${pl.refusal && pl.refusal.reason})`);

  // 'caller' — a point that is not three finite numbers. See the module header:
  // the layers below refuse it too, so this guard is not compensating for a
  // divergence any more. What it still does — and what nothing below it can do —
  // is call the refusal the CALLER'S, which is a different claim from "outside
  // the hull" and is the whole of the session's contract here.
  const before = S.moves;
  const pocketBefore = S.pocket;
  for (const bad of [[NaN, 18, 40], [1, 2], 'nowhere', null, [1, Infinity, 3]]) {
    const b1 = S.preview(bad, { solid: 'cube' }), b2 = S.place('cube', bad);
    ok(!b1.ok && b1.first.reason === 'point' && b1.first.blame === 'caller', `taxonomy: preview refuses ${JSON.stringify(bad)}`);
    ok(!b2.ok && b2.refusal.reason === 'point' && b2.refusal.blame === 'caller'
       && b2.move === null && b2.pocketChanged === false && b2.pocket === pocketBefore,
       `taxonomy: …and place refuses ${JSON.stringify(bad)} as the caller’s bug — `
       + `move:${b2.move} blame:${b2.refusal && b2.refusal.blame} pocketChanged:${b2.pocketChanged}`);
  }
  ok(S.moves === before, `taxonomy: a bad argument never advanced the move count (${before} → ${S.moves})`);
  ok(S.pocket === pocketBefore, 'taxonomy: …and never swapped the pocket for a new one');

  // BOTH LAYERS BELOW REFUSE IT NOW, and this used to be a console.log saying
  // the opposite. `legalSeed` once answered ok:true for a NaN point — every
  // ordered comparison against NaN is false, so there was no hull violation and
  // no seed gap — while the kernel refused the same point by a different route
  // (`clampSeed`, then `c[i] === p[i]`, which NaN fails). `placement.mjs` closed
  // that hole with an explicit `Number.isFinite` test, so what is pinned here is
  // AGREEMENT rather than a logged disagreement: three layers, three
  // vocabularies, one verdict.
  const kn = reformPocketAll(S.pocket, [[NaN, 18, 40]]);
  ok(kn.first.reason === 'hull',
     'taxonomy: the kernel itself refuses a NaN coordinate (as a hull violation)');
  const pn = legalSeed(S.pocket, [NaN, 18, 40]);
  ok(!pn.ok && pn.reason === 'hull' && pn.axis === 'x' && pn.nonFinite === true,
     `taxonomy: …and so does the predicate, naming the non-finite axis (got ok=${pn.ok} ${pn.reason}/${pn.axis}/nonFinite=${pn.nonFinite})`);

  // every blame the session ever emits is in the published vocabulary
  const seen = new Set();
  for (const p of [FIX.c2, [0.5, 18.9, 38], clampSeed(S.pocket, S.pocket.seeds[10]), [NaN, 1, 1]]) {
    for (const rf of S.preview(p, { solid: 'cube' }).refusals) seen.add(rf.blame);
  }
  for (const rf of S.preview(TINY_AT, { solid: 'cube', r: 0.5 }).refusals) seen.add(rf.blame);
  ok([...seen].every((b) => BLAME.includes(b)), `taxonomy: every blame emitted is in BLAME (${[...seen].sort().join(', ')})`);
  ok(seen.has('player') && seen.has('pocket') && seen.has('hull') && seen.has('self') && seen.has('caller'),
     `taxonomy: and five of the six classes were reached by a real fixture (${[...seen].sort().join(', ')})`);
}

// §10 needs a REAL successful place() result, and a success costs a rebuild, so
// it borrows the one section 9 already paid for rather than buying a second.
let LANDED = null;

// ------------------------------------------------- 9. a refusal is not fatal --
// The session must remain usable after being told no. A controller that
// corrupted its pocket on a refusal would pass sections 4-5 (which only compare
// against a snapshot) and die here.
if (FIX && M2) {
  const far = CAND.list
    .filter((c) => Math.hypot(c.centre[0] - FIX.c1[0], c.centre[1] - FIX.c1[1], c.centre[2] - FIX.c1[2]) > 14)
    .filter((c) => G.preview(c.centre, { solid: 'cube' }).ok);
  ok(far.length > 0, `recovery: legal spots remain after the summon (${far.length})`);
  let landed = null, n = 0;
  const spread = Math.max(1, Math.floor(far.length / 3));
  for (const c of far.filter((_, i) => i % spread === 0).slice(0, 3)) {
    n++;
    const r = G.place('cube', c.centre);
    if (r.ok) { landed = r; LANDED = r; break; }
  }
  ok(landed !== null, `recovery: a legal summon still lands after a refused one (tried ${n})`);
  if (landed) {
    ok(G.placed.length === 2 && landed.move === G.moves, `recovery: …and it is move ${landed.move}, the session’s second placement`);
    ok(G.pocket.seeds.length === G.originCount + 14, `recovery: fourteen seeds from two cubes (${G.pocket.seeds.length - G.originCount})`);
    ok(G.ownerOf(landed.placed.first).move === landed.move, 'recovery: ownership still resolves for the newest summon');
    ok(G.ownerOf(M1.placed.first).move === 1, 'recovery: …and still resolves for the first one, so indices did not shift');
    ok(landed.planted.every((ix, i) => G.pocket.seeds[ix].every((v, k) => v === landed.con.seeds[i][k])),
       'recovery: and the second summon also landed exactly where it was asked');
  }
}

// ------------------------------------------------ 10. first === refusal ------
// The two verbs used to name the first refusal DIFFERENTLY: `preview` returned
// `first`, `place` returned `refusal`. Any renderer serving both had to write
// `res.refusal || res.first` — and that expression is silently wrong the moment
// either verb gains the other name, because `||` picks whichever is non-null
// rather than the one this verb actually set. `summon-view.js` carries exactly
// that expression. Both verbs now set BOTH names, to the same object.
//
// TWO THINGS MAKE THIS SECTION MORE THAN A TAUTOLOGY, and neither is obvious:
//
//   · `res.first === res.refusal` PASSES FOR AN IMPLEMENTATION THAT SETS
//     NEITHER — `undefined === undefined`. So the field-list assertion is
//     load-bearing rather than tidiness: it is the only check here that the
//     names exist at all, and on a refusal `first.reason` is asserted to be a
//     real string so the identity is not two undefineds agreeing.
//
//   · THE SUCCESS PATHS ARE THE INTERESTING ONES. An implementation that
//     aliased only the failure branches passes every refusal case below and
//     leaves `first` undefined on a landed summon — where `undefined || null`
//     is still null and nothing looks wrong, right up until a stale refusal is
//     sitting in the other name. Both are asserted `null` TOGETHER.
if (FIX) {
  // Neither verb changes its shape between paths, so a renderer never has to
  // test whether a field is present. A field list no test reads is a field list
  // that drifts — which is how this ticket happened.
  const PREVIEW_KEYS = ['centre', 'con', 'first', 'ok', 'r', 'refusal', 'refusals', 'solid'].join(',');
  const PLACE_KEYS = ['centre', 'con', 'first', 'move', 'ok', 'placed', 'planted',
    'pocket', 'pocketChanged', 'refusal', 'refusals', 'solid'].join(',');
  const keys = (o) => Object.keys(o).sort().join(',');

  // A spot that still previews legal on S. Section 9 proved such spots exist on
  // G, and S holds a SUBSET of G's seeds — both grew from pocket seed 2, S has
  // only cube A, G has cube A plus the one section 9 landed — so legal-on-G
  // implies legal-on-S and the same filter is reused rather than a new fixture
  // invented.
  const openS = CAND.list
    .filter((c) => Math.hypot(c.centre[0] - FIX.c1[0], c.centre[1] - FIX.c1[1], c.centre[2] - FIX.c1[2]) > 14)
    .filter((c) => S.preview(c.centre, { solid: 'cube' }).ok);
  ok(openS.length > 0, `alias fixture: spots that still preview legal on S (${openS.length})`);

  const CASES = [
    { verb: 'preview', name: 'a player-blocked spot', refused: true,
      res: S.preview(FIX.c2, { solid: 'cube' }) },
    { verb: 'preview', name: 'a non-finite point', refused: true,
      res: S.preview([NaN, 18, 40], { solid: 'cube' }) },
    { verb: 'preview', name: 'A SUCCESS', refused: false,
      res: openS.length ? S.preview(openS[0].centre, { solid: 'cube' }) : null },
    { verb: 'place', name: 'a player-blocked spot', refused: true,
      res: S.place('cube', FIX.c2) },
    { verb: 'place', name: 'a non-finite point', refused: true,
      res: S.place('cube', [NaN, 18, 40]) },
    { verb: 'place', name: 'A SUCCESS', refused: false, res: LANDED },
  ];

  for (const c of CASES) {
    const res = c.res;
    ok(res !== null && res !== undefined, `alias: a real ${c.verb}() result for ${c.name} was obtained`);
    if (!res) continue;

    ok(keys(res) === (c.verb === 'preview' ? PREVIEW_KEYS : PLACE_KEYS),
       `alias: ${c.verb}() ${c.name} returns the published field list — got ${keys(res)}`);
    ok(res.ok === !c.refused,
       `alias fixture: ${c.verb}() ${c.name} is ${c.refused ? 'refused' : 'ok'} (got ok=${res.ok})`);
    ok(res.first === res.refusal,
       `alias: ${c.verb}() ${c.name} — first and refusal are the SAME value `
       + `(first ${res.first === null ? 'null' : typeof res.first}, refusal ${res.refusal === null ? 'null' : typeof res.refusal})`);

    const expect = res.refusals.length ? res.refusals[0] : null;
    ok(res.first === expect,
       `alias: ${c.verb}() ${c.name} — and that value is refusals[0] ITSELF, so the two names cannot drift to two different refusals`);

    if (c.refused) {
      ok(res.first && typeof res.first.reason === 'string' && BLAME.includes(res.first.blame),
         `alias: ${c.verb}() ${c.name} really carries a refusal, so the identity above is not two undefineds agreeing `
         + `(reason ${res.first && res.first.reason}, blame ${res.first && res.first.blame})`);
    } else {
      // THE CASE A FAILURE-PATH-ONLY ALIAS GETS WRONG.
      ok(res.first === null && res.refusal === null,
         `alias: a successful ${c.verb}() sets BOTH names to null — not one null and one undefined`);
      ok(res.refusals.length === 0, `alias: …and a success reports no refusals at all`);
    }
  }

  // WHICH PART OF THE SHAPE was a SECOND asymmetry, and it was worse than the
  // first because it was invisible. `preview` named it `summonSeed` (from
  // `legalSummon`); `place` named it `point` (from `reformPocketAll`). The
  // `first`/`refusal` split above produced a suspicious `res.refusal || res.first`
  // the moment anyone wrote a shared renderer. THIS ONE PRODUCED NOTHING:
  // `highlight(rf.summonSeed)` worked on every preview and highlighted
  // `undefined` — nothing at all, with no error — for exactly the summons the
  // player actually attempted.
  //
  // The assertions are ordered weakest-first, because only the last one could not
  // have been made by a per-verb field check:
  //
  //   · every indexed refusal, on BOTH verbs, carries a numeric `summonSeed`
  //     inside `[0, con.seeds.length)`;
  //   · on the place path it EQUALS its own `point`, so the normalisation is a
  //     copy and not a recomputation that could drift;
  //   · AND BOTH VERBS NAME THE SAME INDEX FOR THE SAME GEOMETRY. That is the
  //     claim a renderer actually rests on, and it is the reason this section
  //     runs one fixture through both verbs rather than checking each alone.
  {
    const pv = S.preview(FIX.c2, { solid: 'cube' });
    const pl = S.place('cube', FIX.c2);
    const INDEXED = ['hull', 'seed', 'self', 'batch'];
    const nSeeds = pv.con ? pv.con.seeds.length : -1;
    ok(nSeeds === 7 && pl.con && pl.con.seeds.length === nSeeds,
       `fields fixture: both verbs built the same 7-seed cube for the same point (${nSeeds}/${pl.con && pl.con.seeds.length})`);

    const idx = { preview: [], place: [] };
    for (const [verb, res] of [['preview', pv], ['place', pl]]) {
      for (const rf of res.refusals) {
        if (!INDEXED.includes(rf.reason)) continue;
        idx[verb].push(rf.summonSeed);
        ok(Number.isInteger(rf.summonSeed) && rf.summonSeed >= 0 && rf.summonSeed < nSeeds,
           `fields: a ${verb} '${rf.reason}' refusal names summonSeed inside [0,${nSeeds}) (got ${rf.summonSeed})`);
      }
    }
    // THE INVERTED ASSERTIONS, rewritten rather than deleted. `place` used to be
    // pinned as naming `point` and NOT `summonSeed`; it now names both, and they
    // agree. `preview` still gains no batch index, which pins that the
    // normalisation only ever runs on the side that needed it.
    for (const rf of pl.refusals) {
      if (!INDEXED.includes(rf.reason)) continue;
      ok(rf.summonSeed === rf.point,
         `fields: a place '${rf.reason}' refusal names BOTH, and they agree (summonSeed ${rf.summonSeed}, point ${rf.point})`);
    }
    for (const rf of pv.refusals) {
      if (!INDEXED.includes(rf.reason)) continue;
      ok(rf.point === undefined,
         `fields: a preview '${rf.reason}' refusal gains no batch index — only the kernel side is normalised (point ${rf.point})`);
    }
    ok(idx.preview.length > 0 && idx.place.length > 0,
       `fields: both loops actually ran against a refusal — otherwise they assert nothing (${idx.preview.length} preview, ${idx.place.length} place)`);

    // THE CROSS-VERB ASSERTION. Same pocket, same centre, same constellation:
    // section 4 derived by hand that exactly one pair is under 1.5m and that it
    // is B’s −x neighbour, index 2. Both verbs must say so.
    ok(snap(idx.preview.slice().sort()) === snap(idx.place.slice().sort()),
       `fields: preview and place name THE SAME part of the shape for the same geometry `
       + `(preview [${idx.preview}], place [${idx.place}])`);
    ok(snap(idx.preview) === snap([2]) && snap(idx.place) === snap([2]),
       `fields: …and that part is index 2, B’s −x neighbour, exactly as section 4 derived `
       + `(preview [${idx.preview}], place [${idx.place}])`);

    // `hull` is the third indexed reason and the fixture is section 7’s: a cube
    // centred at x=0.5, whose centre (index 0) and −x neighbour (index 2, at
    // 0.5 − 3.2 = −2.7) both sit outside the x ≥ 1 wall. Compared as SETS rather
    // than as lists, and the difference is not fussiness: `legalSeed` reports
    // only the NEAREST colliding pocket seed per summon seed, while the kernel
    // reports EVERY colliding pair, so the two verbs can legitimately differ in
    // MULTIPLICITY on a point that is both out of hull and near foam. They must
    // never differ in WHICH parts of the shape they blame.
    {
      const HULL_AT = [0.5, 18.9, 38];
      const hpv = S.preview(HULL_AT, { solid: 'cube' });
      const hpl = S.place('cube', HULL_AT);
      const named = (res) => [...new Set(res.refusals
        .filter((rf) => INDEXED.includes(rf.reason))
        .map((rf) => rf.summonSeed))].sort();
      const hullOf = (res) => [...new Set(res.refusals
        .filter((rf) => rf.reason === 'hull').map((rf) => rf.summonSeed))].sort();
      ok(!hpv.ok && !hpl.ok, 'fields fixture: the out-of-hull cube is refused by both verbs');
      ok(snap(hullOf(hpv)) === snap([0, 2]) && snap(hullOf(hpl)) === snap([0, 2]),
         `fields: both verbs blame the SAME parts for the hull — the centre and the −x neighbour `
         + `(preview [${hullOf(hpv)}], place [${hullOf(hpl)}])`);
      ok(snap(named(hpv)) === snap(named(hpl)),
         `fields: …and the full set of blamed parts agrees across the two verbs `
         + `(preview [${named(hpv)}], place [${named(hpl)}])`);
      for (const rf of hpl.refusals) {
        if (rf.reason !== 'hull') continue;
        ok(rf.summonSeed === rf.point && typeof rf.wall === 'string',
           `fields: a place hull refusal names both indices and still names its wall (${rf.summonSeed}/${rf.point}, ${rf.wall})`);
      }
    }

    // A `batch` refusal is the only place `otherPoint` occurs. Section 8’s tiny
    // cube — a solid so small its own seeds are inside each other’s gap — is the
    // fixture, borrowed rather than sited a second time.
    if (TINY_AT) {
      const tinyPl = S.place('cube', TINY_AT, { r: 0.5 });
      const tinyPv = S.preview(TINY_AT, { solid: 'cube', r: 0.5 });
      const batch = tinyPl.refusals.filter((rf) => rf.reason === 'batch');
      ok(batch.length > 0, `fields fixture: the tiny cube really produces 'batch' refusals to check (${batch.length})`);
      for (const rf of batch) {
        ok(rf.summonSeed === rf.point && rf.otherSummonSeed === rf.otherPoint,
           `fields: a batch refusal names BOTH ends in both vocabularies `
           + `(${rf.summonSeed}/${rf.point} and ${rf.otherSummonSeed}/${rf.otherPoint})`);
        ok(Number.isInteger(rf.otherSummonSeed) && rf.otherSummonSeed !== rf.summonSeed
           && rf.otherSummonSeed < nSeeds,
           `fields: …and the two ends are distinct seeds of the same summon (${rf.summonSeed}, ${rf.otherSummonSeed})`);
      }
      // The self-collision case, cross-verb: `placement.mjs` says 'self' and the
      // kernel says 'batch', and after normalisation they must name the same
      // PAIRS — not merely the same count.
      const pairs = (list) => list.map((rf) => `${rf.summonSeed}-${rf.otherSummonSeed}`).sort();
      const selfPairs = pairs(tinyPv.refusals.filter((rf) => rf.reason === 'self'));
      const batchPairs = pairs(batch);
      ok(selfPairs.length > 0 && snap(selfPairs) === snap(batchPairs),
         `fields: 'self' and 'batch' name the SAME pairs of the shape (${selfPairs.join(' ')} | ${batchPairs.join(' ')})`);
    }

    // THE EXEMPTION, asserted directly rather than left to a fixture that may
    // never produce it. `closure` and `nav` are not decidable before the rebuild,
    // so they may not occur here at all — and they must gain NO index, because a
    // rebuild that failed its Euler gate cannot honestly be blamed on one seed
    // and an invented index is a lie a renderer would then highlight.
    for (const reason of ['closure', 'nav']) {
      const a = S._attribute({ reason, points: [[1, 2, 3], [4, 5, 6]] });
      ok(a.summonSeed === undefined && a.otherSummonSeed === undefined && a.blame === 'foam',
         `fields: a '${reason}' refusal gains no summonSeed — it names the whole batch (got ${a.summonSeed}, blame ${a.blame})`);
    }
    let foamSeen = 0;
    for (const res of [pv, pl]) {
      for (const rf of res.refusals) {
        if (rf.reason !== 'closure' && rf.reason !== 'nav') continue;
        foamSeen++;
        ok(rf.summonSeed === undefined && Array.isArray(rf.points),
           `fields: a real '${rf.reason}' refusal carries points and no index`);
      }
    }
    console.log(`  · fields: ${foamSeen} closure/nav refusal(s) arose on this fixture; the exemption is pinned against _attribute regardless`);

    // CONTROLS ON THE NORMALISATION ITSELF. Without these, an implementation
    // that recomputed the index rather than copying it, or that clobbered the
    // preview path’s authoritative one, passes every assertion above.
    const copied = S._attribute({ reason: 'batch', point: 3, otherPoint: 5 });
    ok(copied.summonSeed === 3 && copied.otherSummonSeed === 5
       && copied.point === 3 && copied.otherPoint === 5,
       'fields control: the kernel’s indices are COPIED, and both original names keep their values — nothing was renamed');
    const kept = S._attribute({ reason: 'seed', point: 1, summonSeed: 9 });
    ok(kept.summonSeed === 9 && kept.point === 1,
       'fields control: an existing summonSeed is never overwritten — the preview path’s is authoritative');
    const bare = S._attribute({ reason: 'point', at: null });
    ok(bare.summonSeed === undefined && bare.otherSummonSeed === undefined,
       'fields control: a refusal that carries no index gains none');

    // THE CONTROL THAT PROVES THE NORMALISATION IS LOAD-BEARING, and without it
    // every place-path assertion above is satisfied by a world in which the
    // KERNEL already supplied `summonSeed` — where `_attribute`'s copy would be a
    // no-op nobody could detect, and the ticket would have been busywork. Same
    // shape as multi-insert.selftest.mjs proving the naive loop really would have
    // half-applied before asserting that the transaction does not: a fix is only
    // worth testing once the defect is exhibited.
    //
    // So: call the kernel DIRECTLY, on the same geometry §10 has been using, and
    // pin the defect this ticket exists to close.
    {
      const conRaw = constellation('cube', { centre: FIX.c2, r: DEFAULT_R, aniso: S.pocket.opts.aniso });
      const raw = reformPocketAll(S.pocket, conRaw.seeds);
      ok(!raw.ok && raw.refusals.length > 0,
         `fields control: the kernel refuses the same geometry when called directly (${raw.refusals.length} refusal(s))`);
      ok(raw.refusals.every((rf) => rf.summonSeed === undefined && rf.otherSummonSeed === undefined),
         'fields control: …and NOT ONE of its raw refusals carries summonSeed — so the copy in _attribute is what puts it there, and this section is testing something');
      ok(raw.refusals.every((rf) => typeof rf.point === 'number'),
         'fields control: …while every one of them does carry `point`, which is the field being normalised');
    }
  }
}

console.log(failures === 0
  ? `✓ summon-session selftest — ${checks} checks pass (player-caused refusal in 2 moves, pocket seed ${SEED})`
  : `✗ summon-session selftest — ${failures}/${checks} FAILED`);
process.exit(failures === 0 ? 0 : 1);
