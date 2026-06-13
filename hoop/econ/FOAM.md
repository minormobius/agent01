# FOAM.md — the course to the 3D foam society

The destination: rind's dense **33k-chamber foamview** (Ri 250 · T 50 · 18° · 10 axial, 20 m
rooms), **painted with a legible society** — every chamber coloured by the building that owns it,
the certified ramps and roads threading the city as its actual streets, and wayfinding, supply,
and social fabric all one model. This file is the chart. Leg 1 is shipped; the rest are in order.

## Why the 2D kernel had to be rebuilt before painting anything

econ.js v1 was a flat rectangle with crow-flight supply wiring. The foam is an annular chamber
graph where gravity is radial and travel is anisotropic — azimuthal is level street, radial is
climb, and climb is only cheap where a certified spiral ramp exists (rind/wayfind.js). Painting a
Euclidean society onto that geometry would have produced a *picture*, not a model: the colours
would say "bakery" while the supply lines cut through fifty load-bearing walls. Three inversions
were required first, and they are the architecture of everything below:

1. **Infrastructure first.** wayfind's `planRoute()` chains are scarce certified artifacts; the
   city yields right-of-way to them *before* any building is placed — not the other way round.
2. **Buildings are chamber clumps.** A building is a connected set of real chambers, keyed by
   chamber index — the foamview's own id space. Painting the society IS colouring chambers.
3. **Distance is road distance.** Supplier choice, access, (eventually) commutes — all measured
   by anisotropic Dijkstra over the chamber graph (climb ×6 off-deck, decks discounted), never
   by Euclid. Measured effect: **~50% of supply edges choose a different supplier than
   crow-flight would** — the geometry genuinely restructures the economy.

## Leg 1 — the kernel (SHIPPED: `society3d.js` + `test/econ3d.selftest.mjs`)

`buildFoamCity({Ri,T,cell,arcDeg,axial,grade,seed,genome})` →

```
sectorFoam (rind, vendored)        the same 33k chambers foamview renders
  └─ planRoute → RIGHT-OF-WAY      ramps + roads reserved, unbuildable
       └─ graph-Voronoi buildings  sized by the econ genome's FOOTPRINT (fp^0.65)
            └─ 2-label Dijkstra    per-resource road-nearest supplier (self excluded)
                 └─ access         median dwelling→basket road cost → 0..1 oracle signal
```

Output is econ.js-shape (places/edges/closure…) so `buildSociety` / `socialMetrics` /
`removeImpact` run **unchanged**, PLUS the foam layer: `chamberOwner` (chamber → building | road
| void), `route` (drawable ribbons), `access`. `scoreFoamSociety` blends access into vitality —
move the ramps and the score moves. Full 33k sector: ~5.5 s in node, deterministic from
`(genome, seed)`.

## Leg 2 — paint the foamview (SHIPPED: `econ/foam/` + `test/econfoam.selftest.mjs`)

The page at `hoop.mino.mobi/econ/foam/` — foamview.html's instanced rendering (WebGPU + the same
2D-fallback contract, orbit/pinch/probe controls) colouring by **society, not stress**:

- **A module Worker** (`foam/builder.js`) builds the city off the render thread (~6 s full
  sector), bakes FOUR colour layers (role · building size · bridges-vs-bonds · access heat on
  dwellings) + the route-ribbon geometry, posts them as transferable arrays, then *stays alive
  holding {city, society, metrics}* to answer click inspections. The page never touches the
  model — its whole input is typed arrays + small JSON, and that contract is what the selftest
  pins (32 checks, headless via a worker-global shim).
- **Chamber instancing by owner**: per-instance colour = owning building under the active lens;
  right-of-way chambers road-grey under EVERY lens (the streets always read); voids dark. The
  radial probe is the street-level cut.
- **Legibility is aggregation**: glyph billboards render only above a 13 px screen-space
  footprint (the hospital reads from orbit, the dwelling up close); road-fronting buildings get
  brighter colour (+18%) and gold glyphs — the eye finds the high street.
- **Click a chamber → the econ dossier**: owner, footprint, who's there, weave %, the two-web
  shock, access (dwellings) — answered by the worker, displayed in the corner panel.
