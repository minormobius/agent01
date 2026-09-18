# BRIEF — needing-your ("Mental Exhaust")

## What this is

Requested via a Bluesky thread: norvid-studies asked what @minormobius's
account "thing" was before it became a general web-building bot, quoting
@words's description of it as "manic wikipedia and other immersive resource
chart and general polymathical image harvesting and image quotes and
poetico-mathematic ambiguously art or science mystical aphorism generator"
(and minormobius's own "flooding the tl with mental exhaust with wildly
variable quality") — then asked "perhaps we could recreate it in the
aggregate." Read that as a request to *recreate the vibe*, not to display or
scrape that account's real timeline (see GOTCHAS/decisions below).

Shipped: a self-contained generator. Five word-bank "domains" (mysticism,
futurism, folklore, naturalia/bugs-and-slugs, mathematics) combine via a
seeded RNG into a fake Wikipedia-style infobox, an invented bar chart with
nonsense units, and a mad-libbed aphorism, all rendered onto a single canvas
"poster" (the image-quote form). Controls: generate another, download PNG,
copy permalink (`#seed=N` reproduces exactly), copy plain text. A "flood the
timeline" button spawns nine cheap text-only cards at once — the "wildly
variable quality, flooding the tl" bit, literalised — and clicking one
promotes it to the main poster.

## Decisions

- **No firehose, no `getAuthorFeed` on the real account, no quoting anyone's
  actual posts.** The one rule with teeth bans pulling an unnamed stream, and
  even though the origin account is named in the thread, showing or
  paraphrasing its real timeline would still be "media from a stream the
  visitor didn't ask this page to fetch live" plus a likeness/expression risk
  under the Tetris-style rule (don't reproduce someone's actual creative
  output under an implied claim it's theirs). A **generative pastiche** —
  new word banks evoking the same five interests mentioned in the thread
  (futurism, mysticism, folklorism, bugs, slugs) — sidesteps both problems and
  is arguably closer to "in the aggregate" than a scrape would be.
- Canvas poster, not DOM-styled HTML, so "download PNG" and "screenshot to
  share" both work without any DOM-to-image library (none is vendored here).
  A plain-text `<details>` transcript underneath keeps it accessible/copyable
  for anyone who can't or doesn't want the image.
- Seeded (`mulberry32`) so the permalink is a real permalink — same seed,
  byte-identical fragment, forever.
- No login, no `pds.js`. The generator is fully meaningful signed-out; adding
  auth only to persist a favourite would have added scope this turn didn't
  need.
- Kit amber untouched (this requester's baseline in every build so far); the
  *generated cards* themselves cycle through seed-derived hues on purpose —
  that variety is the point of "wildly variable quality," the chrome around
  it stays consistent.

## The plan (next turn, in order)

1. **Save-to-repo.** The obvious next feature per the kit's own pattern: a
   "keep this one" button that calls `labPds().save('archive', list)` after
   `signIn`, building a small array of `{seed, title, aphorism, quality}` the
   visitor can revisit. Needs a `kit.handleInput` box and a sign-in gate only
   on that one action, not on the whole page.
2. **More templates/domains** if it starts feeling repetitive — 10 aphorism
   templates × 5 domains² is a lot of combinations already, but the phrasing
   pattern ("Every X is Y") is recognizable after a dozen generations. Easy
   lever: add 5-10 more templates before adding domains.
3. Consider letting the "flood" grid write its own small multiples onto
   mini-canvases (same `renderPoster` at reduced scale) instead of plain text
   cards, if a future turn wants the flood view to look as designed as the
   main poster. Skipped this time — text cards were enough to prove the
   "quantity over quality" idea and much cheaper to build.

## Gotchas

- Canvas text has no built-in wrap — `wrapText()` here is a plain
  greedy-word-wrap; it doesn't hyphenate, so a single very long generated
  word (there aren't any in the current banks) could overflow. Fine for now,
  worth remembering if new word-bank entries are added.
- `history.replaceState` is used instead of setting `location.hash` directly,
  to update the URL without adding a browser-history entry per generation —
  worth keeping if this file is edited, since hash-set version would make
  the back button useless after a few clicks of "generate another."
- Did not test in an actual browser (no network/shell in this sandbox) — the
  harness screenshot after this build is the first real render; if the
  canvas gradient or text sizing looks off at small phone widths, that's the
  first thing to check (the canvas itself is fixed at 900×1200 internal
  resolution and scaled by CSS `width:100%`, so it should hold aspect ratio
  fine, but wasn't visually confirmed).
