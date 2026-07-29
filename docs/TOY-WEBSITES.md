# Five little toy websites worth making next

Companion to [`HARDWARE-TOYS.md`](HARDWARE-TOYS.md), same exercise, different
economics — and the difference is the whole point.

A hardware toy is gated by **unit cost**: 1000 units of a $24 BOM is $24k of
committed money, so the question is whether anyone will pay. A website's
marginal cost here is approximately zero — a thin assets Worker, no build, no
secrets, free tier. So the scarce resource is not money, it is **attention and
the maintenance tail**. Every new surface is a registry entry, a workflow, a
`CLAUDE.md`, a preflight obligation, and a row in a 74-row table that someone
has to keep true. That is the real price, and it is charged monthly, forever.

So the bar is the mirror of the hardware bar: *not* "would a thousand people pay
for this" but **"would a thousand people use it, and does it get better because
they did."** A toy that is identical at one user and a thousand is a page, not a
surface — those belong in the root bundle as one of the 248 catalogue entries,
not as a new subdomain. All five below get better with a crowd.

Checked against the 248-entry landing catalogue and all 74 registered surfaces
for collisions. Notes on near-misses are in each entry.

---

## 1. The Habitat HOA — bylaws for a rotating home, generated from its physics

**Interest:** the O'Neill pack (`hoop`, `rind`, `tide`, `iris`, `biome`, `duck`,
`mega`) crossed with `polis`/`civ`. The pack models structure, thermodynamics,
ecosystem, flight, and the end-cap. It does not model **neighbours**.

Enter a habitat radius and spin rate and it generates the homeowners'
association ruleset that follows from those numbers, with citations to the
physics. Not jokes bolted on — *derived*:

> **§4.2 Quiet hours.** No spin-up laundry between 22:00 and 06:00 ship time.
> A 6kg imbalanced load at 1.4 rpm is detectable in Sector 3 (see §11,
> *Nutation Complaints*).
>
> **§7.1 Ball games.** Prohibited spinward of the tram. A thrown ball deflects
> 1.9m over 20m at this spin rate; the Association is not liable for windows
> struck by residents who "aimed straight."
>
> **§9.4 Tall plants.** Trees exceeding 4m must be registered. Your tree
> weighs less at the top than at the base and residents consistently
> underestimate this. See the 2041 Incident.

The joke is that petty neighbourhood tyranny is a *rigorous consequence* of
rotational mechanics, and every absurd rule is correct. The seed is a permalink,
same as `fipo/` and `borges/` — so a habitat's bylaws are citable, and the
regulars will start arguing about §4.2 as though it governs them.

| | |
|---|---|
| Reuses | the rotation and Coriolis math already in `tide/` and `rind/`; the seeded-genome sampler pattern from `fipo/pitch/engine.js` (xmur3 + mulberry32); the pack's visual language |
| Build | pure static, no build, no auth — one assets Worker |
| The thousand | a thousand generated habitats is a corpus, and the funniest clauses want a vote — which is `poll/` doing what it already does |
| Honest risk | the rules must be *actually derived*, not flavoured. Half-derived rules read as filler and kill the whole bit. This is a physics job pretending to be a comedy job. |
| Collision check | the pack has no governance surface; `polis` is city-cascade generation, `civ` is agent simulation. Clear. |

---

## 2. Asterisk — a live wall of everyone correcting their own typos

**Interest:** the firehose wing (`cat/`, `bisk/`, `feed/`, `zoom/`) and the
demonstrated taste for one absurdly narrow filter over a huge stream.

`cat.mino.mobi` is cats from the firehose. This is the same machine pointed at
the smallest possible unit of human embarrassment: reply posts that consist
only of a correction. `*the`. `*their`. `*I meant 2019`. `*not you`. Rendered as
a slow, quiet, endlessly scrolling wall.

The joke is entirely in the framing — no commentary, no scores, no engagement
mechanics, just the raw feed of people who could not let it go. It becomes
unexpectedly moving at volume, which is the version worth shipping: `*not you`
is a whole story. Optional second panel showing the corrected word next to what
it replaced, once you can resolve the parent — `*their` is funnier when the
original was `there` and much funnier when it was also `their`.

