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

## Files

| File | Role |
|---|---|
| `index.html` | The theory site — the four-phase model, the academic grounding, the algorithm mappings, the roadmap. House style ported from `mappa/docs/`. |
| `THEORY.md` | The written theory + the source bibliography (the prose `index.html` renders). |
| `README.md` | This file. |

*(Engine modules — `substrate.js`, `site.js`, `accrete.js`, `network.js`, `prng.js`
— land in later passes as the theory hardens into code.)*

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
