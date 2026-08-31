# draw-gaussian / lattice-preimage — handoff

## Turn six (this turn)

Requester: "there still seems to be a limit to the number of points that show
up... also there's a cap at 10 on the depth. that's way too low." Two direct
numeric complaints, both about caps that were genuinely too tight, not about
the fitting bug turn five fixed (that was a different bug — points computed
but drawn off-screen; this is points never computed at all).

1. **`MAX_TREE_NODES` raised 3000 → 20000.** This is the actual limit on "how
   many points show up" — `growTree` stops adding new nodes the instant this
   is hit, however many levels remain. Picked 20000 as a real increase (6.7×)
   while staying inside what canvas can redraw per frame during pan/drag
   without becoming unusable — untested in a browser (no tool here), so if a
   future report says panning a full 20000-node tree feels laggy, the fix is
   batching draw calls (single path, many `arc()` calls, one `fill()`) rather
   than lowering the cap back down; see "the plan" below, new item.
2. **`levels` input cap raised 10/12 → 1000** (HTML `max` attribute and the
   `growTree` call's clamp — these had quietly drifted apart, 10 vs 12; now
   both match). The old caps were a leftover UX guess, not a real safety
   limit: `MAX_TREE_NODES` is what actually bounds the work, since the level
   loop exits the moment `capped` is set regardless of how many levels are
   left. A degenerate matrix sequence that barely grows the frontier could in
   principle run many level-iterations before hitting the node cap, but each
   iteration is cheap (proportional to current frontier size, not a fresh
   scan), so there's no runaway risk in raising this — verified by reading
   `growTree`'s loop condition (`level < maxLevel && frontier.length > 0 &&
   !capped`), not by running it.
3. **The "stopped early" readout message no longer hardcodes "level 10".**
   It quoted the old level cap even though the actual stopping condition is
   the node cap, which could fire at any depth — reworded to state how many
   levels were actually completed before the cap hit, and dropped the
   specific-number claim entirely.

Not touched: everything else — see "the plan" below, unchanged except the new
performance item.

## Turn five

Requester: "hmm when i put the depth real high some points don't render." A bug
report, not a feature ask, and a real one: `fitViewToPoints` computed the scale
needed to fit every point of the tree in the canvas, then **clamped it up to
`MIN_SCALE` (0.02)** if the computed value was smaller. A deep tree's shear
matrices compose fast — hand-simulating `randomUnimodular`'s worst case (same
sign k=2 shear repeatedly) hits entries ~169 within 6 composed steps, and that's
per *level*, added onto the running point position — so a run at levels 8-12
can need a bounding-box fit well below 0.02, and did not get one. The points
farthest from the origin (exactly the ones a high depth setting produces more
of) were being computed and drawn correctly, just at screen coordinates outside
the visible canvas. Not a rendering bug in the strict sense — every visited
point genuinely is in `tree.visited` and genuinely gets a `ctx.arc` call — but
invisible is invisible either way, and to a visitor that reads as "doesn't
render."

**Fix:** `fitViewToPoints` no longer clamps its computed scale to a floor —
only the upper end (`MAX_SCALE`, for the degenerate near-single-point case) is
still capped. Since manual zoom-out (`zoomBy`) had its own hardcoded
`MIN_SCALE` floor, that would have re-introduced the same crop the moment a
visitor touched the zoom controls after a big tree loaded — so added
`minScaleFloor`, a variable that starts at `MIN_SCALE` and widens (only
downward) whenever a fit needs less, and `zoomBy` clamps against that instead
of the constant. Reset to `MIN_SCALE` on `resetView` (both the button and
`exitTree`) and fresh at the start of every `grow` click, so it's recomputed
per-run rather than carrying over a previous tree's tiny floor forever. Also
added a line to the tree readout, shown only when this actually kicked in
("this run's points spread far enough that the view had to zoom out past the
usual limit..."), so a visitor who does zoom in and then tries to zoom back out
has a reason for why the range feels different, rather than a silent
inconsistency.

**Screenshot pass**: header, description and controls render correctly at
1200×800 — text readable, every control labeled, no overlap or collapse. The
canvas itself sits below the fold in that capture (only its top edge visible,
empty — no tree had been grown yet in the shot), so this pass could not
actually confirm the fix visually either; still resting on the by-hand
reasoning below.

**Not fully verified**: the math above is worked by hand from
`randomUnimodular`'s shear composition, not measured by actually running a
depth-12 tree in a browser and confirming the crop reproduces and the fix
resolves it — no browser tool available this turn. If the harness screenshot
doesn't happen to trigger a large-magnitude matrix sequence, this may look
untested from the picture alone; the reasoning for why it happens and why the
fix addresses it is sound, but flag if a future report says points are still
missing at high depth — the next place to look would be whether `minScaleFloor`
is actually being read before the first `render()` call after `grow` (it is:
`fitViewToPoints` runs synchronously before `render()` in the click handler),
or whether canvas itself silently drops arcs at extreme pixel coordinates
before scale has caught up (shouldn't happen now that scale is uncapped, but
worth a `console.log(view.scale)` check if it recurs).

## Turn four

Requester: "can you make a toggle to just show the points and no lines, and an
option to color by vertex degree? despite how it's constructed it's not
necessarily a tree btw." Two additions, both tree-mode only (a new "row" of
controls, `#treeOptions`, hidden until `grow` is clicked, hidden again on
`exitTree`):

