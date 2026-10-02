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

## What it is instead: twelve whirlpools

The moves are built on the points where the field must vanish. The twelve
pentagons are **drains**, and nothing ever sits on one. A move picks a drain,
and every tile slides in toward it.

**How a tile gets there matters.** The first version let each tile take the
steepest way down. The rings round a drain grow outward, so outer hexes
funnel into fewer inner ones, and two tiles could want the same cell. Which
one won was decided by an order the player couldn't see, so it played as a
coin toss.

Now each drain is a **whirlpool of five spiral arms**. A pentagon has
five-fold symmetry, so the hexes round it fall into orbits of five. An *arm*
is a chain of neighbours that starts on the drain's rim and takes exactly one
hex from each orbit, and its five rotations are five lanes that cover every
hex once and never touch. Such chains exist on every Goldberg sphere: C60 has
2 (mirror twins), C80 16, C180 47,064. We pick the one that climbs outward
most steadily and, between mirror twins, the one that turns anticlockwise
seen from outside, so every drain swirls the same way. On C60 the arms climb
the rings round the drain cleanly (ring 0, 1, 2, 3), five arms of four. On
C80 they're five arms of six with one sideways step.

So **a pour is exactly 2048 on five independent rows**: tiles slide along
their arm, equal neighbours merge (nearest the drain first, at most once per
move), and nothing is left to chance except where the new tile lands. While
you aim, the drain's arms are drawn, so you can read the whole move before
you make it.

## Is it any good? (`test/analysis.mjs`)

One simulator plays both games. The classic rows are its calibration: 4×4
random ≈ 128 and greedy ≈ 256 are 2048's known numbers.

| board | random play reaches | greedy play reaches |
|---|---|---|
| 2048, 4×4 | 64–128 | 128–256 |
| **C60, five arms of four, 1 new tile a move** | **64–128** | **256–512** |
| C80, five arms of six, 4 new tiles a move | 256–512 | 1024–2048 |

On C60, luck gets you as far as in 2048, and skill gets you about twice as
far: twelve drains give three times as many moves as four walls.

An honest note: the funnel version measured greedy play at 1024–2048 on C60.
Part of that came from tiles merging on their own as they funnelled together,
which is the same hidden contention that felt like coin tosses. The whirlpool
numbers are lower and genuine.

**Bigger spheres don't work**: their arms are long and the board is roomy, so
even random play survives indefinitely. The game ships C60 and C80 only.

## Controls

- **Swipe** across the ball: the drain furthest that way glows, its five arms
  light up, and letting go pours. Arrow keys do the same.
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
node games/twelve/test/twelve.selftest.mjs   # whirlpools (a partition, rotation-symmetric, rim-ended), pour invariants, 2048 row cases, determinism, the balance claim
node games/twelve/test/analysis.mjs 60       # the table above (~4 s)
```
