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
axis is **flourishing**, and it has two faces — the bloom and the dusk.

**Flourishing as livability (the floor).** The repo's civic-vitality model in
[`hoop/econ`](../hoop/econ/econ.js) — `scoreSociety()` → **vitality 0–100 + tier** on
seven sub-signals (supply closure, multiplex **thickness**, social **weave**,
Granovetter **bridges**, **third-places**, **employment**, shock **resilience**) — is
the floor: *is the city good to live in?* Its framing already separates this from
output: the subsistence loop closes, and *"the real output is regard."*

**Flourishing as a structural edge (the bloom).** But flourishing meant something
sharper in **Vienna 1900** (Schorske) — a **cultural and technological
efflorescence**. Structurally that is the city's capacity to **attract talent and
generate knowledge/technology**, and it is the missing **feedback that closes the
growth loop**: `talent → human-capital externalities → innovation →
import-replacement → new export base → scale → (more talent)`. Cities are the engine
of growth precisely because skilled people near other skilled people produce more
than the sum (Lucas, 1988: *"what else is a city?"*; Glaeser's skilled-city effect;
Jacobs' cross-sector spillovers). Peter Hall's *Cities in Civilization* (1998)
catalogues the conditions for these **golden ages**; Florida names the levers
**Talent, Technology, Tolerance**. And because technology **diffuses**
(Hägerstrand), generating it *first* is a competitive **edge** — a lead-time
advantage that decays as it spreads. So flourishing is not just a readout: it is the
city's **tech-generation rate**, which advances the tech clock for itself and leaks
to laggards by diffusion. Sassen's **global cities** are the limit case —
flourishing concentrated into command nodes.

**The dusk — the Owl of Minerva.** Flourishing is **non-monotonic**, and its peak
often sits on the hairy edge of collapse. Hegel: *"the owl of Minerva spreads its
wings only with the falling of the dusk"* — a form of life understands itself only
as it ends, and Vienna's bloom *was* the eve of the empire's fall. The structural
account is **Tainter's declining marginal returns on complexity** (1988): a
metropolis at peak complexity is at peak **fragility** — each added layer of
administration and coordination returns less, until the marginal return goes
negative. Thompson's size ratchet has the same ceiling (he warned absolute size
becomes a brake as public-service costs rise); Spengler's "megalopolis" is the late,
sterile form. So `polis` models flourishing with a **complexity cost** that
eventually bites — the cultural bloom and the onset of decline are coupled, not
sequential.

*(This resolves last turn's open question: flourishing **does** feed back into growth
— via talent and tech generation — but with a complexity cost that can turn the
feedback negative at the top. Bloom and dusk, one curve.)*

---

## Financial flows — funding development at each phase

The economy above moves *real* goods and labour. **Finance is the parallel system
that moves claims on the future** — it mobilizes surplus into investment, prices time
and risk, and supplies the medium of exchange. It is not a garnish: it is **how the
lumpy projects get paid for and how the multiplier deepens**, and its **cost of
capital is a master lever on par with transport cost** — cheaper, deeper finance
unlocks bigger projects sooner and is a decisive **edge** between cities.

### What finance does, and why it drives growth

Ross **Levine's five functions** of a financial system: it **mobilizes savings**,
**allocates capital**, **monitors/governs** the use of capital, **eases exchange**,
and **manages/diversifies risk**. Schumpeter's slogan — *"the banker authorizes the
entrepreneur"* — is the point: credit *creates the means* for innovation before the
returns exist (King & Levine, "Finance and Growth: Schumpeter Might Be Right," 1993).
**Financial deepening** (Goldsmith's *Financial Interrelations Ratio* — financial
assets growing faster than output) tracks development; Patrick's distinction between
**supply-leading** finance (built *ahead* of demand, the financial twin of Hirschman's
"permissive" excess-SOC) and **demand-following** finance names the two sequences.
*(Honest nuance: the causation is contested — Robinson's "where enterprise leads
finance follows" says finance merely follows growth, and the "too much finance"
literature finds the effect turns **negative** at high financial depth — itself an
Owl-of-Minerva point: finance helps until the financial sector is too large, which is
the crisis-proneness below.)*

### Finance funds the three clocks

- **The continuous clock.** Money and credit raise the **velocity and reach** of the
  base multiplier — more of each surplus dollar is intermediated and re-spent rather
  than hoarded, so the *effective* multiplier deepens. The fractional-reserve **money
  multiplier** `1/(1−reserve)` is the structural twin of the base multiplier
  `1/(1−s)`.
