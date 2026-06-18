# polis — procedural city history

**Live at:** `mino.mobi/polis/` (rides the root deploy surface, like `mappa/`)
**Status:** theory / design phase. No engine yet — this is the charter for one.

> **The thesis.** [`mappa`](../mappa/) generates a *world*: a deterministic planet
> of plate tectonics, hydrology, climate and biomes, and it already picks
> plausible *city sites* on that substrate. `polis` is the next layer down in
> scale and the next layer forward in time: **take a site and grow the whole
> history of a city into the substrate** — village to town to city to
> metropolis — procedurally, deterministically, from a seed. The long arc is a
> **4X game**; this directory is where the theory of how a city develops is
> worked out first.

## Why this is the next big effort

`mappa` answers *where* settlements appear (a habitability + spacing
projection). It does that "fine," but the placement is a one-shot scatter — it
has no notion of a city *growing*, no streets, no quarters, no centuries. A 4X
game needs cities that have a **history**: a founding reason, an organic core,
arteries that thicken with trade, quarters that differentiate, a hinterland that
fills in. `polis` is that missing middle — the bridge from `mappa`'s planet to a
playable, legible urban world.

## The substrate it consumes (from mappa)

`mappa`'s engine (`mappa/engine.js`) exposes, per mesh cell: `elev`, `water`
(land/ocean/lake), `rivers` (segments with `flow`), `temperature`, `moisture`,
`biome`, `plate`, and true spherical `area` + `adj`acency. `polis` reads that as
the **ground a city grows on** — water gives drink and trade, rivers and coasts
give routes, biome and moisture give fertility (the hinterland's carrying
capacity), relief gives defensibility and friction. Determinism is shared:
mappa's `mulberry32` PRNG, same seed → same world → same city.

## The two engines it borrows (from hoop)

The user pointed at two algorithms already living in `hoop/`, and they turn out
to model **two different regimes of city growth**:

| hoop source | algorithm | the growth regime it models |
|---|---|---|
| [`hoop/v7/foam.js`](../hoop/v7/foam.js) `seize()` | **hypoxia / angiogenesis** — multi-source BFS perfusion field; capillaries sprout toward the most under-served tissue until everything is within `oxygenReach` of a road | **Early, coverage-driven accretion.** A young town must keep every dwelling within reach of water, market and gate. Lanes grow toward the "hypoxic" (under-served) fringe. Organic, space-filling, branching — the medieval town plan. |
| [`hoop/paint/flux.js`](../hoop/paint/flux.js) `growNetwork()` | **Physarum flux** — route trip demand on the cell graph, accumulate flux, let conductance adapt (grow where used, decay where not); streets are the **superlevel set** of the traffic field | **Mature, demand-driven networking.** Once there are many origins and destinations and real trade, arterials emerge from where journeys actually concentrate. The exponent **μ** dials *grid* (μ<1, redundant parallel streets) ↔ *tree* (μ>1, one arterial). |

Both are pure, deterministic, node-tested kernels. `polis` does not fork them —
it vendors/ports them the way hoop vendors `auth.js`: re-sync from source, never
diverge.

## The four-phase model (see `index.html` / `THEORY.md`)

1. **Site** — *why here.* Site vs situation; score cells for water, defense,
   route convergence, fertility, harbor. Improves mappa's one-shot scatter.
2. **Nucleation & organic accretion** — *the hypoxia phase.* The town grows as a
   saturation front; angiogenesis keeps the fringe served. Conzen's burgage
   cycle; Von Thünen rings.
3. **Networked maturation** — *the Physarum phase.* Trade demand sharpens
   desire-line arterials; the μ knob picks organic-tree vs planned-grid; bid-rent
   sorts land use (Burgess / Hoyt / Harris-Ullman).
4. **Systemic scaling** — *the region.* Central-place hierarchy (Christaller),
   rank-size / Zipf across many cities, urban scaling laws (Bettencourt–West).

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
