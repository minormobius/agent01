# hoop — CLAUDE.md (the GAME wing · main site)

You are working on **hoop**, the game wing and **main site** of the O'Neill cylinder
modelling package. Read `hoop/README.md` first — this file is the operational quick-reference.

## What hoop is

**The infinite game.** A collaborative design space where *the map is the forum*: you walk an
`@` around a glyph world stitched from an endless, deterministic ship engine; every glowing
node is a *place* that anchors one long-running conversation thread, and every place and
message is an ATProto record. The canvas is the engine surface; the right rail is the forum.

- `js/ship.js` — the deterministic, infinite, chunked ship engine (global `HoopShip`; loaded
  as a classic script *before* the module app so `world.js` can read it off the global).
- `js/world.js` — the canvas adventure: Voronoi-cell "foam" map, `@` movement, click-to-walk,
  gravity regimes, live peers.
- `js/app.js` — the controller wiring world ⇆ store ⇆ thread rail ⇆ auth ⇆ presence.
- `js/store.js` — data model + two backends (Local / ATProto) + threading.
- `js/{presence,atproto,ink}.js` — presence socket client · public ATProto reads · seeded vector drawing.
- `js/postal.js` + `js/nav.js` — **the navigation plumbing** (design: `NAV.md`). `postal.js` derives
  stable, hierarchical, Merkle-able **chamber addresses** from the deterministic engine (NPCs/places
  bind to `(chunk, ordinal)` — genome-stable slots); `nav.js` is two-tier **HPA\*** routing (coarse
  portal-graph A\* + fine `isFloor` A\*), the 2-D-deck cousin of `rind/wayfind.js`. Pure + node-tested.
  Wiring status (`NAV.md`): **steps 1 & 3 done** — places carry `{gid, addr, depth}` (via
  `store.setChamberLookup` ← `world.field.chamberAt`), and `world.js`'s click-to-walk now routes
  through `navRoute(field.seed, …, { ports: foamPorts })` (no ±48 window; `stepMotion` still walks
  the tiles). `nav.js` also exports **`wayfan()`** — the geodesic player→perimeter tree that is the
  substrate for the **map overhaul**: `world.js`'s `_draw` renders a **light planar-fan overlay** —
  `_ensureFan` recomputes the player's fan only on tile/depth change (radius ~26, ~3 ms) and bakes
  flat arrays so `_drawFan` is one stroke (routes) + one fill (tips) per frame. (Per-cell dimming
  was tried and reverted — it tanked the framerate.) A dedicated rendering pass + the corkscrew
  (`cost`/`connectorAt`) are next.
- `js/store.js` — places now bind to a **chamber address** (postal): `setChamberLookup`/`withAddress`
  attach `gid`/`addr`/`depth`; the `hoop.place` lexicon gained those optional fields. Tile stays the rkey.
- `worker.js` — assets + the **HoopRoom** presence Durable Object (live positions over WebSockets).
- `research.html` + `js/research.js` — the **research dossier** (linked from the topbar `❖ research`
  pill): the supporting-world models from the three modelling wings, collated as a scientific report
  with three live "active figures" — the hull section + secant cable web (rind), the circular axis
  cross-section over the real ratchet topography (lakes as equipotential arcs + the ratchet river,
  ported from tide/ratchet) (tide), the closed food-web loop (biome). Note the
  secant duality across the two circular figures: a cable IS a secant (structure), a lake is NOT one
  (the ratchet's equipotential arc). The figure kernels in `research.js` are pure/zero-dep and
  re-derive each wing's headline physics (hoop is pure-static and can't import a sibling wing at
  runtime); they're pinned by `test/research.selftest.mjs` against the numbers the wings publish.
- `chunkroller/` — the **chunk-design tool** at `hoop.mino.mobi/chunkroller` (a `/econ` cousin for a single
  chunk). Rolls a `solveChunk()` and shows a **total top-down view** (cells by role/domain/tier/social
  lens + roads + ports + glyphs), a **civic vitality readout** (the econ kernel run over the chunk's
  rooms), **NPC stats** (`stats.js#rollCharacter` per resident → mean triad + per-room dossier), and
  **biome sliders that bias room creation** via the engine's additive `roleMix` override (`v7/foam.js`
  `drawRole`/`castCharacter`, default = wild-type `ROLE_MIX`, so the game is unchanged). Seven sliders +
  named biomes (Commons/Market/Garden/Foundry/Cloister/Civic Seat/Dormitory). The design surface for the
  bigger map plan (chunk biomes, edge tiles/bounded floors, no-baddies floor 1). See `chunkroller/README.md`.
