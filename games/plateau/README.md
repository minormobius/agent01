# PLATEAU

Flight through a four-dimensional Voronoi foam. You see the 3D slice of the
foam you're in, from the cockpit. You fly through its membranes freely. Don't
touch its **edges** (the lines in your slice where three cells meet, which
real foam calls Plateau borders) or the walls of its **solid cells**. The score
is how far you get, and there's a leaderboard for it.

The companion to [Foam⁴](../foam4/), the toy for looking at the same foam.

**[The foam, phase by phase](foam.html)** (`foam.html`) is the page for
players: each phase with a picture of the same spot, the numbers, why w feels
jumpy in the crystal (measured), and which controls drive you through w.
Its pictures (`img/`) are the game's own renderer at seed 4242, with the craft
at a cell's seed at 400 m, 2.2, 4.5, 7.5 and 13 km.

## Flying in four dimensions

You're a rigid body in 4D: a point `P` and four orthonormal directions, right
`R`, up `U`, forward `F`, and the fourth, `N`, which you can't see along. You
see the slice through `P` spanned by `R`, `U` and `F`, and you fly along `F`.

Every turn is a **double rotation**: it turns its plane of the body and, by
`COUPLING` (0.5) times as much, the plane perpendicular to it in 4D.

| input | turns | and, coupled | so |
|---|---|---|---|
| roll | R → U | F → N | your nose tips into w |
| pitch | F → (U cos τ + N sin τ) | R′ → N′ | your nose turns up and a little ana |
| yaw | F → (R cos τ + N sin τ) | U′ → N′ | your nose turns right and a little ana |

τ is `W_TILT`, 30°. Pitch and yaw turn the nose in a plane tilted into w
because otherwise they couldn't move it there at all. A double rotation's
second plane is perpendicular to its first. Pitch's first plane is
(nose, up), so its second is (right, w), which doesn't contain the nose: pitch
could tilt the wings into w at any coupling, but never the nose. Only roll's
second plane, (nose, w), holds the nose. Tilting the turn plane by τ makes
every manoeuvre carry you through w: down and left go kata. The coupled plane
is still the one perpendicular to the nose's turn.

A quarter-second tap from level flight carries you through w in the next 2 s
by:

| tap | cells |
|---|---|
| pitch or yaw | 1.03 |
| roll | 0.47 |
| pitch or yaw, before the tilt | 0 |

At coupling 1 and tilt 0 these would be isoclinic (Clifford) rotations,
multiplication by unit quaternions. At coupling 0 and tilt 0 it is ordinary
flight in one slice; a run's opening heading is set that way, so a run starts
square to w. Once your nose
points into w, flying forward drives you through w. The slice you're in moves,
and the foam you see changes round you: cells are born, shrink away, and flip.
The gauge on the right shows how far your nose points ana or kata.

## The foam

There is one seed per cell of a 4D grid of spacing `scale`. Each seed is moved
by up to `jitter` of a cell. Where it sits, and when it turns solid, are five
random numbers per grid cell from an integer hash (`Foam.rand` in `flight.js`).
They never change in a run, because everything else is the field. Jitter never passes half a cell, so the 80 seeds round a grid cell are
exactly its possible neighbours, and everything is exact.

A slice of a 4D Voronoi foam is a **power diagram**: a seed `h` off the slice
carries a handicap of `h²`.

- **The shader** (`js/render.js`) steps each ray from membrane to membrane. A
  ray leaves a cell where it first crosses a bisector with one of the 80 seeds
  round it. It reads the seeds' random numbers from a texture holding a 26⁴
  window of grid cells round you, addressed by `g mod 26` and filled by
  `Foam.rand` itself. The texture is filled once a run; as you move, only the
  strips that come into the window are refilled.
- **The edges** are drawn as tubes of the collision radius. On each face, the
  shader takes the exact distance to the face's rim, measured in the face: the
  least, over the other bisectors, of the distance to the plane over the sine
  of the angle between them. It also takes that distance's rate per pixel,
  worked out exactly, so a tube is the same width however the face is tilted.
  That rim costs nothing extra. A face the ray passes through is shaded one
  step late, in the next cell's pass over its 80 seeds, because the face's rim
  is bounded by that cell's planes too and the march is reading them anyway.
