# The Forge — the ship's industrial metabolism

> The everything-factory of the upper rind, modelled as a **closed-loop production economy**. This is the
> design memo + the published verticals. The kernel is `forge.js` (pure, zero-dep, deterministic), pinned by
> `test/forge.selftest.mjs` (34 checks). Working name: **the Forge**.

## The premise (why the existing econ model isn't enough)

`v099/econ/econ.js` models a *social* economy — who works where, are needs met nearby. It has **no
conservation, no recycling, no tiers, no energy**, and raw materials appear from nothing (`grow.in = []`).
That's fine for a town; it's wrong for a **generation ship**, which is a **closed system**: every atom is
already aboard, nothing is mined fresh. So production isn't extraction from an infinite ground — it's
**cycling a fixed stock of conserved commodities** through transformation and back:

```
   scrap ──[reclaim]──▶ stock ──[build]──▶ deployed (machines · fixtures · …) ──[wear]──▶ scrap
      ▲                                                                                       │
      └───────────────────────────────────────────────────────────────────────────────────┘
```

## What the sibling wings taught it

- **biome — the master pattern.** A closed material loop where **conservation is structural, not tuned**
  (every flux is a paired transfer), and the **decomposer is the recycle valve**: pull it and litter piles
  while the pool crashes (the Biosphere-2 failure — *and a passing test*). An **oracle** scores whether the
  loop closes; a stability solver names the **keystone**. The Forge is its industrial cousin: the
  **reclaimer is the decomposer**, and the oracle measures closure the same way.
- **tide — the energy law.** Energy in → out, conserved to machine precision; `energyLedger().total_GW` is
  the budget. Every transformation **costs energy and dumps waste heat** — production is energy-bounded, not
  free. (Energy is tracked, not a conserved mass.)
- **iris — a closed water+heat cycle** in miniature; SI-unit, zero-dep discipline. Gives **water** as a
  shared commodity and the seam where coolant/heat balance.
- **rind — the substrate.** The ~33k-chamber foam graph + the spiral ramps / azimuthal roads (the logistics
  arteries). This is **where the factory will physically live and how material moves** — the layer the
  verticals get placed into as rooms/fixtures, later.

## The model

### Conserved commodities (the fixed material budget)

Seven, grounded but legible. Each is a **conserved stock** — total mass aboard is invariant, only its
**form** changes (usable `stock` ↔ `bound` in deployed things ↔ `scrap`).

| | commodity | total | what it is |
|---|---|---:|---|
| ⬡ | **metal** | 6000 | structure · machines · circuits (Fe·Al·Cu) |
| ◇ | **polymer** | 2500 | plastics · composites · insulation (C·H) |
| ◈ | **silicate** | 4000 | glass · ceramic · substrate (Si·O) |
| ≈ | **volatiles** | 1800 | chemical feedstock — solvent · fuel base (C·H·O·N) |
| ∿ | **water** | 3000 | coolant · solvent · life-support *(seam: iris·tide)* |
| ❧ | **biomass** | 1500 | food · fiber · bio-feedstock *(seam: biome)* |
| ✦ | **trace** | 600 | catalysts · dopants · rare elements — **the scarce keystone** |

### Products (the cross-commodity verticals' outputs)

What the factory builds, each a **bill of materials** drawn from several commodities, each wearing back to
scrap at its own rate (consumables wear nearly fully each step; structure wears slowest):

| | product | wears | recipe (mass/unit) | serves |
|---|---|---:|---|---|
| ⛓ | **structure** | 0.008 | metal·5 silicate·4 | the hull & decks — mass-heavy, slow-wearing |
| ▣ | **fixture** | 0.020 | metal·3 silicate·3 polymer·1 | rooms — beds, consoles, vats, the built world |
| ⚙ | **machine** | 0.040 | metal·6 polymer·2 trace·1 | the factory itself — robots, tools, the lines |
| ⊞ | **circuit** | 0.050 | metal·1 silicate·2 trace·2 | control — the Seven, the nav, the Signal gear |
| ◯ | **consumable** | 0.900 | polymer·1 volatiles·2 biomass·1 water·2 | daily use — food, medicine, packaging (used up fast) |

### The closure law (the one rule)

For every commodity, **reclaim capacity must meet or exceed its wear demand** (the mass that wears out of
deployed products per step at the setpoint). If the valve is narrower than the demand, scrap accumulates and
usable stock drains to zero — the factory starves. This is computed, not asserted: `wearDemand(config)` vs
`reclaimCap`. The wild type is sized with ~20% headroom everywhere:

| commodity | reclaim cap | wear demand | headroom | drawn by |
|---|---:|---:|---:|---|
| ⬡ metal | 66 | 50.6 | **+15.4** | structure·5 fixture·3 machine·6 circuit·1 |
| ◇ polymer | 60 | 47.6 | **+12.4** | fixture·1 machine·2 consumable·1 |
| ◈ silicate | 40 | 29.4 | **+10.6** | structure·4 fixture·3 circuit·2 |
| ≈ volatiles | 90 | 72.0 | **+18.0** | consumable·2 |
| ∿ water | 90 | 72.0 | **+18.0** | consumable·2 |
| ❧ biomass | 46 | 36.0 | **+10.0** | consumable·1 |
| ✦ trace | 13 | 9.6 | **+3.4** | machine·1 circuit·2 |

### Energy (tide's seam)

Each reclaim + build unit costs energy from a fixed budget per step (`energyBudget`, ← tide's `total_GW`).
If demand exceeds budget, **all work throttles proportionally** (energy-bounded production); the energy
spent becomes **waste heat** (the radiator seam back to tide). Mass conservation is independent of energy —
starve the budget and the factory grinds down, but **nothing is created or destroyed**.

## The oracle (does it close, and is it viable?)

`oracle(config)` integrates the dynamics to steady state and reports — biome's cousin:

- **conserved** — mass drift < 1e-6 (wild type: ~3.6e-12). Structural, always true, even mid-collapse.
- **closes** — does every commodity hold usable stock and keep scrap bounded?
- **score / tier** — `Closed · Lean · Leaking · Draining · Collapsing` (wild type: **100 · Closed**).
- **deployFrac** — did the factory hold each product's setpoint against wear?
- **throttle / energyOk** — was it chronically energy-starved?
- **keystone** — which reclaim valve, removed, breaks the loop worst (press-perturbation; wild type: metal).

The failure modes are **pinned as passing tests**: kill the metal reclaimer → metal scrap piles to ~5,975
while stock drains to ~0 and the four metal-products collapse (the oracle reports `!closes`, keystone metal,
mass still conserved). Starve the energy budget → chronic throttle. *Closing the loop is a thing you must
get right* — over 40 rolled configs (`rollConfig`), conservation always holds but the oracle spreads across
viability tiers.

## What this is, and what's next

This is the **spine** — the conserved cycle proven to close — not the factory yet. The deliberate sequence
(taking more care this time):

1. **Metabolism kernel + oracle + published verticals** — *this, done.* The closed loop, proven.
2. **Couple the seams** — energy from tide's ledger, biomass exchange with biome, water/heat with iris —
   so the Forge runs on the ship's real budgets instead of standalone constants.
3. **Place it in the rind** — bind processes (reclaimer, smelter, mill, assembler, line) to upper-rind
   chambers, route material along the rind roads (the logistics layer over the chamber graph).
4. **Rooms & fixtures** — the verticals become the game: robots, machines, assembly lines you walk among,
   in the nave/rind aesthetic. The kernel is what makes them *mean* something — a fixture that stops
   reclaiming is a loop you can watch start to leak.

Run: `node hoop/forge/test/forge.selftest.mjs`.
