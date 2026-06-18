# A Theory of City Development

*The charter for `polis` — a procedural generator that grows the whole history of
a city into a generated substrate, from founding to metropolis. The long arc is a
4X game; this is the theory it will stand on.*

`polis` sits between two things that already exist in this repo:

- **[`mappa`](../mappa/)** — a deterministic planet (plate tectonics, hydrology,
  climate, biomes) that already scatters plausible *city sites*. It answers
  **where**, once.
- **[`hoop`](../hoop/)** — a game whose internals include two pure, node-tested
  field solvers we will reuse: a **Physarum** desire-line road grower
  ([`hoop/paint/flux.js`](../hoop/paint/flux.js)) and a **hypoxia / angiogenesis**
  capillary grower ([`hoop/v7/foam.js`](../hoop/v7/foam.js)).

The thesis of `polis` is that a city's history is the story of those two solvers
**handed off from one to the other**, run on `mappa`'s ground.

---

## 0. The central idea — one field, two regimes

A city is, at every moment, solving a flow problem on a graph. But *which* flow
problem changes as it grows, and the change is the whole story.

> **Both hoop solvers are the graph Laplacian `L` with different forcing.**
>
> - **Coverage regime (young town).** The problem is *keep everyone served* —
>   every dwelling within reach of water, market, mill, gate. This is a
>   **diffusion / Poisson** problem: a saturation field spreads from supply
>   points, and where it falls short (the "hypoxic" fringe) the town sprouts a
>   new lane toward it. `hoop/v7/foam.js`'s `seize()` is exactly this — a
>   multi-source BFS perfusion field plus angiogenesis toward the worst-served
>   tissue. Space-filling, branching, organic: the medieval town plan.
>
> - **Demand regime (mature city).** The problem is *move concentrated flows
>   efficiently* — thousands of journeys between many origins and destinations.
>   This is a **current-flow** problem: inject origin→destination "current,"
>   solve for the potential, and the stationary flux is the time-integrated
>   occupancy of every street (the Laplace transform of the journey ensemble —
>   `flux.js` says this in its own header). Streets are the **superlevel set** of
>   that traffic field. `hoop/paint/flux.js`'s `growNetwork()` is exactly this.

Same operator `L`. The coverage regime forces it with a roughly uniform
supply-minus-demand source; the demand regime forces it with a sparse, peaked
origin–destination current matrix. **A city ages from the first forcing to the
second.** Early, the binding constraint is *area served*; late, it is *flow
carried*. `polis` is the simulation of that handoff.

This is not a metaphor we are imposing — it is what the two kernels already
compute. `polis`'s job is to (a) pick where to start them on `mappa`, (b) run the
coverage solver while the town is small, (c) cross-fade to the demand solver as
trade thickens, and (d) let the regional, statistical laws (central place,
rank-size, scaling) emerge across many such cities.

The same activation/inhibition tension appears in the complexity literature as a
**Turing reaction–diffusion** instability (short-range agglomeration vs
long-range congestion) — which is reassuring: the coverage/demand handoff is the
discrete, graph-side cousin of the same pattern-forming physics.

---

## The four phases

### Phase 1 — The Site: *why here*

A settlement nucleates where the ground gives it a reason. The classic distinction
is **site vs situation**: *site* is the physical ground a settlement occupies
(relief, drainage, water, defensibility, building land); *situation* is its
relation to the wider world (routes, resources, other settlements). The two are
independent — a town can have a poor site but a commanding situation, or the
reverse — so `polis` scores every candidate `mappa` cell on **two separate axes**.

Some terrain features are so decisive they force a settlement almost regardless of
spacing. These are the *forced spawn points*:

| Feature | Why it nucleates a town | mappa signal |
|---|---|---|
| **Head of navigation** | farthest upstream a boat reaches → cargo must transfer (break-of-bulk) | walk `rivers` upstream until `flow` drops below a hull threshold |
| **Fall line** | hard upland meets soft coastal plain → rapids = head of navigation **and** water power; one escarpment seeds a *string* of cities (the US Fall Line: Richmond, Baltimore, Washington…) | a `plate`/lithology contact crossed by a river |
| **Lowest bridging point** | last fordable/bridgeable spot before the estuary → river port (London on the Thames) | most-downstream river cell narrow enough to bridge |
| **Harbour** | sheltered deep water + inland route → maritime trade | coast cells scored by shelter × depth × inland access |
| **Defensive site** | hill, meander-loop (water on 3 sides, like Durham), island | relief prominence + fraction of neighbourhood that is water |
| **Gap / pass town** | the only way through a barrier funnels all traffic | saddle points in `elev` |
| **Wet/dry-point** | water in a dry land; dry ground in a marsh — both seek the land/water *edge* | `water` adjacency × `biome` aridity |

