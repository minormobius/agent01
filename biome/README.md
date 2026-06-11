# biome — the closed ecology of an infinite O'Neill cylinder

**Live at:** `biome.mino.mobi`
**Stack:** Cloudflare Worker (ASSETS binding) + vanilla ES modules. No build step.
**Deploy:** `.github/workflows/deploy-biome.yml` — `wrangler deploy` on push to `biome/**`.

The **ecosystem** wing of a four-part O'Neill cylinder modelling package. It models the
**interior** of an infinite (no end-caps) cylinder run as a **bio-engine**: a linear sun
on the spin axis, vegetation on the inner surface of the structural rind, and the enclosed
air/water/soil doing the work of a closed life-support loop. The question biome answers is
the **zeroth** one — *can the loop close at all as stocks and flows?* — by modelling the
interior as a living **food web** rather than a farm.

### One package, four wings

The full O'Neill cylinder model is split into four independent deploy surfaces, each with
its own subdomain, landing page and `CLAUDE.md`:

| Wing | Surface | What it models |
|---|---|---|
| **The game** | [`hoop.mino.mobi`](../hoop) | the infinite game — a world you walk, where every place is a forum thread |
| **The structure** | [`rind.mino.mobi`](../rind) | the foam space-frame shell + the Rust/WASM frame solver that scores it |
| **The thermodynamics** | [`tide.mino.mobi`](../tide) | the radial atmosphere column, fog optics, the fountain & sun, the water/energy ledger |
| **The ecosystem** | `biome.mino.mobi` *(this)* | the closed food-web box model + allometry + roster + stability lab |

biome is the volume *inside* the rind, and it shares the cylinder with tide: **radius is
altitude is temperature/humidity/CO₂**, so the planned radius-niche coupling (below) is
where biome and tide become one cylinder model. The thermodynamic premise that makes the
interior strange — *up is hot not cold; fog not rain; the CO₂ trap* — lives in
[`tide/README.md`](../tide/README.md); biome takes the climate as a boundary condition and
asks whether the carbon, oxygen, water and nitrogen books balance under it.

The landing page (`index.html`) frames the premise and links the modules; each module is
self-contained under its own directory.

## The closed-ecosystem box model (`cycles/`)

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
node biome/cycles/test/lake.selftest.mjs        # 20 checks: harvest conserves, fish + water-treatment figures of merit, failure modes, stability
node biome/cycles/sim/enrich-roster.mjs         # (network) refresh iNat imagery + GloBI diet → roster.enriched.json
( cd biome/cycles/solver && cargo test )        # 6 checks: the Rust stability kernel vs known spectra
open  biome/index.html                          # landing → the cycles dashboard (cycles/) → Stability lab (cycles/stability.html)
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
  the `tide` wing. This model tells you *whether* the loop closes; it can't tell you *where*
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

### The lake bioengine (`cycles/sim/lake.mjs`, endpoint at `cycles/lake.html`)

The terrestrial web asks *does the loop close?*. The **lake** asks a sharper, dual-purpose
question: can one body of water be **both the crew's fish farm and its water-treatment plant**?
On Earth those are separate machines; in a closed cylinder the cheapest design fuses them — the
fish you eat are grown on the nutrients you would otherwise have to strip out with hardware. This
is the "living machine" / integrated-aquaculture idea (Todd's eco-machines, Chinese integrated
poly-culture, constructed treatment wetlands), run as a trophic web. The endpoint is a new page
on the same engine; it is **not** a server route (biome stays pure-static).

**Two figures of merit**, read off the steady-state trajectory:

