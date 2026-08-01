# BRIEF — contagion-treasury (site slug: yen-leash)

## What this is

Turn 1: the requester shared a headline ("US Treasury undertakes historic
intervention in yen market") and asked "contagion? Why would the US do this?
Explain and model the relationship." The thread had three guesses floating
around: make Japan import more, retaliation over oil/war costs, and — closest
to right — that it's at Japan's request because BOJ's own defense was
failing, financed by selling euro reserves.

Shipped as one page, `index.html`: a written explainer (yen carry trade →
Japan's US Treasury holdings → forced-selling loop back into US yields), then
an interactive five-stage model. A slider sets "yen weakness" (0–100,
illustrative), a toggle flips between "Japan defends alone" and "US Treasury
intervenes early," and five stage-cards recompute live: yen weakness → BOJ
hike pressure → Treasury-selling pressure → US yield pressure → US market
volatility. A second toggle reveals the exact arithmetic per stage, matching
this requester's established "mechanism as an opt-in reveal" preference (see
`lab/_profiles/ezba.bsky.social.md`).

Turn 2: the requester said the page had too much text and asked to (a)
summarize it and (b) explain more about the carry trade specifically —
naming three concrete questions: is it "borrow infinite free money and dump
it into the S&P 500," why was Japan's rate so low, and why is that changing.
Resolved the apparent tension (shorter, but also more) by cutting the five
intro paragraphs down to two tight ones, and moving the new depth into a
third opt-in-reveal panel ("the carry trade, properly") that answers the
three questions directly, in order, each under its own bold question as a
sub-head. Default page is now shorter than turn 1; the depth is one click
away rather than gone.

No Bluesky handle lookup — this profile is comfortable with pure-concept pages
that don't need one, and nothing in either ask calls for a specific account.

## Decisions

- **Corrected the thread's guesses rather than ignoring them.** The oil/import
  angle is real but reframed as a slow-moving side effect, not the trigger —
  said so directly in the copy without quoting anyone. The euro-reserve
  financing guess is validated by pointing at the actual Exchange
  Stabilization Fund, which really does hold euros alongside dollars.
- **Numbers are an explicit "illustrative pressure index," not fake basis
  points.** The task said not to overclaim; a page throwing around specific
  yield numbers for a hypothetical event would read as a prediction. Every
  place a number appears, it's labeled 0–100 and qualitative bands
  (low/elevated/high/severe) do the actual communicating.
- **The intervention toggle only changes two weights** (Treasury-selling
  fraction and carry-unwind fraction) rather than rewriting the whole chain,
  because that's the actual mechanism: intervention targets the yen→selling
  link specifically, and everything downstream just inherits the change. The
  arithmetic panel says this explicitly so it doesn't look like five
  independent sliders in a trenchcoat.
- **Rainbow chrome (dollar green / treasury gold / yen red hues), plain body
  text**, weighted pulsing toggle switches — all per this requester's
  established preferences, not decided fresh.
- **Turn 2: reused the `.arith`/`.mathtoggle` styling for the new carry-trade
  panel** rather than inventing a fourth visual treatment — it's the same
  "collapsed by default, opt-in reveal" shape as the arithmetic panel, just
  answering prose questions instead of showing a formula. Kept the answers to
  the three named questions in the order the requester asked them, each as
  its own bold sub-head, so it reads as direct answers rather than an essay.
- **Cut, didn't delete, the original detail.** The August 2024 episode, the
  Treasury-holdings mechanic and the Exchange Stabilization Fund/euro-reserve
  point are still in the (now much shorter) top prose, compressed into one
  paragraph instead of four — none of it was wrong, it was just too much
  surface area for a first read.

## The plan

Not much left undone for the core ask, but if there's a follow-up:

- If asked for more realism: the model currently treats "yen weakness" as a
  single free variable. A next pass could split it into rate differential vs.
  risk-sentiment shock, which move on different timescales in reality.
- If asked to add a Bluesky angle (e.g. "show me who's talking about this"):
  resist unless it's a specific handle the visitor names — anything
  broader is a searchPosts/feed shape the content gate blocks outright.
- If the requester wants the historical Aug 2024 episode charted rather than
  just referenced in prose, that would need real data the build agent has no
  way to fetch (no network) — would have to be hand-entered illustrative
  points, labeled as such, same as the current model.
- If a future turn asks to trim further: the "carry trade, properly" panel is
  now the densest text on the page (three sub-answers). If it also gets a
  "too much text" complaint, split it into three separate smaller toggles
  rather than shortening the answers — the content earned its place by being
  explicitly requested.

## Gotchas

- `kit.crumb(name)` inserts `name` as raw text, not HTML — fine here since
  the title has no special characters, but don't pass markup.
- Kept the site's own copy (`<title>`, headings) free of any real product/
  trademark names — not an issue for this topic, but `scripts/lib/marks.mjs`
  is what the gate checks against if a future revision names a specific
  index, fund, or bank product.
- Didn't test in a browser (no tooling here) but the harness screenshots
  after this turn — reduced-motion is honored via the kit's CSS-only media
  query, and the range slider/toggle are both 44px+ tap targets already.
