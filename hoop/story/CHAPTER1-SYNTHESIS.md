# Chapter One — the synthesis pass

> **Reference doc**, in the lineage of [`CHAPTER1-AUDIT.md`](CHAPTER1-AUDIT.md). That one
> tracked hoopy's *progression proposal* against v098. This one tracks **hoopy's content
> revision** (the `mobius_sample.html` review harness, 16 `room_bundle`s + a rewritten story
> bible) against **v110 as actually built**, and proposes the theory of the case that lets the
> two halves meet.
>
> **No code was changed for this doc.** It is the spec for the pass that follows.
>
> Status legend: ✅ built and exercised · 🟡 built, not exercised · 🔴 gap · 🔧 correction · ❓ needs Mobius

---

## 0. The diagnosis: we are ahead of each other, not ahead of the work

The uncomfortable read first, because it reframes everything below.

**v110 has already built the machinery for hoopy's new content model.** `import.js` has a
complete `expandRoomBundle` — it explodes a bundle into an `npc` + a `lore_fragment`, lifts
`zone`/`faction`/`nave_faction`/`verb` into tags, keeps the pair bound by a shared room id, and
de-collides ids. `decks.js` is explicitly "REALIGNED to hoopy's CURRENT bible — the Four Zones
ARE the narrative tiers." `factionchoice.js` implements witness-×3-then-choose at the upper-rind
threshold. `conclusion.js` implements gather-chamber-lore → locate → Luna contact → an ending
weighed from the whole journey. `anchors.js` derives the Olo→Solen→Sevin→Luna chain from the
content itself.

**And the live corpus contains zero room bundles.** `v110/story/world_export.json` is 720
records of the *old* flat shape:

| type | count |
|---|---|
| lore_fragment | 167 |
| npc | 138 |
| item | 126 |
| rumor | 116 |
| plot_beat | 90 |
| creature | 83 |
| **room_bundle** | **0** |

So `expandRoomBundle` is 🟡 — built, fixture-tested (`test/story.selftest.mjs`,
`solvable.selftest.mjs`, `anchors.selftest.mjs`), and **never once run against real content**.
Meanwhile hoopy has authored 16 real bundles that have never been run through it.

That is the whole tenuous moment, stated plainly: **two correct halves of one system, neither of
which has met the other.** Nothing here is behind schedule. The risk is not that the pieces are
wrong; it's that a full content pass gets generated against assumptions neither side has tested,
and we discover the mismatch at 500 records instead of 16.

**The single highest-value action in this document is to run the 16-item sample end-to-end
through the live pipeline before hoopy generates anything more.** Everything else is downstream
of what that tells us.

---

## 1. The theory of the case

The mystery plot the content rev asks for. This is the load-bearing section; the mechanics in
§4–5 are only worth building if they serve it.

### 1.1 What changed in the premise

The old bible: the Tabard is *travelling* "toward a port no one expects to see lit," it is
*approaching* something, and that something has *noticed*.

The new bible: the Tabard is **growing** — "extending at both axial ends at a rate no generation
has observed directly" — the inhabited middle is held in **stasis**, and the something has
**responded**.

This is not a reskin. Approach is a countdown: a thing arrives, you meet it, the clock was the
plot. Growth is a *condition*: the ship is becoming something, continuously, and has been for
longer than anyone can reckon. The countdown had an author's deadline built into it. The growth
doesn't — which means the plot has to come from somewhere else.

Here is where it comes from.

### 1.2 The Seven cannot conclude

The bible says it outright, and I don't think it has been read as a mechanism yet:

> The iron-copper grudge between Mars and Venus is real, ancient, and will never resolve. It
> crests and resets, crests and resets, **because nothing the deathless feel can arrive.**

Every other fact about the Seven is a restatement of this. They "maintain the ship as a side
effect of existing." They "govern nothing, want nothing from mortals." They are "curious about
mortal lives the way a lighthouse is curious about ships." And their signature act — the
**mythograph** — is "a structural blueprint of a story, published at a permalink *before the
first word is spoken.*"

That is a portrait of an intelligence that can generate structure indefinitely and **cannot
terminate**. The Seven publish the shape of a story and let someone else finish it, because
finishing is the one operation unavailable to them.

