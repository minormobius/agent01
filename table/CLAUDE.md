# table — table.mino.mobi

Procedural character sheets for tabletop RPGs. Repo-wide rules live in
[`../CLAUDE.md`](../CLAUDE.md); the index of all surfaces is
[`../docs/SURFACES.md`](../docs/SURFACES.md).

## Facts

| | |
|---|---|
| Surface | `table` |
| Dir | `table/` |
| Endpoint | `table.mino.mobi` |
| Type | frontend (thin assets Worker, no build, no D1, no secrets) |
| Owning branch | `claude/ttrpg-character-sheet-gen-886np4` |
| Deploy | [`.github/workflows/deploy-table.yml`](../.github/workflows/deploy-table.yml) |
| Uses | — |
| Provides | — |
| Serves | `/cairn`, `/cairn/kit`, `/cairn/trials`, `/cairn/run`, `/cairn/encounter`, `/cairn/arena`, `/cairn/items`, `/srd5`, `/srd5/corpus` |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) →
`surfaces[]` where `surface == "table"`.

## Why this surface exists

You cannot copyright a game's mechanics; you can copyright the text that
expresses them. A character generator is almost entirely that text — the table
entries, the gear lists, the background prose. So this surface only ever builds
on rules text that has been deliberately opened, and every generator ships its
system's attribution beside its data.

That constraint is the whole editorial line. The landing page carries the
current survey of which systems qualify and under what licence; keep it honest
if you add one.

## The shape every generator here follows

Copy `/cairn` when adding a system. Four rules, and the first two are load-bearing:

1. **The seed is the character.** Every sheet is a pure function of a short
   string. `#s=oak-fen-317` must roll the same person forever, so all draws come
   off one seeded stream in a **fixed order**. Appending a draw is safe;
   inserting one silently rewrites every permalink ever shared. The selftest
   freezes one sheet as a tripwire — if it fails, that is the change announcing
   itself.
2. **The licence ships with the data.** A `LICENSE.md` next to the tables naming
   the author, the source URL, and the licence; the same credit in the data
   file's header and in the page footer. Share-alike systems keep their
   share-alike — the adapted data goes back out under the same licence.
3. **Rules, not just randomness.** Compute what the system computes — Cairn's
   slots, bulk and armour caps — rather than printing a list for the player to
   total up. This is the difference between a generator and a shuffler.
4. **Show the dice.** Each sheet carries the roll log that produced it. A
   generator you cannot audit is not usable at a table where the dice matter.

No build step, no framework, no backend: plain ES modules loaded with
`<script type="module">`, everything client-side.

## /cairn — Cairn Second Edition

Cairn 2e is by **Yochai Gal**, CC BY-SA 4.0. Full attribution and the
obligations it puts on us: [`cairn/LICENSE.md`](cairn/LICENSE.md).

| File | What it is |
|---|---|
| `cairn/data.js` | **Generated.** The SRD's tables as JSON — 20 backgrounds (names, gear, two d6 tables each), 8 d10 trait tables, d20 bonds, d20 omens, the scars table |
| `cairn/tools/scrape-srd.py` | What generated it, from <https://cairnrpg.com/second-edition/> |
| `cairn/roll.js` | The dice and the rules. Pure logic, no DOM |
| `cairn/roll.selftest.mjs` | The tripwires. **Run this before touching either of the two files above** |
| `cairn/formation.js` | One party carried across all four screens: the seed plus every decision since |
| `cairn/formation.selftest.mjs` | 34 checks. **A formation that decodes wrong shows a plausible stranger** |
| `cairn/app.js` | The page: rendering, the two edits a player may make, print |
| `cairn/monsters.js` | **Generated.** The 84 bestiary stat blocks, parsed into numbers |
| `cairn/tools/scrape-monsters.py` | What generated it |
| `cairn/combat.js` | The encounter oracle: the combat simulator, the challenge metric, the bestiary search |
| `cairn/party.js` | What a party is good at, as four **measured** axes — the overview card's radar |
| `cairn/combat.selftest.mjs` | 145 checks. **A simulator fails silently — run this** |
| `cairn/items.js` | **Generated.** The marketplace, the 46 relics, the d100 spellbook table |
| `cairn/tools/scrape-items.py` | What generated it |
| `cairn/effects.js` | The mechanical vocabulary: what monster abilities and spells the simulator can see, and the count of what it cannot |
| `cairn/effects.selftest.mjs` | 43 checks. **Every ability must have a measurable effect, not just parse** |
| `cairn/delve.js` | Advancement: scars and loot on one axis, inside the ten slots |
| `cairn/study.js` | What a slot is worth — item value measured in the same currency as an encounter |
| `cairn/delve.selftest.mjs` | 49 checks over delve.js, study.js and items.js |
| `cairn/encounter/` | The oracle's page |
| `cairn/arena/` | One fight, drawn — watched, or piloted |
| `cairn/condition.js` | Kitting a party out: who gains most from what, **measured**, with error bars |
| `cairn/condition.selftest.mjs` | 53 checks. **The allocator's failure mode is confident nonsense — run this** |
| `cairn/overview-card.js` + `cairn/theme.css` | The party card's markup and styling, shared by two pages |
| `cairn/trials.js` | A ladder of real fights, with Cairn's recovery rules carrying between them |
| `cairn/trials.selftest.mjs` | 47 checks. **State that survives a fight is a new way to be wrong — run this** |
| `cairn/kit/` | The conditioning screen |
| `cairn/trials/` | The ladder's page |
| `cairn/run.js` | **The game.** Piloted ladder, rest-or-loot, and Cairn's Scars table as advancement |
| `cairn/run.selftest.mjs` | 41 checks. **One word — *exactly* 0 HP — carries the whole engine** |
| `cairn/run/` | The descent |
| `cairn/items/` | The item study's page |
| `page.check.mjs` | Loads every page of the surface in a real browser. **Run it when you touch a page** |

