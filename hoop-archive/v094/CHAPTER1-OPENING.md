# hoop/v094 — Chapter One opening chunk (the Nave, Bay 14, and out)

Bending the world toward the collaborator's bible (`hoop-backend/ingestion/chapter1_bible.md`,
"The Tabard: Chapter One"). v093 (mega) is the lived-in world skeleton — rooms, residents, stats,
inventory, the minimap. This is the first **authored** chunk of *story* dropped onto it, in the
inference-free engine's shape (`hoop/story/engine.js`, pool + world-features).

---

## 1. Canon audit — three worlds in one repo

Before authoring, the inconsistencies between **his engine**, **the world we built**, and **the
current bible**. These are real and they change how the chunk is built.

| # | Finding | Severity | Bite |
|---|---------|----------|------|
| **C1** | **Three different fictions.** (a) The vendored engine is written against **"Ashveil / the Quiet"** — README, `agents/`, `ingestion/tier_labeler.py`, `tests/`, `playtester.py` all reference it. (b) **Our** seed pool (`hoop/story/pool.json`) is a **Keeper-derelict** ship — grey Keepers, dead crew, `PROTOCOL SUSPENDED — DEFER TO KEEPERS`, hostile lurkers. (c) The collaborator's **current** bible is **"The Tabard"** — a *living* O'Neill cylinder, the Seven, factions Continuants/Drift/Rind-walkers, Bay 14, Olo Vashti, Sevin, Factor Solen. | High | v094 must bend (b)→(c). (a) is just *labels* in offline code (harmless to the hot path) but will **mislabel** content if his pregen/labeler is ever run against the Tabard bible. |
| **C2** | **Tier range 3 vs 5.** `tier_labeler.py` + `hoop-backend/CLAUDE.md` hard-clamp `revelation_tier` & `narrative_tier` to **1–3** ("Surface/Crack/Depth", "Arrival/Entanglement/Reckoning"). The Tabard bible defines **5** of each (Ordinary→Curve→Vessel→Approach→Purpose; Arrival→Orientation→Investigation→Convergence→Resolution). | High (later) | `engine.js` only does `<=` comparisons, so the **hot path is range-agnostic and won't break**. But the labeler would clamp Tabard tier-4/5 content down to 3, **collapsing the back half of the chapter**. Fix `TIER_RANGES` + the prompt before any pregen runs on this bible. Non-issue for the hand-authored opening (all tier 1–2). |
| **C3** | **No tier advancement in the client — the arc can't climb.** The bible is a 5-rung revelation/narrative *climb*, but the bible says advancement is judged "at long rest" by an **offline** player agent. The inference-free JS client (`engine.js`) has **no advancement path** — a player is pinned at `1/1/1`, so **any content authored above tier 1 never surfaces in the live game.** | **Highest** | "Advancing the ball" is impossible in the client until we add a **deterministic** milestone rule (hold facts X,Y,Z → bump tier). Small, in-spirit addition: the inference-free cousin of long-rest. **This most shapes how the chunk is authored.** See §4. |
| **C4** | **Wrong-canon gate + factions.** `pool.json` gates the rind on a **"Keeper Key"** and rep factions `keepers`/`makers`. The Tabard has no Keepers; rind access is **Sevin** (Rind-walkers) + your own anomalous credentials, and factions are `continuants`/`drift`/`rindwalkers`. | Med | Reuse the gate *shape* (it's a good engine demo) — rename the fiction. |
| **C5** | **Authored opening vs infinite procedural.** The live v3 path crystallizes role-tagged content onto **procedural** chambers/residents (the endless Nave crowd). The bible opening is **named, authored** geometry (Bay 14, the Tabard Terminal, the Green Deck, the rind shaft) with **named** NPCs. | Design | Chunk 1 = a **hand-authored prologue region** (a `world.json`-style feature set) that **hands off** to the infinite Nave. The keystone (`feature_key` == chamber address) lets the authored opening and the endless body run on one engine. |
| **C6** | Gate-token convention: `requires.items` matches **lowercased name *or* tag**. Gate on a **tag** (`credential`), not a display name, so enrich/rename doesn't break the quest. | Low | Author gates by tag. |

---

## 2. The opening cast (bible-faithful, tier 1 = The Ordinary / Arrival)

The "specific opening set of objects" — the deliberate first population.

| Who/what | Engine type | Role in the opening | Reveal |
|---|---|---|---|
| **Olo Vashti** (Drift broker) | `npc` | The orientation voice. Found you; easy to talk to, hard to read; not surprised — and won't say why. The tutorial is *her*. | First face. Hands you the only two threads that leave Bay 14: *read the terminal*, *find Sevin*. Drops **Luna's name** without explaining it. |
| **Bay 14** objects | `lore_fragment` ×3 | The access cradle, **the access log (one entry: yours)**, **the wall stencil** (notation nobody in the Nave uses — *Sevin will recognise it*). | The first mystery, shown not told. Reading the stencil sets `flag.saw_stencil` — the **reason Sevin believes**. |
| **The Tabard Terminal** | `lore_fragment` (the mythograph post) | The Seven post mythographs *before* each telling. The current post is one **the regulars can't parse**. | The first crack in "ordinary." Diegetically it's also the tutorial for the *engine's own* mythograph apparatus (the read/borges story-graph, folded into the fiction). |
| **Factor Merid Solen** (Continuant) | `npc` | Authority notices you. Formal, fair, more frightened than she shows; clocking your **anomalous credentials** with mild alarm. | The "you are being tracked" thread. Gives nothing yet; sets the Continuant tension. |
| **Sevin** (Rind-walker) | `npc` | The gateway down. More arms than a person should have, doesn't explain. Will take you into the shaft **with a reason she believes**. | The ball-advancer. Recognises the Bay-14 notation → believes you → opens the rind for chunk 2. |
| **Luna** (one of the Seven) | *named only* | The chapter's hook: *"Luna knows your name. You don't."* | **Not met** in chunk 1 — only her name lands (via Olo / the terminal). The pull into Chapter One proper. |
| Ambient Nave crowd | procedural (role-tagged) | The three factions sharing space — Continuant blue-grey, Drift wrist-cords, Rind-walkers near the margin. | Crystallized on touch by the existing v3 path. Texture, not plot. |

Cut from our old pool: the Keepers, the dead crew manifest, the suspended triage, the wrong-stars
window, the hostile lurkers. (Salvageable later — the *wrong stars* is a lovely Tier-2 "Curve"
beat, repurposed for the sky-arc reveal. The derelict tone is not the Tabard.)

---

## 3. How it's revealed — the beat sheet (tutorial == story, same motions)

Every tutorial action is also a story beat. Nothing is a "now press W to walk" pop-up.

1. **Wake in Bay 14.** You're acted upon (bible: "mostly being acted upon — found, sheltered").
   Olo is the only figure. Talking to her teaches the **dialogue rail** (forum/story tabs). →
   *teaches: the rail, dialogue choices.* Sets `flag.met_olo`, `rep.drift +1`.
2. **The cradle, the log, the stencil.** Touch the three Bay-14 features → they crystallize lore.
   The log (one entry: yours) and the stencil (foreign notation) are the first mystery. →
   *teaches: features crystallize on touch; the story tab.* Reading the stencil sets
   `flag.saw_stencil`.
3. **Out the gate into the Nave.** Movement into the open city. The three factions at a distance.
   Click a resident → it crystallizes a role-tagged figure (the endless crowd). →
   *teaches: walking, the infinite world, meeting residents.*
4. **The Tabard Terminal.** A mythograph post is up that the regulars debate. Reading it sets
   `flag.read_terminal` and surfaces **Luna's name** a second time (corroboration from a source you
   *can* point at). → *teaches: lore_fragments, the mythograph apparatus.* First "something is off."
