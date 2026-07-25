# Telegraph — `/telegraph/`

A perfect-information tactics puzzle. Every enemy shows you the exact tile it
will hit at the end of the turn. Nothing is hidden, nothing is random, there is
no clock — and you still cannot stop all of it, because you have two units and
they are always outnumbered.

Pure static, no build step, served through the assets fallback in
`games/worker.js` like [`/gen/`](../gen/) and [`/horde/`](../horde/).

```
index.html            the shell — script tags in dependency order
css/telegraph.css     layout and chrome
js/prng.js            seeded rng, one stream per (seed, level)
js/rules.js           the rules — pure, headless, no DOM
js/generate.js        (seed, level) -> a board
js/solve.js           exhaustive turn search
js/main.js            DOM grid, input, the readout
test/harness.mjs      engine loader + play policies
test/telegraph.selftest.mjs   invariants — run by scripts/preflight.mjs
test/analysis.mjs     the choice-tightness report
```

## Why this exists

It is the companion piece to [`/horde/`](../horde/), built to hit the same nerve
from the opposite direction.

|  | Hold the Line | Telegraph |
|---|---|---|
| information | partial, moving | complete, still |
| pressure from | a six-second clock | consequence |
| skill | execution + triage | triage only |
| the question | *where do you point?* | *what do you allow?* |
| "was there a better play?" | a matter of opinion | **a number** |

That last row is the whole reason for building this one. Because there is no
hidden state and no randomness, a turn can be searched *exhaustively* — so after
every turn the game tells you exactly how many of the positions you could have
reached would have saved every node, and whether you found one of them.

## The rules

- **Nodes** are your infrastructure. A hit on one costs integrity; at zero the
  run ends. Your units may stand on a node to take the hit themselves. Enemies
  never *walk* onto a node — but you can **shove** them onto one, and an enemy
  standing on a node cannot shoot the tile under its own feet.
- **RAM** shoves an adjacent enemy one tile and deals 1. **MORTAR** strikes a
  tile at range 2–3 for 1 and shoves everything around it outward — including
  your own units.
- You will rarely kill anything. You have far more shoving power than killing
  power, so the game is about **redirection**: an enemy's attack is fixed
  relative to its facing, so moving the body moves the attack.
- Shoving something into a wall, a rock or another body deals 1 to it (and to
  what it hit). Most of your damage comes from collisions.
- Damage resolves **simultaneously** from positions fixed before any of it
  lands, so two enemies really can kill each other, and two hits aimed at a
  body both land on that body even if the first one kills it.
- A **spitter** strikes two tiles along its facing, flying *over* the tile in
  between — standing next to one is safe.

## The readout

After every turn:

> **CLEAN.** 47 of 812 positions saved every node. You found one.

or

> **MISSED.** 12 of 704 positions saved every node. You lost 1 integrity.

The count is deliberately shown *after* you commit. Shown before, it would be a
hint and you would brute-force it; shown after, it is the game telling you what
your decision was worth. `FORCED` means the solver found no clean line at all —
the damage was not your fault.

Outcomes are deduplicated by resulting board state, not by plan: two unrelated
actions taken in either order are the same decision, and counting that twice
would inflate the denominator and make the game look kinder than it is.

## Measuring the economy of choice

```bash
node games/telegraph/test/analysis.mjs 40   # choice-tightness report
node games/telegraph/test/telegraph.selftest.mjs
```

The report's headline is **tightness** — `clean lines / total distinct
outcomes`. Near 1.0 the board asks nothing; at 0 it asks the impossible. Current
distribution over 240 generated openings:

| band | share |
|---|---|
| impossible (0 clean) | **0.0%** |
| brutal (0–2%) | 51.7% |
| tight (2–10%) | 32.5% |
| fair (10–25%) | 12.5% |
| loose (25–50%) | 3.3% |
| trivial (>50%) | **0.0%** |

Median tightness falls from 11.2% at sector 1 to 0.5% at sector 10 — a
difficulty curve measured in how narrow the right answer is. Depth reached:
`idle` sector 2, `greedy` 4, `optimal` 7 (p90 9).

### Every opening is answerable

Zero impossible openings is a guarantee, not luck. The generator searches turn
one and, if nothing is clean, repairs the board — first by stationing a unit on
the most-battered node (granting capability), then by re-aiming a redundant
enemy, and only as a last resort by removing one. The first tightness report had
**one opening in five** that no move could answer; in a game whose whole promise
is "there is a right answer", that is a broken contract rather than a hard
puzzle.

The guarantee covers the *opening* only. Later turns can absolutely corner you —
that is the game.

## Things the tests caught

- **Resolution disagreed with the forecast.** Victims were looked up as damage
  was applied, so a unit killed by the first hit stopped blocking the second and
  the node behind it took a hit the telegraph never showed. In a game whose
  entire premise is "what you see is what happens", this voids every decision
  the player makes. Victims are now resolved against the pre-damage board.
- **Enemies parked on nodes.** They would walk onto your infrastructure and then
  be unable to shoot it, so boards went quiet and unreadable.
- **Over-correcting that broke the game.** Making nodes solid to enemies *also*
  blocked shoving them on top, deleting a whole class of answers — optimal play
  fell from sector 9 to 4 and 59% of boards became brutal. The rule needed to be
  narrower: they cannot walk there, you can put them there.

## Known gaps

- Never tested on a physical phone; verified in Chromium at 390×844.
- The solver is exact for two units. A third would make exhaustive per-turn
  search too slow to run while you wait, which is why there are two.
- Enemy AI is greedy and deterministic by design — it never bluffs, because a
  bluff is hidden information.
