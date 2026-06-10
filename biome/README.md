# biome — life-support modelling for an infinite O'Neill cylinder

**Live at:** `biome.mino.mobi`
**Stack:** Cloudflare Worker (ASSETS binding) + vanilla ES modules. No build step.
**Deploy:** `.github/workflows/deploy-biome.yml` — `wrangler deploy` on push to `biome/**`.

Tooling for thinking about the **interior** of an infinite (no end-caps) O'Neill
cylinder run as a **bio-engine**: a linear sun on the spin axis, vegetation on the
inner surface of the structural Voronoi rind, and the enclosed air/water/soil doing
the work of a closed life-support loop. Companion to the structural work in
[`/hoop`](../hoop) (which models the rind itself) — this is the volume *inside* it.

The site is a **suite of modules**, built in dependency order — close the resource
books first, resolve them in space second, render them third:

| Module | Path | Status |
|---|---|---|
| **1 · Resource cycles** — closed-loop life-support box model | `cycles/` | **live** |
| **2 · Radial atmosphere** — 1-D `r`-column (temp/humidity/CO₂ vs altitude) | — | planned |
| **3 · Interior visualiser** — WebGPU O'Neill interior with rendered atmosphere | — | planned |

The landing page (`index.html`) frames the premise and links the modules; each module
is self-contained under its own directory.

## Why this shape of tool

The cylinder interior has a counterintuitive thermal layout that drives everything:

- **"Up" (toward the axis) wants to be hot, not cold.** The linear sun is on the
  axis; the cold sink is the shell radiating to space at the rim. That's the
  *inverse* of Earth, where up is cold. The consequence isn't just "condensation on
  the edges" — it's **permanent stratification**: warm air rises to the axis and
  stays there (no cold ceiling to re-densify it), so the steady state is a thin
  convective weather layer near the vegetated surface under a hot, stable core.
- **The water cycle goes dew-dominated, not rain-dominated.** Adiabatic cooling
  from axis to rim is tiny (gravity `g(r)=ω²r` falls to zero at the axis), so the
  whole atmosphere spans only ~16 K and ~17% pressure drop for an Island-Three-scale
  cylinder. Not enough thermodynamic room to build rain clouds. Condensation happens
  within metres of the cold surface — **fog under the canopy, dew drip**, like a
  cloud forest. Your instinct is right.
- **The trap:** the same stratification that gives gentle dew irrigation also
  **suppresses vertical mixing of CO₂**. A photosynthesising canopy depletes CO₂ in
  its own boundary layer within minutes; on Earth wind resupplies it. Here the fog
  that waters the plants and the stagnation that starves them of CO₂ are the *same*
  phenomenon. The mixing pump has to come from within the symmetry — the photoperiod
  thermal tide (pulse the sun) is the natural candidate, and Coriolis (ω≈0.055 rad/s,
  ~800× Earth) is strong enough to organise any radial flow into bands/rolls.

Before any of that spatial detail matters, the **zeroth question** is whether the
loop can close at all as stocks and flows. That's Tool 1.

## Module 1 — the closed-ecosystem box model (`cycles/`)

A non-spatial, deterministic stocks-and-flows model of the cylinder interior as a
living **food web** — not a farm. Zero dependencies, runs identically in node and the
browser. Drive it from the dashboard (`cycles/index.html`, live at
`biome.mino.mobi/cycles/`) or import `cycles/sim/cycles.mjs`.

### The food web

| Guild | Pools | Role |
|---|---|---|
| **Producers** | crops, fruit trees, swamp reeds | fix CO₂ → biomass; feed the food store + litter |
| **Pollinators** | pollinator biomass | forage the producers; **gate tree fruit set** |
| **Predators** | predator biomass | eat pollinators; top-down control |
| **Decomposers** | living microbial/detritivore biomass | eat litter, respire it back to CO₂ |
| **Crew** | (a count) | eat the food store, breathe |
| **Stores** | litter, food, CO₂/O₂/N₂, water | detritus, harvest buffer, atmosphere |

Why an ecosystem and not a crop: a single crop pool with a passive litter-decay term
has nothing vigorously cycling carbon, so ambient CO₂ falls, productivity self-strangles,
and the food store collapses to zero. Living decomposers and perennial standing biomass
pump carbon around fast enough that the harvest outpaces the crew and **food accumulates**.

### What makes it verifiable

Every ecological interaction is either a **carbon transfer between pools** or the
canonical respiration reaction. Eating decomposes into

```
ingestion  =  egestion (→ litter)  +  respiration (→ CO₂)  +  production (→ consumer)
```

and respiration / photosynthesis are exact inverses:

```
CH₂O + O₂ → CO₂ + H₂O          (respiration of anything alive)
CO₂ + H₂O → CH₂O + O₂          (photosynthesis, the exact reverse)
```