- **Collision** (`clearance` in `js/flight.js`) is measured in your slice. It
  clips the cell you're in out of a box with its bisector planes, using Foam⁴'s
  `clip`, and takes the distance from `P` to its edges. Near a wall, it also
  checks the edges of the cell across it. Every solid cell nearby is clipped
  out whole and measured, so one that meets yours only at an edge or a corner
  counts. Otherwise a face opening between you would bring its wall from
  nowhere.

You hit what you see. The cell you're in is never solid: a cell can only turn
solid ahead of you.

## Speed

Measured on the sandbox's software GL, at one view in each of crystal, melt
and press. The pictures are pixel-identical to the shader before.

| change | time per frame |
|---|---|
| the shader at launch | 1.0 |
| the edge rim folded into the next step's pass | ~0.65 |
| and the seeds read from the texture, not hashed | ~0.40 |

That is about 2.5× in all. Three things measured slower and were left out:

- a constant table of the 80 offsets, 2–3× slower;
- four nested loops over −1…1;
- per-cell lists of true 4D neighbours. Only about 38 of the 80 are true
  neighbours, at every jitter, so the lists would halve the loop at most, and
  computing them exactly takes tens of ms a cell.

Lists of each cell's faces in your slice would be shorter. But rolling turns
the slice through w, so a cell 7 away moves about 0.8 cells in w in a tenth of
a second, and the lists would go stale at once.

After those, three more changes:

- **A pre-pass, once a frame.** One texel per grid cell turns every seed in
  the window into slice coordinates relative to you (x, y, z and its power
  |q|² + h²). The march reads a seed with one fetch and crosses its bisector
  with a dot product. It no longer rebuilds the seed (jitter, the crystal's
  basis, the scale) and takes four 4D dot products for each of 80
  neighbours at every step. Where float render targets are missing, the
  march computes the same numbers itself.
- **An odometer for the neighbour offsets and their texels.** No integer
  division or remainder, which many phone GPUs emulate.
- **Pixel-identical.** Mean difference 0.001/255. On the sandbox's software
  GL the lattice modes and the melted foam render 15–26% faster; the crystal
  view is unchanged.

