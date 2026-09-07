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
>
> ---
>
> **Update — P0-a is done, and the nave has its own brief now.** The 16-item rev has been run
> through the live pipeline. Results, replacing the readings below where they differ:
> - **The rev imports and reviews clean** — 16 bundles → 32 items, unique ids, `verdict: PASS`,
>   0 conflicts. §2.2's schema reading was right and `expandRoomBundle` is now ✅, not 🟡.
> - **§4.1 confirmed by execution**: `reactions` really is dropped on import.
> - **§4.3's worry about `produces` was unfounded** — the review harness does carry it, and
>   `gates.js` reachability is fine.
> - 🔧 **§2.3 correction**: I flagged `ZONE_TIER.wards = 1` as inconsistent with the bible's
>   tier 2. It isn't — `ZONE_TIER` is the tier at which a zone becomes *reachable*, and the whole
>   nave is walkable from tier 1. No bug.
> - **New blocker, not visible on paper**: the rev contains **no load-bearing anchors**, so
>   `proveProgression` returns `no_anchors` — a set of rooms, not a campaign. Adding the two nave
>   anchors and two missing gate-setters flips it to `solvable: true` (verified synthetically).
>
> The nave half of the work now lives in **[`NAVE-CONTENT-BRIEF.md`](NAVE-CONTENT-BRIEF.md)**, with
> `scripts/nave-readiness.mjs` as its gate. The rinds (§6) are being reworked separately.

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

## 6. The rinds — the foam dungeon

**The concept (Mobius): the rind is the foam dungeon roller**, built on
`claude/foam-dungeon-generator-aoaz0j` and live at `foam.mino.mobi/dungeon/`. Zones 3–4 stop
being more hoop and become a **dungeon crawl** over generated voronoi foam.

The right way to read this is that it is a **genre change, not a set change** — and that the
genre change *is* the narrative one. The bible already asks for it in as many words: zone 4 is
"down into the deep where **the ship stops pretending to be a city at all**." Zones 1–2 are a
social game — you gather lore by talking, inside the regard economy. Zones 3–4 are a crawl — you
gather lore by descending. Mobius's note that "it will take a bit of doing to get it to feel
right" is correct, and §6.4 is my honest list of where the doing is.

### 6.1 Why this is the right object and not merely a nearby one

The rind **is** voronoi foam. That is canon in both bibles — "the Voronoi-foam chambers of the
outer rind, the maintenance tunnels, the dark axial shafts," "the deep chambers nobody maps."
The foam dungeon generates precisely that object, and three of its properties are ones hoop would
otherwise have to build:

- **It descends by construction.** Paths are shortest by door count from the entrance, and among
  equally short continuations always the maximal gradient *down*. foam's own CLAUDE.md puts it
  best: *"the puzzle's oracle climbs; the dungeon descends."* Zones 3–4 are a descent. Free.
- **Determinism is the contract**, in exactly hoop's terms — seed + params → byte-identical
  output, forever, under a pinned `DUNGEON_VERSION` with golden signatures of known seeds
  in CI so the algorithm cannot drift under a published permalink. That is invariant 1 with
  a version stamp bolted on, which is stricter than what hoop currently enforces on itself.
- **Every door is a *certified crossing*** — the kernel proved a standing body can walk through
  it. Same discipline as `solvable.js` / `prove-solvable.mjs`: a generated world is not shipped
  until an oracle certifies it traversable. Two oracles, one doctrine.

### 6.2 Five mechanics that land directly on the bible

**(a) The tiling shift is the feel — and it is a parameter.** The generator carries ten tilings:
`grid`, `hex`, the aperiodic rhomb families (`penrose`, `ammann`, `seven`), `rhombille`, and four
mixed Archimedean tilings. The bible asks the upper rind to be "vast, liminal,
**uncanny-familiar**" and the lower rind to be "cosmic, machine-sacred," the domains "that
predate civilization." So: **hex in the upper rind** — familiar, and the ops weave's own
geometry — and **aperiodic in the lower rind**, a floor that never repeats. The wrongness of the
deep stops being described and becomes something underfoot. This is the cheapest large win
available anywhere in this document: one parameter, and it does the register change that three
paragraphs of prose otherwise have to.

**(b) Twin dungeons are the faction you didn't choose.** `twin=1` puts two dungeons in one foam:
territories split by simultaneous BFS from two entrances, each side's paths, loops and passages
planned entirely inside its own territory, and — CI-pinned — **they provably never connect.**
They interleave in 3D, and the crawler renders the other side as **ghost geometry through the
seams: visible, never enterable.**