- `nave/` — **floor 1** at `hoop.mino.mobi/nave`. The realised floor-1 layout: a central **commons** (≥1 of
  every building type) ringed by **six faction wards** in **three two-chunk lobes** — Rindwalker · Continuant
  · Drift. Each faction owns four roles (two exclusive buildings + two shared, weight-0 for everything else),
  its two biomes carrying the exclusives at two intensity levels. Center links to all six; a ward links only
  to the center + its sibling; every cross-faction adjacency is a portless wall. `nave.js#buildNave(seed)`
  composes the v2 engine (`solveChunk` + explicit `closedSides`/inherited ports, one shared foam seed). Three
  views with pan/zoom: biome (faction tint) · verb (by role) · **full** (the real game skin —
  `skin.js#paintChunk` per chunk: seeded walls, bones hidden, retiled concourse, baked lighting). Pure +
  node-tested (`nave/test/nave.selftest.mjs`, 36 checks). See `nave/README.md`. **Wired into the v099 game
  as floor 1**: `v099/index.html#newWorld` builds the nave via `prepareNave`/`naveSolveNext` (the commons
  solves + spawns first, the six wards stream in paced one-per-tick like normal chunk loads), and
  `maybeStream` is gated on `world._nave` so the bounded floor never streams past its seven wards. The
  standalone `/nave` page stays the design view.
- `rind/` — **floor 2** at `hoop.mino.mobi/rind`. The structural underworld below the nave (deck 3 of the
  story spine, "The Vessel"), reached by **descending the shaft** once the nave is cleared
  (`narrative_tier ≥ 3`). A central **shaft-foot hub** spoked to three stations on alternating hex sides
  (dirs 0·2·4, so the spokes touch only the hub — a clean **star**): **Navigation** · **The Propulsion
  Drum** · **The Signal Chamber** (the tier-3 revelation seat). **Infrastructure only** — no `grow`
  (farms), no `play` (arcades); just make · mend · store · move · govern, and the Signal (worship · learn).
  `rind.js#buildRind(seed)` composes the **same v2 engine as the nave** (`prepareRind`/`rindSolveNext` pace
  the four solves; one shared foam seed). Standalone `/rind` view (`index.html` + `rind-app.js`) is a
  near-clone of the nave view (station · verb · full skin, pan/zoom). Pure + node-tested
  (`rind/test/rind.selftest.mjs`, 36 checks). See `rind/README.md`. **NB:** this is the game's rind FLOOR,
  the playable cousin of the repo-root `/rind` structural WING — same name, different layer. **In-game
  descent wiring is the next step**: `v099/index.html#maybeBuildRind` already gates at tier 3 but builds a
  single placeholder chunk; swap it for this streamed four-chunk floor, **offset** in world coords (the
  rind's hub↔station seams share the nave's lattice, so co-locating would leak the player between decks).
