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
- `rind/` — **floor 2, the UPPER RIND** at `hoop.mino.mobi/rind`. The structural skin below the nave (the
  bible's **Zone 3, The Upper Rind**), reached by **descending the shaft** once the wards are cleared
  (`narrative_tier ≥ 3`). Per hoopy's bible (*"The Seven as Rind Factions"*) the rind is **tagged by whose
  of the Seven's domain you're in**, the verbs re-read at scale: the upper rind is **Mercury** (the arteries
  — the shaft-foot HUB: move·trade·learn) spoked to **Mars** (forge-cathedral: make·mend) · **Venus** (green
  deep: grow·heal) · **Jupiter** (the long table: govern·play) on alternating hex sides (dirs 0·2·4, spokes
  touch only the hub — a clean **star**). **grow + play live here** (Venus's gardens, Jupiter's court — the
  old "infrastructure-only, no grow/play" rind was built off a now-outdated doc). **No worship up here** —
  that is Saturn/Sol, the **lower rind** — see below. `rind.js#buildRind(seed)` composes the **same v2
  engine as the nave** (`prepareRind`/`rindSolveNext` pace the four solves; one shared foam seed). Standalone
  `/rind` view (`index.html` + `rind-app.js`), pan/zoom. Pure + node-tested (`rind/test/rind.selftest.mjs`,
  37 checks). **NB:** the game's rind FLOOR, playable cousin of the repo-root `/rind` structural WING — same
  name, different layer.
  **The LOWER RIND (bible Zone 4 — `LOWER_RIND_CHUNKS`/`prepareLowerRind`/`buildLowerRind`):** the deep
  stasis floor — **Saturn** (the cold-deep HUB: worship·store·dwell) · **Sol** (fusion-heart: worship·make) ·
  **Luna** (dream-archive: learn·store) · **The Signal Chamber** (Luna's lost sanctum, the chapter's close:
  learn·worship). Same four-chunk star builder (reuses `rindSolveNext` with the lower-rind biome). Node-tested
  (`rind/test/lowerrind.selftest.mjs`, 34 checks). See `rind/README.md`.
  **Wired into the v100 game** (`v100/index.html`): the decks are a **linear stack** (0 nave → 1 upper rind →
  2 lower rind), each adjacent pair joined by one shaft — `shafts[k]` joins deck k↔k+1, each end `{x,y,node}`,
  crossing a **teleport pair** (the floors are offset — upper ~6000, lower ~12000 east — because their seams
  share the nave's lattice, so co-locating would leak decks). `maybeBuildRind` builds the upper rind at
  `narrative_tier ≥ 3`, `maybeBuildLowerRind` the lower at `≥ 4` (each gated on the floor above being fully
  streamed, to avoid racing the incremental stitch). Deck-aware shaft markers (`shaftUpHere`/`shaftDownHere`)
  read "up to …/down to …". Combat creeps arm on the rind decks (1·2); the nave (deck 0) is baddie-free.
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
  the **full 19-chunk factory** (default; `?n=&seed=&z=`, scroll/pinch zoom), reusing the game's
  `manager.pathFind`/`nearestNode` over a free-roam nav graph (`floor.js#regionWalk`, 100% connected),
  click/tap-to-walk + WASD, camera following, the rich skin + the nave lift overhead, a HUD naming the
  facility you're in. **Material packets ride the carved roads** — `floor.js#supplyRoutes` pathfinds every
  supply edge along a road-restricted graph (≥90% on-road), so packets stream the grown concourse to the
  fulfillment hub + up the lift, not straight lines. To enable the nav, `packChunk` emits cell `adj` + room
  `doorPairs`, so forge records are **buildWalk-compatible**.
  **Two decks** (`TRACKS.md`): a probe (`tracks.js`) showed a separate non-intersecting pedestrian track is a
  **planar impossibility in 2D** (the foam is road+rooms with no interstitial space; the concourse IS the
  connectivity) — so the answer is the blood-vessel one: **stack two decks** (`deck2.js#twoDeckFactory`) — the
  material floor + a pedestrian mezzanine (office per facility + catwalks), joined by a **corkscrew ramp** at
  each facility (`rampPoint`, the voronoi-foam stairwell; the fulfillment ramp continues to the nave). Iso
  view `hoop.mino.mobi/forge/stack` (explode slider separates the layers; packets on the floor, technicians
  on the catwalks, cars on the ramps). Pinned by `forge/test/{tracks,deck2}.selftest.mjs`.
  **The rigorous 3D answer** (`foam3d.js`): a real **volumetric chamber foam** (3D nuclei → near-neighbour
  graph) with **two physarum species** grown as **disjoint** networks that **both reach every facility** —
  `feasibleIn3D = true`, 10/10 each (vs ~1–3 in 2D). A 1D net has codimension 2 in a volume so it can't
  separate the space; the complement stays connected and the second species threads it. Rotatable foamview at
  `hoop.mino.mobi/forge/foam3d` (gold material net weaving past cyan pedestrian net, never touching). Pinned
  by `forge/test/foam3d.selftest.mjs` (13).
  **Factory formation in 3D** (`formation3d.js`): with floors, the supply chain rotates from a 2D radial
  gradient (around the hub) to a **vertical tower** — `engineStage()` derives supply depth (fulfillment 0 …
  reclaim 5), `formFactory` stratifies it bottom-to-top (reclaim·raw at z=0 where waste falls → foundry →
  refine → assembly·finish at the top, product up the lift to the nave). Gravity-aligned (heavy low, waste
  falls). Tradeoff: footprint −~70% (a column not a disc) for transport ×~1.5–2.3 (the climb, scaled by
  `kVert`) — right for a ship where volume is scarce. Rotatable tower `hoop.mino.mobi/forge/tower` (climb/
  explode sliders, flat-disc toggle). Pinned by `forge/test/formation3d.selftest.mjs` (14).
  **Presenting the 3D chunk** (`/forge/slices`): the bounded 3D chunk is a **hex prism** (2D hex × floors,
  still tessellates; each slice stays the familiar 2D map). The player reads it the way a radiologist reads a
  body and an architect reads a building — **plan + section**: PLAN = the current floor's 2D foam map
  (walkable, @ at the lift); SECTION = the elevation (strata reclaim-bottom→assembly-top, the lift threading
  them, you-are-here). Scrub floors via the lift/ramps. 3D stays legible as N trivial 2D maps + one cut.
  `slices.html` + `slices-app.js` (presentation over the tested kernels; no new test).
  **The infinity reframe** (`infinitefoam.js`, `/forge/ship`): the slice/hex-prism is only the LOCAL zoom —
  production is really the **infinite interstitium the finite naves float in**. Naves = sparse finite
  inclusions (the bounded little societies); production = the connective **vasculature** between them, endless.
  But it's **not free 3D** — the ship is an **O'Neill cylinder** and the rind is its **shell**, so the foam is
  "**bounded but infinite**", directional per axis: **radial `ir` BOUNDED** (`Nr` shells — naves on the inner
  surface `ir 0`; production stratifies OUTWARD `SHELL=[nave,assembly,refine,foundry,reclaim]`, product near
  the naves / raw deepest; lower rind `ir≥Nr` deferred; *up from a nave* = inward toward the bioengine);
  **azimuthal `ith` BOUNDED+PERIODIC** (the ring closes, `ith ≡ ith+Nth`); **axial `iz` INFINITE** (streams).
  Two interpenetrating vessel lattices (material arteries · pedestrian veins, offset ½-cell so they never
  touch — the two-species result). **Infinity hook** = the seam contract (cousin of `econ/record.js`): every
  hub/vessel/nave is a pure function of `(iz, ith mod Nth, ir)` + ship seed, so `shipWindow(centerA,span)`
  (a band along the axis × full ring × full thickness) streams forever and overlapping axial windows agree.
  `hoop.mino.mobi/forge/ship` looks **down the bore** (WASD fly axially, A/D roll, the shell wall curving
  around you, vessels converging to the vanishing point, naves on the inner skin, axis → ∞).
  **Four path sets + structure** (keys 1–6 / legend chips toggle all six layers): the fine **material·pedestrian**
  mesh, plus **power·water** *major trunks* rising from the lower rind (bold lines along the deepest shell
  `ir=Nr-1` with radial risers feeding inward — `win.power`/`win.water`, `utilHub`), and the rind's own
  **secant-cable skeleton** (`shipStructure`) lifted straight from `/rind`'s `research.js`: an `{N/k}` star
  polygon (N rim anchors → the k-th, each cable a chord/secant across the bore) **advanced one bay axially** →
  counter-rotating helices that cross (Shukhov hyperboloid). **k is set so the cables cut THROUGH the inner
  radius** — `coreClear=ROUT·cos(πk/N)` must fall *inside* R0 or the chords hide behind the inner skin (k=5→379
  outside R0=360 was the bug; **k=7→202** inside, fully visible) — while leaving a central core for the light
  pipe (the dashed teal core-clearance circle). Plus hoops + stringers. Defaults N=18, **k=7**. A central
  **light pipe** (the cylinder's sun) runs the axis; the camera sits slightly off-axis (`CAMR`) so it reads as a
  glowing line, not an end-on point. Pinned by `forge/test/infinitefoam.selftest.mjs` (29: ring closes, radius
  bounded, naves inner-only, outward stratification, axial windows agree, two systems never coincide;
  power/water deep+interleaved+streaming; the `{N/k}` web, both families, cables advance + clear the core + cut
  through the inner radius, the web streams). **Where it lives in the game:** a **learn-terminal codex view**
  (the ship-anatomy content shown at a `learn`-role component fixture → `terminal`, `v099/sim.js`
  `FIXTURE_ACTION`), not a control surface. `/ship` = the whole production layer; `/slices` = a local drop-in.
  The pipe was the microscope slide, not the ship.
  **Macro→micro — the chunk floor (`/forge/micro`, `forge/micro.js`, 18-test):** one locale at floor level a
  nave-dweller walks. (1) a **directional gradient with barriers**: office band (white collar, nave-side) →
  *barrier 1* → material transit (artery floor) → *barrier 2* → lower-rind portal — the portal touches only
  transit, so you reach the lower rind ONLY through the material transit; the gated walk crosses barrier 1
  before 2. (2) the **white-collar layer** (`WHITE_COLLAR`): the cortex over the autonomic production system —
  perfusion-watch / dispatch / scheduling / gate-control / telemetry / inventory (deck2.js's deck-1 mezzanine,
  given jobs). (3) the **capillary structure is WOVEN SURFACES, not nodes**: the two systems are broad **sheets that weave**
  (shown in SECTION). The **white-collar sheet** (leans up → office) and **material sheet** (leans down → lower
  rind) are a quarter-wave out of phase → they cross **over-under** (a weave), bounding **three broad layers**
  (white-collar phase / production weave / material phase). A **facility sits at every weave crossing**, touched
  by both sheets; because each is one broad continuous surface, **every office touches every facility** — broad,
  not deep (*three layers tops*). The weird math: a woven **triply-periodic minimal surface (the GYROID)** /
  block-copolymer **lamellar↔gyroid** microphase separation. `weaveStats` (over-under alternates, many crossings)
  + `contact` (complete office×facility) tested. The real foundation for the floor-level task.
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

- Push `hoop/**` on `main` or `claude/hoop-v106-upper-rind-p0t5xn` (the current owning branch —
  see `deploy-registry.json`) → `deploy-hoop.yml` runs `wrangler deploy` (worker + assets + the
  HoopRoom DO migration). The sandbox cannot deploy; push and let the Action run. Verify the log
  binds `hoop.mino.mobi (custom domain)`.
- **Versioned surfaces.** Each `vNNN/` is an independently-served snapshot (worker rewrites
  `/vNNN/records` + `/vNNN/feed` (+ `/spine`) to their `.html`; assets are relative). **`v100` is
  the STABLE surface** (the playable nave + three-deck stack — leave it frozen); **`v106` is the
  DEVELOPMENT surface** (the UPPER-RIND EVERYTHING-FACTORY pass — see its bullet below; the bare dev
  aliases `/over`, `/garden/plot`, `/alch`, `/smith`, `/quests` now resolve to v106). **`v105` is the
  frozen prior** (the SEEDED-QUEST-SPINE pass). **`v104` is an older frozen prior**
  (the FUNGIBLE-KEEPER pass). **`v103` is a FROZEN test surface** —
  the NPC-reform pass, playable end-to-end (kept live so hoopy can keep testing it); don't touch it. The v102
  pass (the frozen prior) was:
  - **Auth resilience (the reauth-on-return fix).** Two bugs made app-switching demand a re-login:
    (1) `flushRepo`'s save-failure handler re-minted HOOP_SCOPE — a full OAuth redirect — on ANY
    error, and the `visibilitychange→hidden` flush fires exactly when you background the app, so
    the OS-killed fetch read as a scope failure and navigated the page to the consent screen. Now
    only a definitive auth/scope error escalates, never while hidden. (2) the shared client lib's
    `init()` deleted the stored token on any transient network failure; it now only clears on a
    definitive 401, keeps a cached identity for offline grace, and slides the 30-day worker session
    daily via `/api/refresh` (which nothing called before — active players hard-expired monthly).
    Lib fix is in `packages/oauth-client/auth.js`, re-synced verbatim into `vendor/auth.js`.
  - **The strengthened quest solvability oracle** (`v102/story/solvable.js`): proves every anchor
    tier's gates have a placeable keeper AND (new) that each setter's flag-setting choice is
    REACHABLE in its dialogue (`setter_flag_unreachable` — an orphaned node or an unearnable
    choice-gate used to pass). Its `requiredKeeperIds` makes `populateChambers` force-place
    load-bearing keepers past the tier filter (the Kaelen Voss soft-lock fix), and v102's
    placement loop **self-heals stale placements** (the Miren Tallow lock: a keeper recorded
    `npc.discovered` whose living resident failed to re-derive existed nowhere and was never
    re-placed — now detected and re-seated). For gates the pool PROVABLY cannot satisfy
    (`waivableGates`; the live morphyx pool currently lacks setters for t3
    `flag.rind.rindwalker_scale_a` and t4 `flag.signal.chamber_key`), the surface **waives the
    gate at runtime with a notice** instead of walling the campaign. Prove the live pool:
    `node hoop/scripts/prove-solvable.mjs`.
  - **The onboarding engine** (`v102/story/onboard.js` — the little gimmes): the four deep systems
    are revealed ONE at a time, gated to hoopy's narrative tier ladder — ❀ garden (tier 1) → ⚗
    bench (tier 2) → ⚒ smithy (tier 3) → ⚔ gauntlet (tier 3). Each gimme grants its guaranteed
    first win (starter seeds; two live reagents; the smith wallet already affords a forge), points
    a teal ✧ marker at the nearest fixture chamber, and rides the journal as a single card. The
    natural verb (plant / brew / forge / clear stage one) completes it and pays coins — organic use
    counts even before the gimme unlocks, so nobody is re-tutorialised. Pure + node-tested
    (`v102/test/onboard.selftest.mjs`); the surface owns grants/hooks/ink.
  - **Side threads seek PEOPLE** (v102, `quests.js seekCandidates` + `questCounted`): a thread
    resolves by meeting theme-corroborating content — overwhelmingly people — but its old marker
    fell back to terminals/place hints (rooms) whenever the rumor text didn't name an NPC. Now
    every open thread resolves a live SEEK TARGET (the nearest placed, not-yet-counted, non-ambient
    corroborator; `discoverQuestNpcs` seats one from the tier-legal pool when none is placed), the
    journal names them ("⌖ seek <name> — they know this thread"), and a per-thread **◇ track**
    toggle pins the map waypoint on them, followed live like a keeper (the tracked thread wins the
    ◇; resolving it releases it). Waypoints point at people, not rooms — matching the main quest.
  - **The overworld's living menace** (`v102/over/menace.js`): fauna stop being scenery. Bee
    swarms wake when you stray inside their aggro radius (240 px) and hunt you as a **boids
    flock** (cohesion·separation·alignment·pursuit, seeded jitter — deterministic), leashed to
    their home flowers (460 px — outrun it and they drift home and settle); contact auto-fires
    the ambush. **Spiders never chase — they strike the moment you step on them.** An ambush
    stings stamina (−8 swarm / −10 spider), then resolves as the usual drive-off + reagent;
    cooldown-gated so a thicket can't stun-lock. Wired into both the in-game overlay and the
    standalone `/over` page; flocks render as bee particles with a threat ring on the centroid.
    Pure + node-tested (`v102/test/menace.selftest.mjs`, 18 checks — named `menace` because the
    arena already owns `swarm.selftest` for the distributed-body creep).
  - **The v103 NPC-REFORM pass** (the current dev surface). Two changes:
    - **The nave's civic web is UNIFIED** (`v103/story/genquest.js#profileFromNave`, the reciprocal of
      tide/goss's `UNIFIED.md`). The engine, chunkroller, and the old `profileFromChunk` all read the nave
      (commons + six wards) as **seven sealed societies** — "the nave scored as seven fragments." goss
      measured the whole nave as ONE civ web healthier on every baked seed (a ward short a parish *imports*
      from a neighbour). `profileFromNave` now reads the nave the same way — one society over EVERY loaded
      nave chunk with the cross-ward commute edges — **revealed, not re-rolled** (a streaming ward only
      appends, so the reading grows monotone as wards unseal; `UNIFIED.md §C2`). The surface's `profileHere`
      uses it whenever the player stands in the nave (deck 0); `?civ=sealed` keeps the engine-truth per-chunk
      read (parity with goss's `?mode=sealed`). Pure + node-tested (`v103/test/civic.selftest.mjs`, 12 checks).
    - **Waypoints always target PEOPLE** (`v103/story/promote.js`). A person-objective (a main-quest keeper
      or a side-thread's person of interest) that the world could neither locate nor seat from the pool used
      to DEGRADE its marker to a room (`questMarker` fell through to a terminal / the rind / a role-matched
      place) — the "waypoint chases a room" bug. `questMarker` now emits a `person` marker for a named-but-
      absent ref, and when the pool can seat nobody the surface **emergency-promotes** a deterministic stand-in
      (`emergencyNpc` — same name → same atproto-stable id, tier-legal, theme-tagged, clickable) so a resident
      can be promoted into the role and the ◇ resolves to someone walkable (the "Elias Vance who is absent"
      case).
    - **Load-bearing keepers sit in — and relocate to — their OWN ward** (the Factor Solen bug: "a waypoint
      pinned in a chamber while the journal said find Kaelen Voss"). A gate-setter keeper is a faction
      principal, but `populateChambers` hash-scattered them across whatever chambers were painted, so a
      Continuant keeper force-placed *before* its ward streamed landed in the commons (or a wrong ward) and
      — recorded "placed" — never moved; the waypoint then pointed at the wrong chamber ("it has to do with
      the opening of those chunks"). Now a keeper seats in its own ward when built (`keeperSeatChunks`, else
      the scatter fallback), and a mobile keeper stranded outside its ward once the ward opens is **re-seated**
      into it (`needsWardReseat` + `reseatKeeper`) — the keeper cousin of `relocateGuidesToWards`.
      Pure + node-tested (`v103/test/promote.selftest.mjs`, 37 checks). **A keeper seats on its ZONE's deck
      (the Elias Thorne / Corin Vale fixes):** `keeperTargetChunkIds(npc)` = the faction ward for a WARD keeper
      (`zone ∈ {ward,wards}`, deck 0), else the built chambers of the keeper's zone-deck (`ZONE_DECK`:
      upper_rind→1, lower_rind/signal→2). A rind keeper carries a nave-faction tag too (the rind is "tagged by
      whose of the Seven's domain you're in"), so faction alone routed Elias Thorne to the nave; and the old
      scatter dumped rind keepers on the PLAYER's deck, so Corin Vale landed in the nave when you sought him
      from there ("waypoint points nowhere in the nave"). Now every keeper seats on its own deck (deferred if
      that deck isn't built), `keeperReachable` gates `nextKeeper` on the deck being built, and a mis-decked
      mobile keeper is re-seated onto its deck. **Rind guides relocate too:** `relocateGuidesToWards` now moves
      the pinned tier-3 guide (Sevin) onto the upper-rind deck once it's sunk (`RIND_GUIDE_TIERS`), so "Seek
      Sevin" leads UP the shaft instead of stranding her in the commons (Luna is a mobile keeper on deck 2).
    - **`nextKeeper` follows the ward-unlock order** (the Factor Solen bug): an anchor's gates can span wards
      that open sequentially (FQ: continuant→rindwalker→drift), so `nextKeeper` takes an optional
      `reachable(keeper)` predicate; the surface's `keeperReachable` prefers a keeper whose faction ward is
      built (ward keepers) / whose deck is open (rind keepers), so the ◇ never points into an unopened ward.
    - **DEV `?wards=all`** (sticky; `?wards=off` clears) streams all six wards at once and force-places every
      tier's keepers — for eyeballing whether keepers place. Does not set gates or witness factions.
  - **Quest completability board** at `hoop.mino.mobi/v103/quests` (`v103/quests.html`; the bare `/quests` now
    tracks v105's seed roller): reads
    the live morphyx pool and renders every anchor tier's gates, the keeper that sets each, and the oracle
    verdict (`story/solvable.js#proveProgression`) PLUS a **placement class** column (which deck/zone each
    keeper is seated on) — so a gate that passes the content proof but would be mis-placed is visible. Node
    equivalent: `node hoop/scripts/prove-solvable.mjs`. NB: the oracle proves the *content contract* (setter
    exists, tier-legal, dialogue-reachable, zone-deck open); it does NOT prove the *surface's* placement is
    deck-correct — that gap is what the Elias Thorne bug lived in, now closed in `populateChambers`.
  - **Anchor briefings — the two setter-less gates get REAL setters** (`hoop/story/anchor-briefings.json` +
    `scripts/seed-anchor-briefings.mjs` + `.github/workflows/seed-hoop-anchors.yml`). The oracle reported two
    `gate_no_setter` errors on the live pool — `flag.rind.rindwalker_scale_a` (Sevin/t3) and
    `flag.signal.chamber_key` (Luna/t4): no keeper set them, so they relied on the runtime waiver. Now the
    ANCHOR sets its own ungated gate — a "briefing" choice spliced onto the anchor's greet node (Sevin opening
    the rind's first scale; Luna handing down the chamber's cadence), the beat where the guide sends you off.
    The seeder fetches each live anchor record, adds the briefing choice+node to its dialogue (idempotent,
    non-destructive — preserves every other field), and `putRecord`s it back to morphyx. With both in place
    `proveProgression` is PASS / 0 errors (verified in-memory against the live pool). Seeds in Actions (morphyx
    app-password), not the sandbox; auto-fires on push to those paths.
- **The v104 FUNGIBLE-KEEPER pass** (the current dev surface; v103 stays frozen for testing). A gate is no
  longer bound to ONE exact keeper — it can be satisfied by ANY of several room bundles (hoopy's diversity
  model: "ten room bundles per faction chunk, ≥3 fulfill the conditions"), unifying the main quest with the
  side-thread `seekCandidates` model. Changes:
  - **`anchors.js#gateSettersMulti`** — `{ gate: [every setter, …] }` (deduped, id-sorted). `gateSetters`
    (first-only) stays for the oracle. **`nextKeeper`** now carries the full satisfier list (`nk.setters`) and
    filters it by the `reachable` predicate (evaluated per-setter). **`solvable.js#requiredGateSetters`** — the
    active tier's unmet gates each with their full setter-id list. All pure + node-tested (`test/fungible.selftest.mjs`).
  - **Surface**: `renderQuest` points the ◇ at the **nearest PLACED satisfier** of the active gate (any unlocks
    it, so the marker always leads to a reachable person — and duplicate-named keepers like the two "Kaelen
    Voss" stop mattering). `populateChambers` guarantees ≥1 satisfier of each unmet gate is placed + findable
    (fungible: skip the gate if any satisfier is already up), re-seating a stranded one — replacing the
    force-place-one-hardcoded-keeper logic.
  - **`/quests`** gains a **satisfiers** column (per-gate setter count: ≥3 green = the diversity target, 1–2
    amber = thin, 0 red = no setter) so hoopy can verify his multi-setter draw. Forward-compatible: with today's
    1-setter-per-gate content it behaves exactly as before (verified against the live pool — names the correct
    Fulcrum Cell Kaelen); diversity lands automatically once hoopy authors ≥2 setters per gate.
  - **v104 QoL pass** (playability polish from hoopy's notes): (1) **paging** — a toast fires the moment an
    anchor's turn-in opens (`hoopy.paged.turnin.*`, once per anchor), so you don't have to open the journal to
    learn your guide wants you back; (2) **brief-then-send** — for tier ≥ 2 the ◇ sends you to the anchor FIRST
    to receive the charge (gated on `hoopy.met.anchor.*`, set in openAnchor/openKeeper; falls through if the
    anchor isn't locatable), fixing "Solen feels redundant"; (3) **full rumors** in the journal (no more 200-char
    truncation); (4) **legible nameplates** — `lightenHex` mixes a dark faction hue toward white (the Continuant
    navy `#33408f` was near-invisible); (5) the **overworld ladder yields** to a keeper/anchor standing on it
    (you can talk to Solen instead of always climbing); (6) **duplicate nameplates** append the room (the two
    "Kaelen Voss" are now "Kaelen Voss · Fulcrum Cell" vs "· Rivet Chancel").
  - **`v104/planets.js` — THE SEVEN, the unified design-language keystone** (the demo-tier consolidation of
    character · skills · items · alchemy · crafting · combat into one alphabet). Two orthogonal axes name
    everything, and a thing is a **(faction, planet)** pair — 3 × 7 = **21 identities** — replacing alchemy's
    humour/metal/vessel, crafting's material-family, and gems' crystal-system:
    - **FACTION → BODY** (the triad axis): continuant·FLESH · rindwalker·CHASSIS · drift·ANIMA. The body lean
      is **derived** from each faction's own civic verbs' `stats.js` VOCATIONS, so it's grounded and lands the
      right domain per faction with **no skew** (this is why the triad moved off the planets — deriving it on
      the planets came out 5/7 ANIMA). `bodyOf`/`bodyLean`/`factionOfBody`.
    - **PLANET → FLAVOR** (the register axis): the Seven, each with glyph · metal · colour · governed verbs ·
      temperament · humour. `planetOf(tag)` funnels any vocabulary (name/Sun-Moon/metal/glyph/verb) → key;
      `advantage()` is a balanced 7-way rulership RPS (Chaldean cycle); `matchups()` splits the six.
    - **`identityOf(faction, planet)`** composes the species ("The Iron Wright" = rindwalker × mars) with its
      body lean + flavor + combat matchups; `allIdentities()` = the 21. `blend`/free axis — any faction × any
      planet is reachable (no home-cluster gating). Pure + node-tested (`test/planets.selftest.mjs`, 33 checks).
    The plan lives at **`hoop.mino.mobi/plan`** (`v104/plan.html`, also `/v104/plan`): the interactive 3×7
    grid, per-cell body/flavor detail, the five verticals mapped, the rulership heptagram. Colours + per-cell
    flavor stay tunable; the shape is settled.
    All five verticals now speak the alphabet (each pure + node-tested):
    - **V1 — character creation** (`character.js`): you pick **only a VERB**. **Not** a faction (that's the
      main-quest fork at Sevin's threshold, `flag.chosen_faction`) and **not** a planet — planetary flavor is
      not chosen, it's **grown** (see the alignment system below). The verb is one of **12 vocations** in an
      authored **4/4/4** across the three body-columns (`dwell` struck as a starter filler; `govern`, the
      Warden, filed under CHASSIS with a chassis-dominant creation blend so the body it shows is the body it
      plays). The verb sets your BODY + kit + civic role; the character is stamped `{vocation, body}` — no
      faction, no planet. In the arena, `playerFaction()` uses the chosen faction if set, else falls back to
      `TRIAD_FACTION[body]` (a provisional combat school from your body).
    - **Planetary alignment — GROWN, not chosen** (`alignment.js`, pure + node-tested; wired in `index.html`):
      nearly everything carries a planet, and every interaction **tallies** toward it — forge a metal
      (`materialPlanet`), brew a herb (`planetKey`), socket a gem (`gemPlanet`), best a foe (`.planet`). The
      running tally is published as a **7-axis radar** on the character panel (`#who`), rides the save as an
      `alignment` fact, and its **dominant planet becomes your combat register** (`buildPlayerUnit` sets
      `unit.planet = dominant(alignment)`, so the element-over-element RPS turns on as you align; neutral
      until then). `alignment.js` is mechanism only — `planetOfThing` resolves any object to its planet,
      `tally`/`normalized`/`dominant`/`ranked`/`radarPoints` do the math; the game glue decides what counts.
    - **V2 — crafting/forge** (`craft/smith.js` + `sprite/item/taxa.js`): `materialPlanet(id)` bridges every
      material to a planet REGISTER — the classical metals funnel authoritatively through `planetOf`
      (gold→sol · silver→luna · iron→mars), the rest by a documented table (all 22 covered, all 7 planets).
      `craftItem` stamps `{planet, register, planetGlyph, planetColour}`; `spec.faction` records the school it
      favours (`favoursOf` = the faction body). `itemRegister(item)` exposes a gear's planet + combat matchup.
    - **V3 — alchemy/brew** (`alch/alchemy.js`): a reagent now carries BOTH the vendored correspondence name
      AND the canonical `planetKey` (`planetOf('Sun')→'sol'` — that is what the Sun/Moon aliases were for),
      plus its register `colour` and 7-way `matchups`. `prepare()` stamps the canonical `planetKey` on the
      social effect so cross-vertical affinity keys on ONE identity. Vendored data untouched — bridge on top.
    - **V4 — gems** (`gems.js`): `SYSTEM_PLANET` is a clean 7↔7 bijection (each crystal system → a planet);
      `gemRegister(gem)` carries glyph/colour/matchups. `gemBonus(gem, body)` gains a body-resonance channel —
      a socketed stone also feeds the attribute the wielder's body leans on (`BODY_STAT`: flesh→hp,
      chassis→def, anima→flux — the plan's "a Mars gem hardens a Chassis frame"). No-body call is unchanged.
    - **V5 — combat/arena** (`arena/engine.js` + `encounter.js`): "faction = school" was already live via
      `factions.js` (kits/discounts/passives). Added the missing "planet = 7-way matchup": `elementMult` reads
      `planets.js`'s balanced heptagram — the attacker whose planet rules the defender's hits ×1.25, yields
      ×0.8, neutral ×1 when either side is planet-less (so the demo/harness/un-migrated content is unaffected).
      Units carry `planet` (from `character.planet`); creeps get a deterministic planet from their seed.
    **Faction↔body coherence (resolved by style swap).** `arena/factions.js` + `arena/tree.js` used to pair
    continuant→chassis / rindwalker→flesh — the OPPOSITE of the confirmed `planets.js` derivation. Fixed by
    swapping the two combat STYLES (not just the labels) so each faction plays its body: **continuant→FLESH**
    now runs RISK & RESILIENCE (gore/adrenal/berserk/regen, aggro AI, Hound summon, Berserker/Reaver trees);
    **rindwalker→CHASSIS** now runs ATTRITION & CONTROL (brace/rivet/bulwark/mend/revive, turtle AI, Sentry
    summon, Warden/Steward trees); **drift→ANIMA** unchanged. Glyphs/accents/leans/glosses moved with the
    style; the swap only reassigns proven-tuned payloads, so per-style balance is unchanged. This actually
    coheres with the civic narrative (continuant grows·heals = the living meat; rindwalker makes·mends·stores
    = the frame). Pinned by a guard in `continuum.selftest` (`FACTIONS[k].domain === bodyOf(k)`) so it can't
    silently drift again.
- **The v105 SEEDED-QUEST-SPINE pass** (the current dev surface; v104 stays the frozen prior). Three changes:
  - **All wards open after Olo** (`ensureUnlockedWards`): the six faction wards stream together the moment the
    commons quest clears (introSolved), instead of one-per-witness. The old chain left Solen's tier-2 keepers
    un-placeable (a keeper cast into the Rindwalker ward could not exist until that ward streamed — the
    "unfindable Kaelen Voss" soft-lock). Witnessing ORDER is unchanged (fqCanWitness still walks continuant →
    rindwalker → drift, and the Drift still opens the rind) — only the geometry opens at once, as intended.
  - **SEEDED KEEPER CASTING** (`v105/story/weave.js`, pure + node-tested `test/weave.selftest.mjs`): the pool
    carries ~168 room bundles but the campaign always ran through the same two dozen authored setters. Now
    every anchor gate's keeper is CAST deterministically from the zone/faction-legal slice of the bundle pool,
    keyed to the WORLD SEED — `weaveWorld(servePool(...), seed)` is the one entry (loadStory + reloadPool call
    it): `castSpine` picks (hash-seeded, no double-booking, anchors + other gates' authored setters excluded),
    `weaveCast` SPLICES a charge exchange onto the cast keeper's own dialogue (additive; namespaced
    `q_charge_*` nodes) and strips just that gate's set_facts from the authored setter. Anchor-briefing gates
    (Sevin's first scale, Luna's chamber key) are never re-cast. Same (pool, seed) → same cast forever
    (atproto-stable); a republished pool re-weaves gracefully (the cast is derived, never stored). Every seed
    is PROVEN progressable: `node hoop/scripts/prove-weave.mjs --sweep 500` runs `proveProgression` on the
    woven live pool per seed (300/300 at ship time); `/quests` (see below) is the browser cousin.
  - **THE TIER-2 MURDER MYSTERY** (`v105/story/mystery.js`, pure + node-tested `test/mystery.selftest.mjs`) —
    tide/case merged with the room-bundle architecture, as Factor Solen's FINAL subquest. The case is built
    ONLY from provably-placed keepers: case-giver = the first ward gate's cast keeper (the first keeper Solen
    names); suspects = the other tier-1/2 cast keepers + padded extras (`mystery.requiredIds`, seated by
    populateChambers like gate satisfiers); the VICTIM = an unused bundle RETIRED by the weave (dead, never
    seated — `discoverNpc` also refuses retired records). Motive is read off bundle facts (same verb → RIVAL,
    shared haunt → DEBT, same faction → SUCCESSION, else CREED), means are verb-typed items, alibis clear only
    on independent (cross-faction) corroboration, and tide/case's SOLVABILITY ORACLE certifies the clue list's
    deductive closure converges on exactly the culprit (watch retries + a grounded reluctant-eyewitness closer)
    before the case ships. `weaveMystery` transforms the clues into DIALOGUE: the case opens on the case-giver
    once their own charge is heard, each suspect carries their account (choices gated on `case.opened`, clue
    facts `case.clue.*` feed the journal's ☠ case card), and the player closes it with a REAL ACCUSATION to
    the case-giver — the right name sets `flag.ward.mystery_closed`, which the weave adds to Solen's
    `load_bearing.gates` AND the turn-in choice's requires (a wrong name is rebuffed; `case.missed`).
  - **Actions fulfill quests + the clue chase (the stuck-on-Havel rule).** Every woven fact sets on the
    choice that REVEALS it, never a closing pleasantry; MEETING a gate's keeper sets their gate outright
    (`meetKeeperGates` in openKeeper/openAnchor — excluded: the mystery gate, the mythograph gate, true
    anchors). The case's ◇ leads the INVESTIGATION (`mystery.js clueTargets`: case-giver → unheard-clue
    holders → case-giver for the accusation) and the journal's ☠ card ACCUMULATES every heard clue verbatim.
  - **Keepers keep ONE room** (`flagKeeperResident`): a keeper no longer commutes between civic-web stops —
    they're seated in a kept room (verb-matched in their chamber when possible) with a 2–3-cell interior
    PUTTER route + long dwells, so the chamber's flavor text (maybeChamberLore) fires with the keeper
    standing right there.
  - **The OLO FINALE — the mythograph quest** (`weave.js buildMythograph/weaveMythograph`): the final keeper
    of Olo's lineup SENDS you (sets `fact.mythograph.sent`) to a learn terminal (▤); the first terminal read
    AFTER the send sets `fact.mythograph.read` (openTerminal — a prologue read can't skip the walk); the
    REPORT back to that keeper sets `flag.commons.mythograph_reported`, which Olo's turn-in now requires
    (anchorWithGate, shared with the mystery). The oracle treats required-but-never-produced facts as the
    runtime boundary (`solvable.js` unions `worldExternal`), so the woven pool still proves per-seed.
  - **CHAMBER ERRANDS — the quests and the fixtures, enmeshed** (`v105/story/errand.js`, node-tested).
    Every keeper can fire off ONE errand keyed to their kept chamber's VERB; the task IS that verb's
    fixture: grow→plant ❀ · serve→eat ☕ · play→arcade win ◉ / gauntlet stage ⚔ · make→forge ⚒ / brew ⚗ ·
    mend→lapidary ⬡ · trade→exchange ⇄ · learn→terminal ▤ · worship→oracle ☴ · govern→seal-stand ❦ ·
    dwell→rest ✚ / chest ▣. The three fixture-less verbs stretch to real acts: heal→the mending REST,
    store→the hold-CHEST deposit, move→a DELIVERY (person-as-fixture: carry a parcel to another placed
    keeper). Runtime, not content: the offer renders as a task row in the keeper's conversation (the
    giftRow pattern), `act.<kind>` counters bump at every fixture action site, progress counts against
    the accept-time baseline, and the player reports back to the giver for the coin. One errand per
    keeper per world; journal carries a ✒ errands card; `?errands=off` kills the system; a bundle with
    `content.errand: false` never offers (hoopy's per-NPC switch); anchors/wanderers/retired never offer.
  - **`/quests` is now the SEED ROLLER** (`v105/quests.html`, bare alias): pick/step/randomize a world seed →
    the full cast table per tier (cast keeper vs the authored "was", placement class, CASE badge), the case
    dossier (victim, suspects + motives + spoiler-blurred culprit, the clue chain with holders), the oracle
    verdict for the woven pool, and a "prove 100 seeds" in-browser sweep. `?seed=` here matches the game's
    `?seed=` — the board IS the playtest permalink.
- **The v106 UPPER-RIND EVERYTHING-FACTORY pass** (the current dev surface; v105 stays the frozen prior).
  **Deck 1 is no longer four nave-like chunks — it is the ring-weave POCKET DIMENSION** (rind/upperrind
  brought into the game): SIX white-collar ops threads (W0–W5, two per nave faction, antipodal) × EIGHT
  production threads — six radial engine halls (foundry·chemworks·mill·fab·weave·fluid) plus the TWO RING
  LOOPS that intersect everything (RA assembly at the core · RR reclaim at the rim). Every crossing is a
  zero-grade chamber (the no-ladder rule): thread×thread through an X interface, ring×threads through a
  beefy Y-junction antechamber (ZA:/ZR:). Two nexuses close the deck stack: **NX** (top-floor fulfillment
  nexus, bonded to RA — the lift up to the nave, `shafts[0].bottom`) and **ND** (bottom-floor dispatch
  nexus, bonded to RR — the shaft down to the lower rind, `shafts[1].top`; new in v106, waste falls
  outward and so do you). Pieces:
  - **`v106/rindweave/pocketdeck.js`** — the game-native port of rind/ops `pocketweave.js`+`ringpocket.js`
    (ring mode hard-wired), driving the game's own engine (`v099/v8/chunkgen.js`). MANAGER-FREE: the
    surface owns one world+walk; pocketdeck solves ~88 chunk recs in ABSOLUTE deck coordinates, each
    pocket at its own far-apart SLOT (islands — no accidental port stitching; hexes solve over
    world-positioned polys, never local coords), tagged `{deck:1, rind:true, weave:{key,si,kind}}`.
    Doors are TELEPORT PAIRS (the shaft mechanic sideways), paired by `pid = sorted([key,toKey])` —
    110 pairs, all resolving (pinned). Same prepare/solveNext contract as `rind/rind.js` so
    `world._rind` keeps its `{idx, order, recs[0]=hub}` shape (recs[0] is NX).
    `v106/rindweave/weavecore.js` is the prism-free trim of rind/ops/weave3d.js (analytic spirals +
    crossings only) + FACTIONS + districtCentres; `engines.js` is verbatim. Tests:
    `v106/test/pocketdeck.selftest.mjs` (130 checks: roster, no orphan doors, ring loops CLOSE, gilded
    nexus rooms, islands, determinism).
  - **`v106/rindweave/weavenav.js` — the ◇ router.** Pure Dijkstra over the ANALYTIC door graph (~224
    doors — routes resolve before pockets stream), cost = crossings·1e6 + walk distance, so crossings
    minimize first, distance breaks ties. Pinned findings: W_i↔P_i (ring-pair partners) meet in their ONE
    shared antechamber (2 crossings); white→white is always 4 crossings, pivoting on a ring OR an
    interface–hall–interface shortcut (same count — distance decides); the nave is reachable ONLY through
    NX (…→RA→NX→lift) and the lower rind ONLY through ND (…→RR→ND→shaft); no pocket pair needs >6
    crossings. `weaveWaypoint` aims the ◇ at the next door IN THE PLAYER'S OWN POCKET (inside
    drawWaypoint's 3000-unit clamp); `routeBreadcrumb` feeds the journal. Tests:
    `v106/test/weavenav.selftest.mjs` (341 checks over 240 routes).
  - **Surface wiring** (`v106/index.html`): `maybeBuildRind` lays NX as the shaft foot then
    `streamWeaveDeck` streams the other ~87 pockets paced (stitchAdd, NOT restitch — O(one chunk), keeps
    teleport node bases stable); `registerWeaveDoors` rebuilds the pair list as both sides solve;
    `weaveDoorAt`+click = walk-to-then-cross (shaft semantics); doors draw as gold ⊓ portals with
    destination labels; `questWpToward` is weave-aware (same-deck-cross-pocket → next door of the route,
    off-deck → the right nexus; `weaveWpInfo` renders "via …" under the ◇ and the full breadcrumb in the
    journal); `maybeBuildLowerRind` sinks the down-shaft in ND (not the old hub), offsets moved
    (RIND_OFFSET 24000, LOWER_RIND_OFFSET 60000 — the slot grid needs the clearance). **The weave rule:
    npcs live ONLY in the white threads** — `keeperTargetChunkIds` filters deck 1 to W-pockets (faction
    keepers prefer their faction's own two antipodal threads), `populateChambers`' round-robin skips
    production pockets (a dead seat would drain the pool), and `rebuildSocietySoon` filters residents so
    the halls/rings/antechambers run unmanned. Guides relocate to NX (the first painted deck-1 chunk —
    the arrival lobby) and promote into the nearest white-thread resident.
  - **PRODUCTION SHIFTS — the factory's side quests, from Sevin's keepers** (`v106/story/shift.js`, pure +
    node-tested; design memo `v106/rindweave/PRODUCTION.md`). Every keeper the weave seats into a white
    thread offers ONE generated shift; the thread's white-collar ROLE picks the generator —
    **dispatch·gate → HAUL** (carry a commodity along a real `engines.js supplyChain` edge, source hall →
    consumer; **the wage is priced by the router: pay ∝ crossings**), **perfusion·telemetry → FIX** (a
    seeded fault in the production half; cross-check TWO other white threads' lenses — no single lens
    localizes — reach the fault, then perform the repair ACT via the errand act counters: halls ⚒ forge ·
    rings ⬡ lapidary · antechambers ⚗ brew, counted from the fault-reached baseline),
    **schedule·inventory → AUDIT** (walk a ring loop: three of its six antechambers, any order). A shift is
    deterministic from (world seed, keeper id, thread) — the same weave.js cast that deals Sevin's keepers
    deals the shift board, so a new seed re-deals both. **Solvability oracle** (`proveShift`): steps exist,
    every leg routes on the analytic weave, hauls ride real produce/consume pairs, lenses distinct + not
    the giver's own, audits stay on-ring, wage finite; **selection** salt-steps the hash until the oracle
    passes (the castSpine retry) — an offered shift is provable by construction. Surface: offer row in the
    keeper's conversation (the errand giftRow pattern, `data-shift`), book = `shift.book` JSON fact, pocket
    ARRIVALS advance steps (`checkShiftArrivals` on pocket change), journal card ⚙ with per-shift **◇
    track** (`shift.track` → `trackedShiftLoc` → `liveWp`, weave-routed), report back to the giver for the
    coin. `?shifts=off` kills the system; `content.shift: false` is the per-bundle opt-out; ambient /
    load-bearing / retired never offer. Tests: `v106/test/shift.selftest.mjs` (1105 checks — a 30-seed ×
    6-thread × 3-keeper sweep, 540 shifts all proven, 192 distinct; wage monotone in crossings; the
    progress machine incl. ordered-arrival and act-baseline rules; the guards).
  v098/v099 are frozen priors. Each
  surface namespaces its own localStorage (`hoop:vNNN:story` / `:lastseed`) so dev saves never
  collide with the stable surface. To spin a new surface: `cp -r vNN vMM`, rewrite `/vNN/`→`/vMM/`
  and `hoop:vNN:`→`hoop:vMM:` in the copy, add the clean-URL rewrites in `worker.js`.
- **World docs at `/docs`** (`hoop/docs/index.html`): the world-side documentation — the whole
  scope of the world (decks, story spine, minigames, food economy), every workflow that feeds it,
  the v101 audit findings, and the roadmap (overworld; garden/cafe/kitchen overhaul). Keep it
  current when the surfaces or workflows change.
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
