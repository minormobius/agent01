# Masons and worms — the two-agent phase space

What `phase.mjs` found, at seed 48112 on the cubic lattice, deterministic. The
page version with figures is what `phase-report.mjs` renders from the JSON;
the tables here are the numbers that matter. Ticks are engine ticks: every
mason and every worm moving once.

## The framing

- **Masons are a rate, not a front.** One mason or sixteen lay the same crystal
  with the same terraces; sixteen lay it seventeen times faster. A mason lays,
  returns to the melt, and re-arrives along a ray at a random edge, so one mason
  samples every front. Fronts are the terrace rule's verdict on the shape.
- **The potential is the budget.** Without worms the terminal mass is exactly
  `budget × (1 + coolExtra)`. The shape at that mass is the terrace rule's.
- **Worms are decomposers, not predators.** They eat the standing structure,
  never the masons. With recycling the pair is a nutrient cycle: producer,
  structure, decomposer, pool. Without it they are a sink.

## D · one mason or sixteen (crystal at 2,000 bricks)

| masons | ticks to 2,000 | ticks/brick | fed sites | terraces | box |
|---|---|---|---|---|---|
| 1 | 489,316 | 244.7 | 911 | 10 | 29×27×14 |
| 2 | 230,704 | 115.4 | 930 | 12 | 25×31×13 |
| 4 | 116,407 | 58.2 | 884 | 11 | 27×30×14 |
| 8 | 64,882 | 32.4 | 957 | 11 | 29×29×15 |
| 16 | 28,362 | 14.2 | 948 | 10 | 26×30×15 |

## A · the sink (budget 4,000; 3 worms × speed 0.04 × bite; released at 600 bricks; 300k ticks)

Free lay rates: 1 mason 0.006, 2 → 0.018, 4 → 0.028, 8 → 0.061, 16 → 0.103
bricks a tick. Worm pressure P = 3 × 0.04 × bite.

**Recycling off:** every cell with any worms is on its way to zero; the masons
stop at the budget and the drain does not. Life ≈ budget ÷ P. Collapse inside
the window from P ≥ 0.036 for every colony size; P = 0.012 outlives the window
(needs ~330k ticks).

**Recycling on:** the melt is a closed pool and the crystal holds a mass where
laying matches biting. 16 masons against P 0.12: ~900 bricks standing while
~25,000 pass through in 300k ticks. Collapse only when P exceeds what the
colony can lay (P 0.12 against ≤ 8 masons).

**Healing.** A bite leaves a kink; kinks fill first. Bricks laid into a site a
worm had emptied (recycling off):

| masons | P | eaten | healed | of wounds | laid | of laying |
|---|---|---|---|---|---|---|
| 1 | 0.012 | 3,318 | 1,890 | 57% | 3,107 | 61% |
| 2 | 0.012 | 3,378 | 1,620 | 48% | 3,301 | 49% |
| 4 | 0.012 | 3,316 | 1,028 | 31% | 3,729 | 28% |
| 8 | 0.012 | 3,334 | 547 | 16% | 3,835 | 14% |
| 16 | 0.012 | 3,282 | 128 | 4% | 3,832 | 3% |
| 8 | 0.036 | 4,601 | 1,514 | 33% | 4,001 | 38% |

The masons under attack lay well below their free rate (8 masons: 0.018 a tick
against P 0.012, free 0.061): the effort goes into repair, and repair only
reaches wounds the terrace rule feeds. A hole in the middle of a face, or deep
inside, starves like any face centre. The Berg effect is the immune system's
blind spot: grazers (`depth −1`) are healed, miners (`depth +1`) are not.

## B · released at mass M₀ (8 masons, budget 20,000, no recycling, 150k ticks)

| M₀ \ P | 0.006 | 0.012 | 0.024 | 0.048 | 0.096 |
|---|---|---|---|---|---|
| 100 | growing 2,311 | growing 1,679 | steady 1,039 | eroding 665 | eroding 149 |
| 200 | growing 2,066 | growing 1,480 | growing 1,332 | steady 689 | eroding 153 |
| 400 | growing 2,172 | steady 1,490 | eroding 1,114 | eroding 771 | collapse 0 |
| 800 | growing 2,361 | steady 1,699 | steady 1,294 | growing 1,277 | growing 549 |
| 1,600 | steady 3,038 | steady 2,098 | steady 1,380 | eroding 587 | collapse 0 |

