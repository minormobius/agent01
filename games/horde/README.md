# Hold the Line — `/horde/`

A one-thumb horde-defence game. You are a fixed point at the centre of six
arcs; the horde walks inward; your gun overheats; and every wave you clear ends
with a six-second choice between three upgrade cards. If you don't choose, the
timer hands you the weakest one on the table.

Pure static — no worker route, no Durable Object, no build step. It serves
through the existing assets fallback in `games/worker.js`, exactly like
[`/gen/`](../gen/).

```
index.html          the shell — script tags in dependency order
css/horde.css       layout and chrome
js/prng.js          seeded rng, named streams
js/config.js        every tunable, the bestiary, the card pool
js/sim.js           the simulation — pure, headless, no DOM
js/render.js        canvas renderer + all cosmetic effects
js/sfx.js           a very small WebAudio synth
js/main.js          fixed-timestep loop, input, DOM overlays
test/harness.mjs    engine loader + bot policies
test/horde.selftest.mjs   invariants — run by scripts/preflight.mjs
test/balance.mjs    the difficulty-curve report
```

## The design, in one paragraph

The genre this copies advertises itself on *choice*, not shooting — the ad is
always a doorway with two numbers over it. So the choice is the game here, and
everything else exists to give the choice stakes. The mechanic that does that
work is **heat**: your focused arc does full damage but heats up, first drooping
(damage falls off) and then jamming outright, while unfocused arcs receive only
`spill` (8% of your DPS). That single constraint is what stops "allocate your
fire" from collapsing into "point at the worst arc" — you have to *order* your
attention, not just rank it.

Three verbs, deliberately: **aim** (continuous, drag round the ring), **grenade**
(tactical, on a cooldown, hits the focused arc hard and splashes to its
neighbours), and **the gate** (strategic, timed, once per wave).

## Determinism is load-bearing

The whole run comes out of the seed: spawn order, arc pressure, types, and every
card offered. `?seed=grum-317` is a permalink to a specific run. Waves and cards
draw from **separate** rng streams, so adding a card to the pool doesn't
reshuffle the horde — which means a balance change after a content change is a
real balance change and not just a different run.

Nothing in `sim.js` touches the DOM, reads a clock, or calls `Math.random`. The
renderer *does* use `Math.random`, for sparks and shake, and that is fine
precisely because those are not part of the reproducible run.

The loop runs a fixed 1/120s timestep with an accumulator. Not pedantry: the sim
is what the balance bot measures, so if frame rate leaked into it then a 144Hz
desktop, a 60Hz phone and the bot would all be playing different games.

## The bots are the balance tool

```bash
node games/horde/test/balance.mjs 400   # the difficulty-curve report
node games/horde/test/horde.selftest.mjs
```

`balance.mjs` plays N seeded runs under three focus policies and prints where
runs end, how long they last, which cards get taken, and what the director
planned for each wave. Three policies rather than one, because a single number
tells you nothing — the *gap* between `sweep` (blind rotation), `panic` (chases
the scariest arc, ignores heat) and `rotate` (reads heat too) is the game's skill
headroom. If `panic` ties `rotate`, the heat mechanic is decorative.

That is not hypothetical. It is what the first run of the report said, along with
every seed hitting the 40-wave cap. Two findings came out of it and both changed
the design:

- **The horde has to scale geometrically.** The player's power compounds — a card
  is a percentage and you get one per wave — so linear horde scaling means the
  player runs away with it for ever. `hpScale` is now `1.19^(w-1)`, slightly
  ahead of the player's curve, which is what makes a run end.
- **Repeatable cards need asymptotes.** Every repeatable was an uncapped
  multiply. A run that saw SPILLOVER six times had `spill` at 0.57, at which
  point direction stops mattering and the game stops being a game. SPILLOVER,
  TAR PITS, BANDOLIER, AUTOLOADER and COOLANT LOOP all have ceilings now.

One card also had to be rewritten outright. `CULL THE BACK` ("kill everything
past the halfway line, now") was a guaranteed no-op, because a gate only opens
once the field is already clear. It is now `SNIPER'S NEST`, the same fantasy as a
lasting effect.

Current curve, 300 runs: `sweep` median wave 11, `panic` 13, `rotate` 15 — and
taking the dregs at every gate instead of choosing costs you five waves
(median 10 vs 15). p10 11, p90 25, median run ~5½ minutes.

## Tuning

Everything lives in `js/config.js`. Move a number, re-run `balance.mjs`, read
the histogram. The knobs with the most leverage:

| Knob | Does |
|---|---|
| `spill` | how much direction matters at all. The single most important number |
| `droop` | what camping one arc costs. At 0.45 the mechanic was decorative; 0.60 is where reading heat pays |
| `hpScale` | the treadmill. This is what makes runs end |
| `waveBudget` | bodies on screen — readability, not difficulty |
| `gateTime` | how much the choice hurts |

## Known gaps

- Never tested on a real phone; verified in Chromium at 390×844, 844×390 and
  1280×900 via a Playwright driver.
- Only three of the four bodies get distinct silhouettes — walker, runner and
  swarm are all circles at different sizes, distinguished by colour.
- No persistence beyond a best-wave number in `localStorage`.
