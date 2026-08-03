# INPAC — Torus Time Trial

## Fork: Pac-Man DNA kept

INPAC's identity is the maze inscribed on the inside of a torus — pellets,
ghosts, power pellets, and the disorienting visual of walls curving into the
distance above and below you. That is what makes it worth running as a race.
A bare tube racer would discard what is interesting about this specific game
and produce something anonymous. The maze is the track.

## What I designed

**A time-trial race through a toroidal maze.** The clock runs from the moment
the race starts. A lap is one full circumnavigation of the torus in the u
(toroidal) direction — detected by tracking cumulative forward x-progress
and counting each full wrap of WORLD_W. Your best lap time is recorded. The
race never ends; you are racing yourself.

**Ghosts as obstacles, not enemies.** Ghost hits cost 3 seconds on the clock
and respawn you. You cannot die — the race continues. Power pellets still
frighten ghosts; eating one is safe passage through a corridor. Each maze
clear (all pellets eaten) regenerates the maze instantly, giving you a fresh
track without breaking your rhythm.

**Smart auto-run for solo racing.** The auto-run (Q toggle) steers: it scans
ahead ±108° and picks the walkable angle closest to straight. Under autostart
the player points +X (the toroidal forward direction) and auto-run takes over
immediately. This also means a single player can race without holding keys —
the game plays itself while you look around.

## Physics fix

The old electrostatic charge model had gravity reversing sign at nearly every
interior sample except the inner equator — you'd float off the wall. Replaced
with an analytic radial field from the tube centreline: `g ∝ d`, linear in
distance, always pointing outward toward the interior surface. Zero at the
centreline, strongest at the wall. Passes sign, direction, uniformity, finite,
and symmetry checks across all three test geometries.

The field lives in `field.mjs` (scored by the harness) and is loaded by
`field.js` (a browser-compatible copy to work around file:// CORS restrictions
on ES module imports in headless Chromium — the physics is identical).

## What I traded away

- **Lives and game-over.** The race cannot end. Ghost hits are time penalties.
  This loses the tension that comes from having two lives left. In exchange,
  the clock pressure replaces survival pressure: every hit costs you the lap.
- **Variable torus geometry.** The physics sliders are removed. The game runs
  at a fixed aspect ratio. I traded exploratory knobs for a racing HUD.
- **Jump Lorentz forces.** The B-field (poloidal/toroidal magnetic deflection)
  is removed from jump physics. It was decorative and broke the purity of the
  radial gravity field. Jumps are now pure ballistic arcs inside the tube.

## What I couldn't verify

The 3D view. Headless Chromium does not composite the WebGPU surface into
screenshots — the capture harness confirms the page is alive (HUD, minimap,
clock advancing) but says nothing about how the WebGPU interior torus renderer
looks. I preserved the existing shader code unchanged and trust it renders as
it did before.

The fun. I can't play it in this sandbox. The auto-run steering might navigate
walls well enough, or it might get stuck in narrow corridors — I tuned it
against the scoring contract, not against gameplay feel. The ghost penalty of
3 seconds is an untested number.
