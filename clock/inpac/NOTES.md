# INPAC — Helix Circuit

## The fork: pure tube racer

I cleared the board. No maze, no pellets, no ghosts, no lives.

Pac-Man's loop is *coverage* — visit every tile, manage pursuers. A race is
*flow* — one line, taken as fast as you dare. Keeping the maze would have made
the race a pellet hunt with a stopwatch, which is the mush the brief warns
against. The one thing worth keeping from INPAC was never the pellets anyway;
it was the place. So I kept the place and built the purest thing it can host.

## What the torus is for

A torus has two independent ways around, and a loop that winds both — u once,
v five times — closes after one lap. That is the course: **a (1,5) helix drawn
on the inside of the tube**, 12 gates, 5 laps. It is a circuit no flat track
can draw, and it uses the one affordance this geometry has that nothing else
does: from anywhere on the track you can see the *whole* track, wrapped around
and overhead you. The cyan ribbon spirals away in both directions; the next
gate is a breathing amber pad with a beacon light hovering over it; the
pacemaker — a cyan light running the line at par — is visibly ahead or behind
you through the tube. You don't need a minimap to know where you are. (There
is one anyway, a (u,v) chart, because the capture harness can't see the 3D
view and the chart carries the proof of life.)

Driving is a momentum hover-car on the wall: throttle, brake, strafe, and
lateral grip, so the rear slides a little before it bites. Space hops;
Shift+Space launches you *across* the tube — with the fixed field you fall
onto the far wall, every time, which is the shortcut and the spectacle.

You race the clock, the pacemaker light (HUD delta, green/red), and your
session best lap.

## The gravity fix

Replaced, not repaired. The electrostatic analogy (charged shell + charged
ring, integrated into a 32×32 LUT) was measuring the wrong thing and getting
it wrong near the wall — 422 of 1728 samples pushed you off it. The truth is
one sentence: inside a tube, down is *away from the tube centreline*. So
`field.mjs` is exactly that — the unit outward vector of the cross-section,
constant magnitude, zero only exactly on the centreline. O(1), analytic, no
LUT, no knobs. The wall becomes an equipotential: apparent gravity is
identical at every point of the wall (uniformity 1.00×), aimed within 0.0° of
the wall normal, on all three test geometries. The airborne camera and the
jump integrator both read it.

## The file:// wrinkle

`index.html` imports `field.mjs` and drives its physics from it — when served
over http(s), which is how it ships and how the arena serves it. The capture
harness loads the page over `file://`, where Chromium blocks module fetches
(CORS, origin 'null') and the game would never boot. So the page carries an
inline copy of the same tiny function as a fallback, marked SYNC; the module
overrides `window.GRAV` when the import succeeds. Same code, same physics,
whichever path loads.

## What I verified (and how)

- `field.mjs`: 95/100 on the gravity rubric standalone (the missing 5 is the
  page-integrity check, which the race scorer covers); every gating check
  passes on all three geometries.
- Gate + skeleton: 5/5 and 4/4 via `bakeoff/briefs/inpac-race/score.mjs`.
- A 60s headless soak: 5 laps complete (~39s), finish screen, attract mode
  restarts itself, zero page errors. Human path clicked through with real
  input (RACE button, W, jump, R): no errors.
- Jump physics: a Node simulation of the flight integrator — all 96 cases
  (2 jump strengths × 3 momenta × 16 launch points around the tube) land back
  on the wall. The launch crosses the tube and lands on the far side in ~0.7s.
- **The 3D view I could not see in the harness** (headless Chromium
  screenshots a presented WebGPU frame as a white void — measured, and the
  reason the HUD sits on dark chips so the filmstrip stays legible). So I
  ported the raytracer, track paint and camera to a CPU renderer in a scratch
  page and screenshotted *that*: dark tube, faint survey grid, navy ribbon
  with a dashed cyan spine, teal edge markers, amber next-gate pads, the
  pacemaker's light pool. Three design bugs were found and fixed this way
  (gate pads flooding the palette, edge-glow flooding the staircase ribbon,
  near-field blowout). It is an approximation of the shader, not the shader —
  on a real GPU it should look the same, but I have not seen that.

## What I traded away

- Pellets, ghosts, score, lives — the whole Pac-Man economy. The maze
  generator is gone with them; the "maze" is now painted course markup.
- Boost pads, opponents, a recorded ghost of your best lap — all considered,
  all cut. Restraint reads as confidence, and each one spends complexity the
  line itself already provides.
- The physics playground panel (gravity sliders, B-fields). A race needs a
  floor it can trust, not a parameter space.
- The hop is deliberately floaty (apex ~2.5u, ~1.8s) because gravity is
  uniform; the launch is the real jump.

## Honest limits

- Driving *feel* (grip, speed, gate radius) is tuned by math and simulation,
  not by playing. It may be too fast or too slidey in hand; the constants are
  all named at the top of the file.
- The autopilot that powers `?autostart=1` laps in ~7.2s against the 9.0s par
  — it drives a perfect line at full throttle. Humans are meant to be slower
  at first.
- Best lap persists across restarts within the session (deliberate — it is
  your record to beat), but nothing is stored across page loads.
