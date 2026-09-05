# atlas — county-level North America

`atlas.mino.mobi`. A county-level data stream for the United States, Canada and
Mexico, drawn on a watertight equal-area map, with a contiguity-constrained
regionaliser that redraws the United States into thirteen superstates from
whichever econometric axes you pick.

Worker `atlas`, `custom_domain atlas.mino.mobi`, assets-with-worker serving the
whole directory. **No build, no D1, no KV, no AI, no secrets.** Owning branch:
`claude/county-level-data-maps-s9u3qx`.

---

## The shape of it

| Path | What it is |
|---|---|
| `index.html`, `app.js`, `names.js`, `styles.css` | the map application |
| `sources.html`, `method.html` | the source ledger and the method write-up |
| `lib/` | **vendored copies** of `packages/geoviz` + `packages/geohier` + `measures.js` |
| `geo/` | built topologies, the contiguity graph, the source manifest |
| `data/` | the county series, the migration graph, places, the source ledger |
| `etl/` | the build: fetchers, format readers, and the selftest |
| `worker.js` | routes `/sources` and `/method` — that is all it does |
| `_headers` | cache-control for `/geo`, `/data`, `/lib` |

`lib/measures.js` and `names.js` are **canonical here** — they are atlas-specific.
Everything else in `lib/` is a byte-identical copy of a file under `packages/`,
kept honest by `scripts/sync-dataviz.mjs` (which preflight runs). **Edit
`packages/`, never `atlas/lib/`.** The ETL and the page share the geometry
codec, so a stale copy would decode last month's arcs against this month's index
and draw a map that is subtly wrong rather than broken.

## The four decisions that carry the whole thing

Read `method.html` for the long version. In brief:

1. **The geometry is a topology.** Shared borders are stored once as *arcs*, so
   simplification moves both neighbours together and the map cannot develop
   slivers. It also yields exact county adjacency for free, which is what makes
   the superstates possible.
2. **Every projection is equal-area.** A choropleth asks the eye to add up
   coloured area; Mercator would make northern counties shout before the data
   said anything. `mercator` exists in `packages/geoviz/projection.js` and is
   labelled as not for choropleths.
3. **Only stocks are stored; every rate is recomputed at the displayed level.**
   A state's per-capita income is its income over its population, never the mean
   of its counties'. `packages/geohier/hier.js` enforces this and refuses to roll
   up a published rate it cannot rebuild.
4. **The superstates are grown by SKATER** over the contiguity graph, with a
   population floor (without one, greedy variance reduction returns one region
   of 2,600 counties and twelve of one county each) and explicit sea links for
   islands.

## What the superstate tool honours besides the data

Measured with the page's own settings — ten axes, floor 0.70, migration flows on:

| | no preferences | shipped defaults |
|---|---|---|
| largest : smallest population | 1.86 : 1 | **1.66 : 1** |
| states split across regions | 32 of 53 | **13 of 53** |
| people kept with their state | 80% | **92%** |
| regions reaching the ocean | 9 of 13 | **11 of 13** |

Defaults: keep states whole **0.40**, equal populations **0.85**, water floor **0**.

**Keeping states whole** is priced twice, because pricing it once does not work.
A surcharge on tree edges that cross a state line makes the MST run inside
states and enter a neighbour only where it must, so states appear as subtrees
joined by a few bottleneck edges — which are the edges a cut wants. Then a flat
barrier is subtracted from the score of any cut falling *inside* a state. The
surcharge alone cannot help, because the cut step would still cut anywhere; the
barrier alone cannot help, because the tree would not offer whole states to cut
around.

**Population balance** is a penalty on how far a cut is from splitting its
component into whole fair shares. Scoring the two sides independently — the
first attempt — is degenerate: for a two-way split the deviations sum to exactly
1 whatever the cut, so the dial had no effect on the case it exists for. Tying
both sides to a shared share-count is what makes it discriminate.

### What gives way first, and why

Resource floors, then the state preference, then the population floor. That
order is load-bearing. Asking hard for whole states makes the population floor
unreachable; when the floor relaxed first, asking for whole states silently
returned regions three times the size of each other. Keeping a state whole is a
preference. Not having one superstate three times another is closer to a
requirement. The status line says when the state dial was dialled back.

Past about 0.40 the state request collides with the 0.70 population floor and is
walked back, so the top half of that slider mostly reports the collision.

### Water: a floor, not a penalty

`data/resources.json` carries USGS 2015 county freshwater withdrawals and
ocean frontage. Water is a **floor** — no region below a fraction of its fair
share. As a soft penalty it went *backwards*: asking for even per-capita water
took the worst-to-best ratio across regions from 24.8:1 to 26.9:1. A greedy cut
penalises the two parts in front of it, and a part that is proportional today
splits into disproportionate regions three cuts later.