- `forge/` — **the ship's industrial metabolism** (`forge/forge.js` + `FACTORY.md`), the everything-factory
  of the upper rind modelled as a **closed-loop production economy** — biome's industrial cousin. A
  generation ship is closed (every atom already aboard), so production is **cycling a fixed stock of
  conserved commodities**: `scrap →[reclaim]→ stock →[build]→ deployed →[wear]→ scrap`. Conservation is
  **structural** (paired transfers; mass drift ~1e-12), the **reclaimer is the decomposer** (the recycle
  valve — under-build it and scrap piles while stock drains: the Biosphere-2 failure, a passing test), and
  energy is drawn from a fixed budget (tide's `energyLedger().total_GW`) → waste heat. Seven conserved
  commodities (metal · polymer · silicate · volatiles · water · biomass · trace), five cross-commodity
  products (structure · fixture · machine · circuit · consumable). The **closure law**: `reclaimCap ≥
  wearDemand` per commodity. An **oracle** (`oracle()`) scores whether the loop closes (Closed · Lean ·
  Leaking · Draining · Collapsing), names the keystone valve, and catches the failure modes. Pure +
  node-tested (`forge/test/forge.selftest.mjs`, 34 checks). The detailed **production graph**
  (`forge/graph.js`) is the Factorio layer beneath the aggregate: 31 materials (feedstock → intermediates →
  components → products → scrap) and 25 named **processes** (refine · fabricate · assemble · recycle ·
  bio-regen · seam), same structural conservation (each process's implicit loss→scrap means output can never
  exceed input). The **seams are processes**: energy on every machine (the Grow Vat is the big draw — tide),
  the digest→synth→grow→mill organic loop (biome), the condenser (iris). `solveFlow(demand)` back-props to
  per-process rates + edge flows and **cascades** recovery (wear→scrap→recycler→feedstock) with
  composition-accurate wear routing (`compositionOf`); the honest closure read: metal/silica ~95% closed,
  volatiles closes (bio surplus), water + trace are the makeup leaks (life-support; the scarce keystone).
  Pinned by `forge/test/graph.selftest.mjs` (82 checks). **Flow page** at `hoop.mino.mobi/forge`
  (`index.html` + `forge-app.js`): the graph rendered Factorio-style (pools → refine → fabricate → assemble
  → products, wear → scrap → recyclers/bio-regen looping back; edges family-coloured, width ∝ rate), live
  deployed-setpoint sliders driving closure bars + energy-vs-budget, and click-a-node → recipe + **wiki**
  (`forge/wiki.js`, authored prose merged with derived facts). **The needs + unified-ledger layer**
  (`NEEDS.md`): products are derived from the ship's NEEDS (15 loops of a closed generation ship) →
  `catalogue.js` (~50 element-tagged product classes over 14 real elements, the periodic-table/Sankey
  substrate); `needs.js` maps the nave's verbs → loops → a population's demand; and **`ledger.js` is the
  unified element ledger** — it vendors **biome** verbatim (`vendor/biome/`, copy-never-fork) as the
  **life-support** half (biome conserves C·H·O·N) and adds the **industrial** half (Si·Fe·…) on ONE ledger,
  coupled at the shared pools. The **carbon pump is mechanical + a dial**: carbon closes only when biome
  over-grows (~3×) to feed industry on top of the crew. Pinned by `test/{catalogue,needs,ledger}.selftest.mjs`.
  **The facilities-in-foam layer** (`ENGINES.md`): the processes are placed in **rind chambers** as the
  **eight production engines** — foundry (star) · chemworks (cycle) · mill (path) · fab (dag) · weave (comb)
  · assembly (in-tree) · fluid (flow) · reclaim (fan) — fit into the **same voronoi foam** as the nave & rind.
  `engines.js` is the engine data (steps · core · activity graph · family); `facility.js#solveForgeChunk`
  runs the nave's `buildFoam → defineChunk → solveRoomsFirst` pipeline, then partitions the chunk's rooms
  into **1–3 facilities** by graph-Voronoi (facilities are Voronoi regions OF the chambers — the conceit run
  one level up), labels each cluster's rooms with its engine's process steps, and routes the activity graph
  room→room. **The wriggle:** eight distinct topologies in one uniform foam — the topology lives in the flow
  overlay, not the room shapes. Live at `hoop.mino.mobi/forge/facilities` (`facilities.html` +
  `facilities-app.js`, a chunkroller cousin: pick ≤3 engines, roll, chambers tinted by facility + shaded by
  step, flow arrows routed; `?seed=&e=` permalink). Pinned by `forge/test/facility.selftest.mjs` (101 checks).
  **The coherent-region layer** (`floor.js#buildForgeRegion`): many forge chunks solved at once on one shared
  foam (the buildNave composition scaled up — 7/19/any count, seamless seams). **The hypoxia/rooms-first
  concourse solver is GONE for the forge — physarum is the only pather.** Each chunk is just *partitioned*
  (`partitionChunk`, no road); the concourse is then **grown + carved**: the intra-facility activity flow,
  the **inter-engine supply graph**, and the nave demand are the trip demand, the flux field
  (`paint/flux.js`) grows over the whole region's **cell graph**, and `growConduits` carves its superlevel
  set as the road (expropriating cells, giving frontage + doors — the `econ/roads.js#finalizeRoads` pattern).
  Commodity tags (`engines.js` intake/output) close the economy across chunks (reclaim → raw →
  foundry/chemworks/fab/weave → mill → assembly → product → reclaim, validated closed). A **ninth role, the
  `fulfillment` center** (a logistics hub, **one per ~19-chunk factory**, at the most central chunk) is the
  **rind↔nave conduit**: assembly product rides **up** the lift to a **NAVE node**, the nave's worn goods come
  **down** as waste to the reclaim yards — so the factory **supplies a whole nave** (~180 crew/assembly line).
  With a single hub the layout is **optimised** (`optimizeLayout`): assign engines to chunks to minimise
  transport around the hub → a **radial supply gradient** (assembly+reclaim ring the hub, refiners outside),
  ~25–30% below random placement. The heavy long-haul demand (inter-chunk supply + nave lifts) makes
  physarum's **trunk arterials span the seams = the emergent axial-rail**. It tiles (19→37→larger; one hub per
  factory). Live at `hoop.mino.mobi/forge/region` (`region.html` + `region-app.js`: chunks/μ sliders, **⚙
  optimise-layout toggle** with a live transport readout, carved conduits by tier, nave lift, supply overlay,
  `?seed=&n=&mu=&opt=`). Pinned by `forge/test/region.selftest.mjs` (29 checks).
  **The anti-soup layer** (`fixtures.js` + `sprites.js`): the foam geometry is uniform by design, so engine
  identity comes from three non-geometric overlays — **ambient** (per-engine light/floor: foundry hot-orange,
  fab cold-cyan, weave humid-green…), **fixtures** (a characteristic core machine per engine — crucible ·
  retort · rollers · litho · loom · conveyor · pump · shredder · nave-lift, all distinct), and **material in
  motion** (carriers animate along the activity graph so the topology is a *verb*: foundry pulses droplets
  out, mill streams a billet down, chemworks circulates, reclaim fans out). The **⚙ machines & material**
  toggle on both `/forge/facilities` and `/forge/region` (default on; off = flat tint = the soup, for
  comparison) makes each facility read as its own place and the factory a patchwork of districts, not a stew.
  Pinned by `forge/test/fixtures.selftest.mjs` (31). The eventual home is the v099 game skin
  (`skin.js#paintChunk` + consoles/FIXTURES) — the forge pages prove the treatment.
  **Walk it** — `hoop.mino.mobi/forge/walk` (`walk.html` + `walk-app.js`) is a **playable proto**: an @ walks
  a forge region's production floor, reusing the game's `manager.pathFind`/`nearestNode` over a free-roam nav
  graph (`floor.js#regionWalk`, 100% connected), click/tap-to-walk + WASD, camera following, the rich skin +
  the nave lift overhead, a HUD naming the facility you're in. To enable this, `packChunk` now emits cell
  `adj` + room `doorPairs`, so forge records are **buildWalk-compatible** (they drive the game nav graph).
  **Real v099 wiring (not yet done):** make the forge a deck reached from the rind (`index.html#maybeBuildRind`
  is the hook) = generate it as a deck offset in world coords + attach the fulfillment lift as the shaft +
  **port `sprites.js` into `skin.js#paintChunk`** (the big piece — the game skin only knows nave rooms). The
  standalone proto is the safe testbed first. See `ENGINES.md`. **Next:** wire a forge region into the v099 game as
  a playable deck (nave/rind cousin); energetics (tide) seam; fixtures + logistics droids riding the trunks.
  See `ENGINES.md` + `NEEDS.md` + `FACTORY.md`.