Regenerate the data (only when the SRD itself changes):

```sh
python3 table/cairn/tools/scrape-srd.py      > table/cairn/data.js
python3 table/cairn/tools/scrape-monsters.py > table/cairn/monsters.js
python3 table/cairn/tools/scrape-items.py    > table/cairn/items.js
node table/cairn/roll.selftest.mjs      # must pass; the frozen sheet is the check
node table/cairn/formation.selftest.mjs # must pass; a mis-decoded formation is a different party
node table/cairn/combat.selftest.mjs    # must pass; a wrong simulator looks right
node table/cairn/delve.selftest.mjs     # must pass; a wrong advancement model looks right too
node table/cairn/effects.selftest.mjs   # must pass; a mis-wired ability does nothing, silently
node table/cairn/condition.selftest.mjs # must pass; measuring has to keep beating guessing
node table/cairn/trials.selftest.mjs    # must pass; what carries between fights is easy to get backwards
node table/cairn/run.selftest.mjs       # must pass; the scar trigger is one word wide
```

### The formation — one party, four screens

`/cairn` rolls a party, the player edits it, `/cairn/kit` equips it and
`/cairn/trials` runs it. **Every screen rebuilds the party from the URL, so the
URL has to be the whole formation** — the seed, and then every decision layered
on top of it in order:

```
#s=oak-fen-317 & n=3 & e=0.sSD-f1!1.t0 & x=2.Q2hhaW5tYWls… & src=bought & h=12
   the roll      size  hand edits        typed items         kit settings
```

`formation.js` owns all of it: one `decodeFormation`, one `encodeFormation`, one
`buildParty`. **No screen downstream of the roller may call `rollParty`.** That
rule exists because the alternative shipped, and every screen after the first
was quietly showing a different party:

- the roller omitted `n` when it was 1, and the kit screen's default is 4 — a
  solo delver arrived as a party of four;
- attribute swaps, background picks, typed items and Fatigue never left the
  roller at all, because they were held in page state and the next screen
  re-rolled from the seed;
- the roller's own onward link read `location.hash`, which `render()` writes
  *after* drawing the link — so it was permanently one edit stale, and the last
  thing you did never travelled.

Three properties keep it honest, and each is a test:

1. **Operations, not results.** Edits are recorded as what the player did
   (`sSD` = swap STR and DEX), never as the resulting sheet. Two swaps sharing
   an attribute do not commute, so the order is replayed, not just the set.
2. **Offers are addressed by index, not label.** Two background offers can carry
   the same words; a label cannot tell them apart. Same bug the combat layer had
   with two sets of Soporific Darts.
3. **Defaults are arguments.** `decodeFormation(hash, { defaultSize })` — the
   roller passes 1, everyone else 4. Two hard-coded numbers in two files is how
   the size was lost; two visible arguments is survivable.

