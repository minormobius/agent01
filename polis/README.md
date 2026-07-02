# polis — procedural city history

**Live at:** `mino.mobi/polis/` (rides the root deploy surface, like `mappa/`)
**Status:** theory / design phase. No engine yet — this is the charter for one.

> **The thesis.** `polis` is principally a model of **urban economics across a
> city's life cycle** — what economic engine makes a settlement nucleate, and what
> keeps it growing. [`mappa`](../mappa/) generates the *world* (a deterministic
> planet of tectonics, hydrology, climate and biomes, with plausible city sites);
> `polis` takes a site and grows the **whole economic history** of a city into it
> — nucleus to town to city to metropolis — procedurally, deterministically, from
> a seed. The spatial form (streets, quarters, arteries) is the *expression* of the
> underlying economy, not the other way round. The long arc is a **4X game**; this
> directory is where the economic theory is worked out first.

## The core economic engine (how a city starts, and keeps growing)

A city nucleates around **one basic (export) activity** — "the big game in town":
a mine, a port / break-of-bulk point, a ford-market, a temple-seat. That basic
activity earns income from *outside*; the **economic-base multiplier**
`M = 1/(1 − s)` (s = local-serving share of employment) turns base jobs into total
jobs by spinning up the non-basic (local-serving) economy. That multiplier is the
first engine of growth. What lets a city outgrow its *founding* base is the second
engine: **agglomeration / increasing returns** (productivity rises ~3–8% per
doubling of size) and **Jacobs import-replacement** (the city starts making what
it imported → new local work → new exports → the base itself grows, endogenously).

`mappa`'s site placement answers *where*; it has no notion of a city *growing* an
economy. `polis` is that missing middle — the bridge from `mappa`'s planet to a
playable, legible urban world with a real economic history.

## The substrate it consumes (from mappa)

`mappa`'s engine (`mappa/engine.js`) exposes, per mesh cell: `elev`, `water`
(land/ocean/lake), `rivers` (segments with `flow`), `temperature`, `moisture`,
`biome`, `plate`, and true spherical `area` + `adj`acency. `polis` reads that as
the **ground a city grows on** — water gives drink and trade, rivers and coasts
give routes, biome and moisture give fertility (the hinterland's carrying
capacity), relief gives defensibility and friction. Determinism is shared:
mappa's `mulberry32` PRNG, same seed → same world → same city.

## Three regimes — the economy as a forcing on one field

The spatial network is the field-solve of the economy. On the graph-Laplacian, the
*forcing* (where current is injected) tracks the **concentration of the economic
base**, and it evolves over the life cycle from a single point → uniform → many
peaks. Two pure, node-tested `hoop` solvers cover all three regimes — and Physarum
**bookends** the cycle:

| life-cycle regime | economy | forcing | solver | form |
|---|---|---|---|---|
| **1 · Nucleus** | monoculture — one export engine; the multiplier barely started | a *single* dominant sink | **Physarum** ([`flux.js`](../hoop/paint/flux.js)), μ high → tree | **spokes to the big game in town**; everything else barely on the map |
| **2 · Coverage** | the base multiplier has spun up local-serving services that must be reachable everywhere | a roughly *uniform* source | **hypoxia / angiogenesis** ([`foam.js`](../hoop/v7/foam.js) `seize()`) | capillary infill — the town fills in |
| **3 · Demand** | a diversified economy (import-replacement, agglomeration) — many origins & destinations | *many peaked* O–D currents | **Physarum** ([`flux.js`](../hoop/paint/flux.js)), μ tunes grid↔tree | arterial hierarchy — the trading city |

The same Physarum solver appears at birth (regime 1) and maturity (regime 3); the
only difference is the *concentration of the economic forcing* — one point vs many.
`polis` does not fork these kernels — it vendors/ports them the way hoop vendors
`auth.js`: re-sync from source, never diverge.

## The economic life cycle (see `index.html` / `THEORY.md`)

0. **Site & the founding engine** — *why here, and what's the big game in town.*
   Site vs situation; the break-of-bulk / staple / surplus that seeds the export base.
1. **Nucleus** — *regime 1.* One basic sector; spokes to the core; the multiplier
   `M = 1/(1−s)` begins.
