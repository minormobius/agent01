# atlink — handoff

## What this is

A two-way converter between a bsky.app post permalink
(`https://bsky.app/profile/<handle-or-did>/post/<rkey>`) and the canonical
`at://<authority>/app.bsky.feed.post/<rkey>` form. Direction is auto-detected
from the pasted string (starts with `at://` vs. anything else, tried as a
URL). Alongside the conversion it breaks the input into authority/collection/
rkey in a small table, and the page doubles as a short explainer of AT-URI
shape. This shipped complete in one turn — it's a small, purely-local parsing
task with no API surface, so there wasn't a natural place to stop short.

## Decisions

- **No network calls at all**, per the brief. That means no `kit.handleInput`
  (there's nothing to type a handle *into* — the input is a full URL/URI) and
  no DID resolution. When the authority in the result is a handle rather than
  a `did:`, the page says explicitly that this isn't canonical and that
  resolving it needs a lookup the page won't make. Don't add a "resolve" button
  later without re-reading the "one rule with teeth" section — `resolveHandle`
  is on the kit's allowlist and would be legitimate (it's a subject the visitor
  named), but it changes this page from "instant, offline, honest about its
  limits" into something that can hang or fail, which was the wrong trade for
  what is essentially a syntax tool.
- **Only `app.bsky.feed.post` converts to a URL.** An at:// URI with a
  different collection (e.g. `app.bsky.graph.list`, `app.bsky.actor.profile`)
  still gets parsed and shown in the table (so the explainer value isn't lost)
  but is flagged as an "unrecognised collection" error and produces no output
  URL, because bsky.app doesn't have a single uniform path shape across record
  types (lists are `/lists/<rkey>`, feeds are `/feed/<rkey>`, etc.) and
  guessing wrong would be worse than declining.
- **Table shows even on the "wrong collection" error path**, not just on full
  success — deliberate, so a visitor pasting a non-post at:// URI still gets
  the explainer value instead of a bare error.
- Conversion runs live on `input`, no submit button — it's cheap local regex
  work, so debouncing or an explicit "convert" action would only add friction.

## The plan (if there's a next turn)

Nothing is known-broken. If asked to extend:
1. Support more collections' URL shapes (list → `/profile/<a>/lists/<rkey>`,
   feed generator → `/profile/<a>/feed/<rkey>`, starter pack, etc.) — the
   `convert()` function's collection check is the one place to extend; add a
   small collection→path-segment map instead of the single `POST_COLLECTION`
   constant.
2. Optional handle→DID resolution behind an explicit opt-in button using
   `kit.bskyGet('com.atproto.identity.resolveHandle', {handle})`, clearly
   labelled as making a network call, so the "no network calls" default
   behaviour stays intact unless asked for.

## Gotchas

- `new URL()` throws on a bare `bsky.app/profile/...` with no scheme — handled
  by retrying with an `https://` prefix, but worth remembering if editing
  `parseBskyUrl`.
- Untested in an actual browser render (no Bash/WebFetch available here) — the
  post-build harness screenshot is the first real look at this.
