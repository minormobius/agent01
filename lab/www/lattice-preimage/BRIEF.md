# draw-gaussian / lattice-preimage — handoff

## Turn three (this turn)

Requester: "hmm kinda a mess, and i can't zoom out far enough to see the whole
thing... add more extreme zooms and also make it a random matrix per
recursion level rather than per point pls." Two explicit, unambiguous asks:

1. **Zoom range widened.** `MIN_SCALE`/`MAX_SCALE` (was a hardcoded 6–140 in
   `zoomBy`, 4–140 in `fitViewToPoints`) are now named constants, 0.02–600,
   used consistently by both. The actual complaint was "can't zoom out far
   enough to see the whole thing" — `fitViewToPoints` was clamping its
   computed scale to a floor of 4, so a tree whose bounding box needed a
   smaller scale than that to fit the canvas was silently cropped even though
   `fitViewToPoints` had done the math correctly. That's what was fixed;
   0.02 is comfortably below anything the 3000-node cap can produce.
2. **Matrix is now per-level, not per-point** — reverses turn two's explicit
   decision. `growTree` picks one `randomUnimodular()` per level, shared by
   every point in that level's frontier, instead of one per point. This
   directly answers "kinda a mess" too: a shared-per-level matrix makes each
   level self-similar (same u/v shear applied everywhere at that depth), so
   the tree reads as a coherent fractal-ish shape rather than a tangle of
   independently-skewed branches. Turn two's reasoning for per-point ("read
   the request literally") no longer applies — this is a direct, explicit
   correction from the person who owns the site, which wins outright per the
   standing instruction here. Node-growth math (branching still up to 4× per
   *point*, hence the safety cap) is unaffected — only how many independent
   matrices are drawn per level changed, not how many neighbors each point
   gets.

Not touched: single-point mode, the basis-grid toggle, presets, all deferred
items in "the plan" below (pinch-zoom, deep-link, filled parallelogram, Moore
neighborhood, level histogram) — still open, still in that order.

## What this is

Requester asked: "draw a gaussian integer lattice. user specifies a
transformation in GL(2,Z), you calculate and show the preimage of the von
neumann neighborhood of the image of any given lattice point." No reference
link, no further steer — bare math, same terse style as their other requests.

**Turn two (this turn)**, same session: "now starting from the origin, do a
random GL matrix & and connect the origin to neighbors induced in this way,
then recurse w/ a new matrix for each point linked up but not yet visited,
for like 8 levels of recursion." Added a second mode: "grow tree from origin"
button + a `levels` input (default 8). It builds a BFS tree from the origin —
each point in the current frontier gets its own fresh random M, is connected
to the four preimage points that M's inverse induces (`p ± u`, `p ± v`, same
u/v construction as the single-point view), and only points not already
visited get added to the next frontier and given their own matrix. Edges and
nodes are coloured by recursion depth (blue → orange). "back to single point"
returns to the original explorer. Both modes share the canvas, the matrix
math, and `randomUnimodular()` (extracted from the old "random M" button,
which now calls it too).

Shipped a complete working single-page tool: a canvas rendering ℤ² as dots,
a 2×2 integer matrix M entered via four number inputs, a point p entered via
number inputs or by tapping/clicking the canvas. It computes q = Mp, draws
the (always axis-aligned) von Neumann neighborhood of q, computes M⁻¹
(integer, since det(M) = ±1 is enforced), and draws the preimage of that
neighborhood around p — which is generally a skewed diamond, not a plus,
since M⁻¹ need not preserve the grid's axes. Pan (drag), zoom (wheel or
on-screen +/− buttons for mobile), six presets (identity/rotations/
reflections/shear/swap), a "random M" button that composes random shear
matrices to reach a genuinely random unimodular matrix, and a numeric
readout of M, M⁻¹, p, q and both neighborhoods' coordinates. A toggle also
draws the same M⁻¹ basis (its two columns) as edges from *every* visible
lattice point, turning the single-point construction into a full alternate
grid over the whole lattice — the "second angle" this requester tends to
want on a bare-formula ask, built as a direct extension of the same two
vectors already being computed rather than a separate feature.

## Decisions

