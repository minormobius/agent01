# have-well — Intentometer

## What this is

The ask was terse: "have a go as well, please me," on a thread whose earlier
context was someone else automating an "intentometer" over on
buildthis.bisks.net. No spec beyond that — same pattern this requester
(thegodfungi.bsky.social) has used before (see their profile): a mood or a
gesture, not a feature list, and the concrete shape is left to the builder.

I read "automate" as the operative word and built two modes in one page:

1. **Manual** — type any sentence ("I'm going to start running every
   morning"), click "read it," get a needle-gauge score 0–100 plus a
   category ("just talk" → "locked in") and a list of the specific words
   that moved the score, positive and negative.
2. **Automated** — type/pick a Bluesky handle (via `kit.handleInput`), and
   it runs the exact same scoring function across that account's last ~15
   real text posts (reposts filtered out via `item.reason`, moderated
   content dropped via `kit.visible`), then shows the average reading and
   a per-post breakdown. This is the "automating" part: instead of feeding
   the meter one line by hand, it points itself at a stream of things
   someone already said.

Both modes shipped and are wired end to end against the real endpoints
(`resolveHandle`, `getAuthorFeed`), field names checked against the fixtures
in `lab/_kit/fixtures/`.

## Decisions

- **Heuristic, not "AI."** Scoring is a fixed table of regex signals
  (commitment words like "I will"/"starting today" push the score up,
  hedges like "maybe"/"someday"/"thinking about" push it down), baseline
  50, clamped 0–100. This is the right call for a page whose whole point is
  reading intent from *wording* — I did not want to imply a sentiment model
  is doing something smarter than pattern-matching, and this requester's
  history (see profile, the flame-simulator builds) rewards numbers that
  are honestly labelled approximate over ones dressed up as more than they
  are. The footer says this plainly.
- **Transparency chips instead of a black box.** Every signal that fired is
  shown as a small chip (green = pushed the score up, red = pushed it
  down) below the reading, not just a bare number. Cheap to build, and it
  turns "why did it say 62" into something visible rather than something
  you have to trust.
- **Readouts kept out of the visual surface.** This requester gave explicit
  UI feedback on an earlier build (cheers-write, sixth build): no text
  overlaid on a simulation/visual surface, even in a translucent box. The
  gauge SVG has zero `<text>` in it — the score, category and chips are all
  regular DOM elements in document flow below the SVG. Kept that rule even
  though this isn't the site that feedback was originally about, since it
  reads as a general preference worth generalising (and the profile file
  says so explicitly).
- **Skipped resolveHandle when the typeahead already gives a DID.**
  `kit.handleInput`'s `onPick` callback hands back an actor object with
  `.did` already resolved; `runFeed` uses that directly and only calls
  `resolveHandle` when someone types a handle and hits Enter/clicks the
  button without picking from the dropdown. Saves a round trip in the
  common case.
- **Reposts excluded from the automated reading.** `getAuthorFeed` returns
  reposts-by-this-author with a `reason` field set; those are someone
  else's words, not the account's own stated intent, so they're filtered
  out before scoring. Only posts with real, non-empty `record.text` count.

## The plan — what's not built

Scoped to one turn; this is what I'd do next, in order:

1. **A history/compare view.** Right now each run is stateless — nothing is
   saved. The obvious next step (and it fits the kit's whole reason for
   existing) is `labPds()`: let a signed-in visitor save their manual
   readings over time (`store.save('reading', {...})`) and see a trend, or
   `postScore` the automated average so two named accounts can be compared
   side by side. I left this out because sign-in should be optional and the
   page is fully useful without it — but it's the natural next layer, not
   a stretch.
2. **A "compare two handles" mode** in the automated section — run the
   meter on two accounts side by side, gauges next to each other. Fits this
   requester's demonstrated taste for versus/competitive mechanics (see the
   "Flame Wars" battle-mode build in their profile). Straightforward:
   duplicate `runFeed`'s call, no new endpoints.
3. **Thread mode.** `getPostThread` is on the allowlist and takes a URI the
   visitor supplies — could run the meter across a whole thread's replies
   instead of one account's feed. Slightly trickier: `getPostThread`
   returns a nested reply tree, not a flat list, so it needs a recursive
   walk to collect `post.record.text` out of `thread.replies[]`. Fixture is
   at `lab/_kit/fixtures/getPostThread.json` — read its actual shape before
   writing the walk, don't assume it matches `getAuthorFeed`'s flat `feed[]`.
4. The signal table itself is a first pass tuned by eye on a handful of
   example sentences while writing this, not against any real corpus — if
   a future turn gets a complaint that the score "feels wrong" on some
   phrasing, that's the file to open (`SIGNALS` array, top of the inline
   script), not the gauge math.

## Gotchas

- `getAuthorFeed`'s `feed[]` items are NOT all first-person posts by the
  named account — the fixture's own first entry is a *repost*, with the
  actual post authored by someone else entirely and the reposting
  account only present in `item.reason.by`. Filtering on `item.reason`
  is load-bearing, not defensive; skipping it would score other people's
  words as the named account's intent.
- Gauge geometry (the three SVG arc `path d` strings) is hand-computed
  trig, not generated at runtime, to keep the script short. If the radius,
  center, or band split (currently thirds) ever changes, those `d` strings
  need recomputing by hand too — they're not derived from a variable
  anywhere.
- Did not get to see this rendered — going on the fixture shapes and the
  kit docs only. If the harness screenshot shows the gauge bands rendering
  on the wrong side (bottom instead of top), the sweep-flag on the arc
  paths is the thing to flip first.