- `paint/` (`paint/index.html` + `paint/voronoi.js`) — a **rendering playground** at
  `hoop.mino.mobi/paint/` for how the foam rooms are drawn: seed the floor-plan **membranes** with
  fine Voronoi nuclei (**wall spacing** ⇒ wall thickness), and **density-grade** the floor nuclei — a
  big seed at each room centre, fining toward the walls (**room spacing** ⇒ interior coarseness) — so
  detail goes where it's needed and the cells fit between the two. **Doors** are two-nuclei-wide gaps
  cut in the wall + floor-bridged (a spanning tree keeps every room connected; `loops` adds roads).
  **Zones** force higher-order structure: rooms agglomerate into sized super-regions (graph-Voronoi,
  weighted so a "program" can mix housing-16 + hospital-64) — dense doors inside a zone, a sparse
  arterial tree between zones. Sliders for wall/room spacing, room size, loops, zone size; mixed-
  program + tint/floor-plan/roads/nuclei toggles. Geometry kernel is pure + node-tested
  (`test/paint.selftest.mjs`, 34 checks: grading, door connectivity, zone connectivity + arterials);
  the page only draws what `buildScene()` returns. A sandbox to iterate the look before world.js.
  **Desire-line roads** (`paint/flux.js`, `test/flux.selftest.mjs`, 20 checks) is the naturalistic
  road-growth proto (FOAM.md leg 3): roads as the **superlevel set of the NPC traffic field** — the
  stationary flux of trips is the Laplace transform of NPC motion, so one solve gives streets +
  hierarchy + one-door-per-building + the ambient foot-traffic glow. Computed biologically (Physarum
  flux-reinforcement over the room graph); **μ** dials grid↔tree; roads render as zero-wall concourse,
  buildings glow by traffic. The `/paint` "desire-line roads" toggle drives it. Port target: replace
  the foam kernel's imposed `planRoute` with this grown network.
