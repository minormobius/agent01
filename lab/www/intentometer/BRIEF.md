# have-well — Intentometer

## What this is

Manual "read it" + automated "run the meter" against a Bluesky feed, a
categorised pattern list (fitness, money, quitting, etc.) with a per-pattern
depth reading, and — new this turn — a blunt one-line "quick read" banner
that answers the whole page's question in one glance, above everything
else.

This turn's request, verbatim: **"oh my god i just want it to show broadly
quickly when someone is probably full of shit."** No thread pointer
elsewhere. Read literally: the breakdown (pattern cards, per-card depth,
the demoted numeric gauge) that the twelfth and thirteenth turns built out
is detailed but not FAST — you have to read cards to get a sense of
"does this sound real." This turn's ask is speed of read, not more detail.

That request sits in real tension with the twelfth turn's explicit "don't
want it to be...probability focused," which is on record in this same
BRIEF's history. Per the standing rule (most recent request from the owner
wins when it contradicts the plan), this turn leans back toward a fast
top-line signal — but as an ADDITION above the existing breakdown, not a
replacement of it. Nothing from turns eleven through thirteen was removed.

Shipped: a `.quickread` banner — one big coloured line ("🚩 sounds like
mostly talk" / "🤷 hard to tell yet" / "💬 sounds like they mean it" /
"✅ sounds locked in"), plus a small honesty caption underneath — rendered
first, above the pattern grid, in both manual and feed mode. It's driven by
the *same* `scoreIntent` used everywhere else on this page (whole-text score
in manual mode, the post average in feed mode) — no new heuristic, just a
new, blunter bucketing and a louder presentation of a number that already
existed. "Full of shit" itself never appears as page copy; "sounds like
mostly talk" is the shipped wording — see Decisions.

## Decisions

- **Added a second, independent pattern-matching layer** (`GOAL_CATEGORIES`
  / `detectPatterns()`), separate from the existing `SIGNALS` /
  `scoreIntent()` table. Did not try to unify them — they answer different
  questions (SIGNALS: how committed does the wording sound; GOAL_CATEGORIES:
  what kind of goal is this) and forcing one table to do both would have
  made the weights incoherent. Two small heuristics, each honest about what
  it does, beat one that tries to do both.
- **9 categories** (fitness & health, learning & skill, creative & making,
  work & career, money & saving, habits & routine, quitting & stopping,
  people & relationships, travel & moving), each a fixed regex + emoji icon
  + hex colour, hand-picked to cover common "I'm going to ___" phrasing
  without trying to be exhaustive. Colour is applied only as a 4px left
  border (`--card-color` custom property) and a count badge, never as a
  full card background — keeps contrast safe against the dark theme without
  needing a light/dark split, since this kit has none.
- **The matched phrase is shown, not just the category.** Each card quotes
  the literal substring that matched (`m[0]` from the regex), e.g. "running"
  or "quit smoking" — this is what makes it read as "these are the specific
  suggested goals," not just a generic label. Turning a category into a
  showable quote for free was the reason to keep the regexes ungrouped
  (no named capture needed, whole match is the phrase).
- **Same treatment in both modes.** Manual mode shows the patterns in the
  single line typed; automated mode aggregates patterns across all scored
  posts (`aggregatePatterns`), sorted by frequency descending, with a count
  badge per category — this is the closer fit for "list overview of
  patterns," since one line rarely has more than one pattern but a feed of
  15 posts usually has several worth ranking.
- **Demoted, not removed, the score.** Deleting the gauge/score entirely
  felt like it would throw away a working, tested feature over a styling
  preference that could be read literally ("don't want it to be...
  focused," not "don't want it at all"). Shrunk the gauge (280px → 220px,
  70% opacity) and the reading text, and added a small uppercase label
  above it, so patterns are unambiguously the lead output and the number is
  clearly secondary.
- **Copy updated everywhere the old framing was baked in** — the `<p
  class="sub">` intro, the "Automate it" description, the footer, and
  `og:description` — so a first-time visitor's first read of the page
  matches what it now actually leads with, not just the feature that got
  added this turn.
- **This turn: depth is scored per-sentence, not per-post or per-text.**
  `sentenceBounds()` walks left/right from the match index to the nearest
  `.!?\n` (or string edge) and hands that substring to the *existing*
  `scoreIntent()` — reusing SIGNALS rather than inventing a second weighting
  table, same reasoning as the original SIGNALS/GOAL_CATEGORIES split.
  Rejected scoping to the whole post: a post with "might skip the gym today
  but I will finally start budgeting next month" has one hedged pattern and
  one committed one, and post-level scoring would smear them into the same
  number.
- **Depth surfaces as colour, not just text**, because a label alone
  ("passing mention") is easy to skim past and a colour difference isn't —
  this is the same "striking" instinct behind the pattern cards two turns
  ago, applied to depth instead of category. Implemented as alpha on the
  icon's circular background (`hexToRgba(color, 0.14–0.69)`), not the border
  or badge, so it doesn't fight the existing `--card-color` usage on those.
  This also closes what was plan item 3 last turn (tinted icon circle) —
  turned out "make colour more striking" and "show depth visually" were the
  same piece of work once depth existed to drive it.
- **Feed mode averages depth across occurrences of a category**, not just
  the first or the max. A handle that mentions "quitting smoking" five times
  with mixed conviction should read as roughly how they've actually been
  talking about it, not be dragged to their single most (or least) committed
  post.
