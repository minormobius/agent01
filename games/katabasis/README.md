# KATABASIS

A cave in four dimensions: a glistening fae grotto, lit by crystals whose
light shines in all four. You walk it, seeing the 3D slice of it you're
standing in, and find the goal crystal. There are two verbs. **Turn**: you turn in a plane
that leans into w, so turning round swings w into the slice you see. **Flip**:
pick a wall and it becomes your floor. The walls you can pick are ahead,
behind, left and right, or **ana** and **kata**, the two you can't see.

It's the third of the 4D climbs, after Anakata and Anabasis. Katabasis is the
descent. Its tilt into w is continuous where it can be and quantized where it
must be: you face any way at all, and gravity falls along the grid.

## Turning

Up is always one of the cave's grid directions. The other three of your
directions, right, forward and w, form an ordinary 3D space, and your view
turns freely in it. Two controls turn it:

- **Turn** (the mouse, or dragging sideways) turns forward toward right in a
  plane tilted into w by the **lean** you choose on the start screen: off (0°:
  turning is only turning, and w moves when you twist), gentle (20°, the
  default) or full (45°). Turning by φ moves your w; a half turn moves it
  by twice the tilt, so at 45° turning round swaps w for a direction you can
  see. Look back the way you came and that passage has left the slice, and one
  that was hidden in w is there instead.
- **Twist** turns right toward w, with forward still: hold the left or right
  mouse button (once the mouse is grabbed), roll the wheel a notch at a time,
  hold Z or C, or the pad's twist buttons. Together with turning it reaches
  every way of facing.
- **Square up** (X, or ▣ on the pad) turns your view smoothly back onto the
  grid directions it's nearest, w along an axis again. It's the cure for
  being lost.

The HUD's `w` readout names the grid direction your w is nearest and how far
it leans off it. `?tilt=30` sets any lean: a half turn then moves w by 60°.

Floors stay exact whichever way you face, because gravity falls along the
grid. What you see at a slant is the cave's voxels cut on a slant: the floor is
flat, and the walls are prisms on triangles, pentagons and hexagons.

**Why the rules don't notice.** Your body is 2 voxels across in each of the
three directions that aren't up, so it's a cube in that space. Its box is the
same however you face, so facing changes what you see, never what you can do.
A state is your box and your up. Walking is a step along any of the three,
w included.

## The flip

A flip makes a wall your floor. Each flip is named by the wall, relative to
the way you face: the cave's grid directions nearest your forward, right and w
are found together, so they're three different directions, and "ahead" is the
wall nearest the way you're looking. You tip onto it: a quarter turn in the
plane of your old up and your new one, which carries your whole view with it.

The rules (`cave.js`) define the flips on a whole orientation, as double
rotations at full coupling: the same turn as a PLATEAU manoeuvre with the
coupling at 1, turning one plane of your body by 90° and the plane
perpendicular to it by 90° too. Only the up they give you counts for the rules,
and from any orientation the six flips give the six directions perpendicular to
your up:

| flip | turns | and with it |
|---|---|---|
| ahead, behind | up ↔ forward | right ↔ w |
| right, left | up ↔ right | forward ↔ w |
| kata, ana | up ↔ w | forward ↔ right |

**Gravity follows your feet.** After a flip, your up is another direction of
the cave. Walls become floors, and the ceiling is two flips away. A flip onto
a wall in w (kata, ana, or ahead once you've turned to face it) makes w your
up and down.

**Why it's quantized.** A quarter turn maps the cave's grid onto itself, so
wherever you land, your slice is the grid again: cubes and nothing else. Every
floor is exact, and there are only finitely many ways to be turned. The six
flips reach **16 orientations** from upright, found by closure in `cave.js`.
They can make any of the 8 directions of the cave your up. Everything else is
continuous: you walk freely and face any way, and only gravity has detents.

**Room to flip.** You hop one voxel and turn about your centre. The 4D ball
round your centre that holds your body however it's turned must be clear of
rock. Its radius is half the body's diagonal, √7 ≈ 2.65 voxels, so you need a
space about 5.3 voxels across in every direction, w included. The game and the
solver use exactly this rule.

## Scale

A voxel is a quarter of your height. Your body is 2 × 4 × 2 × 2 voxels along
your right, up, forward and w. The caves are 20–30 voxels across, so they feel
like caverns, with weathered walls. That comes from `Cave.erode`: smooth 4D
noise wears rock away where it touches air. It only ever turns rock into air,
and the levels are re-proved after it.

## The rules and the solver (`js/cave.js`)

A state is the corner of your body's box and your orientation (only its up
matters). The moves are:

