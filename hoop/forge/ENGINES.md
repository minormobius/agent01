# The eight production engines — fitting the forge into the foam

> The user's conceit: **the ship is built from one foam.** Every chamber — a nave dwelling, a rind
> station, a forge furnace — is a Voronoi cell of the same construction process. So a production facility
> is not a bespoke building; it is a **cluster of foam chambers** assigned a process, exactly the way a
> nave ward is a cluster of foam chambers assigned a social role. This doc is the design of how the eight
> topographically distinct production engines land in that uniform allocation — the live endpoint is
> `hoop.mino.mobi/forge/facilities` (a [chunkroller](../chunkroller/) cousin for the upper rind).

## The wriggle

Eight engines, eight different **activity-graph families**:

| Engine | Family | The shape | Core | per chunk |
|---|---|---|---|---|
| **Foundry** 🜂 | star | a hot core tapped on every side | furnace | 1 |
| **Chemical works** ⚗ | cycle | a reactor with its recycle loop closed | reactor | 2 |
| **Mill** ⊏ | path | a long line, billet → coil, each stand hands forward | reheat | 1 |
| **Cleanroom fab** ▤ | dag | purity only ever rises — a graded corridor | litho | 1 |
| **Weave hall** 𝍱 | comb | a spool spine feeds parallel teeth that comb to one bolt | spool | 2 |
| **Assembly line** ⊶ | in-tree | feeder bays converge on a spine, then test & crate | line | 2 |
| **Fluid works** ◍ | flow | reservoirs + pumps, a flow network with a return leg | pump | 2 |
| **Reclaim yard** ♺ | fan | one throat shreds, one sort, then it fans to the bales | shred | 3 |

The tension the user flagged ("fun to see how you wriggle out of this one"): these are genuinely distinct
graphs, but the foam allocates chambers **uniformly**. How do you get a star and a path and a loop out of
the same partition kernel?

**The answer: the topology lives in the flow drawn over the rooms, not in the room shapes.** A facility is
a cluster of uniform foam chambers; what makes it a foundry is two data overlays the foam already supports
(they are exactly the two the nave uses for its wards):

