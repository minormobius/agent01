// plant/summon-view.js — the summon panel's two pure functions.
//
// `summon-session.mjs` decides what happened. This file decides what a person
// is TOLD happened, and where the dots go. Nothing here touches the DOM, the
// foam, or a threshold — it is the layer between a verdict and a screen, and
// it is a module rather than a block inside `index.html` for one reason:
//
//     A REGEX CAN ASSERT THAT SIX SENTENCES EXIST AND DIFFER.
//     IT CANNOT ASSERT THAT ONE OF THEM IS TRUE.
//
// `index-summon-wiring.selftest.mjs` was the strongest check available while
// this lived in the page, and that is exactly what it could do: read the HTML
// as text, derive the six blame values from `BLAME`, and confirm six distinct
// table entries. A sentence that said "1.50 m" while the verdict said 2.30 m
// would have passed it. `summon-view.selftest.mjs` drives a real session and
// re-extracts every number out of the rendered sentence, which is the only
// form of "the sentence is true" a machine can check.
//
// The precedent is `level-view.js`: `drawLevel` / `verdictLine` / `refusalLine`
// as pure functions with a selftest driving them on real fixtures. Same shape.
//
// -------------------------------------------------------------- sentences ---
//
// One per `BLAME` value, and they must READ DIFFERENTLY: "there is already rock
// there" and "that is too close to the one you just put down" are the same
// refusal to the foam and completely different news to a player. A refusal
// rendered as the word "refused" throws away everything the module computed.
//
// EVERY NUMBER IN A SENTENCE COMES OUT OF THE REFUSAL. None is re-typed here —
// not the seed gap, not the hull margins, not the anisotropy. A threshold
// written into a sentence is a second copy of it, free to drift away from the
// one the foam enforces, and the drift would be invisible: the sentence would
// still read perfectly.
//
// ------------------------------------------------------------- the plan -----
//
// `planShapes` returns plain descriptors — `frame`, `candidate`, `seed`,
// `summon`, `cursor` — in PLAN coordinates. The caller turns each into an
// element and picks the colours. So the coordinate map (world x → across, world
// z → down, stretched to the box the kernel will actually accept a seed in) is a
// pure function a test can evaluate at the corners, rather than a template
// literal nothing can reach.
//
// ------------------------------------------------------- the blamed part ----
//
// `placement.mjs` has promised since it shipped that "every refusal carries
// `summonSeed` — the index within `con.seeds`, where 0 is the centre — so a
// caller can light up the offending part of the shape", and until now NO CALLER
// EVER DID. The panel drew the whole constellation identically whether it landed
// or was refused, and the only news a player got was one sentence.
//
// `blamedSeeds` is that promise cashed, and it is a SEPARATE EXPORT rather than
// a private helper for one reason: it is the whole judgement in this layer, so
// it has to be gradeable on its own. Marking the centre unconditionally is the
// most likely wrong answer here (index 0 is what a naive loop reaches first) and
// it is indistinguishable from the right one if the only thing a test can ask is
// "is something marked".
//
// Node-and-browser, no dependencies, no randomness.

import { BLAME } from './summon-session.mjs';

/** Hull face id → the words a player would use. `B0`…`B5` are the ids
 *  `foamworld.js` puts on boundary faces; `placement.mjs` reports them. */
export const WALL_WORDS = {
  B0: 'the north wall', B1: 'the south wall', B2: 'the floor',
  B3: 'the ceiling', B4: 'the west wall', B5: 'the east wall',
};

// Never renders "NaN" or "undefined": a missing number reads as vague prose
// rather than as a broken sentence, which is the failure a player would see.
const m = (v) => (Number.isFinite(v) ? `${v.toFixed(2)} m` : 'some way');

