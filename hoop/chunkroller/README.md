# chunkroller — the chunk-design tool

Live at **hoop.mino.mobi/chunkroller**. A `/econ` cousin aimed at a single **chunk**: roll one, see a
**total top-down view**, a **civic vitality readout**, **NPC stats**, and **biome sliders that bias room
creation**. Pure static, no build — it imports the real game engine, so what you see here is exactly what
the game grows.

## What it shows

- **Total chunk view** — `solveChunk()` (the live `v099/v8/chunkgen.js`) rendered top-down: cells coloured
  by lens (role / domain / tier / social thickness / bridges-vs-bonds), roads, ports (gold = new seam,
  teal = inherited), and a role glyph per room. Toggle the **supply web** and the **social fabric**.
- **Civic vitality** — the **econ** kernel (`buildSociety`/`socialMetrics`/`scoreSociety`) run over the
  chunk's rooms (the chunk and an econ "place" are the same vocabulary). Vitality 0–100 + tier
  (Thriving…Failing) + the seven signals (closure, thickness, weave, bridges, third-places, employed,
  resilience). The same oracle `/econ` uses.
- **NPC stats** — each resident gets a FLESH·CHASSIS·ANIMA block (`stats.js#rollCharacter`, keyed to their
  vocation); the rail shows the chunk's mean triad + cast histogram, and clicking a room lists who's there
  with their full attribute blocks + the room's removal **shock** (orphaned / ties cut / needs at risk).

## Biome sliders — the lever

Room creation is biased through the engine's **additive `roleMix` override** (`v099/v7/foam.js`
`drawRole`/`castCharacter`, default = the wild-type `ROLE_MIX`, so the live game is unchanged). The seven
**characteristic sliders** (Homes · Industry · Greenery · Lore · Leisure · Care · Order) reweight the mix;
a **biome** is a named slider preset (The Commons, Market Ward, Garden Terrace, Foundry Row, Cloister,
Civic Seat, Dormitory). A biome may also steer the **grand anchor** roles (the civic centrepiece a big
pocket plants). Moving the sliders genuinely changes what the chunk grows — and the civic readout responds.

## Two views

- **▣ one chunk** — the single-chunk design view (above). The **ports/side** slider tunes the seam density
  (max concourse ports per *direction*, 1–4) via the engine's `portRange` + `sideOf` — turn it down for
  fewer chunk-to-chunk crossings. **Ports are allocated per SIDE (direction), not per segment**, so a
  tessellation shape's ~30 boundary segments still get a few ports total (e.g. 6 at ports/side=1), not one
  each. The **size** slider scales the chunk (1–2.5×; bigger = more rooms/cells, see perf below). **▰
  tessellation shape** fills an editor-exported shape (`shapes.js`) instead of a perfect hexagon, so you
  see the deformed, tessellating outline as a real chunk. The **tension** slider discourages long skinny
  edge rooms (see below); the readout shows room aspect avg/max + the skinny count.

## ⚡ v2 chunk — one toggle, four bundled changes

The **⚡ v2 chunk** checkbox flips the chunk to a new model in one click, bundling:
1. **Tessellation shape** — fills the editor-exported tile (no perfect-hex seams).
2. **25% bigger** (1.25× linear) — more room for variety + the role floors.
3. **One of each building type** — `roleFloors` plants ≥1 of every role before filling the rest.
4. **Rooms-first pathfinding** (`v099/v7/roomsfirst.js`) — the real refactor. v1 grew the concourse by
   **cell** hypoxia (`seize`) then carved rooms from the leftover tissue, so rooms were an afterthought
   and the rim left slivers. v2 **partitions the whole interior into rooms up front** (footprint-weighted
   graph-Voronoi + role floors + surface tension), then grows a **minimal concourse that reaches every
   ROOM** — seeded at the ports, Prim-grown until every room borders road, each room guaranteed a door
   onto one connected concourse. Oxygen to *rooms*, not cells. Two boundary conditions matter:
   - **The concourse only paves `canRoad` cells — never the rim, except at the ports.** So the perimeter
     belongs to *rooms* (you meet rooms on the edge), and the concourse is forced inward instead of
     looping around the outside. Measured: ~90% of the perimeter is rooms; only the ports touch the edge.
   - **The concourse widens to a 2-wide minimum** (`concourseWidth`, default 2, via the shared
     `widenOneSided`) so corridors are ribbons, not hairlines.