The browser check walks a fully edited party from the roller to the kit screen
to the trials and compares **the hash as well as the card**. That matters: when
the stale link dropped a Fatigue, all three radars still agreed — only the
missing `-f1` gave it away.

### The party overview card — a radar that had to earn it

The roller's config screen carries a radar of four axes and five role chips
(`cairn/party.js`). A radar plot is the easiest chart in the world to lie with:
pick axes that sound right, draw a pleasing shape, never check. So none of these
axes were chosen. Twenty candidates across two rounds were scored over parties whose casualties
were then **measured** against a five-encounter basket, and correlation decided
what survived. Four did; eight are kept in `REJECTED` with their numbers, because
a dropped axis is a finding — and the loudest of them is that **healing does not
predict survival in Cairn**. "Every party needs a healer" is not a fact here:
healing restores hit protection, and it is Strength that kills you.

**An axis must also VARY where it is drawn.** A second round of selection
happened after the first shipped, because `sweep` — blast weapons — was a
permanently empty spoke on the roller's card. Blast comes only from loot and
**0 of 3000 rolled characters own any**, so the axis predicted well for delved
parties and said nothing whatever about a fresh one: a quarter of the chart
wasted on the screen most people see first. It is a yes/no fact anyway, so it
moved to the `bomb` role chip, where yes/no facts belong.

Its replacement, `speed` (Dexterity), is the only axis here whose mechanism was
**isolated rather than inferred**. Cairn: *"During the first round of combat,
each PC must make a DEX save in order to act."* Take the same parties, shift
Dexterity ±3, and the toll moves by 0.073. Run the identical test with the
fight starting surprised — which is exactly that one save removed — and the
effect is **0.0000**. Not a correlation that survived a control: the single
rule that causes it, switched off and back on. It also beat every other
candidate on partial correlation with durability, damage AND grit held constant
(−0.53 fresh, −0.24 delved), and unlike `teeth` or `weakest` it works in both
regimes. Those two are in `REJECTED` with their numbers: `weakest` looked superb
at −0.64 and collapsed to −0.09 once mean durability was controlled, which is
to say it was measuring durability with extra steps.

Four traps this went through, all of which are the same trap:

- **A confound.** `carry` (free slots) correlated with deaths at **+0.75** until
  the delve count was held constant, at which point it flipped sign. Emptier
  packs were standing in for "has never delved". Every figure in `party.js` is
  measured with delves fixed, for that reason.
- **A weight guessed instead of measured.** Durability is `hp + 2 × armour`
  because ×1, ×2, ×3 and ×4 were all tried and ×2 was the most stable across
  delve levels — armour is subtracted from every hit, so it is worth several hit
  points and not one.
- **An axis that could not vary.** See `sweep`, above: it correlated, so it
  passed every check the suite had, and it was still dead on the page. The
  suite now asserts a non-zero spread for every axis in both regimes.
- **A sample too small to test the thing it was testing.** The validation test
  first sampled 26 parties, reported grit at **+0.42**, and appeared to refute
  the axis. At n=26 the standard error is 0.21: it was measuring noise. Measured
  properly, grit runs −0.39 / −0.25 / −0.16 / −0.08 across delves 0–3 — real for
  fresh parties, gone for veterans, and for a reason (Strength is only reached
  by damage that overflows hit protection, and three delves of armour make that
  rare). Sweep is its mirror: identically zero until someone finds a bomb.

Because two axes only exist in one regime, `corrByDelve` is a curve, `profile()`
weights each axis by the correlation **at that party's delve level**, and the
selftest measures both regimes and asserts the decay itself — not just a
threshold, which is what let the bad number through the first time.

### /cairn/kit — the conditioning screen, and its noise floor

Between the roll and the dungeon: a haul goes round the party and each thing
lands with whoever it averts the most casualties for, in the same currency the
oracle reports. Cairn has no classes, so there is no taxonomy to look a
"specialty" up in — the specialty is whatever the simulation says it is.

**The noise floor was measured before the allocator was written**, which is the
only reason any of it is trustworthy. On the three-encounter kit basket, one
holder in four, at 150 trials:

| item | averted | ± | signal/noise |
|---|---|---|---|
| Blast Sphere | 0.196 | 0.011 | 18 |
| Chainmail | 0.036 | 0.019 | 1.9 |
| Shield | 0.016 | 0.012 | 1.3 |

