# polis — polis.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

The city cascade (worker `polis`, custom_domain polis.mino.mobi) — MOVED OFF the root surface so it deploys with the world-engine suite. `/` is the cascade charter (civ über-macro → hinterland mesoscale → city micro); `/hinterland/` the region sim (full civ client: environment/tech/transport eras/envelope from /api/civ/sites, railroads at mechanisation, drowning rule)…

## Facts

| | |
|---|---|
| Surface | `polis` |
| Dir | `polis/` |
| Endpoint | `polis.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/plant-growth-animation-gxbby1` (taken 2026-10-07 for the city engine; the registry is the authority) |
| Deploy | `.github/workflows/deploy-polis.yml` |
| Uses | `civ` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "polis"`.

## How it works

The city cascade (worker `polis`, custom_domain polis.mino.mobi) — MOVED OFF the root surface so it deploys with the world-engine suite. `/` is the cascade charter (civ über-macro → hinterland mesoscale → city micro); `/hinterland/` the region sim (full civ client: environment/tech/transport eras/envelope from /api/civ/sites, railroads at mechanisation, drowning rule); `/continent.html` the whole-continent closed system; `/docs/` the theory. Assets-only worker; the deploy stages mappa/engine.js + climate-forcing.js under /mappa/ so the pages' runtime ES imports resolve on this origin. The OLD mino.mobi/polis/ (root surface) serves the pre-cascade site until the root branch catches up. Node selftest: polis/test/hinterland.selftest.mjs.

## Deploying

Pushes to the owning branch (the registry's `branch`; `main` deploys nothing) that touch this surface's paths trigger [`.github/workflows/deploy-polis.yml`](../.github/workflows/deploy-polis.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.

## morph — blocks, plots, buildings (`/morph/`, 2026-10-07)

The descent below the settlement field's cells, as an engine and a toy. The engine is
`packages/morph/` (canonical; `geom.js` + `morph.js`), copied byte-identical into `polis/morph/` by
`node scripts/sync-dataviz.mjs --write` — **edit packages/morph, never the copy**. Its selftest is
`packages/morph/morph.selftest.mjs` (exact geometry; plots tile lots; every plot fronts its street;
determinism; Math.random removed). Read `packages/morph/README.md` for the model.

`/morph/` is the toy: a seeded city laid down in time (v2, owner: "greedy edges… path dependency…
gradients"): country lanes and hamlets first, districts as grains (organic, grid, radial, modern,
suburb) cut along the lanes, slivers absorbed, a land-value field, and buildings rebuilt in waves, so
old houses survive on cheap land. A year slider (and ▶) shows what stood when (`y=` in the link);
colour by style or by year built (`col=age`); tap a plot for its history. Plan (figure-ground,
plots, street ranks) and model (an axonometric in canvas 2D, painter's order by footprint centre,
hipped and mansard roofs from the straight skeleton).

**Wired to `field.js` (v3, 2026-10-08)**: by default the toy grows the town in `morph/worker.js` (a module
worker): packages/morph/ground.js (the ground: hills, river valley, coast, in metres) → `growCity` on it
(`ctx.sampler` water and `ctx.riverPath` are new and optional; `ctx.agentCap` caps the people simulated;
without them field.js behaves exactly as before) with morph's `envelope()` population curve → morph's plan
off the field (`generate({ field, ground })`). ~7 s (field ~4.5 s). The page draws the ground as a
hillshade with 5 m contours (plan) or a mesh (model), the farmed cells, the field's roads by year, the
river and its bridges, and a chronicle line from the field's events. `src=sketch` is the old synthetic
town. Integration selftest: `polis/test/morph.selftest.mjs` (~10 s).

**People and transport** (2026-10-08, owner: "a population and working and entertainment heatmap as a
function of the buildings as drawn… transit, rail and bus… the development of these things over time"):
`packages/morph/mobility.js` (copied to `morph/mobility.js` by sync-dataviz) runs in the worker after the
plan (~2–3 s; `transport(city)` before the ground is stripped, since it reads the river). The toy's new
layers: people / work / leisure (heatmaps per era), transit (the railway and its terminus, every line in
service that year by mode, stops), traffic (cars a day amber→red, footfall pale, the gates where commuters
come in). The chronicle merges the transport's events (the railway arrives, trams open and close, light rail
returns); the panel gives each era's people, jobs, trips and mode shares; the inspector says what a
building held that era. Read packages/morph/README.md (v4) for the model. Integration checks in
`polis/test/morph.selftest.mjs`.

**The moving day** (2026-10-08, owner: "now you must go back to time series with discrete objects"):
`packages/morph/motion.js` (copied to `morph/motion.js`) samples the era's trip table back into ~80,000
journeys and timetabled trams, buses and trains (README v5). The toy's `moving` layer (on by default) and
"time of day" clock (▶ runs an hour in 2.5 s; `t=` in the link) draw them over a cached still map: people
as specks, bicycles green, cars as little oriented boxes with headlights after dark, vehicles along their
routes as full as their riders make them, the town tinted by the hour; the panel's chart is the day as a
time series by mode with the clock on it. The day is sampled on the page (0.5–1.4 s per era, cached), and
not while the years play.

**Facades** (2026-10-08): every building's shell in its period comes from `tjs/brut/period.js` (brut through
the centuries), copied to `morph/brut/` by sync-dataviz — edit it in tjs. The model view draws a wall's
openings, bands and balconies once a storey is more than ~6 px tall (scaled so the shell's eaves meet the
mass the city drew); tapping a building draws its street elevation in the inspector, with its
construction and the masonry check. `window.morph` (cam, city, redraw, inspect) is a console handle. The worker imports `../field.js`,
which imports `../rite/names/engine.js`: the deploy stages it (deploy-polis.yml).
