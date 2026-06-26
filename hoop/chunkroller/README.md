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

## Files

| File | Role |
|---|---|
| `index.html` | scaffold (rail of controls + readout, canvas stage) |
| `chunkroller.js` | controller — solveChunk → render → readout → click dossier |
| `biomes.js` | the sliders + `mixFromSliders` (rollup → biased `ROLE_MIX`) + the named biomes |
| `civic.js` | `fieldFromRooms` (adapt chunk rooms → econ `field`), `scoreChunk`, `npcRoster` |
| `test/civic.selftest.mjs` | 20 checks — slider rollup, the civic field over a real chunk, NPC stats, end-to-end biome biasing |

Engine reuse (no fork): imports `solveChunk` (`v099/v8`), the econ kernel + `ROLES`/`ROLE_MIX` (`v099/econ`),
`rollCharacter` (`v099/stats`), `asSeed` (`v099/crew`), and `TRAFFIC_FOOTPRINT`/`GRAND_ROLES` (`v099/rooms`).

## Roadmap (the maps work this seeds)

This tool is the design surface for the broader map plan:
- **chunk biome** as a first-class chunk property (here it's a tool-side bias; next it rides on the chunk
  record + steers palette/creatures).
- **edge tiles + bounded floors** — floor 1 bounded to ~7–10 chunks needs an edge-tile concept (a chunk's
  outer seam that closes the floor instead of streaming on). chunkroller is where to prototype the look.
- **no-baddies floor 1** — a per-floor creature gate; the civic readout here is how we tune floor 1 to read
  as a flourishing, safe society.
- **footprint sliders** — biasing room SIZE (not just function) via `solveChunk`'s `footprint` map.
