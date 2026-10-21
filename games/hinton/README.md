# Hinton

Four-dimensional rooms in first person, at
[games.mino.mobi/hinton/](https://games.mino.mobi/hinton/). Named for Charles
Howard Hinton, who named the two ways along the fourth dimension *ana* and
*kata*.

You're inside the room, looking out from behind your own eyes at a
three-dimensional slice of it. Turn your **sight** and the slice swings
through **w**, and the room you're standing in becomes a different one.

## Two lanes, one engine

The rooms come from the two puzzle games on the same engine, unchanged: the
same levels, the same generators, the same daily rooms, the same pars.

| lane | w is | you cross it by |
|---|---|---|
| [Anakata](../anakata/) | a direction you can see but not walk | the hook, along whatever axis you look straight down; ramps |
| [Anabasis](../anabasis/) | a second down | falling kata (free); ramps, the only way ana |

A room's link carries its lane (Anakata's `B`/`C` codes, Anabasis's `D`/`E`),
so any room from either game opens here too.

## Moving: continuous, but every move is the rules'

`js/walker.js` turns free movement into the games' discrete moves:
- **Within a cell** you move freely in x and y. You're a point with a radius
  `R` = 0.22, held at the centre of your cell in z and w.
- **When your edge reaches the next cell**, it asks the world what a step
  that way does (`World.act`):
  - **nothing:** a wall stops you `R` short of it;
  - **a plain step, a push, a fall or a slip:** it happens when your centre
    crosses. Then gravity takes you down (and kata, where w is a down) at its
    own pace. You can move about while you land, but not leave your cell;
  - **a climb or a ramp step:** it happens at once. You rise, or lean through
    w, and glide over.
- **The hook** is one action, and then you're pulled along its line.

So the walker makes exactly one of the rules' moves per cell crossed. Every
par and every proof about a room holds in first person too. The selftest
checks it by **walking every level of both lanes** along the solver's
solution, steering from wherever you happen to be in your cell. Each one
must reach the goal in par, its state matching the solver's after every
move.

## Seeing

- **The blocks** are drawn for a camera up close (the renderer's
  `style: 1`, which only Hinton uses). Each face is shaded by which way it
  looks, top brightest, as block worlds do. A grain of 8 texels per cell
  edge gives one shade per texel, and crates get planks. Top faces have a
  bevel, and an outline stays a pixel or two wide at any distance.
- **Resolution adapts.** It starts sharp (about 0.8× the device's pixels on
  a phone) and steps down when frames run slow, or back up when they run
  fast, at most twice a second. `?res=1.5` fixes it, for screenshots or a
  slow machine.
- **Your eye** sits just above the centre of your cell: you're one cell
  tall. The view is Anakata's 4D ray tracer (`../anakata/js/render.js`), with
  the camera behind your eyes. Your own ball isn't drawn, and the slices
  either side of yours are traced from a little way out, since the slice
  kata of you is solid right where you stand.
- **Turning your sight** rotates the frame between the lane's three views,
  as in its own game:
  - Anakata: x·y, x·w, w·y, with z always up;
  - Anabasis: z up, w up (the kata wall becomes the floor under your feet),
    x·w across.

  Your look (yaw and pitch) stays within the slice.
- **Walking** goes along whatever is across in the slice, but only in x and
  y. Where the view puts w across, walking that way does nothing: in
  Anakata only the hook crosses w, and in Anabasis only a ramp lifts you.
- **The w strip**, at the left, shows the column of slices where you stand
  and the one ahead of you, with ana at the top. Each cell shows what's in
  it, with a line for the floor under it: warm for a ramp, missing over a
  drop.
- **The hook** (Anakata) fires along whichever of ±x ±y ±w you're looking
  most nearly down. To hook along w, turn your sight until w is across, then
  look along it.

## Controls

| | desktop | phone |
|---|---|---|
| walk | WASD or arrows | the stick: drawn at the bottom left, it jumps to wherever your thumb lands on the left half |
| look | click, then the mouse | drag the right of the screen |
| hook | click again, or Space | HOOK |
| sight | V | SIGHT |
| undo, restart, levels, new room | Z, R, L, N | ↶ ⟲⟲ ☰ |

## Links

| | |
|---|---|
| `?lane=anakata&level=N` | a lane's level N |
| `?room=CODE` | that exact room, from either game |
| `?lane=anabasis&daily` | that lane's room for today: the same room as its own game's daily |
| `?lane=anakata&gen=hard.SEED` | the lane's generator's room for that seed |

## Next

- **w as a continuum.** Your w is already a real number while you fall or
  glide through it. Next are ramps as true 4D wedges you walk up smoothly,
  then blocks with sub-cell extents in w (slabs in the fourth dimension),
  whose cross-sections appear and vanish as you move through them.
- **Lighting** that reads depth better in first person, and a higher eye for
  the bigger rooms.
- **Placing blocks** in other slices, as a lane of its own.

## Files

| | |
|---|---|
| `js/walker.js` | continuous movement over the discrete world, no DOM |
| `js/main.js` | the lanes and their frames, the first-person camera, input, the overlay |
| `test/hinton.selftest.mjs` | every level of both lanes walked at par; walls, landings |

```bash
node games/hinton/test/hinton.selftest.mjs   # a few seconds
```
