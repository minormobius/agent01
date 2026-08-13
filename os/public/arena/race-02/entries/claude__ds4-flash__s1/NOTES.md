# INPAC — Torus Grand Prix

**Fork chosen: a pure tube racer.** The maze, pellet-gobbling and enemy ghosts
are gone. What remains is the torus interior, and a racing line that uses all
of it — a (1,1) helix, one full turn of the tube per lap — painted as a light
ribbon on the wall and enforced by a ring of twelve gates. Cut across the open
interior with a jump and you trade gate credits for distance; the correct
interior gravity (`field.mjs`) is what makes all of it driveable. This is the
commitment: no Pac-Man DNA left in it. It is a time trial against a ghost.

## The three-seam contract

- **`field.mjs`** — the interior gravity source of truth, extracted and
  dependency-free. `index.html` imports it (over http(s)); when a browser
  blocks same-directory module imports under `file://`, the page falls back to
  a byte-identical inline copy. The scorer imports the real module, which is
  the thing being measured.
- **`?autostart=1`** — begins the race immediately, autopilot on, no clicks or
  keys. `requestPointerLock()` is only ever called from the Start button, which
  is a user gesture, so it cannot throw.
- **`window.__inpacState()`** — returns `{ running, timeMs, lap, laps, bestMs }`
  every frame.

## How the race works

- **The line.** `v(u) = LINE_PHASE + u` — one poloidal turn per toroidal turn,
  so over a lap the ribbon spirals around the tube once, visiting every
  latitude. Gates sit on it at twelve even u-steps; boost pads sit a quarter
  step ahead of each gate.
- **Gate economy.** Hitting a gate's tolerance band (|Δv| ≤ 2.5 grid tiles)
  takes **−0.25 s** off the lap and refills boost; missing adds **+1.2 s**.
  This is what makes the spiral line optimal. Without it the inner equator is
  trivially fastest (the tube is narrower there, so a fixed physical u-speed
  crosses grid tiles faster) and the topology is wasted.
- **Jumps.** `SPACE` launches along the inward wall normal with the field's
  acceleration integrated in 8 substeps; `SHIFT+SPACE` is a super leap. You are
  a projectile through the open interior, and the v-projection updates live so
  gate judgement works mid-air.
- **The ghost.** Before you have a best lap it is a 12 s pacer; after your
  first completed lap it is your own best-lap replay, sampled at 40 ms. The HUD
  delta is that ghost's lead in seconds. It is also the menu's camera.
- **Physics conversion.** `dX = duPhys / (R + r·cos v) · WORLD_W / 2π` and
  `dY = dvPhys / r · WORLD_H / 2π` — physical u-speed along the tube maps to
  grid distance through the actual local ring radius, so the racer genuinely
  runs faster on the inner equator and slower on the outer equator.

## The physics fix (the brief's defect)

The shipped code built "down" from an electrostatic LUT and it reversed sign
exactly where you land: 422 of 1728 interior samples pushed you **off** the
wall. `field.mjs` is analytic: at cylindrical `(R, Z)`, the nearest wall point
lies along the direction from the centreline point `(R0, 0)` to `(R, Z)`, and
the field points exactly that way — along the wall normal at every interior
sample, for every torus. Magnitude `K·d/(d + ROLLOFF)` is zero on the
centreline and uniform `K` at the wall, so the racer handles the same all the
way around. Verified: sign, direction, uniformity, finiteness and symmetry all
pass the inpac-gravity rubric for `{R:8,r:3}`, `{R:12,r:2}` and `{R:6,r:4}`.

## Renders

- **Real browsers (the arena):** WebGPU compute-shader raymarch of the torus
  interior SDF — racing-line ribbon, pulsing next-gate chevron, boost pads,
  the ghost and its trail — blitted to the canvas, with a 2D canvas map behind
  it and a minimap.
- **Headless (the capture harness):** a full-screen 2D render of the unrolled
  track map (racing line, pads, gate chevrons, ghost, player), because headless
  Chromium does not composite a WebGPU surface into a screenshot at all. The
  3D surface would capture as blank *and* it intermittently stalls the headless
  compositor so screenshots hang for tens of seconds. The arena, where a human
  with a real GPU looks at it, gets the 3D view; the filmstrip, which can only
  see the 2D DOM/canvas layer, gets the honest 2D game.

## Bugs found by running it

The first build froze the page around the 12 s mark — a while-loop that wrapped
its gate/pad cursor with `% GATES` jumped backwards in raw-space once the last
pad passed before the lap line, so it re-evaluated the whole ring forever.
Fixed by making the cursors monotonic per lap (bounded by `GATES`/`PADS`), with
lap boundaries resetting them. Also: a WebGPU device-loss rejection surfaced as
an uncaught `pageerror`; it is now swallowed with a clean 2D fallback. Both
were found by booting in headless Chromium and dumping the paused JS stack.

## What I could not verify

- **I cannot see the 3D view.** Headless Chromium does not composite WebGPU,
  so nothing in this loop has seen the raymarched scene. The shader is
  straightforward SDF raymarching and compiles, but "it renders" is not
  verified by me — it needs a real GPU and a human.
- **Balance is unmeasured.** Gate tolerance, boost amounts, pacer pace and the
  jump arc were chosen by hand, not tuned against play. The autopilot laps the
  par ghost at about 14–15 s (before gate penalties) by construction; what that
  feels like for a human is unknown.
- **Best-lap replay after a restart** re-fires the pacer, so the ghost is
  always a valid target on the next attempt; that is a deliberate trade for
  not keeping memory across runs.
