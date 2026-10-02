# Strand — `/strand/`

Flow on a sphere. Join each pair of coloured ends with a strand. Strands
never share a cell, and together they must paint every cell. Pure static,
like the rest of `games/`: script tags, no build. It borrows `/orb/`'s mesh
code (`../orb/js/sphere.js`) for the Voronoi boards.

## Controls, and why they're shaped this way

A sphere hides half of itself and the finger that draws is also the finger
that turns, so the controls separate those jobs:

- **One finger on an end or a strand draws.** Anywhere else it turns the
  sphere, unless the **view lock** (🔒, or `l`) is on, in which case one
  finger only ever draws.
- **Two fingers always turn (drag) and zoom (pinch)**, locked or not, so the
  lock costs nothing.
- **Seeing the whole sphere.** The inset (top right) shows the whole sphere
  in a Lambert azimuthal equal-area projection, centred where you're
  looking. Areas are true and there's no seam except the single point
  directly behind; the ring marks the half the globe shows. Tap the inset
  to turn there. The **whole** view (`v`) puts that projection on the main
  canvas, where you can play on all of it at once. A small cap directly
  behind is left blank rather than smeared round the rim, and any link the
  projection stretches past a few cell widths isn't drawn, since that's
  back-of-sphere wrap-around.
- Drawing near the globe's rim (unlocked) turns the sphere under your
  finger, so a strand can be carried round the back.
- A fast swipe that skips cells still lands: the gap is filled along the
  shortest free route, up to 3 cells.

## Strands are stable from both ends

A colour isn't one directed path but a set of **fragments** (`js/play.js`):

- Each end owns a half. Drawing from end B grows B's half and never touches
  A's.
- The halves join when one steps onto the other, anywhere along it.
- Driving through another colour takes **only the cell you cross**. The
  pieces either side stay painted; one that is no longer attached to an end
  is drawn dashed as a **loose piece**. Step onto it to rejoin it, or tap it
  to delete it.
- Within one drag every cut is provisional: back off and the cell is given
  back.
- Touching an end restarts that end's half. On a strand that's already
  joined, only that end lets go, and the painted cells stay as the other
  end's half.
- A tap with no drag on an end clears its half.

A level is solved when every colour is one end-to-end strand, every cell is
painted, and no loose pieces are left.

## Does it solve? The boundary conditions

Measured with the exact solver (`js/solve.js`) before anything was built:

- **One pair always solves.** C60's 32 panels and its 60 atoms are both
  *Hamiltonian-connected*: any two cells, even neighbours, can be joined by a
  strand through every cell.
- **No parity rule.** Square-grid Flow can rule out placements by
  checkerboard colouring. Neither C60 graph allows that colouring
  (pentagons are odd cycles).
- **The crossing rule.** A sphere has no edge, but every ring of C60 acts as
  one: its interior holds no cells, so a strand closed up across it
  separates the sphere. Four ends on one ring in alternating order A‑B‑A‑B
  can never be joined. For two pairs on a 3-connected planar graph this is
  the *only* obstruction to connecting (Seymour and Thomassen, 1980). On the
  atoms that is 360 of ~1.46 million two-pair placements. The panel graph
  has no such rule: three panels meet at every corner, so no ring holds four
  ends.
- **The painting rule.** Some clustered placements connect but can't sweep
  every cell. These are local and rare, and the solver catches them.

## Why panels need walls, and atoms barely do

On atoms every cell has exactly three bonds and every strand cell uses two,
so the board is tight. Around 9–11 colours on 60 atoms gives a unique
answer on its own. Panels have five or six neighbours and almost never have
one answer: two colours on C60's panels have thousands of solutions. That
freedom is room to build in, so panel levels are **carved**:

- **Walls** block the edge between two cells.
- **Bridges** are forced crossings. A bridge cell splits into two lanes, each
  joining one pair of opposite sides, and both must be painted. Its other
  sides are closed.