- **This turn: "full of shit" became "sounds like mostly talk" in the actual
  copy.** The request's language was blunt and vulgar; the shipped label is
  blunt but not vulgar, and — more importantly — never phrased as a claim
  about a *person's* honesty. It reads the WORDING ("sounds like..."), same
  register as the existing `categoryFor()` labels ("just talk", "locked
  in") which already used this exact framing two turns before this one.
  This isn't a new capability or a new risk surface: feed mode already let
  a visitor point the meter at any handle and get back "just talk" for a
  low score. The quick-read banner just makes that existing signal loud and
  immediate instead of a small line under a shrunk gauge.
- **Added, not swapped in.** Turn twelve asked to de-emphasise the score;
  this turn asks for something fast and blunt, which — read narrowly —
  could have meant "put the number back on top and shrink the cards." Chose
  instead to add a new, separate element above the existing breakdown and
  leave the pattern cards and the demoted gauge exactly as they were. If a
  future turn says the page still feels cluttered or that the breakdown is
  now redundant with the quick read, that's the signal to actually remove
  something — not this turn's job to guess at.
- **Reused `scoreIntent`, not a new signal table.** Same reasoning as
  `GOAL_CATEGORIES` vs `SIGNALS` and as `localDepthScore` vs `scoreIntent`:
  three features on this page now read commitment-vs-hedging language, all
  through one scored table. `QUICKREADS` is just a bucket list (4 bands
  instead of `depthLabel`'s 5, `categoryFor`'s 5) tuned for a punchier read
  at a glance, not a fourth way of scoring text.
- **Kept the word "verdict" out of user-facing copy.** The footer already
  says "not sentiment AI, and not a verdict on anyone" (from an earlier
  turn) — calling the new banner a "verdict" in its own text would directly
  contradict that line on the same page. Internal CSS class/ids still say
  `quickread`, not `verdict`, for the same reason — didn't want a future
  edit to casually surface that word in copy without noticing the clash.

## The plan — what's not built

1. **`QUICKREADS`'s 30/55/78 bucket boundaries are a first guess**, picked
   by eye against `scoreIntent`'s 0–100 range and not checked against real
   post text — same caveat as `depthLabel` and `categoryFor`, which use
   different boundaries (20/40/60/80) for the same underlying score. If the
   three ever look like they disagree on the same text in a confusing way
   (e.g. quick-read says "locked in" but the reading below says "leaning
   in"), that's worth reconciling into one shared bucket table instead of
   three separate ones — didn't do that this turn because touching
   `categoryFor`/`depthLabel` risked the wording other turns already tuned.
2. **The category table is still a first pass**, same caveat as SIGNALS:
   tuned by eye, not a corpus. `GOAL_CATEGORIES` (top third of the inline
   script) is the file to open if a category misses something obvious.
3. **Depth is also unvalidated against real text** — `depthLabel()`'s
   buckets (30/50/70/85) were picked by eye to spread SIGNALS' 0–100 range
   into five readable labels, same caveat as everything else scored here.
   If depth reads as too bunched (e.g. everything landing "stated"), the
   buckets are the first thing to widen, not the SIGNALS weights.
4. **Everything from earlier BRIEFs that still isn't built**: labPds()
   history/trend view, a two-handle compare mode, thread mode via
   `getPostThread`. None conflict with what's shipped — they'd sit alongside
   the pattern cards fine. Thread mode is still the trickiest (nested
   `thread.replies[]`, not a flat `feed[]` — read
   `lab/_kit/fixtures/getPostThread.json` before writing the walk).

## Gotchas

- **CSS cascade bug from an earlier turn**: this file has near-duplicate
  selectors from turn to turn winning on source order. Before adding a new
  rule for a selector, grep the `<style>` block for it first — this turn
  added `.pi-icon-wrap` as a clean rename of the old `.pi-icon` rather than
  layering a new rule on top, specifically to avoid repeating that bug.
- **The match-index math for depth is approximate, not exact.**
  `detectPatterns()` runs the category regex against a padded, lowercased
  copy of the text (`' ' + text.toLowerCase() + ' '`), so the reported
  match index is off by the one prepended character; `idx = m.index - 1`
  corrects for that but assumes lowercasing doesn't change string length
  (true for plain ASCII/Latin text, not guaranteed for every Unicode
  input). Worst case it picks the wrong-but-adjacent sentence, not a crash
  — acceptable given the source data is short social posts, but worth
  knowing if depth ever looks off on non-English or emoji-heavy text.
- `detectPatterns()` and `scoreIntent()` both still rely on the same
  lowercasing/padding trick for `\b` boundaries — keep that if either is
  edited independently.
- Did not get to see this rendered — going on the fixture shapes and CSS
  reasoning only, same as previous turns. If the harness screenshot shows
  the depth label crowding the phrase text on a narrow card, `.pi-depth`'s
  font-size is the value to shrink first; if icon circles look muddy at low
  alpha against `--bg-raised`, raising the 0.14 floor in `patternCardsHtml`
  is the fix.
- **This turn's `.quickread` colours are hardcoded hex, not `var(--error)`
  etc.**, matching the existing pattern in `GOAL_CATEGORIES` (also
  hardcoded hex, unrelated to kit tokens) rather than reading from
  `tokens.css`. Picked to match the kit's current `--error`/`--ok`/`--accent`
  values by eye since JS can't read CSS custom properties without an extra
  `getComputedStyle` call. If a human edits tokens.css's status colours,
  this file's `QUICKREADS` array is the other place those hex values live
  and won't update itself.
- The requester's literal phrase never made it into visible copy — see
  Decisions. If a future message from them insists on the exact wording,
  that's a deliberate ask to override this turn's softening, not a bug to
  fix.
- **Screenshot check (this turn):** rendered at 1200x800 under production
  CSP. Heading, intro copy, the "Say it" textarea and button, and the
  (demoted) gauge all render correctly — nothing off-screen, overlapping,
  blank, or unreadable. No code changes made; this was a visible-breakage
  check only, not a re-review of the design.
