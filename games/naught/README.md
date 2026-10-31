# Naught: noughts and crosses on a torus

The board is **(ℤ₃)ⁿ**, for n from 2 to 6. Every cell is n coordinates,
each 0, 1 or 2, added with wrap-around (2 + 1 = 0). So the board wraps round
in every direction: it's an n-dimensional torus of 3ⁿ cells (9 to 729).

A **line** is any three cells a, a + d, a + 2d for a direction d ≠ 0,
wrapping as it goes: the torus's straight lines, every kind of diagonal
included. Because 3 is prime, that collapses to one rule:

> three distinct cells are a line exactly when they sum to zero,
> coordinate by coordinate, mod 3.

So any two cells lie on exactly one line, and its third cell is −(a + b).
`js/group.js` precomputes that for every pair (the `third` table, 3ⁿ × 3ⁿ),
and everything else is lookups in it. The selftest checks the rule against
brute force for n = 1 to 3, and checks that there are 3ⁿ(3ⁿ − 1)/6 lines
(12 on the 3 × 3 torus, 117 on the 3-torus).

## Three ways to see it

- **grid**: nested 3 × 3 grids. Coordinates 1 and 2 run across and down
  inside a block, 3 and 4 place the blocks, and 5 and 6 place the blocks of
  blocks. A line that runs off one edge of a block comes back on the
  opposite edge. On the 3 × 3 board faded copies of the board surround it,
  so a wrapping line reads straight. Wheel or pinch zooms, drag pans.
- **cards**: the same layout, with every cell drawn as a card whose
  attributes are its coordinates: colour, shape, fill, count, the card's
  tint, and size. Three cards are a line exactly when every attribute is
  all the same or all different. You can see a line in six dimensions
  without picturing the space.
- **donut**: a real torus, through Orb's `TorusCam` (`../orb/js/torus.js`),
  showing the two-dimensional slice through the last cell played along two
  coordinates (`axes` picks which). When n = 2 that's the whole board. Drag
  turns it, and a tap plays.

**Hints** light what matters:
- in *make a line*, the cells that complete a line for each side;
- in *avoid a line* and the cap puzzle, the cells each side can no longer
  take (their poison).

## The games

- **Make a line** (the classic). On the 3 × 3 torus the first player can
  force a win (solved in the selftest: 200 positions). From three
  dimensions on it's a race. Every pair of your marks threatens its third
  cell, so your second mark forces a block, the block's pair forces yours,
  and your block makes two threats at once. The engine moving first wins
  against itself by move 7, every time, for n = 3 to 6.
- **Avoid a line** (misère). Complete a line of your own and you lose.
  Every mark you place poisons the third cell of each pair it makes, so
  each player is building a **cap** (a set with no line) under pressure.
  Whoever runs out of safe cells first must complete a line. There are no
  draws: the biggest caps (2, 4, 9, 20, 45, 112 cells for n = 1 to 6) are
  always smaller than the first player's half of a full board from n = 2
  on, so a full board can't be line-free. The game is long: engine against
  engine on the 5-torus runs 77 moves. On the 3 × 3 torus the first player
  wins (solved).
- **The cap puzzle**, alone: take as many cells as you can with no line
  among them, until every cell left would make one. The best caps are known
  only up to six dimensions (the n = 6 value, 112, was settled in 2008), and
  how fast they grow is the cap-set problem, bounded only in 2016
  (Ellenberg and Gijswijt).

**The engine.** In *make*, it takes a win if it has one and blocks if it
must. Otherwise it plays the cell that makes the most new threats, weighted
against what the cell would have given the opponent. In *avoid*, it never
completes its own line while a safe cell is left. Among safe cells it takes
the one that poisons the fewest new cells for itself, preferring cells the
opponent could still have used. Against a random player it wins 118 of 120
in *make* and 120 of 120 in *avoid*.

## Files

- `index.html`, `css/naught.css`
- `js/group.js`: the board, the `third` table, games, the engine, `CAP`.
  No DOM.
- `js/game.js`: the page: layout, the three views, input, hints.
- `test/naught.selftest.mjs`: 11 checks, under a second.