1. **Surplus harvestable fish** — the sustainable fishery yield (the `harvest` flux at steady
   state, since a steady stock replaces exactly what's culled), reported in kg/day, kcal/day,
   g/person·day, and as a share of crew calorie demand.
2. **Effective water treatment** — how clean the lake holds the water while recycling crew waste:
   the **clearance ratio** (detrital throughput ÷ the crew's daily organic-waste loading; ≥1 means
   the lake keeps up), the **dissolved mineral-N** per litre (the eutrophication signal, stripped
   toward zero by plant uptake + denitrification), and the standing organic (BOD) load.

**Every species is chosen for its role** in those two numbers:

| Organism | Role |
|---|---|
| **Phytoplankton** (*Chlorella*) | base of the web + the nutrient/CO₂ sink (water treatment) |
| **Duckweed** (*Lemna*) | the classic constructed-wetland nutrient stripper + the harvested calorie base |
| **Water fleas** (*Daphnia*) | graze the algal bloom into clear water and into fish food |
| **Swan mussels** (*Anodonta*) | filter-feed suspended algae/detritus out of the column + a light harvest |
| **Benthic detritivores** | the BOD-mineralising compartment (microbial proxy) — clears the organic load |
| **Nile tilapia** (*Oreochromis*) | the harvestable protein crop — eats across the whole web |

**The one engine extension this required.** The food-web solver could route *producer* biomass into
the food store (`harvestIndex`) but had no way to harvest an *animal* — fish could only leave as
death or predation. `cycles.mjs` now takes an optional `harvest` (per-day specific cull) on
heterotrophs that lands biomass in the food store. It's a paired carbon transfer (biomass C → food
C), so it conserves by construction exactly like `harvestIndex`; communities that omit it are
byte-for-byte unchanged. The lake self-test proves C/H/O/N still conserve to ~1e-13 over a year
*with the harvest active*.

**What it surfaces.** At the tuned default (100 crew, 15k m² plankton + 10k m² duckweed) the lake
supports the ship: ~7 kg fish/day (≈70 g/person·day — a modest *calorie* share but a real *protein*
ration, which is the honest closed-life-support story: plants carry the calories, fish carry the
protein), clearing ~115× the daily waste load with dissolved N near zero, O₂ in band. The failure
modes are real and emergent: **overfish it** (push fishing pressure past production) and the stock
collapses; **kill the detritivores** and the organic load piles up, dissolved N spikes into
eutrophication and CO₂ crashes (the Biosphere-2 failure); **shrink the lake** and calories fall
short (area is the lever, as on land). The lake web is also dynamically **stable** (the stability
solver gives α < 0) — it holds under a shock.

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
4. **Radius-niche coupling to `tide`** — give each organism a preferred radius (canopy /
   floor / swamp); radius is altitude is temperature/humidity/CO₂, so the food web couples
   to tide's atmosphere column and the two wings become one cylinder model.

## The thermodynamics moved to `tide`

The spatial atmosphere/water/energy modules that used to live here — the 1-D radial
atmosphere column (`atmosphere/`), the fountain & sun azimuthal cross-section (`fountain/`),
the water & energy systems ledger (`systems/`), and the planned WebGPU interior visualiser —
are now the **`tide`** wing at [`tide.mino.mobi`](../tide). They model the *climate* of the
interior; biome models the *ecology* that lives in it. The two couple through radius (see
"radius-niche coupling" in the roadmap above): radius is altitude is temperature/humidity/CO₂.

## Layout

```
biome/
├── index.html                    # landing page — the premise + module cards + four wings
├── worker.js                     # assets worker (+ /health); model runs client-side
├── wrangler.jsonc                # name=biome, custom_domain route biome.mino.mobi
├── README.md                     # this file
├── CLAUDE.md                     # operational guide for this surface
└── cycles/                       # the closed-ecosystem food-web box model
    ├── index.html                # the dashboard (vanilla, no build step)
    ├── stability.html            # the Stability lab — eigenvalues, heatmap, keystones
    ├── lake.html                 # the Lake bioengine endpoint — fish + water treatment
    ├── sim/
    │   ├── cycles.mjs            # the data-driven box model (pure, zero-dep, node + browser)
    │   ├── allometry.mjs         # body mass → stat block (Kleiber scaling + guilds)
    │   ├── roster.mjs            # curated real-organism roster + buildCommunity() compiler
    │   ├── lake.mjs              # lake community + figures of merit (fish surplus, water treatment)
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
        ├── stability.selftest.mjs # stability verdict + eigenvalue/decay cross-check
        └── lake.selftest.mjs     # harvest conserves + fish/water figures of merit + failure modes
```

The thermodynamic half (`atmosphere/`, `fountain/`, `systems/`, `shared/geometry.mjs`) moved
to the **`tide`** surface in the cylinder-refactor. biome is the **ecosystem** wing; its
siblings are the game (`hoop`), the structure (`rind`) and the thermodynamics (`tide`).