- **The lumpy clock — where finance bites hardest.** A project (harbour, wall,
  aqueduct, grid) gets built when its **NPV at the city's cost of capital `ρ` is
  positive** *and* financing is available (current tax flow + borrowing capacity).
  `ρ` is the gate.
- **Who supplies the lump?** **Gerschenkron** (*Economic Backwardness*, 1962): the more
  backward the economy, the larger the role of **banks** (Germany) and then the
  **state** (Russia), because scattered savers and thin markets cannot assemble the
  indivisible lump. So the **financial regime** — market / bank / state — decides
  whether the big push can be funded at all.

### The per-phase ladder (each stage of financial evolution unlocks a larger scale)

- **Nucleus — redistribution, before markets.** Polanyi's modes of integration:
  the earliest surplus moves by **reciprocity and redistribution**, not exchange. The
  temple/palace **treasury and granary** (the administrative-seat founding engine)
  concentrates the tithe/tribute and redistributes it — "finance" is stored surplus
  under command, and "investment" is the ruler's allocation of it. Money may not yet
  exist (weighed grain/metal); the break-of-bulk and staple engines generate a
  *tradeable* surplus that needs settling, which is what summons money at the trade
  node.

- **Town — coinage and merchant credit.** Struck **coinage** makes the medium of
  exchange portable and fungible, lubricating the base multiplier (velocity ↑, the
  non-basic economy deepens). **Merchant credit** appears at the trade engines — the
  **bill of exchange** (Italian merchant-bankers) lets value cross distance without
  shipping coin. Early **public finance** is the town taxing *its own flow* — tolls
  and market dues on the break-of-bulk traffic — to pay for the first lumpy projects
  (walls, a well, a bridge). `ρ` is high (thin, local markets).

- **City — deposit banking and the funded debt.** Diversification (Jacobs
  import-replacement) needs big SOC beyond current tax flow, so the city **borrows**.
  Deposit banking intermediates savings → investment (Goldsmith; Levine). The
  **Financial Revolution**: a polity that can **credibly commit** to repay
  (North & Weingast, "Constitutions and Commitment," 1989 — bind the sovereign →
  collapse the risk premium → cheaper, far larger borrowing) **out-builds and
  out-fights** rivals. That is the financial **edge**, and it is institutional, not
  natural. The capital market **capitalizes the bid-rent gradient into land values**
  → mortgage / land finance (a huge share of urban capital); secure title turns land
  into pledgeable **collateral** rather than de Soto's "dead capital."

- **Metropolis — the financial centre (finance becomes the export base).** The
  gateway/entrepôt becomes a **financial entrepôt**: trade finance cleared at the hub
  grows into deposit and merchant banking, then **capital export**. Kindleberger's
  succession — **northern Italy → Amsterdam → London → New York** — each a trade
  gateway that became a creditor centre: capital flows **follow** trade, then **lead**
  it. Sassen's **global city** is the limit — a financial command node whose export
  base *is* finance, sold to distant away-markets. Public-debt markets, joint-stock
  equity, central banking.

### War, empire, tribute — the fiscal-military thread

Brewer's **fiscal-military state** (*The Sinews of Power*, 1989): war drove the
mutually-reinforcing growth of **taxation + public debt + bureaucracy**. The polity
that can **borrow** (capital-rich and credibly-committed) out-finances the one that
can only **tax or plunder** — Tilly's capital↔coercion axis, now with a financial
edge (Britain out-*spent* rivals while borrowing *cheaper*). **Tribute** is a forced
financial flow from periphery to core (Wallerstein). Conquest can **repudiate the
debt or seize the treasury** — a financial shock.

### The dark twin — financial crisis (the third discrete shock)