- **step:** ±R, ±F or ±N by one voxel, stepping up a voxel if that's all that's in
  the way and there's headroom, then falling to the ground;
- **flip:** as above, then falling toward your new feet.

`solve` is a breadth-first search over moves. `fewestFlips` is a 0-1 search
in which steps cost nothing and flips cost one; it runs on `explore`, a layered
search over (box, up): everything reachable on foot, then everything one flip
from that, and so on. `solve` with `steps: 4` walks only in the slice you start
in, and `fewestFlips` with `noW` never stands on a wall in w; those are how a
level proves it needs turning, or w. Par is in flips, because walking is
continuous in the game and its steps aren't a count anyone makes.

The search is about 10 µs a state. The rules only ask about up, so it searches
8 ups rather than 16 orientations (`CANON`). The hop and the flip ball are the
same for all six flips from a state, so they're tested once (`flipsFrom`).
The flip ball's centre is always a whole voxel, so its voxels are a list
made once. Box tests run on raw indices without allocating.

## The body (`js/body.js`)

The body is the game's continuous movement:

- a box sliding flush against voxels, with the one-voxel step-up, walking
  any way but up;
- gravity toward your feet;
- the flip, which snaps you to the whole-voxel position you're nearest and asks
  `flipFrom` (the solver's own rule) whether you may and where you'll land;
- the view frame: `turn`, `twist`, the flip's `tip`, `snap` (the grid
  directions nearest your forward, right and w) and `tidy` (rounding drift out:
  up exactly its axis, the rest orthonormal to it).

So you can't flip anywhere the solver couldn't. The selftest drives the body
along every level's solver solution and requires it to stand where the solver
says after every move and to reach the crystal.

## The renderer (`js/render.js`)

One fragment shader walks each ray voxel by voxel through the 4D grid: a 4D
DDA, since a line in your slice is a line in 4D. The cave sits in a 2D integer
texture, (x + X z, y + Y w), each texel the voxel's kind (air, rock, crystal)
with its decoration packed above it.

- **Light, in four dimensions.** The grotto is lit by point lights: crystal
  clusters grown on the walls, in the fae colours, and the goal crystal, the
  brightest. They are 4D points, so the light from one spreads over a
  3-sphere and falls off as 1/r³, not 1/r² (softened near the source). For
  each surface point the shader sends a shadow ray to every light through the
  same 4D grid. Rock that is out of your slice, in w, still casts shadows into
  it, so a pool of light can have its edge cut by a wall you can't see. The 8
  lights nearest you are traced each frame.
- **The lights themselves.** You see a light as the cross-section of a small
  4D ball of glow. One in your slice is a bright core. One a little off it in
  w is smaller and fainter, and one further off is only a haze, though it
  still lights the walls round it.
- **Surfaces.** The rock is violet-grey and wet: floors (along your up) carry a
  glossier sheen, and mica in the rock catches the light in glints. Gemstone
  grows round each light and takes its colour, and patches of moss glow faintly
  on their own. Corners are darkened by the rock round them, and voxel seams
  are drawn so the scale reads. A lantern at your eye and a dim violet haze
  fill in.
- **Mid-flip** your view tips through every angle in between, and turning
  turns it continuously, so the cave's grain shears as the slice swings.

**The grotto (`js/grotto.js`)** decides where the lights, gemstone and moss go,
from the cave and a seed. It is render-only: it never changes a voxel's kind,
so the solver's cave is the cave and every par stands. The selftest checks the
lights are in open air, at least 5 voxels apart, with the crystal among them,
that decoration lies only on rock, and that the cave is unchanged.

## Levels (`js/levels.js`)

Caves are recipes of 4D boxes, balls and tubes, then weathered.

| | cave | par | about |
|---|---|---|---|
| 1 | down | 0 | walking, ledges |
| 2 | round | 0 | a wall that stops short in w: turn till w swings into view, and walk round. Proved impossible walking only in the slice you start in |
| 3 | wall | 1 | a crystal high on the far wall: flip ahead |
| 4 | kata | 1 | a crystal in the middle of the kata wall: turn and twist to face it and flip ahead, or flip kata (turning alone leans your forward at most 45° into w). Proved impossible without a wall in w under you |
| 5 | ceiling | 2 | no one flip puts the ceiling under you |
| 6 | shaft | 1 | a crystal up a shaft too narrow to flip in, flush with the ana wall: climb it on that wall. Without a wall in w it takes 2 flips (via the ceiling) |

## Made caves (`js/gen.js`)

**Made · easy / medium / hard** carves a cave with par 1, 2 or 3. **Today's
cave** is a hard one seeded by the date, the same for everyone. The address bar
names the cave you're in (`?gen=hard.1l8vmrm`, `?daily=2026-10-23`,
`?level=4`), so a link is the cave.

