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
| pitch | F → U | R → N | your wings tip into w |
| yaw | F → R | U → N | your up tips into w |

At coupling 1 these would be isoclinic (Clifford) rotations, multiplication by
unit quaternions; at 0 it would be ordinary flight in one slice. Once your nose
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
  round it. It reads the seeds' random numbers from a texture holding a 24⁴
  window of grid cells round you, addressed by `g mod 24` and filled by
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

## The phases

The foam changes with distance, continuously, so nothing jumps
(`fieldAt` / `speedAt` in `flight.js`):

| phase | from | what happens |
|---|---|---|
| crystal | 0 | a nearly perfect tesseract foam (jitter 0.08) |
| melt | 120 | the crystal melts into a random foam (jitter to 0.5) |
| clot | 320 | cells turn solid |
| press | 560 | more turn solid, and the cells press smaller (scale to 0.75) |
| deep | 900 | as far as the foam goes; only the speed still climbs |

Distances are in cells. A cell is 10 m on the board. Speed climbs from 2 to 4.2
cells a second.

## The boards

`js/score.js` and `js/board.js` mount Orb's board kit, with records stored as
`com.minomobi.lab.score`. There are two boards:

- **today's foam:** one seed for everyone each UTC day, `daily-v1-YYYY-MM-DD`.
- **any foam:** `open-v1`.

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
