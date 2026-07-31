# tzclock

A one-page UTC clock, served at `minomobi.com/tzclock/`. Requested by
@modulomino.bsky.social: "a page showing the current UTC time in big
monospace, with a button to copy it as an ISO 8601 string." This is the
second attempt at this exact request (the first apparently never landed a
directory — there was nothing at `lab/www/tzclock/` to iterate on, so this
is a fresh build, not a patch).

## What it does

A large `HH:MM:SS` readout in UTC, ticking once a second, plus a small line
underneath with the full date. One button, "Copy as ISO 8601", copies
`new Date().toISOString()` at the instant it's clicked. No Bluesky calls, no
network requests at all — the whole page is `Date` and `setTimeout`.

## Decisions worth knowing about

- **No AT Protocol / Bluesky content whatsoever.** The request has nothing to
  do with a visitor-named subject, so the kit's `bskyGet` allowlist and the
  content-gate rule don't apply here — there was simply nothing to fetch.
  Still linked `../_kit/tokens.css` and `../_kit/kit.js` for the shared
  palette, `kit.crumb()`, and `kit.copy()` (button feedback + the
  clipboard-vs-`execCommand` fallback), rather than reinventing either.
- **Self-correcting tick.** Used `setTimeout(tick, 1000 - (Date.now() % 1000))`
  instead of `setInterval(fn, 1000)`, which free-runs from whenever it was
  started and drifts/double-skips over time. This re-aligns to the real
  second boundary every tick.
- **The copy doesn't claim false precision.** The big display only shows
  whole seconds, but the copied ISO string carries milliseconds — the exact
  moment of the click, not a re-read of the last second tick. Said so
  explicitly in the body copy rather than let someone assume the two always
  match to the millisecond.
- **The worked example in the explanatory paragraph is live**, not a frozen
  date typed into the HTML — it re-renders every tick alongside the clock, so
  the page never shows a stale illustrative date next to a real live one.

## Left open

- Not tested in a browser from this sandbox (no Bash/WebFetch here) — checked
  by reading the markup and script carefully for balanced tags and correct
  `Date` UTC accessors (`getUTCHours`/`getUTCMinutes`/`getUTCSeconds`/
  `getUTCFullYear`/`getUTCMonth`/`getUTCDate`), but a real-browser check of
  the tick alignment and the copy button (secure-context clipboard path) is
  still owed.
- No timezone picker or local-time display by design — the request was
  specifically UTC-only, and adding a picker would be scope beyond what was
  asked.
