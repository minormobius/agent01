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
(import schemas, rep-off, exploration vs hoopybot axes).