| | |
|---|---|
| Reuses | `cat/`'s firehose consumer nearly verbatim — swap the image-and-hashtag filter for a regex and a parent-post lookup; `atpolls-db` for the ring buffer |
| Build | one Worker, one page, one cron. The smallest surface in this document. |
| The thousand | the wall *is* the crowd — it does not exist at low volume. A thousand viewers also make the "top corrections of the week" digest work, which is `bisk/`'s existing pipeline |
| Honest risk | the filter is the product and asterisk-prefixed replies are a *heuristic*, not a schema. Expect to hand-tune against false positives (footnotes, emphasis, censored words) for a week. Also: it points at real people's small mistakes, so no names, no ranking, no dunking — ambient only. |
| Collision check | `cat` (images), `bisk` (digest), `novelty` (embeddings), `empathy` (perspective) — none filter on post shape. Clear. |

---

## 3. The Starter Cemetery — a public graveyard for dead sourdough

**Interest:** `bakery/` and the [`VISION.md`](VISION.md) thesis that a PDS is a
publishing house for whatever lexicon you point at it. Also the direct sibling
of the Starter Bell in the hardware doc — the sad ending to that toy.

You killed it. Write the obituary. It becomes a record on your own PDS, and the
site is a federated graveyard reading every one of them.

> **Gary** — 2019–2026. Survived three moves and a divorce. Killed by a
> two-week work trip and optimism. *Rye and stubbornness.*

Name, born, died, cause of death, one line of eulogy, optional last photo. The
cause-of-death field wants a controlled vocabulary and that is where the joke
lives: *neglect · travel · mould · roommate · confidence · moved house ·
girlfriend threw it out · thought it was fine.* Aggregate those and you have a
genuinely funny public health chart of a thousand deaths, which the
`packages/dataviz/` charts render for free.

It works because it is only half a joke. People are *actually a bit sad* about
this, the ceremony is real, and the object of grief is a jar of flour paste. The
site should be entirely straight-faced — serifs, plenty of whitespace, no
comedy in the chrome. Let the causes of death carry it.

| | |
|---|---|
| Reuses | the shared OAuth worker with a narrow scope (`repo:com.minomobi.bakery.memorial`), the PDS write path, `packages/dataviz/` |
| Build | one static page + one lexicon. No database — the records are the database, so we store nothing and pay nothing, per the vision doc |
| The thousand | a thousand obituaries is the chart, and the chart is the reason to visit twice. One obituary is a joke; a thousand is a folk archive |
| Honest risk | grief-shaped UI for a non-grief subject is a narrow beam — a single winking line of copy collapses it into a gag site. Also, memorials on someone's own PDS are permanent and public by design; say so plainly before the first write. |
| Collision check | nothing in the catalogue writes memorials or reads a cross-PDS collection this way. Clear. |

---

## 4. Wrong Units — a converter that refuses to give you a useful answer

**Interest:** the reference wing (`unit/`, `moji/`, `uni/`, `fix/`) — fast,
pastable, data-committed-at-build-time lookup sites. This is that wing's evil
twin, and it costs almost nothing because the data is already committed.

`unit.mino.mobi` converts correctly. This one converts *technically* correctly
into the least helpful unit available. Your rent, in loaves. Your commute, in
Coriolis deflections at 1.4 rpm. The Channel Tunnel, in sourdough starters laid
end to end. 5km, expressed as a fraction of the 4km habitat floor at
iris.mino.mobi. A conference talk, in units of the shortest proof of the
Szemerédi–Trotter theorem read aloud.

The joke is pedantic obedience: every answer is exactly right, to four
significant figures, with the conversion chain shown, and completely useless.
The chain display is what makes it more than a gag — watching *metres → habitat
floor → tram circuit → tram journeys → shifts* is the same pleasure as a good
dimensional-analysis exercise, and the units are drawn from our own sites, so
the whole thing is a directory of this repo disguised as a tool.

