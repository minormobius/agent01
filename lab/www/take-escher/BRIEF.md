# BRIEF — take-escher / "Shoal"

## What this is

Requester wanted Escher's *Circle Limit III* turned into an interactive
Poincaré-disk explorer: pick a row of fish, translate/"swim" them in the
direction of their nose, and have the rest of the tiling follow so it still
tiles. Turn 1 shipped independent geodesic lines (didn't interlock). Turn 2
rebuilt it as an actual hyperbolic {p,q} reflection tiling, panned as one
rigid Möbius isometry, so tiles stay edge-locked by construction. Turn 3 put
fish silhouettes on every tile (barycentric warp from the canonical polygon).

Turn 4 (this one) was a one-line complaint from the requester: **"Still not
infinite. It HAS to be infinite tilings."** The bug: the tiling was generated
*once*, as a single capped patch (140 faces / depth 6) around the original
centre, and then panned as a rigid whole. Drag or swim far enough in one
direction and you'd move past the edge of that fixed patch — the pattern
just ran out into empty disk, which is the opposite of what an infinite
hyperbolic tiling should feel like. Fixed by recentring: whenever the tile
the patch was built around has drifted more than `RECENTER_AT` (0.45, in
screen-modulus terms) from the disk's centre, the tiling is silently rebuilt
around whatever point is *now* under the centre, using the same BFS with a
re-rooted starting polygon (`buildTiling`'s new optional `center` argument).
Because the pan matrix `g` is unchanged across a recentre and is constructed
so `g(newRoot) = 0` by definition (`newRoot = g⁻¹(0)`, via the new
`mInverse`/`mTranslateTo` helpers), the rebuild is seamless on screen — same
position, freshly generated surroundings. Wired into both the drag handler
and the swim animation's completion.

## Decisions

- **Recentre the generation, don't just grow the cap.** Raising `CAP`/
  `MAXDEPTH` only postpones the same failure (branching is exponential, so a
  patch large enough to survive "pan indefinitely" isn't a fixed number).
  Recentring makes the *visible* coverage independent of total accumulated
  pan distance — same 140-face budget, always spent on what's currently on
  screen instead of slowly abandoned as you drift away from it.
- **Reused the `reflectAcross` two-point-to-origin trick as `mTranslateTo`**,
  rather than deriving a new formula — it's the same disk automorphism
  already verified in turn 2 (`Tinv` inside `reflectAcross` *is*
  `mTranslateTo`, just inlined there). One geometric primitive, two call
  sites.
- **`mInverse` via the adjugate, not a determinant division.** Möbius
  matrices here are only meaningful up to overall scale (`mApply` divides
  it out), so `{a:M.d, b:-M.b, c:-M.c, d:M.a}` is a correct inverse without
  ever computing or dividing by a complex determinant — one less place for a
  near-zero denominator to matter.
- **Recentre trigger is the *current root's* screen position, not the
  accumulated pan distance.** `rootOrig` tracks the original-space point the
  live patch is built around; `g(rootOrig)` is where that point renders right
  now. Checking that (cheap: one `mApply` + `absSq`) rather than some
  separate distance counter keeps the trigger tied directly to what's
  actually visible, and self-corrects every time it fires (the new root is
  exactly the preimage of screen centre, so drift resets to ~0 at each
  recentre).
- **Didn't touch fish weights on recentre.** `buildFishWeights` depends only
  on `p` (the canonical unit polygon), not on where the tile sits, so it's
  still valid after a rebuild — one less thing to keep in sync.

## The plan (next agent, in order)

1. **This turn's fix has a known asymptotic limit, not addressed here:** the
   recentred root (`rootOrig = g⁻¹(0)`) is itself a point in the Poincaré
   disk, and its Euclidean modulus creeps toward 1 as *total* accumulated
   pan distance grows across a long session (that's inherent to the disk
   model, not a bug in this fix). Once it gets close enough to 1, the
   existing near-rim cull in `buildTiling` (`absSq(cen) > 0.995²`) would
   start culling most or all of a freshly-rooted patch, since a small
   hyperbolic ball around a near-boundary point can have most of its
   Euclidean extent past that cutoff. In practice this needs an enormous
   amount of accumulated dragging/swimming to bite (every recentre only
   drifts the root by a bounded hyperbolic step), and every other
   Poincaré-disk renderer has the same asymptotic wall, but if it turns out
   to be reachable in a normal session, the fix is to cull relative to
   hyperbolic distance from `center`, not Euclidean modulus from literal
   zero. Wasn't reachable to test here (no browser) — worth a deliberate
   "drag for two straight minutes" check if this ever gets a real run.
2. **Verify (or fix) the two-coloring** — carried over from turn 3, still
   untouched. Fish orientation depends on BFS-depth parity, which is a proxy
   for the true face-adjacency 2-coloring and can disagree on it. Build the
   actual adjacency graph and 2-color it directly, or add a debug check that
   flags same-parity adjacent faces for all four presets.
3. **Fit the fish tighter to the tile** — `FISH_SCALE` (0.68) is one
   constant for all four presets, conservative for the smallest one ({5,4}).
   Could scale per-preset off the apothem (`cos(PI/p)`, already computed in
   `buildFishWeights`) so fish interlock more like Escher's, fins/nose
   crossing tile boundaries instead of sitting inside with margin.
4. **Replace the affine barycentric fish warp with the true isometry**, if
   it looks visibly wrong on far-from-centre tiles once someone can actually
   look at it. See turn 3's reasoning in git history for how (compose the
   `reflectAcross` sequence BFS used to reach each face, apply that directly
   to canonical fish coordinates, instead of the current per-face
   barycentric approximation).
5. **Circle Limit III uses equidistant curves, not geodesics** — documented
   in the page copy as a known simplification, unaddressed.

## Gotchas

- Still no browser here — this turn's recentring logic (the trickiest part:
  proving `g(newRoot) = 0` holds so the rebuild doesn't jump) was checked
  algebraically (`mInverse` is a true projective inverse of a Möbius matrix;
  `mApply` of a matrix's adjugate at 0 gives `-b/a`, which is exactly the `w`
  solving `(aw+b)/(cw+d) = 0`) but never rendered. If the tiling visibly
  *jumps* when it refills rather than staying put, check that `rootOrig` is
  being read *before* it's reassigned in `maybeRecenter` (order matters:
  `screenRoot` must use the old `rootOrig`, the new one is computed after).
- `maybeRecenter()` must be called after `g` is updated, in every place `g`
  changes from user interaction (drag move, swim's animation completion) —
  `resetBtn` and `newBtn` don't need it, they already reset `rootOrig` to
  `{0,0}` directly alongside `g = mId()`. If a future interaction adds
  another way to change `g` (keyboard panning, momentum/inertia, etc.) and
  forgets to call `maybeRecenter`, the old "runs out" bug comes back for
  that interaction specifically.
- `buildTiling(p, q, center)`'s third argument is checked with a plain
  `if (center)` — fine because every call site either omits it entirely
  (falsy `undefined`) or passes a real `{re, im}` object (always truthy,
  including `{re:0, im:0}`, which correctly no-ops through an identity
  `mTranslateTo`). Don't "simplify" that to a falsy check on the *values*
  inside center — `{re:0,im:0}` would incorrectly look empty.
- Everything from turn 3's gotchas about `mCompose` order, the fish-weight
  rebuild-on-preset-switch requirement, and the BFS cap being untested on a
  real phone still applies unchanged — see git history for turn 3's BRIEF if
  needed, not reproduced here to keep this focused on what changed.