**→ generative rule.** `situation_score` = betweenness on the route/river graph;
`site_score` = local terrain sample. Spawn where `w_site·site + w_situation·situation`
clears a threshold, with the forced points pre-seeded. Crucially the founding
advantage is a **one-time tie-break**, not a permanent subsidy (see Phase 4's
lock-in) — this is what lets a city outlive the reason it was founded.

*Improving on mappa.* mappa's current placement is a habitability k-means scatter.
Phase 1 replaces "plausible-looking dots" with *geographically motivated* foundings
that a player can read the logic of.

### Phase 2 — Nucleation & organic accretion: *the hypoxia phase*

A village becomes a town. The binding constraints are food and reach.

- **Food first (Childe's Urban Revolution, 1950).** A settlement cannot hold more
  non-farmers than its agricultural **surplus** can feed. `max_specialists ≈
  (arable × yield × surplus_fraction) / food_per_capita`. No surplus → stuck at
  village tier. This is the carrying-capacity gate, read off `mappa`'s `moisture` +
  `biome` + river-valley fertility.

- **Reach second (the angiogenesis solver).** As dwellings accrete, the town must
  keep its fringe within reach of the well, the market, the mill, the gate. This is
  `hoop/v7/foam.js`'s `seize()` verbatim in spirit: compute the perfusion field
  (hop-distance from every cell to the nearest lane), find the most under-served
  ("hypoxic") cell, and sprout a capillary lane toward it; repeat until everything
  is within `oxygenReach`. The result is the branching, space-filling, slightly
  irregular street web of an organically grown town.

- **The grain of the fabric (Conzen, *Alnwick*, 1960).** The plan accretes in three
  layers — **streets → plots → buildings**. Plots are **burgage strips**: long,
  narrow, perpendicular to the frontage. Each plot lives a **burgage cycle**:
  *institutive* (one building at the street head) → *repletive* (backland infills) →
  *climax* (saturation) → *recessive* (clearance to "urban fallow," then
  redevelop). This is a per-plot state machine that drives density over time.

- **The first land-use gradient (von Thünen, 1826).** Even a small town shows
  rings, because rent trades off against transport cost: `R = Y(p−c) − Y·F·m`
  (rent = gate profit minus yield×freight×distance), so each use bids a line in
  distance and land goes to the **upper envelope**. Perishable/heavy uses hug the
  centre; extensive uses push out.

**→ generative rule.** Run the coverage solver to grow lanes; gate population by
surplus; age each plot through the burgage cycle; assign land use by the bid-rent
envelope on travel-distance to the core.

### Phase 3 — Networked maturation: *the Physarum phase*

The town becomes a city with trade, and the flow problem flips from coverage to
demand. Now the Physarum solver takes over.

- **Demand from gravity (Reilly, 1931).** Interaction between places goes as
  `T_ij ∝ P_i·P_j / d_ij²` (inverse-square). This origin–destination matrix is the
  *current* we inject.

- **Arteries from flux (Tero et al., *Science* 2010 — the slime-mold Tokyo-rail
  result).** Route the demand, accumulate flux, and let each edge's conductance
  adapt: `dD_ij/dt = f(|Q_ij|) − D_ij` — thicken where used, decay where idle.
  Streets are the superlevel set of the converged field. This is `flux.js`'s
  `growNetwork()`. The one real knob is the feedback exponent **μ**: **μ<1** keeps
  redundant parallel streets (a **grid**); **μ>1** collapses everyone onto one
  arterial (a **tree**). μ *is* "planned vs organic."

- **Land use differentiates (Alonso 1964; Burgess 1925, Hoyt 1939,
  Harris–Ullman 1945).** The bid-rent envelope, now over the real network, sorts
  uses into **commerce → industry → residential** from the centre. Which *pattern*
  emerges is a selectable kernel: **concentric** rings (Burgess, invasion–
  succession), **sectors** along transport rays (Hoyt), or **multiple nuclei**
  (Harris–Ullman: specialized facilities + agglomeration attraction + incompatible-
  use repulsion + rent-affordability spawn several centres).

- **History freezes into the plan (Conzen's fringe belts).** When growth pauses at
  a wall or common, low-density uses (cemeteries, barracks, parks) accrete there;
  when growth leaps past, that ring is embedded as a **fringe belt** — a fossil of
  a former edge. The **morphological frame** (old walls, route lines, plot
  boundaries) constrains all later growth, which is what makes a generated city
  read as *grown*, not stamped.

- **The loop closes (Levinson & Xie, co-evolution of land use and networks).**
  New road → accessibility → development → demand → more road. `polis` iterates
  Phases 2–3 rather than running them once.

**→ generative rule.** Generate gravity demand between sub-centres; grow the road
network with the flux solver (μ as the messiness dial); assign land use by the
bid-rent envelope under a chosen structure kernel; drop fringe belts at each epoch
edge; persist a morphological-frame constraint mask; iterate.

### Phase 4 — The system: *the region, and the through-line*

One city is never alone, and statistical regularities emerge across many.

- **Hierarchy (Christaller, 1933).** Every service has a **threshold** (minimum
  market) and a **range** (max travel). A place hosts a service iff its catchment
  clears the threshold; its **order** is the highest service it supports. Market
  areas pack into **hexagons**; the nesting factor **K** picks the geometry —
  **K=3** market-optimizing, **K=4** traffic (lower centres fall on the arterials),
  **K=7** administrative. Lösch loosens this into a per-good family of hexagons,
  producing six city-rich and six city-poor radial sectors.

- **Size distribution (Zipf 1949; Gibrat 1931; Gabaix 1999).** City sizes follow
  the rank-size law `P_n ≈ P_1/n`. Why: **Gibrat** (growth rate independent of size)
  makes log-size a sum of shocks → lognormal; add **Gabaix's** lower reflecting
  barrier (cities can't vanish) and the steady state becomes **Zipf** (exponent
  ζ=1), because conserving expected relative size pins the Kesten condition
  `E[A^ζ]=1` at ζ=1. So we don't hand-author the hierarchy — we run proportionate
  growth with a floor and it self-organizes.

- **Scaling (Bettencourt & West, *PNAS* 2007).** Aggregate quantities go as
  `Y = Y₀·N^β`: **infrastructure sublinear** (roads, cable; β≈0.85 — economies of
  scale), **socioeconomic output superlinear** (GDP, patents, wages, *and* crime;
  β≈1.15 — increasing returns), **individual needs linear** (housing, water; β≈1.0).
  Pick a city's `N`, then *derive* its road budget (`N^0.85`), its wealth/crime/
  innovation (`N^1.15`), and its housing (`N^1.0`) — no manual balancing, and the
  big city automatically *feels* denser and richer per capita.

- **Path dependence — the through-line (David 1985; Arthur 1989; Marshall 1890;
  Bleakley & Lin 2012).** Why early accidents persist. A founding advantage breaks
  the *initial tie* about where to build; **increasing returns** (Marshall's
  trinity: labour pooling, supplier linkages, knowledge spillovers) then amplify the
  lead via super-linear / preferential-attachment growth; and **sunk, durable
  infrastructure does not decay when the founding feature dies.** The clean proof is
  **portage cities**: founded at fall-line/head-of-navigation sites, they kept
  concentrating population *after* river navigation became obsolete (~6% lower
  density per 10% farther from the dead portage). The lock-in test for `polis`:
  delete a city's founding feature mid-run; it should keep growing.

**→ generative rule.** Place central places on a K-lattice (or Löschian overlay);
grow sizes by Gibrat-with-a-floor → Zipf; derive each city's stats from `N^β`;
seed a founding bonus, amplify it with super-linear agglomeration, and never let
sunk infrastructure decay — so the map remembers its accidents.

---

## Determinism (the inherited rule)

Everything is seeded. `(worldSeed, siteCell)` → a city's entire history, identical
on every machine, freezable to an ATProto record — exactly mappa's and hoop's
contract. No `Date.now()`, no unseeded `Math.random()` in generation. A city
permalink (and, later, a 4X save) is only meaningful if the history is reproducible.

---

## The road to a 4X

`polis` is the **map and history layer** a 4X needs. Once a city has a legible,
sourced developmental history — a founding reason, an organic core, arteries that
thickened with trade, quarters that differentiated, a hinterland that filled in,
a place in a Zipf hierarchy — the 4X layers (eXplore the `mappa` world, eXpand
along the site-score field, eXploit the surplus/scaling economy, eXterminate over
the central-place catchments) have something real to act on. The phases above are,
deliberately, also the tech/era progression of such a game.

---

## Sources

**Site & situation**
- Settlement site and situation — geographyfieldwork.com: https://geographyfieldwork.com/SiteSituation.htm
- Urban geography glossary (nodal point, bridging point) — geographyfieldwork.com: https://geographyfieldwork.com/urban_geography_glossary.htm
- Fall line — Wikipedia: https://en.wikipedia.org/wiki/Fall_line
- Atlantic Seaboard Fall Line — Wikipedia: https://en.wikipedia.org/wiki/Atlantic_Seaboard_Fall_Line
- Dry point — Wikipedia: https://en.wikipedia.org/wiki/Dry_point

**Central place theory**
- Central place theory — Wikipedia: https://en.wikipedia.org/wiki/Central_place_theory
- Christaller (1933), threshold/range/K-principles — PlanningTank: https://medium.com/@PlanningTank/central-place-theory-by-walter-christaller-1933-c9d4f5d8c2a
- The modification of August Lösch — Rashid's Blog: https://rashidfaridi.com/2020/05/05/the-modification-of-august-losch/

**Rank-size / Zipf / Gibrat**
- Gabaix, "Zipf's Law for Cities: An Explanation," QJE 1999: https://pages.stern.nyu.edu/~xgabaix/papers/zipf.pdf
- Gabaix, "Power Laws in Economics and Finance": https://pages.stern.nyu.edu/~xgabaix/papers/pl-ar.pdf
- Stochastic equations and cities (Gibrat/Kesten math) — arXiv: https://arxiv.org/html/2307.05269
- Gibrat's law — Wikipedia: https://en.wikipedia.org/wiki/Gibrat%27s_law
- Rank-size distribution — Wikipedia: https://en.wikipedia.org/wiki/Rank-size_distribution
- Eeckhout, "Gibrat's Law for (All) Cities," AER 2004: https://www.aeaweb.org/articles?id=10.1257%2F0002828043052303

**Internal structure models**
- Concentric zone model (Burgess) — Wikipedia: https://en.wikipedia.org/wiki/Concentric_zone_model
- Sector & multiple-nuclei (Hoyt; Harris–Ullman) — Geography of Transport Systems: https://transportgeography.org/contents/chapter8/urban-land-use-transportation/sector-nuclei-land-use/

**Von Thünen / bid-rent**
- Von Thünen model — Geography Realm: https://www.geographyrealm.com/von-thunen-model-of-agricultural-land-use/
- Von Thünen regional land use (rent formula) — Geography of Transport Systems: https://transportgeography.org/contents/chapter8/urban-land-use-transportation/von-thunen-regional-land-use/
- Bid rent theory (Alonso) — Wikipedia: https://en.wikipedia.org/wiki/Bid_rent_theory

**Urban morphology (Conzen)**
- Conzen (1960), *Alnwick* — Internet Archive: https://archive.org/details/alnwicknorthumbe00conz
- Conzen glossary (burgage plot, fringe belt, morphological frame) — burgageplots.info: https://www.burgageplots.info/glossary-of-terms
- Historico-geographical approach / fringe belts — SURF briefing paper: https://www.surf.com.cy/wp-content/uploads/2023/03/EPUM_BP1_Historical-Geographical.pdf

**Transport networks**
- Tero et al., "Rules for Biologically Inspired Adaptive Network Design," *Science* 2010: https://www.science.org/doi/10.1126/science.1177894
- Slime mould simulates the Tokyo rail network — National Geographic: https://www.nationalgeographic.com/science/article/slime-mould-attacks-simulates-tokyo-rail-network
- Reilly's law of retail gravitation — Wikipedia: https://en.wikipedia.org/wiki/Reilly%27s_law_of_retail_gravitation
- Levinson, Xie & Zhu, "The Co-Evolution of Land Use and Road Networks" (2007): https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1748607

**Complexity science**
- Batty & Longley, *Fractal Cities*: http://www.complexcity.info/fractalcities/
- Makse, Havlin & Stanley, "Modelling urban growth patterns," *Nature* 1995: https://www.nature.com/articles/377608a0
- Turing pattern — Wikipedia: https://en.wikipedia.org/wiki/Turing_pattern
- Bettencourt et al., "Growth, innovation, scaling, and the pace of life in cities," *PNAS* 2007: https://www.pnas.org/doi/abs/10.1073/pnas.0610172104
- Urban scaling — Wikipedia: https://en.wikipedia.org/wiki/Urban_scaling

**Stages of growth & path dependence**
- Settlement hierarchy — Wikipedia: https://en.wikipedia.org/wiki/Settlement_hierarchy
- Urban revolution (Childe) — Wikipedia: https://en.wikipedia.org/wiki/Urban_revolution
- Urbanization (S-curve) — Our World in Data: https://ourworldindata.org/urbanization
- Conurbation (Geddes 1915) — Britannica: https://www.britannica.com/topic/conurbation
- Northeast megalopolis (Gottmann 1961) — Wikipedia: https://en.wikipedia.org/wiki/Northeast_megalopolis
- David, "Clio and the Economics of QWERTY," AER 1985: https://en.wikipedia.org/wiki/Path_dependence
- Arthur, increasing returns & lock-in (summary): https://blas.com/increasing-returns-and-path-dependence/
- Bleakley & Lin, "Portage and Path Dependence," QJE 2012: https://pmc.ncbi.nlm.nih.gov/articles/PMC3738199/

*Method note: several primary PDFs (Tero, Bettencourt, Gabaix, Makse) are
image-encoded; their equations and exponents were cross-confirmed across multiple
secondary academic sources. The load-bearing values — Physarum
`dD/dt = f(|Q|) − D` with `f(Q)=|Q|^μ/(1+|Q|^μ)`; gravity inverse-square + Converse
breaking point; scaling β≈1.15 / 0.85 / 1.0 — are multiply attested.*