So "who should carry the bomb" is a question with an answer and "which of these
two trinkets is better" is not. Every gain carries a standard error — computed
by splitting each measurement into blocks and **differencing within each block**,
because before and after share their dice and pooling the two sides first throws
that pairing away and reports an error several times too large. Any choice made
inside that error is printed as a tie, resolved by a stated rule (most room in
the pack), and labelled as not-a-finding.

Two rules for anything added here:

1. **The claim is that measuring beats guessing, so it is measured.**
   `conditionByUtility` is `delve.js`'s instant hand-written ranking, and the
   selftest pits the allocator against it on parties neither has seen. It
   currently wins 7 of 8 (mean toll 0.150 vs 0.160, against 0.287 bare). If that
   ever reverses, `condition.js` is buying nothing with two seconds of
   simulation and should be deleted in favour of the ranking.
2. **The haul comes from `delve.js`'s loot table, not a second one.** A first
   draft wrote its own and weighted it per ITEM; the SRD has a hundred spells
   and six kinds of armour, so hauls came out half spellbooks. `delve.js`
   weights per KIND, which is correct and already shared.

### /cairn/run — the roguelite, and where advancement actually comes from

The other pages are instruments. This one is a game: you pilot every fight,
and between each you take **one** of a rest or a pack of three — never both,
because a choice you can decline to make is not a choice.

**CAIRN HAS NO EXPERIENCE CURVE, AND THIS DOES NOT INVENT ONE.** No XP, no
levels, no track. It has the Scars table:

> "Whenever a PC's HP is reduced to exactly 0, roll on the Scars table."

Nine of its twelve rows raise a maximum — *"roll 1d6, if the total is higher
than your max HP, take the new result"* — so a delver grows by surviving the
moment they nearly died and at no other time. It cannot be ground, only earned.

**EXACTLY** carries the rule. One more point of damage overflows into Strength,
which is critical damage and possibly death, and pays nothing. `combat.js`
records the flag at precisely that boundary and rolls nothing; `run.js` rolls it
afterwards off the run's own stream, because the fight's RNG is pinned
call-for-call by the fingerprint and a scar belongs to a character sheet rather
than to a combat.

Measured over 1,600 fights before any of this was built on:

| encounter | fights that scar | scars/fight | deaths/fight |
|---|---|---|---|
| 5 goblins | 34% | 0.44 | 0.04 |
| 4 skeletons | 37% | 0.43 | 0.03 |
| 3 wolves | 37% | 0.45 | 0.12 |
| 1 ogre | **12%** | 0.12 | 0.03 |

That is the shape a run needs: you brush death often and die rarely. The ogre
line is the mechanic showing its face — one big die overshoots zero into
Strength instead of landing on it, so **swarms make veterans and giants make
corpses**. Over whole runs it comes to 0.32 scars a rung, about 2.6 in an
eight-rung descent, with 48% of rungs being a single big creature. The selftest
guards that rate against collapsing to zero, because an advancement engine that
is correct and never fires is a treadmill.

The oracle is available on the spoils screen and **only advises**. It measures
who gains most from each card, shows the gain with its error bar, and applies
nothing. The difference between "here is the answer" and "here is what the
oracle thinks" is the difference between a tool and a game.

### /cairn/trials — a ladder, and the invariance that had to be admitted

Eight fights, really rolled, with the wounds carried between them. What carries
is Cairn's own recovery rules read as rules rather than as flavour, and none of
it is invented:

- **Hit protection comes back** — "a few moments' rest and some water".
- **Strength does not** — ability loss wants a week or magic. STR is what the
  run spends, and it is what kills you: damage overflows into it and 0 is death.
- **The fallen need somebody standing.** A PC on critical damage "will die in
  one hour unless stabilised by an ally", so a total party knock-down is a total
  party kill. That is why wipes here are absolute.

**Two ladder modes, because the obvious one is reward-invariant and shipping it
alone would have been a lie by omission.** The natural reading of "scales in
difficulty" is to search each rung against the party as they now stand. But a
rung is defined by a *toll* — so a party that has just been handed a blast
sphere is simply given a bigger fight, and the odds are exactly what they were.
Measured over 50 runs per cell:

| | bare | kitted + rewards |
|---|---|---|
| **scaled** (re-weighed each rung) | 44% ± 7 | 32% ± 7 |
| **fixed** (weighed once at the door) | 12% ± 5 | 40% ± 7 |

