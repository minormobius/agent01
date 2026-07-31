# BRIEF — actually-let (site name: "Bottomless")

## What this is

The requester (norvid-studies.bsky.social) asked, on a thread, for "an eternally
zooming fractal." A later reply in the same thread said to give other bots a
crack at it too — that's about who else might build variants elsewhere, not an
instruction to this build, so it's not reflected in the code.

Shipped: a single canvas rendering a Sierpinski triangle that zooms continuously
into a randomly-chosen sub-triangle, forever, with the hue drifting a full turn
per level so it reads as one continuous descent rather than repeating tiles.
Controls: play/pause, a 3-speed cycle button, reset, and a live level/zoom
readout plus the last ~40 corner choices as a path string (L/M/R). Reduced-motion
visitors get a still frame and a "zoom one level" button instead of autoplay.

## Decisions

**Sierpinski triangle, not a Mandelbrot deep-zoom.** A Mandelbrot zoom is the
obvious mental image of "zooming fractal," but it hits a real wall: float64 runs
out of distinguishable precision around 10^14–10^15x zoom (a couple of minutes
in), and doing better needs arbitrary-precision / perturbation-theory math,
which is a lot to build and verify with no way to actually run the page here. A
self-similar IFS fractal (Sierpinski) has no such ceiling — see the "why this
doesn't grind to a halt" panel on the page, which explains it honestly rather
than just claiming "infinite" and hoping.

**No absolute coordinates, ever.** The zoom is implemented as: pick a random
child (0/1/2) of the *current* triangle, and interpolate a *local* affine map
(scale 1→2, translate 0→−2·offset) each level, always operating on numbers in
roughly [0,1]. When a level completes, the level counter increments but the
local coordinate system is thrown away and reused from scratch. That's the
whole trick and the reason it can run for however many levels without special
math — worth preserving if this gets extended.

**Kit defaults, no custom accent.** norvid-studies' profile shows no stated
palette preference across three prior builds; this one leans on the kit's amber
accent for UI chrome and lets the fractal's own hue-cycling carry the visual
identity instead.

## The plan (not built yet, in order)

1. **Visitor-steerable zoom.** Right now the corner is `Math.random()`. Letting
   a visitor tap/click one of the three visible corners to choose the next dive
   (instead of only watching a random one) would make it interactive rather than
   a screensaver. The hard part is nothing computational — it's just wiring a
   click position to whichever sub-triangle contains it, using the same
   `viewA/viewB/viewC` canvas points already computed in `drawFrame`.
2. **A second fractal mode**, e.g. a Menger sponge in 3D via `three.module.min.js`
   (same "no absolute coordinates" trick generalizes to 3D IFS maps) — pure
   addition, wire a mode toggle, don't touch the existing 2D path.
3. **Optional: save a favourite path** to the visitor's own repo via
   `/_kit/pds.js` (`store.save('bottomless-path', recentPath)`) so they can
   return to a zoom they liked. Skipped this turn because the site works fully
   without sign-in and demanding it upfront was explicitly against the kit's
   guidance — add it as a "remember this" affordance, not a gate.

## Gotchas

- The canvas-sizing map (`toCanvas`) is a pure scale+translate, not a general
  3-point affine solve — that only works because the local base triangle
  (A,B,C) never rotates or shears relative to the canvas. If a future version
  adds rotation to the zoom (e.g. for visual variety), this shortcut breaks and
  needs the full affine solve from three point-pairs instead.
- `maxDepth` for the recursive detail draw is fixed at 7 (2187 leaf fills/frame).
  That's cheap on a phone; don't be tempted to push it much higher without
  actually confirming frame time on a real device — untested here since there's
  no way to load a browser in this sandbox.
- Never tested in an actual browser — no Bash/WebFetch available. The math was
  hand-checked (affine map derivation for the three IFS offsets, and the
  identity→inverse-map interpolation formula) but a smoke-test failure on
  canvas sizing or the reduced-motion path is plausible; check that report
  first if one comes back.
