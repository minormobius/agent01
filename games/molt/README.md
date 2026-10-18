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

## Ouroboros: the lab

`ouro.html` asks the next question: what if you never molt, and **the world
is your body right now**? One cube of world for each cell of you, rebuilt
every step. The turn you just made (read off the surface exactly as a molt
reads a body) becomes the bend of the cube behind the world's head. Every
bend slides one cube back along the world each step, the way a snake's body
slides through the bends its head made. Eat and you and the world grow
together. It's a lab, not a game yet: every rule that decides what "the
same place" means on a world that changed is a toggle, and the log says
what happened and why.

**It is possible.** What the lab found, all measured by
`test/ouro.selftest.mjs` with an autopilot:

- **The ground has to be the skin, not space.** If a cell of the world
  belongs to its place in space, the world grows a cube a step at its head
  and leaves a cube a step at its tail. You walk a third of a cube a step
  (C = 3), so the ground runs out under you three times faster than you can
  walk: every run falls off its own tail within about ten steps. If a cell
  belongs to its cube of the body (the skin), nothing is ever destroyed. A
  cube keeps its place along the body and takes the bend of the one ahead
  of it, so the bends sweep back through the world, and through you. Every
  world of the same length has exactly the same cells by name (checked), so
  a step carries every cell somewhere distinct.