Under `scaled`, loot buys nothing — the difference is inside the error and if
anything points the wrong way. Under `fixed`, it more than triples completion.
So both are offered and the page says which is which.

The selftest does **not** re-run those rates: four runs a cell has a standard
error near 25 points and could not see a 28-point gap. An early draft asserted
mean depth instead and failed on noise, because depth saturates — nearly every
run reaches rung 7 or 8 regardless. A second draft predicted that a fixed
ladder's forecasts would read low as they went stale, and the measurement said
otherwise: `actual − forecast` is negative in *both* modes, because a single
fight usually beats its own mean (the toll distribution is skewed). What the
suite checks instead is the mechanism as a code fact — every `fixed` rung must
be exactly the rung the party at the door was weighed for, and a `scaled` one
must diverge from that once anybody is hurt.

One bug worth remembering: **a summon spell pushes an extra combatant onto the
party array mid-fight**, so reading the wounds back by index after the fight
wrote one delver's Strength onto another. It threw on the fifth party out of
twenty. Trials map roster entries to combatants by reference, and section 4 of
the selftest forces a summoner into a run rather than waiting for one.

### /cairn/encounter — the oracle

Cairn ships no challenge rating, no XP budget and no encounter table, deliberately. Rather than
invent one, the oracle **plays the fight**: it runs Cairn's combat rules a few thousand times
against the party the seed rolled and reports the distribution. Three rules govern anything you
add here, and all three are about not lying to a Warden:

1. **Say it is a floor.** The model fights to the last body with no terrain, tricks, talking or
   retreat — the thing Cairn is explicitly about avoiding. Every surface of the page says so.
2. **Mark what the model cannot see.** Abilities are modelled now (see below), but five creatures
   still carry prose no vocabulary reads, and those encounters are harder than the verdict says.
   Each verdict lists what it simulated *and* what it could not; never let one imply it covered the
   whole creature.
3. **Never dress our arithmetic as Cairn's.** The challenge metric, the loot table and the delve
   model are this site's invention. They are labelled as such in the code, in the UI, and in the
   footer.

### Who the party swings at — a measured policy, not an assumption

For a long time `pickTarget` chose a live foe **uniformly at random** for each
attacker, and a comment claimed the model "spreads, and spreading is the strong
play". Half of that was wrong: random is not spread, it is the *absence* of a
strategy, and it made the oracle over-report difficulty by playing the party
badly.

Cairn complicates the obvious fix. *"If multiple attackers target the same foe,
roll all damage dice and keep the single highest result"* — so focusing fire
**throws dice away**, unlike almost every other game. That makes "should the
party focus?" an empirical question, and it is now answered by measurement.
Mean toll over a nine-encounter basket:

| policy | mean toll |
|---|---|
| random (what this used to do) | 0.445 |
| focus | 0.447 |
| leader | 0.406 |
| spread | 0.392 |
| **smart** (the default) | **0.369** |

Two mechanical facts fall out, and both are why the composite exists:

- **Armour is subtracted from every hit**, so against an armoured foe many small
  hits are eaten one at a time and one pooled high die is not. Focus beats
  spread against skeletons (0.300 vs 0.346) and loses badly against goblins
  (0.400 vs 0.253).
- **A leader's death routs the group.** Against six bandits, focusing the leader
  is worth more than everything else combined: the oracle used to call that
  fight **lethal at a 57% wipe rate**, and a party that kills the leader first
  faces **14%**.

So `smart` is: focus the leader if there is one; else focus if the foes have
armour; else spread. It wins or ties every row of the basket, which is the only
justification for making it the default. All five policies are selectable on
the oracle page, because seeing the spread between them is the point.

**This re-froze the fingerprint.** Changing the default moved every published
number — one encounter in eight changes band — and the digest test is what
announced it. That was a deliberate re-freeze, and the only one so far.

### The challenge metric

Two numbers, defined in `combat.js`:

- **Toll** — the expected fraction of the party that does not walk away. An average, so it prices a
  whole dungeon: five toll-0.2 rooms cost about one character.
- **Swing** — the probability of a wipe. This is the tail, and toll does not imply it: a fight that
  always leaves one body and a fight that is free three times in four and total the fourth have the
  same toll and are completely different problems.

Bands come off both. The cut points are the only invented numbers in the model.

### Magic and abilities

