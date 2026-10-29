# user-inputs — handoff

## What this is

The request was purely mathematical, no reference link: give the user sliders
for the Fourier coefficients of a function `f: S^1 -> R` satisfying
`f(θ+π) = -f(θ)`, a slider for `t ∈ [0,1]`, and for every point of a canvas,
convert to polar `{r,θ}`, push it to `{r + t*f(θ), θ}`, convert back to
Cartesian, and colour the result with a checkerboard so the deformation is
visible.

`f(θ+π) = -f(θ)` is exactly half-wave symmetry: plug θ+π into `cos(nθ)` and
you get `(-1)^n cos(nθ)`, so a harmonic survives the antipodal sign flip only
when n is odd — and n=0 (the constant term) can never survive it. So "the
Fourier basis of functions satisfying this" is precisely
`{cos(nθ), sin(nθ) : n odd}`, and that basis is what the sliders expose,
capped at n = 1,3,5,7,9 (five terms — an infinite series needs infinite
sliders, so this is the one real simplification made).

Shipped: a single page, `index.html`. A 440×440 canvas renders the checkerboard
pull-back (each output pixel is coloured by which checkerboard cell its
polar-warped position lands in), a set of `aₙ`/`bₙ` sliders per harmonic, a
`t` slider, a cell-size slider, reset/randomize buttons, an opt-in "animate t"
toggle that sweeps 0→1→0, and a small live plot of `f(θ)` over one turn so the
shape driving the warp is visible on its own, not just inferred from the
canvas. No login, no backend, no `/_kit/pds.js` — nothing here needs to persist
across visits, so state lives only in page memory.

## Decisions

- **Colour the checkerboard in the *mapped* coordinate, not the source
  coordinate.** For output pixel (x,y): compute (r,θ), the warped
  `(r+t·f(θ), θ)`, convert that back to Cartesian, and look up the
  checkerboard colour *there*. That is a literal reading of "for every {x,y}
  in the plane... convert back to cartesian... visualize w/ checkerboard
  domain coloring" — the picture is the checkerboard pulled back through the
  map, which is the standard way to visualize a 2D deformation (same idea as
  domain coloring in complex analysis). I considered instead warping grid
  *lines* (drawing a deformed checkerboard mesh) but that loses the
  per-pixel "convert every {x,y}" instruction, which reads as a forward scan
  over the canvas, not a mesh draw.
- **Precompute `r`, `θ`, `cos θ`, `sin θ` once per pixel at load**, since
  those never change; only the per-pixel harmonic sum depends on the
  sliders/`t`, so each render only redoes that sum plus the final
  cos/sin(θ)·r₂ multiply. This is what makes the "animate t" toggle usable —
  without it the 440×440 canvas (~194k pixels × 5 harmonics × 2 trig calls)
  would recompute atan2/sqrt every frame too.
- **No `/_kit/pds.js` / sign-in.** Nothing here is worth saving between
  visits — it's a live instrument, not a document — so I left out the
  backend entirely rather than bolt on a "save your coefficients" feature
  nobody asked for.
- Colours are the kit's own `--fg` / `--bg-raised` (light/dark cells) rather
  than the accent, so the checkerboard reads as neutral and `--accent`
  (orange) is reserved for the `f(θ)` plot line and UI chrome — keeps the
  canvas legible instead of a wash of orange.

## The plan (not built yet, in order)

1. **PNG export / "save this frame" button.** Cheap (`canvas.toBlob`), not
   done only because of the time box.
2. **Higher canvas resolution on desktop.** 440px is a safe default for phone
   width; a `matchMedia` check could bump internal resolution (and
   re-run `precompute()`) to ~700px on wide viewports for a crisper image,
   at the cost of needing to guard the animate loop's frame time.
3. **View-radius / zoom control.** Right now `VIEW_RADIUS = 200` (world
   units) is fixed; large coefficients or small n push structure outside the
   visible canvas. A zoom slider (or auto-fit based on current max |f|)
   would help once someone pushes the sliders to their extremes.
4. **Complex-plane framing.** Never asked for, but this whole construction
   (`z ↦ z·(1 + t·f(arg z)/|z|)`-ish) is one step from being read as a
   perturbation of the identity map on ℂ; if a follow-up asks for that lens,
   the polar precompute here already has everything needed.

## Gotchas

- `(cellX + cellY) & 1` for checkerboard parity works correctly on negative
  cell indices in JS (two's-complement `&` preserves the low bit through
  `Math.floor` on negatives), so no `((x%2)+2)%2` dance was needed — verified
  by hand, not by running it (no browser here).
- The `n*θ` term inside `Math.cos`/`Math.sin` in the render loop is the only
  per-frame trig that scales with harmonic count; everything else is a single
  precomputed lookup. If a future turn adds more harmonics, that's the cost
  that grows, not the pixel loop itself.
- Kit's `tokens.css` disables *CSS* animation/transitions under
  `prefers-reduced-motion`, not `requestAnimationFrame` — the animate toggle
  here is opt-in and defaults off, which was judged sufficient rather than
  also gating it behind a media query; revisit if that's wrong.
- Unable to load this in a browser from this sandbox (no network/shell) —
  the math (half-wave symmetry ⇒ odd harmonics only) was verified by hand,
  not the pixel output.
