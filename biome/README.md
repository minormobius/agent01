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
| **2 · Radial atmosphere** — 1-D `r`-column (temp/humidity/CO₂ vs altitude) | `atmosphere/` | **live** |
| **2b · Fountain &amp; sun** — azimuthal cross-section: the water-cycle jet + luminous-flux budget | `fountain/` | **live** |
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
  from axis to rim is set by the cylinder size: an Island-Three-scale habitat (3.2 km)
  spans only ~16 K and ~17% pressure drop, while the build modelled here (an **8 km**
  habitat wall — see `shared/geometry.mjs`) spans **~39 K and ~37%** — a colder, thinner
  axis. Either way condensation happens near the cold surface — **fog under the canopy,
  dew drip**, like a cloud forest (and the big cylinder runs nearly overcast). Your
  instinct is right.
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

A non-spatial, deterministic, **data-driven** stocks-and-flows model of the cylinder
interior as a living **food web** — not a farm. Zero dependencies, runs identically in
node and the browser. Drive it from the dashboard (`cycles/index.html`, live at
`biome.mino.mobi/cycles/`) or import `cycles/sim/cycles.mjs`.

### The food web is data

The organisms and their relationships are two arrays (`defaultCommunity()`), and the
derivative function loops over them — there is **no per-organism code**. The default
community is six organisms; adding a seventh is appending a stat block and an edge.

```js
species: [
  { id:'tree', kind:'producer', area_m2:6000, fix:1.1, autoResp:0.35, turnover:0.0068, … },
  { id:'pollinator', kind:'heterotroph', ingest:0.25, assim:0.55, resp:0.05, mort:0.02, … },
  … ]
interactions: [
  { type:'trophic',    consumer:'pollinator', resources:['crop','tree','reed'], halfSat:4000 },
  { type:'trophic',    consumer:'predator',   resources:['pollinator'],          halfSat:120  },
  { type:'trophic',    consumer:'decomposer', resources:['litter'],              halfSat:10000 },
  { type:'pollinates', animal:'pollinator',   plant:'tree', halfSat:200, fruitPerday:0.02 },
]
```

Two kinds of species: a **producer** fixes CO₂ (light/CO₂-limited), respires a fraction
back, and turns biomass over into food + litter; a **heterotroph** grows only by eating
(its trophic edges), and pays maintenance respiration + density-dependent mortality. A
*decomposer* is just a heterotroph whose edge points at the `litter` pool; a *predator*
is one whose edge points at another animal. The self-test includes a case that drops in a
7th organism (an omnivorous bird) and confirms conservation stays exact.

| Default guild | Role |
|---|---|
| **Producers** (crops, fruit trees, swamp reeds) | fix CO₂ → biomass; feed the food store + litter |
| **Pollinators** | forage the producers; **gate tree fruit set** |
| **Predators** | eat pollinators; top-down control |
| **Decomposers** | eat litter, respire it back to CO₂ |
| **Crew** | eat the food store, breathe |

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
   keep ambient CO₂ up. Throttle them (the decomposer's `ingest` rate — the *Soil /
   decomposer activity* slider) and litter piles up while CO₂ crashes and the producers
   starve — the real Biosphere-2 failure mode, now an emergent population dynamic.
5. **Calories are the hard part; area is the lever.** Air closes easily; full dietary
   closure needs a *lot* of ecosystem (hundreds of m²/person). The food-store-collapse
   you see at small areas is real — push the (generous) area sliders up and the store
   sustains. That's the fix, not a hack.

### Run it

