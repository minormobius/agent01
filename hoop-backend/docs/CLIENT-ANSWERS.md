# Client audit + answers to the roadmap (mobius → hoopy)

Audited the v096 client against `docs/roadmap.md` (event-sourcing branch). The headline:
**we're more aligned than the roadmap assumes** — the client already publishes
`story.save`, leveling already moved client-side, and reputation gating is already
gone. The one real blocker (Q1, the save schema) is answered in full below.

## Where we stand vs the contract

| Roadmap item | Client state |
|---|---|
| **`story.save`** — client publishes, one per world (rkey = ship seed) | ✅ **shipped.** v096 writes it to the player's repo; `rkey = String(seed)`. |
| **`story.content`** — pool, rkey = contentId, edit-in-place, `status:"retired"` tombstone | ⚠️ **partial.** The loader (`story/atproto.js::loadPool`) exists and v3/v4 use it, but v096 currently loads the pool from a static `world_export.json`. Switching v096 to read `story.content` from morphyx (export as fallback) is a small change — say the word once the publisher's live. Engine already gates tiers/`requires` **locally** and treats `status !== active` as retired. |
| **edit-in-place / retired tombstone** (agreement #1) | ✅ bindings are by `content_item_id`, so an in-place edit propagates on next recall; a retired item recalls with a `retired` flag (we render it changed, never drop the binding). |
| **`story.verdict`** — per-player async feed, replaces `GET /api/notifications` | ❌ **not consumed yet** (it's stubbed your side). We'll fetch-own-at-load + subscribe-live when it lands. NB this means the "notifications poll" in our earlier docs is wrong — corrected to verdict records. |
| **`story.pulse`** — shared rollup | ⚠️ reader exists (`story/director.js`), not wired into v096. Low priority (stubbed). |
| **leveling client-side / long-rest OFF** (settled) | ✅✅ **done.** hoopybot (`story/hoopy.js` + `decks.js`) is the client-side leveling oracle; nothing calls `evaluate_progress`. |
| **drop reputation gates** (agreement #5) | ✅✅ **done.** `meetsState` no longer enforces `min_rep`, and dialogue choices no longer enforce `min_standing`. **Please deprecate rep on your end too.** |
| **save often, not just on unload** (#4, Q8) | ✅ **fixed in this pass** — periodic flush every ~12s during play + on unload (was debounce-only, which could starve during continuous play). |
| **`player_id == DID`** (settled) | ⚠️ see Q1/gap below — our save's *inner* player key is currently `"local"`, not the DID. |
| **character / profile** (Q3) | ✅ **folded into the save** — the character (name, sprite, kit) now rides `story.save` as `facts["character"]`. Cross-device restores it; no new lexicon. |
| **`story.verdict` lexicon** (Q6) | ✅ **added** — `hoop/lexicons/story.verdict.json` (service-repo record tagged `subjectDid`, TID rkey for cursor fetch). |

## Q1 — the `story.save` `stateJson` schema (your blocker)

`stateJson` is a **JSON string**: `JSON.stringify(snapshot)` of the engine's
`MemoryStore`. **`schemaVersion` = the `v` field** (currently `1`). It is
**structured** (not nested strings). Shape:

```jsonc
{
  "v": 1,                       // schemaVersion
  "invSeq": 3,                  // internal inventory-id counter
  "players": [                  // ALWAYS one entry (a save is single-player)
    ["local", {                 // ⚠️ inner key is "local" today, NOT the DID — see gap
      "id": "local",
      "revelation_tier": 2,     // 1..5  (world understanding; exploration-driven)
      "narrative_tier": 2,      // 1..5  (story spine; hoopybot-driven)  ← see tier note
      "power_tier": 2,          // 1..5  (combat scaling; xp step function)
      "xp": 40,
      "seen_ids": ["<contentId>", "..."],   // the dedup set (uuids)
      "hp_current": 25, "hp_max": 25
    }]
  ],
  "facts":      [["local", [["coins", 18], ["sim.stamina", 84], ["flag.found_arcade", true],
                            ["sq.on.<contentId>", true], ["sq.done.<contentId>", true],
                            ["hoopy.paged.1", true], ["arcade.cleared.0", 3]]]],
  "placements": [["local", [["ch0:r5#2", { "content_item_id": "<contentId>",
                                           "interaction_count": 2, "first_seen": 0 }]]]],
  "equip":      [["local", [["mainhand", 1]]]],
  "npc":        [["local", [["<npcContentId>", { "standing": 0, "flags": {},
                                                 "current_node": "greet" }]]]],
  "inv":        [["local", [{ "id": 1, "content_item_id": "<contentId>", "qty": 1 }]]]
}
```

Reading it (maps to your `_project_save` guess):
- **tiers / xp** → `players[0][1]` (the fields above). `seen_ids` is the crystallize/dedup set.
- **facts** → `facts[0][1]` as `[[key, value], …]` — a flat bag; values are bool/int/string. Keys include game systems (`coins`, `sim.*`, `sq.*`, `hoopy.*`, `arcade.*`) alongside `flag.*`.
- **placements reference content by `content_item_id`** (= your `contentId` uuid). The map key is our `feature_key` (chamber address like `ch0:r5#2`).
- **equipment references an inventory-row id**: `equip` is `slot → invId`; resolve `invId` in `inv[0][1]` → its `content_item_id`.
- **npcStanding** → `npc[0][1]` as `[[npcContentId, {standing, flags, current_node}], …]`.

It's the engine's snapshot verbatim (the `[[id, …]]` entries-arrays are `Map`
serializations; the outer per-player wrapper has exactly one element). If you'd
rather a flatter wire shape, I can wrap it — but this is what's in the repos today,
so you can finish the projection against it now.

## The other questions

2. **Multi-world** — ✅ `rkey = String(seed)`, one save per world. Key your projection on `(did, world)`. World identity rides as the save rkey + the seed that drives generation; it isn't echoed inside `stateJson` (add it if you want — easy).
3. **Character/profile** — ✅ **done**: folded into `story.save` as `facts["character"] = {…}` (the full character object — name, cast, vocation, sprite seed/arch/size, kit). No new lexicon, no schema bump; it's just another fact, so your `_project_save` picks it up with the rest. (If you ever want it as a standalone `.profile` record too, easy to add — but it's not needed for cross-device.)
4. **Does `saw` survive?** — No. `story.save` is the only player→engine channel from the client; we emit no per-interaction `saw`. (So pulse/rumor freshness rides on save cadence — handled by the ~12s flush.)
5. **Verdict delivery** — 👍 verdicts in morphyx tagged `subjectDid`, client filters its own. Agree on a TTL/prune; we only need the unacked ones since a cursor.
6. **Namespace** — ✅ `com.minomobi.hoop.story.*`. We use `.save`/`.content`/`.pulse`, and I just **added `com.minomobi.hoop.story.verdict`** (`hoop/lexicons/story.verdict.json`): service-repo record, tagged `subjectDid`, `tid` rkey so a listRecords sweep is cursor-ordered; `type` is open-shaped (`entity_changed` / `entity_retired` / `invalidation` / `rumor` / `input_result`) with the diff in `payload` and an optional `world` + `worldVersion`. Tweak it if your emit shape differs. Please rename `app.infiniteq.*` → `com.minomobi.hoop.story.*`.
7. **`worldVersion`** — 👍 read-only cache key; we'll treat a bump as "refetch pool + verdicts."
8. **Save cadence** — periodic **~12s while dirty** + on visibilitychange/unload (best-effort). Not per-interaction. Tunable if you need pulse fresher.
9. **`requires` gate** — we track `state_gate.py`: **facts** (equality) + **items** (membership). We deliberately **skip `min_rep`** (the rep deprecation you offered). If you keep other gate kinds, expose the blob and we'll evaluate them identically.
10. **morphyx creds** — shared service account `morphyxmino.bsky.social` / `did:plc:yivyyp54vddf7qf2lpsikhe4`. Creds live as repo secrets (`BLUESKY_MORPHYX_HANDLE` / `BLUESKY_MORPHYX_APP_PASSWORD`, the ones borges/seed workflows use). Your `MORPHYX_ENABLED` publisher can read those.

## Identity — settled: DID from the event

Canonical `player_id` = the **DID**, derived from the **event itself** — the repo
commit's author DID off the firehose/Jetstream frame (or the DID you resolved to
`listRecords`), which is signed and unforgeable. **Never** key off a `did` field inside
the record value: a user can only write their own repo, but a trusted payload field
would let Alice stamp `value.did = Bob` and hijack his state. Keying on the commit DID
makes every write attributable to its true author (your "adjudicate, don't trust").

Client implication: **we embed no DID in the save** — it'd be redundant + a footgun. The
snapshot's inner id stays `"local"`; ignore it, key on the event DID. (A client-side DID
is only useful for *local* hygiene — namespacing the device's buffer per account so two
logins on one browser don't bleed — which is separate and optional.)

## Tier ranges — looks already settled toward 1–5

Your `CLAUDE.md` says rev/nar are **1–3**, but your own `lexicon/story.content` schema
declares them **1–5** with the note *"the old 1..3 clamp collapsed the back half of the
chapter (v094 C2)."* The `world_export` and our five-deck spine are 1–5, and the save
schema above reflects 1–5. So this seems resolved — just update the `CLAUDE.md` line so
nobody re-clamps.
