# INPAC RACE — notes

## The fork: a pure tube racer, Pac-Man DNA cleared

I cleared the board. No maze, no pellets, no ghost-chase, no lives. INPAC's real
asset was never the maze — it was being *inside* a torus, the whole curved
world wrapped over your head. The maze fought that (walls blocked sightlines and
every corridor looked the same). A race is the thing that shows the geometry
off: you are always moving forward around the ring, always seeing the far side
of the tube hanging overhead, always reading the track ahead.

What remains of INPAC is the first-person ray-traced interior, the walk-on-any-
wall physics, and a ghost — repurposed as the rival you race.

## What you're racing

Three things, layered:

1. **The clock.** Three laps; each lap timed; best lap kept. The skeleton
   `clock`/`laps`/`best` contract is the race core.
2. **A ghost rival.** A cyan spectre (Inky's colour, a nod to Pac-Man) that
   runs the same circuit at a speed a careful player beats and a lazy one
   doesn't. The HUD gap counter (`▲/▼ RIVAL +s`) turns the torus into a chase:
   because the tube wraps, you see the rival ahead *on the far wall*, running
   "upside down" relative to you. That is the strangest, most INPAC thing this
   game does, and it's free — it falls out of the topology.
3. **Your own best lap.** Each lap is recorded; after the first, a faint white
   breathing ghost replays your best lap alongside you. You race your past
   self, which is the honestest opponent there is.

## The circuit and the topology

A lap is one trip around the ring (`u: 0 → 2π`), but the racing line is a sine
wave in `v` — the amber ribbon climbs from the outer wall, over the top of the
tube, past the inner wall and back, once per ring lap. Two things make this
torus-only:

- **The whole track is visible at once.** Inside a tube you can see the far
  side; the minimap is the unrolled surface, so the *entire* circuit (ribbon,
  gates, your rival, your ghost) is on screen at all times. You read the track
  ahead and behind. A flat track can't do this.
- **The ribbon winds around both loops of the torus.** Following it is real
  steering, not "hold forward": the wave's slope exceeds your steering rate at
  the steep parts, so you brake in and cut the apexes — and the boost-hop lets
  you leap *through the interior* to shortcut a wave crest. The shortcut that
  skips part of the track by cutting across the doughnut is the one line a
  flat racer cannot have.

## The physics fix

The shipped electrostatic LUT (charged shell + centreline line charge) reversed
sign exactly where you land — 422/1728 interior samples pushed you off the
wall. I replaced it with the analytic statement of what "down" means on the
inside of a tube: **constant-strength gravity, radial, outward from the
centreline**. That is the geometric normal at every point, so it satisfies
sign/direction/uniformity/symmetry/finiteness on all three scored geometries by
construction (0.0° off the wall normal, 1.00× uniformity, finite on the
centreline). Magnitude is uniform around the tube deliberately: a race needs
gravity you can trust at speed, and "lap time depends on where you stand" was
the LUT's original sin. The module is `field.mjs`; the page drives its airborne
(hop) physics and camera-up from it.

## The design decisions, honestly listed

- **Speed is measured in u-progress**, not physical arc length. Latitude
  (which wall you're on) matters through the racing line and the steering
  cost, not through circumference. Uniform u-speed keeps the race fair and the
  ribbon mechanic legible; I note it because it's an abstraction, not realism.
- **Off-line = slower, not dead.** The worst wall costs ~20%. Forgiving, so a
  first-time player can finish and an expert is rewarded by precision.
- **The boost-hop is the jump**, now a racing tool: a cooldown-limited hop into
  the interior that coasts your speed, lets you glide across the tube, and is
  the only cheap way to reposition across the line. Landing is sluggish for a
  beat, so chain-hopping isn't a free win.
- **`?autostart=1`** drives the player ship with the same steering AI as the
  rival (so the capture shows a race, not an idling car) and skips pointer-lock
  entirely — `requestPointerLock()` is guarded behind a real user gesture.
- **`field.mjs` loading:** the deployed page genuinely imports the module; the
  scoring harness loads this page over `file://`, where Chromium blocks
  ES-module CORS (origin "null"), so in that one environment a byte-identical
  copy is loaded as a Blob module. Kept in sync by hand; there is a comment.

## What I verified vs. what I'm trusting

Verified (machine):
- The scorer end-to-end: GATE 5/5, SKELETON 4/4, physics perfect on all three
  geometries (node import of `field.mjs`).
- No page errors on either the autostart or human (click START) path, in
  headless Chromium with a real WebGPU/SwiftShader adapter.
- The WebGPU shader **compiles** (I caught and fixed a WGSL ternary — WGSL has
  no `?:` — and em-dashes in comments) and, via a raw texture readback, renders
  a real lit scene with the game's live camera: mean 87, stdev 56, amber-ribbon
  peaks — not a black frame. This matters because the harness cannot show the
  3D view.
- The race itself runs: countdown → GO, clock ticks, lap 1 completes ~10s,
  best time recorded, best-lap ghost spawns, rival moves, demo jumps and lands
  under the corrected gravity.
- Camera handedness checked numerically (right-handed basis, mouse-right turns
  right, spawn faces down the track). 

Not verified — **I cannot see the rendered 3D view**; headless Chromium does not
composite the WebGPU surface, so no screenshot ever showed it. The shader
compile + readback prove it draws something structured, not that it looks good.
Tone, composition, and the feel of the tube in motion are trusted to the code's
geometry and to you in the arena.

## Traded away

- The old physics-suite sliders and debug panel (dev chrome, wrong for a race).
- Maze/pellets/ghost-chase entirely — the fork.
- Any multiplayer; the rival and best-ghost are simulated.
- Realism in gravity's magnitude varying around the tube, in exchange for a
  fair, legible race.