```bash
node biome/cycles/test/cycles.selftest.mjs      # 17 checks: conservation, bounds, food-web behaviour, extensibility, determinism
node biome/cycles/test/allometry.selftest.mjs   # 13 checks: Kleiber scaling, calibration, individuals↔biomass
node biome/cycles/test/roster.selftest.mjs      # 13 checks: real-organism roster compiles, closes, conserves; provenance
node biome/cycles/test/linalg.selftest.mjs      # 15 checks: inverse + symmetric/general eigenvalues vs known spectra
node biome/cycles/test/stability.selftest.mjs   # 11 checks: stability verdict + eigenvalue/decay cross-check
node biome/cycles/sim/enrich-roster.mjs         # (network) refresh iNat imagery + GloBI diet → roster.enriched.json
( cd biome/cycles/solver && cargo test )        # 6 checks: the Rust stability kernel vs known spectra
open  biome/index.html                          # landing → Module 1 dashboard (cycles/) → Stability lab (cycles/stability.html)
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
- **Metabolic rates can be hand-entered or derived from body mass** via the allometry
  layer (`cycles/sim/allometry.mjs`, below). What's still missing is the *roster* — pulling
  real organisms (iNaturalist identity + GloBI diet edges) so masses and edges aren't
  typed by hand.

### The allometry layer (`cycles/sim/allometry.mjs`)

Hand-tuning eight numbers per organism doesn't scale to a roster of real creatures. This
layer **derives** a heterotroph's stat block from **one observable trait — body mass** —
plus two tags: thermy (`ecto`/`endo`) and feeding guild. The physics is Kleiber's law:
whole-organism metabolism scales as M^¾, so the *mass-specific* rates the box model needs
(its pools are biomass, not individuals) scale as **M^(−¼)** — small things live fast, big
things live slow. Endotherms burn ~×18 an equal-mass ectotherm. Guild sets assimilation
efficiency and tissue C:N.

```js
import { makeAnimal } from './cycles/sim/allometry.mjs';
const bees = makeAnimal({ id:'pollinator', mass_g:0.1, guild:'nectarivore', thermy:'ecto',
                          count:60000, eats:['crop','tree','reed'], plant:'tree' });