Same record contract as v1 (`buildWalk` runs unchanged) — verified in `test/roomsfirst.selftest.mjs`
(every room reachable from a port through its door, road one component, ports on road, one-of-each).
Measured v1 → v2 on a sample chunk: building types **9 → 13**, avg room aspect **2.2 → 1.27**, skinniest
**7.6 → 3.4**, road footprint **38% → 14%** (a thin corridor, not space-filling), and it's *faster*
(~430 → ~370 ms — no hypoxia loop). Default (no `v2` flag) is byte-identical, so the live game is untouched.

> Note: v2 makes many small rooms at `roomSize 14` (~120 over a 1.25× chunk); bump `roomSize` for fewer,
> bigger rooms. The solver is the engine piece to wire into the live v099 game next.

## Surface tension — discouraging long skinny edge rooms

The rim tissue forms thin pockets that read as long skinny rooms — and the worst are slivers hemmed in by
the concourse, with no room neighbour to merge into and (being 1-wide) no width to redistribute. The
engine's new `tension` option (0..1, additive, default 0 → unchanged) relieves this in `paintRooms`:
- **Pass A** — a skinny room that touches another *room* merges into the chunkiest neighbour (the interior
  room reaches out to the edge).
- **Pass B** — a skinny room hemmed in by *concourse* grows into adjacent road cells, one at a time toward
  the most compact shape — "reaching into the corridor." Guarded: never takes a port cell, and never a road
  cell whose removal would disconnect the concourse (so the corridor network stays whole).

Skinniness is the per-room PCA aspect ratio (long axis / short). Measured: tension 0.8 on a sample chunk
took the worst room from aspect **12.8 → 5.4** and average **3.08 → 2.26**, road still fully connected,
solve cost +~13%. Node-tested in `v099/test/tension.selftest.mjs`.
- **⬡ bounded floor** — a finite hand of ~7–10 chunks grown off the real tiler, each painted by its
  **ward biome**, the **edge tiles** drawn as a gold sealed rim, and **☮ floor 1 — no baddies** on the
  readout. Click a ward → its civic vitality. The model lives in `floor.js`:
  - **chunk biome** — `chunkBiomeAt(floorSeed, cx, cy)` deterministically assigns a biome per chunk
    position, so a floor grows varied wards reproducibly (atproto-stable).
  - **bounded floor** — `growFloor(seed, {count, depth})` grows exactly `count` chunks compactly from the
    origin via `manager.js` reflection (the same tiler the game streams with), then stops.
  - **edge tile** — once growth stops, every chunk edge with no neighbour (`edgeFree`) is a frontier the
    floor SEALS: an edge tile, the floor's wall, instead of a streaming seam.
  - **no-baddies floor 1** — `noBaddies` (depth === 1) rides on the floor: the per-floor creature gate.

## Files

| File | Role |
|---|---|
| `index.html` | scaffold (rail of controls + readout, canvas stage) |
| `chunkroller.js` | controller — both views, render, readout, click dossier/ward |
| `biomes.js` | the sliders + `mixFromSliders` (rollup → biased `ROLE_MIX`) + the named biomes + tints |
| `civic.js` | `fieldFromRooms` (adapt chunk rooms → econ `field`), `scoreChunk`, `npcRoster` |
| `floor.js` | `growFloor` (bounded floor), `chunkBiomeAt` (ward assignment), edge tiles, no-baddies flag |
| `tess.html` + `tess.js` | the **tessellation editor** (`/chunkroller/tess`) — drag edges, preview the tiling, export JSON |
| `tessgen.js` | the tessellation kernel: deform 3 edges → opposite 3 follow (reverse+translate) → always tiles |
| `shapes.js` | bundled tessellation shapes (paste an editor export) + `shapePoly` (→ solveChunk `poly`) |
| `stability.js` | the room-distribution model: `evaluateMix`/`stabilityScore` (sampled vitality) + `solveStableSliders` |
| `test/stability.selftest.mjs` | 12 checks — sampler determinism, all-homes < balanced, the solver never worsens stability |
| `test/civic.selftest.mjs` | 20 checks — slider rollup, the civic field over a real chunk, NPC stats, biome biasing |
| `test/floor.selftest.mjs` | 17 checks — deterministic floor, edge tiles seal the rim, ward variety, no-baddies gate |
| `test/tess.selftest.mjs` | 17 checks — deformed edges keep zero tessellation gap; export round-trips |

