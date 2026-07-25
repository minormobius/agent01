# pressure-lab

Measurement scaffolding for the [`/pressure/`](../../games/pressure/) family of
games. Node-only, used from `games/<name>/test/*.mjs`. No build step, no
dependencies.

```js
import { spread, bandReport, BANDS_NARROW, ensure, histogram, pool }
  from "../../../packages/pressure-lab/lab.mjs";
```

## What this is not

**Not a solver.** Every game in the family measures a different thing about your
decision — that is the entire point of the family — so a shared solver would be
a lie:

| game | what "correct" means |
|---|---|
| Hold the Line | nothing exact; only better and worse |
| Telegraph | a countable set of clean lines |
| The Ratchet | whether a future still exists |
| Cold Read *(unbuilt)* | a timing — when to stop |
| Standoff *(unbuilt)* | a probability distribution |

Nothing useful is common *underneath* those. What is common is everything
wrapped **around** them — and that is where the bugs were.

## Why it exists

Three games independently grew the same scaffolding: a spread of bot policies,
quantile tables, a tightness histogram, a generate-check-repair loop, and the
same three selftest assertions. Each was hand-rolled with slightly different
thresholds, and four real design bugs hid in the differences:

- **A naive policy scoring the same as a good one.** Hold the Line's heat
  mechanic — the thing the whole game was designed around — was decorative for
  a whole draft. The tell was not a bad number; it was that the bot ignoring
  heat matched the bot reading it. `spread()` now *requires* a control policy
  and warns when nothing beats it.
- **A repair loop quietly deleting half of every kit.** The Ratchet planned
  four-tool kits and shipped 2.3, so every policy short of perfect died on route
  one. `ensure()` reports which repair fired how often and flags a
  content-deleting repair that fires constantly.
- **Measuring the opening choice** of a run whose opening is deliberately
  forgiving. True, and useless.
- **Pooling a policy that fails by construction** into a distribution, where it
  contributed 144 meaningless zeroes. `pool()` is explicit, must name what it
  includes, and prints why.

So the fixes are defaults and the traps are warnings.

## The pieces

| | |
|---|---|
| `quantile`, `summary`, `bar`, `pct`, `histogram` | stats and formatting; never mutate the caller's array |
| `BANDS_WIDE` / `BANDS_NARROW`, `classify`, `bandReport` | named verdicts for "what fraction of your options were correct" |
| `spread` | policy comparison — **requires a control** |
| `pool` | explicit, annotated distribution merging |
| `ensure`, `repairReport` | the generate-check-repair loop and its diagnostics |
| `checkDeterminism`, `checkTermination`, `checkContract` | the three assertions every game here needs |
| `section`, `warnings` | report layout, and printing findings loudly |

### Two band sets, and why

A tightness fraction is only comparable across games with comparable option
counts. Telegraph offers **~700** options per turn; The Ratchet offers **~5**.

The first version of this library shipped only `BANDS_WIDE`, and applying it to
The Ratchet declared 65% of routes "trivial" — because at five options the
smallest possible non-zero tightness is 20%, so every wide band below "fair" is
unreachable and the verdict is noise. Pick by the size of the decision, not by
the game.

### Compare like with like

`bandReport` warns when most states land in its loosest band. When The Ratchet's
report first fired that warning, the cause was pooling its deliberately gentle
routes 1–3 with deep ones — the exact trap `pool()` exists to prevent, committed
against the library itself. The analysis now bands routes 4+ only.

The warnings are heuristics over whatever population you hand them. They cannot
tell you that the population was the wrong one.

## Testing

```bash
node packages/pressure-lab/lab.selftest.mjs        # 48 checks; preflight runs this
node games/ratchet/test/analysis.mjs 40            # a real consumer
```

The lab is measurement tooling, so a bug in it does not crash anything — it
quietly reports the wrong number and a game gets tuned against it. That is worth
more testing than its size suggests, not less. Both bugs found by its own
selftest were of exactly that kind: `pct` not actually aligning its columns, and
`ensure` allowing only one repair per attempt when both real generators needed
"try the generous repair a few times, *then* fall back".

## Adding a game to the family

1. Keep the sim pure and seeded — no DOM, no clock, no `Math.random`.
2. Write the analysis **before** the pixels.
3. Give `spread()` at least one deliberately bad policy as the control.
4. Whatever your genre promises about its content — "there is always a right
   answer", "this road can be crossed" — verify it in the generator with
   `ensure()`, and order the repairs so the generous ones come first.
5. Read the warnings. They are the point.
