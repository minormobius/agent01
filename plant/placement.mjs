// placement.mjs — "can this be summoned HERE?", answered before anything is tried.
//
// `solids.mjs` can say how much clear space a summon NEEDS (`clearanceNeeded`,
// `seedGap`, `selfCompatible`, `pairGap`). `foamworld.js` can say whether an
// insert WORKED — by doing it, rebuilding the whole lattice, and returning
// `null` if it refused. Nothing could say whether a pocket HAS the room before
// paying for the rebuild. That gap is this file.
//
// ------------------------------------------------------------- the claim ---
//
// This predicate is a **necessary condition**, exactly and deliberately:
//
//     legal(p) === false   ⟹   reformPocket(pocket, p) will not plant p
//
// and that direction is a theorem, not a hope — it reproduces `reformPocket`'s
// own two pre-checks (the clamp and the seed-gap refusal) from the same
// constants. The converse is NOT claimed. `reformPocket` also returns `null`
// when the reformed complex fails its closure gate or when the target chamber
// loses its floor, and neither is decidable without doing the rebuild. So:
//
//   ok:false  →  certain refusal. Grey the ground out; do not offer the click.
//   ok:true   →  no *known* obstruction. The insert is still the authority.
//
// A predicate that claimed more would be lying, and a UI built on the lie would
// offer placements the foam then refuses — which is worse than offering none,
// because the player learns the highlight means nothing.
//
// --------------------------------------------------------------- the hull ---
//
// `reformPocket` does NOT refuse an out-of-bounds point. It CLAMPS it, silently,
// and plants somewhere else. For a summon that is a bug wearing a success: the
// player asked for a position and got a different one, and a constellation whose
// centre moved is no longer the solid that was verified. So out-of-hull is
// treated here as ILLEGAL and named — `reason: 'hull'`, with the wall's `src`
// id (`B0`…`B5`, the same ids `foamworld.js` puts on boundary faces) so a caller
// can highlight the actual face. `clampToHull()` is exported so the divergence
// is inspectable rather than implicit.
//
// The hull check also owns the FINITENESS contract, and that is not tidiness:
// a raycast that misses produces `NaN`, which is the commonest bad input a
// placement UI can hand a predicate, and `NaN` does not fail a range check —
// it passes one. Every ordered comparison against it is false, so a chain of
// `<`/`>` falls through to whatever the final `else` says, and the final else
// in a validator is almost always "fine". This file shipped exactly that bug:
// `legalSeed(pocket, [NaN, 18, 40]).ok` was `true`, with a `NaN` in the
// `nearest.gap` a caller would have inspected, while the kernel refused the
// same point. `hullViolation` now tests `Number.isFinite` explicitly rather
// than relying on `NaN !== NaN` the way `foamworld.js`'s clamp comparison
// happens to — that form works by accident, and the next refactor removes the
// accident.
//
// ------------------------------------------------------------ why it names ---
//
// The constraint IS the mechanic — needing clear ground to build is the oldest
// rule in the genre — so a refusal that returns only `false` throws away the
// interesting half. Every refusal names the seed index (and its coordinates and
// the actual gap) or the hull face it hit. `legalSummon` reports **every**
// refusal, not just the first: a constellation that fouls three seeds should
// light three seeds up, and reporting only the first is a bug this repo has
// already shipped once (see `level-view.js`'s `verdictLine`).
//
// Node-and-browser, no dependencies, no randomness.

import { constellation, seedGap, clearanceNeeded } from './solids.mjs';

/** `reformPocket`'s refusal radius, in anisotropic metres. It compares the
 *  squared form against 2.25; `seedGap` returns the un-squared distance, so
 *  this is the same threshold stated once. */
export const MIN_SEED_GAP = 1.5;

/**
 * The placeable box, derived from `reformPocket`'s clamp — NOT guessed:
 *
 *     x → [1, W-1]     y → [0.8, H-0.8]     z → [1, D-1]
 *
 * The margins are asymmetric between axes (1 vs 0.8) and that is not a typo;
 * it is what the kernel does.
 */
export function hullBounds(pocket) {
  return {
    x: [1, pocket.W - 1],
    y: [0.8, pocket.H - 0.8],
    z: [1, pocket.D - 1],
  };
}

/** Exactly what `reformPocket` would do to this point — same operations, same
 *  order, so the two cannot drift on a rounding difference. */
export function clampToHull(pocket, p) {
  return [
    Math.min(pocket.W - 1, Math.max(1, p[0])),
    Math.min(pocket.H - 0.8, Math.max(0.8, p[1])),
    Math.min(pocket.D - 1, Math.max(1, p[2])),
  ];
}

// Axis → the two box faces it runs into, named as `boxMesh()` names them:
// B0 z=0, B1 z=D, B2 y=0 (the pocket floor), B3 y=H, B4 x=0, B5 x=W.
const AXES = [
  { axis: 'x', i: 0, lo: 'B4', hi: 'B5' },
  { axis: 'y', i: 1, lo: 'B2', hi: 'B3' },
  { axis: 'z', i: 2, lo: 'B0', hi: 'B1' },
];

