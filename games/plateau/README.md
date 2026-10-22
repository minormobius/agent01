# PLATEAU

Flight through a four-dimensional Voronoi foam. You see the 3D slice of the
foam you're in, from the cockpit. You fly through its membranes freely. Don't
touch its **edges** (the lines in your slice where three cells meet, which
real foam calls Plateau borders) or the walls of its **solid cells**. The score
is how far you get, and there's a leaderboard for it.

The companion to [Foam⁴](../foam4/), the toy for looking at the same foam.

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
by up to `jitter` of a cell, by an integer hash that `flight.js` and the shader
share. Jitter never passes half a cell, so the 80 seeds round a grid cell are
exactly its possible neighbours, and everything is exact.

A slice of a 4D Voronoi foam is a **power diagram**: a seed `h` off the slice
carries a handicap of `h²`.

- **The shader** (`js/render.js`) steps each ray from membrane to membrane. A
  ray leaves a cell where it first crosses a bisector with one of the 80 seeds
  round it.
- **The edges** are drawn as tubes of the collision radius. On each face, the
  shader takes the exact distance to the face's rim, measured in the face: the
  least, over the other bisectors, of the distance to the plane over the sine
  of the angle between them. It also takes that distance's rate per pixel,
  worked out exactly, so a tube is the same width however the face is tilted.
- **Collision** (`clearance` in `js/flight.js`) is measured in your slice. It
  clips the cell you're in out of a box with its bisector planes, using Foam⁴'s
  `clip`, and takes the distance from `P` to its edges. Near a wall, it also
  checks the edges of the cell across it. It takes the distance to the walls of
  solid neighbours too.

You hit what you see. The cell you're in is never solid: a cell can only turn
solid ahead of you.

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
node games/plateau/test/plateau.selftest.mjs   # the frame, the coupling, the hash, the clearance, the phases, the board (~1 s)
node games/plateau/test/pilot.mjs 4 1600       # balance: how far a lookahead autopilot gets (slow: minutes a run)
```

The selftest checks:

- the craft's frame stays orthonormal through 20000 random turns;
- coupling 0 never leaves the slice;
- a roll of θ tips the nose exactly sin(kθ) into w;
- the nearest seed agrees with brute force in every phase;
- the shader carries flight.js's hash constants;
- the edge distance is never nearer than the wall and is 1-Lipschitz, so it
  is a true distance;
- with every cell solid, the solid wall is your own cell's wall;
- the phases are continuous and monotone;
- the board's speed limit is the game's.

The autopilot (`autopilot` in `flight.js`) also flies the arcade's attract
loop. That loop is filmed in time-lapse, because the recorder's software GL
draws about one frame a second: `?dt=24` steps a fixed 1/24 s a frame, and
`?res=` caps the resolution.