**The resolution governor** keeps up with the display at whatever rate it
runs (60 Hz, 120 Hz, or a phone's low-power 30 Hz). It is judged by frames
left waiting on the GPU, never by the clock.

- **What was wrong.** It used to give way only when frames ran 2.5 refreshes
  late on average, which is a third of the display's rate. At 30 Hz that is
  9 frames a second, still sharpening.
- **Now.** It gives way when one frame in three misses a refresh, by a quarter
  when it's far behind, down to 0.35 of the screen's pixels. It sharpens only
  after 2.5 s without dropping.
- **`?hud=1`** shows frames a second, resolution, lateness and pixels a frame.

## The phases

The foam changes with distance, continuously, so nothing jumps
(`fieldAt` / `speedAt` in `flight.js`):

| phase | from | what happens |
|---|---|---|
| crystal | 0 | a nearly perfect crystal: tesseract (jitter 0.08), Kelvin or 24-cell (0.04) |
| melt | 120 | the crystal melts: the tesseract foam into a random foam (jitter to 0.5), the others part way |
| clot | 320 | cells turn solid |
| press | 560 | more turn solid, and the cells press smaller (scale to 0.75) |
| deep | 900 | as far as the foam goes; only the speed still climbs |

Distances are in cells. A cell is 10 m on the board. Speed climbs from 2 to 4.2
cells a second.

## The seed crystals (modes)

You pick the crystal you start in (`MODES` in `flight.js`). The seed of grid
cell g sits at B (g + ½ + jitter), where B is the crystal's basis, scaled to
one seed per unit of 4D volume.

| mode | lattice | basis | melts to | neighbour list |
|---|---|---|---|---|
| tesseract | Z⁴ | the grid itself | 0.5 (random) | the 80 round a cell |
| kelvin | A₄* (permutohedra) | Foam⁴'s obtuse superbase | 0.2 | the 80 |
| cell24 | D₄ (24-cells) | roots (1,1,0,0) (1,−1,0,0) (1,0,1,0) (1,0,0,1) | 0.25 | the 80 and 8 corner contacts |

- **The bases.** Each basis is chosen so that every Voronoi neighbour of a cell
  is within one step in every coordinate. Foam⁴'s own D₄ basis puts some at
  two steps. In the one used here, all 24 roots are within one step. The
  perfect D₄ foam's corners are shared so widely that 8 cells two steps away
  touch each cell at a point, and any jitter grows those contacts into faces,
  so they are listed too.
- **Why the lattices only melt part way.** Past about a quarter of a cell, a
  melting lattice grows faces with cells two steps away in its own
  coordinates. Measured against every seed two steps away: A₄* first at
  jitter 0.3, D₄ (with its contacts) not by 0.35. So each crystal stays in its
  foam to the end. The selftest checks the lists, crystal to fully melted.
- **The tesseract foam** is the game as it launched, seed for seed.
- **Kelvin's opening.** A run starts square to w, and there the Kelvin mode's
  slice is Kelvin's foam: truncated octahedra (checked at jitter 0).
- **The renderer** compiles a program per mode. The basis is a uniform matrix
  and the extra neighbours a uniform array; the tesseract program is the
  shader as it was. In lattice coordinates a ray reaches ±11 cells, so the
  seed texture's window is 26⁴ (±12).

How each crystal moves through w, per fiftieth of a cell (the measure on
the foam page):

| crystal | mean change | worst step | steps with almost no change |
|---|---|---|---|
| tesseract | 2.1% | 33% | 87 of 100 |
| Kelvin | 2.8% | 14% | 2 of 100 |
| 24-cell | 2.3% | 8% | 37 of 100 |

The tesseract crystal jolts. Kelvin's foam flows, and the 24-cell foam is in
between.

## The boards

`js/score.js` and `js/board.js` mount Orb's board kit, with records stored as
`com.minomobi.lab.score`. There are two boards per mode:

- **today's foam:** one seed for everyone each UTC day.
- **any foam.**

The tesseract boards keep their launch names, `daily-v1-YYYY-MM-DD` and
`open-v1`, and today's tesseract seed is the same as before. The others carry
their mode: `daily-v1-kelvin-YYYY-MM-DD`, `open-v1-cell24`.

`accept()` refuses a run longer than `VMAX × time` allows, because nobody
flies faster than the craft. Bump `VERSION` whenever anything that moves
distances changes.

## Controls

- **Desktop:** the mouse steers once you click to capture it, and so do the
  arrows; A/D or Q/E roll.
- **Phone:** the stick steers, and the ⟲ ⟳ buttons roll.

"Up = nose up" can be inverted, as flight sims do.

## Checks

```bash
node games/plateau/test/plateau.selftest.mjs   # the frame, the coupling, the seeds and their texture, the clearance, the phases, the board (~7 s)
node games/plateau/test/pilot.mjs 4 1600       # balance: how far a lookahead autopilot gets (slow: minutes a run)
```

The selftest checks:

- the craft's frame stays orthonormal through 20000 random turns;
- coupling 0 never leaves the slice;
- a roll of θ tips the nose exactly sin(kθ) into w;
- the nearest seed agrees with brute force in every phase;
- the shader's seed texture holds every cell's own numbers through 60 moves
  and a jump, filling whole only when it must;
- a JS copy of the shader's march never reads a cell more than 10 from yours,
  which is what sizes the texture;
- the edge distance is never nearer than the wall and is 1-Lipschitz, so it
  is a true distance;
- with every cell solid, the solid wall is your own cell's wall;
- the phases are continuous and monotone;
- the board's speed limit is the game's.

The autopilot (`autopilot` in `flight.js`) also flies the arcade's attract
loop. That loop is filmed in time-lapse, because the recorder's software GL
draws about one frame a second: `?dt=24` steps a fixed 1/24 s a frame, and
`?res=` caps the resolution.
