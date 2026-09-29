# Driftmap — handoff

## What this is

The request: build a visualization explorer for the iterated map
`z_{n+1} = (r + cosθ)e^{iθ} − c`, where `r = |z_n|`, `θ = arg(z_n)`, and `c` is
a real constant. "Provide multiple forms of visualization" was the only
concrete requirement beyond the math itself.

Shipped, in one `index.html`, no dependencies: a tab bar switching between
four views over shared controls (c slider+number, z0 real/imag, iteration
count, escape radius, plane range):

1. **Orbit** — z0 through zN plotted in the complex plane, colour gradient
   early→late. Click/tap the plane to set a new z0 there.
2. **Escape-time map** — every pixel is its own z0 on the same plane, all
   iterated at the current c; colour = iterations until it passes the escape
   radius, dark = still bounded at a fixed cap. This is the Julia-set-shaped
   view — c is real here (not complex), so it's a 2D slice, not the usual
   complex-c Julia family, but the fractal boundary behaviour is the same
   kind of thing.
3. **r, θ over time** — two stacked line charts against iteration index,
   sharing the orbit computed for view 1.
4. **Bifurcation vs c** — sweeps c across a user-set range, iterates 200 steps
   to clear transients then plots the next 60 values of Re(z) as a column;
   the standard logistic-map-style diagram, adapted to this map's 1D real
   parameter.

## Decisions

- **c is real, so no complex parameter plane.** The obvious "Mandelbrot-style"
  companion view (sweep c over the complex plane, one pixel per c) doesn't
  apply here since c ∈ ℝ per the spec — that's why the fourth view is a 1D
  bifurcation sweep instead. If a future ask wants c promoted to complex, the
  bifurcation view is the one to replace with a proper c-plane escape map
  (same code shape as the existing escape-time map, just sweeping c instead
  of z0).
- **No three.js / 3D.** Considered plotting the orbit as a 3D spiral
  (Re, Im, n) since three.js is vendored and available, but four solid 2D
  views already satisfied "multiple forms" within the turn, and getting the
  escape-time map fast and correct felt like the higher-value use of the
  time. A 3D orbit view (helix through iteration-index) would be a clean
  follow-up and doesn't require touching the existing views.
- **No login, no ATProto.** This is a stateless math toy; there's nothing
  worth saving to a repo yet. If someone asks for "save my favourite (c, z0)
  combos", that's a `com.minomobi.lab.doc` record via `/_kit/pds.js`,
  optional sign-in, `localStorage` first per the kit's own guidance.
- **Escape-time map iteration count is hardcoded at 60**, decoupled from the
  orbit/series "iterations" control, so cranking that control up for a long
  orbit trace can't accidentally make the fractal view slow. Documented in
  the on-page caption rather than hidden.
- **Fractal grid resolution is a fixed 260×260 offscreen canvas**, scaled up
  to the display canvas with `imageSmoothingEnabled = false`. Keeps
  recompute under a rendering frame budget on modest hardware; a "detail"
  slider trading resolution for speed would be a reasonable addition later.

## The plan (not built yet)

1. A 3D orbit view via three.js (Re, Im, n) as a helix — the vendored library
   is unused right now. Would go in as a fifth tab; reuse `getOrbit()`.
2. Complex-c escape map, if the ask ever wants c generalized off the real
   line — see "Decisions" above for where it slots in.
3. A "detail" control for the escape-time map (trade FRACTAL_RES/FRACTAL_ITER
   for speed) if visitors on low-end phones report lag; I could not measure
   real-device performance from this sandbox.
4. Optional: persist the last-used (c, z0, N) in `localStorage` so a reload
   doesn't reset to defaults. Small, deliberately skipped this turn to keep
   scope tight.

## Gotchas

- The map has no singularities to guard: at z=0, `Math.atan2(0,0)` is `0` in
  JS, so `θ=0`, `r=0`, `k=1`, giving `z_1 = (1−c, 0)` — no NaN branch needed.
- Escape/divergence detection uses `Math.hypot(re,im) > max(escR*50, 1e4)` as
  the *hard stop* for the orbit loop (not `escR` itself) so the drawn path
  doesn't cut off the instant it crosses the nominal escape radius — it keeps
  going a while so the divergence is visible, then bails before floats hit
  Infinity. The readout text still reports "beyond escape radius" using the
  user's actual `escR`, independently of that hard stop.
- Canvases are sized from `canvas.parentElement.clientWidth` at DPR, but
  **only while their `<section>` is visible** — a hidden tab's stagewrap has
  `clientWidth = 0`. That's harmless because `sizeActiveCanvas()` runs right
  after the `hidden` class is toggled off, before that view ever renders —
  but don't reorder the tab-click handler without keeping that sequence.
- Untested in an actual browser by me (no shell/network in this sandbox) —
  the harness's post-build screenshot pass is the first real render. I traced
  the coordinate math and event-handler order carefully by hand instead.
