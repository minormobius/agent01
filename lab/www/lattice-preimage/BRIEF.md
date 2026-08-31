# draw-gaussian — handoff

## What this is

Requester asked: "draw a gaussian integer lattice. user specifies a
transformation in GL(2,Z), you calculate and show the preimage of the von
neumann neighborhood of the image of any given lattice point." No reference
link, no further steer — bare math, same terse style as their other requests.

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

## The plan (not built yet, in order)

1. **Pinch-to-zoom on touch.** Wheel zoom and +/− buttons work; two-finger
   pinch does not. Buttons cover the accessibility requirement but a phone
   user exploring by feel will want pinch. Track two active pointers via
   pointermove, compute distance ratio, call the existing `zoomBy` with the
   midpoint as center — the zoom math is already centered-on-a-point-
   correct, this is just wiring a second pointer to it.
2. **Deep-link state in the URL** (`?a=1&b=1&c=0&d=1&px=3&py=2`) so a
   result can be shared/linked directly rather than re-entered. Small, pure
   addition — parse on load, push via `history.replaceState` on change.
3. **Show the fundamental-domain parallelogram** (the unit square's image
   under M⁻¹, i.e. the parallelogram spanned by u and v) as a filled
   translucent shape at p, not just its edges — would make the "this is a
   sheared unit cell" reading more immediate than the cross alone.
4. If this becomes a recurring ask: generalize past von Neumann
   (4-neighbor) to Moore (8-neighbor, diagonals included) as a second
   neighborhood-shape toggle — the math is identical (just two more basis
   combinations, u+v and u−v), the current code structure (`drawCross`
   taking an arbitrary neighbor list) already supports it without rework.

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
