# BRIEF — create-vizualization

## What this is

The requester's ask, verbatim in spirit: build a visualization explorer for
the discrete complex map

    z_{n+1} = (r + cos θ) e^{iθ} − c

where r = |z_n|, θ = arg(z_n), and c ∈ ℝ is a constant slider. "Provide
multiple forms of visualization" is the explicit requirement — not one canvas,
several different views of the same system.

Acceptance list, derived from the request:

1. The map must be computed for real, exactly as given (r, then θ, then
   (r+cosθ)e^{iθ}, then subtract real c) — no shortcut, no faked fractal.
2. A visualization of orbits in the complex plane (the "phase plane" /
   dynamical-plane view) — pick a start point, see where it goes.
3. A visualization that sweeps many starting points at once, since a single
   orbit does not show the structure of the map — an escape-time map over a
   grid of z0, colored by how fast (or whether) the orbit diverges. This is
   the "hard part": a real per-pixel iteration, not a canned gradient.
4. A visualization of how the system depends on c, since c is the one free
   parameter — a bifurcation diagram sweeping c and plotting the long-run
   values of |z_n|.
5. A visualization of the orbit unrolled over time (n on the x-axis) rather
   than just in the plane — r_n and the real/imaginary parts vs n.
6. c must be an interactive control (slider), not a hardcoded constant.
7. Click-to-seed: clicking inside the escape-time map should set that point
   as z0 and redraw the orbit/time-series views for it.
8. Mobile-usable: viewport meta, ≥16px inputs, ≥44px tap targets, no
   horizontal scroll at 360px, nothing hover-only, prefers-reduced-motion
   respected (no animation loop runs unless "animate orbit" is on, and even
   that is a plain requestAnimationFrame path a user can pause).

Shipped this turn: all of the above, in one `index.html`, no framework, no
external data (this system needs none — it is pure math, not a Bluesky
surface, so the kit's handle/PDS/Bluesky plumbing is unused by design).

## Decisions

- **No Bluesky/handle/PDS integration.** This site has no visitor-named
  subject and nothing worth saving to a repo (no score, no user document) —
  it is a calculator/explorer over a formula. Wiring in `labPds`/handleInput
  would be decoration, not function, so I left it out. If a future ask wants
  "save my favorite c values", that's a natural `store.save('presets', …)`
  addition — see THE PLAN.
- **Bifurcation diagram plots |z_n|, not Re(z_n) or θ_n.** r is real,
  non-negative, and directly named in the formula, so it reads as the
  natural "height" for a bifurcation plot. Re(z_n) would fold positive and
  negative excursions together and read confusingly; I did not build a
  toggle for this turn but the code is one field away from adding one — see
  THE PLAN.
- **Escape criterion: |z_n| > ESCAPE_R (6) within maxIter (60) steps.**
  This is not a holomorphic map (it uses |z| and arg, not just +,×), so
  growth is additive (bounded by ±cos θ per step, plus a c-dependent cross
  term), not multiplicative the way z²+c blows up. A radius of 64 (my first
  try) turned out to be reachable almost nowhere within 60 steps — I
  measured escape fractions numerically (via `eyes drive` + `eval`, sampling
  a grid at several c and radii before touching the code) and found 6 gives
  real basin/escape structure across a meaningful slice of the c range,
  where 64 gave a near-solid black map almost everywhere. Treat the escape
  radius as tuned for visual structure, not derived from theory — the
  caption says so; do not strengthen that claim without re-deriving it.
- **The bifurcation diagram seeds from an off-axis z₀ = 0.3+0.4i, not a
  real point.** Any real-axis seed (I first tried z₀=1) keeps θ pinned at
  exactly 0 or π forever — cos(θ) never changes — so the whole recursion
  degenerates to a trivial linear one, re' = re + 1 − c, independent of the
  interesting 2D dynamics. Found by testing numerically before wiring it
  into the page; worth remembering if this map is extended anywhere else,
  since "start from the real axis" is the natural first thing to try and
  it's the one seed that hides everything interesting.
- **Canvas + hand-rolled charts, not an SVG library.** Nothing in `_kit` does
  charting, and pulling in a dependency is against the rules anyway. Plain
  `<canvas>` for the escape map and phase plane (pixel-level fill, needs to
  be fast), plain SVG-string polylines for the two time-series line charts
  (crisp at any DPI, easy to label).
- **Resolution is capped at 220×220 for the escape-time map**, recomputed
  synchronously on the main thread on slider release (not on every drag
  tick) plus a coarse live preview at 70×70 while dragging. 220×220×60 iters
  ≈ 2.9M complex steps, comfortably under a frame budget when done once per
  release; doing it on every mousemove would visibly stutter, hence the
  cheap live-preview / final-render split.

## The plan (not built this turn)

1. **A c-toggle for the bifurcation diagram's y-axis** (|z_n| vs Re(z_n) vs
   θ_n mod 2π) — small change, `bifurcation()` already computes the full
   complex tail, just currently throws away everything but the modulus.
2. **Zoom/pan on the escape-time map.** Right now the view window is fixed
   at Re,Im ∈ [-4,4]. A click-drag rectangle-zoom would let someone explore
   boundary detail. The hard part is keeping the click-to-seed gesture and
   a future drag-to-zoom gesture from fighting over the same pointer events
   — I'd suggest a modifier key (shift-drag to zoom) rather than a mode
   toggle, so the default click behavior never changes.
3. **Optional: persist a handful of "interesting c" bookmarks via
   `labPds`/`store.save`.** Only worth doing if a future requester actually
   asks to save presets — don't add it speculatively.
4. **A worker thread for the escape-time computation** if someone wants a
   bigger grid (400×400+) — right now it is synchronous on the main thread,
   which is fine at 220×220 but would start to jank at 2-3x that.

## Gotchas

- `Math.atan2(0, 0)` returns `0` in JS, which is exactly the convention this
  map needs at the origin (r=0 ⇒ θ defined as 0) — no special-casing needed,
  but it's worth knowing that's *why* z=0 doesn't throw or produce NaN.
- The map is **not** rotation-symmetric the way z²+c is, because `cos θ`
  (not `cos 2θ` or similar) breaks the symmetry — the escape-time map is
  visibly lopsided along the real axis. That is correct behavior, not a bug;
  don't "fix" it into looking more Mandelbrot-like.
- Bounded/interesting dynamics for this map live in a narrow band of c
  roughly [0.3, 1.1] (centered near c=1, where z=0 is an exact fixed point
  since 1−c=0 there). Outside that band, nearly every orbit just drifts
  monotonically — not chaotically, just linearly off to ±infinity — so the
  bifurcation diagram legitimately shows a flat "ceiling" line for most of
  the c axis and only fans out near that band. That is the real math, not a
  rendering bug; don't chase a "nicer" full-range cascade that isn't there.
- `prefers-reduced-motion` in `tokens.css` only kills CSS transitions/
  animations, not `requestAnimationFrame` — I still gated the orbit
  animation loop behind an explicit checkbox that defaults **off**, so nothing
  moves on load regardless of that media query.

## What was checked with `eyes` this turn

See NOTE.txt for the one thing that couldn't be said elsewhere. All four
views were screenshotted after building (escape map, phase/orbit view, both
time-series charts, bifurcation diagram), the c-slider was dragged with
`drive` and confirmed to redraw, click-to-seed was clicked at a few points
and confirmed the orbit view updates, and a 390×844 mobile viewport was
checked for layout/tap-target sanity.
