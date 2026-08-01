# BRIEF — contagion-treasury

## What this is

The requester shared a headline ("US Treasury undertakes historic intervention
in yen market") and asked "contagion? Why would the US do this? Explain and
model the relationship." The thread had three guesses floating around: make
Japan import more, retaliation over oil/war costs, and — closest to right —
that it's at Japan's request because BOJ's own defense was failing, financed
by selling euro reserves.

Shipped as one page, `index.html`: a written explainer (yen carry trade →
Japan's US Treasury holdings → forced-selling loop back into US yields), then
an interactive five-stage model. A slider sets "yen weakness" (0–100,
illustrative), a toggle flips between "Japan defends alone" and "US Treasury
intervenes early," and five stage-cards recompute live: yen weakness → BOJ
hike pressure → Treasury-selling pressure → US yield pressure → US market
volatility. A second toggle reveals the exact arithmetic per stage, matching
this requester's established "mechanism as an opt-in reveal" preference (see
`lab/_profiles/ezba.bsky.social.md`).

No Bluesky handle lookup — this profile is comfortable with pure-concept pages
that don't need one, and nothing in the ask calls for a specific account.

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
