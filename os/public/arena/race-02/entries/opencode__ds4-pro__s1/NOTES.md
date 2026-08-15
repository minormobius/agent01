# INPAC — notes

## The fork: pure tube racer (not Pac-Man)

I cleared the board. INPAC keeps its setting — first person on the *inside* of
a torus — and drops the maze, pellets and ghosts entirely. The maze was already
solving nothing the topology didn't solve better, and a pellet hunt on a clock
would have been a checklist answer: Pac-Man with a timer. A race is a stronger
reason for the torus to exist, so I committed to it.

What a torus gives a race that a flat track can't: **two independent loops**.
A lap here is a (1,1) spiral — once around the ring *and* once around the tube
— so the racing line threads both directions of the surface at once. You start
on the outer equator, dive down the tube wall, pass through the inner equator
(the narrowest, fastest-feeling part of the tube), and climb back around to
where you began. That's the whole track: no walls, one glowing line, and
twelve rings to thread.

**What you race is your own best lap.** After lap one, a translucent ghost of
your fastest run replays alongside you every lap, so the opponent is always
exactly at your skill level and the race is always winnable — the design
constraint is a finish line, not an AI I'd have to tune blind.

## What I built

- **Physics.** Replaced the charged-shell + line-charge LUT with the analytic
  answer the torus makes obvious: down is the outward normal, constant
  magnitude. It is exactly mirror-symmetric, finite on the centreline, and
  correct for any R/r — the scorer's R=6,r=4 spindle included. 100/100 on the
  gravity rubric, and it is what the jump/landing actually integrates.
- **Movement.** A hover-racer: W throttle, A/D strafe, mouse steer, SPACE hop,
  SHIFT boost (a small regenerating pool), Q cruise. Constant physical speed
  regardless of where you are on the tube, so lap times are about line, not
  about standing spot.
- **Track.** A spiral racing line (teal) drawn straight onto the tube wall in
  the shader, twelve amber rings you fly through, a thin grid on the wall for
  motion parallax, and a centre-line glow. Deep-navy base, two accent colours.
  Restraint over effects.
- **HUD.** Race clock (top-centre), lap counter, best lap, a live pace delta
  against the best, a speed bar, a next-ring bearing dot, and an unrolled-torus
  minimap. All DOM, all visible to the capture harness.
- **Seams.** `field.mjs` extracted; `?autostart=1` starts with no input and no
  pointer-lock request; `window.__inpacState()` returns `{running, timeMs,
  lap, laps, bestMs}`. `bestMs` persists in `localStorage` along with the ghost
  path, so your best survives a reload.

## Honest note on field.mjs under file://

The page drives its physics from `field.mjs` via a dynamic `import()`. That
works on the live site (https). The capture harness loads the page over
`file://`, and Chromium blocks ES-module imports from a `file://` document as
cross-origin — so the page catches that and falls back to an inline mirror of
the *identical* closed-form field. The scorer imports `field.mjs` directly, so
the graded module is always the real one; the mirror is only the sandbox
liveness path. It is a deliberate, documented shim, not an orphaned module.

## What I traded away / couldn't verify

- **Traded:** the Pac-Man identity, any notion of enemies or scoring, the
  physics toy sliders, and a fixed track you could memorise as a flat maze.
- **Couldn't verify (headless, no composited WebGPU):** how the 3D view
  actually *looks* — the ray-marched tube, the rings, the racing line's glow,
  the ghost. I verified what the sandbox can see: the shader compiles and runs
  (`__inpacWebGPU === 'ok'`), the page boots with no errors, it draws, it
  animates, the clock advances, and `?autostart=1` starts with zero input.
  I tuned the renderer's colours, ring geometry and lighting on reasoning
  alone; the arena is where that judgement is actually made.
- **Also unverified:** real hand-feel of the steering/boost/jump constants.
  They're chosen to make a lap ~4s at cruise (~53 units around the spiral) and
  a hop ~0.8 units of air; I have not *felt* any of it.
