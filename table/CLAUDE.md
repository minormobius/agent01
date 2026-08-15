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
| Serves | `/cairn` |

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

Regenerate the data (only when the SRD itself changes):

```sh
python3 table/cairn/tools/scrape-srd.py > table/cairn/data.js
node table/cairn/roll.selftest.mjs      # must pass; the frozen sheet is the check
```

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
