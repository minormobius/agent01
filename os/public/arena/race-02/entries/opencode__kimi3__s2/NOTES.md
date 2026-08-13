# INPAC — Tube Circuit

## The fork: pure tube racer

I cleared the board. Maze, pellets, lives, and the ghost-house AI are gone.

Reason: the maze is procedurally generated noise. There is no authored line
through it, so a clock on it measures luck and wandering, not driving. The
asset worth building a race around is the tube itself. The torus offers two
independent ways around, and a maze only ever used one of them.

The course is a **spiral ribbon painted on the tube wall**: it winds once
around the cross-section for every lap around the ring (`v = 270° + u`), so a
lap uses both directions around the torus in one motion — floor, outer wall,
overhead, inner wall, floor. From the driver's seat the track visibly corkscrews
around you, and because you're inside the tube the entire circuit is always in
view, wrapped overhead. That is the picture this geometry exists to make, so
the ribbon is the brightest thing in the scene.

## The physics fix

Deleted the electrostatics. `field.mjs` is the analytic answer the brief
states: in the cylindrical (R, Z) half-plane the tube centreline is one point,
and the field is purely radial away from it — exact at every depth, every
geometry, ~10 flops. Direction error 0.0°, wall uniformity 1.00×, mirror
symmetry exact; the gate's three geometries all pass.

The magnitude is a gameplay choice the checks leave open: full strength from
the wall inward to 0.3·r, then a linear ramp to exactly zero on the centreline.
The softened core makes long jumps through the hollow middle float instead of
snapping, and keeps the field continuous where the radial direction is
undefined. A SHIFT-jump (9 u/s) clears the 6-unit tube and lands you on the
far wall — cutting through the core is the one real shortcut, and now that
gravity can be trusted, it works from any wall to any wall.

## The race

- 3 laps, 8 gates per lap on the ribbon. **Clean gate** (within ±45° of v):
  +18% boost for 1.4s. **Missed gate**: +1.5s penalty, red flash. Crossing the
  plane always clears the gate — you never hunt backward, slalom-style.
- Clock is wall-clock (not accumulated dt), so lag can't lie about your time.
- Finish a race and your run is recorded; your **best race replays as a ghost
  pacer** (white-violet orb + map dot + live ± delta). Best race and best lap
  persist in localStorage.
- Momentum speed model (W gas / S brake / coast drag), subtle bank-into-turns
  camera roll, speed-stretched FOV, WRONG WAY indicator. Jump = SPACE.
- `?autostart=1` starts a self-playing demo race (short countdown, autopilot
  follows the ribbon); any key or click takes the wheel. Pointer lock is only
  ever requested inside user gestures and is fully guarded.

## The look

One dark graphite tube, one emissive cyan ribbon with a dashed centreline,
amber for gates (the active gate is a beacon that spills light onto the walls
around the curve), red/white kerbs, a checker start line, distance fog, a
gentle vignette. Four colours, no particles, no post stack. The Pac-Man
yellow survives only on the player puck and the title.

## What I traded away

The maze and everything on it — pellets, power mode, four-ghost chase AI,
lives. The physics sliders and the B-field toys went with the charge fiction
they were tuning. First-person maze navigation on a torus was disorienting and
unraceable; nothing about it served a race.

## What I verified, and what I'm trusting

Verified headless (Playwright + SwiftShader, this sandbox):

- `score.mjs` gate 5/5, skeleton 4/4; `inpac-gravity` physics checks all pass
  on all three geometries (sign/direction/uniformity/floor/finite/symmetry).
- A 70s autostart run: countdown → racing, laps advance 1→2→3, finish at
  ~37s with all-clean gates (autopilot), `bestMs` recorded, zero page errors.
- The human path: menu attract animates, RACE starts a countdown, WASD drives,
  pointer-lock failure under headless is silent (no uncaught errors).
- WebGPU pipeline initialises with no validation/shader console errors.

**Not verified: how the 3D view looks.** Headless Chromium does not composite
the WebGPU surface, so I have never seen the ribbon, the gates, or the banking
in first person. The renderer is the shipped ray-tracer with new course
shading; the shader compiles clean and the math is checked, but the aesthetics
are a judgement I could not make from here. Camera-roll direction was derived
analytically (positive yaw rate = right turn = lean right), not observed.
