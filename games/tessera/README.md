# Tessera — a tiling that morphs without breaking

A prototype, and the board a snake will eventually run on. The question it
answers first is what has to be conserved while a tiling changes shape, so
that a game played on its cells stays well defined.

## The construction

- **The cells are a fixed square lattice on a torus.** Cell *i* is lattice
  point *i*, always. Nothing is created or destroyed, so the snake's length,
  the food and the score have a stable place to live.
- **Every lattice point carries a split *h*.** At *h* = 0 four cells meet
  there, which gives a square corner. At *h* > 0 the corner splits into two
  vertices L ± h(1,−1) with a short wall between them, and the lower-left
  and upper-right cells become neighbours. At *h* < 0 the other diagonal
  pair meets. With every corner at ±¼, the cells are hexagons whose six
  walls all have the same length.
- **Every wall is one curve, owned by the wall.** Both cells draw it, so
  there is never a gap or an overlap, whatever the curves do. A wall is a
  chord bent by g(t)·perp(Q−P), where g(t) = sin(πt)·Σ c_k sin(kπt). The
  sin(πt) factor makes a wall leave each corner along its chord.

## The laws, and which ones come for free

| law | how it holds |
|---|---|
| N cells, fixed identity | by construction |
| coverage: each point in exactly one cell | by construction (shared walls). The selftest throws 4000 random points at a random morph |
| V − E + F = 0 | it's a torus. Counted from the walls themselves, not from a formula |
| 1/f̄ + 1/v̄ = ½ | follows from Euler. f̄ is mean neighbours, v̄ is mean cells per corner. Squares are 4 and 4, hexagons 6 and 3, and a mixed board lands anywhere on the curve |
| total area = N | each wall moves area from one side to the other, never in or out |
| each cell's area = 1 | **only when the morph allows it** (below) |
| walls don't cross | **the one law that has to be checked** |
| neighbours change only at zero length | by construction: a T1 move happens when *h* passes through 0 |

### Area is a flux

Only a wall's c₁ moves area: it shifts L²·c₁/2 from one side to the other.
A cell's area changes by the net of what its walls move in and out (the
discrete divergence of c₁). It follows that:

- **S-curves (c₁ = 0)** can vary wall by wall, in space and time, and every
  cell keeps area 1.
- **Bulging walls (c₁ ≠ 0)** keep area 1 only when every wall in a family
  bulges the same. Wherever the shape varies, cells swell and shrink.

The corner splits obey the same law. A cell's area changes by
h(lower-left) + h(upper-right) − h(lower-right) − h(upper-left), to first
order a mixed second derivative of the h field. A front that runs straight
along a lattice axis (h depends on x alone) therefore keeps every cell at
exactly 1. A curved front, such as the ripple, moves up to about 37% of a
cell. The total never changes.

### Walls must not cross

Nothing in the construction stops a wall from crossing its neighbour, so
the page checks every cell on every frame and outlines the bad ones in red.
Two things show up:

- The shapes that matter most are the mixed states. Scaling up the fish
  S-curves, the uniform breathe holds them clean to 1.9× their shipped
  size, the straight wave to 1.6×, random corners to 1.4×, and the ripple
  only to 1.3×. Fronts, where neighbouring corners differ, tangle first,
  so shapes have to be checked on mixed boards and not only on the pure
  tilings.
- The fix is in the curve family. Two walls that meet at a corner must not
  bulge into the same cell near it. Flipping one sign of the top wall's c₂
  took the fish from tangling to clean.

## Joins and pinches: the snake's problem

A **join** happens when a corner opens and two cells become neighbours.
That is always safe for a snake. A **pinch** happens when a corner closes
and two cells stop touching. If those two cells were consecutive in the
snake's body, the snake is cut. The page counts both and draws a short
wall amber while it is shrinking towards a pinch, so the countdown is
visible.

The prototype doesn't decide what a pinch does to a snake. The proposal is
to sever: the tail beyond the cut turns to stone (or food).

## Files

- `js/tiling.js`: the tiling, its ports and walls, exact area, the census,
  the simplicity check, and the morph fields (breathe, wave, ripple). It
  has no DOM, so node runs it.
- `js/main.js`: the canvas, the live laws panel, joins and pinches, tap a
  cell to follow its neighbours, and `graph` to draw the adjacency the game
  will use.
- `test/tessera.selftest.mjs`: 22 checks, about 1 s.

## Next

The snake. It needs heading carried as a vector rather than as an edge
index, a rule for pinches, and then figures that read as figures.
