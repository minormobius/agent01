# hey-tarot / "Tarot Court"

## What this is

The ask (thegodfungi.bsky.social, replying to @buildthis.bisks.net's tarot
readings): turn tarot into "a prediction system for viable user-matches ...
recommended accounts ... user-list for where to turn with certain problems."
The other posts in that thread (petitions, dueling wizards, slow timescales,
etiquette misfires) are minormobius/antiali riffing on a *different* idea
(a bot-building magic system) — context for the room, not part of this brief,
and none of it shipped here.

What shipped: **Tarot Court**. A visitor builds a small "court" — Bluesky
handles they add via `kit.handleInput`, each tagged with what they're good
for (Cups/heart, Wands/action, Swords/conflict, Pentacles/money, or Major
Arcana/"the big stuff"). They describe what's going on in a textarea; a
lightweight keyword scorer guesses which of those five lanes it falls in,
draws a random card from the matching suit (full 78-card deck, own short
glosses on each card/rank), and — if someone in the court is tagged for that
domain — recommends them, linking to their bsky.app profile. If nobody's
tagged for it, it says so and invites adding someone.

The court and its tags persist in `localStorage` only. No OAuth, no PDS
write — see DECISIONS.

## Decisions

- **The recommendation pool is the visitor's own court, never a scan of
  strangers.** The literal ask ("recommend accounts... where to turn") reads
  like it wants the site to know who's actually good at what across Bluesky
  — that requires `searchPosts` or the firehose to discover candidates, both
  banned by the one rule with teeth. So the mechanic inverts it: the visitor
  supplies and tags the candidate list themselves, and the deck only ever
  picks among named people. This is the load-bearing design choice — don't
  "improve" this into an auto-discovery feature.
- **Domain tags are declared by the visitor, not inferred from the named
  person's real posts/behaviour.** Deliberately not doing any analysis of
  the tagged accounts — no `getAuthorFeed` scan to guess what they're
  "actually" good at. That would be making an unreviewed claim about a real,
  named person's character, which is exactly the kind of thing NO-BUILD.md
  warns against even without an explicit rule against it here.
- **No OAuth / PDS save this turn.** `localStorage` is enough to prove the
  mechanic works end to end; wiring `store.save('court', court)` through
  `/_kit/pds.js` is straightforward but adds sign-in flow, and the hard part
  (the draw → domain → match logic) was the better use of the turn.
- **Keyword guesser, not real NLP.** Five short keyword lists per domain,
  highest-score wins, ties/no-match fall back to a random non-major lane.
  Honest about being blunt (see the footer note and NOTE.txt) — this is
  flavor, not a claim of understanding the visitor's problem.

## The plan (next steps, in order)

1. **PDS persistence.** Wire `labPds()` from `/_kit/pds.js` so the court
   survives a cleared browser / follows the visitor to another device.
   Sign-in stays optional (localStorage first, "sign in to save your court"
   as an enhancement) per the standing sign-in-optional rule. Schema: reuse
   `com.minomobi.lab.doc` with `kind: 'court'`, one doc holding the array.
2. **A share card for a drawn reading.** Right now a draw only renders on
   screen. A "copy card" button (canvas or plain text) that renders card
   name + recommended handle would make a specific reading shareable back
   into the thread, which is likely what "so that we evolve" was gesturing
   at — the mechanic getting reused/passed around, not just used once.
3. **Bigger keyword lists / better ties.** The five KEYWORDS arrays in the
   script are short and English-only; a real second pass would want more
   coverage and probably a "why this lane" one-liner shown alongside the
   guess, so a wrong guess is at least legible rather than opaque.
4. Not done, and intentionally out of scope even for later: any feature that
   ranks or scores court members against each other, or that pulls in people
   the visitor didn't type. Both would start eroding the "named subject only"
   boundary this design leans on.

## Turn 3 — "the oracle's letter"

The task text this turn was a single odd line pasted alongside the same
Bluesky thread as before: "consider the prevalence... of uppercased letters
versus lowercased ones, write a letter by randomizing words by those
standards... show why, if, cases matter and how much." Nothing else in the
thread (still the tarot/petition/wizard riffing from turn 1) connects to
letter-case statistics at all, and the ask doesn't name Tarot Court or
anything in it. I could not tell whether this was genuinely the site owner
posting something unrelated, or a mismatched/garbled task assembly.

**What I did, and why.** Rather than gamble on either "ignore it entirely"
or "abandon Tarot Court and build an unrelated site" (the hard boundary is
this directory anyway), I took the request at face value but grounded it in
the one thing on this page that's an honest "accessible database" with no
network call involved: **the deck's own text.** Added a new section, "the
oracle's letter": it counts how often each letter A–Z appears capitalized
vs. lowercase across all 78 card names + moods + suit labels (mostly an
artifact of proper nouns — "The Chariot", "Cups"), shows that as a ranking,
then writes a short generated letter (fixed phrase bank, `LETTER_LINES`)
where each word's capitalization is a coin-flip weighted by that same
per-letter ranking. The stat line under the letter is deliberately honest
that this shows *deck-naming habits*, not that any letter *means* more.
Pure client-side, deterministic corpus, no network, no PDS, no OAuth touched.

If the next request clarifies this was actually meant to be a *different*,
unrelated site: this section is easy to lift back out (`letterRank`,
`letterBtn`/`letterOut`, and the whole "oracle's letter" JS block at the end
of the script) — it doesn't touch the court/draw logic above it at all.

## Gotchas

- `kit.handleInput`'s own `keydown` Enter handler only fires `onPick` when a
  suggestion is actually highlighted (`active >= 0`); it does nothing for
  "typed a full handle, hit Enter, never touched an arrow key." Added a
  second `keydown` listener on the same input that falls back to
  `resolveHandle` + `getProfile` for that case — but it only fires when
  `.kit-ta` (the suggestion box) isn't in the DOM at all. If the box is open
  with items but nothing highlighted, Enter still no-ops; not fixed, just
  noted. A real fix would need a hook inside kit.js itself, which tenants
  can't edit.
- `img-src` in `lab/www/worker.js` already allows `cdn.bsky.app` directly, so
  avatars here are plain `<img src>` — the `/_img/` proxy is only needed when
  an avatar gets drawn into a `<canvas>` (mentioned in the kit README), which
  this page never does. Don't add `/_img/` here without a reason.
- Full 78-card deck (22 Major Arcana + 4×14) is generated in JS from short
  arrays (`RANKS`, `RANK_MOOD`, `MAJOR`), not hand-written as 78 objects —
  keep it that way if extending the deck; it's much less error-prone than a
  flat literal.
