# INPAC — Torus Time Trial

## The fork: a pure tube racer

I cleared the board. No maze, no pellets, no ghosts.

The Pac-Man DNA was inherited baggage that fights a race: a maze is walls, and
walls are the enemy of speed. Keeping "maze, pellets, ghosts, now on a clock"
would have produced a haunted house with a stopwatch, not a race. So I kept the
one thing INPAC actually had that nothing else in the repo has — **first-person
walking on the inside of a torus, with the whole track wrapped overhead** — and
threw the arcade layer away. Committed, not halved.

## What it is

A **three-lap time trial** on a `(1,1)` torus-knot circuit: a single closed lane
that winds the ring **and** the tube in one lap. That is the topology answer to
"what does a torus make possible": a lap that a flat track cannot express. The
lane progress metric is `(u+v)/2`, so completing a lap provably requires a full
turn around the ring *and* a full turn around the tube — run only the long way
and you're stuck at half a lap. You race two things: the clock, and the ghost of
your own best lap (replayed in real time, persisted in `localStorage`).

The track is a neon ribbon on a near-black tube. Look up and the rest of the lap
curves away overhead — that affordance is the point, so the lane, the gates and
the finish are all visible in-world, not just on a minimap.

## The physics bug

`field.mjs` replaces the electrostatic LUT with the exact geometric answer:
**down = the unit vector away from the tube centreline, at a single constant
magnitude**, finite everywhere (zero on the centreline itself), mirror-symmetric
by construction. No analogy, no table, no integration.

Why constant magnitude matters for a *race* specifically: it means you weigh the
same at the outer wall, the inner wall, the top and the bottom, so lap times are
not secretly a function of where on the tube you happen to be, and a jump comes
down in the same predictable arc anywhere. The scorer's `uniformity` check
passes at exactly 1.00×. The page drives its airborne physics from
`field.mjs` (a dynamic `import`, with a byte-identical inline fallback for the
capture's `file://` origin, which blocks module fetches — commented in the code).

## What I traded away

- **Enemies** — nothing chases you. Racing your own ghost is the whole threat.
- **The maze, score, power pellets** — the board is clean by design.
- **The physics slider panel** — the geometry is fixed and tuned, not a sandbox.
- **Hard collisions** — there are no walls to hit. The lane steers you with a
  speed penalty off-track instead; corner-cutting is the skill, not a glitch.

Jump survives as a radial hop; it's flavor, and it's the place the fixed field
actually does visible work.

## What I verified vs. what I'm trusting

Verified headlessly (the scorer + a driven browser session):
- `field.mjs` passes every physics check across all three geometries (sign,
  direction 0.0°, uniformity 1.00×, finite, symmetry) — `inpac-gravity` score 95/100
  (the missing 5 is the "uses field.mjs in index.html" integrity point, which the
  race scorer reports separately and passes).
- The page boots with **no uncaught errors**; the WGSL shader **compiles** and a
  real WebGPU adapter/device initialises (the 3D canvas goes active).
- `?autostart=1` begins a countdown and then races with **no input**; `boots`,
  `draws`, `animated`, `autostart`, `physics` all pass; `clock`, `laps`, `best`,
  `intact` all pass.
- Driving the page with keyboard input moves the player (minimap dot moves), and
  a lane-following simulation completes 3 laps in ~11.7s each — the race is
  winnable and the gate/finish math is sound.

**Not verified, and not claimed:** how it actually *looks*. Headless Chromium
cannot composite the WebGPU surface, so I have not seen the 3D view. The palette
(dark indigo tube, one cyan lane, amber gates, warm key light, centreline glow,
distance fog), the render scale, and the ray-tracer's framerate on real hardware
are trusted, not seen. The taste call is whether that restraint reads as
confidence or as sparse.