It is off by default because it competes with population balance steeply: at a
0.15 floor the water ratio falls 21:1 → 15:1 and the population ratio rises
1.5:1 → 3.1:1. And it is **withdrawal, not supply** — Imperial County reads
water-rich on Colorado River water delivered from out of basin.

### Sea access: reported, not steered — and that is a finding

Four mechanisms were tried and all four failed:

| attempt | result |
|---|---|
| floor of a fair share of coastline | infeasible; relaxes to nothing |
| floor of an absolute 50 km per region | also infeasible |
| penalty for stranding a coastless part | landlocked stuck at 2 at every weight |
| discounting tree edges that run toward water | 2 landlocked → 1, at pop 3.0 → 4.0 and three more states split |

The reason is structural: **a region can only be what some subtree of the
spanning tree is**, the tree is built from econometric similarity, and interior
counties resemble each other. There is no subtree from Nebraska to the Gulf, so
no cut can select one. Eleven of thirteen regions reach the ocean anyway; the
other two are the interior plains and the mountain west, which is where the
country's landlocked people actually live. So the panel reports coastline per
region and flags the inland ones, and there is no dial — a dial that cannot move
its own number is worse than no dial.

## Rebuilding the data

No API keys, no accounts. Raw archives cache outside the repo (`$ATLAS_CACHE`,
default the OS temp dir); only the derived artefacts are committed.

```bash
node atlas/etl/build-geo.mjs                 # all boundary layers
node atlas/etl/build-geo.mjs us-counties     # one layer
node atlas/etl/build-data.mjs                # all data blocks
node atlas/etl/build-data.mjs --us           # one nation
node atlas/etl/build-resources.mjs           # USGS water + ocean frontage
node atlas/etl/atlas.selftest.mjs            # 73 known-answer checks
```

`build-data.mjs` reads its universe of places from `data/places.json`, so
**run `build-geo.mjs` first** on a clean checkout.

The selftest is the gate the deploy workflow runs. Its last block checks the
committed artefacts against figures the agencies publish — U.S. population near
340 million, personal income near $24.9 trillion, GDP near $29.1 trillion — so a
rebuild that parsed the wrong column fails before it ships a map that renders
perfectly and is wrong.

## Performance: where the frame budget goes

Measured, not guessed (headless Chromium, software rasteriser, 1500x900):

| | before | after |
|---|---|---|
| pan, per frame | 196 ms | 66 ms |
| measure switch | 300-520 ms | 84-91 ms |
| boot to first map | 1,261 ms | 637 ms |

Three things did it, in order of size:

1. **The border geometry was rebuilt every frame.** 200,000 points, three
   times over, at 183 ms. Panning is a canvas transform and moves none of them.
   They are cached Path2D objects now (`_buildBorderPaths`), stroked in 1.6 ms.
   This was the whole of the "chugging".
2. **Jenks was O(k.n^2)** and ran on every recolour, at 121 ms. It is now the
   same recurrence under the divide-and-conquer optimisation, O(k.n.log n),
   at ~6 ms — and on all 3,225 values rather than a 3,000-value sample, so the
   breaks are exact. The selftest checks it against a brute-force solver.
3. **Level of detail.** The coarse tier was built and never used. It is now the
   first paint and the tier drawn while the view is moving; full detail arrives
   in the background and takes over once the view settles above `lodZoom`.
   Plus viewport culling, which does nothing at zoom 1 and rejects 90% of the
   country when zoomed into a state.

Two things were tried and rejected on measurement: merging the counties into one
path per colour class was SLOWER (36 ms against 27), and the cost is not
pixel-bound either — cutting the canvas to a sixteenth of the area only saved a
third.

### Round two: the GPU path, and what the profiler actually said

A second pass added a triangulator and a WebGL renderer. Profiling it first
changed the story:

| | before round two | after |
|---|---|---|
| main-thread `_draw`, U.S. county | 1.3 ms | ~0 ms |
| main-thread `_draw`, all of North America | 2.6 ms | ~0 ms |
| clicking County / State / Superstate | 213 ms "blocked" | see below |

A CPU profile of three level switches attributed **60 ms to all JavaScript and
750 ms to `(program)`** — the browser's own rasterisation. So after round one
there was hardly any JavaScript left to remove: what still costs is turning
polygons into pixels.

Two things came out of it anyway:

1. **`_prepare`, `_project`, `_buildPaths` and `_buildGrid` are cached on the
   TOPOLOGY, keyed by a projection signature** (`_projKey` pushes three fixed
   points through the projection — the app builds a fresh projection object
   every rebuild, so there is no identity to compare). The app throws its layers
   away on every County/State/Superstate click, and none of that work depends on
   which level is selected. It was being redone every click.
