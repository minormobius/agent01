# The social nave — content brief

> **For hoopy's next pass.** What the Commons and the Wards (zones 1–2) need in order to ship as a
> playable campaign. Everything below was established by running the 16-item content rev
> (`mobius_sample.html`) through the live v110 pipeline, not by reading it — see §7 for how to
> re-run the check yourself.
>
> Companion to [`CHAPTER1-SYNTHESIS.md`](CHAPTER1-SYNTHESIS.md), which covers the rest of the
> chapter. The rinds are being reworked separately; this brief is the nave only.

## 0. The headline

**The rev's shape is right. It imports clean, reviews `PASS` with zero conflicts, and every field
lands where the engine expects it.** Nothing about the format needs to change.

What it lacks is a spine. There are no load-bearing anchors in the pool, so `proveProgression`
returns `no_anchors` — the content is a set of rooms, not a campaign. Adding the two nave anchors
plus two missing gate-setters is enough to flip it: I patched them in synthetically and got
`solvable: true, verdict: PASS`. So this brief is small and specific, not a rewrite.

## 1. What already works — don't change it

| | |
|---|---|
| `room_bundle` → engine | 16 bundles → 32 content items (16 `npc` + 16 `lore_fragment`), ids unique, no collisions |
| the envelope | tiers, tags, `produces`, `status` all parse; `zone`/`faction`/`nave_faction`/`verb` lift into tags correctly |
| dialogue trees | 114 choices across 65 nodes, all structurally valid — `validateTree` raises nothing |
| effects | all four kinds you use are consumed by `engine.js`: `set_facts`, `adjust_rep`, **`adjust_standing`** (per-NPC standing — the regard economy), **`set_npc_flags`** |
| gate flags | your 8 flags match the engine's taxonomy exactly (`flag.{commons,ward,rind,signal}.*`) |
| `requires` gating | 8 gated choices, all reachable |

Two things worth knowing about how this lands:

- **`adjust_standing` is per-NPC and `adjust_rep` is per-faction.** Both persist. You're using
  standing 43× and rep 36×, which is the right ratio for a social zone — standing is the
  relationship, rep is the reputation.
- **`reactions` now survives import, and partial tables are the new contract.** They used to be
  dropped on the floor — 37.7% of the rev's prose. They're carried now, and every slot you leave
  empty is filled from a stat block rolled deterministically from the NPC's id. **So author the two
  or three reactions that carry plot, a tell, or the character's one real secret, and leave the
  rest.** See §6.

## 2. The three blockers

All three are the same missing thing: **the anchors.**

The bible gives one load-bearing guide per zone — Olo Vashti for the Commons, Factor Solen for the
Wards — who "blocks the way to the next" until the player has gathered enough. The engine
implements exactly this and finds nobody.

An anchor is an ordinary `room_bundle` with two additions:

```jsonc
{
  "type": "room_bundle",
  "narrative_tier": 1,
  "content": {
    "name": "…the room they hold court in…",
    "zone": "commons", "faction": "drift", "nave_faction": "drift", "verb": "…",

    // (1) the load_bearing block — this is what makes them an anchor at all
    "load_bearing": {
      "tier": 1,
      "gates": ["flag.commons.continuant_face",
                "flag.commons.drift_face",
                "flag.commons.rindwalker_face"]
    },

    "npc": {
      "name": "Olo Vashti",
      "dialogue": { "start": "greet", "nodes": {
        "greet": { "says": "…", "choices": [
          // …ordinary conversation choices…

          // (2) the TURN-IN: gated on every flag in `gates`, and its effect sets the
          //     deck-clear flag. That flag IS the level-up — nothing else advances the tier.
          { "id": "turnin", "goto": "end",
            "text": "I have seen the three faces.",
            "requires": { "facts": { "flag.commons.continuant_face": true,
                                     "flag.commons.drift_face": true,
                                     "flag.commons.rindwalker_face": true } },
            "effects": { "set_facts": { "flag.deck.nave.cleared": true } } }
        ] } } }
  }
}
```

The two nave anchors:

