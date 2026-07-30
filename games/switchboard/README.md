# Switchboard — `/switchboard/`

Six lines, one operator. Calls arrive on a schedule you can **see in full**
before the clock starts, each with a length and a deadline. You work one by
holding it — and while you are holding it, you are holding it. A call pays out
only if you *finish* before its deadline; letting go loses the work.

Fourth in the [Pressure](../pressure/) family. Pure static, no build step.

```
index.html            the shell
css/switchboard.css   layout and chrome
js/prng.js            seeded rng, one stream per (seed, shift)
js/rules.js           the rules — pure, headless, no DOM or wall clock
js/solve.js           the exact scheduling solver
js/generate.js        (seed, shift) -> a board
js/main.js            fixed-timestep loop, hold input, the gap readout
test/harness.mjs      engine loader + scheduling policies
test/switchboard.selftest.mjs   invariants — run by scripts/preflight.mjs
test/analysis.mjs     difficulty + shortfall report (on pressure-lab)
```

## The cell it fills

| | real-time | turn-based |
|---|---|---|
| **exact optimum** | **Switchboard** | Telegraph, The Ratchet |
| no ground truth | Hold the Line | — |

Everything in the family with action had no ground truth; everything measurable
was static. This is the empty cell.

Telegraph took the clock *away* from perfect information. Switchboard puts it
back and takes away everything else — so the player is never guessing at the
future, they are failing to physically keep up with one they can see.

**New tax: divided attention.** Not a shortage of time, options or futures — a
shortage of *you*.

## Why an exact optimum is possible

The shift is a single-machine scheduling problem: non-preemptive service,
release times, hard deadlines, maximise served value. That is exactly solvable
by a bitmask DP over subsets —

```
dp[S] = the earliest time by which every call in S can have been served
```

— because for a fixed set, finishing it as early as possible is always at least
as good for everything that follows. Fill `dp`, then take the highest total
value over the reachable subsets. 2¹⁶ × 16 transitions, a few milliseconds.

## What it measures

Every other game here reports a fraction of options or a survival flag. Here the
shortfall is **denominated in points**, so "how much worse than perfect" is
literally a number, and each costly commitment carries a price:

```
15 OF 29
−14 points behind the best possible shift.
  · took line 1 (call, 2.1s) at 2.7s — cost 8
  · took line 3 (call, 2.0s) at 5.4s — cost 6
```

A commitment is priced **as if honoured**. At the instant you take a long call
nothing is lost yet — you could still drop it — so a ceiling that allows
abandonment never moves and the report blames nobody. The cost of a commitment
only exists if the commitment is kept, which is exactly what the readout claims.

Like The Ratchet, the run is silent. The solver knows what every commitment is
costing and waits until the board clears to say so.

## Things the tools caught

The selftest's load-bearing property is unusual: **the solver and the sim must
agree exactly.** If perfect play cannot reach the number shown to the player,
that number is a reproach rather than a target and the premise is void. It
caught two real bugs, and my first two guesses at the cause were both wrong:

1. **The solver scheduled in continuous time; the sim runs on a 1/120s grid.**
   Every start rounded up, and across a chain of a dozen calls it compounded
   until a tight deadline slipped — perfect play missed its own optimum on
   **17 of 120** shifts. The solver now schedules on the same grid it will be
   executed on.
2. **The shift closed on a fixed timer** (`duration + 1.5s`), silently
   truncating calls the solver had legitimately scheduled past it. `duration`
   governs when calls *arrive*; it was never supposed to govern when they can be
   *finished*. A shift now ends when the board clears, which is guaranteed
   because every call has a deadline. That closed the last **6 of 120**.

Also: shifts used to open on an empty board, because the first burst was placed
at random. A shift that opens quiet teaches the player that nothing is urgent —
the opposite of the point.

## Balance

```bash
node games/switchboard/test/analysis.mjs 40
node games/switchboard/test/switchboard.selftest.mjs
```

Shortfall from perfect, over 120 shifts across eight levels:

| policy | mean points behind | perfect shifts |
|---|---|---|
| `newest` (control) | 5.72 | 6.7% |
| `edf` — earliest deadline | 5.11 | 1.7% |
| `richest` | 5.64 | 0.8% |
| `leastSlack` | 4.46 | 6.7% |
| `density` — value per second | 4.36 | 10.8% |
| `optimal` | **0.00** | **100%** |

Earliest-deadline-first is the textbook answer for a machine that may not miss
anything; this board is not that, and it comes fourth. The best simple rule
still gives up **~4.4 points a shift**, which is the headroom the game is made
of.

Boards force triage by construction: the optimum is 30–40% below the value on
the board, so something must always be abandoned.

## Known gaps

- Never tested on a physical phone. Hold-to-serve is a touch interaction and
  this is the game in the family that most needs real fingers on it.
- Perfect play is unbounded — a shift is "held" if you clear 75% of the optimum,
  which perfect play always does.
- 16 calls is a hard solver ceiling. Bigger boards need branch-and-bound.