Finance has its own Owl of Minerva. **Minsky's Financial Instability Hypothesis**:
over a long prosperity the financing mix migrates from **hedge** (income covers
principal + interest) → **speculative** (income covers interest, principal must be
rolled) → **Ponzi** (income covers neither; survival depends on rising asset prices)
— *"stability is destabilizing,"* until a *Minsky moment* forces fire-sales.
**Kindleberger's** anatomy fits 300 years of history: *displacement → boom → euphoria
→ distress → revulsion/panic/crash* (Tulip 1637; Mississippi & South Sea 1720). The
**land cycle** (Hoyt's ~18-year Chicago land-value cycle) is the urban form: leverage
chasing the capitalized rent overshoots, then busts. So **finance adds a third
discrete event-shock alongside conquest and plague — the financial crisis — and the
flourishing financial centre is the most prone to it.**

### → modeling rules

- Finance is a **flow network over the real economy**: surplus → (savings rate) → a
  **capital pool** → allocated by the **financial regime** (redistribution / merchant
  / bank / market / state, set by phase + tech) → funds lumpy projects and capitalizes
  the base.
- A **cost-of-capital `ρ`** — the finance analogue of transport cost — **falls as
  finance deepens** (institutions, credible commitment, market depth). Lower `ρ` →
  more/bigger projects sooner → a financial edge.
- **Lumpy-project decision:** build when `NPV(ρ) > 0` and `tax capacity + borrowing
  capacity ≥ lump`. Borrowing capacity `= f(credible commitment, tax base, debt
  already outstanding)`; an uncommitted, market-thin city has high `ρ` and small
  capacity → it cannot fund the big push without the Gerschenkron substitution (a
  bank or the state).
- **Land finance:** capitalize the bid-rent gradient into land value; land is
  **collateral** that expands borrowing capacity; run an ~18-year land cycle that can
  overshoot.
- **Crisis shock:** a discrete event fired when the **Ponzi/leverage share** crosses a
  threshold — wipes a chunk of the capital pool, can cascade; its probability rises
  with the size and financial intensity of the city. The third member of the event
  layer (conquest · plague · crisis).

---

## The political register — defense, empire, conquest

Everything above models the city as an economic growth machine. The full sweep — the
eXterminate of a 4X — needs the city as a **political-military actor** too. Most of it
falls out of the economics already built; one piece does not.

### Defense — a founding engine and a standing cost

Defense belongs in the **early running, including nucleation**. Site-selection already
prizes **defensive sites** (hilltop, river-meander, island); the political register
adds defense as a **founding function** — the citadel/acropolis or garrison that
*seeds* a town (you cannot accumulate a surplus you cannot hold), on the same footing
as break-of-bulk, the staple, and the administrative seat. The organizing frame is
**Tilly's capital↔coercion spectrum** (*Coercion, Capital, and European States*,
1990): polities form along an axis from the **capital-intensive pole** (cities, trade —
the economic engine of everything above) to the **coercion-intensive pole** (war,
conquest, empire) — *"war made the state, and the state made war."* A `polis`
settlement carries a **coercion parameter** locating it on that axis; defense is both
a founding engine and an ongoing **security cost** paid from surplus (walls, garrison)
to protect the extraction that lets the base function.

### Empire — an emergent configuration, not a separate engine

*Is there an imperial version of the narrative, or can it be done by managing inputs
and outputs?* **Mostly the latter.** Empire is what the machinery already built *does*
at high extraction-reach plus coercion:

- An **imperial capital is a super-gateway** — the gateway/away-markets door run in
  reverse and at scale: it extracts surplus from a vast **periphery** and returns less.
  This *is* **Wallerstein's world-systems** core / semi-periphery / periphery (1974),
  which the regional central-place hierarchy + gateway terms already encode; **tribute
  is a forced, one-way reversal of trade**.
- The **primate city** (Jefferson's *Law of the Primate City*, 1939) is just a **Zipf
  deviation** — the top city pushed disproportionately large (rank-size exponent
  `q > 1`) by political concentration. Imperial overconcentration is a *parameter on
  the size distribution*, not new machinery.
- The **failure mode** is **Kennedy's imperial overstretch** (*The Rise and Fall of the
  Great Powers*, 1987): military reach outruns the economic base — Tainter's negative
  marginal return in uniform.

So no separate "empire engine" is needed: empire is a **configuration** of the gateway,
the hierarchy, path-dependence, and the coercion parameter.

### Conquest — the one piece the clocks can't produce

Conquest is the exception: a **discrete regime-change event**, nothing the smooth
growth curves, the lumpy projects, or the tech clock can generate. It is the
city-scale cousin of hoop's `removeImpact` shock, with outcomes on a spectrum:

| outcome | what happens | when |
|---|---|---|
| **sack / raze** (urbicide) | sunk capital destroyed; the city can die | rare — the city is the prize |
| **tribute** | city kept, surplus redirected outward (the base now exports to the conqueror); flourishing drops | the common case |
| **elite-swap** | the `govern` sector is replaced; population continues | frequent |
| **absorption** | changes hands, carries on | frequent |

