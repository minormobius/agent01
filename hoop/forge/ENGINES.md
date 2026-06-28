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
   **logistics hub** (`engines.js`, `logistics: true`, excluded from the production pick), placed at the
   region's hub chunk (one per ~8 chunks). It is the **rind↔nave conduit**: assembly's **product** flows to
   it and rides **up** the lift to the **NAVE node** (the living deck above); the nave's worn goods come
   **down** as **waste** to the reclaim yards. The nave lift is a strong bidirectional trip, so physarum
   grows it as a bright vertical trunk. Given the region's assembly throughput it reports the crew it can
   supply (`~180 / assembly line`) — the forge supplies a whole nave.
4. **The emergent axial-rail.** Because the heavy long-haul demand is *inter-chunk* supply + the nave lifts,
   the trunk arterials physarum reinforces **span chunk seams** — the trans-rind transport ("Does the upper
   rind have axial rail?"), grown from what the rind moves, not drawn. **It tiles**: 7 → 19 → larger,
   unchanged.

Live at `hoop.mino.mobi/forge/region`; pinned by `test/region.selftest.mjs` (25 checks: seamless seams, a
**carved** concourse whose road cells are expropriated from rooms, the supply loop matching emitter→consumer
and spanning chunks, a fulfillment center bridging to a linked nave node, a tiered conduit network with a
nave lift and seam-crossing trunks, deterministic, scales to 19, single-chunk mode for the facilities page).

## Open seams (parked)

- **Energetics (tide) seam** — every hot engine draws from the fixed energy budget; not yet wired.
- **Fixtures + robots** — the logistics droids that ride the grown conduits between chambers (the
  FIXTURES.md cousin for production lines).
- **The carve as game floor** — the carved road is in the packed record (`rec.road`); wiring a forge region
  into the v099 game as a playable deck (the nave/rind cousin) is the deployment step.
