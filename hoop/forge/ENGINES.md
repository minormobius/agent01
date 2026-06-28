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

## Open seams (parked)

- **Inter-engine supply graph** — the ~8 facilities of a forge floor wired to each other (the axial-rail /
  trans-rind transport question the user flagged: "Does the upper rind have axial rail?"). The intra-engine
  flow is done; the inter-engine flow is the next layer.
- **A forge floor** — composing several forge chunks into a bounded floor (the `buildNave`/`buildRind`
  cousin), so the whole upper rind reads at once. The single-chunk roller is the design view; the floor is
  the deployment.
- **Energetics (tide) seam** — every hot engine draws from the fixed energy budget; not yet wired.
- **Fixtures + robots** — the logistics droids that move material between chambers (the FIXTURES.md cousin
  for production lines).
