# BRIEF — plot-all (Newman polynomial roots)

## What this is

The ask: plot all complex solutions of all Newman polynomials up to degree 15.
A Newman polynomial has every coefficient in {0,1}, with leading and constant
term fixed at 1 — that gives 2^(d-1) distinct polynomials at degree d, and
summed over d=1..15 that's 32,767 polynomials and 458,753 roots total.

Shipped: a single-page site that generates every one of those polynomials,
finds its roots with the Durand-Kerner (Weierstrass) method, and plots all of
them on the complex plane. It runs entirely client-side, chunked across
animation frames (no Web Worker — see Decisions), with a live progress bar,
pan/zoom (drag, wheel, pinch), a degree slider (1-15, cumulative or
single-degree), point-size and brightness controls, and a Stop button. It
auto-runs the full degree-15 range on load.

## Decisions

- **No Web Worker.** The kit doc says workers are CSP-allowed same-origin, but
  the brief for this site says "one index.html", and a worker needs its own
  file (or a blob URL, which isn't obviously covered by `script-src 'self'
  'unsafe-inline'`). Chose main-thread chunking (rAF loop, ~14ms per frame)
  over risking a silently-blocked worker. If a future turn wants to try a
  worker, test the blob-URL CSP question first — it's the only way to keep it
  in one file.
- **Pixel-accumulation rendering, not per-point canvas draws.** With up to
  458,753 points, drawing each with `ctx.arc`/`fillRect` would be far slower
  than the render needs to be. Instead every point is splatted into a
  count+degree-sum typed-array buffer sized to the canvas, composited to an
  ImageData once per redraw. This also gives density-as-brightness for free
  (log-scaled) and made colouring by *average* degree per pixel trivial.
- **Ordinal colour ramp, not categorical.** Degree is an ordered quantity, so
  it took the dataviz skill's single-hue sequential ramp (blue, dark-safe
  steps 100-600) rather than the 8-hue categorical palette, which would have
  implied 15 unrelated identities and needed a series cap anyway.
- **Auto-runs the full degree-15 range on load** rather than defaulting to a
  smaller degree, because that's the literal ask and low degrees finish near-
  instantly, so even a screenshot taken seconds after load shows real progress
  rather than a blank canvas.
- **Golden-ratio annulus bound** (`1/phi <= |z| <= phi`) stated in the copy is
  a known real bound for this coefficient class — worth double-checking if
  anyone challenges the exact constant, but it's the standard cited result for
  {0,1}-coefficient polynomials with constant term 1, not something invented
  for this page.

## The plan (not built yet, in order)

1. **Verify in a real browser.** This was written without any way to run it —
   no bash, no browser. The harness screenshot after this turn is the first
   real look. Check: does the initial degree-15 compute finish in a reasonable
   time (tens of seconds, not minutes)? Does the fractal-like annulus actually
   appear where expected? If iteration counts in `iterationsFor` are too low
   for high-degree convergence, roots will look scattered/wrong at degree 12+
   — that's the first thing to eyeball.
2. **Tune iteration counts / point splat / brightness curve** once there's a
   real screenshot to react to — these were chosen by estimate, not measurement.
3. **Consider precomputing at build time.** If live compute proves too slow on
   real phones even chunked, the alternative is generating a static roots
   table (there's no build step here, but nothing stops writing the numbers
   once, e.g. as a big literal array in the file — that would blow past "no
   build step" being trivial, so weigh it against just capping default max
   degree lower, e.g. 12, and letting users opt into 15).
4. **Keyboard pan/zoom** (arrow keys, +/-) for accessibility — skipped this
   turn for time.

## Gotchas

- Durand-Kerner needs distinct initial guesses per polynomial; they're seeded
  on a circle of radius 1.3 with a fixed phase offset (0.37 rad) to avoid two
  polynomials' initial guesses landing in exactly the same symmetric
  configuration. Untested whether that's enough for the rare near-repeated-root
  cases at high degree.
- The render's pixel buffers are reallocated only when canvas W/H changes, and
  cleared on every render() call — if extending this, remember the buffers
  don't persist between resizes, so a mid-drag resize will show a one-frame
  blank flash. Not currently a problem since resize and drag/zoom don't
  normally overlap.
- No Bluesky data of any kind is used here — this is pure math, no `bskyGet`
  calls, so the content gate's "subject the visitor named" rule doesn't
  apply. Don't assume that's true of other lab sites when reusing this as a
  template.