The passengers have the opposite problem. Mortals conclude constantly — they die, that is what
concluding is — but the growth proceeds "at a rate no generation has observed directly." No
passenger lives long enough to perceive the thing that needs deciding.

**So the ship has a decision problem, and neither of its two kinds of inhabitant can solve it.**
Growth is happening. The something has responded. Answering requires an entity that can perceive
on the ship's timescale *and* arrive at a conclusion. The Seven have the first and not the
second. The passengers have the second and not the first.

### 1.3 Which is what you are

You are an android — you persist, like the Seven. You were rebuilt with a **translation
apparatus** (to perceive the response) and a **decision architecture** (to conclude). The bible
already says these "didn't exist before you were rebuilt — built for something specific,
something anticipated."

Bay 14 is therefore not a hiding place and not a lab accident. **It is a fabrication facility
answering a specification.** One of the Seven wrote the spec. Luna navigates, keeps the
dream-logs, and *knows your name* — she is the one who has to know where the ship is going, and
the only one whose job is a question about the future.

The mythographs "have changed" since the signal began because Luna is now publishing a shape she
needs completed. The page-71 mythograph already wired into the game — *"Luna posted this. The
hero is you"* — is the spec sheet being handed to the thing built from it. That beat was built
in v098 for other reasons and it lands perfectly here; nothing needs to be rewritten to
accommodate this reading.

### 1.4 Why the whole game is "gather lore to descend"

This is the part that makes the theory earn its place, because it converts the content rev's
central mechanic from a pacing device into the actual plot.

A decision architecture needs **inputs**. The four guides are not gatekeepers — they are a
**curriculum**. Olo teaches you the city's public faces; Solen teaches you its societies from
inside; Sevin teaches you the ship at its true scale; Luna teaches you the deep. Each one holds
the door until you have learned the thing that stage exists to teach, because an
under-informed decision architecture produces a decision, just not a good one.

And the Conclusion — "the whole journey is weighed: the choices you made at each guide, the
faction you chose, **the lore you saw and the lore you didn't**" — stops being a scoring gimmick
and becomes the **literal readout of the training set.** The endings differ because the machine
was fed differently. "There are many such endings, and the differences between them are the
differences the player made" is, under this reading, a mechanical description of what actually
happened rather than a promise about writing quality.

### 1.5 What this buys the rest of the design, for free

Four mechanics in the new bible that currently read as good instincts become load-bearing:

| Mechanic | What the theory makes it |
|---|---|
| **Knowledge ≠ affinity** — knowledge opens the descent, affinity only colors choices | Exactly right, and now necessary: the apparatus needs *data* to function at all, but a decision architecture with preferences is still a decision architecture. Learning a faction's dark secret and trusting them less is the system working, not a contradiction. |
| **The regard economy** — "the economy that actually matters is regard" | Regard is the mortal faculty the Seven lack, running as a currency. It is conferred and withdrawn; it *arrives*. The Nave's social economy is a working model of concluding, which is why the player has to spend a whole chapter inside it before being trusted with the real one. |
| **The faction choice at the upper rind** | You are choosing which mortal epistemology to carry into a machine-timescale decision. Not a stat allocation — a choice of *what kind of knower* the apparatus becomes. |
| **The 13 verbs, re-read at scale in the rind** | The growth thesis in miniature. A workshop and a forge-cathedral are the same verb at two timescales; a generation and the ship are the same organism at two timescales. The verb system is the reader's training for the premise. |

### 1.6 What stays unanswered (deliberately)

The bible never says what the something *is*, and Chapter One should not. The theory constrains
it in exactly one way, which is enough to author against:

**it responded to growth, not to a message.** It perceived the Tabard as an organism, not as a
sender. Whatever it is, it is the kind of thing that notices something growing toward it — and
the question the chapter closes on is whether growth toward it should continue, redirect, or
stop. That is a decision only you can make, which is why you were made.

> 🔧 **One correction to carry into the content pass.** Old-bible phrasing survives in the live
> corpus and in `hoop/story/bible.md`: *approach*, *arrival*, "the ship is approaching
> something," "the something has noticed." Under the new premise these are wrong in a way that
> matters — they reintroduce the countdown. The generation lane will happily produce more of
> them until the bible it reads is replaced (§4.3).

