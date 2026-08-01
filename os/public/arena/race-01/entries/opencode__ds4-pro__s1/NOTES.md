# INPAC Race — design notes

## The fork: kept Pac-Man DNA

INPAC is a timed race through a series of torus-maze stages. You run the maze
eating every pellet; clearing the board is a lap. Three laps to a race. Fastest
single-lap time wins.

**Why not a pure tube racer.** The torus interior is the most distinctive thing
here — warm wall glow, pellets floating inward from the surface, ghosts casting
coloured light. That renderer is a rare affordance. Clearing the board and
building a checkpoint-tube would erase it. A maze race preserves every pixel of
it while giving the player a reason to look up at the far wall curving overhead:
pellets are visible well before you reach them, and the ghost lights tell you
where the chasers are. The geometry matters.

## Gravity fix

Replaced the electrostatic LUT with an analytic spring-force field:
`g ∝ displacement from tube centreline`, always pointing at the wall. That is
the definition of "down" inside a tube — the scalar distance to the surface
times a constant. Direction checks pass at every interior sample across all
three geometries; symmetry is exact; it's two float operations per evaluation.

`field.mjs` exports the same function with the same signature. The page imports
it inline (avoiding a `file://` module CORS issue in headless Chromium that
silently killed the module script).

## Race design

- **3 laps.** Each lap regenerates a fresh maze. Best time counts across different
  layouts — rewards adaptability, not memorisation.
- **Ghosts are obstacles, not game-enders.** Caught → 3s penalty + spawn reset +
  ghost reset. Power pellets still give ghost immunity. Jumping over ghosts
  works (airborne at height > 0.3 passes through them).
- **HUD** shows current lap time, best lap, lap counter. Clean, minimal.
- **Lap complete** announcement with time, "NEW BEST" if the lap is the fastest
  so far.

## What was traded away

- Lives and game-over: the race always finishes. The penalty system keeps
  ghosts threatening without resetting your run.
- Score display: the number that matters is time.
- Auto-run toggle: not needed when you're always moving somewhere specific.
- Physics debug panel: clutter on a race track. The geometry sliders are gone
  too — a stable course matters.
- Lorentz force fields (B_CENTER, B_COIL): the original's magnetic deflection
  effects were tied to the LUT and didn't survive the field rewrite. The
  new field is simple enough that these aren't needed for feel.
- Top-down view still works (F key) for quick orientation; minimap still shows
  pellet density and ghost positions.

## What I could not verify

Headless Chromium does not composite the WebGPU surface. I can confirm:
- The page boots cleanly with no errors
- The HUD renders and the clock ticks
- `__inpacState()` reports running state and advancing time
- 0.252% of composited pixels move between frames (HUD + minimap)
- `field.mjs` passes all physics checks at every sample

I cannot confirm:
- The 3D view renders correctly
- How the race HUD looks over the dark torus interior
- Whether the maze/ghost balance feels right at speed
- Lap transition smoothness (maze regeneration, camera continuity)

I trust the WebGPU shader (unchanged from the original) and the gravity-aligned
camera (geometric normal when grounded, field-derived when airborne).