export const BLAME_SENTENCE = {
  player: (rf, res) => `Too close to the ${rf.blameSolid || 'shape'} you summoned on move ${rf.blameMove} — ${m(rf.gap)} apart, and it needs ${m(rf.need)}.`,
  pocket: (rf, res) => `There is already rock there — ${m(rf.gap)} to the nearest of it, and a summon needs ${m(rf.need)} of clear ground.`,
  hull:   (rf, res) => `Part of the ${res.solid} pushes out through ${WALL_WORDS[rf.wall] || 'the wall'}, by ${m(rf.depth)}. Bring it back inside.`,
  self:   (rf, res) => `This ${res.solid} is too small to hold itself apart — two of its own points are ${m(rf.need - rf.gap)} too close. No spot would fix that.`,
  foam:   (rf, res) => `The foam would not close around the ${res.solid} there. Nothing you did was wrong; it needs somewhere with more room.`,
  caller: (rf, res) => `Pick a spot on the plan first — there is nowhere to put the ${res.solid} yet.`,
};

// Exhaustiveness, enforced rather than commented: if the session ever grows a
// seventh blame this module stops loudly at import time instead of rendering a
// blank refusal. The gate asserts the same thing from outside, and the whole
// suite runs before deploy-plant publishes — so this throw is the belt behind
// that brace and should never fire in front of a visitor.
for (const b of BLAME) {
  if (typeof BLAME_SENTENCE[b] !== 'function') {
    throw new Error(`summon-view: blame "${b}" has no sentence — a refusal would render blank`);
  }
}

/**
 * The one line under the plan, for ANY `preview()` or `place()` result.
 *
 * `null` means "nothing has been asked yet" — the panel's resting state — and
 * is handled here rather than in the page so the page has no verdict logic at
 * all. Otherwise the line always begins `✓ ` or `✗ `.
 *
 * `res.refusal || res.first` is REDUNDANT rather than load-bearing, and the
 * paragraph that used to be here said the opposite. `lp-fcf387` made both verbs
 * return both names, set to the same object and null together on a success, so
 * the two operands are now the same value. It is left in place because a `||`
 * that picks between two aliases costs nothing, and a removal that turned out to
 * be wrong would fail as a blank refusal in front of a visitor.
 */
export function summonSentence(res) {
  if (!res) return 'Click the plan to choose a spot.';
  if (res.ok) {
    // `pocketChanged` is how a landed summon differs from a spot that merely
    // looks clear — only `place()` sets it, and only when the foam committed.
    return res.pocketChanged
      ? `✓ the ${res.solid} landed — ${res.planted.length} seeds, move ${res.move}`
      : `✓ the ${res.solid} fits here — press summon`;
  }
  const rf = res.refusal || res.first;
  if (!rf) return '✗ Refused, and nothing said why — that is a bug, please report it.';
  const write = BLAME_SENTENCE[rf.blame];
  const body = write ? write(rf, res) : `The ${res.solid} cannot go there.`;
  return `✗ ${body}`;
}

/** The plan's box, in its own SVG user units. */
export const PLAN = { w: 640, h: 320, pad: 18 };

/**
 * World point → plan coordinates. `bounds` is `hullBounds(pocket)`, so the map
 * is derived from the kernel's own clamp rather than from numbers guessed to
 * match it. Exact at the corners: `bounds.x[0]` maps to `PLAN.pad` and
 * `bounds.x[1]` to `PLAN.w - PLAN.pad`.
 */
export function toPlan(bounds, p) {
  const sx = bounds.x[1] - bounds.x[0];
  const sz = bounds.z[1] - bounds.z[0];
  return [
    PLAN.pad + (p[0] - bounds.x[0]) / sx * (PLAN.w - 2 * PLAN.pad),
    PLAN.pad + (p[2] - bounds.z[0]) / sz * (PLAN.h - 2 * PLAN.pad),
  ];
}

/**
 * Which parts of the summon a verdict blames, as a `Set` of indices into
 * `res.con.seeds` (0 is the centre).
 *
 * Reads BOTH ends of a pair refusal — `summonSeed` and `otherSummonSeed` — so a
 * summon fighting itself lights up the two points that are too close rather than
 * just the lower-numbered one. Half a pair is not an answer to "which part".
 *
 * THREE THINGS RETURN THE EMPTY SET, and each is a deliberate claim rather than
 * a fallthrough:
 *
 *   · a SUCCESS. Nothing is wrong with it, so nothing is wrong with any part of
 *     it, and a shape drawn with one point highlighted reads as a refusal.
 *   · a `closure` / `nav` refusal. It carries `points` — plural, the whole batch
 *     — and no index at all, because a rebuild that failed its Euler gate or lost
 *     its floor cannot honestly be blamed on one seed. `summon-session.mjs`
 *     leaves those without a `summonSeed` ON PURPOSE, and inventing one here
 *     would turn that honesty into a lie a player can see.
 *   · a `metric` or `point` refusal. Same reason: a whole-constellation fault
 *     has no offending part.
 *
 * `Number.isInteger` rather than a truthiness test, because index 0 IS the
 * centre and it is the most commonly blamed seed of the lot.
 */
