# TORUS RUSH — INPAC, as a race

## The fork: pure tube racer

I cleared the board. No maze, no pellets, no ghost-hunt.

The torus's *geometry* is the interesting thing INPAC owns, and Pac-Man's
maze fights it: a maze is a flat-grid habit, and the torus's real offer is that
every line on it is a circuit. A race is the smallest game that makes the
topology the whole game — the long way round the ring vs the short way is not a
decorative choice, it is the difference between the outer equator (2π(R+r) ≈ 69
units) and the inner equator (2π(R−r) ≈ 31 units). A maze on a torus just
re-poses the same walls Pac-Man already had, in a harder place to read. A race
lets the player *feel* that the inner wall is a shorter lap.

So: one lap is one full traversal of the ring. The inner equator is the racing
line — the shortest way around, drawn as a gold line right where you stand. A
"pure tube racer" also lets the fixed physics bug be load-bearing rather than
incidental: at speed you *need* gravity to pin you to the wall at every point of
the tube, which is exactly what the fixed field now does.

## The physics fix

The electrostatic LUT was replaced with an analytic harmonic well — the field is
the gradient of ½·|p − centreline|², so acceleration is simply the vector from
the tube centreline to the point. Direction is exactly the wall normal
everywhere (worst tilt 0.0°), magnitude is uniform around the tube (1.00×,
down from a 5× spread), and it is finite on the centreline. Extracted to
`field.mjs` per the seam, with a byte-identical inline fallback for file://
loads (dynamic `import('./field.mjs')` is blocked by CORS over file://; the
module is used in production over http(s)).

A design consequence worth noting: because the field is harmonic, a jump
launched inward decelerates as it crosses the tube and lands gently on the far
side — harmonic-oscillator arcs. That turned "jump the tube" (Space) into a
real line-choice move: leap across the inside to switch walls mid-race, or cut
the corner onto a boost pad on the far wall. The orbit is driven by the same
`field()` the scorer checks.

## What was designed

- **The circuit.** 72×24 unwrapped track, all floor. Lap counting runs on
  unwrapped-u with wrap-aware accumulation, so cutting a corner reads as
  progress rather than a backwards half-lap.
- **The racing line.** A gold line on the inner equator plus a white checker
  start/finish band that wraps the whole tube cross-section and pulses as a
  beacon — the classic "hug the line" read, but the line is the short side of a
  donut.
- **Boost pads.** Nine pads slalom across the tube (inner wall → outer wall →
  back), giving the inner line a cost: the straight inner route is shortest but
  bypasses the boost line, so the fast lap is a trade.
- **Rivals.** Four ghost racers on fixed pacing around the ring, one per
  Pac-Man ghost colour. They are positional (you cannot hit them), so racing
  them is about line choice, not combat.
- **The leap.** Space launches you across the tube interior on the fixed field;
  the whole tube is a surface you can land on.
- **HUD.** Race clock, lap counter, best-time, live position vs the ghosts, a
  speed readout with a boost bar, a lap-progress bar with the rivals and boost
  ticks on it, and an unwrapped minimap showing the racing line, the pads, the
  ghosts and your chevron. The minimap is the "director's map" — the same
  unwrapped tube, at a glance.
- **Look.** Interior ray-marcher: dark carbon track with a poloidal band so the
  tube's curvature reads, gold racing line, pulsing emissive finish band,
  distance fog so the tunnel recedes, glowing boost orbs, ghost point-lights,
  and a vignette framing the viewport.

## What was traded away

- The maze, the pellets, eating ghosts. That is the fork, deliberately.
- **The long way around.** The topology offers two independent circuits (and a
  spiral through both); I chose the ring as the lap because it is the one a
  player can read and hold in their head at speed. The spiral is a mode I did
  not build.
- Ghost-hunt scoring (eat them, score points). A race scores time, not points.
- A second camera mode. The FPV tube view is the whole game; there is no
  orbit/debug camera to fall back to.

## What could not be verified

- **The 3D WebGPU view itself.** Headless Chromium does not composite the WebGPU
  surface into a screenshot, so neither I nor the capture harness can see the
  interior render. What *was* verified: the WGSL compiles and the compute+blit
  pipelines construct under SwiftShader (a real adapter, so the shader is valid
  WGSL and the frame loop runs), and `?autostart=1` drives the game with zero
  input and no page errors. What I am *trusting*: that the shader's analytic
  track paint reads as intended on a real GPU. I have not seen it.
- **Feel.** Speed, turn rate, the leap arc — tuned to numbers I chose, not to
  play. Nothing in this sandbox has hands.

Verified headlessly: gate 5/5, skeleton 4/4, gravity 100/100 at the three
scored geometries, and the composited HUD filmstrip (clock, progress bar,
minimap, rivals) is alive and correctly laid out.