| tier | who | zone | gates on | turn-in sets |
|---|---|---|---|---|
| 1 | **Olo Vashti** (Drift) | `commons` | the three `flag.commons.<faction>_face` | `flag.deck.nave.cleared` |
| 2 | **Factor Merid Solen** (Continuant) | `wards` | the three `flag.ward.<faction>_known` | `flag.deck.curve.cleared` |

> The deck ids are `nave` and `curve` — they're `decks.js`'s internal keys and don't match the zone
> names. `flag.deck.curve.cleared` is what clears **the Wards**. Copy them exactly.

## 3. The gates: two missing setters

A gate needs a keeper somewhere in the zone whose dialogue sets it, on a **reachable** choice. You
have four of six:

| gate | setter | |
|---|---|---|
| `flag.commons.drift_face` | Tzitlil the Twice-Burned — Reading Room (commons/learn) | ✅ |
| `flag.commons.rindwalker_face` | Babuchedd Trys — The Chandler Counter (commons/worship) | ✅ |
| `flag.commons.continuant_face` | — | 🔴 **missing** |
| `flag.ward.continuant_known` | Nolana Krosttyalich — The Registry Desk of Third Watch (wards/govern) | ✅ |
| `flag.ward.rindwalker_known` | Buntrach Rhyddys — Galleinw's Chandler Counter (wards/worship) | ✅ |
| `flag.ward.drift_known` | — | 🔴 **missing** |

Both missing gates belong to rooms **that already exist** — *Sprout-Tray 35* (commons/continuant)
and *Chasagh's Weigher Stall* (wards/drift). Each needs one more dialogue choice carrying
`effects.set_facts`. That's the whole fix.

## 4. The coverage manifest

The bible asks for more nave than the rev delivers. Two quotes drive it:

> Zone 1 — the Commons: "…**at least one room of every verb** appears."
> Zone 2 — the Wards: "**Six faction wards, two per faction.**"

### The Commons — 13 rooms, one per verb

The faction column is the verb's owner, quoted from the bible's faction entries (each faction
lists two exclusive + two shared verbs). `dwell` is the thirteenth and belongs to nobody —
"homes emit people."

| faction | exclusive | shared |
|---|---|---|
| Continuants | `govern` · `grow` | `serve` · `heal` |
| Drift | `learn` · `play` | `move` · `trade` |
| Rindwalkers | `worship` · `mend` | `make` · `store` |
| — | | `dwell` |

**Have 4:** grow (continuant), learn (drift), worship (rindwalker), serve (neutral).
**Need 9:** `dwell`, `make`, `mend`, `trade`, `play`, `heal`, `govern`, `move`, `store`.

The Commons is "not a faction, a vibe," so a room may sit on a verb without wearing that verb
owner's colours — *Row 38 Over* is `neutral/serve` and that's good. The requirement is that all
thirteen verbs appear and all three factions show a public face somewhere.

### The Wards — 6 wards, on the six exclusive verbs

A ward is the society itself, not another public room — so each faction's two wards should be
built around its two **exclusive** verbs. (This isn't only a reading of the bible:
`rind/upperrind/verbflow.js` independently defines `WARD_VERBS` as exactly these six.)

