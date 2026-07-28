# Chapter One — story-progression audit (Hoopy's proposal vs. v098)

> **Reference doc.** Tracks Hoopy's "story progression proposal" (`site.standard.document`
> `at://did:plc:vw4e7blkwzdokanwp24k3igr/.../3mp3hikcs3c2j`, *"Chapter One — gameplay
> loop & division of labor"*) against what the v098 client actually does. **No code was
> changed for this audit** — it's the spec for the v099 progression build.
>
> Status legend: ✅ matches · 🟡 built, off-spec · 🔴 not built · 🔧 correction to the proposal.

---

## The loop (Hoopy's spec, condensed)

Wake in a **fixed room** with a **fixed anchor**. The anchor gives background + an
*exploratory* quest ("go see the world, learn enough to answer my questions"). You explore,
crystallize features, uncover lore. When you've covered enough, the anchor **pages you back**;
you **answer (multiple choice)**; the answer moves you to the next deck/zone. Repeat across the
anchors, then a **final chamber** for a **final choice** that ends the chapter.

Geography **escalates** (Nave → upper rind → lower rind → Signal Chamber) — not a stack of
identical decks. Each deck should be a **distinct biome**: room types and creatures that only
appear on certain decks; physically and experientially separate.

### The ladder (🔧 corrected — Luna is a governor, not an NPC)

| Stage | Anchor | Faction lens | What the anchor IS |
|---|---|---|---|
| 1 Arrival | **Olo Vashti** | The Drift | NPC (walk to, talk) |
| 2 Orientation | **Factor Solen** | Continuants | NPC |
| 3 Investigation | **Sevin** | Rind-walkers | NPC |
| 4 Convergence | **Luna** | The Seven | 🔧 **the mythograph TERMINAL, not an NPC.** Luna is one of the seven immortal ship-governor robots; she enters the story *through the terminal* (the frozen page-71 mythograph, "Luna posted this. The hero is you."). Stage 4's "return to your guide" = **read Luna's translation at the console**, not meet a person. |
| 5 Resolution | *(none)* | — | the final decision chamber |

So Chapter One needs **3 anchor NPCs** (Olo/Solen/Sevin, stages 1–3) + **the terminal** (Luna,
stage 4) + **the chamber** (stage 5). All three NPCs exist in his `world_export`; Luna↔terminal
is already wired in v098.

### Decisions locked (Hoopy)

- All advancement + paging is **deterministic and the client's**. No LLM in the loop.
- **Gate = specific held story state** (`advance.js` flag milestones: `met_olo`, `read_terminal`,
  `sevin_believes`, …), with XP/exposure as fallback. **Not** a raw crystallized-feature count.
- **Answers = pre-generated multiple choice.** They accumulate into save state and **do not gate
  progression** (progression and consequence are decoupled — you always advance; what you say
  shapes the ending). Future: lock options behind lore via the `requires` gate.
- **Final deck is special.** At `narrative_tier == 4` the client publishes a **high-priority
  atproto event**; the engine computes resolution options + consequence text from the accumulated
  answers while the player explores the final zone → final page → chamber → choice → ending.
- **Verdict = one record per player**; answers ride along as evidence (or are pulled from player
  state).

### Division of labor

- **Client (us):** map/geometry/deck · tier advancement (`advance.js` milestones, 3 axes) ·
  paging (storyboard markers) · the anchor MC answer sets · accumulating answers into save ·
  firing the `narrative_tier == 4` event · persisting `story.save`/`story.pulse`.
- **Engine (Hoopy):** the content **pool** (spine) generated/replenished offline by tier · the
  **one** async LLM job (final decision → resolution options + consequence → `story.verdict`) ·
  the existing async surfaced via verdicts (`resolve_input`, rumor mill `cluster_drift`,
  enrich/regen + retcon cascade) · ingesting `story.save` via `_project_save` for replenishment.
  **Never advances tiers.**

---

## Audit

### ✅ Already matches

