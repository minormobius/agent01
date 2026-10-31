# Anabasis

A climb in four spatial dimensions, with two gravities, at
[games.mino.mobi/anabasis/](https://games.mino.mobi/anabasis/).

[Anakata](../anakata/) made w a second *sideways*: you walk in x and y, and w
is somewhere you can only see and hook across. Anabasis makes w a second
**down**. Things fall along −z, as anywhere, and also along −w: *kata* is down
too, and *ana* is up. Anabasis (ἀνάβασις) is a going-up.

## The rules

The world is a small 4D grid `(x, y, z, w)`. The thesis: **gravity in w
pulls you through the slices, kata, for free; nothing in the physical world
lifts you back.** Only a ramp takes you ana.

- **Two downs.** After every move everything settles, one cell at a time:
  down in z if it can, else kata in w if it can. Crates go first, lowest
  first.
- **Where you stand.** You rest only where you're held from below *and* from
  kata: by a block in the slice kata of you, or by the ramp under your feet.
  Walk past the end of the block kata of you and you slip down a slice.
- **Walk** one cell along ±x or ±y, and climb a step one high in z, as
  ever. A block in your slice is in your way. You can't step round it
  through w, however clear the slice ana of you is.
- **Ramps** (Anakata's, `> < v ^`) are the way ana. They're floor tiles
  that lean between x (or y) and w. On a ramp, the floor continues one slice
  over: walk off one where your slice has no floor ahead, or a wall ahead,
  and the step carries you a slice along w the way it leans, round whatever
  was in your way. A wall you go round like that is kata of you once you're
  past it, so it holds you up: it seems to melt as you step into it,
  because you stepped round it. Walk back the other way and the ramp takes
  you back down. **A ramp holds you against w's gravity**, the way a step
  holds you against z's, so a run of ramps is a staircase over nothing.
- **Push** a crate if the cell beyond it is free. Crates fall kata too, so a
  crate pushed past the end of a block drops a slice, or down a shaft
  through several, and fills whatever gap it lands in.
- **Falling out.** Off the kata end of the world you fall out, as off the
  bottom. In a room where w wraps round there is no kata end, and with
  nothing to land on you would fall round and round for ever. Both lose the
  level (and are undone for you).
- **Goal:** reach the glowing cell.

There's no hook yet, so the only moves are steps. The engine still has
Anakata's hook, and the selftest proves it would save nothing in any level.
Under w's gravity, a hook straight ana wouldn't lift you anyway: it pulls
you up a slice, and you fall straight back down the way it flew.

**An earlier version** let you climb a block one high in w the way you climb
one in z: walk into it and you went up onto it, ana. Drawn with w hidden,
that looked like walking into walls that dissolved. It also broke the
idea: the physical world shouldn't lift you through w. Now only ramps do.

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
can't step in w: gravity takes you kata, and only a ramp takes you ana.

The drawing is Anakata's ray tracer (`../anakata/js/render.js`). It now takes
`Ez`, the direction drawn up the screen, so it can draw w as up. It also
takes two cutaways:
- the **ceiling**: nothing more than two cells above you is drawn;
- the **tunnel**: nothing above you on the line from you to the camera.

In the wrapped room, w drawn upward is a tower that repeats for ever, and
without the cutaways the camera would be inside it.

With w hidden (the first view), a ramp step crossfades the next slice in as
you go: a wall you're going round fades as you pass it. The slice kata of
you always has something right where you stand (it's what holds you), and
its ghost isn't drawn round you. The **height** readout shows z and w, so
moving through w shows up whatever you're looking at.

## Levels

Seven levels in `js/levels.js`, in Anakata's text format: one block per
w-slice (w = 0 first), a row per y, the z layers side by side. Slice w = 0
is the kata end of the world, the way z = 0 is the bottom, so it's usually
solid ground in w.

| # | level | teaches | par | proved impossible without |
|---|---|---|---|---|
| 1 | held | two downs; turn your sight to see the block kata of you as a floor | 5 | |
| 2 | slip | where the block kata of you ends, you slip a slice | 6 | w's gravity |
| 3 | around | a wall in your slice; a ramp carries you round it, ana | 5 | the ramp |
| 4 | stair | ramps hold you up over nothing | 4 | the ramps |
| 5 | bridge | a gap kata of you; push a crate in to fill it | 6 | the crate |
| 6 | plumb | up a ramp to the crate, then drop it two slices down a shaft into the gap | 10 | the ramps, the crate |
| 7 | ascending | w wraps: ramps round the room that climb for ever, to a goal one slice *below* you | 11 | the ramps, the wrap |

**Ascending** is a Penrose staircase made honest by a wrapped w. The ramps
round the room rise one slice at a time, seven times in eleven steps, each
over a drop in the slice below. The goal is just past the wall beside you,
one slice down. Nothing takes you down through a wall, so the only way is
up: seven slices ana in a world four slices round is one slice kata.

The selftest:
- solves every level walking, pins its par and replays it;
- proves the hook would save nothing;
- proves each level impossible, by exhaustive search, without what it's
  about: w's gravity (`needsDown`), its ramps (`needsRamp`), its crates,
  its wrap;
- round-trips every level through its room code.

## Rooms made to order

`js/gen.js` builds rooms from a seed, in three tiers (easy, medium, hard).
Random terrain hardly ever has a way up that connects, so a room is built
round its climb:
- **The spine:** a winding path from start to goal that never touches
  itself, so nothing but its own heights joins it. It's given a height
  profile in w: rises (each one a ramp), drops (each one a slip), and on the
  harder tiers **dips**. A dip is a cell sunk a slice below the ones either
  side of it, with no ramp out, so only a crate pushed into it gets you
  across. It ends higher than it starts.
- **Around it,** every other column takes its height from the spine cells
  beside it:
  - mostly a slice above all of them: a wall in your way;
  - sometimes below them all: a hole in w that you slip into and can't
    climb out of;
  - sometimes level with its nearest: room to move a crate in, and maybe a
    shortcut, which the search finds and the band of moves judges;
  - now and then solid right through, or a drop through the floor.
- **Crates:** one for each dip, either just before it in line (push it in as
  you go) or somewhere else on the ground, to be fetched. On the harder tiers
  there are more on the ground besides.

A room is kept only when the solver proves that it is:
- **solvable walking**, the only moves the page has;
- **in the tier's band of moves**: easy 5–12, medium 9–20, hard 13–36;
- **impossible without its ramps**, by an exhaustive search with ramps as
  plain floor;
- **impossible without its crates**, for most medium and nearly all hard
  rooms. This is also an exhaustive search, and the hint says when it holds.

Its shortest solution must also take the tier's number of ramps up and
slips down (1 and 1, 2 and 2, 3 and 3). Of the first few rooms that pass,
the one whose solution does the most wins: it is scored by moves, ramps,
slips, crate pushes and heights visited. Rooms build in a Web Worker
(`js/gen-worker.js`), in a few milliseconds to a few tens.

A made room opens with **w drawn up** (z hidden). Its terraces then read as
a landscape: higher ground in the way, holes below, ramps up the edges. The
tutorial levels open the way you'd stand.

## Links

Every room's address is the room, in Anakata's room codes (`D` for a room
with two downs, `E` with the wrap too). A shared link opens that exact room
for anyone, for good, whatever later changes to the generator do to its
seeds.

| | |
|---|---|
| `?level=N` | level N |
| `?room=CODE` | that exact room |
| `?daily` or `?daily=YYYY-MM-DD` | today's room (or that day's): a hard room seeded by the date, the same for everyone |
| `?gen=hard.SEED` | the generator's room for that seed (base 36): stable only while `GEN` in `js/gen.js` is unchanged |

**N** builds a new room in the current tier.

## The engine

Both games run on Anakata's engine, so there's one engine for two cabinets:

| | |
|---|---|
| `../anakata/js/world.js` | the rules and the exact solver. `gravW` turns on the second gravity: `settle`, `resting`, `onRamp` |
| `../anakata/js/gen.js` | room codes (and Anakata's generator) |
| `../anakata/js/render.js` | the 4D ray tracer |
| `js/levels.js` | Anabasis's levels |
| `js/gen.js` | the generator: the spine, the terraces round it, the crates, the proofs |
| `js/gen-worker.js` | builds rooms off the page's thread |
| `js/main.js` | input, the views and their turns, the camera, animation, the axes |
| `test/anabasis.selftest.mjs` | the two downs on small worlds; every level solved and proved; generated rooms deterministic, in band, proved, and opened from their codes |

```bash
node games/anabasis/test/anabasis.selftest.mjs   # < 1 s
node games/anakata/test/anakata.selftest.mjs     # the shared engine, the other way (~12 s)
```

## Next

- **Crate puzzles with more to them.** Most kept rooms still put a dip's
  crate just before it, so pushing it in is part of walking the spine. A
  crate fetched from elsewhere usually makes a room unsolvable; side shelves
  shaped for moving crates round would let more of those through.
- **A leaderboard for today's room**: fewest moves, checked by replaying.
- **The hook** back. Straight ana it can't lift you (you'd fall back down
  its line), but it can still fetch a crate from the slice ana of you, which
  then rests on your head in w until you step away.
