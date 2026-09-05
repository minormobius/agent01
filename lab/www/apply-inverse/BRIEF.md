# apply-inverse — handoff

## What this is

The ask: iterate `f(z) = (|z| + cos(arg z))·exp(i·arg z) − c` (c real, 0.5–1),
and view the result through the **inverse** of a Joukowski-style conformal map
centered at `−c/2`, with sliders for `c` and for "horizontal scaling of the
transform."

Shipped: a single canvas that renders the pulled-back iteration. For every
screen pixel `w`, the page inverts the transform in closed form to find the
point `z0` in the map's own plane, iterates `f` from `z0` for a fixed number of
steps, and colours by escape time (or near-black if it never escapes). Two
sliders (`c`, horizontal scale `s`) plus a checkbox that switches to showing
`f` iterated directly with no transform, for comparison.

## Decisions

- **Rendering direction: pull back, don't push forward.** If you instead
  iterated `f` in the z-plane and pushed each result through the *forward*
  Joukowski map to place it on screen, you'd get an image full of gaps and
  uneven density — forward maps don't hit every output pixel. Pulling back
  through the inverse from every screen pixel guarantees full coverage. This
  is why "apply the inverse" is the right computational move, not just a
  literal reading of the ask.

- **The exact transform, chosen because "horizontal scaling" is underspecified.**
  With `c0 = −c/2` and `eta = (z−c0) + 1/(z−c0)`, the forward map used is
  `w = c0 + s·Re(eta) + i·Im(eta)` — only the real part gets the scale factor
  `s`. This is one defensible reading (scaling the transform's own output
  horizontally around its center); an equally defensible alternative is
  scaling the *input* circle horizontally before applying `+1/eta` (turning
  the pre-image circle into an ellipse). I did not have room to offer both as
  a mode — said explicitly here and in NOTE.txt so nobody mistakes the choice
  for the only possible one. If a follow-up specifically wants the
  ellipse-preimage version, it's a different formula in `inverseMu`'s caller,
  not a rewrite.

- **Inverting `eta = mu + 1/mu` is a quadratic, not iterative.** `mu^2 - eta·mu
  + 1 = 0` solved with the standard formula and a hand-rolled complex sqrt.
  Since the constant term is 1, the two roots are reciprocals of each other,
  so exactly one has modulus ≥ 1 except exactly on the branch cut — that's the
  "exterior root" always picked, the standard convention for Joukowski airfoil
  maps (unit circle exterior ↔ airfoil exterior).

- **cos(arg z) and exp(i·arg z) are computed without any trig call.**
  `cos(arg z) = Re(z)/|z|` and `exp(i·arg z) = (Re(z)/|z|, Im(z)/|z|)` are
  algebraic identities, so the per-iteration cost is one `sqrt` and a few
  multiplies — no `atan2`/`cos`/`sin`. This is what makes 480×360×90 iterations
  fast enough to run synchronously on every slider tick without a worker.
  Purely an optimization; the math iterated is identical to the literal
  formula.

- **No pan/zoom, no worker, one static view window.** Given the 20-minute
  budget, I fixed `RE ∈ [−6,6], IM ∈ [−4.5,4.5]` (chosen to hold the branch
  points `c0 ± 1` comfortably across the whole `c`/`s` range) rather than
  building interactive navigation. This is the most obvious gap versus the
  profile's usual "multiple angles of exploration" preference — see below.

## The plan (not built yet, in order)

1. **Pan/zoom on the canvas.** Straightforward: track a view-window rect in
   state, wire mouse-drag (or the existing sliders don't need to change) plus
   wheel/pinch to update `RE_MIN/MAX/IM_MIN/MAX`, re-render on release. This is
   the single biggest thing missing relative to how this requester has reacted
   to other iterated-map sites (they've asked for orbit/bifurcation views
   before) — a fixed window is the honest baseline, not the finished feature.
2. **A second view mode: orbit trace.** Click a point on canvas, show its
   actual iterated path (`z0 → f(z0) → f(f(z0)) → …`) as a polyline overlaid
   on the fractal. Cheap to add since the iteration loop already exists;
   mainly needs a separate small canvas or an overlay `<canvas>` on top of the
   main one.
3. **Offer the alternate "scale the pre-image circle" reading of horizontal
   scaling as a second mode/toggle**, if the requester's follow-up suggests my
   pick above wasn't what they meant. Implementation: instead of scaling
   `Re(eta)` after the `+1/eta`, scale `Re(z−c0)` before it (i.e. `eta =
   s·Re(z−c0) + i·Im(z−c0) + 1/(s·Re(z−c0)+i·Im(z−c0))`) — a different
   `inverseMu` caller, same quadratic-solve machinery underneath.
4. **Smooth/continuous colouring** instead of raw iteration count, if the
   banding in the escaped region looks too coarse on a real screen — I
   haven't seen a screenshot as I write this.

## Gotchas

- The map's growth is *additive*, not multiplicative like `z² + c` — for
  large `|z|`, `f(z) ≈ z + (1−c)·cos(arg z)`, so points drift outward by at
  most ~0.5 per iteration rather than exploding. A bailout radius that's too
  large relative to `MAX_ITER` will just show "everything is bounded" even
  where it isn't. Tuned to `BAILOUT=6`, `MAX_ITER=90` empirically against the
  view window above; if you widen the view window, both probably need to
  scale up together.
- `z=0` is a genuine singularity of `arg` — guarded with `if (r < 1e-12)
  break`, treated as bounded. Doesn't matter visually (single point) but
  don't remove the guard, it'll throw `NaN` outward from a `0/0` division.
- The two Joukowski-inverse roots have equal modulus exactly on the branch
  cut (`eta` real and `|eta| ≤ 2`), where `n1 >= n2` picks a root somewhat
  arbitrarily between two equally-valid choices. Not a bug — the map is
  genuinely two-valued there — but worth knowing before "fixing" a seam that
  might show up right along the real axis at low `s`.