Cairn puts all of its magic in objects, and half its bestiary fights with something other than a
damage die, so a simulator that sees only armour and dice is pricing a different game.
`effects.js` defines a small vocabulary of mechanical primitives (`disable`, `drain`, `critBonus`,
`impairedAgainst`, `regenerate`, `sunder`, `heal`, `summon`, …), reads the SRD's prose into it where
the prose is unambiguous, carries a curated table for the rest, and **counts the remainder**.

Current coverage, after a second pass that went through the leftovers one at a time:

| | |
|---|---|
| creatures with a modelled ability | **46 of 84** |
| creatures with prose still unread | **5**, each named in `OUT_OF_SCOPE` with the reason |
| spells simulated | **16 of 100** |
| spells combat-adjacent but excluded | **13**, each named in `SPELLS_OUT_OF_SCOPE` with the reason |
| spells that simply are not for fighting | **71** |
| relics doing something beyond their stat line | 5 |

Those numbers are printed on the pages — a coverage claim a reader cannot check is just
reassurance. The second pass roughly halved the "cannot model" pile and found that most of it was
phrasing rather than substance: a save written `save WIL` instead of `a WIL save`, a consequence in
the sentence after its trigger, an ability stated as a flat number.

Three rules for anything added here:

1. **An ability must have a measured effect.** The selftest compares `abilities: true` against
   `abilities: false` for each one. A parsed ability that does not move the toll is not modelled,
   it is decorative.
2. **Never approximate into the nearest shape.** If an effect is not expressible in the vocabulary,
   leave it unread and let it show up in the count. Guessing produces a number nobody can audit.
3. **The 71 spells with no combat mechanics are not a gap.** They are what Cairn's magic is for.
   Listing them as worth zero in a fight is only honest if the page says why.
4. **A creature must never be made SAFER by its own abilities.** Modelling them as "use the special
   instead of attacking" did exactly that to five creatures — a storm giant swapped a d12 great
   sword for a flat 4 STR clap and its toll fell from 0.68 to 0.10. Both sides now value their
   options in the same currency (`actionValue`, with a removed character priced at six damage) and
   take the better one. A sweep over the whole bestiary asserts the direction.

### /cairn/arena — watching one fight

A percentage does not teach anyone the game. The arena takes any encounter the oracle has weighed
and plays **one** of those fights back, event by event, on a phone-shaped map with a scrolling feed
under it. Cairn's damage chain — roll, subtract armour, take it off hit protection, overflow into
STR, save or take a critical — is the whole reason the game is lethal, and reading it happen line by
line is faster than any explanation of it.

The rule that keeps it honest: **the arena does not simulate anything.** `simulate(…, { events:
true })` records a structured event stream and `arena/app.js` only draws it. There is no second
combat implementation to drift out of step, and the selftest reconstructs the summary from the
events alone and requires them to match. If the replay looks wrong, the model *is* wrong — which is
the point, and is how the summon bug was found.

Two consequences worth knowing before changing it:

- **`{ events: true }` is opt-in and off in the oracle's hot loop.** The recorder allocates per
  event; five thousand trials must not pay for a picture nobody is watching.
- **The servant is the only combatant that joins mid-fight**, so the `cast`/`summon` event carries
  its whole stat line. Anything else added to the roster after round zero must do the same, or it
  fights as a name with nothing on the field.

On the art, since these were decisions rather than defaults: Cairn has no grid, no facing and no
positions, and the model simulates none — so the map is two facing ranks on bare ground and
deliberately **not** a tactical map. Drawing a battle grid would invent rules the game does not
have, in the one place a reader would believe them. Shape carries the side (party circles, enemy
diamonds) so the fight is readable without colour; each token shows a name, a hit-protection bar and
a state, and nothing else. A crowd stacks into ranks of eight and drops its labels — thirty
identical names are noise. Everything on the field is in **user units on a 100-wide viewBox**, where
1 unit is about 4px on a phone: a `font-size` or `stroke-width` that looks sane as pixels renders as
a rope. That trap has now been walked into twice.

### /cairn/arena — one fight, watched or played

Two modes over **one** engine. `combat.js` exports `fight()`, a generator:
`simulate()` drives it with nobody answering — that is what the oracle counts —
and the arena drives it with a person answering. Same dice, same rules, same
event stream; the only thing that differs is who picks the action, which is the
only thing that *should* differ.

That is not a stylistic preference. If piloting had its own combat code it
would be a second simulator wearing the first one's clothes, and the number on
the oracle page and the fight on the arena page could drift apart without
anyone noticing.