- **No naming of cells keeps every joint of your body.** A bent cube's
  inside lane has 1 cell where a straight one has 3 (the cells move to the
  outside of the bend; that's the "extra tiles on the wide end"). So when a
  bend sweeps under a joint of your body, the two cells stop touching. They
  usually land 3 apart: a wall turned 90°. Carrying your body over cell by
  cell cuts you about 14 times every 100 steps, and the snake averages 3
  long.
- **Your body is a word of turns, so lay it back down.** Keep the head on
  its own cell and lay the body down behind it by its own turns (straight,
  left, right at each cell). That is exactly what a body is in Molt. Where
  the world didn't change it gives back the very same cells (checked).
  Where the world bent, your shape holds and the world bends under it. It
  can only break where the re-laid body runs into itself. That's about 1.6
  cuts per 100 steps, and the snake averages 9 long and reaches 20. This is
  the default.
- **A cut can drop you.** You are the world, so losing cells could mean
  the world loses as many cubes off its tail end. But the world grows at
  its head end and you start (and stay, unless you head the other way) near
  its tail. So the first real cut takes the ground from under you, every
  time, after about 160 steps. The default lets the world keep its length.
  Shrinking it is a rule to play with: a player who keeps to the world's
  head end can survive it.
- A cut is Tessera's: the body is cut at the first break from the head,
  and everything behind it falls off where it lay, as food. Biting yourself
  bites off what's behind the bite (also food), or kills you, as you
  choose.

The world is anchored on the cube under your head (same place, same
frame), so it writhes round you instead of jumping. The camera has four
distances (V cycles them): ride, far and high all ride your head, so the
arrows still steer, and whole shows the world from outside. A wheel, a pinch
or + and − fine-tune it. **Grain** is the zoomed-out game: 3, 2 or 1 cells
across each face of a cube, so the world is nearer your own size. It is
tighter: 1.7, 2.7 and 8 cuts per 100 steps. At 1 every step crosses a fold,
so every step is a pitch and the world coils up and down in 3D. Notes in the
log dismiss with a tap (Esc clears them all), and cuts fade by themselves.
The word strip along the bottom is the world's word, tail to head; watch
your turns enter on the right and slide left.

Still open: the cell naming inside a bent cube (`turn` in `js/ouro.js`;
the four ways to turn the swallowed wall onto the front measured within a
cut per 100 steps of each other), a scoring rule, and whether the head end
of the world should pull you along.

## Cascade: snake on snake on snake

`cascade.html` is the next layer: a constant zoom. The world is your body,
you crawl on it, and on your body, a third the size, crawls **you again**,
on the same cells, making the same moves. On that one crawls you again. The
camera falls inwards forever. At any moment three or four snakes are in
view, each lying on the back of the one before.

Nothing keeps track of the layers, because they are all the same snake: one
game (`js/ouro.js`), drawn several times. That's "as above, so below":

- **Every snake is a tube with volume, and every skin is the same skin.**
  Every cell of the world has a name on the skin (`namesOf`): which cube of
  the body (one per cell of you), which wall (up, down, left, right, or a
  cap at an end) and where on it. Here every cube is drawn as a cube: four
  walls of C × C cells and the caps, each cell a fixed patch of a fixed
  segment of the snake. It's laid round the spine at that segment's place
  along it (gnomonic, as Molt rounds its tube), and past an end it's pushed
  round the end into a dome. The spine does all the bending, so the inside
  of a bend is simply squeezed, as a real snake's is (`js/cascade.js`).
- **Layer 0** is that skin round the world's centreline. On a straight
  stretch it's Molt's rounded tube, cell for cell (checked).
- **Layer j + 1** is the same skin round a spine through your body's cells
  on layer j, lifted one radius off the skin, at a third of the radius. Its
  up is the skin's normal under it, which is how Molt reads a body. The
  spine runs from the middle of each joint to the middle of the next,
  bending at each cell, as the world's centreline does at each cube.
- **The heads close in on one point.** Layer j + 1's head lies on layer j at
  your head's cell, which is somewhere along your body. So each layer's head
  is about a third as far from the next: measured, 0.35 on average, and in
  144 steps never further. The camera falls towards that point, turning
  from one layer's frame to the next so the way ahead stays up the screen.
- **Everything slithers.** The world moves along a path that stays put in
  space (`anchor: "path"` in `js/ouro.js`): each step every cube moves to
  where the one ahead of it was and the head grows into new space, as a
  real snake moves. Each frame is drawn at its fraction of the way through
  the step:
  - the world's skin slides a cube along its path;
  - each segment of each body moves from the cell it lay on before the step
    to the one it lies on after: the next one along when it simply
    slithered, wherever the game re-laid it when a bend swept under it;
  - the world's tail cube straightens as it slides.

  The selftest checks that every layer, at the start of a step, is exactly
  where it was at the end of the last, and at the end exactly where the step
  put it. So the point the zoom falls into moves smoothly (1.2 a step) and
  the camera can hold it: in the browser it stays within about 20 px of its
  place on screen.
- **The zoom is a loop.** Over one cycle the camera goes from riding layer 1
  on layer 0 to riding layer 2 on layer 1, a third of the distance, then
  steps back to the start. Every layer is the same snake on the same skin,
  so that's the same picture. The outermost layer fades out as each cycle
  ends and the next one in fades in as it begins, so the step doesn't show.
  Each layer's colour slides with the zoom for the same reason. Anything
  well in front of where the camera looks is cut away, since another coil
  of a world can pass between it and you.

The game is Ouroboros with the world exactly as long as you, since every
cube of it is a cell of you. A cut shrinks the world from its tail end. If
the ground under your head goes with it, you **slide** onto the world's new
tail end rather than falling (`fall: "slide"`, also in the lab). Biting
yourself ends it. Steering is relative, because the camera turns with you:
◀ ▶, A D, a tap on either half of the screen, or a swipe. Z sets how fast
you fall in. Four layers are drawn at 60 frames a second, rebuilt every
frame (about 6 ms).

**Time slows as the world bends** (here and in the lab, where it's a rule).
Every bend sweeps a cube a step, so the more of the world is bent, the more
of it changes under you each step, and the harder it is to read. A step
takes longer the more of the world bends: full speed while no more than a
fifth of its cubes do, up to twice as long when all of them do. That's the
share of the world, not the count, so a long snake isn't slowed for its
length. Going round the tube crosses a fold every three cells, and every
fold is a bend, hence the allowance. The change is eased in and out, and in
Cascade the fall inwards slows with it. Measured: a calm player (steering
every seventh step) runs at 1.13× median, a twisty food-chasing autopilot at
1.64× (1.31 to 2.0). Curling up buys you time, and the bends that buy it are
the ones that sweep through you and cut you. The HUD shows the rate.

`test/cascade.selftest.mjs` (10 checks, ~6 s) checks:

- the world stays as long as you, nobody falls, and the path stays put;
- on straight stretches layer 0 is Molt's tube;
- every layer is watertight and a third the size of the last;
- every spine's frame is orthonormal, with a fallback where a body crosses
  a slot and the skin folds right over;
- each snake lies on the one before (96.8% of cells within half a radius);
- the heads converge;
- the slithering is continuous at both ends of every step.

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
- `cascade.html`, `js/cascade.js` (tube coordinates, spines, the stack of
  layers; no DOM), `js/cascade-page.js` (the camera and the drawing),
  `css/cascade.css`, `test/cascade.selftest.mjs`.
- `ouro.html`, `js/ouro.js` (the rules, headless: names for every cell of
  the skin, carrying them from world to world, laying a body by its turns,
  cuts, an autopilot), `js/ouro-lab.js` (the page; it draws with
  `js/view.js`), `css/ouro.css`, and `test/ouro.selftest.mjs` (16 checks,
  ~8 s: the invariants under seven rule sets and grains, and the findings above).

## Next

- A treadmill mode, where the parent keeps crawling while you're inside
  it, so rings appear at its head and vanish at its tail.
- Portals where the parent lay against itself.
- Climbing back out.
