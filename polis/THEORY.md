# A Theory of City Development

### Modeling urban economics across a city's life cycle

*The charter for `polis` — a procedural engine that grows the whole **economic
history** of a city into a generated substrate, from the founding engine to the
metropolis. The spatial form is the expression of the economy. The long arc is a
4X game; this is the theory it will stand on.*

`polis` sits between two things that already exist in this repo:

- **[`mappa`](../mappa/)** — a deterministic planet (tectonics, hydrology, climate,
  biomes) that scatters plausible *city sites*. It answers **where**, once.
- **[`hoop`](../hoop/)** — a game whose internals include two pure, node-tested
  field solvers we reuse: a **Physarum** desire-line grower
  ([`hoop/paint/flux.js`](../hoop/paint/flux.js)) and a **hypoxia / angiogenesis**
  capillary grower ([`hoop/v7/foam.js`](../hoop/v7/foam.js)).

The principal subject of `polis` is **urban economics**: what economic engine makes
a settlement nucleate, and what keeps it growing. The streets and quarters are how
that economy writes itself onto the ground.

---

## 0. The central idea — the economy is a forcing on one field

A city is, at every moment, solving a flow problem on a graph. *Which* problem it
solves is set by the **shape of its economy**, and that shape changes over the life
cycle. Both hoop solvers are the **graph Laplacian `L`** with different forcing —
and the forcing tracks how *concentrated* the economic base is.

> **The economy decides where current is injected; the city's form is the field-solve.**
>
> | Regime | Economy | Forcing on `L` | Solver | Form |
> |---|---|---|---|---|
> | **1 · Nucleus** | monoculture — one export engine | a **single** dominant sink | Physarum (`flux.js`), μ high → tree | **spokes to the big game in town** |
> | **2 · Coverage** | base multiplier spins up local services | a roughly **uniform** source | hypoxia (`foam.js seize()`) | capillary infill |
> | **3 · Demand** | diversified — many sectors | **many peaked** O–D currents | Physarum (`flux.js`), μ = grid↔tree | arterial hierarchy |

The forcing's *concentration* — **one point → uniform → many peaks** — is the
economic story made geometric. The economy begins as a monoculture (one export
engine), broadens into a dense local-service base, then re-concentrates into a
diversified, multi-sector economy. **Physarum bookends the life cycle** (a
single-sink star at birth, a distributed flux network at maturity); the
diffusion/coverage solver fills the middle. Same operator `L`, three forcings.

This is not a metaphor we impose — it is what the kernels compute. `flux.js`'s own
header notes that the stationary flux of trips is the Laplace transform of the
journey process (the graph's Green's function); `foam.js`'s `seize()` is a
multi-source BFS perfusion field plus angiogenesis toward the worst-served tissue.
The third regime — the **nucleus** — is the same Physarum solver with the current
collapsed onto **one** sink, which is exactly the network of the earliest city: a
few routes to the one place that matters, and everything else barely on the map.

---

## 1. The core economic engine — how cities start, and keep growing

This is the heart of `polis`, and the answer to *how do cities start?*

### 1a. The big game in town — why a settlement nucleates

A city is not founded by spreading people evenly; it is founded around **one
economic function strong enough to pull a surplus toward a point**:

- **Break-of-bulk / entrepôt** — at a head of navigation, a fall line, a lowest
  bridging point, a harbour or a mountain pass, cargo *must* transfer between
  transport modes. As Cooley put it in 1894, *"population and wealth tend to
  collect wherever there is a break in transportation"* — an interruption big
  enough to force a transfer and temporary storage of goods. The transfer is a
  captive choke point that **extracts rent** — warehousing, handling, milling,
  trade — and that rent is the founding engine.