The outcome is **size-dependent — exactly the intuition that a metropolis loses
little**. Locational inertia (the Bleakley–Lin logic: sunk capital + agglomeration
persist through regime change) means a **great city survives conquest and just changes
masters** — Rome, Constantinople, Damascus, conquered repeatedly, carry on. A
**mono-functional nucleus**, by contrast, **can die** when its single engine is taken.
Conquerors therefore usually **preserve rather than destroy** — the city is the tax
base — so **urbicide is the exception**. In model terms: conquest applies a shock whose
damage is `f(size, diversity, conqueror intent, whether the base sector survives)`; a
diversified metropolis absorbs it, a one-engine town may collapse to ruin.

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

**Flourishing — the structural edge & its decline-coupling**
- Peter Hall, *Cities in Civilization* (1998) — urban golden ages: https://en.wikipedia.org/wiki/Cities_in_Civilization
- Carl Schorske, *Fin-de-Siècle Vienna* (1980): https://en.wikipedia.org/wiki/Fin-de-Si%C3%A8cle_Vienna
- Richard Florida, the creative class / 3 T's (2002): https://en.wikipedia.org/wiki/Creative_class
- Edward Glaeser, *Triumph of the City* (2011): https://en.wikipedia.org/wiki/Triumph_of_the_City
- Robert Lucas, "On the Mechanics of Economic Development" (1988) — human-capital externalities: https://en.wikipedia.org/wiki/Human_capital
- Saskia Sassen, the global city (1991): https://en.wikipedia.org/wiki/Global_city
- Hägerstrand, spatial diffusion of innovation: https://en.wikipedia.org/wiki/Diffusion_of_innovations
- Hegel, the owl of Minerva: https://en.wikipedia.org/wiki/Owl_of_Minerva
- Oswald Spengler, *The Decline of the West* (1918–22): https://en.wikipedia.org/wiki/The_Decline_of_the_West
- Joseph Tainter, *The Collapse of Complex Societies* (1988): https://en.wikipedia.org/wiki/The_Collapse_of_Complex_Societies

**Financial flows**
- Ross Levine, "Financial Development and Economic Growth" (JEL 1997) — the five functions: https://www.jstor.org/stable/2729790
- King & Levine, "Finance and Growth: Schumpeter Might Be Right" (QJE 1993): https://academic.oup.com/qje/article-abstract/108/3/717/1881857
- Raymond Goldsmith, financial deepening / FIR (1969): https://en.wikipedia.org/wiki/Financial_deepening
- Karl Polanyi, modes of integration (reciprocity / redistribution / exchange): https://en.wikipedia.org/wiki/Karl_Polanyi
- History of banking / the bill of exchange: https://en.wikipedia.org/wiki/History_of_banking
- North & Weingast, "Constitutions and Commitment" (1989): http://pscourses.ucsd.edu/ps200b/North%20and%20Weingast%20-%20Constitutions%20and%20Commitment.pdf
- John Brewer, *The Sinews of Power* — the fiscal-military state (1989): https://books.google.com/books/about/The_Sinews_of_Power.html?id=uqzA-Xp416YC
- Alexander Gerschenkron, *Economic Backwardness in Historical Perspective* (1962): https://en.wikipedia.org/wiki/Economic_Backwardness_in_Historical_Perspective
- Henry George, *Progress and Poverty* / land-value capture (1879): https://en.wikipedia.org/wiki/Henry_George
- Homer Hoyt, the ~18-year land-value cycle (1933): https://en.wikipedia.org/wiki/Homer_Hoyt
- Hyman Minsky, the financial-instability hypothesis (hedge/speculative/Ponzi): https://en.wikipedia.org/wiki/Minsky_moment
- Kindleberger, *Manias, Panics, and Crashes* + the succession of financial centres: https://en.wikipedia.org/wiki/Manias,_Panics,_and_Crashes

**The political register — defense, empire, conquest**
- Charles Tilly, *Coercion, Capital, and European States* (1990): https://en.wikipedia.org/wiki/Coercion,_Capital,_and_European_States
- Immanuel Wallerstein, world-systems theory (1974): https://en.wikipedia.org/wiki/World-systems_theory
- Mark Jefferson, "The Law of the Primate City" (1939): https://en.wikipedia.org/wiki/Primate_city
- Paul Kennedy, *The Rise and Fall of the Great Powers* (1987): https://en.wikipedia.org/wiki/The_Rise_and_Fall_of_the_Great_Powers
- Urbicide (deliberate destruction of a city): https://en.wikipedia.org/wiki/Urbicide

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