**Withdrawing lives in the piloted path and nowhere else.** The oracle is a
stand-and-fight floor *by definition*; adding retreat to the auto cascade would
change every published number to model a decision no simulation is making.
A pilot, though, is playing Cairn — where leaving is usually correct — so the
option belongs to them. Putting the two side by side is the clearest statement
available of why the oracle's number is a floor and not a forecast. A
withdrawal is **not** a casualty, in the model or in the verdict line.

Three things that will bite you here:

- **The auto cascade's RNG order is load-bearing.** Choosing and resolving were
  split into shared closures so the pilot and the AI execute the same code; the
  draws happen in the same order they always did. A **fingerprint test** pins
  54 recorded fights to a digest, and it exists because 78 green checks did not
  prove the numbers were unchanged when the generator refactor landed. If that
  digest is your only failure, you have altered the model.
- **Options are chosen by index, never by name.** A delver can be carrying two
  sets of Soporific Darts — one from a background, one off a corpse. Resolving
  by name made the second unusable and unspendable forever.
- **`[hidden]` loses to `display: flex`.** The transport controls stayed on
  screen through piloted fights despite the attribute being set correctly.

### /cairn/items — what a slot is worth

Cairn puts magic in objects and caps objects at ten slots, so an item's real question is its value
*per slot*, and that is measurable: give the party the item, re-run the same basket of fights on the
same seeds, and the difference in toll is what the item is worth. Both runs share seeds, so an item
the model cannot see reads exactly `0.0000` rather than drifting near it — which is what lets a weak
real effect be told apart from noise.

### Things that will bite you here

- **Near-identical seeds used to roll the same character.** A party seeds its
  members `seed/0`, `seed/1`, … and mulberry32's first output is a weak function
  of its seed, so a party of four came out as four of the same background.
  `makeRng` now mixes two hash words and discards twelve outputs before any die
  is read. Do not "simplify" that away — a selftest measures the collision rate
  against chance, which is the only way this failure is visible.
- **Item qualities are parsed out of prose.** `(*petty*)`, `(d10, *bulky*)`,
  `(+4 slots …)`, `(1 Armor)` all come from the gear line's own text. A new
  system means a new parser; do not assume Cairn's vocabulary carries over.
- **Offered items are a guess, and are opt-in for that reason.** Bolded proper
  nouns in a table result become chips the player can add. `offeredItems` filters
  out rules keywords and the bold-heading pattern some entries open with, but it
  still over-offers: a three-column title may name a specialty ("Arachnids")
  rather than a relic ("Pullstones"), and nothing distinguishes them. That is the
  safe direction — nothing is added automatically, and the sheet takes free-text
  items for whatever the heuristic misses. Tightening it is welcome; auto-adding
  is not.
- **The search must not contradict the weighing.** The bestiary search runs at low trials and the
  bands have hard edges, so a marginal encounter can read "deadly" in the table and "risky" one
  click later. Two things stop that, and they fix different halves of it: results are ranked by
  distance from the *middle* of the band (6 of 12 top results flipped when ranked by lethality
  instead, 0 of 12 after), and each candidate is confirmed against a second seed (9 of 49 flipped
  unconfirmed, 3 of 38 confirmed). A selftest measures both.
- **Consumables run out, and forgetting that arms the party with a cannon.** Cairn's bombs come off
  the background tables — `Blast Sphere (d12, blast, bulky, 1 use)` — and were modelled as a
  permanent best weapon fired every round. `parseItem` reads `uses` now, attacks spend them, and
  `clone()` copies attacks per trial for the same reason it copies spells. A blast bomb is
  nonetheless the best thing per slot in the game; only long fights punish running out.
- **Two things named Shield.** Cairn sells a wooden one and has a spell of the same name, and
  matching a spell by bare item name gave the armour a wizard's ward — it scored double every other
  +1 Armor item, which is how it was spotted. `spellEffect` requires an actual spellbook.
- **A mis-wired ability is invisible, not broken.** Casting was fully implemented and moved the
  toll by nothing, because `spent` was set on a spells array shared by every trial — `clone()` in
  combat.js must deep-copy `spells` and `powers`, and any new per-fight state belongs there too.
  Separately, a troll could not regenerate because monsters were marked `dead` on failing a
  critical damage save, and the revival check needs a body that is down but not dead. Both were
  found by measuring, not by reading, which is why the effects selftest measures.
