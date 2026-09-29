# BRIEF — chladni-sim

## What this is

Request, verbatim: "chladni sim written in rust and rendered in 3js. a few
preset frequencies on a default plate is fine for now. The point is
explaining vibration modes, get a little didactic with it."

Acceptance list, my own reading of it:

1. A Chladni-plate simulation — sand/grains on a vibrating plate settle into
   the nodal-line patterns (the classic "cymatics" figures).
2. Rendered in three.js, in 3D (plate + grains as a real WebGL scene, not a
   flat canvas pretending to be one).
3. "written in rust" — see DECISIONS, this did not ship as asked.
4. A default plate with a handful of preset frequencies/modes to pick between.
5. Didactic: the page has to *teach* what a vibration mode, a node and an
   antinode are, not just show a pretty pattern.

All five are built. See the checklist at the bottom for what I verified with
the eyes tools and what I saw.

## Decisions

**Rust did not happen — this is JS math, not a compiled module, and that's a
deliberate substitution, not a shortcut I forgot to flag.** The build agent has
no compiler, no network and no shell; a `.wasm` can only ship here if a human
vendors it into `lab/_kit/wasm/` ahead of time, and the kit's three vendored
modules (`wave_md`, `codescan_ocr`, `pds_car_parser`) are markdown rendering,
OCR and CAR-file parsing — nothing plate-physics-shaped. So the eigenmode
function and the particle integrator are plain JS, run once per frame on the
main thread. If a Rust/wasm module for this ever gets vendored, swap it in
there — the call sites are `U(x,y,n,m)` and the two partial derivatives in the
`<script>` block, all in one place.

**Eigenmode formula: the standard textbook approximation for a square plate
with free edges**, used in essentially every Chladni-figure demo I know of
(the "cos/cos difference" form):

    U(x,y) = cos(nπx)cos(mπy) − cos(mπx)cos(nπy),   x,y ∈ [−1,1]

This is *not* an exact solution to the biharmonic plate equation (that has no
closed form for a free rectangular plate) — it's a superposition of two
degenerate standing-wave terms that reproduces the right qualitative pattern
(same node count, same symmetry) and is the version normally taught. The page
says so in the didactic copy rather than claiming more precision than it has.

**Particle motion is a real (if simplified) force model, not a canned
animation.** Each grain feels: (a) a force down the gradient of U² — i.e.
toward the nearest node, analytically differentiated from the closed form
above, not finite-differenced; (b) jitter proportional to local |U| — the
higher the plate's local amplitude, the more a grain bounces, matching what
actually happens on a real Chladni plate; (c) damping so jitter dies down and
grains actually settle instead of jittering forever. Changing mode recomputes
the field and every grain's force live — nothing is precomputed or faked.

**No Bluesky/OAuth/PDS features.** This site has no state worth saving (no
score, no document) and no reason to know who's visiting, so I left out
`pds.js` and `handleInput` entirely rather than bolting on a handle box the
brief doesn't call for. Kit `tokens.css` is linked for the shared palette;
`kit.js` isn't needed since nothing calls the AppView or shows an error state
from a network call (there is no network call).

**Custom (n,m) sliders alongside the presets.** The brief said presets were
"fine for now," not "only" — sliders were cheap once the field function
existed and they're the more didactic control (you can watch node count grow
smoothly as m increases), so I kept both: five presets for a quick tour, plus
free exploration.

**Camera has drag-to-orbit and pinch/wheel-to-zoom, hand-rolled against
`THREE.Spherical`** rather than vendoring/reimplementing OrbitControls (not
in the kit) — about 40 lines, and the didactic point (see the whole plate,
tilt to compare regions) doesn't need anything fancier.

**Frequency labels are relative, not Hz.** Real plate-mode frequency depends
on material, thickness and plate size, none of which this page has, so
labelling presets "440 Hz" etc. would be a made-up number dressed as a fact.
Instead each preset shows its (n,m) indices and a relative frequency figure
(∝ n²+m², the standard thin-plate scaling), with copy saying explicitly that
it's relative, not physical units.

## The plan (what's not built)

- **Damping/jitter constants are hand-tuned, not derived.** They produce
  visually convincing settling in the 5–15s range for every preset I tried,
  but a next pass could expose them as a "settle speed" slider rather than
  fixed constants if that's wanted.
- **No sound.** A real Chladni demo is usually driven by an audible tone from
  a signal generator; this page has no audio at all. Adding a WebAudio
  oscillator at a pitch that scales with the relative frequency, silent by
  default (autoplay policies + it's genuinely optional), would strengthen the
  "this is what that frequency sounds like" connection. Not attempted this
  turn — scope decision, not a blocker.
- **Only a square plate.** Circular/free-form plates have different (Bessel-
  function) eigenmodes and would need a materially different math section
  and a different particle-clamping shape. If asked for, don't try to bend
  the square formula — it's genuinely different physics.
- **Rust/wasm**, if ever vendored: see DECISIONS above for the exact call
  sites to swap.

## Gotchas

- **`U(x,y)` blows up to a flat plate (no pattern) at n=m** — both cos/cos
  terms are identical so they cancel to exactly zero everywhere, which looks
  like a bug (grains just drift with no lines) but is correct: a square mode
  with n=m is degenerate/trivial in this formula. The slider UI clamps m away
  from n's current value (bumps it by 1) rather than allowing the dead state,
  and the presets are all n≠m.
- Three.js `Points` needs its `BufferAttribute` marked `needsUpdate = true`
  every frame after mutating the positions array in place — easy to forget
  and get a frozen scene with a live physics loop underneath it.
- Kept the whole simulation on the main thread with a capped grain count
  (2500) rather than a worker; a worker would need `postMessage`-copying the
  position buffer every frame at 60fps, which is more overhead than the sim
  itself at this grain count.

## Verified this turn (eyes tools)

- Desktop `look` at load: plate + heatmap + settling grains render, default
  preset (second mode, n=1/m=3) selected, no console errors.
- `drive` with staged `wait`+`shot` after "scatter sand again": watched a
  fresh random scatter visibly converge to the correct nodal-line pattern
  over ~4.5s — not an instant snap, real settling.
- `drive` through all five presets: each produces a visually distinct,
  correctly-more-complex pattern as n²+m² rises (checked 1st/4th/5th
  explicitly against the screenshots — a cross, then a lattice, then a finer
  lattice, all internally consistent with more nodal lines at higher modes).
- `drive` with `eval` to set the n/m sliders directly and fire `input`:
  confirmed the n=m clamp bumps m rather than allowing a dead (all-zero)
  field, and the label switches to "custom" when off-preset.
- `drive`: pause/resume freezes the grain positions exactly (compared two
  shots with the sim paused — identical), and unchecking "show amplitude
  field" flattens the plate texture live.
- Found and fixed mid-build: the formula block was `white-space: nowrap`
  with `overflow-x: auto`, which clipped it in view on both viewports
  tested — a visitor would have had to discover a hidden scrollbar to read
  the rest. Changed to wrap; re-verified on desktop and 390px mobile.
- Mobile `look`/`drive` (390×844, `mobile: true`): no horizontal scroll,
  preset buttons wrap two-up and measured ≥44px tall via `eval`, one-finger
  drag rotates the camera. Added pinch-to-zoom (two-pointer distance ratio)
  after noticing the hint text promised zoom that touch couldn't do —
  wheel-only zoom would have made that line false on a phone.
- `prefers-reduced-motion`: covered by the kit's blanket CSS rule for
  transitions; the simulation's own motion has its own visible pause button,
  per the brief's rule that a motion-is-the-point page must offer one.