- **Staple extraction** — a mine, a fishery, a fur/timber frontier: a localized
  resource exported raw (Innis's *staples thesis*).
- **Administrative / sacred seat** — a temple or palace that concentrates tribute
  and redistributes it (the earliest Mesopotamian cities).
- **The agricultural precondition** (Childe's *Urban Revolution*, 1950): none of
  the above can support a town unless the surrounding land yields a **storable food
  surplus** to feed the non-farmers the engine employs. Surplus is necessary but
  not sufficient — it is the *permission* to urbanize; the export engine is the
  *reason*.

In every case the early city is **one engine with everything else negligible** —
which is precisely why its network is a star of routes to that engine (regime 1).

### 1b. The economic base multiplier — the first engine of growth

The classic model splits a city's economy in two
(**economic-base theory**; export-base regional growth, Douglass North, 1955):

- **Basic (city-forming) sector** — produces for *export*; earns income from
  outside. The big game in town.
- **Non-basic (city-serving) sector** — produces for the *local* market (the baker,
  the barber, the school). It exists because the basic workers spend their wages.

If `s` is the local-serving (non-basic) share of all spending/employment, then each
dollar the base earns re-circulates locally, and total activity is the geometric
sum:

```
Total = Basic × M ,      M = 1 / (1 − s)
```

`M` is the **base multiplier**. Worked: if non-basic is half the economy (s = 0.5),
M = 2 — every export job supports one local-serving job. If s = 2/3, M = 3. *This
multiplier is the core economic engine that allows for growth*: grow the base by
one job and the town grows by `M`. Modeled dynamically, a settlement's population
is gated by `Basic × M`, itself gated by the agricultural surplus (1a).

### 1c. The second engine — why a city outgrows its founding base

The base multiplier is *linear*: double the staple, double the town. It cannot
explain a city that keeps growing after its founding engine fades (the portage that
silts up, the mine that empties). Two mechanisms make growth **self-reinforcing**:

- **Agglomeration / increasing returns** (Marshall, 1890). Firms cluster for three
  reasons — **labour pooling, input/supplier sharing, knowledge spillovers** (the
  "Marshallian trinity"). Empirically, **doubling a city's size raises productivity
  ~3–8%** (Rosenthal & Strange, 2004). So size *creates* the conditions for more
  size — an increasing-returns flywheel. This is also the engine of **New Economic
  Geography** (Krugman, 1991): increasing returns + transport costs + mobile labour
  cause a featureless plain to **spontaneously bifurcate** into a dense core and a
  thin periphery (the "home-market effect" — firms locate where the market is,
  which is where firms located).

- **Import-replacement** (Jane Jacobs, *The Economy of Cities*, 1969). A city starts
  **producing what it used to import**. Each replaced import (a) keeps that spending
  local and (b) creates **new local work**, and the new producers soon **export**
  the new good — so the export base itself *grows from within*, endogenously, by
  "adding new work to old." Jacobs argued this — not the static export base — is the
  true engine of urban economic growth, and that cities are the primary generators
  of national wealth (*Cities and the Wealth of Nations*, 1984).

> **The growth engine, assembled.** Founding export base → base multiplier `M`
> spins up local services → agglomeration makes the place more productive as it
> grows → import-replacement converts local services into *new* export base → the
> multiplier acts on a bigger base → … A staple that merely *serves* becomes a city
> that *generates*. The **urban size ratchet** (Wilbur Thompson, 1965): past a
> threshold size, this flywheel makes continued growth all but guaranteed — the
> city's structural diversity insures it against the death of any one sector.

**→ generative engine.** Each settlement carries `base` (export jobs by sector) and
derives `total = base × 1/(1−s)`. Agglomeration multiplies base productivity by
`size^ε` (ε ≈ 0.04–0.08). An import-replacement step periodically promotes the
largest non-basic sector into a new basic sector (new export), enlarging the base.
Population is capped by `min(total, surplus_carrying_capacity)`.

---

## 2. The substrate (from mappa)

`mappa`'s engine exposes, per mesh cell: `elev`, `water` (land/ocean/lake),
`rivers` (with `flow`), `temperature`, `moisture`, `biome`, `plate`, `area`, `adj`.
`polis` reads it as *the ground the economy stands on*: water and rivers/coasts are
**routes** (and break-of-bulk sites); relief is **defence and friction**; moisture
+ biome + valleys are **fertility** → the surplus that caps the base multiplier;
`plate` lithology contacts are the **fall line**. Determinism is shared (mappa's
`mulberry32`): same seed → same world → same city.

---

## The life cycle (the phases)

The phases below are not invented — they track **Wilbur Thompson's five stages of
urban growth** (*A Preface to Urban Economics*, 1965): (1) export specialization
[the single staple], (2) the export complex [suppliers cluster], (3) economic
maturation [import-replacement, local services deepen], (4) regional metropolis
[the city exports services to a region of lesser places], (5) technical-
professional virtuosity. `polis` reads that economic succession spatially, with the
three field regimes as its geometry.

### Phase 0 — Site & the founding engine: *why here*

Score every candidate cell on **two independent axes** (site vs situation): `site`
= local terrain (water, defensibility, buildable land); `situation` = betweenness on
the route/river graph. Some terrain features are *forced spawn points* because they
manufacture a founding engine: the **fall line** (rapids = head of navigation **and**
water power; one escarpment seeds a string of cities — Richmond, Baltimore,
Washington), the **head of navigation**, the **lowest bridging point** (river port),
the **harbour**, the **defensive** hill/meander/island, the **gap/pass town**. The
founding advantage is a **one-time tie-break, not a permanent subsidy** — which is
what later lets the city outlive the reason it was founded (Phase 4 lock-in).

### Phase 1 — Nucleus: *regime 1, the single attractor*

The economy is a monoculture: one basic sector (the founding engine), the
multiplier barely started. The network is therefore a **star** — sparse routes from
the scattered hinterland to the one place that matters, everything else barely on
the map. This is the **Physarum solver with current injected to a single sink** and
μ high (so the field collapses to a minimal tree/star, not a grid). The "big game in
town" is literally the only destination, so betweenness piles onto the few spokes.
*This is the regime the user identified, and it is economically exact: a one-engine
economy produces a one-hub network.*

### Phase 2 — Town: *regime 2, the coverage phase (hypoxia)*

The base multiplier `M = 1/(1−s)` spins up the non-basic economy — bakers, smiths,
a parish, a market. Now the binding constraint flips from *route-to-the-engine* to
*serve-everyone*: every dwelling must be within reach of the well, the market, the
mill, the gate. This is the **angiogenesis solver** (`foam.js seize()`): compute the
perfusion field (hop-distance to the nearest lane), sprout a capillary lane toward
the worst-served ("hypoxic") cell, repeat until all tissue is within `oxygenReach`.
The branching, space-filling fabric of an organically grown town. Its **grain**
follows Conzen (*Alnwick*, 1960): streets → **burgage plots** (long strips) →
buildings, each plot aging through the **burgage cycle** (institutive → repletive
backland-infill → climax saturation → recessive clearance). The first **land-use
gradient** appears via von Thünen (1826): rent `R = Y(p−c) − Y·F·m` trades off
against transport cost, so uses sort by the upper envelope — perishable/heavy near
the centre, extensive at the edge.

### Phase 3 — City: *regime 3, the demand phase (Physarum)*

Agglomeration and import-replacement diversify the base into **many** sectors and
sub-centres. The flow problem becomes one of **moving concentrated flows among many
origins and destinations** — the **Physarum solver again, but now with a dense,
peaked O–D current matrix** (gravity demand `T_ij ∝ P_i·P_j/d_ij²`, Reilly 1931).
Conductance adapts, `dD_ij/dt = f(|Q_ij|) − D_ij` (Tero et al., *Science* 2010 — the
slime-mold Tokyo-rail result); arteries are the **superlevel set** of the traffic
field; **μ** dials *grid* (μ<1) ↔ *tree* (μ>1) — planned vs organic. **Bid-rent**
(Alonso 1964) sorts land use into commerce → industry → residential, in a pattern
that is a selectable kernel — concentric **rings** (Burgess), transport **sectors**
(Hoyt), or **multiple nuclei** (Harris–Ullman). History freezes into the plan as
**fringe belts** (low-density rings at former edges) constrained by the
**morphological frame**. The loop closes (Levinson & Xie): new road → accessibility
→ development → demand → more road. `polis` *iterates* Phases 2–3.

### Phase 4 — Metropolis & the system: *the region*

- **Scaling** (Bettencourt & West, *PNAS* 2007): `Y = Y₀·N^β` — infrastructure
  **sublinear** (β≈0.85), socioeconomic output **superlinear** (GDP, wages, patents,
  crime; β≈1.15), needs **linear** (β≈1.0). Pick N, derive the rest.
- **Hierarchy** (Christaller 1933): threshold × range → hexagonal market areas;
  nesting factor K=3 (market) / 4 (transport) / 7 (administrative).
- **Size distribution** (Zipf / Gibrat / Gabaix): proportionate growth + a reflecting
  floor → the rank-size law `P_n ≈ P_1/n` self-organizes.
- **The urban lifecycle** (van den Berg): urbanization → suburbanization →
  counter-urbanization → reurbanization, driven by falling transport cost.

---

## The wider model — three clocks, two territories, two doors, two axes

The phases are the *shape*. The *engine* runs on three clocks, spans two
territories, opens two doors to the wider world, and is judged on two axes. This is
where `polis` becomes a **hinterland sim as much as a city sim**.

### Three clocks

**Continuous — growth on curves.** Population and productivity don't step with the
phases; they grow on an **S-curve** toward a carrying capacity `K`. The Verhulst
logistic (1838), `dP/dt = r·P·(1 − P/K)` — discrete `P ← P + r·P·(1 − P/K)` —
inflects symmetrically at `K/2`; the **Gompertz** alternative, `dP/dt = r·P·ln(K/P)`,
inflects early at `K/e ≈ 0.37K` (fast boom, long crawl to the ceiling — use it for a
city that explodes then saturates). Northam's urbanization S-curve (1975) is the
macro envelope (slow below ~25% urban, steep middle, plateau above ~70%).

**Exogenous — K is not fixed.** A carrying capacity is "a function of how people
live and the technology at their disposal" (the Haber-Bosch point; Boserup). So
`K(t)` *rises*, and a city chases a **moving ceiling** — stacked successive S-curves
(the bi-logistic), not one plateau. What raises `K` is the third clock.

**Lumpy — infrastructure as projects.** Capacity does not fill in smoothly. A
bridge, wall, mill, aqueduct or grid is **indivisible** — a half-bridge carries
nothing — so infrastructure arrives in **lumps** that step `K` up discretely.
Hirschman (*The Strategy of Economic Development*, 1958) splits investment into
**social overhead capital (SOC)** — infrastructure that *enables* production — and
**directly productive activity (DPA)**, with two opposite sequences: build SOC
*ahead* of demand (the "permissive" path — cheap infrastructure invites DPA to
follow) or let SOC *lag* (the "compulsive" path — scarcity raises costs and pulls
SOC in via backward/forward linkages). Rosenstein-Rodan's **big push** (1943) adds
that below a coordinated *minimum quantum* across complementary sectors returns are
negative; cross it and external economies flip positive. So model
`K = K_continuous + Σ(infra_blocks)`, each block a binary that steps capacity up
only once its fixed lump cost is paid out of surplus/capital.

### The tech tree — the master clock (and yes, we need one)

Technology is the one exogenous force that moves *every other parameter* across the
life cycle: it raises the **agricultural surplus ratio** (the food-producer-to-
consumer ratio falls, freeing labour for the city), lowers **transport cost** (the
master lever — as `τ` falls past a threshold it tips Krugman's core-periphery
**bifurcation**, the "tomahawk": the dispersed equilibrium loses stability at the
*break point*, agglomeration self-sustains past the *sustain point*), raises
**productivity**, and cuts **project costs**. Layer in **general-purpose
technologies** (Bresnahan–Trajtenberg, 1995), Schumpeter's **creative destruction**
(1942) and Kondratiev's ~50-year **long waves** (1925), and technology also rewrites
*which industries lead* each era. *Can polis run without a tech tree?* Effectively
no — strip it out and the base multiplier simply saturates against a fixed `K` and
the city has no history. Technology is the hand on every lever.

**Reuse, don't rebuild.** The repo already has a **500-node technology DAG** in
[`cards`](../cards/js/pools/tech-pool.js) — `[title, era, {domain, year, status,
complexity, prereqs}]`, 8 eras (prehistoric → ai) × 12 domains including
agriculture, transportation, energy and finance, prerequisite depth up to 26. It is
pure, portable data with no game coupling — but carries **no effects field** (it is a
declarative historical DAG). The integration is exactly that missing layer: a
per-tech `effects` map onto the economic levers —

```
{ agSurplus:+0.2, transportCost:−0.1, baseMultiplier:+0.05, projectCost:{road:−0.15}, K:×1.1 }
```

so researching down a `domain:'agriculture'` chain (Neolithic → irrigation → heavy
plough → crop rotation) compounds the surplus that lifts `K`, and a
`domain:'transportation'` chain drives `τ` toward Krugman's break point.

### Two territories — the hinterland coupling

A city and its hinterland are **one coupled system**; this is why `polis` is a
hinterland sim as much as a city sim.

- **The city zones the hinterland.** von Thünen (1826): the city's demand, refracted
  through transport cost, sets a bid-rent gradient `R = Y(p−c) − Y·F·m` that sorts
  the surrounding land into concentric **specialization rings** (intensive dairy
  nearest, then fuel, grain, ranching). The city organizes the countryside.
- **The hinterland feeds the city.** The hard ceiling: **max city population ≈
  (hinterland surplus + net food imports) ÷ per-capita need**. The surplus is raised
  by intensification under population pressure (Boserup, 1965) and by the agricultural
  tech chain — another way `K` rises.
- **The catchment.** Christaller's **complementary region** — the hinterland a
  central place serves, bounded by each good's range and threshold.
- **The five forces.** Jacobs (1984): a vital city radiates **markets, jobs,
  transplants, technology, capital** into its region; all five → balanced city-region
  growth, only a subset → "stunted and bizarre" development. The city-region, not the
  city alone, is the unit `polis` simulates.

### Two doors — the broader economy (central place vs gateway)

A city has two distinct external growth drivers, and the broader economy (raw
resources, agriculture, away-market access) reaches it through them:

- **The central place** (Christaller) — *endogenic, centred, retail/service*: growth
  from serving the **local hinterland**'s threshold demand; symmetric radial catchment.
- **The gateway** (Burghardt, 1971; Vance's **mercantile model**, 1970) — *exogenic,
  edge-located, wholesaling*: growth from reaching distant **away markets** through a
  break-of-bulk / entrepôt node; asymmetric, one-directional hinterland, settlement
  "unravelling" inland from a coastal **point of attachment**. Vance built this
  expressly *against* central-place theory for newly settled lands.

So a polis city carries **two size terms** — a central-place term (local hinterland
demand) and a gateway term (export-demand flow × break-of-bulk advantage). The staple
economy (Innis / Watkins) plugs into the gateway door: a region exports its
comparative-advantage resource to distant markets, and the entrepôt that transships
it captures the value. **Raw-resource availability** (where the staple sits on the
mappa substrate), **agricultural surplus** (the hinterland), and **away-market
access** (the gateway's reach) are the three inputs of the broader economy.

### Two axes — scale and flourishing

A city is judged on more than *scale* (population, GDP — the `N^β` laws). The second
axis is **flourishing — is it good to live in?** The repo already has a civic-vitality
model in [`hoop/econ`](../hoop/econ/econ.js): `scoreSociety()` → **vitality 0–100 +
tier** (Thriving · Healthy · Stable · Fragile · Failing) on seven sub-signals — supply
**closure**, multiplex interaction **thickness** (people who wear many hats), social
**weave** (reach), Granovetter **bridges** (weak ties), **third-places**,
**employment**, and shock **resilience** (hub-removal damage). Its framing makes
flourishing explicitly distinct from output: the subsistence loop closes, and *"the
real output is regard"* — the interesting economy (craft, trade, service, play,
esteem) floats above mere subsistence. `polis` carries this as the quality-of-life
layer above raw scale. *(Open design question for the engine, not the theory: whether
flourishing **feeds back** into growth — a more livable city draws migration, raising
`K` — or stays a readout. The model leans feedback.)*

---

## Path dependence — the through-line

Why early accidents persist (David 1985; Arthur 1989; Bleakley & Lin 2012). The
founding engine breaks the *initial tie* about where to build; **increasing
returns** (agglomeration) amplify the lead; **sunk, durable infrastructure does not
decay when the founding feature dies.** The proof: portage cities, founded at
fall-line sites, kept concentrating population *after* river navigation became
obsolete (~6% lower density per 10% farther from the dead portage). The lock-in test
for `polis`: delete a city's founding engine mid-run — agglomeration + sunk capital
should keep it growing. This is what makes the **size ratchet** real.

---

## Determinism, and the road to a 4X

Everything is seeded. `(worldSeed, siteCell)` → a city's entire economic history,
identical on every machine, freezable to an ATProto record. No `Date.now()`, no
unseeded `Math.random()` in generation.

`polis` is the **economic map-and-history layer** a 4X needs. Once a city has a
legible economic history — a founding engine, a multiplier, a diversifying base, a
place in a Zipf hierarchy — the 4X verbs act on something real: **eXplore** the
mappa world, **eXpand** along the site-score field, **eXploit** the surplus and the
export base, **eXterminate** over the central-place catchments. The phases are,
deliberately, also the economic-era progression of such a game.

---

## Sources

**The economic engine (the new spine)**
- Economic base analysis / base multiplier `M = T/B = 1/(1−s)` — Wikipedia: https://en.wikipedia.org/wiki/Economic_base_analysis
- Douglass North, "Location Theory and Regional Economic Growth," JPE 63(3):243–258 (1955): https://ideas.repec.org/a/ucp/jpolec/v63y1955p243.html
- Charles H. Cooley, *The Theory of Transportation* (1894) — "break in transportation": https://en.wikipedia.org/wiki/Charles_Horton_Cooley
- Break-in-bulk / entrepôt point — Wikipedia: https://en.wikipedia.org/wiki/Break-in-bulk_point
- Harold Innis, staples thesis; Watkins, "A Staple Theory of Economic Growth" (1963) — Wikipedia: https://en.wikipedia.org/wiki/Staples_thesis
- Wilbur Thompson, five stages of urban growth + the size ratchet (*A Preface to Urban Economics*, 1965): https://en.wikipedia.org/wiki/Wilbur_R._Thompson
- Jane Jacobs, *The Economy of Cities* (1969) — Wikipedia: https://en.wikipedia.org/wiki/The_Economy_of_Cities
- Import replacement / Jacobs — Wikipedia: https://en.wikipedia.org/wiki/Import_replacement
- Economies of agglomeration (Marshall's trinity) — Wikipedia: https://en.wikipedia.org/wiki/Economies_of_agglomeration
- Rosenthal & Strange, "Evidence on the nature and sources of agglomeration economies" (2004): https://www.sciencedirect.com/science/article/abs/pii/S1574008004800063
- Krugman, "Increasing Returns and Economic Geography," JPE 99(3):483–499 (1991): https://www.journals.uchicago.edu/doi/10.1086/261763
- New economic geography — Wikipedia: https://en.wikipedia.org/wiki/New_economic_geography
- Wilbur Thompson, urban size ratchet (*A Preface to Urban Economics*, 1965): https://en.wikipedia.org/wiki/Wilbur_R._Thompson

**Dynamics — growth curves, lumpy projects, technology**
- Verhulst logistic `dP/dt = rP(1−P/K)` — Wikipedia: https://en.wikipedia.org/wiki/Logistic_function
- Gompertz curve (inflects at K/e) — Wikipedia: https://en.wikipedia.org/wiki/Gompertz_function
- Carrying capacity is technology-dependent (K rises) — Wikipedia: https://en.wikipedia.org/wiki/Carrying_capacity
- Hirschman, *The Strategy of Economic Development* (1958) — SOC vs DPA: https://en.wikipedia.org/wiki/The_Strategy_of_Economic_Development
- Rosenstein-Rodan, the big push (1943) — Wikipedia: https://en.wikipedia.org/wiki/Big_push_model
- Bresnahan & Trajtenberg, general-purpose technologies (1995) — NBER: https://www.nber.org/papers/w4148
- Schumpeter, creative destruction (1942) — Econlib: https://www.econlib.org/library/Enc/CreativeDestruction.html
- Kondratiev long waves — Wikipedia: https://en.wikipedia.org/wiki/Kondratiev_wave

**Hinterland & away markets**
- Bid-rent / von Thünen hinterland rings — Wikipedia: https://en.wikipedia.org/wiki/Bid_rent_theory
- Ester Boserup, agricultural intensification (1965) — Wikipedia: https://en.wikipedia.org/wiki/Ester_Boserup
- Burghardt, "A Hypothesis About Gateway Cities" (1971): https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1467-8306.1971.tb00782.x
- Vance, the mercantile model (1970) — overview: https://pangeography.com/vance-model-of-transport/

**Borrowed repo assets**
- 500-node technology DAG: `cards/js/pools/tech-pool.js`
- Civic-vitality oracle (`scoreSociety`, seven sub-signals): `hoop/econ/econ.js`
- Physarum flux + hypoxia solvers: `hoop/paint/flux.js`, `hoop/v7/foam.js`
- World substrate: `mappa/engine.js`

**Substrate & site**
- Settlement site & situation: https://geographyfieldwork.com/SiteSituation.htm
- Fall line / Atlantic Seaboard Fall Line: https://en.wikipedia.org/wiki/Fall_line · https://en.wikipedia.org/wiki/Atlantic_Seaboard_Fall_Line
- Childe's urban revolution (surplus): https://en.wikipedia.org/wiki/Urban_revolution

**Networks (the solvers' grounding)**
- Tero et al., Physarum / Tokyo rail, *Science* 2010: https://www.science.org/doi/10.1126/science.1177894
- Reilly's law of retail gravitation: https://en.wikipedia.org/wiki/Reilly%27s_law_of_retail_gravitation
- Levinson & Xie, network/land-use co-evolution: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1748607

**Morphology & land use**
- Von Thünen rings + rent formula: https://transportgeography.org/contents/chapter8/urban-land-use-transportation/von-thunen-regional-land-use/
- Alonso bid-rent: https://en.wikipedia.org/wiki/Bid_rent_theory
- Conzen, *Alnwick* (1960) / burgage cycle & fringe belts: https://www.burgageplots.info/glossary-of-terms
- Burgess concentric zones: https://en.wikipedia.org/wiki/Concentric_zone_model
- Hoyt sectors & Harris–Ullman nuclei: https://transportgeography.org/contents/chapter8/urban-land-use-transportation/sector-nuclei-land-use/

**System & scaling**
- Central place theory (Christaller/Lösch): https://en.wikipedia.org/wiki/Central_place_theory
- Rank-size / Zipf; Gibrat; Gabaix QJE 1999: https://en.wikipedia.org/wiki/Rank-size_distribution · https://pages.stern.nyu.edu/~xgabaix/papers/zipf.pdf
- Bettencourt et al., scaling, *PNAS* 2007: https://www.pnas.org/doi/abs/10.1073/pnas.0610172104 · https://en.wikipedia.org/wiki/Urban_scaling

**Path dependence**
- David, QWERTY (1985): https://en.wikipedia.org/wiki/Path_dependence
- Arthur, increasing returns & lock-in (1989): https://blas.com/increasing-returns-and-path-dependence/
- Bleakley & Lin, "Portage and Path Dependence," QJE 2012: https://pmc.ncbi.nlm.nih.gov/articles/PMC3738199/

*Method note: several primary PDFs (Tero, Bettencourt, Gabaix, Krugman) are
image-encoded; their equations and exponents were cross-confirmed across multiple
secondary academic sources. The load-bearing values — base multiplier `M=1/(1−s)`;
agglomeration elasticity 3–8% per doubling; Physarum `dD/dt = f(|Q|) − D`; scaling
β≈1.15 / 0.85 / 1.0 — are multiply attested.*