2. **The WebGL fill path** (`packages/geoviz/gl-fill.js`): one `drawElements`
   for the whole map, colours in a texture, borders and labels still on the 2D
   canvas over the top. Triangles come from `packages/geoviz/triangulate.js` via
   a worker, never a build artefact — the index buffer would be about a megabyte
   a tier, which is worse than 270 ms of a worker nobody waits on.

**What is verified and what is not.** The GPU output is correct: rendered
against the Canvas2D path pixel for pixel, 0.023% of pixels differ by more than
64/255, all of it antialiasing along 11,000 county borders. The triangulation is
checked against every county in the country. **The speed-up is NOT verified**,
because this sandbox has no GPU — its WebGL is SwiftShader, where the GL path
measures 240 ms a frame against Canvas2D's 91 ms, which is exactly what software
rasterisation of 300,000 triangles should look like. So:

- `GLFill.create` **refuses a software renderer** (SwiftShader, llvmpipe, Basic
  Render) and falls back to Canvas2D, so nobody on one gets the slower path.
- `?gl=0` forces Canvas2D, `?gl=1` forces WebGL. That is the A/B, and it needs a
  real GPU to mean anything.

If someone with a GPU measures `?gl=0` against `?gl=1` and WebGL does not win,
delete the GL path — the Canvas2D one is complete and is still the fallback.

### Known limit: self-intersecting rings

18 of 3,225 counties in the coarse tier have rings that cross themselves after
simplification (verified individually — Broomfield CO, James City VA and the
rest). A ring that crosses itself has no single area that a triangulator and a
shoelace sum must agree on, so the mesh disagrees with the polygons by 0.002% of
map area. The selftest asserts that bound to catch it moving, not to reach zero.
Fixing it properly means making the simplifier self-intersection-aware.

## Quirks worth knowing before you change something

- **`etl/` is `.assetsignore`d.** It is the build, not the site. If you add a
  directory that should not be served, add it there too — the worker serves
  `directory: "."`.
- **`worker.js` does not run for asset requests.** Workers Static Assets serves
  a matching asset directly, so a response header set in `worker.js` never
  reaches `/geo` or `/data`. Caching lives in `_headers`. The first deploy
  shipped the header in the worker and it silently did nothing; it was caught by
  `curl -I` against the live origin, not by reading the config.
- **Data gaps are deliberate and documented**, not bugs to paper over: Puerto
  Rico and the U.S.V.I. have no BEA or Census PEP series; Canada publishes rates
  rather than totals, so Canadian measures stop at the census division; Mexico's
  2020 census collected no income variable. `sources.html` lists all of them.
- **BEA merges about thirty Virginia independent cities with their surrounding
  counties.** The pair's total sits on the lead county; `data/us-counties.json`
  carries a `combined` map so the map shows the combined area's *rate* on both
  halves with a note. Do not split it — that would mean inventing the parts.
- **Six Mexican municipios created after 2018** have census data but no boundary
  in CONABIO's file, so the Mexican national population here is 125.8 million
  against the census's 126.0.
- **CONABIO is the one derived source in the atlas.** INEGI publishes its own
  municipal geometry only inside a 3.3 GB national archive that also contains
  localities and city blocks. If INEGI ever ships a municipal-only extract,
  repoint `mx-mun` in `etl/sources/geography.mjs` at it.
- **BLS blocks this sandbox** (403 from cloud IPs), which is why county
  unemployment comes from nowhere here yet. A BLS LAU fetcher would need to run
  somewhere BLS will talk to.
- **The measure catalogue is nation-tagged.** `ATLAS_MEASURES.forNation(iso)` is
  what keeps the picker from offering a U.S. transfer share on a Mexican
  municipio. A new measure needs its stocks declared in `STOCKS` or the selftest
  fails.
- **Region names are a separate layer and are not computed.** They come from a
  fixed anchor list in `names.js`, assigned to whichever region contains the
  anchor, and every one is editable in the panel.

## Adding a data source

1. Write `etl/sources/<name>.mjs` exporting `SOURCE` (publisher, title, url,
   landing, licence, cadence, geography, cite) and a fetcher.
2. Add its stocks to `lib/measures.js` `STOCKS`, and its derived measures to
   `MEASURES` with a `nation` tag if it is country-specific.
3. Wire it into the right block of `etl/build-data.mjs`, and add it to the
   `writeSources()` list so it reaches the ledger.
4. `node atlas/etl/build-data.mjs && node atlas/etl/atlas.selftest.mjs`.

Keep the rule: **store counts, derive rates.** If a publisher only gives you a
rate, add its stock to `NO_ROLLUP` so the hierarchy refuses to aggregate it
rather than averaging medians.
