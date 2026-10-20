# Anabasis

A climb in four spatial dimensions, with two gravities, at
[games.mino.mobi/anabasis/](https://games.mino.mobi/anabasis/).

[Anakata](../anakata/) made w a second *sideways*: you walk in x and y, and w
is somewhere you can only see and hook across. Anabasis makes w a second
**down**. Things fall along −z, as anywhere, and also along −w: *kata* is down
too, and *ana* is up. Anabasis (ἀνάβασις) is a going-up.

## The rules

The world is a small 4D grid `(x, y, z, w)`.
- **Two downs.** After every move everything settles, one cell at a time:
  down in z if it can, else kata in w if it can. Crates go first, lowest
  first.
- **Where you stand.** You rest only where you're held from below *and* from
  kata, tucked into a corner of the z–w plane. Walk past the end of the wall
  kata of you and you slip down a slice.
- **Walk** one cell along ±x or ±y. Walk into a block and you climb it,
  whichever way it holds you: up onto it in z, or ana onto it in w. If both
  hold you, you climb in z. A block two high, in z or in w, stops you.
- **Push** a crate if the cell beyond it is free. Crates fall in both
  gravities too, so a crate pushed past the end of a kata wall drops a slice.
- **Falling out.** Off the kata end of the world you fall out, as off the
  bottom. In a room where w wraps round there is no kata end, and with
  nothing to land on you would fall round and round for ever. Both lose the
  level (and are undone for you).
- **Goal:** reach the glowing cell.

There's no hook yet: the only moves are steps. The engine still has
Anakata's hook, and the selftest proves it would save nothing in any level.

## Sight

The view is a 3D slice through the 4D room at the point you stand. x is
always across; the other three directions turn. There are three views:
- **(x, y) across, z up**, with w hidden: the way you'd stand.
- **(x, y) across, w up**, with z hidden: the other gravity drawn as gravity.
  The wall kata of you is the floor under your feet.
- **(x, w) across, z up**, with y hidden: both downs at once, side by side.
  You can see the corner you lean in.

Turning between them (V or Space) is a rotation of the y-z-w space,
interpolated as a quaternion, so the world morphs on the way. Arrows always
mean what they look like on screen; an arrow that would mean w says you
can't step in w, only climb it.

The drawing is Anakata's ray tracer (`../anakata/js/render.js`). It now takes
`Ez`, the direction drawn up the screen, so it can draw w as up. It also
takes two cutaways:
- the **ceiling**: nothing more than two cells above you is drawn;
- the **tunnel**: nothing above you on the line from you to the camera.

In the wrapped room, w drawn upward is a tower that repeats for ever, and
without the cutaways the camera would be inside it.

## Levels

Eight levels in `js/levels.js`, in Anakata's text format: one block per
w-slice (w = 0 first), a row per y, the z layers side by side. Slice w = 0 is
the kata end of the world, the way z = 0 is the bottom, so it's usually
solid ground in w.

| # | level | teaches | par | one down? |
|---|---|---|---|---|
| 1 | held | two downs; turn your sight to see the wall kata as a floor | 5 | possible |
| 2 | slip | where the kata wall ends, you slip a slice | 6 | impossible |
| 3 | ledge | too tall in z: climb it ana | 5 | impossible |
| 4 | stair | up in z, then up in w, twice | 6 | impossible |
| 5 | boost | two slices high in w: push a crate against it and climb the crate | 6 | impossible |
| 6 | ascending | w wraps: a staircase round the room that climbs for ever, to a goal one slice *below* you | 11 | impossible (and impossible without the wrap) |
| 7 | hoist | a crate as a step in either gravity | 13 | impossible (and without its crate) |
| 8 | cairn | two crates in two slices | 19 | impossible (and without its crates) |

**Ascending** is a Penrose staircase made honest by a wrapped w. Each cell of
the loop round the room has one slice it's held in. The steps go up one slice
at a time, seven times in eleven steps. The goal is in the wall right in
front of you, one slice down, and the wall is two high, so you can't step
down into it. The only way there is up: seven slices ana in a world four
slices round is one slice kata.

**Hoist** and **cairn** came from a random search over rooms where every
(x, y) column is a staircase in the z–w plane (solid wherever w is at most
some height that falls as z rises). Those two were kept for being small and
long to solve.

The selftest:
- solves every level walking, pins its par and replays it;
- proves the hook would save nothing;
- proves, by exhaustive search, the ones marked `needsDown` impossible with
  z the only down;
- proves the wrapped one impossible without its wrap, and the crate levels
  impossible without their crates;
- round-trips every level through its room code.

## Links

| | |
|---|---|
| `?level=N` | level N |
| `?room=CODE` | a room written into the link, in Anakata's room codes: `D` for a room with two downs, `E` with the wrap too |

## The engine

Both games run on Anakata's engine, so there's one engine for two cabinets:

| | |
|---|---|
| `../anakata/js/world.js` | the rules and the exact solver. `gravW` turns on the second gravity: `settle`, `resting`, `climb` |
| `../anakata/js/gen.js` | room codes (and Anakata's generator) |
| `../anakata/js/render.js` | the 4D ray tracer |
| `js/levels.js` | Anabasis's levels |
| `js/main.js` | input, the views and their turns, the camera, animation, the axes |
| `test/anabasis.selftest.mjs` | the two downs on small worlds, and every level solved and proved |

```bash
node games/anabasis/test/anabasis.selftest.mjs   # < 1 s
node games/anakata/test/anakata.selftest.mjs     # the shared engine, the other way (~12 s)
```

## Next

- **A generator**, along the lines of the search that found hoist and cairn,
  with Anakata's room codes for links. The cheap proof
  (`World.relaxedReach`) isn't written for two gravities yet, and says
  "maybe" to everything.
- **Ramps** as real slopes, now that w is down.
- **The hook** back, for anchors you climb to.
