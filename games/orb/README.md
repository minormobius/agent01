# Orb — `/orb/`

Minesweeper on a sphere of Voronoi cells. Drag to turn it, tap to dig, hold
(or right-click, or flag mode) to flag, press an open number to light up the
cells it counts.

Pure static, like the rest of the `/pressure/` family: six script tags, no
build, served by the assets fallback in `games/worker.js`.

## Does Minesweeper stay solvable on a Voronoi mesh?

**No tiling guarantees it, the square grid included.** "Solvable without
guessing" is a property of a *mine layout*. Plenty of ordinary expert boards
force a coin-flip. What a tiling changes is *how often*. `test/analysis.mjs`
measures that: deal mines uniformly (first cell and its neighbours kept
clear), play from the first cell by exact deduction alone, and count the
boards that clear. ~400 cells, 300 deals per entry, all on closed surfaces
(tori for the grids) so edges and corners play no part:

| mesh | avg degree | 14% mines | 16% | 18% | 20% | 22% |
|---|---|---|---|---|---|---|
| square, 8-neighbour | 8.00 | 98% | 94% | 91% | 89% | 76% |
| hex | 6.00 | 99% | 94% | 90% | 85% | 74% |
| **orb** (Voronoi, 2 Lloyd rounds) | 5.97 | 94% | 88% | 82% | 64% | 31% |
| Voronoi, unrelaxed | 5.97 | 86% | 77% | 61% | 37% | 14% |

So an irregular mesh makes the game **less** fair, and more irregularity makes
it worse. The orb has the hex grid's average degree (6 − 12/n, by Euler) but
falls away much faster as density rises. What is measured about the cause:
the cells left undecided when the solver gets stuck skew toward low degree
(5.83 average against the mesh's 5.97), and a safe cell completely walled in
by mines accounts for only ~4% of stuck orb boards. The fuller explanation is
still open. The likely shape: a four- or five-sided cell is watched by fewer
numbers, so it is easier to leave underdetermined.

Lloyd relaxation is the knob (`relax` in `buildMesh`). Two rounds keep a real
spread of fives, sixes and sevens while killing the slivers. A near-zero
edge is an adjacency no player can see.

## So the game doesn't hope

`js/solve.js` holds an exact solver: single numbers, overlapping pairs, then
full enumeration of each frontier component combined against the total mine
count. A cell is certain iff no world consistent with what you can see
disagrees. The generator places mines after your first tap, plays the board
out by deduction, and if it gets stuck moves one stuck-frontier mine into the
unseen interior and tries again. At the game's densities that costs ~1 deal,
~0.1 repairs and about a millisecond.

Because knowledge only grows, the solver's proof survives any order of play.
**At every moment some cell is certain**, however you got there. That gives
the family its readout. This game's shape of correctness is **a certainty**:
each move you make is checked against what was provable when you made it, and
the ones that weren't are counted as guesses. A clear with zero guesses is
`CLEARED — PURE`. Lose, and it shows you the cells that were certain when you
clicked.

### What counts as a guess

A tap is a guess iff the cell was not provably safe from the numbers on
screen at that moment. Flags are ignored either way (they're your opinion,
not knowledge), so tapping before you flag costs nothing. "Provably" means
the *complete* certain set: `certainties()` runs the cheap rules to a
fixpoint, then the exact solver over what's left. An early version asked
`deduce()`, which stops at the first rule that finds anything. That is right
for solving and wrong for judging. A 1 touching three cells, two of which
another number says hold exactly one mine, makes the third safe, but that
version called it a guess whenever some single number elsewhere happened to
clear a cell too. The selftest now pins `certainties()` to the exact
solver's answer in every position it walks.

## Leaderboard

🏆 shows the fastest **pure** clears per size (zero guesses, no hints), one
row per player, all-time / week / today. Storage is `scores.mino.mobi`
(`workers/scores`, D1), slug `orb-pure-<s|m|l>`, score `−ms` because that
board ranks higher-is-better. Identity is your Bluesky handle via
auth.mino.mobi with plain `atproto` scope: nothing is written to your PDS.

Why not `com.minomobi.lab.score` records on each player's PDS? Those have no
index. A page can only rank the handles it is told to look up, so a global
"fastest" would need an indexer first. `scores.mino.mobi` already is one.

**The board trusts the client.** The worker checks who you are, not how you
played. `meta` carries `seed` and `first`, which pin the exact board, so a
replay verifier can be added later without changing the format. Signing in
leaves the page, so a winning time is parked in localStorage and posted when
you come back.

## Files

| file | what |
|---|---|
| `js/prng.js` | seeded RNG (local copy of the repo's xmur3 + mulberry32) |
| `js/sphere.js` | random points → Lloyd → convex hull = spherical Delaunay → Voronoi cells and adjacency; nearest-site hit test |
| `js/rules.js` | state, reveal/flood, flag, chord. Talks to the mesh only through `nbrs`, so the same rules run on the analysis tori |
| `js/solve.js` | `deduce`, `solveFrom`, `generate` (no-guess), `certainties` |
| `js/view.js` | Canvas 2D orthographic renderer, rotation, picking |
| `js/main.js` | input (drag vs tap vs hold vs pinch), the guess readout, overlays |
| `js/board.js` | the leaderboard (ES module; imports `../../lib/auth.js`, which the deploy vendors) |

A board is a pure function of `(seed, size, first cell)`. `?seed=…&size=s|m|l`
is a permalink.

## Tests

```bash
node games/orb/test/orb.selftest.mjs   # invariants; preflight runs this
node games/orb/test/analysis.mjs 300   # the solvability table above, ~3 s
```

The selftest checks the mesh against Euler (V−E+F=2, every ring closes on its
own site). It checks the exact solver against brute force over every mine
layout on small meshes, for soundness *and* completeness. It checks that
every generated board clears by deduction and is deterministic. And it checks
that a player who opens random safe cells never reaches a position with
nothing certain.