- `econ/` (`econ/index.html` + `econ/econ.js`) — **economies as ecosystems**, the ideation canvas at
  `hoop.mino.mobi/econ/`. A place is the economic cousin of a biome species: a **role** (verb) × a
  **domain** (matter) × **flows** (`in`/`out` resource tokens). The kernel mirrors biome/gacha's
  **deck → roll → oracle** arc: a *genome* breeds a town from a seed, and a viability oracle scores it.
  - **`buildWorld()` — buildings are CLUMPS of cells, sized by function.** The world is a *fine cell
    field* (far more cells than people — rooms, yards, corridors); cells agglomerate up into
    **buildings** whose **footprint** (cell count) is set by role: a dwelling ≈ 4 cells, a parish ≈ 18,
    a hospital ≈ 40, a council hall ≈ 46. Done with paint's graph-Voronoi (`assignZones`), weights
    `fp^0.65` (linearises its super-linear sizing so footprints track targets). Each building owns a
    connected clump + a centroid; a **building-adjacency graph + spanning-tree path network** makes it
    **mechanically pathable** (`route(world, a, b)` BFS = home→clinic). Buildings ARE the "places" the
    supply web and society run over, so `buildSociety`/`socialMetrics`/`removeImpact` consume the same
    shape `buildField` produced and work unchanged. (Legacy `buildField()` — one cell per place — stays
    for back-compat.)
  - **The social genome.** `DEFAULT_GENOME` (wild type) + `rollGenome(n)` (the "pull"): a seed-stable
    parameter bundle — role mix (the programme), `FOOTPRINT` (building size by function), households,
    affiliation propensities. A society is fully determined by `(genome, seed)` ⇒ atproto-stable.
    Rolls pick a **society archetype** (`ARCHETYPES`: balanced · dormitory · company · commons) that
    pulls *correlated* genes — independent jitter is mean-preserving (the multiplex web is robust to
    noise), so archetypes are how the genome breeds genuinely different towns.
  - **The vitality oracle.** `scoreSociety()` → one `vitality` 0..100 + a tier (Thriving · Healthy ·
    Stable · Fragile · Failing), the econ cousin of biome `score.mjs`. Sub-signals: supply closure ·
    thickness (multiplexity) · weave (reach) · bridges (weak-tie share) · third-places · employment ·
    resilience (avg hub-removal damage). It ranks the archetypes (commons > balanced > company >
    dormitory). *Calibration TODO (cf. biome's): natural rolls cluster Healthy/Thriving because the
    generation is structurally robust; breeding Fragile/Failing archetypes + tuning the tier bands is
    the next pass.*
  - **`society3d.js` — the FOAM SOCIETY kernel (the 3D leg).** The genome run over rind's actual
    annular chamber foam (the 33k-chamber foamview scene), **infrastructure-first**: wayfind's
    certified ramps+roads become reserved RIGHT-OF-WAY, buildings claim the remaining chambers as
    connected clumps (chamber-indexed — painting the society = colouring chambers by `chamberOwner`),
    supply is wired by **anisotropic road-distance Dijkstra** (climb ×6 off-deck, decks discounted;
    ~50% of suppliers differ from crow-flight), and an **access** signal (median dwelling→basket road
    cost) joins the oracle via `scoreFoamSociety`. `buildSociety`/`socialMetrics`/`removeImpact` run
    over the city unchanged. Imports `vendor/wayfind.js` — a **verbatim copy of `rind/wayfind.js`**
    (same rule as vendor/auth.js: re-sync, never fork; if they drift the certificate the kernel
    reserves is not the one foamview draws). Full 33k sector ≈ 5.5 s in node, deterministic from
    `(genome, seed)`. **GROWN roads (leg 3, shipped):** `createFoamGrower()` replaces the imposed
    corkscrew with desire-line right-of-way grown from the lived society's trips — grow-then-settle:
    a provisional no-road city sources demand, the field grows over the chamber graph, `finalize()`
    reassembles the city around the emergent streets. `test/foamroads.selftest.mjs` pins that the
    climb network EMERGES (92–99% radial span from demand alone). `buildFoamCity()` (certified
    planRoute) is kept verbatim for comparison. **The course is charted in
    [`econ/FOAM.md`](econ/FOAM.md)** — read it before extending the 3D side.
  - **`econ/foam/` — the painted foamview (FOAM.md leg 2), live at `/econ/foam/`.** WebGPU instanced
    chambers (2D canvas fallback) coloured by owning building under four lenses (role · size ·
    bridging · access); right-of-way always road-grey; glyph billboards LOD-gated by screen-space
    footprint; road frontage brightened + gold glyphs; route ribbons ported from rind foamview;
    radial probe = street-level cut; click → the worker answers the building dossier (weave, shock,
    access). The model lives in a module Worker (`foam/builder.js`) that posts transferable typed
    arrays — that worker contract is pinned headlessly by `test/econfoam.selftest.mjs` (the page
    itself is proofed by eye on deploy). Permalinks: `?seed=&n=`.

  `buildSociety()` lays **people who wear many hats** — Jim = mend@chopshop + grow@home + worship +
  learn@toastmasters — the multiplex affiliation graph whose **interaction thickness** (avg hats/person)
  is the cousin of ecological connectance. `socialMetrics()` scores each place **bridge vs bond**
  (Granovetter weak ties) + global `avgReach`. `removeImpact()` is the two-web shock — remove a place,
  see ties break + orphaned (people) AND needs at risk + rerouted (materials). Post-scarcity tell: the
  real output is `regard`. Brutalist render (cell substrate filled by owning-building colour so clumps
  read; supply web · social fabric · path network as faint overlays; click a building → who's there,
  its footprint, weave %, and the shock); colour by role/domain/tier/**footprint**/social/bridging; a
  **🧬 roll genome** button pulls a new town + live vitality readout. **⛗ grow roads** animates
  desire-line streets STEPWISE from the lived society (`econ/roads.js` over paint/flux.js's
  steppable kernel): every hat + supply edge is trip demand, each frame is one flux-reinforcement
  round (desire lines sharpening into a 3-tier hierarchy), then the carve — road cells expropriated
  from buildings, frontage + one door per survivor, absorbed buildings counted
  (`test/econroads.selftest.mjs`, 16 checks). Pure + node-tested
  (`test/econ.selftest.mjs`, 65 checks). **Ideation stage** — the real build is intended for a fresh
  `main` later; this is the sketchpad.

## The package it belongs to

Four surfaces, one cylinder. **game → hoop (you, main site)** · **structure → [rind](../rind)** ·
**thermodynamics → [tide](../tide)** · **ecosystem → [biome](../biome)**. hoop shed its
structural half (the old `cylinder.html` / `foam.js` / `solver/` tooling) to **rind** in the
cylinder-refactor — what remains here is purely the game. The three modelling wings are
reachable from hoop's topbar pills (⬡ rind · ☁ tide · ❧ biome); keep those links working.

## Run / test (all run from the sandbox; deploy does not)

```bash
node hoop/test/ship.selftest.mjs            # ship engine invariants (determinism, seamless chunks)
node hoop/test/world.selftest.mjs           # the Voronoi-ship rewrite: mesh + gravity movement
node hoop/test/cylinder-ring.selftest.mjs   # does the generated world substrate come out ROUND
node hoop/test/research.selftest.mjs        # dossier figure kernels vs. the wings' published numbers
node hoop/test/postal.selftest.mjs          # the postal system: addressing, locality, Merkle digests
node hoop/test/nav.selftest.mjs             # two-tier HPA* routing over the real engine tiles
node hoop/test/econ.selftest.mjs            # economies-as-ecosystems kernel (genome, footprints, oracle)
node hoop/test/econ3d.selftest.mjs          # the FOAM SOCIETY kernel over rind's 3D chamber graph
node hoop/test/econfoam.selftest.mjs        # the /econ/foam/ worker contract (what the page renders)
node hoop/test/flux.selftest.mjs            # desire-line roads: streets as the traffic field's superlevel set
node hoop/test/econroads.selftest.mjs       # the same grower fed by the REAL econ society (stepwise, the carve)
node hoop/test/foamroads.selftest.mjs       # the grown 3D foam city — THE CLIMB EMERGES (no imposed corkscrew)
node hoop/test/region.selftest.mjs          # the tiled foam's SEAM CONTRACT (leg-6 gate): borders bit-identical, ring closes
node hoop/test/record.selftest.mjs          # THE SOLVE OF RECORD: frozen coarse arterials + regional streets that meet at the gates
node hoop/test/deck.selftest.mjs            # THE DECK: a solved region in paint's 8/24 language + wayfinding + gate crossings
for t in hoop/test/*.selftest.mjs; do node "$t" || echo "FAIL $t"; done
```

(`cylinder-ring.selftest.mjs` tests `ship.js` + `world.js` — the *game's* world substrate,
despite the name. It stayed with hoop, not rind.)

## State model — two tiers (the /mmo pattern)

- **Hot / ephemeral → HoopRoom DO** (`worker.js`): live positions + online list, in-memory,
  broadcast over `/ws`. Identity is borrowed from the shared auth worker (validates the session
  token against `auth.mino.mobi/api/me`). Nothing persists — disconnect = you fade from the map.
- **Cold / durable → ATProto lexicons** (`com.minomobi.hoop.place` / `.message`), written to
  each user's PDS. User-owned, permanent. Lexicons in `lexicons/`.

## Deploy

- Push `hoop/**` on `main` or `claude/hoop-surface-setup-xd0mqo` (the current owning branch —
  see `deploy-registry.json`) → `deploy-hoop.yml` runs `wrangler deploy` (worker + assets + the
  HoopRoom DO migration). The sandbox cannot deploy; push and let the Action run. Verify the log
  binds `hoop.mino.mobi (custom domain)`.
- **Versioned surfaces.** Each `vNNN/` is an independently-served snapshot (worker rewrites
  `/vNNN/records` + `/vNNN/feed` to their `.html`; assets are relative). **`v098` is the stable
  TEST surface** (hoopy's content/story testbed — leave it stable); **`v099` is the DEVELOPMENT
  surface** (disruptive map work, new government/worship fixtures, deepened combat). Each surface
  namespaces its own localStorage (`hoop:vNNN:story` / `:lastseed`) so dev saves never collide with
  the test surface. To spin a new surface: `cp -r vNN vMM`, rewrite `/vNN/`→`/vMM/` and
  `hoop:vNN:`→`hoop:vMM:` in the copy, add the two clean-URL rewrites in `worker.js`.
- **v096 live inference (phase 2+, NOT yet wired into `worker.js`):** the worker will gain
  `GEMINI_API_KEY` (set out-of-band via `wrangler secret put`, never committed — the borges rule) to
  drive the segregated `story/llm/` adapter. Until set, the adapter is the disabled stub and the game
  is procedural. To swap in huwupy's local model: set `STORY_LLM=local` + `LLM_BASE_URL`/`EMBED_BASE_URL`.
- Ownership is in `deploy-registry.json` (surface `hoop`). Edit the registry, then
  `node scripts/gen-deploy-triggers.mjs --write` + `node scripts/lint-deploy-registry.mjs`.

## Invariants — do not break

1. **The ship engine is deterministic.** `(shipSeed, chunkCoord, genomeSnapshot)` →
   identical rooms on every machine and across ATProto repos. Don't introduce unseeded
   randomness into generation — it breaks reproducibility and atproto-persistability.
2. **`ship.js` is a classic global script**, loaded before the module `app.js`. Keep that
   ordering; `world.js` reads `globalThis.HoopShip`.
3. **Presence is never a lexicon.** You can't write a permanent firehose record on every
   footstep — the DO is the only home for live positions.
4. **`vendor/auth.js` is a verbatim copy** of `packages/oauth-client/auth.js` (a no-build
   static site can't reach `/packages/` at runtime). Re-sync it from source; don't fork it.