1. **"points only, no edges" checkbox** (`pointsOnly`). `renderTree` just skips
   the whole edge-drawing loop when set; node drawing is unchanged.
2. **"colour by" select: recursion level (existing) / vertex degree (new).**
   Degree is now computed in `growTree` — a plain object keyed the same way as
   `visited`, incremented on both endpoints every time an edge is pushed — and
   returned as `tree.degree`. `degreeColor(deg, maxDeg)` maps degree onto a
   violet(leaf)→yellow(hub) hue scale, deliberately not reusing `levelColor`'s
   blue→orange range so the two modes are never visually ambiguous about which
   is active — the legend swatches also switch via `updateTreeLegend()`. When
   colour is by degree, edges are drawn in a single desaturated grey rather
   than by level, since level-coloured edges next to degree-coloured nodes
   would read as two overlapping encodings.

   The requester's aside ("it's not necessarily a tree") was already true and
   already known — turn two's decision doc says edges to already-visited
   points are kept, not skipped. Made it visible instead of just documented:
   the readout now compares `edges.length` to `nodeCount - 1` (what a tree on
   that many nodes would have) and states plainly whether this run merged
   branches back together or happened to come out tree-shaped. That's the
   concrete, checkable version of "it's not necessarily a tree" — a good
   degree-coloured run should show visible hubs above degree 2 wherever a
   merge happened, and the readout's edge-count line will confirm it did.

   **Incidental correctness fix while wiring degree**: `growTree` previously
   pushed an edge (and would now have counted degree) toward a target that hit
   the node cap and was therefore *never added to `visited`* — a dangling edge
   to a point with no dot, rendered but never a node. Reordered so the edge
   (and degree increment) is only recorded for a capped target if it was
   already visited before the cap; a genuinely new-and-over-cap target now
   contributes no edge and no degree, matching what's actually drawn. Only
   visible before this turn if you looked very closely at a capped tree's edge
   count; harmless but wrong, so fixed while already in this function.

Not touched: single-point mode, the basis-grid toggle, presets, pinch-zoom,
deep-linking, the filled-parallelogram idea, Moore neighborhoods — all still
open, see "the plan" below (unchanged from turn three except item 5, which
this turn's readout line partially addresses — a level histogram is still not
built).

## Turn three

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
5. **Tree mode still has no visual histogram** — legend swatches now cover
   both colour modes (turn four), and the readout states the level counts and
   the edges-vs-tree comparison in words, but a small level→count or
   degree→count bar chart would read faster than the comma-joined lists
   currently in `updateTreeReadout` if that turns out to matter.
6. **Untested at the new 20000-node cap: canvas draw performance during pan/
   zoom.** `renderTree` issues a separate `beginPath`/`arc`/`fill` (and, for
   edges, `beginPath`/`moveTo`/`lineTo`/`stroke`) per point and per edge —
   fine at a few thousand, unverified at 20000 since panning re-runs `render`
   every pointermove. If a report says dragging a big tree stutters, batch:
   group points by fill colour (they're already computed per point) and
   build one `Path2D`/one `fill()` call per colour bucket instead of one
   per point; same idea for edges grouped by stroke colour. Don't lower
   `MAX_TREE_NODES` as the fix — that's undoing what this turn was asked for.
7. **Degree is a raw incident-edge count, not deduplicated** — if the same
   pair of points ends up connected by more than one edge (possible across
   levels, not checked for), each counts separately toward both endpoints'
   degree. Reads as "how many segments touch this point," which is what's
   drawn, so this was left as is rather than switching to distinct-neighbor
   count — flag if a visitor asks why degree looks higher than the number of
   lines they can see meeting at a point.

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