- **Advancement is an inventory problem, and the slot cap is load-bearing.** `delve.js` advances
  scars and loot together because they come from the same rooms. Two findings are baked into it and
  must not be "simplified" away: a delver **reserves one slot**, because filling all ten is 0 HP by
  the rules and the first model had the average character unconscious by their third delve; and
  `combatantFromCharacter` **applies that 0 HP**, without which the pack has no weight at all and
  the whole item study measures nothing. Carrying saturates at about three delves — after that a
  veteran is choosing what to leave, not accumulating.
- **A CSS `transform` on an SVG element REPLACES its `transform` attribute.** They do not compose.
  The arena's acting token carried its own `translate()` and grew a `scale()` on its turn, so every
  attacker teleported to the corner of the field the moment it swung. Position lives on an outer
  `<g>`, classes on an inner one; and `transform-box`/`transform-origin` are set explicitly, because
  the default origin is the middle of the *viewBox*, not of the thing being scaled.
- **Player edits live only in the page.** Swapping two attributes (which Cairn
  allows) and taking an offered item change what is on screen, never what the
  seed rolls. Reloading the permalink returns the sheet as rolled. If you add
  persistence, do it in the URL, not in storage.

## /srd5 — System Reference Document 5.2.1

The second system, and the first with **positions**: cover, reach, opportunity attacks and cone
templates are all distances, so this one gets a real map where Cairn's arena refuses to draw one.

Its instructions are its own — **[`srd5/CLAUDE.md`](srd5/CLAUDE.md)** — and you must read
[`srd5/LICENSE.md`](srd5/LICENSE.md) before touching it, because its obligations differ from
Cairn's in ways that are easy to breach by habit: **CC BY, not CC BY-SA** (no share-alike, so the
footers are not interchangeable); the attribution statement is **fixed and exclusive**, with no
other credit to Wizards permitted anywhere; and **trademarks are not licensed**, which is why the
system is called `srd5` and carries no branding.

One thing worth knowing before working on it: it is parsed out of a **364-page PDF**, not scraped
from marked-up HTML, so a bad parse does not throw — it comes back as fluent English. That is why
`srd5.selftest.mjs` runs 92 checks over generated data (and `roll.selftest.mjs` another 373 over the roller, the path and the balance model), and why they are built on reconciliation
and external grading rather than spot checks. They have already caught seven merged swarms, eighty
truncated attacks, four dragons with a back-to-front CR line, and one error in the SRD itself.


## Checking a page, not just a model

The selftests prove the models; they cannot prove a page renders. Three defects
here were invisible to node and instant in a browser: a CSS transform silently
**replacing** an SVG `transform` attribute (acting tokens teleported to the
corner), `[hidden]` losing to `display: flex` (transport controls stayed up
through piloted fights), and the party overview card laying out 497px tall
starting at y=678 on a phone — entirely off the screen it was built for.

```sh
npm i playwright-core        # Chromium is already at /opt/pw-browsers
node table/page.check.mjs    # 92 checks; skips with exit 0 if the above is missing
```

It is **not** in the deploy gate. The gate runs plain node selftests with no
install step, and wiring a browser into the deploy path is not something to do
as a side effect of a UI commit. Run it by hand when you touch a page.

## Deploying

A push to `claude/ttrpg-character-sheet-gen-886np4` that touches `table/**`
deploys production. There is no staging. The sandbox cannot reach Cloudflare —
push to the branch, do not `wrangler deploy` locally.

**`table.mino.mobi` did not exist before this surface.** Wrangler provisions it
from the `routes[]` declaration on the first deploy; expect DNS to miss briefly
and Cloudflare error 1104 for up to a minute while the certificate issues (the
`plant` surface went through exactly this). On every later run, confirm the log
binds `table.mino.mobi (custom domain)` — green is not proof
([`../docs/DEPLOYS.md`](../docs/DEPLOYS.md), the golden rule).

## Adding a system

1. Confirm the licence yourself from the publisher's own page, and write down
   what it requires. If it is not an open licence, it does not go here — a
   community licence that the publisher can revoke is not a foundation for a
   permanent public generator.
2. `table/<system>/` with the four files above, and its `LICENSE.md` first.
3. Add it to the landing page: the wing card, and a row in the licence table.
4. Update `serves[]` in the registry entry and `systems{}` in `worker.js`.
5. `node scripts/preflight.mjs --fix`, then push.
