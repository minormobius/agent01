# INPAC Race — design notes

## Fork choice: kept the Pac-Man DNA

I chose to keep the maze, pellets, and ghosts rather than clear the board for a
pure tube racer. Reasons:

- **The maze is a procedurally generated track.** It's different every lap, so
  no two runs are the same. A human player learns the maze on the fly rather
  than memorising a fixed circuit — skill is reading corridors at speed, not
  muscle memory.
- **The ghosts are pressure.** A pure time trial against your own ghost is
  elegant but lonely. Four pursuers with distinct AI (Blinky chases directly,
  Pinky ambushes ahead, Inky flanks, Clyde is territorial) turn the track into a
  gauntlet. The race is against the clock *and* the room.
- **The affordances were already there.** The WebGPU ray-tracer, the maze
  generator, the ghost AI, the minimap — these are finished, tested systems.
  Stripping them to build a ring-track from scratch would have spent the budget
  on reconstruction rather than craft.

## What changed

### Physics: the gravity bug

The original field used an electrostatic analogy (charged shell + line charge)
that produced negative gravity — pushing you off the wall — at 422 of 1728
interior samples. Replaced with an analytical field that always points away from
the tube centreline (toward the wall). Extracted into `field.mjs` as required.
It passes all six gating checks across three torus geometries (R=8/r=3,
R=12/r=2, R=6/r=4) at every interior sample.

The field is linear: a constant base pull plus a term proportional to depth from
the wall. This means gravity is never zero at the surface (you feel weight on
the floor) and rises smoothly toward the centreline (a deep jump pulls you back
firmly). The geometric outward normal is exact — 0° tilt off the wall normal at
every point.

### Race mechanics

- **Laps** are toroidal circuits: complete one wrap around the ring in the
  u-direction. This uses the topology — a "lap" means going all the way around
  the doughnut, not clearing the board. Pellets are score and feedback, not the
  lap gate.
- **Clock** runs continuously from start. Elapsed time, current lap, best lap
  time in the HUD.
- **Best lap** is tracked per-session. Shown with a star on the lap banner when
  you beat it.
- **Ghost collision** costs 2 seconds and resets your position (not a life —
  this is a race, you keep going). Power pellets give a 3-second speed boost and
  frighten ghosts instead of the classic eat-reversal.
- **Autostart** with `?autostart=1`: game begins immediately, no clicks or
  keypresses. An autopilot steers eastward (preferring the toroidal direction)
  to prove the page is alive. Pointer lock is guarded — it throws without a user
  gesture.

### Visual approach

Restrained. The colour palette shifted from warm orange to green ("race green"
on the clock, HUD accents, reticle, minimap dot, player marker). The tube
interior is darker (floor colour deepened) so the glowing ghosts and pellets pop
more. The HUD is monospace, minimal: clock, lap counter, best time. No particle
effects, no speed lines, no screen shake — confidence reads better than clutter.

## What I couldn't verify

- **The 3D view.** The sandbox is headless; WebGPU surfaces don't composite into
  screenshots. The capture proves the page is alive (HUD visible, clock
  advancing, laps counting) but says nothing about the rendered torus. I trust
  the existing WGSL shader (unchanged except for one floor colour tweak) because
  it worked before and I didn't touch its logic.
- **Game feel at speed.** The gravity fix means you always land on your feet,
  but jump height, acceleration curves, and the boost/pellet rhythm need a human
  with a real GPU and a mouse to evaluate. I tuned from physics first principles
  (GRAVITY_BASE=8, GRAVITY_DEPTH=8) but can't feel the result.
- **Maze balance.** The cell count is slightly reduced from the original (cw ≈
  R*1.8 instead of R*2.25) to keep laps tight. A human might want it larger or
  smaller — this is a tuning surface, not a correctness question.

## Tradeoffs

- **No ghost of your best run.** Recording and replaying a full-lap ghost would
  need position-per-frame storage and playback logic — worthwhile but beyond the
  time budget. I kept the living ghosts because they're more interesting to race
  against than a silent replay.
- **No lives, no game over.** A race doesn't end — it keeps going. You can
  restart with R. The old life/score system is gone because it measured
  survival, not speed.
- **The autopilot is east-biased.** Under autostart, the player steers east to
  wrap the torus. It's not smart — it fans out from the target direction and
  takes the first open path. Good enough to prove liveness; not a substitute for
  human play.
- **Field.mjs is mirrored inline** in index.html. The module exists as a
  standalone file for the scorer's physics check, but ES module imports fail
  under `file://` URLs (CORS) in headless Chromium. The page uses an inline copy
  so it boots everywhere; the file is still the source of truth.