## Stability model (backing the room distribution)

The biomes are no longer just hand-tuned sliders — `stability.js` is a model behind them. It estimates a
role-mix's civic stability by **sampling** synthetic rooms from the mix and running the real econ vitality
oracle over several seeds: mean **vitality** + **fragility** (how often the society tips Fragile/Failing).
The rail shows the modeled tier alongside the live chunk's. **⚖ solve for stability** hill-climbs the
sliders toward stability while keeping the biome's emphasized sliders above a floor (so a Dormitory stays
a dormitory but becomes as stable as that character allows — e.g. 63·Stable/40%-fragile → 74·Healthy/0%).
Deterministic from the seed; node-tested (the solver never lowers the stability score).

## Perf — making chunks bigger

Measured (`solveChunk`, node, roomSize 14):

| size | region | cells | rooms | solve |
|---|---|---|---|---|
| 1× | 900×600 | ~780 | ~40 | ~285 ms |
| 1.5× | 1350×900 | ~1775 | ~84 | ~490 ms |
| 2× | 1800×1200 | ~3180 | ~142 | ~850 ms |
| 2.5× | 2250×1500 | ~4960 | ~218 | ~1435 ms |

Cells scale ~**quadratically** with linear size (it's area); solve time tracks cells roughly linearly.
Bigger chunks **reduce the seam problem** (fewer chunk boundaries on screen — the thing the tessellation
editor also attacks) at these costs: (1) longer **generation latency** per chunk — but that runs in a Web
Worker off the main thread, so it's streaming lag, not framerate; (2) a larger **one-time paint bake** per
chunk (`skin.js`), again off the hot loop; (3) more **memory** per chunk. Per-frame cost (the raster blit +
residents + fog) is roughly flat, and you have *fewer* chunks loaded at once, which partly offsets.
**Verdict: 1.5× is a safe sweet spot; 2× is viable if ~850 ms streaming latency/chunk is acceptable.**

## ✎ Tessellation editor (`/chunkroller/tess`)

Ends the **obvious perfect (straight) edges** by letting you drag a hexagon's edges into weird shapes that
**still tessellate**. The trick: a hexagon tiles by *translation* when each edge equals its opposite edge
translated. You drag the three editable edges (0–2); the opposite edges (3–5) are computed as their
reverse-and-translate partners, so the tile tessellates **no matter how strange the edges get**
(`tessgen.js` proves the seam gap stays zero). Faint translated copies preview the seamless tiling. The
**⤓ export JSON** button downloads the deformed shape (`hoop.chunkshape.tessellation`: base hex + edit
offsets + the closed boundary polyline + the lattice) — JSON-adjacent and re-loadable.

> Note: the live game tiler is *reflection*-based (straight edges); a translation tile is a separate tiling
> mode. The editor + export come first; wiring the exported shape into generation is the next step.

Engine reuse (no fork): imports `solveChunk` (`v099/v8`), `createWorld`/`neighbourSpec`/`edgeFree`
(`v099/v8/manager`), the econ kernel + `ROLES`/`ROLE_MIX` (`v099/econ`), `rollCharacter` (`v099/stats`),
`asSeed` (`v099/crew`), `TRAFFIC_FOOTPRINT`/`GRAND_ROLES` (`v099/rooms`).

## Next — wiring it into the live game

The model is proven in the tool; the remaining work is grafting it onto the live world:
- **chunk biome on the chunk record** — have the game's streamer call `chunkBiomeAt` + pass the biome's
  `roleMix` to `solveChunk` (and later steer palette/creatures by biome).
- **bounded floor 1** — make the game's first floor a `growFloor`-style finite set with sealed edge tiles,
  instead of endless streaming; render the edge tiles as real walls.
- **no-baddies gate** — read `floor.noBaddies` in the creature-spawn path so floor 1 spawns none.
- **footprint sliders** — bias room SIZE (not just function) via `solveChunk`'s `footprint` map.
