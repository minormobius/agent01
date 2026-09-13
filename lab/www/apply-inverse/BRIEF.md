# apply-inverse — handoff

## What this is

The ask: iterate `f(z) = (|z| + cos(arg z))·exp(i·arg z) − c` (c real, 0.5–1),
viewed through the inverse of a Joukowski-style conformal map centered at
`−c/2`, with sliders for `c` and for horizontal scaling. Earlier turns handled
a correction plus three UI asks (scaling order, slider resolution, numeric
inputs, pan/zoom navigation). **This turn's request**: colour non-escaping
(bounded) points by a domain colouring of the landing point, instead of flat
black.

Shipped this turn:

- **Domain colouring for bounded points.** When the orbit from `z₀` never
  escapes within `MAX_ITER` steps, the pixel is now coloured from the actual
  final `(zr, zi)` the loop left off at: hue = `atan2(zi, zr)` (the point's
  angle), lightness banded by the fractional part of `log2(|z|)` so nested
  rings show how far out the landing point is, cycling every doubling of
  distance. Escaped points are untouched — still the existing blue→red HSL
  ramp by escape speed. One `else` branch changed
  (`index.html`'s main render loop); no new controls, since nothing was asked
  for beyond the colouring itself.

Shipped in earlier turns:

- **Fixed the scaling order**, replacing the previous default rather than
  adding it as a toggle. Forward map is now: `mu = z − c0`, scaled *first* to
  `mu' = s·Re(mu) + i·Im(mu)`, *then* inverted: `eta = mu' + 1/mu'`,
  `w = c0 + eta`. Rendering (still a pullback from screen pixel `w`) subtracts
  `c0`, solves the same quadratic for the exterior root `mu'`, then divides
  its real part by `s` to undo the pre-scaling and recover `mu`. This is
  exactly the "alternate reading" the previous turn had already named and
  deferred (see old BRIEF plan item 3) — the requester's correction confirmed
  it was the intended one, so it's now the only mode, not a second toggle.
- **Slider resolution**: `c` step 0.005 → 0.0005, `s` step 0.01 → 0.001 (10×
  finer each). Both now also have a paired `<input type=number>` for exact
  values, two-way synced with the slider (typing clamps to the same
  min/max as the slider; the slider snaps to whatever you type on blur/Enter).
- **Pan/zoom navigation** on the canvas: drag to pan, wheel or pinch to zoom,
  a "reset view" button restores the original window. Implemented with
  Pointer Events (unifies mouse/touch; two simultaneous pointers = pinch,
  computed fresh from the pinch-start view each move rather than compounding
  incrementally, to avoid drift). View bounds are now mutable module-level
  `let`s instead of the old `const`s; `DEFAULT_VIEW` holds the original
  `[-6,6]×[-4.5,4.5]` window for the reset button.

## Decisions

- **Landing-point colour uses the loop's final `(zr, zi)`, not the iteration
  count or a separately-tracked quantity.** That value was already sitting
  right there when the loop exits without escaping (either it hit
  `MAX_ITER`, or it broke early on the `z=0` singularity guard, in which case
  it colours the point at/near the origin — expected, not a bug). No extra
  state, no second pass over the pixel.
- **Banding is `log2(|z|)`, not a linear or unbounded lightness ramp.** Bounded
  orbits can land anywhere from near-zero to just under the bailout radius, a
  huge dynamic range; log-banding turns that into repeating rings so structure
  near the origin is as visible as structure near the boundary, which a linear
  map would crush into "everything near 0 looks the same dark colour".
  Lightness is clamped to `[0.16, 0.38]` (dark) precisely so bounded regions
  still read as visually distinct from the brighter escaped-region ramp — the
  two color modes shouldn't be confusable at a glance.
- **The old default formula is gone, not kept as a toggle.** The requester's
  "I meant X, not Y" reads as a correction, not an offer of a second mode —
  keeping the wrong-order version around as a "compare" option would be
  answering a question nobody asked at the cost of UI clutter. If a future
  turn wants both side by side, it's a second toggle next to `rawToggle`.
- **Pinch-zoom recomputes from a stored start-of-gesture view** rather than
  applying incremental deltas frame to frame. Simpler to reason about (no
  compounding rounding drift over a long pinch) at the cost of one object
  allocation per gesture start — irrelevant at this event rate.
- **View-bounds clamps in `zoomAt`** (`[1e-4, 200]` width, `[1e-4, 150]`
  height) are generous, not tuned — they exist only to stop the view
  collapsing to zero or blowing up to numeric nonsense, not to bound
  "useful" zoom. See gotcha below about `MAX_ITER`/`BAILOUT` not scaling with
  zoom.

## The plan (not built yet, in order)

1. **Iteration/bailout do not adapt to zoom.** `MAX_ITER=90`, `BAILOUT=6` were
   tuned for the original `[-6,6]×[-4.5,4.5]` window. Zoom in far enough and
   fine structure will be under-resolved (not enough iterations to distinguish
   detail) or over-resolved coarsely (bailout too large relative to the now-
   tiny visible scale). The fix is probably `MAX_ITER` scaling with something
   like `-log(viewWidth)`, tested visually — untested here since there's no
   browser in this sandbox.
2. **A second view mode: orbit trace**, unchanged from before — click a point,
   show its actual iterated path as an overlaid polyline. Still not built.
3. **Smooth/continuous colouring** instead of raw iteration count, if the
   escaped-region banding looks too coarse on a real screen, especially once
   zoomed in. Now that bounded points get a richer treatment too, this is the
   remaining "flat colour banding" complaint.
4. The previous "scale-the-preimage" alternate-reading item is now done (see
   above) — removed from this list.
5. **Not built, considered and skipped for scope**: a legend/key explaining
   the domain-colouring scheme (a small hue wheel or colour strip). The
   status-note text says what the colours mean in words; a visual legend
   would be nicer but wasn't asked for and this turn was small.

## Gotchas

- The map's growth is *additive*, not multiplicative like `z² + c` — for
  large `|z|`, `f(z) ≈ z + (1−c)·cos(arg z)`, so points drift outward by at
  most ~0.5 per iteration. A bailout radius too large relative to `MAX_ITER`
  just shows "everything is bounded" even where it isn't. This gets more
  fragile once pan/zoom lets someone view a window far from the tuned default
  — see plan item 1.
- `z=0` is a genuine singularity of `arg` — guarded with `if (r < 1e-12)
  break`, treated as bounded. Don't remove the guard.
- The two Joukowski-inverse roots have equal modulus exactly on the branch
  cut (`eta` real and `|eta| ≤ 2`); `n1 >= n2` picks a root somewhat
  arbitrarily there. Not a bug, but note it moved: it's now the branch cut of
  `mu' + 1/mu'` in the *pre-scaled* coordinate, so its shape on screen changes
  with `s` differently than it did under the old (scale-after) formula.
- Pointer capture (`setPointerCapture`) means `pointerleave` may not fire
  while a drag is in progress and the cursor leaves the canvas bounds — this
  is intentional (dragging should keep working past the canvas edge) but
  don't "fix" it by removing capture, that breaks fast drags that outrun the
  element.
