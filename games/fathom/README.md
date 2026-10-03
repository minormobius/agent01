# Fathom — `/fathom/`

Minesweeper in three dimensions. The mines hang in a sea of nested shells,
each a sphere of Voronoi cells, and you chip in from the outside. Drag to
turn the sea about its centre; **pinch** (spread to dive, pinch to rise),
the wheel, ▲ ▼ or w / s move through the shells. **Tap flags, hold digs**,
as in [`/orb/`](../orb/): the mode button or `f` swaps them, the first tap
always digs, and a tap on an open number clears round it.

Two goals: **Dive** (the default): open any cell of the innermost shell and
you've reached the core. **Clear**: every safe cell. Every sea is proved
clearable by deduction from your first tap, and the readout counts the
moves that weren't certain when you made them.

## The onion

| size | shells | cells a shell | cells | mines | neighbours a cell |
|---|---|---|---|---|---|
| shallow | 3 | 110 | 330 | 48 | 9.8 |
| deep | 4 | 160 | 640 | 100 | 10.2 |
| abyss | 5 | 200 | 1000 | 171 | 10.4 |

Each shell is its own Voronoi sphere (Orb's `buildMesh`, walls evened). A
cell's neighbours are its ring on its own shell, plus every cell it
**overlaps** on the shells just inside and just outside it: bricks, not
columns. So a number reaches about three cells into the layer below (and
three above), and a buried mine shows up in the numbers of every shell over
it. Before building it, two designs were measured by dealing random mines
and solving from the outer shell:

| mines per neighbourhood | column (same mesh stacked, ~7.4 neighbours) | bricks (~12 neighbours) |
|---|---|---|
| 1.0 | 95% guess-free | 99% |
| 1.3 | 89% | 96% |
| 1.6 | 73% | 98% |
| 1.9 | 55% | 84% |

The bricks couple the layers far better, because neighbouring numbers see
the same buried cells from different angles. Overlaps under 8% of a cell are
dropped (`OVERLAP` in `js/onion.js`), so no number counts a cell it only
grazes: the short-wall problem again, in depth.

Two rules make it a dive rather than a dig:

- **Zeros flood along their own shell only.** The cells below a zero are just
  as certain, but going deeper is always a tap of your own. Without this the
  first tap usually flooded straight to the core.
- **The water gets denser with depth.** The innermost shell is 2.2 times as
  likely to hold a mine as the outermost (`DEPTH`; a weighted deal, an opt-in
  hook in Orb's `solve.js`, `mesh.weight`).

The board is only a graph, `{ n, nbrs }` (plus `flood` and `weight`), so Orb's
rules, exact solver, certainty check and no-guess generator play it
unchanged.

## Seeing three layers

The view is a perspective cutaway round a fixed centre. `depth` is a real
number (0 the outermost shell): the shell in focus fills the view, the
shells outside it are cut away (the one just above stays as a faint ghost of
what's still closed over you), and the two just inside show through its
holes. A closed cell is opaque and bluer with depth; an opened one turns to
water, just its number floating in it, so you see down through it. Zeros are
clear water. The depth gauge on the left marks the shell you're on, how
deep you've opened, and the core.

What you see is what you tap: a tap goes down through open water to the
first closed cell, unless it lands near an open number, which is the number.
Hit-testing is a ray against each shell's sphere, then the nearest site on
that shell, as in `/orb/`. The reticle rings the cell under the middle and
everything it counts: its ring in teal, the cells below in blue, the cells
above dashed. The line under the board splits the count by layer.

## Files

| file | what |
|---|---|
| `js/onion.js` | the shells, their overlaps, the flood graph and the depth weights |
| `js/view.js` | the cutaway renderer, ray picking, the reticle |
| `js/main.js` | input (turn, pinch to dive, tap and hold), goals, the guess readout |
| `css/fathom.css` | on top of `../orb/css/orb.css` |

It borrows `../orb/js/prng.js`, `sphere.js`, `rules.js` and `solve.js`.

## Tests

```bash
node games/fathom/test/fathom.selftest.mjs   # the onion, the rules, every size proved guess-free; preflight runs this
```