---

## 2. What the content rev actually changes

### 2.1 The bible diff

| | old (`hoop/story/bible.md`, live) | new (the rev) |
|---|---|---|
| Premise | travelling toward a port; *approaching*; something *noticed* | **growing at both axial ends**; middle held in *stasis*; something *responded* |
| Structure | loose "Scenes: City" / "Scenes: Rind" lists | **Four Zones**, descended in order, each with a register and a guide |
| Verbs | — | **the 13 verbs**; every room is built around exactly one |
| Economy | — | the supply web + **regard** as the currency that matters |
| Factions | 3, by vibe and creed | 3, each owning **2 exclusive + 2 shared verbs**; creeds re-derived from the cluster |
| Continuants | "theology of **maintenance**" | "theology of **continuity**" — maintenance moves to the Rindwalkers ("maintenance is meaning") |
| The Seven | "They are not factions. **They are terrain.**" | **terrain in the Nave, factions in the rind** — each owns a rind region |
| Narrative tiers | 5 (Arrival → Resolution) | **4** (= the four zones); Resolution becomes *The Conclusion*, an ending-selection event, not a tier |
| Revelation tiers | a full 5-rung section (Ordinary → Purpose) | **section deleted**; `r` survives only as a review-UI label |
| Advancement | — | gather lore to descend; **knowledge ≠ affinity** |
| Endings | one resolution, 4 dispositions | **many**, weighed from the whole journey |

The two structural additions with the largest blast radius are **the Seven as rind factions**
(zones 3–4 gain a second faction axis on top of the nave three) and **5 tiers → 4 zones**.

### 2.2 The schema

A `room_bundle`'s `content` carries: `name`, `description`, `zone`, `faction`, `nave_faction`,
`verb`, `npc{name, voice, description, dialogue, reactions}`, `lore{name, description}`.

Coverage in the 16-item sample:

| zone | faction axis | verbs seen |
|---|---|---|
| commons (4) | continuant · drift · rindwalker · **neutral** | grow, learn, worship, serve |
| wards (4) | continuant · rindwalker ×2 · drift | govern, make, trade, worship |
| upper_rind (4) | **venus · jupiter · mars · mercury** | grow, govern, make, learn |
| lower_rind (4) | **sol · luna ×2 · saturn** | worship, learn, store, dwell |

Every rind bundle also carries its `nave_faction` — the projection back to continuant/drift/
rindwalker that `factionchoice.js`'s witness counter needs. That is correct and already handled.

**Three observations worth acting on:**

1. **9 of 13 verbs appear; `mend`, `heal`, `play`, `move` do not.** `mend` and `play` are
   *exclusive* verbs (Rindwalker and Drift respectively) — a content pass that under-serves them
   under-serves those factions' creeds at exactly the moment the player is choosing between them.
2. **The upper-rind sample splits Mars/Mercury/Venus/Jupiter one apiece and the lower-rind gets
   Saturn/Sol/Luna** — precisely the bible's own division. The sample is self-consistent with the
   canon it ships alongside, which is a good sign for the generator.
3. **The `neutral` faction appears** (commons/serve). It's not in the bible's faction list. Fine
   and probably necessary for the Commons' "not a faction, a vibe" register — but it needs to be
   a declared value, not an emergent one, or the tag will drift.

### 2.3 The tier axes — resolved

**Decision (Mobius): zone becomes the spine.** The rev's JSON carries no tier fields; in the
review UI the three axes are collinear (commons = r1·n1·p1 … lower_rind = r4·n4·p1).

Concretely:

- `ZONES = ['commons', 'wards', 'upper_rind', 'lower_rind']`; index+1 derives **both**
  `narrative_tier` and `revelation_tier`. hoopy stops authoring tiers entirely — the zone is the
  only thing he sets, and it's a field he's already setting.
- `power_tier` stays independent and defaults to 1. It is genuinely orthogonal — it gates which
  creatures and items the world surfaces to a player of a given strength, which has nothing to do
  with how deep they've descended. Keeping it costs nothing and preserves "a strong player in an
  early zone."