2. **Town** — *regime 2 (hypoxia).* The multiplier spins up non-basic services;
   the fabric fills in (Conzen's burgage cycle; von Thünen rings).
3. **City** — *regime 3 (Physarum).* Agglomeration + Jacobs import-replacement
   diversify the base; arterial trade network; bid-rent sorts land use
   (Burgess / Hoyt / Harris-Ullman).
4. **Metropolis & the system** — superlinear scaling (Bettencourt–West), Thompson's
   urban size ratchet, the central-place hierarchy and Zipf across many cities.

## The wider model — a coupled city–hinterland economy on three clocks

The phases are the *shape*; the *engine* runs on three clocks, across two
territories, judged on two axes.

**Three clocks.**
- **Continuous (curves).** Population and productivity grow logistically toward a
  carrying capacity `K` — smooth growth on the demand side.
- **Lumpy (projects).** Roads, walls, mills, aqueducts and buildings arrive as
  discrete, indivisible **projects** financed out of surplus/capital — step-changes
  in capacity, not a continuous fill (Hirschman's social-overhead-capital,
  Rosenstein-Rodan's big push).
- **Exogenous (technology).** A **tech tree** advances, and each technology shifts
  the parameters of the other two clocks: raising `K` (agricultural surplus),
  lowering **transport cost** (the master lever that tips Krugman's bifurcation),
  raising productivity, cutting project costs. *Can we do this without a tech tree?*
  Effectively no — technology is the only thing that moves the otherwise-fixed
  parameters across the life cycle; without it a city saturates against a fixed `K`
  and has no history. We **reuse the 500-node DAG in [`cards`](../cards/js/pools/tech-pool.js)**
  (8 eras × 12 domains incl. agriculture/transportation/finance) and add an
  `effects` layer mapping each tech onto those economic levers.

**Two territories — a hinterland sim as much as a city sim.** A city and its
hinterland are one coupled system. The hinterland sends in **surplus** (food →
carrying capacity) and **raw resources** (the staple); the city sends out
**services** (central-place catchment) and Jacobs' **five forces** (city markets,
city jobs, transplanted work, technology, capital) that organize the region. von
Thünen's rings *are* the hinterland arranged by the city. A city is only as big as
its hinterland surplus + trade can feed.

**The broader economy — two doors to the wider world.** Growth has two distinct
external drivers: the **central place** (serve the local hinterland — Christaller)
and the **gateway** (reach distant *away markets* via long-distance trade — Vance's
mercantile model, the break-of-bulk entrepôt). Raw-resource availability +
agricultural surplus + away-market access define the economy the city plugs into.

**Two axes — scale and flourishing.** A city is judged not only on *scale*
(population, GDP — the scaling laws) but on **flourishing**, which has two faces. The
**floor** is livability — the civic-vitality model from
[`hoop/econ`](../hoop/econ/econ.js) (`scoreSociety()` → vitality + tier on seven
sub-signals; *"the real output is regard"*). The **bloom** is a structural edge —
the city's capacity to attract talent and **generate technology** (Vienna 1900; Peter
Hall's golden ages; Florida's Talent/Technology/Tolerance; Glaeser/Lucas human
capital), which *feeds back* into growth (talent → innovation → import-replacement →
new export base) and is a competitive edge because technology diffuses. The **dusk**
is the Owl of Minerva — flourishing is non-monotonic, peaking on the edge of
collapse (Tainter's declining marginal returns on complexity), so it carries a
complexity cost that can turn the feedback negative at the top.

**The political register — defense, empire, conquest.** The full sweep (a 4X's
eXterminate) needs the city as a political-military actor. **Defense** is a founding
engine even at nucleation (the citadel/garrison that seeds a town) and a standing
cost, with Tilly's **capital↔coercion spectrum** locating each polity between the
"city" and "empire" poles. **Empire** needs no separate engine — an imperial capital
is a *super-gateway* extracting periphery surplus (Wallerstein world-systems;
tribute = forced reverse trade), and a *primate city* is just a Zipf deviation
(Jefferson). **Conquest** is the one piece the continuous/lumpy/tech clocks can't
produce — a discrete regime-change *event* (sack / tribute / elite-swap /
absorption), reusing hoop's `removeImpact` shock at city scale, with size-dependent
damage: a diversified metropolis survives via locational inertia, a mono-functional
nucleus can die.

## Borrowed assets (re-synced, never forked)

| Asset | From | Role in polis |
|---|---|---|
| Physarum flux grower | [`hoop/paint/flux.js`](../hoop/paint/flux.js) | regimes 1 & 3 — the network as the traffic field's superlevel set |
| hypoxia / angiogenesis | [`hoop/v7/foam.js`](../hoop/v7/foam.js) | regime 2 — coverage-driven capillary infill |
| civic-vitality oracle | [`hoop/econ/econ.js`](../hoop/econ/econ.js) | the flourishing axis (QoL above GDP) |
| 500-node tech DAG | [`cards/js/pools/tech-pool.js`](../cards/js/pools/tech-pool.js) | the exogenous clock + an `effects` layer over economic levers |
| world substrate | [`mappa/engine.js`](../mappa/engine.js) | terrain, hydrology, fertility — where resources/ag/routes are |

## Layout (mirrors mappa: live engine at `/`, theory at `/docs/`)

| Path | Role |
|---|---|
| `index.html` | **The main page — the living map.** Roll a **real mappa planet** → auto-select a city-rich (temperate) region → retile it as a detailed Voronoi mosaic carrying mappa's terrain → run the economy from the **ice age to the future**: townships nucleate, **inter-town arteries grow through the tiling**, cities become centres of gravity, **tech waves** ripple, the coastline/glaciers shift with climate, **discrete shocks** (plague/conquest/crisis) dent the curves. Timeline scrubber, a **⊞ land-use** overlay (hinterland exploitation: crop/pasture/forest/mine/wild), click-a-town. |
| `docs/index.html` | **The docs — the theory.** The economic life cycle, the three regimes, the wider coupled model, financial flows, the political register, the grounding + sources. |
| `prng.js` | `mulberry32` + `hash2` — deterministic randomness, bit-exact with mappa/hoop. |
| `mappaWorld.js` | **The real mappa engine as terrain source** (imports `../mappa/engine.js`, not forked): `rollMappaWorld(seed)` generates a planet, `selectRegion()` auto-picks the city-richest temperate window, `makeSampler()` returns a planar IDW sampler of mappa's real elevation/temperature/moisture/biome over the region. |
| `mesh.js` | `buildMesh(seed, region, sampler)` — the detailed **Voronoi mosaic** carrying real mappa terrain (finer than mappa's own cells): jittered seeds, nearest-seed adjacency, sampled terrain, rivers; `cellState(cell, env)` colours by mappa biome + era (sea level/temp). |
| `arteries.js` | `makeArteries(mesh)` — Physarum flux on the cell graph: gravity demand → conductance adapts → the inter-town network as the traffic field's superlevel set. |
| `chronicle.js` | `runChronicle(seed, mesh, {world})` — the timeline: the **causal climate** (`../mappa/climate-forcing.js`) + the tech clock, staged nucleation **gated to the deglaciation** (cities seed as the ice retreats), economy growth (reuses `economy.js`), artery growth, tech-wave events, and **climate catastrophes** (volcanic winters / grand minima / super-eruptions) as size-dependent shocks — precomputed for replay. |
| `economy.js` | Founding engine → base multiplier → logistic growth toward a tech-lifted ceiling; agglomeration; flourishing (bloom/dusk); `conquer()` shock. Reused by the chronicle. |
| `substrate.js` · `site.js` · `sim.js` | The **v1 grid proto** (the earlier square-grid vertical slice) — kept and node-tested; superseded as the main page by the mesh pipeline above. |
| `test/chronicle.selftest.mjs` | 15 checks on the living-map pipeline (region, mesh, climate, nucleation, hierarchy, arteries, waves). |
| `test/proto.selftest.mjs` | 16 checks on the v1 grid proto. |
| `THEORY.md` · `README.md` | The written theory + this file. |

*(Still to come as the theory hardens into the sim: `tech.js` (the cards DAG +
effects), `finance.js` (the cost-of-capital gate + crisis shock — see THEORY.md),
`flourish.js` (port hoop/econ's `scoreSociety`), and live conquest/plague events.)*

## The causal climate — why the ice retreats, and why a civilization can fall

The climate is not an arbitrary curve; it reacts to **causes the generated planet
actually has**. This lives in [`../mappa/climate-forcing.js`](../mappa/climate-forcing.js)
(a mappa module — the *world* owns its climate) and feeds `chronicle.js`:

- **Orbital (Milankovitch).** Insolation paced by the **world's own axial tilt**
  (obliquity ~41 kyr) + precession under an eccentricity envelope. The window opens in a
  glacial and **deglaciates** across it — the slow metronome that ends the ice age.
- **Volcanic.** Stratospheric-aerosol **winters erupt from the world's own volcanoes**
  (`world.volc`): a sharp cooling that washes out over a few years, with a rare
  **super-eruption** (Toba-scale) that can bury a century.
- **Solar.** **Grand minima** — multi-decade dark periods of a dimmer sun (Maunder /
  Little-Ice-Age analogues), a shallow broad cooling.
- **Wetness (the pluvial).** A **humidity** curve scales the whole moisture field: an
  arid glacial → a broad **pluvial peak** early in *this world's* interglacial → a decline
  toward the present. This is the **Holocene Humid Period → aridification** arc — the wet
  founding window of Mesopotamia / a green Sahara, then the drying (the ~4.2-kyr event)
  that stressed the Bronze-Age cities. The peak is placed at the world's own deglaciation.

The state variable is **ice volume, which lags temperature by millennia** (ice sheets
melt slowly). So deglaciation is a smooth ramp and **sea level tracks it** (coastlines
advance as the ice melts), but a volcanic winter is a spike the ice barely feels.
Ice-albedo feedback makes the glacial colder and the deglaciation sharper.

**Biomes migrate.** Each cell's biome is re-derived every era from its era temperature
(static + shift) and era **wetness** (static × humidity): forests, steppe and desert
advance and retreat as the climate turns, so a region **greens in a pluvial and browns
in an aridification**. Hinterland fertility (the carrying capacity `K`) follows the same
wetness — a drying region's cities lose their food ceiling and contract, while a coastal
**gateway** that imports food endures. Wetness is thus a third path (beside volcano and
plague) by which a civilization can be **cast back**.

**Rivers carry the climate through the land.** The drainage *network* (down-slope
topology) is geology — carved once. The *discharge* through it is climate: each cell's
runoff (precipitation − evaporation, near-zero when frozen) is **routed downstream
conserving mass**, so a trunk river integrates its whole catchment. In humid reaches it
runs full to the sea and gains downstream; in arid reaches **transmission loss** (soak +
evaporation) bleeds it, so in an aridification a river **dies from its mouth inland**,
leaving incised **dry valleys** (wadis / paleochannels the renderer still shows). A
flowing channel through dry land is **irrigation** (the Nile in the desert): it lifts
local fertility in proportion to its discharge — and when the river dies, that food base
dies with it, collapsing the irrigation civilization. `computeRivers(mesh, env)` in
[`mesh.js`](mesh.js) recomputes discharge per era; `chronicle.js` precomputes it per tick
and feeds it to both the map and the surplus model.

This drives the sim on the theory's **two clocks**: the *continuous* backbone
(deglaciation → habitability → nucleation; **cities can only seed once regional ice
drops past a threshold** — the causal claim that civilization begins at the end of the
ice age) and *discrete* shocks (a super-eruption or grand minimum hits the live urban
system, size-dependent like conquest — a diversified metropolis endures on locational
inertia, a small mono-functional town is **cast back into the dark**). Everything is
deterministic from `(world, seed)`: same planet ⇒ same climate history.

`computeClimate(geo, forcing)` (also in `mappa/engine.js`) is the companion piece — it
turns any forcing into a climate *field*; `climate-forcing.js` is where the forcing
*comes from*. Both are node-tested (`mappa/test/climate*.selftest.mjs`).

## Deploy

Pure static. Served at `mino.mobi/polis/` by the root assets worker (`minomobi`).
Registered in `deploy-registry.json` under `root.serves` + `root.paths`, and in
`deploy-root.yml`'s trigger `paths` (`polis/**`). A push to `main` touching
`polis/**` runs `deploy-root.yml`. No D1, no secrets, no build step.

## Determinism (the rule, inherited)

Everything is seeded. `(worldSeed, siteCell)` → a city's entire history, the same
on every machine and freezable to an ATProto record — exactly mappa's and hoop's
contract. Never introduce `Date.now()` / unseeded `Math.random()` into
generation. This is what will make a city permalink (and, later, a 4X save)
meaningful.
