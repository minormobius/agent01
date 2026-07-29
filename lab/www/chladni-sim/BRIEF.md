# BRIEF — chladni-sim

## What this is

Requested as "chladni sim written in rust and rendered in 3js... a few preset
frequencies on a default plate is fine for now. The point is explaining
vibration modes, get a little didactic with it."

Shipped: a square plate rendered in three.js (r169, vendored kit copy), eight
preset vibration modes `(n, m)` selectable by button, the plate's standing-wave
shape drawn as a colour-and-height-displaced surface (orange up / blue down),
and a particle "sand" simulation (~1100 points) that jitters more where the
surface is moving and drifts toward wherever it isn't — so over a few seconds
it visibly collects into the mode's nodal-line pattern, the way real sand does
on a real Chladni plate. A "shake the plate" button rescatters the sand, a
settle-speed slider adjusts how fast it converges. Didactic copy explains
nodes/antinodes and how to read the `(n, m)` label, and is explicit that the
"relative frequency" number is illustrative (~ n²+m²) and not calibrated to
Hz or any real material.

## Decisions

- **Not actually Rust.** The request explicitly asked for Rust, but this
  sandbox has no compiler and no network — it cannot produce a `.wasm`, and
  `lab/_kit/wasm/` only carries `wave_md`, `codescan_ocr`, and
  `pds_car_parser`, none of which do anything Chladni-shaped. Built the
  physics in plain JS instead (cheap enough at this scale: 65×65 mesh,
  ~1100 particles, all closed-form trig, no iteration budget issue) and said
  so in NOTE.txt. If the requester actually wants wasm-speed physics (matters
  more at higher resolution or a finite-element solve instead of the
  closed-form approximation below), a human needs to vendor a compiled crate
  into `lab/_kit/wasm/` first — the build agent still can't compile one.
- **Closed-form mode shape, not a real eigensolver.** Used
  `U(x,y) = cos(nπx)cos(mπy) − cos(mπx)cos(nπy)` on a square domain
  `[-1,1]²` — a standard textbook approximation for square-plate Chladni
  figures (not exact for a real free-edge plate, but visually correct and
  fast). `n == m` makes U identically zero everywhere, so it's excluded from
  every preset on purpose — don't add a preset with equal indices.
- **Square plate**, matching the formula above and "a default plate is fine."
  A circular plate needs Bessel functions instead of cos/cos and wasn't
  worth the turn.
- **Sand settles by simulated jitter + gradient descent on |U|**, not a real
  particle-in-cell physics sim: cheap, and the visual result (grains collect
  on the zero-contour of U) is what actually matters pedagogically.
- **`prefers-reduced-motion`**: skips the continuous oscillation and the
  per-frame particle jitter; instead runs 260 settle iterations synchronously
  once per mode switch and shows the plate frozen at max displacement, so a
  reduced-motion visitor still sees the converged pattern instead of nothing.
  Camera drag/zoom still works either way — that's interaction, not motion.

## The plan (not built yet, in order)

1. **Verify in a real browser.** Never ran this — no Bash/WebFetch here. Most
   likely failure points: `settleMultiplier` scale unit for JITTER/SETTLE
   might be too aggressive or too slow (picked by hand, not tuned against
   anything visible), and the `camera.up.set(0,0,1)` + top-down-ish framing
   might not read as "a plate" as clearly as intended on first glance —
   check the initial camera angle actually shows the surface curvature well.
2. **Custom (n, m) input** beyond the eight presets — two number inputs,
   validated `n !== m`, both `>= 1` — would let a visitor explore instead of
   only picking canned modes. Straightforward addition to `setMode`.
3. **A driven-point marker** — real Chladni demos excite the plate from one
   fixed point (usually the centre or clamp point); showing that point would
   make the "why does driving here excite this shape" connection more
   concrete. Didactic add, not required.
4. If the requester does want real Rust: vendor a wasm crate that exposes
   `eval_mode(n, m, x, y) -> f32` (or a whole-grid batch call to avoid FFI
   overhead per vertex) into `lab/_kit/wasm/`, then swap `evalU`/`absU` in
   this file for calls into it. The JS version is a straight drop-in
   replacement target — same function signature, same domain.

## Gotchas

- `n === m` gives an identically-zero mode (algebraically, not just
  visually) — confirmed by hand from the formula, not by running it. Kept
  out of `PRESETS` for that reason; if presets are edited, keep that
  exclusion.
- Never got to see this render. If the mesh looks flat/wrong, check
  `computeVertexNormals()` is actually being called after every height
  update (it is, in `applyHeights`) before assuming the lighting setup is
  broken.
- No Bluesky API calls anywhere on this page (no handle typeahead needed —
  there's no visitor-named subject here), so no fixtures were relevant and
  none were read.