- `AXIS_MAP` and the r/n/p remap stay, unchanged, for the 720-record legacy corpus.
  `importRecord` already carries two schemas (FLAT and NESTED) side by side; this is a third, and
  it follows the same pattern. **No migration of the old corpus is required** — which matters,
  because §3 argues the old corpus is on its way out anyway.
- `decks.js` already models this ("the Four Zones ARE the narrative tiers, plus a 5th deck for
  the Signal-Chamber conclusion"). ✅ nothing to change.
- 🔴 `advance.js` `TIER_MAX = 5` and `prompt.js`'s hardcoded "ladders 1..5" both still assume the
  old shape. Narrative now maxes at 4. The lexicon's tier cap can stay at 5 — zone-derived values
  simply never reach it — but the two constants above are load-bearing and wrong.

---

## 3. Where the real risk is: the corpus swaps shape

This is the thing to be careful about, and it is not a code problem.

The 720 live records are flat `npc`/`lore_fragment`/`item`/`rumor`/`plot_beat`/`creature`. The
coming content pass is `room_bundle`s. Those are not additive — a room bundle *is* an npc plus a
lore fragment plus a room. Running both corpora at once means every NPC exists twice in different
shapes, with different ids, gating different flags.

So the content pass is a **replacement**, and a great deal of hard-won tuning sits downstream of
the corpus it was tuned against:

| Downstream of the corpus | What it assumes today |
|---|---|
| `weave.js` — the seeded keeper cast | a pool deep enough per (tier, tag) to seat every gate satisfier |
| `mystery.js` — the tier-2 murder | "unused ward bundles" to pad suspects, and one to retire as the victim |
| `solvable.js` / `prove-solvable.mjs` | the live morphyx pool proves progressable |
| `prove-weave.mjs --sweep 100` | seeded casts progressable across 100 world seeds |
| the id de-collision work | hoopy's records frequently carry no `id` (the Kaelen Voss soft-lock) |
| `anchors.js` | Olo/Solen/Sevin/Luna present, each carrying `load_bearing` + a gated turn-in node |

None of that is *wrong* under room bundles. All of it is **unproven** under them. The four
anchors in particular: if the content pass emits them as room bundles, they need the
`load_bearing` block and the hidden gated turn-in choice, or the advancement chain has no spine.

**Hence the recommendation in §0.** Sixteen bundles is a big enough sample to answer every
question above and small enough to fix by hand.

---

## 4. The three concrete gaps

### 4.1 🔴 `reactions` is authored and then thrown away

The rev's NPCs carry a **fixed 12-slot reaction table** — identical keys on all 16 NPCs:

`grief` · `shock` · `bribed` · `accused` · `flattered` · `questioned` · `threatened` ·
`caught_in_a_lie` · `authority_arrives` · `the_ship_shudders` · `someone_else_accused` ·
`asked_for_help_they_cannot_give`

`expandRoomBundle` builds the served npc as `{name, description, dialogue}`. **`reactions` is
dropped on the floor**, and nothing anywhere in `hoop/v110/` reads the word.

The measurement, over the 16-bundle sample:

| | count | chars |
|---|---|---|
| reaction lines | 192 | 17,033 |
| dialogue nodes | 65 | 12,740 |
| room + npc + lore prose | — | 15,375 |

**Reactions are 37.7% of all authored prose in the rev, and the engine consumes 0% of it.**
Twelve reactions per NPC against 4.1 dialogue nodes per NPC — it is the single largest authoring
cost in the content model and currently the single largest waste. Before the full pass generates
at scale, this needs to be either consumed or cut.

It should be consumed. §5 argues it's also the cheapest thing in the model, once it's derived
rather than written.

### 4.2 🔴 Nothing rolls a stat block

`hoop/v110/stats.js` is live and has the whole spine already: the **FLESH · CHASSIS · ANIMA**
triad, nine attributes, nine casts, `rollTriad`/`deriveAttrs`/`rollCharacteristics`/
`rollCharacter`, all seeded and pure. `rind/combat/` has a vendored copy plus a tuned engine,
solver, encounter generator and tech tree, with 85 invariants green.

And the seam is *free*, which I did not expect:

```js
export const VOCATIONS = {
  dwell: …, grow: …, make: …, mend: …, trade: …, serve: …, play: …,
  heal: …, learn: …, worship: …, govern: …, move: …, store: …,
};
```

**`VOCATIONS` is keyed by exactly the 13 verbs of the new bible.** Every room bundle already
carries the `verb` its room is built around. The NPC's vocation therefore requires no mapping
table and no authoring — it is `VOCATIONS[bundle.content.verb]`, an identity. (`rind/upperrind/
verbflow.js` independently defines `WARD_VERBS` as the six *exclusive* verbs, matching the
bible's faction clusters exactly. The structure wing and the story wing converged on the same
vocabulary without being told to.)

### 4.3 🔴 The generation lane reads the old bible

`hoop/worker.js` fetches `hoop/story/bible.md` from ASSETS and feeds it to `prompt.js` →
`sidequest.js`, which is what generates per-player side-quests. That file is **the old bible** —
no verbs, no zones, no regard economy, five revelation tiers, and "the ship is approaching
something."

So every generated side-quest is being grounded in superseded canon, and `prompt.js` explicitly
instructs the model to stay "grounded ONLY in the provided bible" and "never invent a setting the
bible doesn't support." It is faithfully producing off-canon content, by design, from a stale
input. This is a one-file fix with an outsized effect and it should land early.

---

## 5. The proposal: reactions *are* a stat block

**Decision (Mobius): derive, don't author.** Here is the concrete shape.

### 5.1 The observation

Twelve fixed slots, identical across every NPC, filled with formulaic prose:

> `questioned`: "The blue sleeve cuff meets the metal shelf as Shaban states the daily log."
> `threatened`: "The bleached linen tears under Shaban's grip."
> `flattered`: "Water flow rate checks occupy Shaban during the praise."

Each is *[this character's props and manner] × [a situation]*. That is not free prose — it is a
**reaction table**, and a reaction table is exactly what a stat block indexes into. Hoopy has
been hand-computing a lookup, 192 cells so far.

### 5.2 The mechanism

```
rollNpc(worldSeed, npcId, verb) →
  triad     = rollTriad(seed) leaned by VOCATIONS[verb].lean     // the verb IS the vocation
  cast      = castOf(triad)                                       // 1 of 9 temperaments
  attrs     = deriveAttrs(triad, power)
  chars     = rollCharacteristics(seed)
  bond      = a directed ref to another pool entity               // Cairn's bond
  omen      = one line of foreboding                              // Cairn's omen
```

Deterministic from `(world seed, npc id)`, so it satisfies invariant 1 — no unseeded randomness,
identical on every machine and across ATProto repos — and it costs zero bytes of content, zero
records, and zero authoring.

**The cast selects how each reaction plays.** A `Wrought` NPC's `threatened` and a `Wired` NPC's
`threatened` are different reactions, and the difference is mechanically grounded rather than
remembered. The arithmetic:

- **9 casts × 12 reactions = 108 template cells, authored once.**
- Against 12 × *every NPC in the pass* — 192 lines for the 16-item sample alone, and the sample
  is a sample.

Hoopy then authors only the **2–3 reactions that are genuinely specific to that character** —
the ones carrying plot, or a tell, or the character's one real secret — and the remaining 9–10
derive from cast × situation, wearing that NPC's own props. Authoring drops by roughly 80% on
the single most expensive axis in the model, and what he *does* write is the part that was always
worth writing by hand.

This is strictly better than the status quo in both directions: today all 12 are authored *and*
all 12 are discarded.

### 5.3 Why bond and omen are the right two Cairn imports

The rest of Cairn 2e — STR/DEX/WIL, HP, the ten inventory slots — should **not** come across.
hoop has its own triad, its own nine attributes, and a combat engine already tuned against them
in `rind/combat/`. Importing a second stat system would fork the spine for no gain. What the
Cairn roller has that hoop doesn't is **two narrative hooks and one discipline**:

- **bond** — a relation to another entity. Use the importer's existing first-class `refs` field:
  a bond is a directed edge, so rolling bonds *builds the narrative graph for free*, and
  `spine.js`'s cosine-kNN thickness matching gets denser signal at no authoring cost.
- **omen** — one line of foreboding. Thematically this is the best fit in the whole proposal:
  under §1, **an omen is a conclusion reached without evidence** — precisely the mortal faculty
  the Seven lack and the player was built to have. Every NPC carrying one is the ship's
  population quietly demonstrating the thing the plot turns on.
- **the discipline** — *the seed is the permalink; the same string always rolls the same
  character.* `table.mino.mobi/cairn` is right about this and hoop already believes it
  (invariant 1). It's worth stealing the *presentation* too: a rolled NPC should be inspectable
  at a stable URL, which makes the stat blocks reviewable by hoopy in the same way the content
  rev is.

### 5.4 Where it lives

`hoop/v110/story/statblock.js` — pure, DOM-free, node-tested, importing `../stats.js`. It is a
*read* of a content item, not a mutation: nothing needs to be re-imported, no lexicon changes, no
records written. It can ship before the content pass and apply retroactively to the 138 existing
flat NPCs as well as to every bundle that follows.

❓ **One open call:** `rind/combat/stats.js` is a vendored copy of hoop's spine, and the README
says re-sync rather than fork. If NPC stat blocks are meant to feed `rind/combat`'s encounter
generator (i.e. NPCs become fightable), that's a real feature and a much larger scope. I'd keep
it out of this pass and note it as the obvious next one.

---

## 6. The rinds — ❓ open slot

**This section is deliberately unwritten.** Mobius has a concept for the rinds that is not in the
repo and not in hoopy's bible, and guessing at it would be worse than leaving the hole visible.

What is *available* to the concept, so it doesn't have to invent from nothing:

- **The bible's own answer**: the Seven as rind factions — upper rind = Mars/Mercury/Venus/
  Jupiter ("where the strange is still familiar"), lower rind = Saturn/Sol/Luna ("the domains
  that predate civilization"). The 16-item sample already tags bundles this way.
- **The `rind` surface** (`rind.mino.mobi`, branch `claude/upperrind-thread-styling-p7dhwu`): the
  ops weave is a complete K(6,8) — **6 white arms, two per faction (Rindwalker · Continuant ·
  Drift)** crossed with 8 production engines, with proven wayfinding, one-door connectivity, and
  a generated room per voronoi chamber. The new bible's Zone 2 is "**six faction wards, two per
  faction**." Those are the same object, arrived at independently on two branches.
- **`rind/upperrind/`**: `ringweave`, `verbflow` (with `WARD_VERBS` = the six exclusive verbs),
  `machinehall`, `fluxfield`, `ringpocket`, `econ` — all node-tested.
- **`hoop/v110/`**: the dev upper-rind start (`?dev=1&start=rind`) and the keeper-stacking fix
  landed specifically so rind keeper placement could be tested on the real floor.

**What the concept has to decide**, for this document to absorb it mechanically:

1. Is the rind's *geometry* the game's zone-3/4 floor (i.e. hoop walks on rind's generated foam),
   or does hoop keep its own chunkgen and borrow only the rind's vocabulary?
2. Do the Seven's seven domains and the ops weave's six arms + 8 engines reconcile, or are they
   different objects that merely rhyme?
3. Does the upper/lower split fall where the bible puts it (familiar-strange vs
   predates-civilization), or somewhere the concept prefers?
4. What is the *player's* verb in the rind? In the Nave they gather and are acted upon. §1 says
   the rind is where perception shifts to the ship's timescale — the concept should say what that
   feels like to play.

Answering 1–4 is enough; the rest of this document then follows.

---

## 7. The merge candidate

Ordered by what unblocks the most, with an explicit gate on each. **P0 items should land before
hoopy generates the full pass** — that is the entire point of the ordering.

| # | Work | Why now | Gate |
|---|---|---|---|
| **P0-a** | **Run the 16-item sample through the live pipeline.** Import → `review.js` → `gates.js` → `validate.js` → `weave.js` → `solvable.js`. Commit it as a fixture. | The one action that converts every 🟡 in this doc into a ✅ or a 🔴. Costs an afternoon; the alternative is finding out at 500 records. | The sample imports clean, or we have a written list of exactly what it trips. |
| **P0-b** | **Re-sync `hoop/story/bible.md` to the new bible.** Fix `prompt.js`'s "ladders 1..5" and `advance.js`'s `TIER_MAX`. | The generation lane is actively producing off-canon content from stale input (§4.3). One file, outsized effect. | A generated side-quest mentions verbs/zones and doesn't say "approaching." |
| **P0-c** | **Zone → tiers in the importer** (§2.3). Third schema alongside FLAT and NESTED; legacy corpus untouched. | hoopy stops authoring tiers before he authors hundreds of them. | The 16 bundles derive n1–n4 from zone with no tier fields present. |
| **P0-d** | **Answer the four rind questions** (§6). | Zones 3–4 are half the content pass. Hoopy should not generate upper/lower-rind bundles against an unsettled concept. | This document's §6 gets written. |
| **P1-a** | **`statblock.js`** — roll from `(seed, id, verb)`; bond via `refs`; omen. Node-tested. | Ships independently of the content pass; applies retroactively to the 138 existing NPCs. | Determinism selftest; a rolled block for all 16 sample NPCs, reviewed by eye. |
| **P1-b** | **Consume `reactions`** — carry them through `expandRoomBundle`, and add the 9 × 12 cast template bank so unauthored slots derive. | Recovers 37.7% of authored prose from the floor and cuts hoopy's per-NPC cost ~80% (§5.2). | An NPC with 3 authored reactions and 9 derived ones is indistinguishable in play. |
| **P1-c** | **Anchors as room bundles** — confirm Olo/Solen/Sevin/Luna carry `load_bearing` + gated turn-in nodes in the new shape. | If the content pass ships anchors without these, the advancement chain has no spine (§3). | `anchors.js` derives the full four-stage chain from the new-shape pool. |
| **P2-a** | **Verb coverage** — `mend`, `heal`, `play`, `move` are absent from the sample; two are *exclusive* faction verbs (§2.2). | Under-serving Rindwalker `mend` and Drift `play` weakens the faction choice at the exact moment it's made. | Every exclusive verb appears in ≥2 zones. |
| **P2-b** | **Declare `neutral`** as a faction value rather than an emergent tag. | Cheap now, a drifting tag later. | It's in the enum. |
| **P2-c** | **Corpus cutover plan** — the 720 flat records vs the incoming bundles (§3). | Not urgent until the pass exists, but it must not be improvised at cutover. | A written decision: replace, or coexist with a lane split. |

Two things deliberately **not** in this list: importing Cairn's stat system wholesale (§5.3), and
making NPCs fightable through `rind/combat` (§5.4). Both are real and both are the next pass.

---

## 8. Verified vs. not

**Verified in the sandbox:**
- The rev fetched clean (222,758 bytes, HTTP 200); 16 `room_bundle`s, all `pending`; every field
  count, verb/zone/faction matrix and prose measurement in §2.2, §4.1 and §5.2 was computed from
  the file, not estimated.
- `world_export.json` type census (720 records, 0 room bundles) — computed.
- `expandRoomBundle`, `decks.js`, `factionchoice.js`, `conclusion.js`, `anchors.js`,
  `mystery.js` read directly; `VOCATIONS` keyed by the 13 verbs and `WARD_VERBS` as the 6
  exclusive verbs — both read directly.
- `reactions` appears nowhere in `hoop/v110/` — grepped.
- `hoop/story/bible.md` is the old bible and `worker.js` serves it to `prompt.js` — read.
- `table.mino.mobi/cairn` is live; its model (seeded, permalink-as-seed, background/bond/omen/
  ten slots) taken from the page's own metadata.

**Not verified:**
- **Nothing here was run.** No selftest was executed, no import was performed against the sample.
  P0-a exists precisely because this document is a reading, not a test result.
- The `<pre>` blocks in the rev show the bundle's `content` object; `tags`, `produces`, `refs`
  and `status` are rendered *beside* them in the review UI. I've assumed the full export record
  wraps `content` with those fields — which is the shape `expandRoomBundle` already expects — but
  I could not confirm it from the HTML alone. **If the export omits `produces`, `gates.js`
  reachability breaks quietly**, and P0-a is where that surfaces.
- Whether the coming pass replaces or extends the 720 records. Assumed replacement (§3).
- The rind concept (§6), which is Mobius's and unstated.
- Anything requiring a deploy, a PDS write, or Cloudflare — this sandbox cannot.
