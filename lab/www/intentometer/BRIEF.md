# have-well — Intentometer

## What this is

Same site as the last turn (manual "read it" + automated "run the meter"
against a Bluesky feed). This turn's request from the requester
(thegodfungi.bsky.social) was terse and specific about one thing: **"Don't
want it to be forward action/probability focused but let's say list
overview of patterns of intentionable suggested goals: striking."**

Read that as: stop leading with the 0–100 score (a probability-flavoured
number claiming to predict follow-through) and lead instead with a
categorised, visually bold ("striking") list of the actual *kinds of goal*
the text names — fitness, money, quitting something, learning something,
and so on — with the specific phrase that triggered each category shown.
The number stays, because it was already built and is still useful, but it
is now demoted: smaller gauge, smaller reading text, and a "for what it's
worth, a number too" label sitting above it.

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

## The plan — what's not built

1. **The category table is a first pass**, same caveat as SIGNALS before it:
   tuned by eye against a handful of example sentences, not a corpus. If a
   future turn hears "this didn't catch my post," the file to open is the
   `GOAL_CATEGORIES` array (top third of the inline script), and the fix is
   almost always adding an alternative inside an existing category's regex
   rather than inventing a new category.
2. **Everything from the last BRIEF that wasn't this turn's ask is still
   open**: labPds() history/trend view, a two-handle compare mode, thread
   mode via `getPostThread`. None of them conflict with what shipped this
   turn — they'd sit alongside the pattern cards fine. Thread mode is still
   the trickiest (nested `thread.replies[]`, not a flat `feed[]` — read
   `lab/_kit/fixtures/getPostThread.json` before writing the walk).
3. **A "striking" reading of colour could go further** — right now the
   colour only lives on a border and a count badge. If a future ask leans
   further into "make it visually bold," the icon itself sitting in a
   tinted circle (`background: color + alpha`) rather than bare on the card
   would push it further without touching the dark-theme-only palette.

## Gotchas

- **CSS cascade bug caught while doing this**: adding new `.reading` /
  `.gauge-wrap` rules earlier in the `<style>` block did nothing at first,
  because near-duplicate rules for the same selectors already existed
  further down and won on source order (same specificity). Edited the
  original rules in place instead of appending new ones — worth checking
  for existing rules by the same selector before assuming a new one you add
  will apply, in a file that's grown across several turns.
- `detectPatterns()` reuses the exact lowercasing/padding trick from
  `scoreIntent()` (`' ' + text.toLowerCase() + ' '`) so `\b` boundaries work
  at string edges — keep that if either function is edited independently,
  or boundary matches at the very start/end of a line will silently break.
- Did not get to see this rendered — going on the fixture shapes and CSS
  reasoning only, same as last turn. If the harness screenshot shows
  pattern cards overflowing on a narrow phone width, `.pattern-grid`'s
  `minmax(140px, 1fr)` is the value to shrink first.
