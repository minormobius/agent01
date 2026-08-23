# griddle — a house of pancakes, four keys

Live at [`poke.mino.mobi/griddle/`](https://poke.mino.mobi/griddle/). A
short-order pancake station: a squirt bottle of batter, a hot stove with one
seat, a spatula, and an order counter filling up.

Pure HTML + ES modules + Canvas 2D. No build step, no dependencies. Shares no
code with anything else on this surface — it is here because it is the same four
keys.

## Files

- `index.html` — shell, overlays, input, main loop, long-form notes.
- `game.js` — the iron, the cake, the spatula, the rail. All simulation.
- `draw.js` — all rendering. No simulation.
- `griddle.selftest.mjs` — `node pokemon/griddle/griddle.selftest.mjs`. An experiment, not a checklist.

## The design problem

A line cook does three things — pour, flip, plate. Handed to a player as three
buttons that is not a game, it is a stopwatch with extra steps. So what is the
layer underneath?

**You cannot see the face that is cooking.** The side that matters is against
the iron, and everything you know about it is inferred from the top: bubbles
opening, the rim going from wet to matte, the batter losing its shine. The flip
is the moment you find out whether you were right, and it does not come back.
Same conceit as [`/proteus/`](../proteus/README.md) — you see only what the cell
feels of itself.

| key | does |
|---|---|
| `Q` | squeeze the bottle. Volume builds while held, and the batter that landed first is already cooking while the rest arrives |
| `W` | ride the burner. It falls when you let go, the flame lags the key, and a cold cake drags the iron down ~20 °C |
| `O` | work the spatula under. Speed depends on how set the cake is; go at a raw one and you tear it |
| `P` | lift. **One motion** — release early and it lands back flipped, hold through and you carry it to the counter |

### Why the burner is the fourth key

Three tools, four keys, so the fourth has to earn its place. It does, because it
is what makes the bubble cue **lie**.

Browning is Maillard — Arrhenius, and steep: roughly a doubling every 15 °C.
Bubbling is gas release and steam, much flatter, nearer a doubling every 25 °C.
Measured off the model rather than asserted: over 165→215 °C **browning speeds
up 10.1× and bubbling only 4.0×**. So on a hot griddle the underside is burnt
before the top says it is ready, and on a cool one the top says go while the
underside is still pale.

There is therefore no correct bubble cue — only a correct cue *for the
temperature you are running*.

## What the selftest found

That claim is falsifiable, so it is run as an experiment. For each griddle
temperature, find the point on the **falling edge** of the bubbling that
produces the best cake, and see whether the answer moves. If it were flat, one
fixed rule would play optimally and the burner would be decoration.

It moves, hard — as a fraction of how hard the cake was bubbling at its peak:

| griddle | best moment to commit | best cake |
|---|---|---|
| 165 °C | 0.05 — wait until the bubbling has all but stopped | 0.70 |
| 175 °C | 0.40 | 0.74 |
| 185 °C | 0.95 — commit almost the instant it turns over | 0.73 |
| 195 °C | 0.95 | 0.68 |

Bringing the cool-griddle rule to a 195 °C iron drops the cake from 0.68 to
0.42. At 215 °C nothing saves you: the underside is golden *before the bubbling
has even peaked*, so the cue you would flip on has not happened yet when it is
already too late.

Then the whole station, each family allowed **one parameter** and made to live
with it across a cool, a correct and a hot service — the situation a cook is
actually in, since you do not get to retune your stopwatch for every griddle:

| how they decide when to flip | quality | sent back |
|---|---|---|
| by the clock, at a fixed time | 6.59 | 5.7 |
| by the cake, at a fixed point in the bubbling | 9.48 | 0.0 |
| **by the cake and the iron together** | **9.94** | 0.0 |

Reading the cake beats the clock by 44%, and the stopwatch scores **zero** on
the cool service — it cannot adapt, so it serves pale cakes that come back.
Reading the temperature as well adds a further 5%: a real margin, but a modest
one, and quoted as measured rather than dressed up.

## Things the experiment overturned

Every one of these was found by running the sweep, not by reading the code.

- **A stopwatch beat everything**, at first — correctly. With a bang-bang
  thermostat the griddle sits at exactly its setpoint, and at a genuinely
  constant temperature a timer is a perfect proxy for the cake. That is true of
  real kitchens too: thermostatted commercial plates are cooked by timer. The
  cue is not for a griddle that jitters, it is for one at the **wrong**
  temperature — which is why the comparison now spans three services.
- **The flame lag was too short.** 0.2 s let a controller pin the plate to a
  fraction of a degree. It is now 1.1 s, which is the right number physically
  (gas ring, then cast iron). Being honest: on its own that did *not* overturn
  the stopwatch result — the iron's own time constant is long enough that
  bang-bang still holds it.
- **An absolute bubble threshold saturates.** The peak crater density itself
  moves with temperature (0.54 at 165 °C, 0.75 at 185, back to 0.54 at 205), so
  a threshold set above the peak degenerates into "flip the instant it turns
  over" and stops depending on its own parameter — which made every
  temperature-aware policy byte-identical to the fixed one. The cue is now a
  **fraction of peak**, which is also what a cook actually perceives.
- **The counter had no standards.** At a 0.25 pass mark a stone-pale cake scored
  0.58 and went out, because it was perfectly even and exactly the right size.
  Colour now multiplies rather than adds, and the bar is 0.45.
- **The serve rule watched the wrong face.** A flip swaps them, so after it `up`
  is the *finished* first side, frozen forever. A rule waiting on `up` either
  fired instantly (serving a raw second side) or never (burning the cake). It
  quietly wrecked every full-game number for several iterations, and none of the
  isolated experiments could see it because they cook side two by timer.
- **The rail was too fast** for a cool griddle to be viable at all, which
  collapsed the interesting decision — run hot for throughput and risk the burn,
  or run cool and safe and fall behind — into no decision at all.

## What is honest and what is invented

The **shape** is real: Maillard browning is steeply temperature-dependent while
gas release is much flatter; batter sets from the griddle upward; the rim dries
before the middle; bubbles stop breaking through once the top skins over. That
last one is why "cook until the bubbles stop refilling and the edges look dry"
is the instruction everyone is given, and it is not scripted here — the cue's
rise-and-fall falls out of gas release against a setting surface.

The **numbers** are a game's. Nothing here is transcribed from a measurement the
way [`/flag/`](../flag/README.md)'s constants are.

The clock runs **15× real speed** — golden in 70 real seconds becomes golden in
4.7 played seconds. The temperature curves and their doubling constants are
*not* scaled, so the burnt-versus-pale trade-off is the real one running fast.
The player's own actions — pouring, sliding, carrying — are on **wall time**,
because those are things a hand does rather than reactions in the batter.

`index.html` exposes `window.__griddle()` for headless driving, returning the
input state as well as the station: what a browser check can establish that the
node selftest cannot is whether the keys are wired up. Verified in real Chrome —
all four keys independent and simultaneous, the pad mirroring them, `blur`
releasing everything, no console errors, no horizontal overflow. That check is
ad hoc, not in `preflight`, like the rest of this surface.