Photosynthate is carbohydrate-equivalent (CH₂O), so carbon, hydrogen and oxygen are
conserved **by construction — no matter how many trophic levels are stacked.** The
self-test checks the RK4 integrator against that invariant (drift < 1e-9 over a
model-year). Nitrogen rides a separate, independently conserving loop (fixation →
mineral → biomass → litter → mineralise → denitrify).

### The insights it's built to surface

1. **A food web that *closes*.** Producers, pollinators, predators and decomposers
   reach a coexisting steady state: CO₂ holds (~840 ppm), pollinators persist so fruit
   sets, and the food store steadies at a multi-day buffer instead of collapsing.
2. **Pollinators gate the harvest (the mutualism).** Fruit set saturates with pollinator
   population. Crash the bees and the trees stop fruiting — a chunk of the food supply
   vanishes even though the trees are alive.
3. **Trophic cascade.** Crank predator pressure: predators suppress pollinators, fruit
   set falls, food supply drops. The whole web is coupled; you feel it in the calories.
4. **CO₂ is regenerated by the living soil.** Decomposers respiring litter are what
   keep ambient CO₂ up. Throttle them (`decomposerIngest_perday`) and litter piles up
   while CO₂ crashes and the producers starve — the real Biosphere-2 failure mode, now
   an emergent population dynamic rather than a fixed rate.
5. **Calories are the hard part; area is the lever.** Air closes easily; full dietary
   closure needs a *lot* of ecosystem (hundreds of m²/person). The food-store-collapse
   you see at small areas is real — push the (generous) area sliders up and the store
   sustains. That's the fix, not a hack.

### Run it

```bash
node biome/cycles/test/cycles.selftest.mjs   # 16 checks: conservation, bounds, food-web behaviour, determinism
open  biome/index.html                       # landing page → Module 1 dashboard at cycles/
```

### Knobs (all in `defaultParams()`)

crew · per-guild areas (crop / fruit-tree / reed) · sun duty cycle · fruit reliance on
pollinators · predator pressure · decomposer activity · per-guild fixation, assimilation,
respiration, mortality and carrying-capacity fractions · N fixation/denitrification ·
air-box volume · water reservoir. Every number is sourced from closed-ecology literature
(BIOS-3, MELiSSA, Biosphere-2), ecological energetics, and NASA BVAD human factors; all
are documented inline at their definitions.

### Known simplifications (also exported as `KNOWN_SIMPLIFICATIONS`)

- Nitrification's O₂ cost isn't coupled to the gas balance (small vs. the biotic C
  respiration, which *is* modelled).
- All biomass shares one average C:N; per-guild stoichiometry not separated (N still
  conserves exactly).
- Photosynthate is carbohydrate-equivalent; lipid/protein energy density not split.
- **Single well-mixed air box — no radial structure.** That's the whole point of
  Module 2. This model tells you *whether* the loop closes; it can't tell you *where*
  the fog sits or whether CO₂ stratifies into a dead zone.
- Temperature is a fixed parameter (no thermal feedback on metabolic rates yet).
- Pollination is a population gate, not individual flower visitation; the predator
  guild is lumped (one tier of "things that eat pollinators").
- Trace-gas / ethylene buildup (a real closed-ecology hazard) not modelled.

## Module 2 — 1-D radial atmosphere column (planned)

A `r`-only profile model: temperature, pressure, humidity and CO₂ as functions of
radius and time. This is where "up is hot", the saturation/dew profile, the
stratification, and the photoperiod mixing pump live. Cheap, deterministic, fully
testable — parameterises Coriolis/convection as a mixing coefficient rather than
simulating it. Answers: *where is the fog, how thick, does CO₂ stratify into a dead
zone, does pulsing the sun break the inversion enough to ventilate the canopy.*
Feeds its surface boundary conditions from Module 1's steady state. Will live in `atmosphere/`.

## Module 3 — WebGPU interior visualiser (planned)

The iconic O'Neill view — looking "up" and seeing more land curve overhead — but
with the **atmosphere** rendered: the linear axial sun, the canopy on the inner
surface, fog banding by altitude (from Module 2), and optionally a compute-shader
`(r,θ)` slice showing Coriolis-organised convection rolls. Fed by Modules 1 and 2, so
it visualises validated state, not assumptions. Will live in `interior/`.

## Layout

```
biome/
├── index.html                    # landing page — the suite overview + module cards
├── worker.js                     # assets worker (+ /health); model runs client-side
├── wrangler.jsonc                # name=biome, custom_domain route biome.mino.mobi
├── README.md                     # this file
└── cycles/                       # MODULE 1 — resource-cycle box model
    ├── index.html                # the dashboard (vanilla, no build step)
    ├── sim/cycles.mjs            # the box model (pure, zero-dep, node + browser)
    └── test/cycles.selftest.mjs  # headless proof: conservation + bounds + insights + determinism
```

This directory is intentionally separate from `/hoop` (structural rind) — the two are
complementary halves of the same habitat and shouldn't collide on files.