- **Permalinks**: `?seed=&n=` reproduces the whole society (leg 5's contract, prefigured).

## Leg 3 — roads that GROW (the desire-line / Laplace reframe) · PROTO SHIPPED in `/paint`

The corkscrew-plus-connectors of leg 1 is a *highway system* with no *streets*, and it is imposed
top-down — at odds with the generated ethos of everything else. The fix is not "more roads" but a
different category of road. In spin gravity there are two, with opposite generation logic:

- **Level circulation** (azimuthal *and* axial — both constant-radius, constant-g): cheap, dense,
  and should EMERGE from where people actually go. This is the missing capillary layer.
- **Radial circulation** (changing floors — climbing): expensive, sparse, legitimately engineered.
  The corkscrew is the *vehicle elevator*, not the road network.

So the right mental model is **a stack of 2-D cities**: each radial shell is a flat city with its
own street grid on the unrolled (azimuth × axial) plane, threaded by a few vertical cores. (That
also *defines the 2-D game*: one unrolled shell — and "one road entrance per floor" is a building
punching up the stack and opening onto each shell's grid once.)

**The mechanism (the user's framing):** the stationary flux of NPC trips is the **Laplace transform
of NPC motion** — the resolvent / graph Green's function, the time-integrated chamber occupancy
under the ensemble of journeys. Solve that field once and **roads are its superlevel set**: the
chambers the most journeys cross become open concourse; everything below the waterline stays
sequestered building. One solve = streets + hierarchy + doors + the ambient traffic to animate.

We compute it biologically (Physarum / ant-trail / current-flow betweenness): place only attractors
(home/work/basket) + trip demand, route, accumulate flux, let conductance follow flux (cost =
length/conductance), iterate to a fixed point. The feedback exponent **μ** is the one knob —
**μ<1 keeps parallel streets (a grid), μ>1 collapses to one arterial (a tree)** — i.e. μ *is* "do
I have enough roads". The corkscrew need not be imposed: vehicular trips that must change radius
concentrate onto the cheapest helix, so the ramp can FALL OUT as a measured object.

**Proto (shipped):** `paint/flux.js` + `test/flux.selftest.mjs` (20 checks) + the **desire-line
roads** mode in `/paint`. It grows streets over the room-adjacency graph, renders roads as
zero-wall concourse + buildings glowing by their ambient traffic (the Laplace field) + a 3-tier
network + one door per building, with μ and street-fraction dials. Invariants pinned: the network
is one connected component, every building fronts a road with exactly one door, opened walls only
ever sit between two road rooms, and μ is monotone (grid↔tree).

**Ported to /econ (2D):** `econ/roads.js` + `test/econroads.selftest.mjs` + the **⛗ grow roads**
button on `/econ/`. The demand is no longer synthetic — it is the LIVED society: every hat is a
recurring trip (home→work/parish/club), every supply edge a freight run, aggregated into desire
lines. The page animates the field stepwise (one reinforcement round per frame: faint desire lines
sharpening into a hierarchy), then the CARVE: road cells are expropriated from the buildings they
cross, every surviving building keeps frontage + one door, fully-eaten buildings are absorbed.
The kernel is shared with /paint (`makeGraph`/`createGrower`/`finalizeField` in `paint/flux.js`,
now steppable + early-exit/flat-heap optimised: ~0.45 s per round at 8 k cells, 11× the naive).

**Ported to the foam (3D) — THE CLIMB EMERGES.** `createFoamGrower()` in `society3d.js`
(+ `test/foamroads.selftest.mjs`, 21 checks) grows the right-of-way over the 33k-chamber graph
with no imposed route at all, by **grow-then-settle**: a provisional no-road city + society exist
only to source demand (hats + freight at door chambers, hub-first since flux is symmetric); the
field grows over the anisotropic base costs (climb ×6); `finalize()` takes its superlevel set and
**reassembles the city fresh** around the emergent streets — so every downstream invariant (doors
on road, supply discount on decks, access, the oracle) works unchanged. Measured: the grown
network threads **96–99% of the shell's radial depth** with hundreds of ramp segments — climb
infrastructure grown from demand alone — and access matches the certified corkscrew (0.79 ≈ 0.79).
`buildFoamCity()` (the certified planRoute path) is kept verbatim for comparison; the selftest
pins that grown ≠ certified on the same seed. The /econ/foam/ page's **⛗ grow streets** button
runs it as a cinematic: the bare foam posts first, then one message per reinforcement round (the
flux field as gold segments, sharpening live, ~5 s/round at full 33k — orbit while it grows), then
the carved city in the usual lenses with the emergent tier hierarchy as its ribbons.
Perf notes: routing graph keeps face/edge neighbours only (`routeFilter`), origins are batched
per round (`originBatches`, stochastic relaxation — decay smooths it); the step cost is dominated
by each hub's farthest member, so further speedups need hierarchical routing, not tuning. Then **junction towns** — score a
building by the road betweenness of its door chamber and pin that the oracle's `bridges` signal
correlates with junction proximity (the Granovetter weak-tie thesis acquiring a *spatial cause* —
the first falsifiable prediction the society makes about geography). Watch the two cautions:
flux can over-concentrate into one mega-artery (the μ/decay tuning, asserted via a road-size
*distribution*, not just "roads exist"); and door assignment must be inside the fixed-point loop,
not a post-step, or a building strands when its nearest road moves.

**Sectors + density (the room to spread).** At ~5 k in the sample sector against a 1 M design
you are ~200× under-packed — a gift: sparser settlement leaves voids for generous concourse and
plazas, and road-per-capita rises on its own. Reserve azimuthal/axial sectors for reactors, water
treatment, farms; give each a per-sector *program* (a genome gene): residential = dense pedestrian
streets + one sequestered door; industry/utility = sparse freight roads + docks + restricted
access; market = porous, many doors. Sector boundaries become the natural arterials.

## Sector shapes + role isolation (SHIPPED on /econ/foam/)

The `/econ/foam/` page now carries a **shape** selector (`?shape=`): `core` (the canonical foamview
core-sample, 18°·50r·10ax), `block` (volumetric — 10°·28r·28ax, trading arc + outer-hull depth for
axial thickness so it reads as a true 3-D block, not a wall slice), `petite` (8°·20r·16ax, small
enough that even the grown build is quick). The kernel already took arbitrary `{Ri,T,arcDeg,axial}`;
this is page/worker plumbing (the worker now reports the real `foam.{Ri,T}` instead of hardcoded
250/50). A **role-isolation lens** (`show: only <role>`) ghosts every other role to 5% and lifts the
probe band to the whole shell, so one role's DISTRIBUTION THROUGH THE VOLUME reads at a glance —
dwellings filling the core-ward shells, industry pressed to the hull, civic punctuating. Per-chamber
`roleIdx` ships as a transferable array; billboards filter by role too.

## Report (SHIPPED) — `econ/report.html`

A standalone technical dossier on the whole method — the seed-and-oracle pattern, biome/gacha,
the social genome, the foam city, and desire-line roads as the Laplace transform of NPC motion —
with the emergence result tabulated and the advancement pathways enumerated. Linked from /econ and
/econ/foam. Pure static; figures reproduce from the self-tests.

## Leg 6 — into the game: a solve of record + unbounded outward growth (CHARTED)

The destination item 3 asks for: the foam-society stops being a viewer and becomes the **playable
world**, generated locally as the player walks off-screen in any direction, globally consistent
because it is deterministic in the chamber index. The design (to execute next):

- **Tile the foam — GATE PASSED.** `econ/region.js` + `test/region.selftest.mjs` (18 checks).
  The generative basis changed from a sequential RNG stream to **chambers as pure functions of
  global lattice coordinates** `(gx axial ∈ ℤ, gy mod the ring, gz radial)` + the ship seed — so
  the seam contract is *free*: any region reproduces its neighbours' border chambers bit-for-bit,
  both sides derive the identical cross-seam edge set (pinned), the ring CLOSES at the wrap seam
  (pinned), and the axis is unbounded in both directions, negative regions included (pinned).
  Each region carries a 2-deep ghost rim + cross-seam edges so nav graphs splice without loading
  the neighbour. Geometry matches sectorFoam (same thinning, jitter, 1.85·cell adjacency), so
  buildings/grower/viewer port by swapping the foam source. Chamber identity: `gid = "gx|gy|gz"`,
  stable for ever — the postal binding keys off it.
- **The solve of record — SHIPPED.** `econ/record.js` + `test/record.selftest.mjs` (20 checks).
  Two scales: `coarseSolve()` runs the desire-line kernel on the REGION LATTICE itself (nodes =
  regions, edges = seams, azimuth wrapping; gravity demand over hashed masses + hub regions) and
  records a conductance + arterial tier per seam — the trunk network, persistable as just
  `(genome, seed, extent)`. `extendRecord()` grows the settled band **append-only with history
  frozen** (pinned: every previously recorded seam stays bit-identical — extending the world
  cannot rewrite a road anyone has walked). `gatesFor()` picks each seam's crossing chambers as a
  symmetric pure function of the shared border (the seam contract makes both sides see identical
  candidates), so two regions choose the SAME gates without communicating. `solveRegion()` grows
  one region's streets locally — its own provisional society's trips + gate through-demand
  weighted by the record's tiers — and forces its gates into the right-of-way. Pinned:
  **ROADS MEET AT THE SEAM** (adjacent regions solved independently each carry their side of
  every active gate), regional solves deterministic (regenerate a year later, same streets),
  single connected network, closure + access intact. ~2 s per ~3.7 k-chamber region; the coarse
  pass is ~50 ms — viable as the game's lazy on-wander solve.
- **Wander rules.** Keep a ring of loaded regions around the player (the HPA\* coarse graph hoop's
  `nav.js` already builds is the lattice). Entering a new region: generate its foam from the key,
  claim buildings, grow local streets to the cached arterial boundary, splice into the live nav
  graph. Leaving: evict, keeping only the arterial record + any player-touched ATProto records.
- **Identity.** A building's durable key = the postal `(chunk, ordinal)` of its door chamber (leg 5),
  so it survives eviction/reload and can carry a `com.minomobi.hoop.place` thread. The econ place and
  the hoop forum place finally become one record.
- **Integration points** in the existing game: `js/ship.js` (the deterministic chunk engine — region
  generation slots in beside it), `js/world.js` (the `@`-walk + foam render — the society colours the
  cells it already draws), `js/nav.js` (HPA\* — the arterial graph IS its coarse tier), `js/postal.js`
  (the durable keys). The pieces exist; leg 6 is the assembly, and the seam contract is the gate.

## Leg 7 — refactor the MAIN GAME onto the solved map (CHARTED)

The destination: hoop's game world (`js/ship.js` chunks + `js/world.js` Voronoi-foam render)
becomes a *projection of the solved city* — a stable, expandable map whose look is `/paint`'s
membrane language. The pieces now all exist; this leg is their assembly, in order:

1. **The deck projection.** The game plays ONE radial shell of the annulus (the stack-of-2-D-cities
   model): a `gz` band (1–2 layers, the mid-shell deck where the gates already live) of the region
   lattice, unrolled to the (azimuth × axial) plane. `world.js`'s field swaps its ship.js chunk foam
   for `regionFoam` slices; a game "tile" is a chamber; the chamber `gid` is the world coordinate.
   Walking +x forever is the infinite axis; walking +y forever wraps the ring and brings you home —
   a world fact the game gets for free from the seam contract.
2. **The render: paint's 8/24 membrane language — FIRST PASS SHIPPED.** `econ/deck.js` +
   `voronoi.js buildSceneCustom` + the page at **`/econ/deck/`** (+ `test/deck.selftest.mjs`,
   13 checks). `buildSceneCustom` is the additive painter variant that takes EXTERNAL room seeds
   + an `edgeKind(a,b)` callback ('wall' · 'door' · 'open' — the zero-wall concourse, realised as
   a door-point chain covering the whole membrane). `deckScene` slices a solved region's
   mid-shell band, unrolls it to px, and classifies every membrane from the city: row↔row →
   open; same building → doors on a per-building spanning tree (+ loops); building↔row → **one
   street door per building** (hash-min among its frontage, pinned); else wall. Missing lattice
   sites read as solid mass. The page wanders the region lattice on arrow keys — ←→ wraps the
   ring, ↑↓ walks the axis, crossing the frontier extends the record (history frozen) and solves
   lazily (~3 s, cached; eviction is free because everything regenerates). Pinned: opens only on
   roads, exactly one street door per fronting building, interior trees connect each building
   exactly as far as its geometry allows, deterministic. *This is the game's look meeting the
   solved city.* Remaining for the full step: the world.js integration itself (the `@`, HPA\*
   over deck rooms, the thread rail).
3. **The stable solved map.** The world IS `(genome, seed, record)`. The record starts at a fixed
   settled band; the landing experience is a *solved* city (no first-visit jank), loaded region by
   region as `solveRegion` outputs (~2 s each, in a worker, behind the fog of unexplored seams).
   Persist the record as an ATProto object (`com.minomobi.hoop.record`, first-write-wins — the
   borges frozen-telling pattern); regional solves are pure functions of it, so they need no
   storage at all. Places bind by postal: a building's rkey ← the `gid` of its door chamber.
4. **Expansion on wander.** When the player crosses into an unsolved axial band, `extendRecord`
   appends new coarse bands (history frozen — pinned), and frontier regions solve lazily. The
   loaded set is a ring of regions around the player (the HPA\* coarse tier in `nav.js` IS the
   region lattice; its portals ARE the gates). Eviction is free: everything regenerates.
5. **The society is the NPC layer.** Each region's `assembleCity`+`buildSociety` output gives the
   places (forum anchors), the people (ambient NPCs whose hats say where they walk — the flux
   field animates them along real desire lines), and the inspector content the thread rail shows.
   Later: player movement accumulates into the demand of future record extensions — the city
   responds to where people actually go (the desire-line thesis closing its last loop).
6. **Migration — v2 SHIPPED as a parallel entry (`hoop/v2/`, linked from the v1 topbar).** The
   rebuilt game lives at `/v2/` rather than behind a flag in world.js — v1 at `/` stays untouched
   (don't break what's working). What v2 has: the `@` walking the solved deck by click-to-walk
   (`walkRoute`, routes threading the doors, animated along the polyline), **gate crossings** —
   step onto a gold gate room and the seam loads the neighbour region, landing the `@` on the
   partner chamber (`deck.js gateLinks`, pinned: symmetric, landing in the neighbour's
   right-of-way), arrows as fast travel with the record extending at the frontier, and the
   settled society as the inspector (click a building → who lives/works there; `solveRegion` now
   returns the final society). Spawn is at the record's first hub region. STILL TO MIGRATE: the
   thread rail + ATProto places (postal gid as rkey), presence (the HoopRoom DO), inter-deck
   stairs, and the eventual flip of `/` to v2 once nav + render parity are pinned.

## Leg 4 — wayfinding for PEOPLE (commutes close the loop)

- Hats already know home and workplace. Route them: `commute(person)` = door→door anisotropic
  path; the distribution of commute costs joins the oracle (`commute` signal beside `access`).
- The same fan machinery hoop's world map uses (`nav.js wayfan`) applies here: a person's
  reachable-in-budget tree IS their lived neighbourhood; bridging should fall out of overlapping
  fans, not just shared membership. This unifies econ's social metrics with hoop's HPA* nav.
- Then the painting gets its final layer: desire lines. Accumulate commute traffic per chamber,
  render as luminance — the city lights up along its true streets, and dead infrastructure goes
  visibly dark (the legibility test of the whole model).

## Leg 5 — one id space (postal) + persistence

- Bind buildings to hoop's postal addresses: a building's key becomes `(chunk, ordinal)` of its
  door chamber — genome-stable across regenerations, exactly what `postal.js` exists for. Then
  an econ place and a hoop forum *place* can be the same ATProto record
  (`com.minomobi.hoop.place` gains an optional `building` field; lexicon change, additive).
- Persist a rolled city as `(genome, seed)` — two integers; the permalink contract the gacha
  pattern already proved. `/econ/foam/?n=…&seed=…` reproduces the whole 33k-chamber society.

## Sequencing note

Leg 2 ships value immediately (the painted foamview) and forces no model decisions. Leg 3's
demand-routing is where the research interest is. Leg 4 is cheap after 3 (all machinery exists).
Leg 5 should land before any ATProto write. Keep `rind/wayfind.js → hoop/vendor/wayfind.js` a
verbatim re-sync (same rule as vendor/auth.js); if the two drift, the certificate the kernel
relies on is no longer the one foamview draws.

> Deploy note: a Cloudflare API 504 ate the first leg-2 deploy (run 27421574156) — transient,
> re-fired by commit. If a hoop deploy fails at "Deploy Worker + Assets" with a 504, re-push; the
> sandbox cannot dispatch workflows.
