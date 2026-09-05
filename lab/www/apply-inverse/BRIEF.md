# apply-inverse — handoff

## What this is

The ask: iterate `f(z) = (|z| + cos(arg z))·exp(i·arg z) − c` (c real, 0.5–1),
viewed through the inverse of a Joukowski-style conformal map centered at
`−c/2`, with sliders for `c` and for horizontal scaling. This turn's request
was a correction plus three UI asks: "I meant applying a scaling before the
inverse transform, not after"; finer slider resolution than the old 0.005
step; a numeric text box for exact values; and "navigation for the renderer".

Shipped this turn:

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
   zoomed in.
4. The previous "scale-the-preimage" alternate-reading item is now done (see
   above) — removed from this list.

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
