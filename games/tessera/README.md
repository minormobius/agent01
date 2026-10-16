# Tessera — a snake on a tiling that changes shape

A prototype in two pages:

- **`/tessera/`, the game.** A snake on a board that cycles hexagons ↗ →
  squares → hexagons ↘ → squares. Any joint of the snake that crossed a
  diagonal is cut when the corners close.
- **`/tessera/lab.html`, the lab.** The same tiling with the conservation
  laws checked live on every frame. It answers the question that came first:
  what has to be conserved while a tiling changes shape, so that a game
  played on its cells stays well defined.

## The game

- **Three shapes on a visible clock.** Each shape holds for 36 ticks (5 s at
  140 ms per tick). A bar and a countdown at the top show what comes next;
  it is red when the change is a pinch and some of your joints are at risk.
  The change itself takes **one tick**. A closing wall shrinks to nothing in
  the tick before the pinch, and an opening one grows from nothing in the
  tick after the join, so the drawn walls obey the same law as the graph.
- **Joins are free; pinches cut.** Going from squares to hexagons gives
  every cell two more neighbours on one diagonal. Going back closes that
  diagonal. The snake is cut at its first joint (counting from the head)
  that ran across a diagonal, and everything behind the cut falls off as
  **pellets**. In the last stretch before a pinch the joints at risk show
  red and the closing walls pulse amber.
- **Nothing is lost in the pinch.** The snake's length before the cut
  equals the length it keeps plus the pellets it drops, cell for cell.
  Pellets fade after about 20 s. Gathering one gives +1 length and +1
  point; food gives +3 length and +5 points.
- **Relative steering.** Left turns to the next neighbour
  counter-clockwise, right to the next clockwise: 90° on squares, 45° or
  90° on these hexagons. Steering is the left/right half of the board, or
  ← → / A D. A heading the board takes away (a diagonal at a pinch) falls
  to the nearest step that still exists, ties broken by where the snake
  has been going.
- **The board is a real torus** (24 cells round the ring, 10 round the
  tube, so r/R = 10/24 and cells are true-shaped along the top). It uses
  Orb's `TorusCam` (`../orb/js/torus.js`). The camera is fixed, and the
  **skin slides** round the ring and the tube so the head always sits at
  the front, facing you. It's a lead camera: it aims 1.5 cells ahead of
  the head and eases (τ = 90 ms), so turns swing the view rather than jerk
  it. The view is drawn back to front, each cell shaded by how squarely it
  faces you, with the walls sampled along the surface. A tall screen gets
  the donut on its side (a rotation, so left is still left). The zoom
  steps are ×1, ×1.6 and ×2.4. **flat** (or V) shows the wrapped rectangle
  instead, following the head the same way.
- **Walls are the lab's fish S-curves at 0.55× size,** strong enough to
  read as figures, mild enough that a square still reads as having four
  sides.

### The leaderboard

- **Two boards, ranked two ways.** *Today's daily* is one seed for
  everyone, new each UTC day, so players compete on the same board. *Open
  play* is any seed. Each is ranked by **score** and by the **longest
  snake**, all time / week / today, one row per player. One tap on "post"
  writes both records, the score to `daily-v1-…` / `open-v1` and the
  length to `len-daily-v1-…` / `len-open-v1` (unit `cells`).
- **The sign-in field suggests handles as you type.** This is the repo's
  shared `packages/oauth-client/typeahead.js`, vendored into `games/lib/`
  by the deploy, asking the public appview. It is built into Orb's board
  kit, so every game on the kit has it.
- **Scores live in the player's own repo** as `com.minomobi.lab.score`
  records, the same stack as Orb, Fathom and One Side. Tessera mounts
  Orb's portable board (`../orb/js/board-kit.js`). Posting needs one
  narrow permission (`repo:com.minomobi.lab.score`) through the shared
  auth worker; a score waiting on sign-in is parked and posted on return.
  Nobody hosts the board: every browser rebuilds it from the relay and the
  players' PDSes, then follows Jetstream live.

  ```json
  { "site": "tessera", "game": "daily-v1-2026-10-16", "value": 120, "unit": "points",
    "higherIsBetter": true, "detail": "seed=1317305174 steps=300 longest=30 cuts=2", "createdAt": "…" }
  ```

- **The board refuses the impossible.** Food is worth 5 points and a
  pellet 1, so no game scores more than 5 points a step. A snake starts 4
  long and grows at most a cell a step, and can't be longer than the
  board's 240 cells. `accept()` drops any score above 5 × its steps, and
  any length above min(240, 4 + steps) or not equal to the `longest` in
  its own `detail`. The selftest checks that no played game breaks either
  ceiling. Otherwise the board trusts the record. The seed in
  `detail` pins the board, so a full replay check needs only a replay
  store; the inputs don't fit in a record's 100-grapheme `detail`.
- **Versioned.** The game ids carry `v1`. Change anything that moves
  scores (the clock, the tick, what food is worth) and bump `VERSION` in
  `js/score.js`, so old scores stop being ranked with new ones.
- **This browser's runs** (the last 60, kept locally) give the "daily best"
  in the header and the game-over line. **share** copies the daily result.

`js/snake.js` is the game with no DOM. The selftest plays about 250 games
with a bot (40k ticks, a few hundred cuts) and checks the invariants on
every tick.

## The lab

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

### Joins and pinches

A **join** happens when a corner opens and two cells become neighbours.
That is always safe for a snake. A **pinch** happens when a corner closes
and two cells stop touching. If those two cells were consecutive in the
snake's body, the snake is cut. The page counts both and draws a short
wall amber while it is shrinking towards a pinch, so the countdown is
visible.

In the game, a pinch cuts and the tail beyond the cut falls off as pellets.

## Files

- `js/tiling.js`: the tiling, its ports and walls, exact area, the census,
  the simplicity check, and the morph fields (breathe, wave, ripple). It
  has no DOM, so node runs it.
- `js/snake.js`: the game. The clock, the three shapes, steering, the cut,
  pellets and food, and the split the renderer should draw mid-tick. It has
  no DOM.
- `js/game.js`: the game page. The torus view through Orb's `TorusCam` and
  the flat view; the board, the snake's spine, the joints at risk and the
  ghosts of walls about to open.
- `js/score.js`: the score records. The two boards' ids, the daily seed,
  `accept()` and the record's `detail`. No imports.
- `js/board.js`: mounts Orb's board kit. A separate module, so the game
  still runs if the vendored auth client can't load.
- `js/lab.js`: the lab page. The canvas, the live laws panel, joins and
  pinches, tap a cell to follow its neighbours, and `graph` to draw the
  adjacency.
- `test/tessera.selftest.mjs`: the tiling's laws, 22 checks, about 1 s.
- `test/snake.selftest.mjs`: the game's invariants, the parts of Orb's
  `TorusCam` the page leans on, and the score records. 19 checks, about
  2 s.

## Next

- Tuning: the hold length, the tick, and food growth (+3 makes the snake
  long fast on a small board).
- Fronts instead of the whole board at once. The lab shows that straight
  fronts keep every cell at area 1.
- Figures that read as figures.