/**
 * Which hull face `p` is outside, or `null` if it is inside all six.
 *
 * When a point breaks more than one bound, the DEEPEST violation is named —
 * that is the one a player would have to move furthest to fix. Ties break in
 * x, y, z order, so the answer is deterministic rather than "whichever the
 * loop saw last".
 *
 * A coordinate that is not a FINITE NUMBER is a violation of its own, named
 * `nonFinite: true` at `depth: Infinity`. It has to be tested for explicitly:
 * `NaN` does not fail a range check, it PASSES one — `v < lo` and `v > hi` are
 * both false for `NaN`, so the ternary below would fall through to the literal
 * `0` and `depth <= 0` would skip the axis entirely. `undefined` (a point with
 * too few coordinates) and a string (`'40'`) fall into the same hole.
 * `Infinity` is caught here too, though the ordered comparisons already
 * happened to catch it.
 *
 * `depth: Infinity` is not decoration: it says truthfully that no finite move
 * fixes this, and it makes the "deepest wins" rule pick the non-finite axis
 * over any finite one, deterministically. (`foamworld.js`'s `hullRefusal`
 * reaches the same refusal by a different route — its clamp comparison
 * `c[i] === p[i]` is false for `NaN` — but it reports `depth: NaN`, which is
 * incomparable, so a point with BOTH a finite violation and a `NaN` gets a
 * different axis blamed there. Both refuse; only the axis differs, and
 * `placement.selftest.mjs` pins that divergence rather than hiding it.)
 */
export function hullViolation(pocket, p) {
  const b = hullBounds(pocket);
  let worst = null;
  for (const a of AXES) {
    const [lo, hi] = b[a.axis];
    const v = p[a.i];
    let rec;
    if (!Number.isFinite(v)) {
      // `v < lo` is false for NaN, +∞, undefined and '40'; true only for −∞.
      const low = v < lo;
      rec = { axis: a.axis, wall: low ? a.lo : a.hi, depth: Infinity,
        value: v, limit: low ? lo : hi, nonFinite: true };
    } else {
      const depth = v < lo ? lo - v : (v > hi ? v - hi : 0);
      if (depth <= 0) continue;
      rec = { axis: a.axis, wall: v < lo ? a.lo : a.hi, depth, value: v, limit: v < lo ? lo : hi };
    }
    // Strict `>` keeps the earliest axis on a tie — including the ∞ ↔ ∞ tie
    // between two non-finite coordinates, so x is blamed before y before z.
    if (!worst || rec.depth > worst.depth) worst = rec;
  }
  return worst;
}

/** The boundary faces of `pocket` belonging to one hull wall (`'B0'`…`'B5'`),
 *  so "it hit B4" can be turned into geometry a UI can actually draw. */
export function hullFaceIds(pocket, wall) {
  return pocket.faces.filter((f) => f.boundary && f.wall === wall).map((f) => f.id);
}

/**
 * The pocket seed closest to `p` under the pocket's own anisotropic metric —
 * `{ index, seed, gap }`, or `null` for a seedless pocket.
 *
 * Strict `<` keeps the LOWEST index on a tie, so a refusal names the same seed
 * on every run. Uses `solids.mjs`'s `seedGap`, which is documented as matching
 * `reformPocket`'s refusal check; do not reimplement the formula here, because
 * two copies of it is precisely how the check and the predicate drift apart.
 *
 * For a point with a non-finite coordinate this returns the FIRST seed with
 * `gap: NaN`, and that is left alone deliberately: `legalSeed` refuses such a
 * point at the hull before ever reaching here, and "the distance from NaN" has
 * no better answer than NaN. A caller reaching for `nearestSeed` directly on
 * unvalidated input should check `Number.isFinite(gap)`.
 */
export function nearestSeed(pocket, p) {
  const aniso = pocket.opts.aniso;
  let best = null;
  for (let i = 0; i < pocket.seeds.length; i++) {
    const gap = seedGap(pocket.seeds[i], p, aniso);
    if (!best || gap < best.gap) best = { index: i, seed: pocket.seeds[i], gap };
  }
  return best;
}

/**
 * Can ONE seed be planted at `p`?
 *
 * Returns `{ ok: true, at, nearest }` or a refusal naming what it hit:
 *
 *     { ok:false, reason:'hull', at, wall:'B4', axis:'x', depth, value, limit, clamped }
 *     { ok:false, reason:'seed', at, seedIndex, seed, gap, need }
 *
 * Hull is checked FIRST because the clamp moves the point, and a seed verdict
 * computed at the requested position would be about a position the kernel is
 * never going to use.
 *
 * A point whose coordinates are not all finite numbers is refused by that same
 * hull check, with `nonFinite: true` and `depth: Infinity` added to the record
 * above — `reason` stays `'hull'` so that every consumer that already branches
 * on the four published reasons keeps working, and so that the predicate and
 * `reformPocketAll` agree on the reason, the axis and the wall. A raycast that
 * missed is the most common bad input a placement UI produces, and it used to
 * come back `ok: true` with a `NaN` sitting in `nearest.gap`.
 */
