# mega/v092 — player systems

Live at **mega.mino.mobi/v092**. The painted, streaming O'Neill-cylinder world (cloned from
`hoop/v090`, vendored self-contained) carrying the **player systems** half of the v092 sprint.
The **environmental** half (world/biome/ambient) is being built in parallel and merged at sprint end.

This branch (`claude/mega-v092-systems-llfwfb`) **owns the `mega` surface** (deploy-registry.json).
Every push to `mega/**` ships to production via `deploy-mega.yml`.

## The four systems — and the engines they stand on

The repo already contains the procedural spines. v092's job is to make them **playable**, not to
re-invent them. Determinism is load-bearing throughout (atproto-persistable, permalinkable).

| # | System | Stands on | Status |
|---|--------|-----------|--------|
| 1 | **Inventory** | `mega/sprite/item/` genome + `paint/voronoi.js` `clipCell` | **shipped** — `inventory.js` + `pack.js` |
| 2 | **Item lore engine** | `borges/js/generate.js` (spine generator) + `story/engine.js` (memory/gates) | design |
| 3 | **Combat** | item `strike`/`ward` kingdoms + `potency`/`durability`/`mass`; `story/engine.js` `BASE_ATK/DEF/HP` | design |
| 4 | **Character creation** | the **civic tree** (`econ/econ.js` ROLES ↔ `sprite/item/bindings.js` CIVIC_ROLES) + NPC sprite genome (`mega/sprite/core.js`) | design |

### 1. Inventory (shipped)
A rotating **Voronoi cylinder**: items tiled one-per-seed on an unrolled angle×height strip that
wraps at the seam and is band-bounded by reflections; projected back onto a vertical-axis cylinder so
spinning rolls items through the bright front face. The pack is a plain `item[]` from the shared item
engine — combat spoils, lore sets, and world drops all just mutate the array and the cylinder re-tiles.

### 2. Item lore engine (next)
Items accrue **lore snippets**; certain *sets* of items form a **spine** (a borges-style generated
mini-myth: teller → culture → frame → Propp beats) and completing/holding a recognised set grants a
**mechanical benefit**. Reuse borges' deterministic combinatorial generator to mint the set's story
from the items' genomes (kingdom/material/provenance as the seed inputs); reuse `story/engine.js`'s
MemoryStore to track which lore a player has unlocked. Sets are recognised by genome predicates
(e.g. "three `lore`-kingdom items sharing a material" → *the Archivist's Triad*).

### 3. Combat (design — "a whole can of worms")
Martial items (`strike`/`ward` kingdoms) drive dealing/taking damage. Needs a **stat system** —
intentionally *weird & new, technomagic* — that armor, skills, progression, and skill trees hang off.
The stat model is the **shared spine** between combat and character creation, so it should be designed
once, first. `story/engine.js` already has `BASE_ATK/BASE_DEF/BASE_HP/POWER_THRESHOLDS` as a latent
substrate to extend rather than replace.

### 4. Character creation (design)
Class creation **mirrors the civic tree** (the same ROLES that build towns in `econ/` build people),
and the player **rolls up their own sprite** (the NPC sprite genome in `mega/sprite/` is already a
seed-deterministic, breedable engine) plus weird characteristics. Sci-fi flavored; *everyone is a
little bit robot*, so the trait space can get wacky. The space must be **huge** to stay interesting —
lean on the existing genome breeding (`splice`/`mutate`) for combinatorial depth.

## Conventions
- Self-contained under `mega/v092/`. Vendored hoop deps keep their internal `../v7|paint|econ/` refs
  (they resolve within `v092/`). The shared item & sprite engines are reached at `../sprite/...`.
- No build step, no secrets, no D1/DO — pure static served by the `mega` worker's ASSETS binding.
- Determinism: no unseeded `Math.random()` in generators (permalink/atproto stability).
- Headless-test what you can in node (geometry, genome, layout) before pushing; canvas is proofed on deploy.
