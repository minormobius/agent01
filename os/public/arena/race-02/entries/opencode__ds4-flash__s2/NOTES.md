# INPAC — the inside line

## The fork: a pure tube racer. The maze is gone.

I chose to clear the board. INPAC's identity is the *place* — the inner wall of a
torus, gravity always pulling you onto the tube, the far side hanging overhead —
and the Pac-Man maze actively flattens it: on a maze, the wall you walk is a 2D
board in a costume, the torus is scenery, and the game is "eat pellets, dodge
ghosts." A race is the opposite: it needs flow, banking, and a reason to use
every direction the tube offers. So there is no maze, no pellets, no ghosts-as-
enemies. There is a track and a clock.

## The physics fix

The shipped electrostatic LUT (attracting shell + repelling centreline ring)
reversed sign exactly where you land — 422/1728 interior samples pushed you off
the wall. That's fatal for banking at speed. I replaced it with the analytic
field in `field.mjs`: constant magnitude, direction exactly away from the tube
centreline at every point. Newton's shell theorem says a hollow shell has zero
interior field, so there is no "real" gravity to recover — the design intent is
the definition: uniform apparent gravity, always onto the wall. Constant
magnitude is also what makes a race fair (you weigh the same on every bank of
the tube). The airborne hop integrates `field()` directly — the only place the
field is genuinely integrated, per the brief.

## What the race is

The track is a **(1,1) helix on the tube**: one lap winds once around the ring
*toroidal* direction *and* once around the doughnut (*poloidal* direction)
simultaneously. That is the answer to "a lap could go the long way round, or
spiral through both" — it spirals through both, which is the only way a course
can thread the whole tube, and it means the track is a closed ribbon you can see
winding ahead and overhead from anywhere inside.

- **3-lap time trial.** A gold pace ghost sets the par (8.2s). From the moment
  you bank a lap, your own best lap replays as a ghost — you race yourself.
- **Six gates** on the helix. Miss a gate's window and you're checkpoint-reset
  just before it with speed bled off — the line is enforced, play never
  dead-ends.
- **Nitro** (Shift/W) — refilled by clean gates, so good lines pay for speed.
- **Hop** (Space) — a gravity hop through the void, integrated with `field.mjs`.
- **Controls**: auto-throttle, A/D or mouse steer, S brake. When you're idle the
  car autopilots the line (so `?autostart=1` captures a real race, not a frozen
  page).
- Inside the tube, the whole circuit is visible — I leaned on that: the gates
  are glowing hoops you see coming from way off, and the minimap is the torus
  unwrapped, the helix drawn as a diagonal circuit.

## The look

A deliberate choice: **no WebGPU.** The view is a hand-rolled software raycaster
(2D canvas, 240×135 upscaled, pixelated) — neon-on-dark, low-res on purpose.
Why: it runs everywhere, and because the capture harness cannot composite a
WebGPU surface, a software renderer is the only view a filmstrip can actually
show. The palette is cohesive (deep-blue tube, amber track, cyan energy), with
glowing gate hoops, checkered finish, rumble strips, a drifting-mote field in
the void ahead for depth and speed, and a clean retro HUD.

## What I traded away

The maze and ghost-*enemies* (the whole Pac-Man layer), WebGPU raytracing,
audio, anything networked. I kept the IP of the place — first-person on the
inside of a torus with the fixed gravity — and spent the budget on a course
that only a torus can host.

## Honesty

I could not see the rendered view. This model has no vision, and headless
Chromium won't composite a GPU surface anyway, so I did not and cannot claim
"I verified it looks good." What I verified, by pixel statistics rather than
eyes:

- the scorer: **GATE 5/5, SKELETON 4/4** (`bakeoff/.../score.mjs`);
- the frame is bright and varied, not flat (per-region RGB sampling: dark blue
  walls, bright corridor core, amber gates/finish, red rumbles — the intended
  composition is present in the numbers);
- it moves: ~80% of pixels change between frames; race clock advances;
- a full 3-lap race completes under autopilot with no page errors, lap times in
  the 8.1–9.5s band, best lap recorded, results screen populated;
- all input paths (steer, boost, brake, hop, reset, START button) run clean;
- `field.mjs` scores 100/100 on the gravity rubric.

One structural note: Chromium blocks ES-module imports under `file://`, which is
exactly how the harness loads the page, so `index.html` imports `field.mjs`
dynamically and falls back to an identical inline copy when the browser forbids
the fetch. Served over http(s) the page uses the real module; `field.mjs`
remains authoritative for the scorer. The shading, composition, and game feel
were reasoned through geometry, not eyeballed — if something looks off when a
human drives it, that's the part I could not see.