A threshold in P, not monotone in M₀: the 800-brick crystal healed at 0.07 a
tick under the heaviest drain and the 1,600-brick one at 0.019. Shape, not
mass, decides whether a crystal can defend itself; a bigger hopper has more
face where nothing is fed.

## C · worms that breed (`spawnAfter`, `starve`; recycling on)

First grid (4 worms × speed 0.08 × bite 0.2, 8 masons): a bloom in every cell —
per-capita appetite 0.016 a tick, eight worms already exceed the producer.

Second grid (budget 30,000, released at 1,500, speed 0.04, 300k ticks):

| masons | bite | split after | fade after | at 300k | run on |
|---|---|---|---|---|---|
| 16 | 0.01 | 5 | 150 | founders fade, crystal grows | — |
| 16 | 0.01 | 5 | 400 | bloom (801 worms) | — |
| 16 | 0.01 | 15 | 150 | founders fade | crystal at 35,677 by 3M ticks |
| 16 | 0.01 | 15 | 400 | 59 worms, still rising | 1,067 worms, crystal eaten to 0 at 703k |
| 16 | 0.03 | any | any | bloom → collapse | — |
| 32 | 0.01 | 15 | 400 | 110 worms, still rising | 801 worms at 559k, crystal 966 and falling |
| 32 | 0.03 | any | any | bloom → collapse | — |

Two fates, no third: **extinction** when a worm cannot eat its split quota
before it fades, **a bloom** otherwise, fast or slow (the "steady" cells at
300k were blooms caught early, doubling every ~60k ticks). No cycles in any
cell and no interior equilibrium. The mechanism: a worm inside a crystal has
a brick under it at every step, so its intake per move is the bite
probability whatever the crystal's mass — it grows on a stock, not a flux,
and nothing slows it until the stock is gone. Overshoot, not Lotka–Volterra.
The producer's capacity sets how big the crystal gets before the bloom
catches it, not whether it does.

## C3 · grazers (`exposed 3`, `depth −1`: only bricks with ≤ 3 bonds are edible)

A functional response: intake bounded by the crystal's surface. 16 masons,
split after 15, fade after 400, recycling on, released at 1,500.

| crystal | bite | held at | for | then |
|---|---|---|---|---|
| uncapped (budget 300,000) | 0.05 | 6–16 worms | 700k ticks | bloom to 907, crystal (13,600) eaten to 0 at 944k |
| capped at 6,000 | 0.05 | 4–12 worms | 480k ticks | grazers die out (35 born, 39 faded); crystal intact at 5,980 |
| capped at 3,000 | 0.05 | 12–18 worms | 200k ticks | collapse at 279k (139 worms) |
| capped at 6,000 | 0.1 | — | — | bloom, collapse at 108k |
| uncapped | 0.05, exposed 2 | — | — | founders fade; nothing is edible enough |

On an uncapped crystal the surface grows with the mass until it can feed a
bloom: the crystal grows itself into its own consumer. On a capped crystal
the grazers eat corners and edges, the masons heal them while the colony is
live, and after the cool-down the grazers are smoothing a crystal with fewer
and fewer edges to give — they erode their own niche and starve. A smaller
crystal (higher surface-to-mass) loses instead. Long coexistence, eight times
the crystal's own growth time, but not a fixed point.

## Next

- Shape as potential: B across habits at equal mass (towers should defend, plates not).
- Miners (`depth +1`) at the same drain: hollowed into a shell that fails at once, a different collapse.
- The grazers' fixed point: a colony that never cools (budget beyond the window) with `exposed 3`, so healing never stops.
- `birthEvery` on the masons with breeding worms, and a law that lets a worm eat a mason: the first place cycles could appear.
- Tilings: coordination number changes the walk, the healing, and what "exposed" means (kagome triangles have three edge-neighbours, hexagons six); the grazers' coexistence time should move with it.

```bash
node packages/bismuth/phase.mjs --exp A --out /tmp/A.json      # ~10 min each for A, B; C2 ~7 min; D ~1 min
node packages/bismuth/phase-report.mjs /tmp/A.json /tmp/B.json /tmp/C.json /tmp/C2.json /tmp/D.json --out report.html
```
