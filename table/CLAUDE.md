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
| Serves | `/cairn`, `/cairn/encounter`, `/cairn/items` |

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
| `cairn/app.js` | The page: rendering, the two edits a player may make, print |
| `cairn/monsters.js` | **Generated.** The 84 bestiary stat blocks, parsed into numbers |
| `cairn/tools/scrape-monsters.py` | What generated it |
| `cairn/combat.js` | The encounter oracle: the combat simulator, the challenge metric, the bestiary search |
| `cairn/combat.selftest.mjs` | 40 checks. **A simulator fails silently — run this** |
| `cairn/items.js` | **Generated.** The marketplace, the 46 relics, the d100 spellbook table |
| `cairn/tools/scrape-items.py` | What generated it |
| `cairn/delve.js` | Advancement: scars and loot on one axis, inside the ten slots |
| `cairn/study.js` | What a slot is worth — item value measured in the same currency as an encounter |
| `cairn/delve.selftest.mjs` | 45 checks over delve.js, study.js and items.js |
| `cairn/encounter/` | The oracle's page |
| `cairn/items/` | The item study's page |

Regenerate the data (only when the SRD itself changes):

```sh
python3 table/cairn/tools/scrape-srd.py      > table/cairn/data.js
python3 table/cairn/tools/scrape-monsters.py > table/cairn/monsters.js
python3 table/cairn/tools/scrape-items.py    > table/cairn/items.js
node table/cairn/roll.selftest.mjs      # must pass; the frozen sheet is the check
node table/cairn/combat.selftest.mjs    # must pass; a wrong simulator looks right
node table/cairn/delve.selftest.mjs     # must pass; a wrong advancement model looks right too
```

### /cairn/encounter — the oracle

Cairn ships no challenge rating, no XP budget and no encounter table, deliberately. Rather than
invent one, the oracle **plays the fight**: it runs Cairn's combat rules a few thousand times
against the party the seed rolled and reports the distribution. Three rules govern anything you
add here, and all three are about not lying to a Warden:

1. **Say it is a floor.** The model fights to the last body with no terrain, tricks, talking or
   retreat — the thing Cairn is explicitly about avoiding. Every surface of the page says so.
2. **Mark what the model cannot see.** 59 of the 84 creatures have abilities beyond their stat
   line (the scraper's `unmodelled` flag), and those encounters are harder than the verdict says.
   Never let a verdict imply it covered the whole creature.
3. **Never dress our arithmetic as Cairn's.** The challenge metric, the loot table and the delve
   model are this site's invention. They are labelled as such in the code, in the UI, and in the
   footer.

### The challenge metric

Two numbers, defined in `combat.js`:

- **Toll** — the expected fraction of the party that does not walk away. An average, so it prices a
  whole dungeon: five toll-0.2 rooms cost about one character.
- **Swing** — the probability of a wipe. This is the tail, and toll does not imply it: a fight that
  always leaves one body and a fight that is free three times in four and total the fourth have the
  same toll and are completely different problems.

Bands come off both. The cut points are the only invented numbers in the model.

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
- **Advancement is an inventory problem, and the slot cap is load-bearing.** `delve.js` advances
  scars and loot together because they come from the same rooms. Two findings are baked into it and
  must not be "simplified" away: a delver **reserves one slot**, because filling all ten is 0 HP by
  the rules and the first model had the average character unconscious by their third delve; and
  `combatantFromCharacter` **applies that 0 HP**, without which the pack has no weight at all and
  the whole item study measures nothing. Carrying saturates at about three delves — after that a
  veteran is choosing what to leave, not accumulating.
- **Player edits live only in the page.** Swapping two attributes (which Cairn
  allows) and taking an offered item change what is on screen, never what the
  seed rolls. Reloading the permalink returns the sheet as rolled. If you add
  persistence, do it in the URL, not in storage.

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