export function blamedSeeds(res) {
  const out = new Set();
  if (!res || res.ok) return out;
  for (const rf of res.refusals || []) {
    if (Number.isInteger(rf.summonSeed)) out.add(rf.summonSeed);
    if (Number.isInteger(rf.otherSummonSeed)) out.add(rf.otherSummonSeed);
  }
  return out;
}

/**
 * Everything the plan draws, as plain descriptors, in paint order:
 *
 *     { kind:'frame',     x, y, w, h }
 *     { kind:'candidate', cx, cy, r, opacity, at }      — where a summon fits
 *     { kind:'seed',      cx, cy, r, index, mine }      — every seed in the pocket
 *     { kind:'summon',    cx, cy, r, index, blamed }    — the shape under the cursor
 *     { kind:'cursor',    cx, cy, r }                   — only when one is set
 *
 * `mine` and `blamed` are the only judgements in here and they are the ones that
 * matter. A seed at or past `originCount` was planted by the player, and
 * everything before it was dug by the generator. A summon seed is `blamed` when
 * the verdict's own refusals name its index. The caller picks colours; this
 * decides which is which, because `originCount` is session state and a
 * refusal list is a verdict, and a renderer should not have to read either.
 *
 * `res` is the last `preview()` or `place()` result, or null. The summon layer
 * is drawn for a verdict that HAS a constellation and did not commit it:
 *
 *   · no `res`, or a bad point (`con` is null)  → no summon layer. Nothing was
 *     asked about, so there is no shape to show.
 *   · a landed `place()` (`pocketChanged`)      → no summon layer. Those seeds
 *     are in `pocket.seeds` now and would draw twice, the second time as a shape
 *     that is still merely proposed.
 *   · anything else — a refused preview, a refused place, or a preview that
 *     fits — draws every seed, with `blamed` set from `blamedSeeds(res)`. A
 *     legal preview therefore shows the footprint with nothing marked, which is
 *     the same descriptor shape and the honest one for "this would fit".
 *
 * Returns `[]` before a pocket exists, which is the state the panel is in for
 * the first tick after load.
 */
export function planShapes(pocket, bounds, cands, cursor, originCount, res) {
  if (!pocket || !bounds) return [];
  const out = [{ kind: 'frame', x: 1, y: 1, w: PLAN.w - 2, h: PLAN.h - 2 }];
  for (const c of cands || []) {
    const [cx, cy] = toPlan(bounds, c.centre);
    out.push({ kind: 'candidate', cx, cy, r: 3, opacity: 0.45, at: c.centre.slice() });
  }
  pocket.seeds.forEach((s, i) => {
    const [cx, cy] = toPlan(bounds, s);
    const mine = i >= originCount;
    out.push({ kind: 'seed', cx, cy, r: mine ? 5 : 4, index: i, mine });
  });
  // Over the pocket seeds so the shape reads as sitting on the ground, under
  // the cursor so the cursor is never hidden by one of its own points.
  if (res && res.con && Array.isArray(res.con.seeds) && !res.pocketChanged) {
    const blamed = blamedSeeds(res);
    res.con.seeds.forEach((q, i) => {
      const [cx, cy] = toPlan(bounds, q);
      const isBlamed = blamed.has(i);
      out.push({ kind: 'summon', cx, cy, r: isBlamed ? 7 : 5, index: i, blamed: isBlamed });
    });
  }
  if (cursor) {
    const [cx, cy] = toPlan(bounds, cursor);
    out.push({ kind: 'cursor', cx, cy, r: 9 });
  }
  return out;
}