5. **Factor Solen.** She finds *you* — your credentials pinged her board. Formal, wary, gives
   nothing. → *teaches: faction standing / an NPC who is not your friend.* Sets `rep.continuants`
   tension (no reward; a watched feeling).
6. **Sevin at the margin.** She'll take you down **if you have a reason she believes.** The reason
   is the stencil. With `flag.saw_stencil` held, a gated choice opens: she recognises the notation,
   believes you, and the rind shaft unlocks for chunk 2. Sets `flag.sevin_believes` + `rep.rindwalkers +1`.
7. **The hook.** You now hold three facts (`met_olo`, `read_terminal`, `sevin_believes`) → the
   **milestone fires**: narrative_tier **1→2** (Arrival→Orientation). The HUD notes it. *Luna knows
   your name. You don't.* End of chunk 1.

The ball advances on **player-legible milestones**, not a timer and not an LLM.

---

## 4. Advancing the ball without an LLM (the C3 fix — proposed)

The bible advances tiers "at long rest" via an offline agent. We can't call a model in the hot path
(the one rule). So: a **deterministic milestone manifest** — the inference-free cousin of long-rest.

```
// hoop/story/advance.js  (proposed, ~30 lines, pure)
// A milestone = { tier_axis, to, requires } evaluated against the same gate state the engine
// already loads (loadGateState). When every requires-clause is held, bump the axis — once, monotonic.
const MILESTONES = [
  { axis: 'narrative_tier',  to: 2, requires: { facts: { 'flag.met_olo': true, 'flag.read_terminal': true, 'flag.sevin_believes': true } } },
  { axis: 'revelation_tier', to: 2, requires: { facts: { 'flag.saw_curve': true } } },   // tier-2 "Curve" content, later
  // … one row per rung; pure, deterministic, atproto-stable, no Date.now, no model.
];
// checkAdvance(store, playerId): fold MILESTONES, setPlayerTier on the highest satisfied. Called at
// the same checkpoints as persistStory() (after a choice/interact). Monotonic — never demotes.
```

