# The Ratchet — `/ratchet/`

A road you cross once, with tools you can spend once. Every stage can be solved
with a tool or pushed through for supply; run out of supply and the run ends.
The whole road is visible from the start.

No clock, no opponent, nothing hidden — so nothing here is bad luck. The only
pressure is that **every choice permanently removes an option**, and there are
never enough tools for every stage.

Third in the [Pressure](../pressure/) family, after [Hold the Line](../horde/)
and [Telegraph](../telegraph/). Pure static, no build step.

```
index.html          the shell
css/ratchet.css     layout and chrome
js/prng.js          seeded rng, one stream per (seed, route)
js/rules.js         the rules — pure, headless, no DOM
js/solve.js         the viability solver
js/generate.js      (seed, route, supply) -> a road
js/main.js          UI, input, animation
test/harness.mjs    engine loader + play policies
test/ratchet.selftest.mjs   invariants — run by scripts/preflight.mjs
test/analysis.mjs   the difficulty + foresight report
```

## What it measures that the others cannot

Telegraph grades a turn: *"4 of 812 positions saved every node."* That is a
local judgement, and by the time it speaks, the turn is over.

Here the solver answers a different question after every single choice — **does
any future still complete this road?** — and says nothing. It waits. When the
run finally ends, it names the move that actually killed it:

```
STRANDED — route 1, stage 6

You did not lose here. You lost 4 stages ago, at stage 2, when you
scrapped your DECOY.

2 of the 3 options in front of you at that moment would have kept the
road open. You have been walking a dead route ever since.
```

Measured over failed runs by the naive policies: **58% keep walking after the
run is already unwinnable**, median 4 stages, up to 9. That gap is the whole
game.

### The run is deliberately silent

The solver could warn you the instant you err. It must not. Surfacing viability
live would announce the mistake at the moment you made it, and the distance
between the mistake and the news *is* the design. Telegraph can afford to grade
every turn because its turn has finished resolving; here the consequence is
still several stages in the future.

The one concession: after a route you **survive**, it reveals the narrowest
moment you passed through — which teaches without ever having spoiled anything.

## Why the state graph is shaped this way

Every action either advances a stage or consumes a tool, and nothing puts a tool
back except arriving at a cache — which also advances. So the state graph is
**acyclic**, and "does any future complete this road" is answerable exactly by
memoised depth-first search: no heuristic, no estimate, no depth limit needed.

The memo key is `stage | supply | kit` — everything the future depends on and
nothing else. Two different pasts that leave you in the same position have
exactly the same future, which is what keeps the search small enough to run on
every keystroke. The selftest checks the memoised search against an unmemoised
one, because everything the game tells you about your run comes through it.

## The rules

- Six tools; each solves two kinds of obstacle, and each obstacle is solved by
  two tools. Nothing is ever a lock-and-key, so every tool you spend was wanted
  somewhere else.
- **Push through** is always offered, even when it strands you. Choosing a death
  is different from being trapped in one, and the post-mortem depends on the
  distinction.
- **Scrap** turns a tool into 2 supply and does *not* advance you — a trade, not
  progress. Usually worse than spending the tool properly, which is the point:
  it is the escape hatch for a tool this road has no use for.
- **Caches** pay out for *solving* a stage, never for surviving it. That is what
  makes a stage worth spending on rather than merely absorbing.

## Balance

```bash
node games/ratchet/test/analysis.mjs 40      # difficulty + foresight report
node games/ratchet/test/ratchet.selftest.mjs
```

Current numbers:

| | |
|---|---|
| routes with a genuine fork | 0% at route 1 → **85%** at route 8 |
| narrowest choice, median | 100% at route 1 → **33%** at route 8 |
| foresight (eager) | median **4** stages, p90 7, max 9 |
| depth: hoarder / eager / thrifty | 1 / 2 / 2 routes |
| depth: optimal | unbounded — see below |

**Perfect play never loses, by construction.** Every route is verified
completable *with the supply you actually arrive with*, so a player who never
errs walks forever. That is the correct contract for a game whose entire premise
is "the run was winnable when it started, so losing it was something you did" —
but it does mean the score is a measure of your mistakes rather than of the
road's difficulty. Worth knowing before treating the depth numbers as a
difficulty curve.

The deficit — the number of stages you cannot possibly solve with tools — is the
engine, and its ramp is a narrow window. At `route/3` the roads go soft (median
narrowest-choice stays at 100% through route 5, almost nothing is ever fatally
committed). At `route/2` the squeeze arrives while there is still road left to
walk, which is the only place a foresight gap can exist.

## Things the tools caught

- **The trim loop was gutting every kit.** A tightening pass meant to stop
  trivial roads was removing two tools from a route planned for four, so every
  policy short of perfect died on route 1. Threshold raised to 0.94, one removal.
- **The opening is the wrong thing to measure.** The first choice on a road is
  meant to be forgiving; measuring it said every road was trivial. The honest
  metric is the *narrowest* choice along a perfect crossing, which is what the
  report shows now.
- **Pooling `hoarder` into the foresight histogram was a lie.** It fails by
  running the supply to zero, so its fatal move and its death are the same move
  by construction — 144 forced zeroes drowning the real distribution.

## Known gaps

- Never tested on a physical phone; verified in Chromium at 390×844.
- Perfect play is unbounded (above).
- Six tools and ten obstacle kinds is a small vocabulary; roads start to rhyme
  after a dozen routes. More kinds would cost nothing structurally.
