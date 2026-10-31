# Ziggurat

The hopping-pyramid arcade game, one dimension up. At
[games.mino.mobi/ziggurat/](https://games.mino.mobi/ziggurat/).

## The board

The classic pyramid is a **staircase of cubes** seen from above. What you hop on
are the cubes' square tops, in a triangle: cells (a, b) with a + b ≤ N − 1. You
hop four ways (±a, ±b), and the isometric view is only there so you can read
the steps.

Go up a dimension and it's a **staircase of tesseracts**. A tesseract's top is a
whole cube, so the tops form a tetrahedral pile: every (a, b, c) of whole
numbers ≥ 0 with a + b + c ≤ N − 1, which is N(N + 1)(N + 2)/6 cubes (35 on
side 5, 56 on side 6). You hop six ways, ±a, ±b and ±c. A + hop goes one step
down and a − hop one step up, because the depth below the summit is
a + b + c. A hop that leaves the pile is a fall.

You can't see into a pile, so it's drawn **sliced**. Fix one coordinate,
c = k say, and the cells left form a triangle: an ordinary pyramid of side
N − k whose summit sits k steps down. So the pile is N pyramids side by side,
each a row smaller than the last. Four of your hops go round a pyramid, and the
other two take you to the same spot on the pyramid before or after it, a step
higher or a step deeper. Near a slanted edge that hop deeper has nothing to land
on, because the next pyramid is smaller.

The pile looks the same along a, b and c, so which coordinate you slice along
is a free choice: **T** (or the *slice* button) turns the tesseract, and every
cube glides to its pyramid in the new slicing. It changes what you see, never
the game: the same six neighbours, the same enemies. What changes is which of
them are on your pyramid, which is often what you needed to see.

## Play

- **Goal:** turn every cube's top gold. Level 1 takes one landing a cube.
  Level 2 takes two (lapis, then turquoise, then gold). From level 3 a landing
  on a finished cube undoes it. The pile grows from side 5 to side 6 at level 3.
  Four rounds make a level, and a round's bonus is 1000 + 250 for every round
  before it.
- **Red balls** drop onto the second layer and bounce down at random until they
  fall off the bottom.
- **The purple ball** does the same until it reaches the bottom layer, where it
  hatches **the coil**. The coil chases you with all six hops, always taking
  the one that brings it closest by hop count.
- **Discs** float just off the pile's three outer faces. Hop onto one and it
  carries you to the summit. A coil that follows you there goes over the
  edge, worth 500.
- **Green** stops every enemy for four seconds. **The cyan one** undoes each
  cube it lands on; catch it for 300.

Controls:
- Tap a cube next to you (they glow), or swipe toward it.
- Arrows go round the pyramid you're on: ← up-left, ↑ up-right, → down-right,
  ↓ down-left.
- **Z** and **X** hop to the pyramid before and after.
- **T** turns the slicing; **P** pauses.
- On a keyboard each glowing neighbour is labelled with its key.

## Files

| | |
|---|---|
| `js/zig.js` | the game with no DOM: the pile, hops, rules, enemies, discs, a clock you feed, and `autopilot()` (a fair player for the selftest and the arcade's attract loop) |
| `js/main.js` | the page: lays the pyramids out to fit the screen, draws, turns the slicing, takes taps, swipes and keys, plays the demo behind the title |
| `js/score.js` | the leaderboard's records and `accept()` |
| `js/board.js` | mounts Orb's portable board kit (`../orb/js/board-kit.js`) |
| `test/ziggurat.selftest.mjs` | the checks below |

## Leaderboard

Highest scores, read live off ATProto through Orb's board kit. Each score is a
`com.minomobi.lab.score` record in the player's own repo, game `score-v1`, with
detail `level= round= cleared= hops= lures= catches= seed=`. `accept()`
refuses the impossible:
- A run ends in the round after the last one it cleared, so level and round
  must match `cleared` exactly.
- Every cleared round needed a landing on every cube for every stage of its
  colour rule, less the discs.
- The score must lie between the bonuses the run must have earned and the most
  its landings, lures and catches could pay.
- There are no more lures than there were discs.

Bump `VERSION` when a rule changes what a score means.

## Tests

```bash
node games/ziggurat/test/ziggurat.selftest.mjs   # < 1 s
```

The selftest checks:
- The pile has N(N + 1)(N + 2)/6 cubes, and every slicing gives pyramids of
  side N … 1.
- Every hop moves exactly one step up or down, and a hop across lands on the
  same spot on the next pyramid.
- The colour rules for each level, and that clearing a round pays its bonus.
- A fall costs a life and a disc ride carries you home, with the coil following
  you off.
- Red balls kill, the cyan one undoes cubes and can be caught, and the purple
  ball hatches.
- On ten seeds the autopilot clears 5 to 11 rounds before losing three lives
  (levels 2 to 3), so the pile can be cleared and it gets hard. The same seed and moves give the same
  game.
- `score.js`'s constants are the game's, every real run's record is accepted,
  and a dozen forged ones are refused.