| faction | ward 1 | ward 2 | status |
|---|---|---|---|
| Continuants | `govern` | `grow` | govern ✅ *(Registry Desk)* · grow 🔴 |
| Drift | `learn` | `play` | both 🔴 |
| Rindwalkers | `worship` | `mend` | worship ✅ *(Galleinw's)* · mend 🔴 |

Two current ward bundles sit on **shared** verbs rather than exclusive ones — *Trypeth* is
`rindwalker/make` and *Chasagh's Weigher Stall* is `drift/trade`. Both are good rooms; they're
just doing commons work. Either re-verb them onto the faction's exclusive pair, or move them to
the Commons (which needs `make` and `trade` anyway) and write the wards fresh. Note that
*Weigher Stall* is also the intended setter for `flag.ward.drift_known` — if it moves to the
Commons, that gate moves with it to a real Drift ward.

### The whole nave

| | have | need | to write |
|---|---|---|---|
| Commons rooms | 4 | 13 | **9** |
| Wards | 2 on-verb (+2 off-verb) | 6 | **4** |
| Anchors | 0 | 2 | **2** |
| Gate setters | 4 | 6 | **2** *(edits to existing rooms)* |
| | | | **≈15 new bundles** |

## 5. What "solid" means beyond the count

Three things the checker can't measure, in rough priority:

1. **The Commons should teach the verb system without naming it.** Thirteen rooms each built
   around one thing a room can be *for* is the player's training for the whole game — the rind
   later re-reads the same verbs at ship scale. If the thirteen rooms read as thirteen jobs rather
   than thirteen *purposes*, the payoff downstream doesn't land.
2. **Knowledge and affinity have to come apart somewhere visible.** The bible is explicit that you
   can learn a faction's dark secret and trust them less. At least one gate-setting keeper per
   faction should hand over real knowledge in a way that costs the player some warmth toward them
   — otherwise the two currencies are the same currency.
3. **Standing should be earnable and losable.** You're using `adjust_standing` well; the thing to
   watch is that it mostly goes up. A few choices that spend standing for information would make
   the regard economy feel like an economy.

## 6. Stat blocks: author less, get more

Every NPC now gets a **FLESH · CHASSIS · ANIMA** character rolled from `(worldSeed, npc id)` — the
same spine the arena and `rind/combat` read. Nothing is authored and nothing is stored; it's a pure
function of the id, so it costs no content and re-derives identically everywhere.

The seam is free: `stats.js` keys its vocations by **the thirteen verbs**, and your bundles already
carry `verb`. So a `grow` room's keeper is a Tender, a `govern` room's is a Warden, with no mapping
in between. The rolled **cast** (one of nine temperaments — Brute, Wired, Wrought, Construct…) then
decides how each empty reaction slot plays, and the vocation supplies the props.

Two things come along that you don't have to write: a **bond** — a phrased relation to another NPC
in the pool, which also thickens the `refs` graph — and an **omen**, one line of foreboding. The
omen is doing real thematic work: under the chapter's premise an omen is *a conclusion reached
without evidence*, which is exactly the faculty the Seven lack and the player was rebuilt to have.

**Authored always wins.** A slot you write comes back verbatim, marked `authored`; a slot you skip
comes back marked `derived`. Derived lines are meant to be *right*, not to pass for yours — yours
are far more specific, which is the point of the split.

If a roll fights a voice you already have in mind, pin it on the bundle:

```jsonc
"npc": {
  "name": "Factor Merid Solen",
  "stats": { "triad": { "flesh": 0, "chassis": 1, "anima": 0 } },   // procedurally cold, not hot-tempered
  "reactions": { "grief": "…the one line that matters…" }           // the rest derive
}
```

`stats` accepts `triad`, `vocation`, `power` and `quirks`; anything you don't pin still rolls.

### The API

Pure, inference-free, no key, no cost, deterministic — the same request returns the same person for
ever, so the GET form is a permalink the way `table.mino.mobi/cairn` means it.

```
GET  hoop.mino.mobi/api/story/statblock?id=<id>&name=<name>&verb=<verb>&seed=<worldSeed>
POST hoop.mino.mobi/api/story/statblock   { worldSeed, npcs: [{ id, name, verb, reactions?, stats? }] }
```

The POST form takes a batch (up to 500) and returns each block with its **fully resolved table** —
your authored slots preserved, the rest derived — so you can see while writing exactly which
reactions are worth your hand. Post the whole pass at once and bonds point *within* it, giving you
a connected relationship graph for free. CORS is open.

## 7. Checking your own pass

```bash
node hoop/scripts/extract-content-rev.mjs <rev.html> --out /tmp/rev.json   # review page → world_export
node hoop/scripts/nave-readiness.mjs /tmp/rev.json --verbose               # is the nave shippable?
```

`nave-readiness.mjs` runs the real pipeline — import → review → anchors → `proveProgression` — and
reports in three bands: **BLOCK** (a player cannot finish the nave), **GAP** (works, but short of
what the bible asks), **NOTE**. It exits non-zero on any blocker, so it can gate a pass.

Current output: **3 blockers, 8 gaps.** When it prints `NAVE SHIPS`, the social half is done.