| Item | Where |
|---|---|
| 5-stage ladder, 1:1 with his stages + `rev` rungs (Arrival→Resolution, The Ordinary→The Purpose) | `story/decks.js` `DECKS` (nave/curve/rind/approach/bay14) |
| Deterministic, client-owned advancement; engine LLM off in the hot path | `story/llm/` adapter (disabled), inference-free `engine.js` |
| Flag-milestone machinery (narrative 1→2 gates on `met_olo`+`read_terminal`+`sevin_believes`); more derived from his plot_beats' `completes_when` | `story/advance.js` `MILESTONES`/`checkAdvance`; `story/progression.js` |
| `story.save`/`story.pulse` persistence; engine ingest via `_project_save`; `story.verdict` consume (retcon/rumor); `poolCensus` depletion signal | `story/atproto.js`, `story/verdicts.js`, `story/engine.js` |
| The 3 anchor NPCs exist in his export; **Luna↔terminal already wired** (page-71 mythograph) | `world_export.json` (Olo/Solen/Sevin); `index.html` `renderTerminalPanel` |

### 🟡 Built, but off-spec

1. **Anchors: 3 *generic* guides, cycled — not 3 *named* NPCs pinned to stages + the terminal for
   stage 4.** `deriveOpeningCast` takes the 3 lowest-tier NPCs *by id*; `guideForTier` cycles them
   `mod 3`. Need: Olo→1, Solen→2, Sevin→3 explicitly, **terminal→4**, **chamber→5**.
   *(`story/progression.js` `deriveOpeningCast`, `story/decks.js` `guideForTier`.)*
2. **Paging is COUNT-based; he says don't gate on a count.** `checkHoopy → assess()` pages when
   `learnedForDeck ≥ deck.learn.count` (4/5/5/5/5 themed crystallizations). His gate is the
   per-deck **milestone flags**, count as fallback only.
   *(`index.html` `checkHoopy`; `story/hoopy.js` `assess`.)*
   - ⚠️ **Reframes recent work.** `ensureDeckSupply` (the unsolvability patch) exists *only* to
     feed that count. Under flag-gating it should become "ensure the deck's *gating* sources
     (meet Olo / read terminal / convince Sevin) are reachable" — which is the honest shape of the
     `solveDeck` oracle. The count supply can stay as a soft fallback or retire.

### 🔴 Not built

3. **Answer accumulation.** No store collects the player's MC answers to anchors as evidence.
   Need: an `answers` map in `story.save`, fed by anchor choices, **decoupled** from advancement.
4. **Anchor MC answer-sets.** The 3 anchors need pre-generated MC prompts whose selections
   accumulate (future: `requires`-gated options).
5. **Final-deck event.** Nothing fires at `narrative_tier == 4`. Need a high-priority atproto
   record/flag the engine watches to compute the resolution.
6. **Final chamber / resolution / ending.** No Signal-Chamber scene, no consumption of the
   engine's resolution options + consequence text, no final choice or ending.
7. **Distinct biomes per deck.** Decks differ by `gen` (tint/roleBias/density) + the rind shaft,
   but not by deck-specific room-type/creature palettes. He wants each deck physically and
   experientially separate.

---

## Suggested build order (v099)

- **P0 — Pin the anchors:** Olo/Solen/Sevin → stages 1–3 (faction lens each); **terminal → stage
  4** (Luna's translation); **chamber → stage 5**. The spine everything hangs on; tightens the
  discover→promote flow.
- **P0 — Flip paging to flag-gated** (per-deck milestone flags; count as fallback). Re-targets
  `ensureDeckSupply`/`solveDeck` from "promote N themed NPCs" to "the gating sources are reachable."
- **P1 — Answer accumulation + anchor MC sets** (small `answers` map in `story.save`, decoupled
  from advancement).
- **P1 — Final-deck event** (tier-4 high-priority record) + **resolution-verdict consume** + the
  **final chamber/choice/ending** scene.
- **P2 — Distinct biomes per deck** (per-deck room-type + creature palettes over the `gen` params).

### Open items needing Mobius's call

- Keep the **count gate as fallback**, or retire it once flags are wired? (Decides how much of the
  recent supply patch stays.)
- Confirm **anchor tiers** in his export (Solen has only 3 mentions — verify it's a full NPC with a
  dialogue tree, not just lore references).
- The **answers → verdict** transport: ride them in the tier-4 event, or let the engine pull them
  from `story.save`? (He's fine with either.)