| | |
|---|---|
| Reuses | `unit/`'s committed conversion tables and its parser; every other surface donates its own absurd unit |
| Build | pure static, no build. Same skeleton as `unit/`, different unit graph and a shortest-path walk over it |
| The thousand | user-submitted units, voted — the unit graph is the crowd-owned part, and a thousand people will find worse units than we will |
| Honest risk | one-visit toy unless the units keep arriving; needs a submission path on day one or it is a page, not a surface. Genuine wrong answers are not funny, so `unit/`'s tables must stay the single source of truth — no hand-typed factors. |
| Collision check | `unit` is the correct converter; `unique`, `wc`, `font` are unrelated. Clear. |

---

## 5. Do You Know Your Own Website? — a flashcard game about this repo

**Interest:** entirely self-referential, and the most useful of the five. There
are 74 registered surfaces and 248 catalogue entries. Nobody remembers them
all. That is a funny problem to have and an expensive one to keep having.

Shown a description, name the subdomain. Shown a subdomain, name what it does.
Shown a screenshot, place it in one of the ten curated families. Spaced
repetition, streaks, a score. The joke is the score: **you will lose to your own
work.** The failure screen is the actual link, so every wrong answer is a
rediscovery.

It is also the only toy here that does a job. Half the maintenance burden in
this repo is *forgetting* — the stale branch, the surface with a placeholder
description, the site that has been 404ing for a month. This turns the review
pass into a game with a streak counter, and it is honest about it: an entry
whose description is uselessly vague is *unanswerable*, so the game surfaces
exactly the registry rows that need writing. Bad data becomes a visible bug in a
toy rather than an invisible rot in a table.

The public version is the better hook, unchanged: **74 sites, one person made
all of them, can you beat the person who did?**

| | |
|---|---|
| Reuses | `spec/data.js` (generated) + `spec/curated.js` families — the game *is* a renderer over the existing spec; `workers/scores` for the leaderboard, zero worker changes needed |
| Build | one static page over an already-generated dataset. The cheapest real surface available right now. |
| The thousand | a thousand players is an aggregate difficulty score per surface — which is a **legibility metric for the whole portfolio**, ranked worst-explained first. That is a maintenance tool nothing else here produces |
| Honest risk | the funniest possible outcome is that the owner scores badly, and that is also a genuinely useful signal, so it must not be quietly tuned to flatter. Screenshots need generating and keeping fresh, which is its own small pipeline — start text-only. |
| Collision check | `spec` renders the spec, `office` is a site map, `judge` is unrelated. Nothing plays it as a game. Clear. |

---

## If only one gets made

**Asterisk.** One Worker, one regex, one cron, no auth, no lexicon, no build,
and `cat/` has already solved every hard part. It could be live this afternoon,
and it is the closest of the five to the hardware doc's Needle: a small idea
made exactly once, correctly, with nothing to maintain.

**The one with the most upside is Do You Know Your Own Website?**, for the same
reason the Starter Bell won the hardware list — it is the only one that produces
something the others cannot. Every other toy here is finished when it ships;
this one pays a dividend in portfolio legibility every time someone plays it,
and it is built entirely from data that already exists and is already kept
current by preflight.

**Runner-up, cut for collision:** a cross-problem ladder over the extremal
geometry pack — place your points, lose to a specific dead mathematician, get a
certificate naming them. Cut because `heilbronn/index.html` already has the
drag-and-score interaction for its own problem, so the genuinely new part is
just an aggregator plus a `workers/scores` leaderboard. Worth doing, but it is a
feature of the math wing, not a surface.

---

## On the automatable workflow

Same split as the hardware doc, and the collision check is the part that
automates *best*: with 248 catalogue entries and 74 surfaces, "has this already
been built" is a question no human should answer from memory, and
`spec/data.js` + `index.html`'s catalogue answers it mechanically. That check is
what killed one idea in this document and reshaped a second.

What does not automate is the bar at the top — deciding that a toy only earns a
subdomain if it *improves with a crowd*, and that everything else belongs in the
root bundle. Applied honestly, that rule rejects most ideas, which is the only
reason a 74-surface repo stays navigable.

*(Nothing here is built. Reuse claims are from reading the surfaces named, not
from running them.)*
