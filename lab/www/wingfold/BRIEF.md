# BRIEF — wingfold

## What this is

The request was terse and purely mathematical, matching this requester's
standing pattern (see `lab/_profiles/ponder.ooo.md`): "app that shows two
side-by-side complex planes & you can draw on one of them and see the
joukowski transformation of ur drawing on the other." No reference link.

Shipped, working end to end: two square canvases side by side. The left
(`z`-plane) is freehand-drawable with mouse or touch (pointer events,
multi-stroke, undo, clear). The right (`w`-plane) redraws every stroke live
through the Joukowski map `w = z + k/z`, with `k` exposed as a slider
(0–2.5, default 1 — the classical map). A checkbox overlays the unit circle
and its image, which is the textbook Joukowski demonstration (image of
`|z|=1` degenerates to the segment `[-2k, 2k]` on the real axis). The page
loads pre-seeded with a circle offset from the origin, whose image under
`k=1` is the classic cambered-airfoil shape — so the first screenshot shows
the actual point of the transform, not a blank canvas.

## Decisions

- **`w = z + k/z`, not a fixed `w = z + 1/z`.** The request only asked for
  "the Joukowski transformation," singular, but this requester's profile
  shows a strong preference for one real explorable parameter over a static
  picture when the math offers one naturally. `k` is exactly that: at `k=0`
  the map is the identity, and increasing it interpolates toward the
  singular map, so it's free depth, not an invented feature.
- **w-plane view auto-fits to the data, every frame**, rather than a fixed
  range. Points near the pole `z≈0` map to huge `|w|`; a fixed range would
  either clip those or make everything else invisible at any range wide
  enough to hold them. Recomputing the bounding box (with 25% padding, and
  a `MIN_SPAN` floor so a single point doesn't zoom to infinity) is honest
  rather than a smaller pre-set demo. Cost: the w-plane box visibly resizes
  while you're still drawing near the pole. That's real, not a bug — said so
  in the on-page copy.
- **Pole handling: hard cutoff at `|z| < 0.06`, not a clamp.** A stroke that
  crosses within that radius of the origin breaks into a new subpath rather
  than drawing a spurious line to wherever the previous finite point landed.
  A small red ring on the z-plane marks the excluded zone so it's visible,
  not just documented in prose.
- **z-plane view is fixed-and-zoomable (+/- buttons), not auto-fit.** It's
  the plane you're actively drawing on; auto-fitting it while your pointer
  is mid-stroke would move the ground under your hand. The w-plane has no
  such constraint since nothing is drawn there directly.
- **No sign-in, no PDS persistence.** This is a pure client-side math toy
  with no meaningful "save" — a drawing is disposable exploration, not a
  score or a document worth keeping across visits. Skipped `/_kit/pds.js`
  entirely rather than bolting on a save button nobody asked for.
- Used the kit's `tokens.css`/`kit.js` (crumb only) unchanged — the
  requester's profile has no stated palette preference across many builds,
  so kit defaults stay the baseline.

## The plan (not built yet, in order)

1. **Drag the seed circle's center/radius directly** (two draggable handles
   on the z-plane, or numeric inputs) instead of only the one hardcoded
   offset (`cx=-0.08, cy=0.08`). This is the natural next request — "let me
   pick the airfoil shape" — and is a small, contained change: the airfoil
   preset button's math already takes `cx, cy, r`; wire it to pointer drag
   instead of a fixed constant.
2. **Pan on the w-plane** (not just auto-fit) for when someone wants to
   freeze the view mid-exploration rather than have it keep resizing. Could
   be as simple as a "freeze view" toggle that stops recomputing `wView()`
   until unfrozen.
3. **Multiple `k` presets or an animation** (k sweeping 0→2 automatically)
   to show the identity-to-airfoil interpolation as motion, gated behind
   `prefers-reduced-motion` per the kit's existing pattern — not started,
   and worth doing only if requested, per the "no drive-by features" rule.

## Gotchas

- Canvas backing-store sizing: the CSS size (`rect.width`) and the actual
  pixel buffer are different when `devicePixelRatio > 1`. All coordinate
  math (`toPx`/`toComplex`) works in **CSS pixels**, and `ctx.setTransform`
  handles the DPR scale-up — mixing the two up silently misplaces every
  drawn point on a Retina/phone screen. If you touch resizing, keep that
  split.
- `Math.hypot` and `Math.log10` are used (for the airfoil radius and the
  grid step heuristic) — both fine in evergreen browsers, no polyfill
  needed, but worth knowing if this ever needs to run somewhere stranger.
- The unit-circle overlay and the freehand strokes share one `jouk()` call;
  if you add a third overlay (e.g. a grid image), route it through the same
  function rather than re-deriving `w = z + k/z` inline — it's already
  correct for the `k=0` edge case (falls back to `z` itself) and for the
  near-pole cutoff.
