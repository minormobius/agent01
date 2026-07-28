# The Story Spine — decks, hoopybot, and the climb

This is the architecture hoopy sketched, now wired. The story is a **climb through
five hand-written decks**, paced by an inference-free leveling oracle.

## The loop

```
awaken on a deck  →  explore (encounter its people/lore)  →  hoopybot judges you've
   ▲                                                            learned enough of the
   │                                                            RIGHT things
   │                                                                 │
   └──  return to your guide  ←  PAGED (custom message)  ←───────────┘
        (advances narrative_tier, gives next deck's guidance)
```

1. **Awaken** on a deck at your guide, who gives a hook (`decks.js` `hook`). The
   deck's hand-written **character** fills the screen on arrival.
2. **Explore.** Every entity you meet shows its description (the Qud-style encounter
   card) and is tracked.
3. **hoopybot** (`hoopy.js` `assess`) watches your encounters against the deck's
   **learning goal** — encounter `count` distinct things themed to this deck (its
   tags / revelation rung, `decks.countsForDeck`). When met, you're **paged**: a
   customized center-screen message tells you what you learned and to return to your
   guide.
4. **Return to your guide.** Talking to them while paged **grants the level**
   (`narrative_tier++`), and they give the next deck's guidance. Proceed; cycle.

## The two axes (deliberately split)

- **`revelation_tier`** — how much of the *world* you understand. Exploration-driven
  (encounter-XP floor, `engine.js`). Auto. Gates which world content surfaces.
- **`narrative_tier`** — how far the *story* has carried you. **hoopybot's** —
  advanced only by learning enough and reporting to your guide. This is the
  human-designed spine; it's the one the 5 decks map to, and it lifts the opening
  seal (narrative ≥ 2) and unlocks the descent.

`power_tier` stays XP-driven (combat scaling), untouched.

## Files

| File | Role |
|---|---|
| `decks.js` | The 5 hand-written decks ↔ narrative tiers (character, hook, learn goal, gen-stats). `deckForTier`, `nextDeck`, `countsForDeck`, `guideForTier`. |
| `hoopy.js` | The leveling oracle. `assess` (learned/needed/ready), `levelMessage` (the customized page), `learnedForDeck`. |
| `index.html` | Wiring: `checkHoopy` (page when ready), `grantLevelAtGuide` (advance at your guide), `showDeckCard` (arrival), the deck/hoopy HUD readout. |

The decks correspond to his export's real tag distribution per narrative tier
(Arrival/Nave → Orientation/Curve → Investigation/Rind → Convergence/Approach →
Resolution/Bay 14), so each deck's learning goal is satisfiable from the content
actually authored for that tier.

## Side quests (deterministic) — SHIPPED

The same hook → learning-goal → resolution paradigm, run **without inference**, in
`story/quests.js`. Every `rumor` (80 in the export) is a seed. You don't stumble on
rumors directly — the **people you meet tip you to them**: meet an NPC and they
mention a rumor that shares their world (theme overlap, `pickQuestForNpc`). That
opens a thread; chase the theme (encounter a few more things tagged like it,
`questProgress`) and it **resolves**, paying coins into the same economy the arcades
feed. ~80 threads preparable, surfaced by ~118/120 NPCs; the n-th quest is identical
on every machine (the seed id is the permalink). Tracked as facts (`sq.on.<seed>` /
`sq.done.<seed>`); the **journal** (`j`) shows open threads with progress + resolved
ones. Pinned by `test/quests.selftest.mjs`.

`story/genquest.js` (the inference weave lane, Gemini, gated) remains as the optional
*authored-feeling* alternative; it's dormant until `GEMINI_API_KEY` is set. The
deterministic generator is the default and needs no key.

## Load-bearing NPC quests — the flag spine (`deckquest.js`) — MECHANISM SHIPPED

> **Shareable spec + live demo:** [`hoop.mino.mobi/v105/spine`](/v105/spine) (`story/spine.html`) — the
> loop, the pieces table, the five decks, and an **interactive deck-stacking visualizer** that runs the
> real modules (drag patience/safety and watch the ripe-marker jump). Served via `worker.js`.


hoopy's refinement of the climb: **one load-bearing NPC per deck**, who **blocks advancement to the
next deck**. They give an *informational* quest — *"gather lore until the following flags are set."* The
flags are set by the **lore you gather**: a content item may carry a flag, set the moment you
**crystallize** it. When every prerequisite flag is held the quest is **ripe**; the NPC **pages** you;
the next time you talk to them a **previously hidden dialogue tree** opens (gated by the same flag
mechanism) and lets you finish — which advances the deck.

The whole loop is mechanised; hoopy authors the **content** (the flags, the lore that fires them, the
NPC prose). Where each piece lives:

| Step | Where |
|---|---|
| A lore item DECLARES a flag | `produces.sets: ['flag.curve_a', …]` on the content item (same field `gates.js` reachability-checks) |
| Crystallizing it SETS the flag | `engine.js#applyProduces` — fires once on first touch (bindAndLevel), reported as `intro.leveled.flags_set`. **Live now**, automatic everywhere `interact` runs |
| A quest = required flags + latches | `deckquest.js#buildDeckQuest(deck, content)` — authored `deck.quest.flags`, else **derived** from the deck's themed lore producers (so it's satisfiable + testable before the prose lands) |
| RIPE / one-shot PAGE | `isRipe` · `pageOnRipe` (latches `flag.deck.<id>.paged`) |
| The hidden, flag-gated TURN-IN tree | `buildLoadBearingDialogue(quest, prose)` — emits an npc `dialogue` with `entries:[{when:<flags>, node:'turnin'}]` + a `requires.facts` finish choice, reusing engine.js's existing gating. Finish sets `flag.deck.<id>.cleared` |
| Clearing ADVANCES the deck (blocks it) | `deckClearMilestones()` → `advance.js#checkAdvance` floors `narrative_tier` at N+1 once the clear flag is held |
| **THE DECK-STACKING GUARANTEE** | `stackPriority` / `crystallizeForQuest` — see below |

### Deck-stacking (the part hoopy flagged as Claude's)

> *"make sure the player doesn't draw forever without receiving the relevant fragments — start stacking
> the deck at some point if necessary. Simple algo."*

A required flag is set by crystallizing **any** lore that produces it. Left to chance, `dispatch`'s
variety draw might never surface a producer before the lore pool depletes. `stackPriority(store, player,
quest, content)` returns the producer ids to **force next** (handed to `dispatch` via the new
`opts.priorityIds`), under two rules, both read purely from live state (no counters, deterministic):

- **SAFETY** (hard guarantee): if an outstanding flag's *unseen* producers dwindle to ≤ `safety` (1),
  force them now — before the pool can be drawn dry around them. This alone makes the quest **un-missable**.
- **PATIENCE** (comfort): also start forcing once the whole unseen lore pool is within
  `patience` (4) × (#outstanding flags), so the fragment still reads as *found*, not handed over last.

Priority is honoured **only among valid draws** (legal, unseen, gate-passing, lore-typed) and **bypasses
the tag bias** (a forced flag matters regardless of the room's role); with no `priorityIds`, `dispatch`
is byte-identical to before. Use `crystallizeForQuest(interact, store, player, key, quest, content)` as
the drop-in for `interact` at a lore feature when a flag quest is active.

Pinned by `test/deckquest.selftest.mjs` (33 checks) — including the guarantee proof: with producers that
the variety draw disfavours, the **unstacked** baseline saves them for the last draw, while **stacked**
exploration ripens well before exhaustion (and safety-only stacking still always closes).

### Wiring it into the surface (the remaining handoff)

The engine primitive (flag-on-crystallize) is **already live**. To activate the quest layer in
`index.html` once hoopy's content carries `produces.sets` + the load-bearing NPC trees:

1. `const deckQuests = buildDeckQuests([...store.content.values()])` at story-ready; `const quest =
   deckQuests[narTier()-1]`.
2. Crystallize lore features through `crystallizeForQuest(interact, store, playerId, key, quest,
   content)` instead of bare `interact` (NPC/principal touches stay on `interact`).
3. In `checkHoopy`, when `isFlagQuest(quest)` drive the page off `pageOnRipe(store, playerId, quest)`
   (its `flag.deck.<id>.paged` replaces the `hoopy.paged.<tier>` latch for flag-quest decks).
4. Concat `deckClearMilestones()` onto `story.milestones` so the turn-in's clear flag advances the tier
   — and decide whether the load-bearing turn-in **replaces** `grantLevelAtGuide`'s count-based clear for
   that deck (it should: the NPC's hidden finish dialogue *is* the new at-guide grant). Decks whose lore
   fires no flags fall back to the existing `assess()` count path automatically (`isFlagQuest` → false).

## What's next (the rest of hoopy's plan)

1. **Physical decks per tier.** Today the 5 decks are the *narrative* climb over a
   2-physical-deck world (Nave + Rind via the shaft). Next: one physical deck per
   tier — unlimited chunks per deck, each chunk a seed, the generator reading the
   deck's `gen` profile (tint/roleBias/density already carried in `decks.js`) so a
   deck *feels* like its character. Page = descend to the next deck.
2. **The rumor mill** *(pinned)*. The intent: a player-authored rumor enters the pool
   (already a first-class type) and *spreads* — reshaping the ship. Likely
   deterministic too (graph-theory propagation over the NPC/theme graph), surfaced as
   an in-world NPC **microblog** site. Pinned until the deck/quest layers settle.
3. **The Book of Sand.** The AI terminal where the player tells their own story,
   feeding the rumor mill above.

## Tests

`test/hoopy.selftest.mjs` (deck spine + oracle) · `test/story.selftest.mjs`
(import schemas, rep-off, exploration vs hoopybot axes) · `test/deckquest.selftest.mjs`
(load-bearing NPC flag quests: flag-on-crystallize, ripeness/paging, the hidden turn-in tree,
deck-advance, and the deck-stacking guarantee).