1. the **process mix** — which steps (rooms) the cluster carries (the nave biome's `roleMix` cousin);
2. the **activity graph** — how material flows step → step (the nave's social-web overlay cousin).

So construction stays uniform — **one foam for the whole ship** — while each facility reads as its own
machine. A foundry's furnace sits at the cluster centre and every step wires to it (a star); a mill's
steps lay along the cluster's principal axis and hand forward (a path); a chemworks routes a directed
cycle through its rooms (the recycle loop closes). Same chambers, different wiring.

## How a chunk is solved (`facility.js`)

The **same** `buildFoam → defineChunk → solveRoomsFirst` pipeline as `nave.js` and `rind.js` — then:

1. **Partition the chunk's rooms into 1–3 facilities** by graph-Voronoi (`assignZones`) over the room
   proximity graph. This is the conceit run **one level up**: facilities are Voronoi regions *of* the
   chambers, the way chambers are Voronoi regions of space. Facility size ∝ the engine's total footprint,
   so a big foundry claims more chambers than a small reclaim yard. A repair pass keeps every facility one
   connected cluster.
2. **Assign each facility an engine** and label its rooms with that engine's **process steps**, placed by
   family: a hub family (star · cycle · fan · flow) puts the core at the cluster centre and arrays the
   rest by angle; a spine family (path · dag · comb · in-tree) puts the core at one end of the principal
   axis and lays the steps along it.
3. **Route the activity graph** room → room: for each declared step → step edge, connect each source room
   to the nearest target room. This routed graph is what visibly differs between families.

Pure + deterministic (seed in → identical facilities everywhere; atproto-stable). Pinned by
`test/facility.selftest.mjs` (101 checks: the family shapes read in the routed flow — a star is a hub, a
path has no cycle, a chemworks loops, a reclaim fans; facilities are disjoint connected clusters; flow
never crosses a facility line; 1–3 per chunk holds; everything deterministic). The engine data is in
`engines.js`, validated structurally (`validate()` — every flow endpoint a real step, each family's flow
the shape it claims).

## Why 1–3 per chunk

These facilities are **bigger than nave chambers** (a furnace hall, a pump hall — each many chambers), so a
chunk holds fewer of them. The split is by heat/size: the big hot engines (foundry, mill, fab) fill a
chunk alone (`perChunk: 1`); the medium ones (chemworks, weave, assembly, fluid) pair up; the small
reclaim yard packs up to three. `pickChunkEngines(seed)` draws a deterministic hand that respects each
engine's `perChunk` cap.

## Scale

8 engines × 5–7 steps ≈ 48 process rooms in the catalogue; a chunk realises 1–3 facilities (≈ 10–20
chambers each). The funnel caps complexity: a small family of layout rules (hub vs spine + the per-family
ordering) over one foam kernel covers all eight — the spatial cousin of the nave's single vitality oracle
driving every ward.

## The coherent region — many chunks at once, the concourse GROWN (`floor.js`)

The single-chunk roller shows one facility cluster; `floor.js#buildForgeRegion(seed, {count, mu})` solves a
**hex cluster of forge chunks on one shared foam** (the `buildNave`/`buildRind` composition, scaled up — 7,
19, any count), so the upper rind reads coherently with seamless seams. **The hypoxia / rooms-first
concourse solver is gone** — physarum is the *only* pather. Four things the region delivers:

1. **Physarum *is* the concourse (carved, not imposed).** Each chunk is only *partitioned* into rooms +
   facilities (`partitionChunk` — no road). The concourse is then **grown**: the intra-facility activity
   flow, the inter-engine supply graph, and the nave demand are the trip demand (`paint/flux.js`), the flux
   field is grown over the whole region's **cell graph**, and `growConduits` **carves** its superlevel set
   as the road — expropriating cells from rooms and giving every room frontage + a door (the
   `econ/roads.js#finalizeRoads` pattern). `mu` dials grid↔trunk. There is no second road system.
2. **The inter-engine supply graph.** Facilities close the economy *across chunks*. Each engine carries
   `intake`/`output` **commodity tags** (`engines.js`), validated a closed loop: `reclaim` shreds worn
   **product**/**waste** into **scrap_metal · feedstock · silicon · fiber · scrap_water**, feeding
   **foundry · chemworks · fab · weave · fluid**; foundry **metal** → mill **stock** → assembly →
   **product** → reclaim. Each (emitter, tag) matches the nearest consumer (preferring another chunk).
3. **The fulfillment center → the nave (product up, waste down).** A ninth role — `fulfillment`, a
   **logistics hub** (`engines.js`, `logistics: true`, excluded from the production pick). **One per ~19-chunk
   factory** (`fulfillmentCount`, default `round(count/19)`), placed at the most central chunk. It is the
   **rind↔nave conduit**: assembly's **product** flows to it and rides **up** the lift to the **NAVE node**
   (the living deck above); the nave's worn goods come **down** as **waste** to the reclaim yards. The nave
   lift is a strong bidirectional trip, so physarum grows it as a bright vertical trunk. Given the factory's
   assembly throughput it reports the crew it can supply (`~180 / assembly line`) — the forge supplies a
   whole nave.
4. **The optimised global layout (around the single hub).** With one fulfillment center, every gram of
   product funnels to one nave conduit and every gram of waste returns through it — so the layout problem is:
   **assign engines to chunks to minimise total weighted transport around that hub.** `optimizeLayout`
   minimises (a) the nave throughput — all assembly product travels to the hub, all reclaim absorbs waste
   from it (heavy weights, so assembly+reclaim are pulled to RING the hub) — plus (b) the inter-engine supply
   (each producer to its nearest consumer). It seeds by ring+affinity then polishes with swap local search.
   The **emergent structure is a radial supply gradient**: fulfillment at the centre, a ring of
   assembly+reclaim, the refiners (foundry/mill/chem/fab/weave/fluid) outside feeding inward. Versus the same
   engine mix placed at random it cuts transport **~25–30%** (reported live: "X% below random"). On the
   `/forge/region` page it's the **⚙ optimise global layout** toggle.
5. **The emergent axial-rail.** Because the heavy long-haul demand is *inter-chunk* supply + the nave lifts,
   the trunk arterials physarum reinforces **span chunk seams** — the trans-rind transport ("Does the upper
   rind have axial rail?"), grown from what the rind moves, not drawn. **It tiles**: 19 → 37 (two factories,
   two hubs) → larger, unchanged.

Live at `hoop.mino.mobi/forge/region`; pinned by `test/region.selftest.mjs` (29 checks: seamless seams, a
**carved** concourse whose road cells are expropriated from rooms, the supply loop matching emitter→consumer
and spanning chunks, **one fulfillment per 19-chunk factory** bridging to a linked nave node, the **optimised
layout cutting transport >10% with assembly+reclaim ringing the hub**, a tiered conduit network with a nave
lift and seam-crossing trunks, deterministic, tiles to 37 (two hubs), single-chunk mode for the facilities page).

## Not soup — fixtures, ambient & material in motion (`fixtures.js` + `sprites.js`)

The foam geometry is uniform *by design*, so if a tint were the only thing distinguishing a foundry from a
weave hall the map would be a homogeneous stew and the topology would be invisible to the player. Identity
comes from three overlays the player reads, none of which touch the geometry:

1. **Ambient** — per-engine light + floor (`AMBIENT`): a foundry glows hot orange, a cleanroom is cold cyan,
   a weave hall humid green, fluid blue, reclaim rust. The atmosphere names the place before any glyph.
2. **Fixtures** — a characteristic **machine** per step (`sprites.js#drawCore`): the core step gets the
   landmark (crucible · retort · rollers · litho · loom · conveyor+arm · pump · shredder · nave-lift), the
   rest get equipment boxes. The cores are all distinct, so engines read apart at a glance.
3. **Material in motion** — carriers animate along the activity graph (`MATERIAL` + `drawCarrier`), so the
   **topology is a verb, not a noun**: a foundry *pulses* molten droplets out from the hot core (star), a
   mill *streams* a billet down the line (path), a chemworks *circulates* the reactor loop (cycle), a
   reclaim yard *fans* junk out to the bales. This is the real anti-soup move — the flow moves the way the
   engine works, so a star and a path are obviously different even on identical foam.

On `/forge/facilities` and `/forge/region` it's the **⚙ machines & material** toggle (default on); flip it
off to see the flat tint (the soup) for comparison. At factory scale the region reads as a patchwork of
distinct industrial districts — each its own light + landmark — wired by the grown trunk network, not a
uniform stew. Pinned by `test/fixtures.selftest.mjs` (31: every engine has all three overlays; the cores
are distinct; the motion modes vary). **The eventual home is the v099 game skin** (`skin.js#paintChunk` +
the consoles/FIXTURES fixture system) — these forge pages prove the treatment; the game renders it for real.

## Walk it — the playable proto (`/forge/walk`)

`forge/walk.html` + `walk-app.js`: an **@ you walk around a forge region's production floor** — the **full
19-chunk factory** by default (`?n=`, `?seed=`, `?z=` zoom; scroll/pinch to zoom out to the whole factory
or in to walk). It reuses the v099 game's own movement — `manager.pathFind`/`nearestNode` over a **free-roam
nav graph** (`floor.js#regionWalk`: every interior cell a node, foam-adjacency + shared ports, 100% connected
across all chunks), the same click/tap-to-walk control as the game (plus WASD). Camera follows; the rich skin
(ambient light · core machines · material in motion) renders around you; the HUD names the facility you're in
+ what it makes; the fulfillment hub shows the **nave lift** rising overhead. To make this work the partition
records were made **buildWalk-compatible** — `packChunk` now emits cell `adj` + room `doorPairs` (the door
onto the carved concourse), so the forge chunks drive the game's nav graph directly.

**The packets ride the roads we grew.** `floor.js#supplyRoutes` pathfinds every inter-engine supply edge
along a **road-restricted graph** (only road↔road steps + seam crossings bridged onto each chunk's
concourse), so the material packets animate **along the carved physarum trunks**, not straight facility→
facility lines — ≥90% on-road (100% on the tested seeds), weaving ~20 road cells each. You watch product
stream the concourse to the fulfillment hub and ride the lift up; reclaim's output fans back out to the
foundries. Pinned in `test/region.selftest.mjs`.

### Wiring into the v099 game proper (the next step, not yet done)

The records are now game-shaped, so the remaining work to make the forge a real **deck reached from the
rind** (`v099/index.html#maybeBuildRind` is the hook — it already sinks a shaft + marks a lower deck) is:
(1) generate the forge region as a deck (`markRindDeck` cousin, offset in world coords); (2) attach the
**fulfillment lift as the shaft** — thematically the fulfillment center *is* the nave connection; (3) the
big piece — **extend `skin.js#paintChunk`** to render forge fixtures/ambient/material (the game skin only
knows nave rooms today; the forge's look currently lives in `sprites.js`). That's invasive on the 302 KB
game file, so the standalone proto is the safe testbed first.

## Two tracks (material + pedestrian) — see `TRACKS.md`

Asked: make the roadway the material track (spiderbots + packets) and add a separate non-intersecting
pedestrian track (technicians/rindwalkers). The probe (`tracks.js`) found it's a **planar impossibility in
2D** on this foam — the interior is road + rooms with *no interstitial tissue* (`interstitialFrac ≈ 0`), and
the concourse *is* the connectivity (remove it → ~130 isolated room-pockets), so a second disjoint
everywhere-reaching network can't also be connected. It doesn't degenerate to a spiral; two such nets just
don't exist in the plane. Blood vessels evade this with the **third dimension** — so the answer is **two
decks** (material deck + pedestrian deck, joined by lifts at each facility). Pinned by
`test/tracks.selftest.mjs` (8). **Resolution A is built** (`deck2.js#twoDeckFactory`): the material floor
(the forge region) + a pedestrian mezzanine (an office over each facility + catwalks over the trunks),
joined by a **corkscrew ramp** at each facility (`rampPoint`, a helix deck 0 → deck 1 — the "weird ramp like
stairs" through the foam; the fulfillment ramp continues to the nave). Isometric view at
`hoop.mino.mobi/forge/stack` (explode slider pulls the two layers apart; packets ride the floor, technicians
the catwalks, cars climb the ramps). Pinned by `test/deck2.selftest.mjs` (9). B (divided concourse) and C
(interstitial corridors) remain alternatives in `TRACKS.md`.

**The rigorous 3D version is built + proven** (`foam3d.js`): a real **volumetric chamber foam** (3D nuclei →
near-neighbour graph) with **two physarum species** (material + pedestrian) grown as **disjoint** networks
that **both reach every facility** — `feasibleIn3D = true`, 10/10 each (vs ~1–3 in 2D), ~88% interface. A 1D
network has codimension 2 in a volume, so it can't separate the space — the complement stays connected and
the second species threads it. Rotatable foamview at `hoop.mino.mobi/forge/foam3d` (gold material net weaving
past cyan pedestrian net, never touching). Pinned by `test/foam3d.selftest.mjs` (13). This is the definitive
answer to the two-track question: it needs the third dimension, and a volumetric foam supplies it.

## Factory formation in 3D — the supply chain stands up (`formation3d.js`)

Once there are floors, formation itself changes. The 2D optimizer laid the supply chain out **radially**
(reclaim/assembly ringing a central hub — `optimizeLayout`). But that hub is a **vertical lift to the nave**,
so in 3D the gradient rotates upright: the chain becomes a **tower**, and gravity gives it a preferred order.
`engineStage()` derives each engine's depth in the forward production DAG (reclaim cut out as the raw source,
so the recycle loop doesn't make it cyclic) — `fulfillment 0 · assembly 1 · refiners 2 · foundry 3 · fluid 4
· reclaim 5`. `formFactory(seed)` stratifies that into floors, bottom-to-top:

```
   ⌂ the nave (product out)
  ─ assembly · finish        ← top: product rides the lift up
  ─ mill·chem·fab·weave · refine
  ─ foundry · smelt          ← hot, heavy
  ─ fluid
  ─ reclaim · raw            ← bottom: waste FALLS here (the decomposer)
```

So raw + heavy sit low (gravity-fed), finished + light rise to the nave, and **waste falls back down** to the
reclaim yards — the loop closes with gravity instead of against it. The honest tradeoff (`stats`): the tower's
**footprint shrinks ~70%** (a compact column, not a wide disc) but **transport rises ~1.5–2.3×** — the climb,
scaled by `kVert` (how dear vertical movement is). On a generation ship **volume is the scarce resource**, so
you build up and pay the conveyor energy; and the dominant flow (product → nave) is vertical anyway, so the
apex placement is free. Live rotatable tower at `hoop.mino.mobi/forge/tower` (climb-cost + explode sliders, a
toggle to the flat 2D disc to see what 3D buys). Pinned by `test/formation3d.selftest.mjs` (14). This composes
with the two decks / two species: each floor can split material + pedestrian, the lift axis carries both.

## Presenting the 3D chunk to the player — plan + section (`/forge/slices`)

The bounded chunk in 3D is a **hexagonal prism** (the 2D hex tile extruded into floors — it still tessellates,
and crucially every horizontal slice is the 2D foam map the player already reads; the "true" 3D foam cell is
the truncated octahedron / Kelvin cell, but its slices aren't a stable map, so the *chunk* stays a prism —
readability over foam-optimality). The hard part the user named — how do you present a volumetric tissue with
built-in pathing and supply webs without it turning to mush — has a biology/architecture answer:

- **Histology**: you understand 3D tissue by **scrubbing 2D slices** with a **localizer** showing where the
  slice sits. A radiologist never sees the whole volume at once.
- **Architecture**: a building is **floor plans** (one per level, each trivial) **plus a section** (the
  vertical cut showing strata + the stairwells/shafts that thread them).

So the player reads **one floor at a time — a 2D map they already know** — and moves between floors through
**portals** (the lift at the chunk centre, the corkscrew ramps). `/forge/slices` is that navigator: **PLAN**
(the current floor's foam map, walkable, @ at the lift) beside **SECTION** (the elevation — strata stacked
reclaim-bottom→assembly-top, the lift threading them, *you-are-here*, "raw ↓ falls · product ↑ rises").
Click the plan to walk, click a floor in the section to jump, ▲▼ takes the lift. The 3D stays legible because
it's N trivial 2D maps + one cut — never a confusing volume. (Presentation layer over the tested kernels:
`formFactory` strata · `solveForgeChunk` per floor · `regionWalk`/`pathFind` for the walk.)

## The reframe — production is the INFINITE interstitium the finite naves float in (`/forge/ship`)

The hex-prism slice navigator (above) is **not** the answer to the production layer — it's only the *local
zoom* (one locale's detail, the capillary-bed scale). The real shape is the opposite of a pipe:

**Naves are finite by design** — little societies, separated, safe, each a carbon-pump lobule (parenchyma).
So the production layer is what naves are EMBEDDED IN: the **interstitium + vasculature** that runs between
and around them, and *that* is what's infinite. The ship is an endless 3D foam; naves are sparse finite
**inclusions** in it; production is the connective medium tiling forever. Infinity belongs to the connective
part precisely because the bounded part (naves) is bounded — they're complements.

This also kills the boring-form problem. You don't read production with floor plans — **you ride the
circulation.** `infinitefoam.js` is the substrate: two interpenetrating vessel lattices — **material
arteries · pedestrian veins** — offset half a cell so they *never touch* (the two-species result, now
infinite and endless), the **naves** hanging off the arteries like organs, the eight verticals **glanded**
along the vessels. The **infinity hook** is the 3D seam contract (the cousin of `econ/record.js`): every hub,
vessel, and nave is a **pure function of its lattice coordinate + the ship seed**, so it streams around the
player forever and any two windows agree on their overlap — no global solve, no bounds, just a windowed read
(`shipWindow(center, R)`). Live at `hoop.mino.mobi/forge/ship`: fly through the ship's circulation (WASD +
Q/E), naves glowing as organs, vessels receding into fog — no edge, in any direction. Pinned by
`test/infinitefoam.selftest.mjs` (13: windows agree on overlap, travel reveals new ship, the two systems
never coincide, naves are a Bernoulli field at the right density).

So the two scales are complementary: **`/forge/ship`** is the infinite circulation (the whole production
layer); **`/forge/slices`** is the local plan+section when you drop into one locale. The pipe was never the
ship — it was the microscope slide.

## Open seams (parked)

- **Energetics (tide) seam** — every hot engine draws from the fixed energy budget; not yet wired.
- **Fixtures + robots** — the logistics droids that ride the grown conduits between chambers.
- **Forge skin in the game** — port `sprites.js`'s fixtures/ambient/material into `skin.js#paintChunk` so a
  forge deck renders in-game the way `/forge/walk` does (the prerequisite for the v099 deck wiring above).