- **GL(2,Z) is enforced as det = ±1, not just "integer entries."** That is
  the actual definition (it's what guarantees an integer M⁻¹), and it's
  checked live: an invalid matrix shows an error via kit.showError and the
  render keeps using the last valid M rather than silently breaking or
  guessing. This felt like the one place a shortcut would be dishonest —
  see the profile's "cyclotomic Littlewood" precedent about not taking a
  mathematically-valid escape hatch around the interesting constraint.
- **M⁻¹ computed in closed form** as det·[[d,−b],[−c,a]] rather than a
  general linear-algebra solve — exact integer arithmetic, no floating
  point, no numerical drift, which matters since every point drawn must
  land exactly on a lattice site.
- **No separate second canvas for the "global" view** — the basis-grid
  toggle reuses the same u = M⁻¹e1, v = M⁻¹e2 vectors already computed for
  the single-point preimage, just drawn from every lattice point instead of
  one. Kept it as a checkbox on the same canvas rather than a second panel,
  since it's literally the same geometric fact repeated, not new content.
- **No Bluesky/OAuth/PDS anything.** This is a pure math tool with no
  per-visitor state worth saving (matrix + point fit entirely in the URL's
  worth of state and reset on reload is fine), so kit.handleInput and
  labPds would have been unused surface area. Kept kit.js/tokens.css linked
  for showError/clear and the shared palette only.
- Kept kit's dark palette unchanged — profile says no stated preference
  outside the one-off Newman-polynomial black-on-white ask, which read as
  specific to that site's point-cloud aesthetic, not a general preference.

## Decisions (turn two, the tree)

- **A hard node cap (3000), not a level cap.** Branching is up to 4× per
  frontier point, so a naive 8-level run is up to 4^8 ≈ 65k nodes in the
  worst case — the lattice-neighbor collisions that would prune this in a
  *unit*-step random walk don't reliably happen here, since M⁻¹'s columns
  can have magnitude well above 1. Rather than silently cap `levels` at
  something small (which would quietly not do what was asked) or let a
  pathological matrix sequence hang the tab, it grows for real and stops the
  moment the node count would exceed the cap, and says so plainly in the
  readout ("stopped early — hit the N-node safety cap"). This is the same
  "say when it's approximate" instinct as the harmonic-count cap on the
  S¹-warp site — see the profile.
- ~~New matrix per point, not per level.~~ **Reversed in turn three** — the
  requester explicitly asked for per-level after seeing the per-point result
  ("kinda a mess" + "make it a random matrix per recursion level rather than
  per point"). See "Turn three" above. Left the original reasoning here since
  it explains why per-point was tried first, not because it's still current.
- **Edges are still drawn to already-visited neighbors, no recursion just
  stops there.** "connect ... induced in this way" is about the edge, "but
  not yet visited" gates only the *recursion*. So a point can pick up extra
  incoming edges from later points whose induced neighbor happens to land on
  it, which reads as a real graph (occasional cycles/merges) rather than a
  strict tree — that seems like the intended shape, but flag if the visual
  reads as too tangled: switching to "skip the edge entirely if already
  visited" is a one-line change (`if (k in visited) continue;` before the
  `edges.push`, not after).
- **View auto-fits the whole tree** (`fitViewToPoints`) rather than keeping
  the single-point view's origin-centered default — the tree's bounding box
  is unpredictable in advance and origin-centered would often clip most of
  it.
- **No lattice background dots in tree mode.** The single-point view draws
  every ℤ² dot in the viewport; skipped entirely for the tree since its
  bounding box can be large enough to trip the existing 60k-point "zoomed
  too far out" guard even when the tree itself renders fine. Only axes +
  edges + nodes draw in tree mode.

## The plan (not built yet, in order)

1. **Pinch-to-zoom on touch.** Wheel zoom and +/− buttons work; two-finger
   pinch does not. Buttons cover the accessibility requirement but a phone
   user exploring by feel will want pinch. Track two active pointers via
   pointermove, compute distance ratio, call the existing `zoomBy` with the
   midpoint as center — the zoom math is already centered-on-a-point-
   correct, this is just wiring a second pointer to it.
2. **Deep-link state in the URL** (`?a=1&b=1&c=0&d=1&px=3&py=2`) so a
   result can be shared/linked directly rather than re-entered. Small, pure
   addition — parse on load, push via `history.replaceState` on change. For
   the tree, a shareable link would need to serialize the actual matrix
   sequence chosen (since it's random), not just the level count — lower
   priority than the single-point version.
3. **Show the fundamental-domain parallelogram** (the unit square's image
   under M⁻¹, i.e. the parallelogram spanned by u and v) as a filled
   translucent shape at p, not just its edges — would make the "this is a
   sheared unit cell" reading more immediate than the cross alone.
4. If this becomes a recurring ask: generalize past von Neumann
   (4-neighbor) to Moore (8-neighbor, diagonals included) as a second
   neighborhood-shape toggle — the math is identical (just two more basis
   combinations, u+v and u−v), the current code structure (`drawCross`
   taking an arbitrary neighbor list) already supports it without rework.
5. **Tree mode has no legend-swatch equivalent of the readout's per-level
   counts** — `legendTree` just says "younger"/"older" in words. If the
   node/level counts turn out to matter more than the current text readout
   suggests, a small histogram (level → count) would read faster than the
   comma-joined list currently in `updateTreeReadout`.

## Gotchas

- **Screen-to-world Y is inverted** (`sy = panY − y*scale`, not `+`) so
  "up" on screen is +y in math convention. Easy to get backwards when
  editing the zoom-centering math — `zoomBy`'s `panY = atY + before.y*scale`
  looks like a sign error next to `panX`'s `− before.x*scale` but is correct
  given the inverted axis; verify against the `worldToScreen`/
  `screenToWorld` pair before touching either.
- Matrix inputs revert the *model* on an invalid det but deliberately do
  **not** revert what's typed in the input boxes — so the visitor can see
  what they typed and why it's rejected (det shown in the error), rather
  than having a keystroke silently disappear.
- Not screenshot-tested by me (no browser tool), but per the current
  process a harness screenshot pass runs after this turn ends — if that
  surfaces a rendering bug, it should come back as a report rather than a
  guess on my part.
- **`fitViewToPoints` divides by the bounding box's width/height** — guarded
  with `Math.max(1, ...)` so a degenerate single-node tree (cap hit on level
  0, or `levels` somehow producing zero growth) doesn't divide by zero, but
  not exercised in a browser. Watch this if a future edit changes when
  `growTree` can return an all-origin tree.
- Clicking the canvas to move `p` is now a no-op while `treeMode` is true
  (guarded in the `pointerup` handler) since `p`/`M` are irrelevant to the
  tree view; dragging to pan and wheel/±-zoom still work in both modes.
