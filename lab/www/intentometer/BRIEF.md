# have-well — Intentometer

## What this is

Manual "read it" + automated "run the meter" against a Bluesky feed, plus a
categorised, visually bold pattern list (fitness, money, quitting, etc.)
that leads over the old 0–100 probability score, which is now demoted to a
secondary "for what it's worth, a number too" gauge. That was two turns ago.

This turn's request from the requester (thegodfungi.bsky.social) was one
line: **"Intention is so much deeper."** No thread context pointing anywhere
else, and it doesn't contradict the standing plan, so read literally as: the
pattern cards from the last turn show WHICH kind of goal, flatly — they
didn't yet say anything about how deep or committed any one mention reads.
Two identical "fitness" cards for "might go for a run sometime" and "I will
run every morning starting Monday" looked the same. That's the gap this
turn closes.

Shipped: each detected pattern now also carries a **depth reading**, scored
by running the *existing* SIGNALS table (committed language vs hedging) on
just the sentence the phrase came from, not the whole text. Manual mode:
one occurrence, one depth. Feed mode: `aggregatePatterns` now also averages
depth per category across however many posts hit it. Depth shows as a
label under the phrase ("passing mention" → "strongly committed") and,
more visibly, as the alpha on the icon's background circle — a card whose
phrase reads faint sat next to one that reads committed is the "striking"
visual difference the earlier turn's colour treatment was reaching for and
didn't quite land (its plan item 3, now done this way instead of the
"tinted circle" idea being separate — they turned out to be the same fix).

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

## The plan — what's not built

1. **The category table is still a first pass**, same caveat as SIGNALS:
   tuned by eye, not a corpus. `GOAL_CATEGORIES` (top third of the inline
   script) is the file to open if a category misses something obvious.
2. **Depth is also unvalidated against real text** — `depthLabel()`'s
   buckets (30/50/70/85) were picked by eye to spread SIGNALS' 0–100 range
   into five readable labels, same caveat as everything else scored here.
   If depth reads as too bunched (e.g. everything landing "stated"), the
   buckets are the first thing to widen, not the SIGNALS weights.
3. **Everything from earlier BRIEFs that still isn't built**: labPds()
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
