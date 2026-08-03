# INPAC — Time Trial on the Inside of a Torus

## The fork: I cleared the board

I built a pure tube racer and threw the maze away. Reason: a race needs a
readable line, and the procedural maze is the opposite of that — but mostly
because the one thing this game has that no flat racer does is the **tube
itself**, and the maze was in its way. The Pac-Man DNA survives in three
places that cost nothing: the name, the first-person wall-walk, and the
thing you race — a ghost. It's a racing ghost (your own best lap), which is
also a Pac-Man ghost. No pellets, no maze, no lives.

## The track is a torus knot

A lap is a **(1,1) line** on the tube wall: once around the ring toroidally,
wound once around the tube poloidally. In the (u,v) grid that's a single
straight diagonal, and it's the shortest path through the gates — the painted
cyan line *is* the racing line, not decoration. It takes you across the
outer wall, over the top, across the inner wall (looking down into the
doughnut hole), and under the bottom. Eight standing arch gates every 45°,
amber for the next one, cyan beyond; miss one and you turn back for it.
Because you're inside the tube, the entire course — ribbon, arches, your
ghost — is always visible somewhere overhead. That was the point of clearing
the board: the track and everything on it wraps the whole view.

You race the clock and your best lap's ghost (persisted in localStorage),
with per-gate splits. Boost is the one mechanic: holding Shift spends a
meter that refills faster when you're in the groove near the line — the
ribbon literally charges you.

## The gravity fix

The electrostatic analogy *was* the bug: it approximated an answer that has
a closed form. `field.mjs` replaces the LUT with the analytic field —
direction exactly the outward wall normal, magnitude G at the wall ramping
to 0.55·G at the centreline (so a dead-centre jump crossing doesn't
slingshot; exactly on the centreline it's zero, never NaN). The grounded
camera already used the geometric normal; the airborne path — the only place
the LUT actually integrated — now integrates `field()` directly, and the
airborne camera stands opposite whatever `field()` returns. Jump arcs now
land predictably on any part of the wall.

## What I traded away

The maze, pellets, and enemy ghosts, obviously. Also the physics-toy sliders
(charge strengths, B-fields, R/r) — they were dev chrome whose only purpose
was tuning the broken scheme the fix deletes. Jump survived, but as flavour,
not a mechanic: gates only count when you run through them grounded.

The attract mode is deliberate: the game races itself behind the menu and
under `?autostart=1` (autopilot follows the line, boosts when aligned).
First input of any kind hands over control with a fresh countdown. Demo
laps feed the in-memory ghost so a first-time player immediately has
something to chase; only human laps persist to localStorage.

## What I verified, and what I'm trusting

Verified here (headless Chromium + SwiftShader):

- `node bakeoff/briefs/inpac-race/score.mjs clock/inpac` — gate 5/5, skeleton 4/4.
- Race logic driven through `window.__inpacSim` in the real page: full 3-lap
  races (~10.3s laps), lap-boundary timing identical across laps, missed-gate
  swerve → turn-back → re-thread recovery, jump landing, human-input
  takeover, demo auto-restart after finish. No page errors anywhere.
- The 3D renderer by reading back real frames (fresh-device snapshot hook,
  `?debug=1`): the first attempt had a WGSL reserved-word error (`target`)
  and rendered black — caught numerically, fixed, re-verified. Ribbon,
  arches, ghost, start band, overhead structure all present in-frame.
- `field.mjs` is genuinely imported over http; over `file://` Chromium blocks
  module fetches, so the page falls back to a byte-identical inline copy
  (marked as such in the source).

Not verified: how it looks on a real GPU. This sandbox kills any sustained
WebGPU session inside ~2s (a trivial triangle loop dies too — it's the
environment, not the shader), and headless captures don't composite WebGPU
anyway. So motion smoothness, final frame rate, and real-hardware appearance
are untested. For that reason the renderer ships with serialized GPU work,
adaptive resolution (settles where the hardware can hold ~220ms frames,
climbs to full quality on a real GPU), and — if the device dies anyway — a
2D unwrapped-track fallback rather than a dead canvas. The arena's real
browsers will run the 3D path; the fallback is for everything else.

Debug hooks shipped, all inert without `?debug=1` / `?res=N`: device
snapshot readback, pitch/teleport setters. `__inpacSim(dt, n)` is always
live — it's how the logic was tested, and it's harmless.

Controls: mouse (or ←/→) steer · Shift boost · Space jump · S brake ·
R race again after the finish.
