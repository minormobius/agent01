# Anakata

A puzzle game in four spatial dimensions, at
[games.mino.mobi/anakata/](https://games.mino.mobi/anakata/).

You **walk** in three of them: x and y, with z up. The fourth, **w**, you
can only **see**: turn your sight and one of the walking directions swings
away, replaced by w, and the world rearranges into a slice you couldn't see
before. You can't step in w. You can **hook** along it, as along anything you
can see, and the hook is the only way through. The two directions of w are
*ana* (+w) and *kata* (−w), the names Charles Howard Hinton gave them.

## The rules

The world is a small 4D grid of cells `(x, y, z, w)`, with gravity along −z.

- **Walk** one cell along ±x or ±y.
  - You climb a step one cell high.
  - You push a crate if the cell beyond it is free.
  - Off an edge you fall. Falling out of the bottom of the world loses the
    level (undone for you).
- **Hook** along any axis you can see: ±x, ±y, or ±w once your sight shows
  w. The hook flies straight, at most 6 cells, and catches the first thing in
  its way:
  - an **anchor** pulls *you* to the cell before it;
  - a **crate** comes to *you*, to the cell next to you;
  - anything else comes back empty, and so does an anchor right beside you,
    since the hook needs room to fly.

  Then everything falls. Hooked along w, you land in a slice you could only
  see before; a crate hooked along w lands in the slice next to yours, at the
  spot where you stand.
- **Plates and doors:** a door is solid until every plate in the world has
  you or a crate on it. The plates and doors are often in different slices.
- **Goal:** reach the glowing cell.

- **Ramps** are floor tiles that lean between x (or y) and w, like a
  staircase whose steps go ana instead of up. The rule is one line: **on a
  ramp, the floor continues one slice over.**
  - You walk as usual while there's floor ahead in your slice.
  - When there isn't, and you're standing on a ramp or stepping onto one, the
    step carries you one slice along w as well, the way the ramp leans.
  - So a run of ramp tiles is a diagonal path through the x-w plane, and you
    can walk it both ways.
  - In walking view, a ramp is a lone tile with the next one ghosted beside
    it. With your sight turned to (x, w), it's a plain diagonal staircase.
  - Crates don't take ramps: push one off the end and it falls.

  In the level text, the arrow points the way that goes ana: `>` (+x is ana),
  `<` (−x), `v` (+y), `^` (−y).

A level's state is just where you are and where the crates are, so a
breadth-first search over states is an exact solver (`World.solve`).
`World.solveFlat` is the same search with no way through w at all: no
hooking along it, and the ramps just floor. **Par** is the fewest moves
there are. A view change isn't a move.

## Sight

There are three frames, each two horizontal axes plus z, which is always up:
- (x, y), for walking;
- (x, w), with y hidden;
- (w, y), with x hidden.

Each is a right-handed frame of the x-y-w space. Turning your sight (V) from
one to the next is a rotation of that space, interpolated as a quaternion, so
the slice you see sweeps through 4D on the way and the world morphs.

Arrows always mean what they look like on screen: the game picks whichever
of the frame's four horizontal directions moves the most like the arrow. An
arrow that means w walks nowhere ("you can't step in w"); with the hook
armed (Space or HOOK) it fires along w.

## Drawing

`js/render.js` is one WebGL2 fragment shader that **ray-traces the 4D grid**:
- Every pixel's ray is a straight line in the 3D slice, written in the view
  frame, and so a straight line in 4D. It steps through the grid cell by cell
  with a 4D DDA, the same way a 3D voxel ray does.
- The static cells live in a 3D texture `X × Y × (Z·W)`.
- The crates are 4D boxes and you are a 4D ball, intersected analytically.
- Mid-turn frames are drawn just as exactly: a cube cut by a tilted slice is
  whatever polytope it is.

Readability rules:
- Cells are tinted by which slice they're in, relative to yours: warm for
  ana, cool for kata.
- The slices one cell either side of yours, along the axis you can't see,
  are traced too and laid over faintly.
- The gnomon in the corner shows where x, y, z and w point on screen, with
  the hidden axis as a ring.

## Levels: the onboarding

Twelve hand-built levels in `js/levels.js`, one idea each. They're written as
text: one block per w-slice, one row per y, and the z layers side by side.
The selftest:
- solves every level and pins its par;
- replays each solution;
- **proves** that every level marked `needsW` is impossible without moving
  through w (`solveFlat`, searching every state reachable in 3D).

| # | level | teaches | par | needs w |
|---|---|---|---|---|
| 1 | walk | walking, climbing one step | 5 | |
| 2 | reach | the hook pulls you to an anchor | 1 | |
| 3 | fetch | the hook pulls a crate to you; push, climb | 8 | |
| 4 | glimpse | turn your sight; your first hook along w | 1 | ✓ |
| 5 | ana | a gap in another slice, there and back | 6 | ✓ |
| 6 | kata | the other way along w | 6 | ✓ |
| 7 | elsewhere | a crate brought through w | 15 | ✓ |
| 8 | plate | a plate in another slice opens your doors | 5 | ✓ |
| 9 | relay | all of it: you go ana, the crate comes kata | 17 | ✓ |
| 10 | ramp | walking through w | 5 | ✓ |
| 11 | penrose | walk round a room and arrive four slices ana, beside where you started | 12 | ✓ |
| 12 | downhill | the ramp won't carry a crate; the hook will | 29 | ✓ |

## Rooms made to order

`js/gen.js` builds rooms from a seed in three tiers (easy, medium, hard), from
the parts a 4D puzzle needs:
- **barriers:** a two-high wall or a chasm right across a slice, present in
  some slices and not others, so the way round is through w. Hard rooms
  usually have a second one across y, with its gaps in other slices.
- **anchor posts**, mostly in the outermost slices, so the hook can reach them
  along w from the slices between.
- **steps, crates, a ledge,** and sometimes a **plate** with a **door** across
  one of the barrier's gaps.
- **ramps:** often a diagonal run across the barrier through the x-w plane,
  with the floor carved away beside it so it carries you.
- The **start and goal** go on opposite sides of the barriers.

A room is kept only when the solver proves three things:
- it is **solvable**;
- it is **impossible without moving through w** (`solveFlat`: no hooks along
  w, ramps as plain floor), shown by an exhaustive search of every state
  reachable in 3D;
- its shortest solution moves through w at least the tier's number of times
  (1, 2 or 3), counting hooks along w and steps a ramp carried you. Medium and
  hard rooms must also use the hook along w at least once and twice;
- the solution falls in the tier's band of moves.

Of the first few rooms that pass, the one whose solution does the most wins.
It is scored by moves, w-hooks, ramp steps, crates moved and slices visited.
About two rooms in three end up using a ramp.

Rooms are built in a Web Worker (`js/gen-worker.js`), so the page keeps
drawing while a hard room's searches run (about 2 s). Where module workers
aren't available, they're built on the page.

**The cheap proof.** Most random rooms are hopeless, and proving that by the
full search costs tens of thousands of states. `World.relaxedReach` searches
only where you stand, with every door open, the crates gone, and everything a
crate could do for you granted for free: one could be under you anywhere, so
you never have to fall and can always step up. Anything the real rules allow,
these allow too. So when it says no, the room is unsolvable, after a few
hundred states. Run without w, it is also the proof that a room needs w, with
the full search as the fallback when the cheap one can't decide. The selftest
checks that it never says no where the exact search finds a way. It made hard
hard rooms six times faster. With ramps in the mix, a hard room takes a
median of about 2 s, medium about 40 ms, easy a few ms.

### Links

Every room's address is the room, written into the URL as `?room=CODE`:
- a version letter;
- the four sizes in base 36;
- the cells run-length coded, one byte per run, all of it in base64url. That's
  40 to 220 characters.

`B` codes (now) use 4-bit symbols: cell types 0–9 with the ramps, 14 a crate,
15 you, runs up to 16. `A` codes, the links from before ramps, used 3-bit
symbols. They're still read, so every link ever shared still opens.

A shared link opens that exact room for anyone, for good, **whatever later
changes to the generator do to its seeds**. The ⤴ button copies it, or opens
the share sheet on a phone. Other addresses:

| | |
|---|---|
| `?room=CODE` | that exact room |
| `?daily` or `?daily=YYYY-MM-DD` | today's room (or that day's): a hard room seeded by the date, the same for everyone |
| `?gen=hard.SEED` | the generator's room for that seed (base 36): stable only while `GEN` in gen.js is unchanged |
| `?level=N` | tutorial level N |

A link drops you straight into its room. Without one you land where you last
were. **N** builds a new room in the current tier.

## Next

- **A leaderboard for today's room:** fewest moves, through Orb's board kit.
  Moves can be checked exactly, by replaying the posted solution.
- **Ramps along y** in the generator, and ramp runs that cross each other.
- **w that wraps around:** a periodic fourth dimension, so a ramp loop really
  can go on rising forever. The hook would wrap too.
- **A second tool**, and then a fifth dimension for it.

## Files

| | |
|---|---|
| `js/world.js` | the rules and the solver, no DOM |
| `js/levels.js` | the tutorial levels |
| `js/gen.js` | the generator, its tiers, and the room codes |
| `js/gen-worker.js` | builds rooms off the page's thread |
| `js/render.js` | the 4D ray tracer |
| `js/main.js` | input, the view frames and their turns, the camera, animation, the overlay |
| `test/anakata.selftest.mjs` | the rules on small worlds (ramps included); every level solved, pinned and proved; the codes round-trip and old links still open; generated rooms deterministic, in band and proved to need w; the cheap proof sound |

```bash
node games/anakata/test/anakata.selftest.mjs   # ~12 s
```