Both are graph rewrites (`playGraph`): a wall drops an adjacency, a bridge
adds a lane node. The solver never knows they exist.

`carve()` makes a level:

1. Draw a random answer: a Hamiltonian path cut into strands, never ending
   on a bridge.
2. Ask the solver for a second answer. Wall an edge that the second answer
   uses and the real one doesn't, and repeat until no second answer exists.
   The real answer can't be walled off, because only its unused edges are
   ever walled.
3. Try removing each wall again; keep it only if uniqueness needs it.

So every wall on the board is load-bearing. "Minotaur" is C60's panels with
just 2 colours and 25 walls.

## The solver

Exact, counting up to a cap. Strands grow from **both** ends, always
extending whichever end has the fewest moves. Growing from one end only
couldn't find even one solution to a 60-cell board in 5 million steps;
both ends takes about 80 thousand. Pruning (all sound):

- every free cell still has two possible strand neighbours;
- each unfinished strand's ends still meet through free cells;
- every free region is reachable by a strand that can sweep it.

The selftest checks solution counts against brute force on 200 small
boards with walls and bridges.

## Levels

`js/levels.js` is generated by `tools/bake.mjs` (a few minutes) and
committed, so the page never waits on a solver. 26 levels:

| levels | board |
|---|---|
| 1–4 | C60 atoms, 9 → 5 colours |
| 5–9 | C60 panels: bridges, then pure labyrinths |
| 10–13 | Voronoi atoms, 56–116 atoms |
| 14–19 | Voronoi panels, 40–100 cells, with walls and bridges |
| 20–26 | **the torus**: a 64- and a 144-atom carbon nanotorus, honeycomb tori (32 and 72 hexes) with walls and bridges, and Voronoi tori (50, 70 cells) |

The torus boards come from `../orb/js/torus.js`. The honeycomb torus has
exactly six ways out of every cell (no pentagons: a torus needs no defects),
and its corners, three bonds each, are a **carbon nanotorus**, graphene
closed on itself, the torus's answer to C60's atoms. The atoms are drawn on
a faint honeycomb, so they sit on a surface. The torus view is a donut, the
same camera Orb uses: a drag slides the skin instead of turning a globe.
**whole** becomes the flat map: the rectangle that wraps both ways, the
torus's exact map. A 72-hex honeycomb is too open for 8 pairs to have one
answer; 12 do.

A level is data on top of the engine (board spec, pairs, walls, bridges),
so **the selftest re-proves every shipped level unique** against the current
mesh and solver, and enters its answer through the rules to check it wins.
That's what stops a change to `../orb/js/sphere.js` from quietly breaking a
level.

Voronoi *corner* graphs have near-zero edges (bonds as short as 1% of the
mean), which can't be tapped. `relax()` re-lays the atoms with springs on
bonds and repulsion between all pairs. Positions only, so the bonds and
answers are unchanged. Stronger repulsion folds bonds across each other on
the bigger boards; the selftest checks there are none, and that the
shortest bond is at least half the mean (it's 86%).

## Files

| file | what |
|---|---|
| `js/boards.js` | C60 atoms/panels, Voronoi atoms/panels, torus boards (honeycomb, nanotorus, Voronoi torus), `playGraph` (walls + bridges), atom relaxation |
| `js/solve.js` | exact solver, random Hamiltonian paths, `carve` |
| `js/play.js` | the rules: fragments per colour, halves from both ends, single-cell cuts, provisional within a drag, tap to clear |
| `js/levels.js` | generated ladder |
| `js/view.js` | Canvas 2D renderer: globe (orthographic) and whole (equal-area) projections, the inset, both board looks; on the torus, the donut and the flat map |
| `js/main.js` | input (draw / turn / two-finger turn+zoom / lock / inset tap), auto-turn at the rim, level menu, progress |

```bash
node games/strand/test/strand.selftest.mjs   # boards, solver vs brute force, every level unique and winnable
node games/strand/tools/bake.mjs             # re-bake js/levels.js (minutes)
```
