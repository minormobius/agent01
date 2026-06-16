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
| 0 | **Stat spine** (FLESH·CHASSIS·ANIMA) | new — `story/engine.js` `BASE_HP/ATK/DEF` baseline | **shipped** — `stats.js` |
| 1 | **Inventory** | `mega/sprite/item/` genome + `paint/voronoi.js` `clipCell` | **shipped** — `inventory.js` + `pack.js` |
| 4 | **Character creation** | the **civic tree** (`v3/sprite-core.js` ROLES = civic verbs) + the stat spine + NPC sprite genome | **shipped** — `character.js` |
| 2 | **Item lore engine** | `borges/js/generate.js` (spine generator) + `story/engine.js` (memory/gates) | design |
| 3 | **Combat** | the stat spine (`deriveCombat`) + `CONVERSIONS` (skills) + equipped weapon/armour | **shipped** — `arena/` (turn-based) |

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

### Crossover & polish (shipped)
- **Equipped page** (`equipped.js` + `bodyplan.js`, `e` key) — a **stained-glass Vitruvian figure**: each
  body region is shattered into lead-came Voronoi shards tinted by the item equipped to its slot.
  `bodyplan.js` is the **hook** for alternate body plans (two heads, wheels-for-legs, a shoulder cannon
  = new regions/slots; the tiler + renderer consume any plan). `slotForItem` maps kingdom/phylum → slot;
  `autoEquip` fits the best in-slot item from the pack. First pass: humanoid, auto-equipped.
- **Keys** — the `key` phylum (`taxa.js`, `loot:false` so never random loot) + a `key` sprite primitive
  (toothed key low-tech, eye-stamped access wafer high-tech). NPCs that `give_items` now drop real items
  into the Voronoi pack via `itemFromGrant` (the Keeper's Key works end-to-end); items carry `lore`.
- **Sci-fi slider** — the pack's `techMean` is 0.8 (generation-ship, not smithy): species names + sprite
  cues read sci-fi (Vibroblade / Carapace / Dataslate) at the top two eras.
- **Style guide** — `crew.js` `crewSprite` recolours the body to the **profession's canon hue** (per
  NPC-SPRITES.md §4) so a figure reads as its vocation; the player uses it. `crewStats` mints a cheap,
  deterministic FLESH·CHASSIS·ANIMA stat block for **any** soul — surfaced in the NPC story panel.

### ③ Arena — turn-based combat (shipped)
A wing at **`mega.mino.mobi/v092/arena/`** (linked from the world's ⚔ button). Your saved character's
sprite — with its best weapon/armour auto-equipped from the pack feeding `deriveCombat` — fights 1–2
NPC crew on an art-deco chamfered board. A turn = an optional **move** (tap a gold-ringed tile, range
from Speed) + an optional **action**: **Strike**, or a Flux-fuelled technomagic move from the
`CONVERSIONS` (**Overclock** power-strike, **Mend** heal, **Harden** guard). `arena/engine.js` is the
pure, seeded, node-tested combat engine (hit/crit/variance, initiative by Speed, basic enemy AI that
closes + strikes, win/lose). The page is a renderer + tap-input over it. Basic now; baroque later
(no item-specific move-sets, single board, melee-only — all natural extensions of the engine).

## Conventions
- Self-contained under `mega/v092/`. Vendored hoop deps keep their internal `../v7|paint|econ/` refs
  (they resolve within `v092/`). The shared item & sprite engines are reached at `../sprite/...`.
- No build step, no secrets, no D1/DO — pure static served by the `mega` worker's ASSETS binding.
- Determinism: no unseeded `Math.random()` in generators (permalink/atproto stability).
- Headless-test what you can in node (geometry, genome, layout) before pushing; canvas is proofed on deploy.
