# Molt: snake on the snake

Arcade snake, played on the skin of a snake's body, against the clock. The
moment you're 8 long you **molt**: you dive into your own body, and it
becomes the next world. Each world down you molt one cell longer, the snake
runs a little faster and food is worth one more point, so you navigate ever
bigger, twistier surfaces at speed. You have a minute, and every food adds
ten seconds.

## The world is a body

A snake's body, read from tail to head, is a word of turns, one token for
each cell between the two ends. A token is a **yaw**, `S` (straight on),
`L` or `R`, turning about the snake's own "up" (the normal of the surface
it lay on). It can be preceded by a **pitch**, `U` or `D`, turning about
its short axis, up or down over a fold of the world it lay on:

- `D` going over an outside edge;
- `U` into an inside corner.

So a snake that crawled straight round the tube comes back as a ring
(`SDSSSDSSSDSSS`), and one that went straight on over a cap comes back as
a hook folded under itself. A cube turns at most 90°, so the 180° fold of
a zero-width slot between two coils is carried as two pitches, the second
riding on to the next cell.

Turn every cell of the
body into a cube and glue consecutive cubes face to face. The world is the
**surface of that chain of cubes**, with every face cut into a 3 × 3 grid
(C = 3).

The surface is built from the word alone (`js/duct.js`), never from where
the cubes happen to sit in space. Two coils of a body that lay side by
side stay two separate walls, as they would on a real snake. So the
surface is always a sphere: a capsule with a cap at the head and one at
the tail.

What follows from that, and what the selftest checks on 135 bodies (half
of them bending in 3D),
including coils and spirals whose flat layout overlaps itself:

- **The same size whatever the shape.** Every body cube shows exactly 4
  faces. A straight cube shows top, bottom and both side walls. A corner
  cube shows top, bottom and both *outer* walls, and no inner wall. So a
  body L long makes C²(4L + 2) cells. A bend only moves cells from the
  inside of the turn to the outside: the extra tiles land on the wide end.
