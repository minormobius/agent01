# Orb — `/orb/`

Minesweeper on a sphere of Voronoi cells. Drag to turn it. **Tap flags, hold
digs**: digging is the move that can end the game, so it gets the deliberate
gesture (right-click digs on desktop; the mode button or `f` swaps them).
Tapping an open number clears around it once its flags are placed. The first
tap of a game digs, since there is nothing to flag yet.

The **reticle** rings the cell facing you (the orb's nearest point) in white
and the cells it counts in teal, drawn above everything else. A readout
underneath gives its number, flags and hidden neighbours. On an irregular
mesh, counting the far side of a cell by eye is the chore; turn the cell you
care about to the middle instead.

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

## Leaderboard: read live off ATProto, no server

🏆 shows the fastest **pure** clears per size (zero guesses, no hints), one
row per player, all-time / week / today.

**Writing.** A pure clear is posted as a `com.minomobi.lab.score` record in
*your own* repo, through the shared auth worker, with one narrow permission
(`repo:com.minomobi.lab.score`):

```json
{ "site": "orb", "game": "pure-320-62", "value": 83412, "unit": "ms",
  "higherIsBetter": false, "detail": "seed=kor-lith-26 first=60 guesses=0",
  "createdAt": "…" }
```

Signing in, or upgrading an existing mino.mobi session to that permission,
leaves the page, so the time is parked in localStorage and posted on return.

**Reading** (`js/corpus.js`). Nobody hosts the board. Every browser rebuilds
it:

1. The relay lists every repo holding the collection
   (`com.atproto.sync.listReposByCollection`).
2. Each repo's DID document names its PDS, and the PDS lists its records.
3. Jetstream (`wantedCollections=com.minomobi.lab.score`) streams every
   create and delete live, from a cursor a minute before the backfill
   started, so nothing falls in the gap.

All of these are CORS-open public endpoints. A score posted anywhere
reaches every open board within about a second, and deleting the record
takes it off. Against the real network: cold start to live in ~2 s.

Names and avatars come from the appview's `getProfiles`, which only reports
handles that verify both ways. A DID document's `alsoKnownAs` is a bare
claim and is never shown. A failed lookup (the appview does hiccup) is
retried with backoff whenever the board redraws, so a row can't get stuck
showing a raw DID. Avatars use the CDN's thumbnail size. The collection is shared with other lab sites, so `accept()`
keeps only well-formed Orb records.

**Cost and limits.** One PDS request per player per page load. That's
nothing now, and it's the moment to add a cache (or an appview) once there
are thousands of players. The relay's list can include repos that moved or
were deleted; they contribute nothing.

**The board trusts the record.** Anyone can write any number into their own
repo; that is what user-owned data means. `detail` carries the seed and
first cell, which pin the exact board, so a replay check can be added later
without changing the format.

## Files

| file | what |
|---|---|
| `js/prng.js` | seeded RNG (local copy of the repo's xmur3 + mulberry32) |
| `js/sphere.js` | random points → Lloyd → convex hull = spherical Delaunay → Voronoi cells and adjacency; nearest-site hit test |
| `js/rules.js` | state, reveal/flood, flag, chord. Talks to the mesh only through `nbrs`, so the same rules run on the analysis tori |
| `js/solve.js` | `deduce`, `solveFrom`, `generate` (no-guess), `certainties` |
| `js/view.js` | Canvas 2D orthographic renderer, rotation, picking |
| `js/main.js` | input (drag vs tap vs hold vs pinch), the guess readout, overlays |
| `js/corpus.js` | the score corpus: relay + PDS backfill, Jetstream live, per-player ranking (ES module, no DOM) |
| `js/forge.js` | hard mode's Web Worker: loads the engine, rebuilds the mesh, runs the climb, reports progress |
| `js/board.js` | the leaderboard UI and the write path (ES module; imports `../../lib/auth.js`, which the deploy vendors) |

A board is a pure function of `(seed, size, first cell)`. `?seed=…&size=s|m|l|x`
is a permalink.

## Tiers

| tier | cells | mines | density | to prove a board (median / worst) | hard moments per board |
|---|---|---|---|---|---|
| small | 160 | 28 | 17.5% | <1 ms | ~0 |
| medium | 320 | 62 | 19.4% | <1 ms | 0.3 |
| large | 600 | 132 | 22% | 5 / 13 ms | 0.9 |
| huge | 1000 | 250 | 25% | 83 / 325 ms | 1.3 |

They're defined in `O.SIZES` (`js/rules.js`). The generator's cost climbs
steeply past a quarter mined: 1000 cells at 28% takes ~0.25 s median, and
1500 cells at 28% takes 5 s median, 11 s worst. The ceiling is the repair
loop, not the solver.

A **hard moment** is a point in the solve where single numbers, chased to a
fixpoint (flag what one number forces, clear what that frees, repeat),
settle nothing anywhere on the board, yet something is still certain. The
only way on is two numbers read together, or the full exact reasoning.
Normal boards have almost none, even the dense ones: the no-guess repair
smooths hard spots away. More mines makes a board longer, not deeper.

## Hard mode

The **HARD** toggle (remembered; `&hard=1` in the permalink) forges boards
*for* hard moments. Choosing the hardest of 32 random boards barely moves
the count (to 1–3), so `generateHard` climbs instead:

1. Start from a proved board.
2. Move one mine at a time.
3. Keep the move whenever the board still clears without a guess *and* has
   at least as many hard moments. `hardSolve` answers both in one pass, and
   ties are kept so the search can cross plateaus.

| tier | climb steps | hard moments, normal → hard (median) | forge time (median / worst, desktop) |
|---|---|---|---|
| small | 600 | 0 → 3 | 0.1 / 0.3 s |
| medium | 600 | 0 → 6 | 0.6 / 0.7 s |
| large | 500 | 1 → 7 | 1.4 / 2.1 s |
| huge | 350 | 2 → 6 | 3.0 / 3.5 s |

It runs in a Web Worker (`js/forge.js`) with a live counter, and the clock
starts once the board is ready. The HUD's **hard** counter shows hard
moments cracked out of the board's total, and glows while you're in one. A
certain move made at a hard moment cracks it; a guess out of one doesn't
count. The total is what the easy-first route meets. Another order of play can meet
fewer or more (the HUD then just counts), because the board isn't forged
around one route.

Hard clears go to their own leaderboard, `hard-<cells>-<mines>-<climb>`
(the climb budget is part of what the board is). Each record's detail
carries `cracked=x/y`.

A tier's cells and mines are its leaderboard game id (`pure-1000-250`).
Retune a tier and its old times drop off instead of being ranked against a
different board.

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
nothing certain. It also drives the score corpus against a fake network:
backfill with a dead repo and paginated records, foreign and malformed
records dropped, best time per player, the period filter, verified names,
and live create and delete through a fake Jetstream.
