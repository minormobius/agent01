# Twelve — `/twelve/`

2048 on a buckyball.

## Why it can't just be 2048

A 2048 swipe means "every tile moves that way". A sphere has no "that way":
the **hairy ball theorem** says every direction field on a sphere vanishes
somewhere. The pentagons don't rescue straight lines either. Run a straight
row of hexes (in through one side, out through the opposite side) and it
either goes a few hexes from one pentagon to the next or loops right round the
sphere without touching one:

| sphere | rows pentagon to pentagon | rows that loop round |
|---|---|---|
| C80 | 30, 1 hex each | 6, 10 tiles each |
| C180 | 30, 2 hexes | 12, 15 tiles |
| C240 | 30, 5 hexes | 10, 18 tiles |

A tile sliding along a loop has nothing to stop it.

## What it is instead

The moves are built on the points where the field must vanish. The twelve
pentagons are **drains**, and nothing ever sits on one. A move picks a drain,
and every tile slides **downhill** toward it, one hex nearer each step, taking
the step best aimed at the drain. A tile stops when it reaches the drain's rim
or meets another tile. Equal tiles that meet merge, at most once per tile per
move, and the tiles nearest the drain settle first, as against a wall in 2048.
One new tile drops in after each move (three on C80).

## Is it any good? (`test/analysis.mjs`)

One simulator plays both games. The classic rows are its calibration: 4×4
random ≈ 128 and greedy ≈ 256 are 2048's known numbers.

| board | random play reaches | greedy play reaches |
|---|---|---|
| 2048, 4×4 | 64–128 | 128–256 |
| 2048, 5×5 | 512 | 1024–2048 |
| 2048, 6×6 | 4096–8192 | 8192+ (doesn't die) |
| **C60, 20 hexes, 1 a move** | **64–128** | **1024–2048** |
| C80, 30 hexes, 3 a move | 128 | 1024 |

On C60, luck gets you exactly as far as in 2048, and skill gets you about eight
times further. Twelve drains give three times the moves of four walls, and
draining toward the neighbour of the last drain is a small, controlled shove.

Board size alone explains why 2048 is 4×4: a 6×6 board is trivially easy.
Making the pentagons holes is what brings C60 (32 tiles) down to 20 playable
hexes, close to a 4×5 board.

**Bigger spheres don't work.** On C180 and C240 even random play survives
20,000 moves at five to eight new tiles a move: the drains are too far apart,
and the downhill routes funnel tiles together until they merge on their own.
So the game ships C60 and C80 only.

## Controls

- **Swipe** across the ball: the drain furthest that way glows, an arrow runs
  to it, and letting go pours. Arrow keys do the same.
- **Tap a drain** to pour toward it. This is the only way to choose the drain
  in the middle.
- After each pour the ball **rolls** to bring that drain to the centre, so the
  pile always sits where the projection is truest. The **whole** view (the
  default, `v`) shows the entire sphere as an equal-area disc. **Globe** shows
  the near half, with the whole-sphere map in the corner.
- A drag that starts off the ball turns it, and so do two fingers (which also
  zoom) and shift+arrows. **✥ turn** mode (`t`) makes one finger turn, so pours
  are by tap only.
- Games are seeded (`?seed=…&m=c60`), and each board's game in progress and
  best score are kept in `localStorage`.

## Tests

```bash
node games/twelve/test/twelve.selftest.mjs   # drains, pour invariants, 2048 lane cases, determinism, the balance claim
node games/twelve/test/analysis.mjs 60       # the table above (~4 s)
```