A cave is carved from a seed:

- 3 to 5 rooms, and passages between them wide enough to walk;
- shafts up from a ceiling, flush with one wall, too narrow to flip in;
- pillars standing on the floors;
- for hard caves, and some medium ones, a **loft**. That's a sealed room above
  the rest, whose only way in is a hole 3 voxels square in a ceiling below. A
  body needs 4 voxels across its up to stand in the hole, so nobody can climb
  it on a wall. You fall up it, which is two flips in.

The crystal is then **placed, not hoped for**:

1. One layered search (`reach`) finds, for every voxel, the fewest flips after
   which your body can touch it.
2. The crystal goes on a voxel that takes exactly the tier's par, on the floor
   of the up that reaches it.
3. Nothing within a voxel of it, diagonals included, can be reachable sooner.
   A body straddling a ledge between two whole-voxel places touches voxels at
   most one away from a place the solver knows, so this margin keeps it from
   reaching the crystal early.

Then the solver proves the finished cave again. Half the caves are asked to
need a wall in w (for their first 12 tries; after that any cave will do), and
say so in their line. Without the loft, hard caves never come out: in an open
cave any surface is within two flips, since one reaches any wall and two the
ceiling.

Caves are carved in a worker (`js/gen-worker.js`) and take about a second. The
noise is integer hashing and polynomials with no transcendental functions, so a
seed makes the same cave in every browser.

## The guide (`js/guide.js`)

The level's line is the strategy: where the crystal is, and how many flips.
The guide (✦, or H) is the tactics, worked out afresh from wherever you
stand:

- **how many flips are left from here**, which isn't always par minus the
  flips you've made;
- **a wisp**, a gold light at body height where the next flip of a
  fewest-flips route is made. It's a 4D point lit like the grotto's crystals,
  so off in w it's smaller and dimmer, and the line says how far it is, which
  way, and how far off in w;
- **the flip to make**, once you stand somewhere a right one can be made:
  "Flip KATA (Q) here", with its pad button glowing. The name follows the way
  you face, because the guide answers with the wall to put under you and the
  page names it with your own frame.

`advise(cave, c, o)` gives the fewest flips left (`explore`, traced), the
route's next flip (`at`, `atUp`, `to`), and `here`: the ups you could flip to
from this very spot and still be on a fewest-flips route (one more search from
each landing). It runs in `js/guide-worker.js` each time you stand somewhere
new, whole and on the ground, in up to about a second. The wisp stays up
meanwhile, and "flip here" waits for an answer about exactly where you are.

## Controls

- **Desktop:** WASD walk; the mouse turns and looks (click to grab it); hold
  the left or right button, roll the wheel, or hold Z or C to twist; X squares
  up; the arrows flip ahead, behind, left and right; Q flips kata and E ana; H
  toggles the guide; R restarts; space (or enter, or N) goes on to the next
  cave once you've found the crystal.
- **Phone:** the stick walks, drag to turn and look, and the pad flips, twists
  and squares up (▣). ✦ in the corner is the guide.

## Checks

```bash
node games/katabasis/test/katabasis.selftest.mjs   # ~27 s
```

The selftest checks that:

- the flips are rotations that turn every axis to a perpendicular one;
- each flip lands you on its named wall from every orientation;
- every direction can become up;
- the flip ball holds the body;
- the ball test is right on both sides of the radius;
- turning and twisting keep the view a frame and never move up, a half turn
  swings w by twice the tilt, and a whole turn comes back;
- from 200 random ways of facing, the six flips name six different walls, and
  the body and the view both land with the named one under them;
- every level's par is the fewest flips, the flipping levels can't be done on
  foot, the turning level can't be walked in the starting slice, and the w
  levels need a wall in w;
- the game's body walks a par solution of every level into the crystal,
  standing where the solver says with the up it says after every move;
- made caves: the same seed makes the same cave, par is the tier's and the
  fewest flips, none is walkable, the ones that say they need a wall in w do,
  nothing near the crystal is reachable sooner, and the body walks a par
  solution of one cave per tier;
- the guide counts par from the start of every level and one made cave per
  tier, and at the spot it names, the flip it names is one of the right ones
  and leaves one fewer, all the way down;
- there's no flipping in a closet;
- the grotto's lights hang in open air and leave the cave unchanged.

## Next

- **The 24-cell world.** Its 24 quaternion turns (60°, 90°, 120°) preserve that
  lattice exactly, which allows 288 orientations and finer detents.
- **Kelvin's five-fold turns.** Those are double rotations of 144° and 72°, a
  coupling of exactly ½.
