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
// `cursor` — in PLAN coordinates. The caller turns each into an element and
// picks the colours. So the coordinate map (world x → across, world z → down,
// stretched to the box the kernel will actually accept a seed in) is a pure
// function a test can evaluate at the corners, rather than a template literal
// nothing can reach.
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
 * The two verbs name the first refusal differently — `preview` returns `first`,
 * `place` returns `refusal` — so both are read. That asymmetry is in
 * `summon-session.mjs` and is not this file's to fix.
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
 * Everything the plan draws, as plain descriptors, in paint order:
 *
 *     { kind:'frame',     x, y, w, h }
 *     { kind:'candidate', cx, cy, r, opacity, at }      — where a summon fits
 *     { kind:'seed',      cx, cy, r, index, mine }      — every seed in the pocket
 *     { kind:'cursor',    cx, cy, r }                   — only when one is set
 *
 * `mine` is the only judgement in here and it is the one that matters: a seed
 * at or past `originCount` was planted by the player, and everything before it
 * was dug by the generator. The caller picks colours; this decides which is
 * which, because `originCount` is session state and a renderer should not have
 * to know what it means.
 *
 * Returns `[]` before a pocket exists, which is the state the panel is in for
 * the first tick after load.
 */
export function planShapes(pocket, bounds, cands, cursor, originCount) {
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
  if (cursor) {
    const [cx, cy] = toPlan(bounds, cursor);
    out.push({ kind: 'cursor', cx, cy, r: 9 });
  }
  return out;
}
