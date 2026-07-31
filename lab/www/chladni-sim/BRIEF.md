# BRIEF — chladni-sim

## What this is

Turn one built a square Chladni plate in three.js with eight preset `(n, m)`
mode buttons and a sand simulation. This turn's ask: "bring in real plate
geometry, thickness and span, and then a frequency sweep to measure the
resonant points — Bode plots."

Shipped: material (steel/aluminum/glass/acrylic) + span (10–100cm) + thickness
(0.5–8mm) controls that drive an actual `f = (π²/2π)√(D/ρh)·((n/a)²+(m/a)²)`
plate-frequency formula, giving every mode a real Hz number instead of a
"relative frequency ×" placeholder. The old discrete 8-preset button row is
gone, replaced by a continuous frequency slider plus a "Sweep" button that
ramps the driving frequency back and forth across the plate's range. Alongside
the 3D view is an SVG Bode magnitude plot (dB vs Hz, log frequency axis) of
the driving-point response — the classic modal-superposition receptance,
summed over ten modes `(n,m)` for `n<m`, `n,m ∈ 1..5`, each a damped
oscillator excited from one fixed off-centre drive point. Ten resonance peaks
are marked and labelled with their `(n,m)`; clicking a peak jumps the
frequency straight there. The 3D plate's shape is now a live weighted blend
of all ten mode shapes, weighted by how strongly each one responds at the
current driving frequency — off-resonance the blend is messy and the sand
just sits scattered; at a resonance one mode's weight dominates so hard the
blend collapses to that mode's clean nodal-line pattern, and the sand walks
there. A driven-point marker (a small sphere) sits on the plate surface at the
fixed drive location. A damping slider (labelled "damping", 0.5%–8%) sets ζ
for every mode and visibly controls how sharp or broad the Bode peaks are —
lower damping, sharper peaks, easier to overshoot with the slider.

## Decisions

- **Kept the plate square**, one "span" control rather than separate width/
  height. The mode-shape formula `cos(nπx)cos(mπy) − cos(mπx)cos(nπy)` is
  defined on `[-1,1]²`; a rectangular plate needs a different, non-square
  domain formula and a second geometry axis in the UI, and "bring in span"
  reads as one number, not two. If a future turn wants a rectangular plate,
  the frequency formula already generalises (`(n/a)² + (m/b)²`) — the mode
  *shape* function is what would need to change.
- **Frequency formula uses simply-supported boundary conditions; the mode
  shapes use the free-edge cosine approximation from turn one.** These are
  technically two different boundary conditions and a rigorous model would
  pick one. Kept the mismatch and disclosed it in the "Reading the plot"
  copy, because the free-edge cosine shapes are what actually produce
  recognisable Chladni figures, and the simply-supported frequency formula is
  the standard textbook one — swapping either loses something. Said so
  explicitly rather than quietly presenting both as exact.
- **Ten modes (`n<m`, both 1..5), not the original eight presets.** More
  peaks makes a more convincing Bode plot and the compute cost is trivial
  (mode shapes are geometry-independent, precomputed once on the grid at
  startup; only the ten frequencies rescale when geometry changes).
- **Fixed off-centre drive point `(0.37, -0.61)`, not the centre.** The centre
  is `evalMode(n,m,0,0) = cos(0)cos(0) − cos(0)cos(0) = 0` for every mode of
  this family — driving there would excite nothing, for any `(n,m)`. This
  matches how real Chladni demos are actually driven (off-centre or from an
  edge), and is now shown on the plate as a small marker sphere, closing out
  turn one's "driven-point marker" plan item.
- **Removed sand rescatter on every frequency change.** Turn one rescattered
  sand on every mode switch. A continuous sweep would fight that — the point
  of dragging the frequency slider is to *watch* the sand reorganise in real
  time as you approach a resonance, the way a real demo actually looks.
  Rescatter is now only on the explicit "Shake the plate" button.
- **Damping (ζ) is an arbitrary illustrative knob**, not modelled from the
  chosen material. Real Q depends on material internal damping, edge
  clamping, and air loading — out of scope for a slider. Said so in copy.
- **Driving-point response shown is the magnitude only** (proper complex sum
  across modes, so peaks come out right), but the 3D shape blend drops
  cross-mode phase and just weights each mode's shape by its own signed
  response magnitude. Physically approximate — good enough that the shape
  visibly collapses onto the dominant mode near resonance, which is the part
  that matters pedagogically. Said so in copy.
- **`prefers-reduced-motion`**: the Sweep button is disabled outright (a
  continuous back-and-forth ramp is exactly the kind of motion the media
  query means to suppress) with a note to use the slider instead; the slider
  itself still works, and each manual frequency change runs 120 settle steps
  synchronously and freezes the plate at max displacement, same pattern as
  turn one used for mode switches.

## The plan (not built yet, in order)

1. **Verify in a real browser — still never been run.** This turn's biggest
   unverified surface is the SVG Bode chart: check the log-frequency axis
   ticks land somewhere sane for the default steel/30cm/2mm plate (~266 Hz to
   ~660 Hz across ten modes — worked out by hand, not observed), that peak
   labels aren't so crowded they're illegible at phone width, and that the
   `viewBox`-based responsive scaling doesn't leave the chart tiny or
   clipped. Also check the moving frequency marker (dashed vertical line +
   dot) tracks smoothly during a sweep rather than stuttering.
2. **Custom `(n, m)` input beyond the fixed ten** is superseded, not really
   needed anymore — continuous frequency exploration via the slider covers
   the "let a visitor explore instead of only picking canned modes" goal
   turn one flagged, arguably better than a raw `(n,m)` box would have.
3. **Rectangular plate** (separate width/height spans) if ever asked for —
   see the "kept it square" decision above for what that requires.
4. If the requester still wants real Rust/wasm: unchanged from turn one —
   vendor a wasm crate exposing a whole-grid `eval_mode` batch call into
   `lab/_kit/wasm/`, then swap `evalMode`/mode-shape precompute for calls
   into it. The JS math is still a clean drop-in target.

## Gotchas

- `evalMode(n, m, 0, 0)` is **always** zero — not just for the drive point,
  for any mode of this family evaluated at the plate centre. If a future
  drive point or interaction ever defaults to `(0,0)`, it will silently
  excite nothing. Keep the drive point off both symmetry axes.
- Mode shapes are precomputed once per `(n,m)` on the grid at startup and
  never touched again — only `mode.freqHz`/`mode.omega` change when geometry
  changes. If a rectangular-plate change ever makes the shape depend on
  `a`/`b` too, the shapes have to move into `recomputeGeometry()` instead of
  being computed once at module load.
- The three.js material for the mesh is named `material3d` specifically to
  avoid colliding with the new `material` variable (the selected
  steel/aluminum/glass/acrylic object) — if renaming either, grep both.
- Never got to see any of this render, same as turn one. If the mesh looks
  flat/wrong, check `computeVertexNormals()` is still being called in
  `applyHeights` before assuming the lighting is broken.
- No Bluesky API calls anywhere on this page — no fixtures were relevant.
