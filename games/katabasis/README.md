# KATABASIS

A cave in four dimensions. You walk it by lamplight, seeing the 3D slice of it
you're standing in, and find the crystal. The verb is the **flip**: pick a wall
and it becomes your floor. The walls you can pick are ahead, behind, left and
right, or **ana** and **kata**, the two you can't see.

It's the third of the 4D climbs, after Anakata and Anabasis. Katabasis is the
descent. It is also PLATEAU's coupled turn, quantized.

## The flip

A flip is a double rotation at full coupling, the same turn as a PLATEAU
manoeuvre with the coupling at 1. It turns one plane of your body by 90° and
the plane perpendicular to it by 90° too. Each flip is named by what becomes
your floor:

| flip | turns | and with it |
|---|---|---|
| ahead, behind | up ↔ forward | right ↔ w |
| right, left | up ↔ right | forward ↔ w |
| kata, ana | up ↔ w | forward ↔ right |

At full coupling every direction turns by the same angle, so a flip moves all
four of your axes. Two things follow.

- **Gravity follows your feet.** After a flip, your up is another direction of
  the cave. Walls become floors, and the ceiling is two flips away.
- **One of the directions you could see swaps with w.** The cave you see after
  a flip is a different 3D section of it. Things that were hidden in w can be
  in front of you, or under you.

**Why it's quantized.** A quarter turn maps the cave's grid onto itself, so
wherever you land, your slice is the grid again: cubes and nothing else. Every
floor is exact, and there are only finitely many ways to be turned. The six
flips reach **16 orientations** from upright, found by closure in `cave.js`.
They can make any of the 8 directions of the cave your up. Movement stays
continuous: you walk freely, and only the turns have detents.

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

A state is the corner of your body's box and your orientation. The moves are:

- **step:** ±R or ±F by one voxel, stepping up a voxel if that's all that's in
  the way and there's headroom, then falling to the ground;
- **flip:** as above, then falling toward your new feet.

`solve` is a breadth-first search over moves. `fewestFlips` is a 0-1 search
in which steps cost nothing and flips cost one. Par is in flips, because
walking is continuous in the game and its steps aren't a count anyone makes.

## The body (`js/body.js`)

The body is the game's continuous movement:

- a box sliding flush against voxels, with the one-voxel step-up;
- gravity toward your feet;
- the flip, which snaps you to the whole-voxel position you're nearest and asks
  `flipFrom` (the solver's own rule) whether you may and where you'll land.

So you can't flip anywhere the solver couldn't. The selftest drives the body
along every level's solver solution and requires it to stand where the solver
says after every move and to reach the crystal.

## The renderer (`js/render.js`)

One fragment shader walks each ray voxel by voxel through the 4D grid: a 4D
DDA, since a line in your slice is a line in 4D. The cave sits in a 2D integer
texture, (x + X z, y + Y w).

- **Light.** A lantern at your eye, and a glow from overhead along your own up,
  so floors read lighter than ceilings and you can tell which way you'll fall.
- **Surfaces.** Corners are darkened by the rock round them, faces tinted by
  their direction, and voxel seams drawn so the scale reads.
- **The crystal** glows, more the nearer you are, and the ray goes on through
  it.
- **Mid-flip** the frame is turned through 4D at every angle in between, so the
  cave's grain shears as the slice swings.

## Levels (`js/levels.js`)

Caves are recipes of 4D boxes, balls and tubes, then weathered.

| | cave | par | about |
|---|---|---|---|
| 1 | down | 0 | walking, ledges |
| 2 | wall | 1 | a crystal high on the far wall: flip ahead |
| 3 | kata | 1 | a crystal down in w, in a pit under the room's kata wall |
| 4 | ceiling | 2 | no one flip puts the ceiling under you |
| 5 | under | 2 | a wall that stops short in w: go round it there |

## Controls

- **Desktop:** WASD walk, the mouse looks (click to grab it), the arrows flip
  ahead, behind, left and right, Q flips kata and E ana, R restarts.
- **Phone:** the stick walks, drag to look, and the pad flips.

## Checks

```bash
node games/katabasis/test/katabasis.selftest.mjs   # ~12 s
```

The selftest checks that:

- the flips are rotations that turn every axis to a perpendicular one;
- each flip lands you on its named wall from every orientation;
- every direction can become up;
- the flip ball holds the body;
- the ball test is right on both sides of the radius;
- every level's par is the fewest flips, and the flipping levels can't be done
  on foot;
- the body follows the solver's solution exactly;
- there's no flipping in a closet.

## Next

- **A cave generator, with a daily cave:** chambers and passages carved round a
  route the solver proves needs its flips.
- **The 24-cell world.** Its 24 quaternion turns (60°, 90°, 120°) preserve that
  lattice exactly, which allows 288 orientations and finer detents.
- **Kelvin's five-fold turns.** Those are double rotations of 144° and 72°, a
  coupling of exactly ½.
