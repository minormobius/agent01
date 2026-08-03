# INPAC — Torus Circuit

## The fork: pure tube racer

I cleared the board. No maze, no pellets, no ghosts-as-enemies. This is a
helical ribbon race on the inside of the torus.

The reason is the torus itself. A maze wraps around a torus but it does not
*use* the torus — the topology is wallpaper. A race, though, has two
independent loops to play with, and that is the most interesting thing this
geometry has to offer. My track is a single ribbon wound once around the tube
cross-section per ring lap: it corkscrews over the outer wall, down the side,
under the inner wall, and back. You cannot build that on a flat track, and you
cannot see it coming from anywhere else. That is why the game is a racer and
not a timed maze-clear.

## What I designed

- **The track** — a helix band (`v = v0 + (H/W)·u` in the unwrapped tube
  grid). One toroidal lap is one lap. The whole course wraps around you, so
  the far side of the tube hangs overhead — the one real affordance the
  interior gives you, and it is the course itself.
- **The race** — 3 laps against the clock. Twelve gates enforce the course in
  order (a rally-style circuit, so the spiral cannot be shortcut). Best lap is
  kept and replayed as a **cyan ghost** you race from lap two on. Boost pads
  give the racing line an edge.
- **The feel** — throttle/brake/steer (W/S + A/D or mouse), a jump that leaps
  you across the tube interior, off-track mud that punishes leaving the
  ribbon. The fixed gravity field is what makes banking and landing trustable.
- **Autopilot** — the game starts in a "tour" mode that rides the track and
  completes laps by itself; any input hands you the wheel (Q toggles back).
  This is what makes `?autostart=1` meaningful and is also a pleasant way to
  watch the course.
- **The minimap** is the unwrapped tube — a flat map of a curved world, with
  the helix as a diagonal ribbon. It is the most truthful map a torus racer
  can have.

## The physics fix

The shipped electrostatic LUT reversed sign exactly where the player stands
(422/1728 interior samples pushed off the wall). I replaced it with the
analytic geometric normal in `field.mjs`: at cylindrical `(R, Z)` the outward
direction is `(R − R0, Z)` normalised. Unit magnitude keeps apparent gravity
uniform around the tube, it is finite on the centreline, and it is
mirror-symmetric by construction. The page drives its jump integration and
airborne camera from `field.mjs` (with an inline copy only for `file://`
browsing, where ES modules are CORS-blocked — the deployed site and the arena
load the real module).

## What I traded away

- The maze and the ghost hunt. No pellet chain, no power pellets, no enemies.
- The "whole track visible overhead" is genuine but the sightlines are the
  tube's, not the maze's — you read the course by its markers, not by walls.
- The capture cannot see the 3D (headless Chromium does not composite the
  WebGPU surface), so the filmstrip carries the minimap, HUD and clock.

## What I could not verify

I am in a headless sandbox. **I could not see the 3D view**, and the capture
harness cannot either — so I verified: the page boots clean, the physics field
scores correct at every interior sample across all three geometries, the race
clock advances, laps complete under autostart (best lap ~9.6s on tour pace),
the minimap/HUD render with real tonal variation, and the camera + jump
integration produce finite values. What I am **trusting**: the WGSL shader
compiles and is a modest modification of the shipped interior ray-marcher, so
the 3D should render on a real GPU — but I have not seen a single frame of it.
The physics bug fix, the race logic, the gates, the ghost and the minimap are
the parts I could actually test.
