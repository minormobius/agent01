# INPAC — the race fork

INPAC was a first-person Pac-Man played inside a torus. This fork turns it into
a **pure tube racer** and, on purpose, keeps almost none of the Pac-Man DNA.

## The fork, and why

The brief forced a choice: keep the Pac-Man game and bolt a clock onto it, or
commit to the race. I chose the race, and cleared the board.

Pac-Man inside a torus is a *navigation* game — the interesting part is maze
topology, ghost AI, and pellet coverage. A race is a *line-following* game —
the interesting part is the track, the line you take, and the clock. Those two
designs fight each other: a maze wants you to double back and detour, a race
wants you to commit to one line. Keeping both would have meant a race that a
ghost can ruin, or a Pac-Man with a score attack glued on. Neither is good at
either. So the Pac-Man board is gone; what survives is the thing Pac-Man and a
race genuinely share — moving through a torus — plus the one piece of Pac-Man
that *is* a race mechanic: the ghost. The best-lap ghost.

## What was designed

- **A (1,1) helical circuit.** One lap winds once around the big ring *and*
  once around the tube cross-section, so the track never repeats a view and you
  get the torus's two directions of "around" for the price of one. The line is
  `v = u` on the surface; gates sit on it at 30° steps (12 per lap), three
  laps to a race.
- **The clock, the laps, the best time.** `?autostart=1` drops you straight
  into the run (no clicks, no keys — the capture harness sends none), and
  `window.__inpacState()` exposes `{running, timeMs, lap, laps, bestMs}`.
  `bestMs` is `null` until a lap completes, as specified.
- **A ghost of your best lap.** A cyan sphere that replays your fastest line
  one lap ahead of you. It's the only remnant of the original's ghosts, and the
  thing that makes the race a *race* against yourself rather than a solo sprint.
- **Auto-run with steering.** The runner advances on its own; the player steers,
  boosts, brakes, and jumps. The jump arc is what shows the physics — airborne
  you fall back toward the wall, and the fix below is what makes that fall
  point the right way at every part of the tube.
- **A gravity-aligned camera.** Up is the inward normal at your position, so the
  floor stays down even as the tube curves under you — the "first person inside
  a tube" feel the original wanted but couldn't hold near the walls.

## The physics fix

The old electrostatic lookup table (`computeGravLUT` / `sampleGravity`) reversed
sign near the wall — right where you stand. "Down" inside a tube means **away
from the tube centreline, straight at the nearest wall, everywhere**, and a
constant-strength radial field is the honest statement of that:

```
dR = R − R0, dZ = Z, d = √(dR² + dZ²)
gR = G·dR/d,  gZ = G·dZ/d
```

Constant strength matters for a race: you weigh the same at the outer equator,
the inner equator, the top and the bottom, so a lap time is a measure of your
line, not of where on the tube you happened to stand. The field is extracted
into `clock/inpac/field.mjs` — a dependency-free ES module exporting
`params = { TORUS_R: 8.0, TORUS_r: 3.0 }` and `field(R, Z, geom = {}) →
{gR, gZ}` — and `index.html` imports it and drives airborne physics from it.

## The file:// caveat (worth knowing)

`index.html` is normally served over http(s) on `torus.mino.mobi/inpac/`, where
`import('./field.mjs')` works. But the capture harness loads the page over
`file://`, and Chromium blocks ES-module imports across `file://` origins. So
the page carries an **inline mirror of the field math** (byte-for-byte the same
calculation) and *upgrades* to the real module when the dynamic `import()`
succeeds:

```js
let field = inlineField;                       // works over file://
import('./field.mjs').then(m => { field = m.field; }, () => {});
```

Production always runs the real `field.mjs`; the inline copy is only the
fallback for the no-server capture. Both call the same function and return the
same `{gR, gZ}`.

## What was traded away

- **The maze, the pellets, the ghost AI, the score.** All gone. This is a
  different game; I'd rather have one honest racer than a half-Pac-Man.
- **A human-readable menu.** `?autostart=1` is the contract, so the start menu
  is minimal; the "flow" is the run itself.
- **Anything that needed a click or a key to begin.** Pointer lock is guarded
  and never requested on autostart, because it throws without a user gesture.

## What I verified, and what I could not

Checked myself, from the sandbox:

- **Physics** — the scorer's every interior sample pulls toward the wall, at
  all three geometries (default / thin / fat). 95/100 on `inpac-gravity/score.mjs`.
- **The race gate** — boots with no uncaught errors, draws (real tonal
  variation), animates (pixels move *and* the clock advances), autostarts with
  no input, and the physics check passes. GATE PASS, all five.
- **The skeleton** — clock advances, `lap=1 laps=3`, `bestMs=null` before a
  lap, page still imports `field.mjs` and is not gutted (39 368 bytes). 4/4.
- **The shader compiles** — the WebGPU raymarcher's WGSL is checked with
  `getCompilationInfo()` and reports 0 errors. (I learned the hard way that
  `createShaderModule` does not throw on WGSL errors, so this check is real.)

I could **not** verify the one thing that matters for "looks good":

- **The 3D view.** Headless Chromium does not composite the WebGPU surface
  into a screenshot, and the sandbox has no display. I have not seen the
  raytraced tube, the track, the gates, or the ghost render. That judgement
  belongs to a human in the arena with a real GPU. Everything above proves the
  page is *alive* and *correct*; it is **not** evidence that it looks good, and
  I'm not going to claim it is.
