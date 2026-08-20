# graze — four cilia, one bucket, and the whole food web

Live at [`poke.mino.mobi/graze/`](https://poke.mino.mobi/graze/). The
[`/qwop/`](../qwop/) cell with an energy budget bolted on, plus prey as well as
predators. Beating burns ATP, ATP is what you are out here to collect, and
beating is the only way to collect it. Fill the bucket and you divide, which is
the score.

The cell is imported from `../qwop/game.js` — same four detuned cilia, same
bundling, same steering, not one line re-implemented. `/qwop/`'s own balance is
untouched; where this variant needs different predator behaviour it wraps the
table rather than editing it.

## Files

- `index.html` — shell, overlays, input, main loop, long-form notes.
- `game.js` — the water column, the budget, prey, predators.
- `draw.js` — all rendering. No physics.
- `graze.selftest.mjs` — `node pokemon/graze/graze.selftest.mjs`. An experiment, not a checklist.

## Why this variant exists

In `/qwop/` the paper's headline — a real *Pterosperma* is stopped 96.6% of the
time, which the authors read as sit-and-wait behaviour — is a fact printed on a
panel. Here nothing sets it. Three pressures push on the same lever:

| Beating… | costs you |
|---|---|
| burns ATP | the dominant term in the budget; idling is nearly free |
| is heard | predators concentrate in the lit water near the surface, which is exactly where the food is |
| scatters your dinner | swarmers feel the flow of a hunting cell and bolt, further out the louder you are |

So the question is whether sit-and-wait *falls out* of them. The selftest sweeps
a family of scripted strategies over how long each rests between dashes, runs
them against the same oceans, and reports which banks the most growth:

| strategy | grew | divisions | quiet | lived |
|---|---|---|---|---|
| never moves | −0.55 | 0 | 100% | 126 s |
| sprints constantly | −0.31 | 0.25 | 25% | 31 s |
| rest 4 s | −0.26 | 0 | 39% | 105 s |
| rest 12 s | +0.07 | 0 | 62% | 135 s |
| **rest 96 s** | **+0.30** | **0.25** | **87.5%** | 150 s |

**87.5% quiet against the paper's 96.6%** — the right shape, not the same
number. Both extremes lose: the motionless cell because it can never climb to
the light, the sprinter because it is eaten and broke.

I predicted the curve would *turn over* at the quiet end and wrote an assertion
saying so. It does not — it rises and then plateaus. The test now asserts what
the data shows (a rise, then a flattening that brackets the optimum inside the
sweep) rather than what I guessed.

## The map is a water column

Light falls exponentially with depth (Beer-Lambert, real). The depth where
photosynthetic income exactly cancels basal cost is the **compensation
depth** — a real quantity in ocean biology — and it is drawn on screen.

**The cell starts below it.** That placement is the whole design. Movement is
not an optional flourish for the greedy; it is how you reach the light at all.
Start the cell *above* the line and a rock — a cell that never presses a key —
out-grows every strategy, which is the paper's 96.6% arrived at for entirely
the wrong reason and a game with nothing in it. That was measured, not
imagined; it is what the first balance did.

Two further structural pieces, both real oceanography and both there because
without them the prey layer is decoration:

- **Nutrient limitation.** Photosynthesis stops paying at 74% of the bucket.
  Sunlit surface water is famously nutrient-poor, which is exactly why so many
  flagellates there are mixotrophs. Without this ceiling the winning strategy
  was to climb into the light and hold still, eating nothing — `ate 0.0`.
- **Prey concentrate in the photic zone**, because the things a mixotroph grazes
  are themselves living on the light. Without it the cell parks in the light and
  finds nothing there.

## Bugs this found

- **Divisions were impossible.** Eating clamped energy to exactly the division
  threshold, and the next tick subtracted basal burn *before* the check — so
  the cell sat a hair under the line forever. Every strategy reported 0.00
  divisions for a long time without ever explaining why.
- **Predators spawned on your lap.** The initial restock filled the whole disc
  with `sqrt()` sampling, so a hunter could appear microns away and end a run in
  four seconds before the player touched a key.
- **The rest parameter did nothing.** The policy read its timer above the line
  that set it and picked a fresh target in the same frame, so all six settings
  of the sweep behaved identically — which the sweep faithfully reported, to six
  decimal places.
- **Rest suppressed climbing too.** Long-rest strategies never went to the
  light, sank below the compensation depth and starved in the dark, and the
  sweep read that as "resting is bad" when it had actually measured "never going
  to the light is bad".
- **Two experiments measured nothing.** The prey-flight test set `signature`
  from outside, which `tickCell` recomputes every frame; and its loud cell was
  eaten within a second, after which `tickGame` early-returns and the whole
  ocean freezes.

## What is invented

The cell is measured — see [`/qwop/`](../qwop/) and [`/flag/`](../flag/) for
which parts. The ocean is not. *Pterosperma* is a prasinophyte, an alga, so
photosynthesis is in character and the light curve is real; grazing is a
what-if, since mixotrophy is common among flagellates but is not something this
paper, or as far as I know anyone, has shown for this genus. The prey, the
predators, and every number in the budget are the game's — and the budget
constants were not chosen so much as *searched*, tuned until the experiment
above produced a real trade-off instead of a dominant rock.

> **Embodied behavioural complexity in a ciliated microorganism.**
> *Nature Communications* **17**, 8445 (2026).
> [doi:10.1038/s41467-026-75076-8](https://doi.org/10.1038/s41467-026-75076-8)

## Deploy

Part of the `pokemon` surface (worker `poke`, `pokemon/wrangler.jsonc`), served
as a subpath. No build step. See the repository root `CLAUDE.md`.
