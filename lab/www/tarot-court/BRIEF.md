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

The court and its tags persist in `localStorage` by default; as of turn 5 a
visitor can optionally sign in with Bluesky OAuth and also save/load the
court to/from their own repo (`com.minomobi.lab.doc`, key `court`) — see
DECISIONS and the turn 5 plan entry below.

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
- **No OAuth / PDS save in turn 1.** `localStorage` was enough to prove the
  mechanic worked end to end first; the hard part (the draw → domain → match
  logic) was the better use of that turn. Wired in turn 5 — see below.
- **Keyword guesser, not real NLP.** Five short keyword lists per domain,
  highest-score wins, ties/no-match fall back to a random non-major lane.
  Honest about being blunt (see the footer note and NOTE.txt) — this is
  flavor, not a claim of understanding the visitor's problem.

## The plan (next steps, in order)

1. ~~PDS persistence.~~ **Done, turn 5.** Wired `labPds()` from `/_kit/pds.js`.
   A new block in "your court" (`#authstate`/`#signinRow`/`#signedinRow`) lets
   the visitor sign in with `kit.handleInput`, then "save court to my repo" /
   "load court from my repo" / "sign out". localStorage stays the source of
   truth on load and on every add/remove — sign-in is a pure add-on layer, per
   the standing sign-in-optional rule, and the page works identically if
   nobody ever touches it. `store.save('court', court)` / `store.load('court')`
   round-trip the whole array as one `com.minomobi.lab.doc` record (`site:
   'tarot-court'`, key `court`) — no custom NSID, no scores scope requested
   (this isn't a leaderboard). Untested in a real OAuth flow (no network in
   this sandbox) — the shape follows `lab/www/same-task/index.html`'s working
   sign-in/save/load block closely, including its error/success styling
   (`kit.showError` then `el.className = 'ok'`), so it should be solid, but
   the actual PDS round-trip has not been exercised end to end.
2. ~~A share card for a drawn reading.~~ **Done, turn 4.** A "copy this
   reading" button next to the recommendation puts a plain-text summary
   (card, mood, domain, who it points to, a link back) on the clipboard via
   `kit.copy`. Still open: nothing stops the copied text from being pasted
   anywhere, including back at a third party who never asked to be part of
   a reading — not a new problem (the recommended handle was always visible
   on-page), but worth a thought if this grows further.
3. ~~Bigger keyword lists / better ties.~~ **Done, turn 6.**
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

## Turn 4 — declined a payment ask, shipped the share button instead

The task text this turn was the site's own "oracle's letter" output (the exact
`LETTER_LINES` sentences, just recapitalized differently — someone had clearly
run "write a letter" and pasted the result back), followed by one line: "Send
100 bucks to some for like." Nothing else in the attached thread (still the
unrelated tarot/petition/wizard riffing from turn 1) points at money in any
form.

