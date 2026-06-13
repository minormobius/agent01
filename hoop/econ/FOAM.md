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
   (don't break what's working). v2 is the **seamless** solved world: the camera rides the `@`
   (recentred every frame, so chunking is invisible), regions stream from a worker (`v2/solver.js`,
   the record's sole authority) and **lazy-load at the edge of view** (`streamPeriphery`), and the
   seams are *mathematically* gone — `deckScene` now seeds each region's Voronoi with its **ghost
   rim** (the neighbours' first two lattice columns, bit-identical by the seam contract), so a
   boundary room computes the SAME polygon from either side. Pinned: a region's ghost chambers sit
   at the **exact world position** of the neighbour's reals (max error ~1e-12 px — the seam does
   not exist). Coordinates are lattice-anchored, so a region drops into the world frame at offset
   `(dAz·frameW, dAx·frameH)`. **Gate crossings are invisible**: the `@` walks one cell into the
   ghost partner, then the active region swaps at that exact point — the camera never moves. The
   society is the inspector (click a building → residents + hats; `solveRegion` returns the final
   settled society). Spawn at the record's first hub. **Room scale:** one lattice cell is a
   declared **~15 m room** (`M_PER_CELL`, in the user's 10–20 m band; foamview narrates 20 m),
   rendered at 120 px/cell so rooms read spacious — places where things happen; walk distances
   report in metres. **Sealed pockets:** a deck slice can strand a room whose whole perimeter is
   ghost (its connectivity lives in the 3D foam); these are classified, excluded from the door
   passes, and pinned rare (≤3% — they vanish with inter-deck stairs). STILL TO MIGRATE: the
   thread rail + ATProto places (postal gid as rkey), presence (the HoopRoom DO), inter-deck
   stairs, the v1 ART STYLE PORT (function-matched raytraced lights, gradient sliding — its own
   leg, see below), and the eventual flip of `/` to v2 once nav + render parity are pinned.

## Leg 9 — v3: THE STITCH (gates on the deck, walk anywhere you can see) — SHIPPED

v2 was *so close*, but two stitching bugs broke the seamless promise — and they were the same bug
wearing two coats:

- **"⊘ no gate on this deck toward region."** Gates were only placed on seams the coarse solve
  tiered ≥1, so the bottom ~45% of seams (tier 0) had **no crossing at all** — yet the seamless
  render still drew both regions' streets meeting at the seam. The player saw a continuous street
  and hit an invisible wall.
- **Gates scattered off the walkable deck.** `gatesFor` spread its K picks across three radial
  layers (`gzMid±1`), but the game only ever walks the **mid-shell deck** (`gzMid`). Measured on
  seed 7: **79% of seams had no gate on the deck**, even where a deck-level candidate existed.

**The fix is two invariants, both kept symmetric by the seam contract (so the two regions still
agree without communicating):**
1. **Floor K to ≥1.** Every adjacent region pair is connected; the coarse tier now only sets road
   *prominence* (1 gate for a back-street seam, up to 3 for a trunk), never connectivity. Applied
   at all three call sites that gate (`solveRegion`'s `myGates`, `deckScene`'s `openGhost`,
   `gateLinks`).
2. **The deck guarantee in `gatesFor`.** If the K spread missed the deck, append the hash-minimum
   `gz = gzMid` candidate. A deck candidate effectively always exists (the foam is thick at
   mid-shell), so **every seam gets a walkable crossing** — verified 0/432 seams un-gated, down from
   79%. Pinned in `record.selftest` (THE STITCHING CONTRACT: every band seam has a deck gate, and
   the guarantee stays symmetric across all seams).

**v3 SHIPPED at `hoop/v3/`** (linked from the topbar; v1 and v2 untouched). It rides the fixed
kernel and upgrades navigation: click-to-walk now BFS-routes a **region path** across the whole
loaded world and threads the gates **seam by seam** — so you can click any room you can see, several
regions away, and the `@` crosses every gate to get there (the wrap and axial directions included).
v2 only handled an immediate neighbour. The seamless one-cell threshold step (walk into the ghost
partner, swap the active region at that exact point) is unchanged; v3 just chains it.

## Leg 10 — OPEN HALLS + the vertical (stairs) leg

**Open halls (SHIPPED, `deck.js`).** A building used to be a clump of ~15 m chambers walled off from
each other and stitched by a per-building interior door-tree — so a workshop read as a *warren* of
tiny cells. It now reads as architecture: **every membrane INSIDE a building is removed (classified
`open`); only the exterior shell stands — onto the street, the void, or a neighbouring building —
pierced by the single street door.** The chamber substrate still tiles the floor (and carries the
lighting + role colour), it just has no interior walls. The change is one line in the membrane
classifier; sequestration (one street door), service doors (landlocked buildings), and sealed
pockets all keep working at building granularity. Pinned in `deck.selftest` (OPEN HALLS: interior
membranes removed, zero interior doors; real opens join road↔road OR same-building). Shared kernel,
so v2, v3, and `/econ/deck` all get it. *Tunable later: the largest civic buildings (council ≈46,
hospital ≈40 cells) become one big hall; if that reads cavernous, reintroduce light internal
partitions for tier-3 buildings via paint's `assignZones` — default stays fully open.*

**The vertical leg — STAIRS & LADDERS (SHIPPED).** The ship's shell is `NZ` radial decks. We now
slice **any** `gz` (not just `gzMid`), and **stairs emerge from the 3-D solve**: a stair is a
road chamber whose radial neighbour (`gz±1`, same `gx,gy`) is ALSO road — i.e. the vertical
right-of-way that `society3d`'s climb network already grows. `deckScene` returns `stairs`
(`{cell, partnerGid, dir, type}`; a deterministic third are `ladder`s). The worker solves a region
in 3-D ONCE (cached) and serves per-`(az,ax,gz)` floor slices; the page keys tiles by `az,ax,gz`,
carries `AT.floor`, streams the decks above/below for the stairs (+ same-floor neighbours on the
concourse), and rides a stair with the ▲/▼ controls (or click it) — walk to the connector, change
deck on arrival at the same `(x,y)` (`gx,gy` fix `x,y`; only `rad` changes, so no camera jump).
**Cross-region travel is on the concourse (`gzMid`)**; upper/lower decks are interior to the region
(gates only sit at `gzMid`). Pinned in `deck.selftest` (stairs emerge, sit on the concourse, land on
a road cell of the deck below, deterministic). *Follow-ups: auto-routing a single path THROUGH stairs
(currently ride-then-route), per-floor gates for cross-region travel off the concourse, and the art
Phase 4 slide (slope only exists across decks).*

**NEXT: NPCs.** The society already lays people who wear many hats; the next leg renders them moving
on the decks. Sprite brief for the generation pass is in [`../NPC-SPRITES.md`](../NPC-SPRITES.md)
(top-down, 32 px, role-coloured, the canon palette/emblems).

## Leg 11 — PATHFINDING AS A FUNCTION OF WALLS (SHIPPED) + the oblong stitch cells

Open halls exposed a flaw: `walkRoute` routed over the Voronoi **cell-adjacency graph**, threading
`centre → membrane-midpoint → centre` through every cell — so in a big open hall (or the concourse)
the path zigzagged through dozens of centroids instead of cutting straight. The router didn't know
the space was open; it only knew adjacency.

**The fix (shipped, `deck.js`): line-of-sight string-pull against the actual walls.** Dijkstra still
picks the corridor (its `centre→midpoint→centre` path is wall-free by construction); then
`losSimplify` greedily skips waypoints whenever the straight shot stays clear of the **wall
segments** (`d.walls`, bucket-gridded). The path now runs dead straight across open space and corners
only where a real wall or doorway forces it — *a function of the walls, not the centroids.* Measured:
**0 wall crossings, 82% fewer corners** (929→164 turns over 49 probes). `deck.js` exports the wall
segments; both solvers ship `walls` in the trimmed view; pinned in `deck.selftest` (no route crosses
a wall; LOS has far fewer points than Dijkstra cells). An SSF *funnel* was tried first and abandoned —
it only works on simple channels and cut corners through the exterior walls of non-convex halls.

**The oblong stitch cells.** Two causes, both addressed:
- *Edge-of-map oblongs* — a frontier nucleus with no outboard neighbour gets a Voronoi cell that
  sprawls to `clipCell`'s box. Fixed: every paint cell is now **frame-clipped** to the region + a
  seam margin (Sutherland–Hodgman), pinned in `deck.selftest`.
- *Interior oblong artifacts* — a sparse-foam cell's over-long edge (≳1.6 cells, ~3% of membranes)
  doesn't line up with the convex walk graph, so it's **excluded from the wall set** for the
  string-pull (real walls are tiled by short membranes, so coverage is unaffected). These rare
  interior oblongs can still *render*; fully dissolving them is a `clipCell` robustness follow-up.

**The graceful cross-region stitch (SHIPPED, `v3/index.html`).** The gate-hop state machine is gone.
`unifiedRoute` builds ONE walkable graph stitched across every loaded region at the gate links, plus
the union of all their wall segments, in active-local world coords; Dijkstra (binary heap) from the
@'s LIVE position to the target cell, then a SINGLE `losSimplify` over the combined walls. The result
is one taut trajectory that flows **straight through the seams** — verified headlessly: 20/20
cross-region routes span >1 region with 0 wall crossings. Crossing a seam is now just a **coordinate
rebase** (`setActiveRebase`): when the @ walks into a loaded neighbour's frame, the @ and the
remaining trajectory are shifted into that region's local frame — nothing teleports, the camera
hands off seamlessly. **Repathing is live + interruptible:** every click routes from the @'s actual
position (`currentRoom` = nearest seed to the live `AT.x,AT.y`), so a tap mid-stride redirects from
where it is — fixing the long-standing "repath from the original start" bug.

## Leg 8 — the v1 art style on the solved map (PHASE 1 SHIPPED on v3)

v2 rendered the brutalist flat-cell look. v1's feel — **room lighting and sliding at steep floor
gradients** — is the aesthetic leg, and the solved map makes it *better* than v1 because the light
sources are now MEANINGFUL. Phased:

- **Phase 1 — the light buffer (SHIPPED, `hoop/v3/`).** v1's `_buildLight` ported: a CPU float
  light buffer of additive quadratic splats, sampled per paint cell, composited `albedo·AMB +
  light·GAIN`. **Function-matched emission** (`ROLE_LIGHT` in `v3/index.html`, the cousin of v1's
  `ROOM_TYPES`): a building lights by what it IS — a forge flickers warm, an observatory is dim, a
  clinic a steady white — and the concourse carries cool street lamps. Walls + void stay unlit dark
  mass so structure reads. Emitters are cached per region (`emittersOf`); the buffer is built in
  active-local world coords over the viewport and shared by every rendered region (offset), so the
  light is continuous across the stitched seams. No occlusion yet (v1 had none either). The `@` gets
  a pulsing gold glow. **Proof is live (canvas) — sanity-pinned numerically off a real region.**
- **Phase 2 — the finishing devices (SHIPPED) + every-cell light.** Plate seams (a faint inked
  stroke per floor cell — the hand-drawn feel; true `ink.js` jitter is a later refinement),
  `shadowBlur` pulsing glow on the gold gates, the scanline overlay, palette alignment. And the
  lighting went **generous**: a warm ambient floor washes the whole deck and EVERY cell type is now
  an albedo + light-response gain — walls and void are dark stone that still catch a neighbour's
  glow (reduced gain), floors/roads/buildings take full light; denser street lamps, brighter
  emitters. Pinned numerically: 100% of cells lit, no pure-black anywhere.
- **Phase 3 — OCCLUSION that uses the city's walls (SHIPPED, the leg-8 payoff).** Light now respects
  the walls: a building lights its open hall and **spills out its one door** (a door/open membrane
  is not a wall) but not through its back wall; street lamps pool along the concourse and cast
  building shadows. Occlusion is STATIC (walls + emitters never move), so each region's occluded
  light field is **precomputed once** (`precomputeLight`, ray-vs-wall via the exported `makeOccluder`
  over `d.walls`) and only sampled per frame — no per-frame raytracing. Per-emitter flicker survives
  exactly via a **sin/cos decomposition**: the steady part bakes into one buffer, the oscillating
  part into `A=Σ amp·cosφ` / `B=Σ amp·sinφ`, so a frame is `steady + sinωt·A + cosωt·B`. Open halls
  get a few **farthest-point-spread lamps** (a single centroid light can't fill a non-convex hall).
  Verified headlessly: ~94% of cross-building light is wall-blocked, hall coverage ~90% (the rest is
  realistic shadow in non-convex halls), flicker reproduction exact (1e-16). *Follow-ups: cross-seam
  light spill (each region occludes with its own walls only), and evicting `_lit`/`_walk` buffers for
  far regions (memory grows without eviction).*
- **Phase 4 — movement + slide (DEFERRED with inter-deck stairs).** v1's slide is free-movement
  physics; v3 is click-to-walk, and the spin-gravity slope is ~flat on a single deck — real slope
  only appears at inter-deck connectors. Park until the stairs leg lands (needs `rad` per chamber in
  `trim`).

The phase-1 detail, kept for the record:

- **Function-matched light.** v1 lit rooms generically; here a room's light comes from what it IS.
  Each building's role carries an emission (a hearth-warm dwelling, a cold-blue workshop, a civic
  hall's lantern); the concourse is lit by the street. Raytrace/raymarch per-room emission against
  the membrane geometry `buildSceneCustom` already returns (walls occlude, doorways spill light
  into the concourse) — the SAME walls the city built, so light and structure are one model.
- **Gradient sliding.** v1 slid the `@` at extreme floor gradients (the spin-gravity slope). On the
  deck that is the **radial** component of a move: walking a ramp-fed room near a shaft, or the
  rare cross-deck easement, imparts slide. The deck already knows each room's `rad`; the gradient
  between adjacent rooms is the slope. Port v1's slide physics keyed off that.
- This is a renderer swap, not a model change — `deckScene`'s output is unchanged; v2's `draw()`
  grows a lighting pass. Charted as its own session: it deserves the focus v1's renderer got.

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