- **Every cell is a square with four neighbours.** The curvature lives at
  the corners where cells meet. Where 3 squares meet (the outside of a
  bend, and each cap's cube corners) the surface curves +90°. Where 5 meet
  (the inside of a bend) it curves −90°. In a U-turn the two inside corners
  merge into one where 6 meet (−180°). The total is always 720°, the
  curvature of a sphere (V − E + F = 2).
- **Straight on comes back.** Go straight and you come back where you
  started: round the tube after 12 cells, or along it and over both caps
  after 2C(L + 1).

## Seeing it: the tube, the minimap, the net

**The tube (default).** The body's cubes are rounded into a smooth tube
for drawing (`roundPoint` in `js/duct.js`). The body's centreline runs
straight through straight cells and along a quarter circle (radius ½)
through turning ones, and every point of the blocky surface is pushed out
to radius 0.46 around its nearest point on that line: as thick as the
tube can be while the two arms of a U-turn, one cell apart, stay clear of
each other. Square cross-sections become circles, corners become bends
(in any direction, so a body that pitched bends that way too), and the
caps become hemispheres. Only the drawing changes: the cells, their neighbours and
every count above stay exactly as they were.

The selftest checks that the tube is watertight on flat and 3D bodies
(every edge two cells share lands on the same points from both sides) and
that every cell faces outward. There are two exceptions:

- the zero-width slots where two arms of a body lie against each other,
  which are hidden there anyway;
- bodies whose layout runs into itself, such as a spiral of three or more
  turns the same way, or a closed ring.

Inside-out cells in those places are skipped when drawing. Worlds made by
real play haven't run into themselves: none did in the selftest's bot runs
or in 25 more molts tried by hand. About a third have arms lying against
each other.

A camera rides above the head, looking down at it. Its "up" is carried
from cell to cell as the surface curves. Where a straight line of cells
bends (round a cube's corner, 90°), the camera turns with it, so the way
the snake is going always sits exactly up, down, left or right on screen.
That keeps the arrow keys classic snake: the selftest's browser run checks
right, right (all the way round the tube), up, left and down, each landing
where the screen says.

**The minimap** (top right) shows the whole world from above, with your
snake on it (bright on top of the tube, dim underneath), your head and
the food.

**The net** (the `net` button, or V) is the surface around the head
unfolded flat, the way a cube's net lies flat:

- On a straight stretch you see the whole tube unrolled around you.
- Where the world curves, a 90° gap opens at a cube's corner, and a face
  that would overlap at the inside of a bend is left out until you get
  closer.
- It is laid out again on every face change, keeping its orientation.

The molt is shown in 3D: you dive into your head, the whole new world
appears (the shape of the body you just left, every bend in place), and
then the camera lands on your new head, on top of its head end, crawling
back towards the tail.

## Playing

- **Steer:** arrow keys or WASD. Or swipe anywhere: a short swipe is
  enough, and you don't have to lift your finger between turns, so right
  then up in one gesture queues both turns. On touch screens there's also a
  thumb pad (`pad` toggles it). Turns queue two deep.
- **Molt:** automatic, the moment you're 8 + depth long (8, then 9, 10, …).
  The HUD shows length / that target.
- **The clock:** 1:00 to start, +10 s for every food; it runs out and the
  run is over. It counts game time (one step's worth a step), so it's part of
  the rules and the selftest, and it stops while you molt. Food on your very
  last step still saves you.
- **Speed:** each world down a step takes 5% less time (150 ms at depth 0,
  116 ms at 5, 90 ms at 10), never under 70 ms.
- You start each world on top of its head end, crawling back towards the
  tail, so the world opens out ahead of you.
- Food grows you by one cell and is worth (depth + 1) points. The bigger
  the world, the more food there is.
- Haptics: a tap when you eat, a thump when you molt, a buzz when you die.

## Leaderboards

There are two boards, each showing all time, week and today, one row per
player:

- **score** (food is worth depth + 1);
- **deepest**: how many times you molted.

One tap on "post" writes both (no depth record if you never molted) as
`com.minomobi.lab.score` records in your own repo, through Orb's board kit
(`../orb/js/board-kit.js`), the same stack as Orb, Fathom, One Side and
Tessera. The detail field carries `seed steps eaten depth`.

The boards trust the record but refuse the impossible:

- molt d happens at length 8 + d and every world starts you 3 long, so
  reaching depth d takes 5 + 6 + … + (4 + d) food;
- every step spends at least 70 ms of a clock that starts at 60 s and only
  food refills;
- no food is worth more than (depth + 1);
- the record's value must match its own detail.

The selftest checks the refusals, and checks that bot runs down to depth 5
post records the boards accept. The ids carry `v2`: bump `VERSION` in
`js/score.js` if the rules change in a way that moves the numbers. `v1` was
the game before the clock, when you molted when you chose; it also had a
longest-snake board, which auto-molting makes just depth + 7. The
game-over screen also shows this browser's bests.

## Files

- `js/duct.js`: word → surface. It builds faces, cells, neighbours, face
  links for unfolding, the curvature census, the blocky drawing embedding
  (a duct 0.72 wide down the middle of each body cell), the rounded tube
  (`centreline`, `roundPoint`), and `wordOf` (body → word). No DOM.
- `js/game.js`: the rules. Steering by side, straight on by default,
  growth, food, death, molting, the clock and the speed. No DOM.
- `js/view.js`: the tube and its camera, the minimap, the net, and the 3D
  reveal.
- `js/main.js`: the clock, input (keys, swipes, pad), the HUD, and the
  molt sequence.
- `js/score.js`: the two boards' records, and what they refuse. No imports.
- `js/board.js`: mounts the board kit. A separate module, so the game
  still runs if the vendored auth client can't load.
- `test/molt.selftest.mjs`: 33 checks, about a second.

## Next

- A treadmill mode, where the parent keeps crawling while you're inside
  it, so rings appear at its head and vanish at its tail.
- Portals where the parent lay against itself.
- Climbing back out.
