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

- **▣ one chunk** — the single-chunk design view (above).
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
| `test/civic.selftest.mjs` | 20 checks — slider rollup, the civic field over a real chunk, NPC stats, biome biasing |
| `test/floor.selftest.mjs` | 17 checks — deterministic floor, edge tiles seal the rim, ward variety, no-baddies gate |

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
