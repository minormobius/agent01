# mega/v093 — the synthesis (v091 × v092)

Live at **mega.mino.mobi/v093**. The sprint-end merge promised by `mega/v092/DESIGN.md`:

> *"The **environmental** half (world/biome/ambient) is being built in parallel and merged at sprint end."*

v092 shipped the **player-systems** half on a clone of hoop v090's painted world. v091 (`hoop/v091/`)
shipped the **environmental** half — the world generation reforms — on the live hoop surface. v093 is
the two halves folded together: **v092's systems set inside v091's lived-in world.**

## What came from where

| Layer | Source | Files in v093 |
|-------|--------|---------------|
| **World engine (upgraded)** | v091 | `v7/foam.js`, `v8/chunkgen.js`, `v8/manager.js` — `paintRooms` gains traffic `footprint` / `grand` anchors / `minRoom` bulldozing; `buildWalk`/`pathFind`/`nearestNode` gain optional **impassable** nodes. All backward-compatible opt-ins. |
| **World painter + content** | v091 | `skin.js` (voronoi-grown wall fixtures, self-emitting components, bollard concourse lights), `consoles.js` (`drawWallFixture`), `rooms.js` (`TRAFFIC_FOOTPRINT`, `GRAND_ROLES`, `MIN_ROOM`, `MAX_FIXTURE_AREA`), `npc.js` (half-scale residents + boids separation + per-agent in-room anchors). |
| **Player systems** | v092 | `stats.js` (FLESH·CHASSIS·ANIMA spine), `inventory.js` + `pack.js` (Voronoi-cylinder), `character.js` + `crew.js` + `bodyplan.js` + `equipped.js` (civic-tree creation + stained-glass figure), `arena/` (turn-based technomagic combat). Unchanged from v092. |
| **Shared engines** | mega root | `../sprite/item/*`, `../sprite/*` reached the same way v092 reached them (relative `../sprite/…`). |

The two feature branches touched a **disjoint** set of files except the world backbone
(`index.html` / `skin.js` / `npc.js` / engine), which is why the merge is clean: v092's vendored
engine was a *verbatim* v090 clone, so v091's engine upgrades drop straight in.

## The wiring in `index.html`

v092's index.html is the base (it carries all the player-systems plumbing — the embarked player
sprite, NPC stat blocks via `crewStats`→`deriveCombat`, `give_items`→pack, the pack/character/equip/
arena HUD). The v091 environmental layer is spliced onto it:

- imports `drawWallFixture` (consoles) + the `rooms.js` traffic/fixture constants;
- `SKIN` carries `fixtureArea: MAX_FIXTURE_AREA`; `opts()` passes `footprint`/`grand`/`grandMin`/`minRoom`;
- `restitch()` builds the walk graph with `blockedOf` (impassable fixtures); `computeBlocked` derives
  the blocked set from each chunk's painted fixtures + components, skipping doors and the concourse;
- `walkTo` targets `nearestNode(…, true)` so a click never routes onto a fixture;
- `drawPainted` renders the wall fixtures, the components' emissive bloom, and bollard concourse lamps;
- residents render at **half scale** and `stepResidents` runs with separation (`sep`/`sepMax`).

So a soul you click is statted by v092's spine (`crewStats`→`deriveCombat`) while standing in a
v091 traffic-sized room beside a v091 impassable console. That cross-link — the same resident is both
an environmental agent and a combat-able character — is the seam the synthesis closes.

## The minimap + waypoint (alt-screen `m`)

`minimap.js` adds a high-level **MAP** alt-screen (same overlay pattern as the pack/character/equip
screens) plus the geometry the main map shares:

- **Big picture** — every generated chunk's outline (the extent ahead) with the **seen** cells painted
  in two tones (concourse brighter than rooms): *where you've been*. The explored raster is cached and
  only rebuilt when the world grows or more is revealed.
- **Quest interactions** — the civic/third-place rooms (`QUEST_ROLES`: govern/worship/learn/serve/
  trade/heal/play/make) from `buildSociety`, drawn as diamonds: *where the interactions are supposed to
  be*. Faint until discovered, solid + glyph once their cells have been seen.
- **Waypoint** — click the minimap to drop one (click it again, or the header button, to clear). It
  persists across reloads (`mega:v093:waypoint`).

The main map then carries a **persistent direction indicator** (`drawWaypoint` in index.html):
**direction only** while the waypoint is off-screen — an arrow pinned to the screen-edge inset on the
bearing from the player, with a distance read — and the **marker itself** the moment the waypoint rolls
into the viewport. The fit transform, the on-screen test, and the off-screen edge-clamp are pure,
exported from `minimap.js`, shared by both surfaces, and pinned by `test/minimap.selftest.mjs`.

## Conventions (inherited from v092)
- Self-contained under `mega/v093/`. Vendored world deps use internal `./v5|v7|v8|v3|paint/` refs; the
  shared item & sprite engines are reached at `../sprite/…`.
- No build step, no secrets, no D1/DO — pure static served by the `mega` worker's ASSETS binding.
- Determinism is load-bearing (atproto-persistable, permalinkable): no unseeded randomness in generators.
- Headless test: `node mega/v093/test/v093.selftest.mjs` proves both halves coexist over one chunk
  (traffic sizing + fixtures + impassable routing + residents stepping + the systems statting them).