`factionchoice.js` already implements the upper-rind threshold, and the bible says the choice
"colors the descent." Twin mode makes that geometric: you walk your faction's descent, and
through sealed membranes you can *see* the descent you declined. And `conclusion.js` weighs "the
lore you saw and **the lore you didn't**" — under twin mode the lore you didn't see is not
missing, it is rendered, adjacent, and unreachable. I think this is the strongest single idea in
the whole synthesis, because it makes an abstraction into a place.

> ❓ One wrinkle: twin is *two* sides and there are *three* factions. Either (i) twin your chosen
> faction against your runner-up by affinity — which makes the ghost the road you nearly took,
> and is better than an arbitrary pairing — or (ii) generalise the territory split to k sides.
> The generator already does simultaneous BFS from two entrances; k-way is the same algorithm.

**(c) Trapdoors and secret corkscrews are Sevin's routes.** A `trapdoor` is a one-way drop
through the floor membrane into the chamber beneath (geometrically real — the tile's floor face
is the landing chamber's ceiling), opening a corkscrew of `secret: true` rooms that surfaces
through a two-way `hatch` somewhere else. That is a mechanical statement of "they know which
tunnels go somewhere and **which were sealed for reasons nobody wrote down**." Gate the trapdoor
mouths on Rindwalker standing and Sevin's trust, and route-access — the thing the Rindwalkers
organise around instead of hierarchy — becomes a payout the faction choice can actually make.

**(d) Endpoints are the Signal Chamber problem, already solved.** The generator rolls *n*
endpoints deep in the foam and guarantees each holds a treasure and a guardian. The lower rind's
task is to "locate the Signal Chamber, whose position has been lost to the sands of time."
So: *n* endpoints, one of which is real, and gathered chamber-lore tells you which.
`conclusion.js`'s `cl.gathered → flag.signal_located` stops being a counter and becomes a
*deduction* — a direct upgrade to something already built and tested, not a new subsystem.

**(e) `rollContent` is `weave.js` for the rind.** This is the load-bearing architectural find.
Content is a separate deterministic roll on top of frozen geometry, keyed `(mapSig, roll,
tuning)`, and the roller enforces, CI-pinned: one thing per tile; door/entrance/goal markers
reserved; the entrance room is safe ground; every endpoint holds a guardian; and **obstacles
never sever the dungeon** — placement is re-checked against the crawl graph and *repaired* before
the roll returns.

That is hoop's placement problem with a guarantee hoop does not currently have. `weave.js` seats
keepers so the gates are satisfiable; `rollContent` seats agents so the world stays connected.
Swap loot/traps/enemies for keepers/lore/errands and the rind gets non-severing placement for
free. The `gradient` dial (+1 ramps hostiles toward the endpoints, 0 flat, −1 inverts) is a
ready-made escalation control for the descent.

### 6.3 The four questions from §6 of the previous pass, now answered

1. **Geometry** — foam's, not hoop's chunkgen, for zones 3–4. hoop keeps chunkgen for the Nave.
2. **Seven domains vs. the ops weave** — they do *not* reconcile as they stand (two twin sides,
   six white arms, seven domains are three different partitions). This is the largest genuinely
   open piece; see §6.4.
3. **Upper/lower split** — where the bible puts it, and now *expressed* rather than asserted:
   tiling family, `gradient`, and whether twin is on.
4. **The player's verb** — **the movement budget**, and this is the real answer to "a totally
   different feel." The crawler is VTT-style: a slider sets tiles-per-turn, legal squares light up
   shaded by cost, doors in reach glow, clicking walks the shortest path, *end turn* refreshes.
   Adopt that in the rind and nowhere else and the timescale shift becomes playable: you stop
   being a person walking around and become **an instrument taking readings**. §1 says you were
   built to perceive on the ship's timescale — budgeted, deliberate movement is what that feels
   like from inside. The mechanic and the premise say the same thing.

### 6.4 Where the doing actually is

Honest friction list, roughly in descending order of difficulty.

| Friction | Why it's hard | The shape of the answer |
|---|---|---|
| **The Seven's domains have no representation in the format** | The export knows `side: 0\|1` (twin) and nothing else about territory. Seven domains is a k-way partition of one foam. | Generalise the simultaneous-BFS territory split to k seeds — the algorithm twin mode already runs. Fallback: domains as **depth bands** rather than regions, which is weaker but nearly free. |
| **Movement-model collision** | hoop is free-roam; the crawl is budgeted turns. Grafting one onto the other is exactly the "feel right" problem. | Don't graft. Keep the **upper rind free-roam** as the transition and turn the budget on **in the lower rind only** — so the budget *arriving* is the deep announcing itself, which is the beat you want anyway. Prototype this before committing to it. |
| **Authored room ↔ generated chamber impedance** | hoopy authors *"Gantry 78 Inboard"*, `verb: govern`, `faction: jupiter`. The dungeon emits chambers with `area`, `depth`, `tiles`, `doors`, `onPaths`. A forge-cathedral needs to actually be big. | Not a rewrite — a matcher. `area`/`depth`/`onPaths` are all in the export, and `spine.js` already does cosine-kNN matching of content to chunk characteristics. Extend that to chambers. |
| **The Nave↔rind seam** | Two world engines meeting at one door (Sevin's shaft). | It has to be a *place*, authored, not a loading screen. The v110 dev start (`?dev=1&start=rind`) already exists to test exactly this handoff. |
| **Density inversion** | A dungeon is 100–1000 chambers (`s`…`xl`); a zone is a handful of authored bundles. Most chambers will be unauthored. | Fine, but be deliberate: the rind is **procedural with authored keepers seeded in** — the inverse of the Nave, where authored content is the substrate. That inversion is itself part of the different feel, and `rollContent` furnishes the remainder. |

### 6.5 How to depend on it: vendor, don't call

`foam` is its own surface (`foam.mino.mobi`, owning branch `claude/voronoi-foam-interactive-keo0uy`),
and the dungeon work is on a *third* branch. Three recommendations:

- **Vendor the modules; don't call the API at runtime.** hoop's discipline is that "the
  procedural + localStorage path is the guaranteed fallback" — a runtime HTTP dependency on
  another surface breaks that outright. hoop already vendors `wayfind.js` from `rind`, so the
  pattern is established: take `dungeon.mjs`, `dungeon-crawl.mjs`, `dungeon-content.mjs` into
  `hoop/v110/vendor/foam/` **verbatim, re-sync never fork**, the `vendor/auth.js` rule.
- **Use the HTTP API for authoring and preview.** `GET foam.mino.mobi/api/dungeon?…` is CORS-open,
  edge-cached and deterministic — ideal for hoopy to summon a rind floor and look at it while
  authoring bundles against it, and for a preview harness. Just not on the player hot path.
- **Pin `DUNGEON_VERSION` into the world seed.** It's stamped in every export and in
  `x-dungeon-version`, and a bump legitimately moves layouts (v2 removed flat ground, v3 added
  trapdoors, v4 added loops). An unpinned bump silently relocates every rind floor for every
  player *and* invalidates every crystallization they've saved against it. Treat the generator
  version as part of the seed — this is invariant 1, and it is the one way this integration can
  quietly corrupt player state.

> ⚠️ **The branch is not a clean source.** `claude/foam-dungeon-generator-aoaz0j` is 574 files and
> ~1.97M insertions ahead of `main`, most of it unrelated (`words/`, `plant/foamworld.js`,
> `voronoi/`, auth scope changes). The dungeon itself is ~20 files under `foam/`. Vendoring should
> take only those; the branch as a whole needs its own merge-candidate pass and should not be
> conflated with this one.

---

## 7. The merge candidate

Ordered by what unblocks the most, with an explicit gate on each. **P0 items should land before
hoopy generates the full pass** — that is the entire point of the ordering.

| # | Work | Why now | Gate |
|---|---|---|---|
| **P0-a** | **Run the 16-item sample through the live pipeline.** Import → `review.js` → `gates.js` → `validate.js` → `weave.js` → `solvable.js`. Commit it as a fixture. | The one action that converts every 🟡 in this doc into a ✅ or a 🔴. Costs an afternoon; the alternative is finding out at 500 records. | The sample imports clean, or we have a written list of exactly what it trips. |
| **P0-b** | **Re-sync `hoop/story/bible.md` to the new bible.** Fix `prompt.js`'s "ladders 1..5" and `advance.js`'s `TIER_MAX`. | The generation lane is actively producing off-canon content from stale input (§4.3). One file, outsized effect. | A generated side-quest mentions verbs/zones and doesn't say "approaching." |
| **P0-c** | **Zone → tiers in the importer** (§2.3). Third schema alongside FLAT and NESTED; legacy corpus untouched. | hoopy stops authoring tiers before he authors hundreds of them. | The 16 bundles derive n1–n4 from zone with no tier fields present. |
| **P0-d** | **Rind spike: vendor + one real floor.** Vendor `dungeon.mjs`/`dungeon-crawl.mjs`/`dungeon-content.mjs` into `hoop/v110/vendor/foam/` with `DUNGEON_VERSION` pinned; generate one upper-rind floor and one lower-rind floor; place the sample's 8 rind bundles into their chambers by `area`/`depth`. | Zones 3–4 are half the content pass, and §6.4's frictions are all discovered by doing this once. Hoopy should not author rind bundles until we know what a chamber can host. | Two floors exist, crawlable, with the 8 sample bundles seated — or a written list of what stopped it. |
| **P0-e** | **Feel prototype: the movement budget in the lower rind only** (§6.3.4). Free-roam upper, budgeted lower. | This is the "bit of doing to get it feel right," and it is cheap to try and expensive to assume. Everything downstream of the rind's genre depends on whether this lands. | Somebody walks both and says which one is the game. |
| **P1-a** | **`statblock.js`** — roll from `(seed, id, verb)`; bond via `refs`; omen. Node-tested. | Ships independently of the content pass; applies retroactively to the 138 existing NPCs. | Determinism selftest; a rolled block for all 16 sample NPCs, reviewed by eye. |
| **P1-b** | **Consume `reactions`** — carry them through `expandRoomBundle`, and add the 9 × 12 cast template bank so unauthored slots derive. | Recovers 37.7% of authored prose from the floor and cuts hoopy's per-NPC cost ~80% (§5.2). | An NPC with 3 authored reactions and 9 derived ones is indistinguishable in play. |
| **P1-c** | **Anchors as room bundles** — confirm Olo/Solen/Sevin/Luna carry `load_bearing` + gated turn-in nodes in the new shape. | If the content pass ships anchors without these, the advancement chain has no spine (§3). | `anchors.js` derives the full four-stage chain from the new-shape pool. |
| **P2-a** | **Verb coverage** — `mend`, `heal`, `play`, `move` are absent from the sample; two are *exclusive* faction verbs (§2.2). | Under-serving Rindwalker `mend` and Drift `play` weakens the faction choice at the exact moment it's made. | Every exclusive verb appears in ≥2 zones. |
| **P2-b** | **Declare `neutral`** as a faction value rather than an emergent tag. | Cheap now, a drifting tag later. | It's in the enum. |
| **P2-c** | **Corpus cutover plan** — the 720 flat records vs the incoming bundles (§3). | Not urgent until the pass exists, but it must not be improvised at cutover. | A written decision: replace, or coexist with a lane split. |
| **P2-d** | **k-way territories** in the foam generator, so the Seven's domains are regions (§6.4). | The bible's rind factions have no home in the format until this exists. Depth bands are the cheap fallback. | Seven domains partition one foam, CI-pinned like twin's zero-leakage check. |
| **P2-e** | **Twin as the road not taken** (§6.2b) — chosen faction vs. runner-up by affinity, ghost geometry through the seams. | The single best payoff available, but it depends on P0-d and P0-e landing first. | You can see the descent you declined and never reach it. |

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
- The foam dungeon: `FORMAT.md`, `foam/CLAUDE.md` and the module export lists read directly off
  `origin/claude/foam-dungeon-generator-aoaz0j`. Every §6 claim about trapdoors, twin mode,
  tilings, certified crossings, `rollContent`'s guarantees, the movement budget
  (`reachableWithin`) and the API is quoted from that spec, not inferred.
- That branch's diffstat vs `main` (574 files, ~1.97M insertions, ~20 dungeon files under
  `foam/`) — computed.

**Not verified:**
- **Nothing here was run.** No selftest was executed, no import was performed against the sample.
  P0-a exists precisely because this document is a reading, not a test result.
- The `<pre>` blocks in the rev show the bundle's `content` object; `tags`, `produces`, `refs`
  and `status` are rendered *beside* them in the review UI. I've assumed the full export record
  wraps `content` with those fields — which is the shape `expandRoomBundle` already expects — but
  I could not confirm it from the HTML alone. **If the export omits `produces`, `gates.js`
  reachability breaks quietly**, and P0-a is where that surfaces.
- Whether the coming pass replaces or extends the 720 records. Assumed replacement (§3).
- **No dungeon was generated.** §6 is read off the spec and the module signatures; I have not run
  `generateDungeon`, crawled a floor, or tried to seat a room bundle in a chamber. The impedance
  question in §6.4 — whether an authored room's *meaning* fits a generated chamber's *shape* — is
  the one I'd least trust on paper, which is why P0-d is a spike and not an implementation.
- Whether the budgeted-movement feel actually works in the lower rind (P0-e). Nobody has walked
  it. This is a taste judgement and it belongs to Mobius, not to this document.
- Anything requiring a deploy, a PDS write, or Cloudflare — this sandbox cannot.
