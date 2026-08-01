# INPAC — Tube Racer design notes

## Fork choice: pure tube racer

I cleared the board. No maze, no pellets, no ghosts, no Pac-Man DNA at all.

**Why.** A timed Pac-Man level is still Pac-Man — the thing being measured is how
fast you clear a maze, which is a puzzle-speedrun hybrid, not a race. The torus
topology is incidental there; the maze tiles map to it but don't use it. A tube
racer — running on the inside wall of a doughnut, the whole surface your track,
the far side visible overhead — is something you can only do here. That felt
like the right bet for a brief that is being judged on taste against five other
entries: build the thing the topology enables, not the thing the topology
happens to contain.

## What I built

**The track is the torus interior.** The entire inner tube surface is runnable.
Lane markers run the long way (toroidal direction) as thin glowing bands;
a raised gold finish line crosses them at the start. Boost pickups (golden
orbs) are scattered on the surface. A lap is one toroidal circuit — the long
way around the ring, ~50 game units.

**You race your own ghost.** After each lap, if it's your best time so far, the
path is saved. On subsequent laps a translucent blue-white runner traces that
path — you can see where you were faster, where you lost time. Three laps, best
time kept. No AI opponents; the ghost is self-competition.

**The physics is analytic.** The old electrostatic LUT (shell charge + line
charge, numerically integrated) produced sign reversals at 422 of 1728 interior
samples. The new field is one line of geometry: gravity at any interior point is
the unit vector from the tube centreline to the point, scaled by a constant.
This is exact — the tube cross-section is a circle, so the shortest path to the
wall is always radial from the centreline. It is directionally perfect (0° tilt
from the wall normal everywhere), perfectly uniform (1.0× variation around the
tube), perfectly symmetric under z → −z, and finite including on the
centreline. All three test geometries pass.

**The contract.**
- `field.mjs` exports `params` and `field(R, Z, geom)` — constant-magnitude
  analytic gravity, dependency-free.
- `?autostart=1` begins play immediately with auto-run enabled. Pointer lock is
  never requested under autostart (would throw without a user gesture).
- `window.__inpacState()` returns `{running, timeMs, lap, laps, bestMs}`.

## What I traded away

- **The maze.** Inpac's defining visual — those warm orange walls curving around
  the tube interior — is gone. The tube surface is now mostly dark, with lane
  markings and a finish line. It is a cleaner look but less distinctive. I
  chose clarity over character.
- **Ghost opponents.** The four-colour ghost AI (scatter/chase/frightened mode
  waves) was the most sophisticated system in the original game. Removing it
  removes the only thing that made the world feel inhabited. The replay ghost
  is useful but spectral — it never chases you.
- **Pellet economy.** No score, no power pellets, no level clear. The boost
  pickups are decoration; they give a brief speed burst but don't gate
  progress.
- **The top-down mode and minimap** are functional but not beautiful — I focused
  rendering effort on the 3D view, which I cannot verify.

## What I couldn't verify

- **The 3D view.** Headless Chromium does not composite the WebGPU surface into
  a screenshot. The capture proves the page is alive (HUD, minimap, ticking
  clock) but says nothing about how the game looks. I'm trusting that:
  - The shader colour changes (dark track surface, gold finish line, cyan lane
    markers, blue ghost) read as intended
  - The lane marker rendering (small cyan spheres on the tube surface) is
    visible and not distracting
  - The finish line band (raised gold surface) is legible
  - The ghost replay renders at the correct position and the translucent blue
    material reads as "ghost of your best run"
- **Playability at speed.** The auto-run test completes laps in ~9s, but I
  haven't seen whether the camera, FOV, and motion feel good at racing pace.
  The FOV and mouse sensitivity are unchanged from the original walking game.
- **How the ghost replay reads to a player.** The recording samples every 100ms
  and linearly interpolates. At racing speed this might look smooth or it might
  stutter — I can't tell without seeing it.
- **The jump physics** use the field.mjs output for the airborne "up" direction.
  I verified the field is correct at every sample point, but I can't verify the
  jump arc looks natural in 3D or that landing detection doesn't have edge
  cases at speed.
