# Twelve — `/twelve/`

2048 on a buckyball.

## Why it can't just be 2048

A 2048 swipe means "every tile moves that way". A sphere has no "that way":
the **hairy ball theorem** says every direction field on a sphere vanishes
somewhere. The pentagons don't rescue straight lines either. Run a straight
row of hexes (in through one side, out through the opposite side) and it
either goes a few hexes from one pentagon to the next or loops right round the
sphere without touching one:

| sphere | rows pentagon to pentagon | rows that loop round |
|---|---|---|
| C80 | 30, 1 hex each | 6, 10 tiles each |
| C180 | 30, 2 hexes | 12, 15 tiles |
| C240 | 30, 5 hexes | 10, 18 tiles |

A tile sliding along a loop has nothing to stop it.

## What it is instead: drains

The moves are built on the points where the field must vanish. **Drains** are
cells nothing ever sits on: the twelve pentagons, and on the bigger spheres more
(below). A move picks a drain, and every tile pours toward it until it rests on
the drain's rim or against another tile. Equal tiles that meet merge, at most
once per tile per move, nearest the drain first, as against a wall in 2048.

### Two flows (⇣ gravity is the default; ◎ vortex on C60 and C80)

**Gravity.** Each tile takes the steepest way down: one cell nearer the drain
each step, choosing the step best aimed at it. The rings round a drain grow
outward, so tiles funnel together and two can want the same cell. The nearer
one gets it: nearer in steps first, then in true distance on the sphere. While
you aim, every tile that would move shows an arrow to where it lands, with a
ring where it would merge, so a contest is visible before you pour, not a coin
toss after.

**Vortex.** Each pentagon drain is a **whirlpool of five spiral arms**. A
pentagon has five-fold symmetry, so the hexes round it fall into orbits of five.
An *arm* is a chain of neighbours that starts on the drain's rim and takes
exactly one hex from each orbit, and its five rotations are five lanes that
cover every hex once and never touch. There are 2 such arms on C60 (mirror
twins) and 16 on C80. Branch-and-bound picks the one that climbs outward most
steadily, and between twins the one that swirls anticlockwise seen from outside.
It is found for one drain and carried to the other eleven by the sphere's own
symmetry, so every drain swirls alike. On C60 the arms are five rows of four
climbing the rings (0, 1, 2, 3), so a pour is exactly 2048 on five rows and
nothing ever contends. Vortex needs every drain to be a pentagon, so it's
offered on C60 and C80 only.

### The bigger species: more drains, and rain

Bigger spheres can't simply be bigger boards. With twelve drains, C180 and C240
are so roomy that a player who looks one move ahead never dies, however many new
tiles fall per move (greedy play survives 4,000+ moves at up to eight a move).
Two changes fix it:

- **Every rotation axis of the icosahedron that lands on a cell is a drain.**
  The icosahedron has 12 five-fold axes (the pentagons), 20 three-fold axes
  (face centres) and 30 two-fold axes (edge midpoints). C180 has hexes on the 20
  three-fold axes, so it gets 32 drains and 60 cells. C240 has hexes on the 30
  two-fold axes, so it gets 42 drains and 80 cells. Each drain is dotted with its
  symmetry: five dots, three or two. (C240 also has hexes on the three-fold axes,
  but all 62 drains at once chop the board into pockets and games die at 32.)
- **Rain**: one new tile a move to start, then one more for every 100 moves
  made. Every game ends, and skill is how long you last. C80 rains too. C60 stays
  classic, one tile a move.

## Is it any good? (`test/analysis.mjs`)

One simulator plays both games. The classic rows are its calibration: 4×4
random ≈ 128 and greedy ≈ 256 are 2048's known numbers.

| board | flow | random play reaches | greedy play reaches |
|---|---|---|---|
| 2048, 4×4 | | 64–128 | 128–256 |
| **C60, 20 cells, 12 drains** | **gravity** | **128** | **1024–2048** |
| C60 | vortex | 64–128 | 256–512 |
| C80, 30 cells, 12 drains, rain | gravity | 256 | 512–1024 |
| C80 | vortex | 512 | 1024–2048 |
| C180, 60 cells, 32 drains, rain | gravity | 256–512 | 2048–4096 |
| C240, 80 cells, 42 drains, rain | gravity | 512–1024 | 4096–8192 |

Gravity measures more generous to greedy play than vortex does. Part of that is
the funnels merging tiles on their own as they converge. Vortex is the stricter
game, exactly 2048's rule on every arm.

## Controls

- **Swipe** across the ball: the drain furthest that way glows, its five arms
  light up, and letting go pours. Arrow keys do the same.
- **Tap a drain** to pour toward it. This is the only way to choose the drain
  in the middle.
- After each pour the ball **rolls** to bring that drain to the centre, so the
  pile always sits where the projection is truest. The **whole** view (the
  default, `v`) shows the entire sphere as an equal-area disc. **Globe** shows
  the near half, with the whole-sphere map in the corner.
- A drag that starts off the ball turns it, and so do two fingers (which also
  zoom) and shift+arrows. **✥ turn** mode (`t`, the ↘/✥ button) makes one
  finger turn, so pours are by tap only.
- **⇣ gravity / ◎ vortex** (`f`) switches the flow on C60 and C80.
- Games are seeded (`?seed=…&m=c60&f=vortex`). Each board and flow keeps its
  own game in progress and best score in `localStorage`.

## Tests

```bash
node games/twelve/test/twelve.selftest.mjs   # drains per board, gravity and vortex invariants, 2048 row cases, rain, saves, the balance claim
node games/twelve/test/analysis.mjs 40       # the table above (~30 s)
```