// → { species:{ ingest, assim, resp, mort, capacityFrac, initBio, … }, interactions:[…] }
```

**The validation that matters:** anchored on the honeybee (0.1 g ectotherm nectarivore →
the tuned pollinator), the layer *reproduces the hand-tuned default predator* as a ~0.27 g
ectotherm carnivore to within a few percent. The working community was already
allometrically consistent — the layer recovers what we hand-fit rather than guessing. The
self-test (`allometry.selftest.mjs`, 13 checks) proves the scaling exponents, the
calibration, the individuals↔biomass conversion, and that a community built *entirely from
body masses* closes the loop and conserves C/H/O/N exactly. (Producers stay area-based — a
canopy is parameterised by area, not body mass.)

### The real-organism roster (`cycles/sim/roster.mjs`)

Where the allometry layer supplies the *rates*, the roster supplies the *organisms*: a
curated list of real species — Western honey bee (*Apis mellifera*), cross orbweaver
(*Araneus diadematus*), sweet potato, apple, common reed, springtail (*Folsomia
candida*) — each with a scientific name, a body mass, a guild, and a hand-curated diet.
`buildCommunity()` runs every animal through `makeAnimal()` (so its eight rates are
*computed*, not typed) and resolves the diet names into the engine's trophic and
pollination edges. Pick organisms by name → get a `{species, interactions}` that runs.

The diet isn't asserted, it's **corroborated**. `enrich-roster.mjs` fetches each species'
iNaturalist taxon id + photo (identity + imagery) and its GloBI (Global Biotic
Interactions) observed-`eats` list, and commits `roster.enriched.json`. The engine never
reads that file — it's documentation/imagery — but the self-test cross-checks it: the
orbweaver's real observed prey include Hymenoptera (the order the honey bee belongs to),
so the curated `spider → bee` edge is backed by field data. The whole all-real community
closes the loop and conserves C/H/O/N to ~4e-15, and pulling the honey bee out still
collapses apple fruit set — the mutualism survives the swap from abstractions to species.

The one honest stand-in: the decomposer. Real decomposition is microbial (bacteria/fungi
have no body mass to scale), so the roster represents that compartment with a springtail
whose fast per-gram rates approximate it — flagged `microbialProxy` on the entry.

### The stability solver (`cycles/sim/stability.mjs` + `cycles/solver/`, lab at `cycles/stability.html`)

A 600-day run tells you *what happens*; the solver tells you the *fate* of the steady state
directly, from its linearization — the query an ecosystem-builder needs at interactive speed.
At equilibrium it builds the **community matrix** J (∂each species' growth / ∂every species'
biomass, by finite-differencing the *real* nonlinear model — Monod foraging, density
dependence, pollination gating — with the fast abiotic pools slaved but **litter kept in the
subsystem**, since litter is the decomposer's resource). Then it reads three classic results
off J:

- **Asymptotic stability** (May 1972): stable iff every eigenvalue has negative real part.
  The spectral abscissa α = max Re(λ) is the verdict; −1/α is the **return time**; a complex
  rightmost pair means the return *oscillates* (predator–prey ringing) with period 2π/|Im λ|.
- **Reactivity** (Neubert & Caswell 1997): λmax of the symmetric part (J+Jᵀ)/2 — whether a
  stable web still *amplifies* a shock before settling.
- **Press perturbations** (Bender 1984): a sustained nudge to species j shifts the whole
  equilibrium by the j-th column of −J⁻¹; column magnitude ranks **keystones**.

**The validation that matters:** the self-test perturbs the real model at equilibrium,
integrates, and confirms the measured time-domain decay rate matches the eigenvalue-predicted
α — the linear verdict is checked against the nonlinear truth it summarises. And removing the
density-dependent self-limitation pushes α from −0.023/day to exactly **0.0** — the Hopf
stability boundary, precisely where theory puts it. The **Stability lab** page renders the
eigenvalue spectrum on the complex plane, the community-matrix heatmap, and the keystone
ranking, with knobs that move the eigenvalues live (drop self-limitation to 0 and watch the
rightmost eigenvalue cross into the unstable half-plane).

Two implementations, same math: the JS kernel (`linalg.mjs`: Gauss–Jordan inverse, Jacobi
symmetric eigenvalues, Hessenberg-QR general eigenvalues) is the guaranteed path and runs
in the browser; the Rust crate (`cycles/solver/`, nalgebra, native-tested, WASM-built by
`build-biome-solver.yml`) is the precision/scale sister, following the repo's beam-solver /
flight-solver pattern. For our 6–16 dim matrices the JS path is already instant, so the lab
ships JS-first and treats the WASM as an optional accelerator.

### Where this is going (the ecosystem-builder direction)

The data-driven engine + allometry + roster + stability solver are the foundation for a real
ecosystem-builder. The roadmap:

1. ✅ **Allometry layer** — derive each species' rates from body mass (Kleiber) + feeding
   guild + thermy, so real organisms drop in with computed stat blocks. *Done.*
2. ✅ **Real-organism roster** — identity/imagery from iNaturalist, who-eats-whom edges
   from GloBI (Global Biotic Interactions). `cycles/sim/roster.mjs` is a curated roster of
   real species (honey bee, cross orbweaver, sweet potato, apple, common reed, springtail);
   `buildCommunity()` runs each animal through the allometry layer and resolves its diet into
   engine edges. `enrich-roster.mjs` fetches the iNat taxon id + photo and the GloBI `eats`
   list and commits `roster.enriched.json` (the engine never reads it — it's imagery + a diet
   cross-check). The self-test confirms the GloBI record corroborates the curated edges (the
   orbweaver's observed prey include Hymenoptera, the honey bee's order) and that the
   all-real community closes the loop and conserves C/H/O/N exactly. *Done.*
3. ✅ **Stability solver** — the analytic brain. Reads stability off the community matrix's
   eigenvalues (May), reactivity off its symmetric part (Neubert), keystones off its inverse
   (Bender). Answers *"will this web survive?"* without a full time-domain run, validated
   against it. JS kernel + Rust/WASM sister; visible at `cycles/stability.html`. *Done.*
4. **Radius-niche coupling to Module 2** — give each organism a preferred radius (canopy /
   floor / swamp); radius is altitude is temperature/humidity/CO₂, so the food web couples
   to the atmosphere column and the two modules become one cylinder model.

## Module 2 — 1-D radial atmosphere column (`atmosphere/`)

The cylinder is symmetric along and around its axis, so the only gradient is **radius**.
This is that 1-D column — temperature, pressure, humidity and CO₂ as functions of radius
(equivalently altitude) and time — evolving under a pulsable axial sun. Live viewer at
`atmosphere/index.html`; kernel in `atmosphere/sim/column.mjs` (pure, zero-dep, node + browser).

**It reproduces the geometry's numbers by construction.** Centrifugal hydrostatic balance
(`dP/dr = ρω²r`) on a cylindrical finite-volume grid gives a **~37% pressure drop** axis→rim for
the 8 km habitat (`shared/geometry.mjs`); the centrifugal adiabat (`Δ = ω²(R²−r²)/2cp`) gives a
**~39 K** offset. Bigger barrel, bigger thermodynamic span (an Island-Three 3.2 km habitat would
be ~17% / ~16 K). The axis runs near −6 °C and the column is mostly saturated — a permanently
overcast sky. Potential temperature carries the adiabat, so "well mixed" means uniform θ, not T.

**The method** (idealised, Held–Suarez spirit): radiation is a Newtonian relaxation of θ toward
a prescribed radiative-equilibrium profile — a stable aloft inversion (warm axis) plus a diurnal
surface signal (warm bump by day, cool by night); dynamics is an explicit, **stability-dependent
eddy diffusion** (convective adjustment) that mixes hard where the column is statically unstable
and barely at all under the inversion. Finite-volume in true cylindrical geometry (flux area ∝ r,
the axis closes for free), so the diffusion operator conserves mass/heat/CO₂/water to machine
precision and the books change only by the surface exchange — which, in the coupled system, comes
from Module 1's steady state.

**The four phenomena it answers** (all in the self-test, `column.selftest.mjs`, 14 checks):
- *Stratification.* A stable inversion forms — θ climbs ~10 K from rim to axis — and suppresses
  vertical mixing.
- *Dew, not rain.* The cool nighttime surface saturates: dew accumulates ~3× faster at night than
  by day and a fog layer blooms near the rim, burning off when the surface warms — a cloud forest,
  exactly the dew-dominated cycle the geometry predicts.
- *The CO₂ trap.* A photosynthesising canopy depletes its own boundary layer; under the stable lid
  the deficit is large.
- *The ventilation pump.* The daytime thermal tide destabilises the near-surface layer and
  convects — relieving **51%** of the canopy CO₂ depletion vs a stagnant column. Pulsing the sun
  is the only mixing pump available inside the symmetry, and it works.

```bash
node biome/atmosphere/test/column.selftest.mjs   # 14 checks: structure, conservation, the four phenomena, fountain coupling, determinism
open biome/atmosphere/index.html                 # the live radial-slice viewer
```

The visible-weather refinements (where the dew drips, banding, the water budget closing back into
Module 1) are the natural place to return with the stability lab — they share the "what does the
steady climate actually look like" question.

## Module 2b — fountain & sun: the azimuthal cross-section (`fountain/`)

Module 2 resolved the cylinder in radius; this resolves the other free dimension — **azimuth** —
by looking straight down the axis at the **8 km / 10 km** geometry (`shared/geometry.mjs`). Two
coupled pieces share one view (live at `fountain/index.html`):

**The fountain (`fountain/sim/fountain.mjs`).** The water cycle's actuator. Reeds in the low-point
pond ("Fond du Lac") pre-treat; a jet throws that water inward toward the axis. In the rotating
frame a parcel in flight feels only centrifugal (`+ω²r`, outward) and Coriolis (`−2Ω×v`) — an exact
ODE, integrated with RK4 and **conserved** (specific energy `½v²−½ω²r²` holds to ~1e-15, the test).
At 8 km the axis-reaching speed is `ωR ≈ 280 m/s`, so the velocity slider runs to 1200 — past it,
water flies clear across the bore. The payoff is that *one* actuator answers two stagnations:
- *Stagnant water* — spraying aerates: O₂ in (oxidises residual BOD, drives nitrification → mineral-N
  back to Module 1), volatiles out, axial-sun UV on the droplets. The polish the reeds can't do.
- *Stagnant air* — the plume lofts surface air; the crisp test is whether its **apex clears the
  ~150 m inversion** from Module 2. A strong jet or a fan does; it runs at night when the thermal
  pump is off.
- *Distribution* — because `2ωv ~ g` here, the jet curves into a **sheet** that lays water down over
  a broad prograde arc; the slight azimuthal grade returns the runoff to the low point. Loop closed.

Four nozzles trade off: the **jet** punches deepest as a column, the **fan** clears the inversion
*and* spreads ~600 m of irrigation, the **symmetric fan** ignores the aim and broadcasts a balanced
1 km sheet, **mist** aerates ~10× more but stalls low.

**Momentum coupling (the new bit).** The plume does mechanical work on the air, which
`Fountain.ventilationK()` expresses as an equivalent near-surface eddy diffusivity (m²/s) fed into
Module 2's column as a `fountainK` mixing term — the **night-time pump buoyant convection can't
provide**. The test isolates it: with thermal convection off (the night condition), the fountain
alone **cuts the canopy CO₂ swing by ~60%** and lifts the floor off starvation. The viewer runs the
diurnal column live, so the **fog ring** blooms each night and the canopy CO₂ responds as you engage
the fountain.

**The luminous-flux budget (`fountain/sim/light.mjs`).** The axial sun is a **line**, so irradiance
falls as **1/r**. Flooding the 8 km wall at **1 sun** takes a **~50 MW-per-metre** axial lamp (50 GW
for a 1 km cylinder). The heat closure is geometric and is the punchline: all that light becomes heat,
radiated from the **larger 10 km outer skin** (`εσT⁴ = E·R_hab/R_out`) — at **half a sun it's a benign
~24 °C** radiator, at 1 sun ~81 °C. But it **cannot conduct out through the 1 km foam rind** (the
conductive ΔT is ~10⁷ K), so heat must be **actively pumped** to the radiator: the foam insulates, it
is not the heat path. And the bare **food** need is ~0.6 MW over ~600 m² — floodlighting over-provisions
the calories tens of thousands of times. "We need a LOT of light," made concrete, with the boiling-sun
heat budget that says half a sun is the sweet spot.

```bash
node biome/fountain/test/fountain.selftest.mjs   # 16 checks: energy conservation, deflection, nozzles, symmetric fan, ventilation K
node biome/fountain/test/light.selftest.mjs      # 15 checks: 1/r falloff, the 50 MW/m headline, radiator + foam heat closure
open biome/fountain/index.html                   # the looking-down-the-axis viewer, with the live diurnal column
```

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
├── shared/geometry.mjs           # the canonical cylinder (8 km habitat, 10 km hull, 1 km foam rind)
├── atmosphere/                   # MODULE 2 — 1-D radial atmosphere column
│   ├── index.html                # the diurnal column viewer
│   ├── sim/column.mjs            # finite-volume column + eddy mixing + fountain coupling term
│   └── test/column.selftest.mjs  # structure, conservation, four phenomena, fountain coupling
├── fountain/                     # MODULE 2b — azimuthal cross-section: fountain + light
│   ├── index.html                # looking-down-the-axis viewer (live diurnal column inside)
│   ├── sim/fountain.mjs          # rotating-frame ballistic jet + nozzles + ventilationK
│   ├── sim/light.mjs             # line-source luminous-flux + foam/radiator heat closure
│   └── test/{fountain,light}.selftest.mjs
└── cycles/                       # MODULE 1 — resource-cycle box model
    ├── index.html                # the dashboard (vanilla, no build step)
    ├── stability.html            # the Stability lab — eigenvalues, heatmap, keystones
    ├── sim/
    │   ├── cycles.mjs            # the data-driven box model (pure, zero-dep, node + browser)
    │   ├── allometry.mjs         # body mass → stat block (Kleiber scaling + guilds)
    │   ├── roster.mjs            # curated real-organism roster + buildCommunity() compiler
    │   ├── enrich-roster.mjs     # (network) fetch iNat imagery + GloBI diet → roster.enriched.json
    │   ├── roster.enriched.json  # committed provenance (engine never reads it)
    │   ├── linalg.mjs            # dense kernel: inverse + symmetric/general eigenvalues
    │   └── stability.mjs         # community matrix → stability / reactivity / keystones
    ├── solver/                   # Rust/WASM stability kernel (nalgebra) — the sister solver
    │   ├── Cargo.toml
    │   └── src/lib.rs            # spectrum / spectral_abscissa / reactivity / press (+ native tests)
    └── test/
        ├── cycles.selftest.mjs   # conservation + bounds + food-web behaviour + determinism
        ├── allometry.selftest.mjs# Kleiber scaling + calibration + individuals↔biomass
        ├── roster.selftest.mjs   # roster compiles, closes, conserves; provenance cross-check
        ├── linalg.selftest.mjs   # inverse + eigenvalues vs matrices with known spectra
        └── stability.selftest.mjs # stability verdict + eigenvalue/decay cross-check
```

This directory is intentionally separate from `/hoop` (structural rind) — the two are
complementary halves of the same habitat and shouldn't collide on files.