Why this is right: it's deterministic (reproducible across machines/repos — the hoop invariant),
in-spirit (gates on *earned* story state, exactly what the bible's "genuinely earned the next stage"
asks), and it unlocks the whole 5-tier pool to the client. It does **not** replace his offline agent
— when the backend is wired, the agent can *also* advance tiers with judgement; the manifest is the
floor that makes the single-player client playable today.

**Decision needed:** build `advance.js` now (chunk 1 actually climbs + seeds tier 2), or author chunk
1 flat at tier 1 and defer climbing. (Recommendation: build it — it's the spine of "advance the ball.")

---

## 5. The geometry — a hand-authored prologue region

Chunk 1 is a small authored feature-set (the `world.json` shape), **not** procedural, because the
opening is named places. It hands off to the infinite Nave at the gate.

```
Bay 14 (sealed) ──gate──> The Nave (open city) ──> Industrial Margin ──> Rind Shaft (locked: requires sevin_believes)
   cradle · log · stencil      terminal · Solen        Sevin                 (→ chunk 2)
```

- Bay-14 features carry **authored** `feature_key`s (`bay14.cradle`, `bay14.log`, `bay14.stencil`).
  When the engine drops onto the infinite ship these become **chamber addresses** (`js/postal.js`) —
  the keystone holds; the named opening and the endless body share one engine.
- The rind-shaft membrane is locked via `locks.js` on `requires: { facts: { 'flag.sevin_believes': true } }`
  — the same deterministic lock layer the live map already uses.

---

## 6. Sample content (valid engine shape — passes `validate.js` / `gates.js`)

> Voice is a **sketch** — the collaborator owns the prose. This shows the *shape*: who says what,
> what each beat sets, how the gate to chunk 2 closes. (`status: active`, all approved, tier 1.)

**Olo Vashti** (the orientation NPC):

```json
{ "id": "np-olo", "type": "npc", "revelation_tier": 1, "narrative_tier": 1, "power_tier": 1,
  "approved": true, "status": "active", "tags": ["drift", "broker", "orient"],
  "content": { "name": "Olo Vashti", "description": "A Drift broker with a knotted cord at her wrist. Easy to talk to, impossible to read. She does not seem surprised by you.",
    "dialogue": { "start": "wake", "nodes": {
      "wake":  { "says": "Easy. You've been under longer than the cradle's log wants to admit. I'm Olo — I'm the one who found you.", "choices": [
        { "id": "where", "text": "Found me where?", "goto": "where" },
        { "id": "who",   "text": "Who am I?",       "goto": "who" },
        { "id": "ready", "text": "(sit up)", "effects": { "set_facts": { "flag.met_olo": true }, "adjust_rep": { "drift": 1 } }, "goto": "ready" } ] },
      "where": { "says": "Bay 14. A reconstruction room that isn't on any schematic of the Nave. The access log has one entry. Yours.", "choices": [
        { "id": "back", "text": "(take that in)", "goto": "wake" } ] },
      "who":   { "says": "That's the question, isn't it. I don't know who you were. But Luna does. Luna knows your name. You don't.", "choices": [
        { "id": "luna", "text": "Luna?", "effects": { "set_facts": { "flag.heard_luna": true } }, "goto": "luna" },
        { "id": "back", "text": "(let it sit)", "goto": "wake" } ] },
      "luna":  { "says": "One of the Seven. The silver one — navigator, keeper of the dream-logs. Don't go looking there yet. She keeps time you can't spend.", "choices": [
        { "id": "back", "text": "(nod)", "goto": "wake" } ] },
      "ready": { "says": "Then up. The Nave's through the gate. Read the terminal when you pass it — something's posting that the regulars can't make sense of. And if you mean to go down into the rind, find Sevin at the margin. She'll want a reason she believes.", "effects": { "set_facts": { "flag.oriented": true } }, "choices": [
        { "id": "go", "text": "(go)", "effects": { "end": true } } ] } } } } }
```

**Sevin** (the ball-advancer — the rind gate closes here):

```json
{ "id": "np-sevin", "type": "npc", "revelation_tier": 1, "narrative_tier": 1, "power_tier": 1,
  "approved": true, "status": "active", "tags": ["rindwalker", "guide"],
  "content": { "name": "Sevin", "description": "A Rind-walker with more arms than a person should have. She doesn't explain them. She has been in the tunnels near Bay 14.",
    "dialogue": { "start": "s0", "nodes": {
      "s0": { "says": "You came up out of the rind side, not the city side. People who do that usually want something from me.", "choices": [
        { "id": "down",   "text": "I need to get into the shaft.", "goto": "why" },
        { "id": "leave",  "text": "(not yet)", "effects": { "end": true } } ] },
      "why": { "says": "Everyone needs into the shaft. The rind doesn't care what you need. Give me a reason I believe.", "choices": [
        { "id": "stencil", "text": "There's a mark in Bay 14 — three layers, the oldest older than any map.", "requires": { "facts": { "flag.saw_stencil": true } }, "effects": { "set_facts": { "flag.sevin_believes": true }, "adjust_rep": { "rindwalkers": 1 } }, "goto": "believe" },
        { "id": "nothing", "text": "(you have nothing yet)", "effects": { "end": true } } ] },
      "believe": { "says": "…I've seen that mark. Older than the Nave. All right. Stay close, do what I say, and don't touch the warm walls. The shaft's open to you.", "choices": [
        { "id": "ok", "text": "(follow)", "effects": { "end": true } } ] } } } } }
```

**The Bay-14 stencil** (the reason — a `lore_fragment`, sets the gate fact via the take/touch verb):

```json
{ "id": "lo-stencil", "type": "lore_fragment", "revelation_tier": 1, "narrative_tier": 1, "power_tier": 1,
  "approved": true, "status": "active", "tags": ["bay14", "notation", "mystery"],
  "content": { "name": "The Wall Stencil", "description": "Notation in three layers, stencilled and re-stencilled. Nobody in the Nave writes like this. The oldest layer is older than any map. (Sevin will recognise it.)" } }
```

> Note the gate chain `gates.js` will verify closes: the stencil sets `flag.saw_stencil` (via the
> feature touch / a small `set_facts`-on-read), which is the only key to Sevin's `stencil` choice,
> which sets `flag.sevin_believes`, which is one of the three facts the §4 milestone needs and the
> lock on the rind membrane. No orphan gates.

---

## 7. Build order (proposed, after we align on §4 and voice)

1. `hoop/story/advance.js` + a milestone manifest (C3 fix) + selftest. *(if we choose to climb)*
2. `hoop/v094/pool.json` — the Tabard opening cast (replaces the Keeper pool for this surface).
3. `hoop/v094/world.json` — the Bay-14 → Nave → margin → shaft prologue region.
4. Wire the §6 content through the existing v3 render path; lock the shaft membrane via `locks.js`.
5. `TIER_RANGES` 3→5 in `tier_labeler.py` + prompt (C2) — only when pregen targets this bible.
6. Re-point the offline labels/tests off "Ashveil/the Quiet" onto the Tabard (C1) — backend cleanup,
   separable.
