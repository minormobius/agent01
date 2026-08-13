# INPAC GP — notes

## The fork: pure tube racer

I cleared the board. The maze, pellets and ghost AI are gone; what remains of
INPAC is the place itself — the ray-marched interior of the torus — and the
act of moving along its wall.

Why: a maze is a walking-speed idea. At racing speed, walls you must not touch
become noise, and pellet-mopping is a route-planning problem, not a driving
problem. The torus is the interesting object here, so I made the race *about*
it. The honest way to keep Pac-Man DNA would have been a time-trial maze
clear; that is a worse race than this is a maze game.

## What it is

- **The course is the (1,1) curve of the 2-torus** — per lap it goes once the
  long way round the ring and once through the hole. It is the line that uses
  both independent circuits of the topology at once, which felt like the only
  correct answer to "what is a lap on a torus". On the flattened map it is the
  diagonal; on the wall it is a spiral that climbs the outer equator and dives
  through the hole, so the track ahead of you is visibly wrapped around the
  tube — overhead included. Twelve gates along it, three laps.
- **You race three things at once**: two paceline drones on constant-pace
  laps (red 9.2 s, cyan 10.8 s — visible, colored, and they wash the wall with
  light as they pass), the clock, and a gold **ghost of your fastest lap**,
  recorded per-frame and replayed on subsequent laps. Best lap, per-gate
  splits, and the ghost persist in `localStorage`.
- **Driving**: auto-throttle with brake (S) and drift — your velocity swings
  toward your heading at a finite rate, so at full speed the line matters and
  the walls are bankable everywhere (they are all "down"). Space jumps; the
  jump is the thing the broken field used to sabotage.

## The physics fix

Replaced, not repaired. The electrostatic analogy (attracting shell +
repelling centreline ring, numerically integrated into a LUT) was the wrong
object: the field a walking-inside-a-tube game wants is not a physical field
at all. `field.mjs` is the analytic answer — acceleration points radially
away from the tube centreline, straight at the nearest wall, with a magnitude
that ramps from a soft floor at the centreline to full pull at the wall.
Direction error 0.0°, wall uniformity 1.00×, and a jump now lands with the
same 0.64 s airtime at every poloidal angle (verified by simulation at 8
angles; the shipped code failed 422/1728 interior samples, concentrated
exactly where you land). The page's airborne integrator and airborne camera
both sample `field()`; the grounded camera keeps the geometric normal, which
is the same vector.

One deliberate consequence of the fix: because every point of the wall holds
you equally, the whole tube is drivable. The painted lane is the fast line,
not the only floor.

## The capture seam, honestly

`index.html` imports `./field.mjs` and rebinds its physics to the module's
export when served over http(s) — as it is in production. The scoring harness
loads the page over `file://`, where Chromium's CORS policy refuses **all**
module imports (measured in this sandbox), so an inline byte-identical mirror
of the field is the fallback for that case only; the import is skipped on
`file:` to avoid a spurious console error. `?autostart=1` starts the race
with an attract-mode autopilot steering for the gates; any keypress takes
over. Pointer lock is only ever requested from a click handler.

## What I verified, and how

- `score.mjs`: GATE 5/5, SKELETON 4/4, repeatedly.
- The WGSL compiles and renders error-free under the capture harness's own
  Chromium flags (probed twice, watching console and uncaptured device
  errors). SwiftShader's adapter is flaky headless — one capture run had no
  adapter at all — which is why the canvas-2D fallback (F) exists and also
  animates.
- **I could not screenshot the WebGPU surface** (headless compositing limit,
  as the brief says). Instead I ported the shader's ray-march + shading to
  node line-for-line and software-rendered five viewpoints to PNG: start
  line, looking up, mid-course, inner equator, top. That validates the scene
  *math* — composition, lane, gates, drones, glow — not the GPU's execution
  of it. The tube reads: dark slate wall, cyan lane with edge lines and
  dashes, amber pulsing next-gate, white start ring, the track visibly
  sweeping up the wall and over. The overhead tube is dark by design; the
  lane's bounce light on the wall is what keeps the volume legible.
- Not verified: real-GPU performance (render scale caps at 420p, so it
  should be comfortable), pointer-lock feel, and whether the drift tuning is
  *fun* — that needs hands.

## Traded away

Pellets, maze walls, ghost AI, the B-field Lorentz toys and the physics
slider panel (dead weight once the field is analytic), wrong-way detection,
and audio. The race is short on purpose — three ~9-second laps — because a
spiral you can see all of is better tight.