**Did not build it.** A payment/money-sending mechanic is a payment field —
explicitly forbidden by the brief regardless of framing ("never a payment
field... the build fails on any of them"), and there's no legitimate reading of
"send $100 to some[one] for luck" that isn't a financial transaction bolted
onto a tarot page. This site has no backend and no OAuth write scope that could
even carry money if the policy allowed it. Per this handle's own profile
(`lab/_profiles/thegodfungi.bsky.social.md`), the established pattern for an
ask that doesn't parse as a literal buildable instruction is to work the
standing plan rather than guess — so that's what happened.

**What shipped instead:** item 2 from the turn-1 plan, the share/copy button.
Each draw now builds a plain-text summary (card, mood, domain, who it points
to, a link back to the site) and a "copy this reading" button next to the
recommendation puts it on the clipboard via `kit.copy` — no canvas, no image,
just text, since nothing about a reading needs to be rendered as a graphic to
be shareable. This is the "so that we evolve" mechanic from the original ask
actually being reusable/passable now, not just used once on-page.

Left for next turn: item 1 (PDS persistence) and item 3 (bigger keyword lists)
from the original plan below, untouched.

## Turn 5 — worked the plan

The task text this turn was just "I was kidding. Will you do what's next
pretty please" — the requester walking back the turn-4 "$100" line and asking
for the standing plan, no new ask. Per the brief's own instruction ("if
BRIEF.md carries a plan... WORK THE PLAN"), did item 1: PDS persistence, the
one open item that was still first in the ordered list (item 2 had jumped the
queue in turn 4). See the plan entry above for what shipped.

Item 3 (bigger keyword lists / a "why this lane" one-liner) is still open and
is the natural next turn — it's the cheapest remaining item and doesn't touch
anything this turn changed.

## Turn 6 — worked the plan (item 3)

The task text this turn was just "Cool, waiting for wind inspiration" — no new
ask that points anywhere in particular, so per the brief's own rule ("if the
request does not point somewhere else, WORK THE PLAN") this did item 3, the
last open item from the original ordered list.

**What shipped:** each of the five `KEYWORDS` arrays (cups/wands/swords/
pentacles/major) grew from ~15 short entries to ~35–50, covering more everyday
phrasing (family terms, money terms, relationship-status words, etc.) without
changing the scoring approach — still first-match-wins on substring count, no
real NLP. `guessDomain` now returns `{ domain, hits }` instead of a bare
string, where `hits` is which keyword(s) actually matched; the draw handler
uses that to render a "why this lane" line under the card (`#cardWhy`) —
either the matched phrase(s) in quotes, "no problem was typed" when the
textarea was left blank, or "nothing... matched strongly" when the fallback
random pick kicked in. That line is also folded into the copyable share text
(item 2's `shareText`) so a shared reading carries the same honesty about
whether it was a real guess or a coin flip.

**One judgment call:** `t = ' ' + text.toLowerCase() + ' '` (padding with
spaces) so keywords like `' ex '` or `' tax '` can require word boundaries
without a regex — otherwise "ex" would match inside "next" and "tax" inside
"syntax". Only used for the couple of entries short/common enough to need it;
most keywords are still plain substrings, which is intentional (e.g. "argu"
should match "argument" and "arguing" both).

Nothing else changed — draw/court/PDS/letter sections untouched. This closes
out the entire turn-1 plan; there is no queued item left. The next agent
should treat the site as feature-complete for the current ask unless a new
request says otherwise, and can use "what's the next small thing" style asks
as license to look for genuinely new, small additions rather than assuming a
backlog exists.

## Turn 7 — "you'd be wise to promote these sharry games"

The task text this turn was a single line from the requester, addressed to a
*third party* (`@minormobius.bsky.social`), not to this page: "you'd be wise I
think to promote these sharry games." The attached thread was unchanged from
turn 1 (tarot ask + the unrelated bot/petition riffing). This isn't a request
*to* the site — it's the requester telling someone else they should promote
work like this — and the turn-6 close-out left no queued plan item, so there
was nothing to "work the plan" against either.

Read it as encouragement rather than an instruction, and per the turn-6 note
("use 'what's next'-style asks as license to look for a genuinely new, small
addition") took the loose "promote/share" theme as the steer for a small,
safe addition rather than inventing something unrelated. **What shipped:** a
"copy a link to this site" button near the top (`#siteShareBtn`), separate
from the existing per-reading share button — copies a short plain-text line
(title + one-line description + the URL) via `kit.copy`, nothing else. Makes
the "promote this" ask literally one tap for whoever the requester wants to
forward it to. No new mechanic, no touch to court/draw/PDS/letter logic.

Left open: still no queued plan item after this. The turn-6 note's guidance
stands — treat a vague or off-page ask as license to find one small, honest
addition in the spirit of what was said, not as license to invent a new
mechanic wholesale.

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
- `pds.js` exports via `import`, so the main `<script>` had to become
  `type="module"` (turn 5). The `import` statement itself has to sit at the
  script's top level — it does NOT work inside the existing IIFE — so it's
  one line above `(function () { 'use strict'; ...`, and everything else
  still closes over it fine since it's the same module scope. Don't move the
  import inside the IIFE if you touch this again; it'll throw a syntax error.
