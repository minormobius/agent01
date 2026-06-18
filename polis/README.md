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
| `index.html` | **The main page — the live sim.** Roll a region, grow proto-towns, scrub the growth curves, click a town for its dossier. Imports the engine modules below. |
| `docs/index.html` | **The docs — the theory.** The economic life cycle, the three regimes, the wider coupled model, financial flows, the political register, the academic grounding + sources. House style ported from `mappa/docs/`. |
| `prng.js` | `mulberry32` + `hash2` — deterministic randomness, bit-exact with mappa/hoop. |
| `substrate.js` | Toy region (stand-in for mappa): elevation, sea/lake, rivers, fertility, ore. |
| `site.js` | Site-vs-situation scoring + forced spawn points + stratified founding (engine assignment). |
| `economy.js` | Founding engine → base multiplier → logistic growth toward a tech-lifted ceiling; agglomeration; flourishing (bloom/dusk); `conquer()` shock. |
| `sim.js` | Orchestrator: `rollRegion(seed)` → `{region, towns, meta}`; the tech clock; CLI chronicle. |
| `test/proto.selftest.mjs` | 16 checks (determinism + the theory's claims). `node polis/test/proto.selftest.mjs`. |
| `THEORY.md` | The written theory + the full bibliography (what `docs/index.html` renders). |
| `README.md` | This file. |

*(Engine modules still to come as the theory hardens: `tech.js` (the cards DAG +
effects), `hinterland.js`, `finance.js` (financial flows — see THEORY.md),
`flourish.js` (port hoop/econ), `event.js` (conquest/plague/crisis shocks),
`history.js` (the replayable chronicle).)*

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