export function legalSeed(pocket, p, { minSeedGap = MIN_SEED_GAP } = {}) {
  const hull = hullViolation(pocket, p);
  if (hull) return { ok: false, reason: 'hull', at: p.slice(), ...hull, clamped: clampToHull(pocket, p) };
  const near = nearestSeed(pocket, p);
  if (near && near.gap < minSeedGap) {
    return {
      ok: false, reason: 'seed', at: p.slice(),
      seedIndex: near.index, seed: near.seed.slice(), gap: near.gap, need: minSeedGap,
    };
  }
  return { ok: true, at: p.slice(), nearest: near };
}

/**
 * Can a whole constellation be summoned?
 *
 * Three ways to fail, all reported, all named:
 *
 *   `metric` — the constellation was built for a different `aniso` than the
 *              pocket uses. Its faces would come out rotated (the 22° trap in
 *              `solids.mjs`), so this is a refusal rather than a warning.
 *   `hull` / `seed` — per constellation seed, from `legalSeed`.
 *   `self`   — two of the summon's OWN seeds are inside each other's gap. A
 *              multi-insert plants them one at a time and the kernel checks each
 *              new seed against the ones already down, so this fails no matter
 *              how clear the ground is.
 *
 * Every refusal carries `summonSeed` — the index within `con.seeds`, where 0 is
 * the centre — so a caller can light up the offending part of the shape.
 */
export function legalSummon(pocket, con, { minSeedGap = MIN_SEED_GAP } = {}) {
  const refusals = [];
  if (con.aniso !== pocket.opts.aniso) {
    refusals.push({ ok: false, reason: 'metric', conAniso: con.aniso, pocketAniso: pocket.opts.aniso });
  }
  for (let i = 0; i < con.seeds.length; i++) {
    const v = legalSeed(pocket, con.seeds[i], { minSeedGap });
    if (!v.ok) refusals.push({ ...v, summonSeed: i, role: i === 0 ? 'centre' : 'neighbour' });
  }
  for (let i = 0; i < con.seeds.length; i++) {
    for (let j = i + 1; j < con.seeds.length; j++) {
      const gap = seedGap(con.seeds[i], con.seeds[j], con.aniso);
      if (gap < minSeedGap) {
        refusals.push({ ok: false, reason: 'self', summonSeed: i, otherSummonSeed: j, gap, need: minSeedGap });
      }
    }
  }
  return {
    ok: refusals.length === 0,
    solid: con.solid, centre: con.centre.slice(),
    refusals, first: refusals.length ? refusals[0] : null,
  };
}

/**
 * Build the constellation AND ask whether it fits, in one call:
 * `{ con, verdict, ok }`.
 *
 * This is the entry point a caller should reach for, because it takes `aniso`
 * from the pocket rather than from a default — which makes the `metric` refusal
 * above unreachable by construction. That refusal exists for callers who build
 * their own constellation and hand it over; this one cannot get it wrong.
 */
export function summonAt(pocket, solid, centre, { r = 1.6, rotate = 0, minSeedGap = MIN_SEED_GAP } = {}) {
  const con = constellation(solid, { centre, r, rotate, aniso: pocket.opts.aniso });
  const verdict = legalSummon(pocket, con, { minSeedGap });
  return { con, verdict, ok: verdict.ok };
}

/**
 * A CONSERVATIVE accept, one sphere test instead of |seeds|×|summon seeds|:
 * true when no pocket seed lies within `clearanceNeeded(con)` EUCLIDEAN metres
 * of the constellation's centre.
 *
 * It is sound (for any `aniso ≥ 1`) because the anisotropic gap is never
 * smaller than the Euclidean one: a seed further than `extent + minSeedGap`
 * from the centre is further than `minSeedGap` from every neighbour, since a
 * neighbour is at most `extent` from the centre. So
 *
 *     coarselyClear(pocket, con) === true   ⟹   no 'seed' refusal
 *
 * and the reverse does not hold — plenty of legal placements fail this. It is
 * a cheap first pass for sweeping a whole build grid, not a replacement for
 * `legalSummon`.
 */
export function coarselyClear(pocket, con, { minSeedGap = MIN_SEED_GAP } = {}) {
  const R = clearanceNeeded(con, minSeedGap);
  for (const s of pocket.seeds) {
    const d = Math.hypot(s[0] - con.centre[0], s[1] - con.centre[1], s[2] - con.centre[2]);
    if (d <= R) return false;
  }
  return true;
}
