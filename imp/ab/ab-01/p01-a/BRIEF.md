# BRIEF — atlink

## What this is

A two-way AT Protocol permalink converter. Paste a `bsky.app` post URL
(`https://bsky.app/profile/<handle-or-did>/post/<rkey>`) and get the
canonical-shaped `at://<authority>/app.bsky.feed.post/<rkey>` URI back, or
paste an `at://` URI and get the `bsky.app` URL. Direction is auto-detected
from the input — no toggle, no picker. Everything is local string parsing;
no network calls anywhere on the page.

Acceptance list, from the request:

1. Paste a bsky.app URL → get the at:// URI. ✅
2. Paste an at:// URI → get the bsky.app URL. ✅
3. Direction auto-detected, not user-chosen. ✅
4. Pure string parsing, zero network calls. ✅
5. Breakout table of authority / collection / rkey alongside the output,
   doubling as an AT-URI structure explainer. ✅
6. Note that a handle-authority at:// is non-canonical, DID is canonical,
   and resolving one to the other needs a network lookup this page
   deliberately skips. ✅ (static explainer copy + a per-result note when
   the parsed authority is a handle)
7. Malformed input gets a specific inline message: missing rkey,
   unrecognised collection, not a bsky.app URL — not silence, not a stale
   result. ✅
8. Copy-to-clipboard on the output. ✅ (`kit.copy`)
9. Three clickable examples, both directions, one with a `did:` authority. ✅

## Decisions

- **No `kit.handleInput`.** The task is explicit that this is pure parsing
  with no network calls, and handleInput calls the AppView typeahead. The
  input here is a URL/URI paste, not a handle lookup, so the shared handle
  box genuinely doesn't apply — don't add it just because the kit has it.
- **Live conversion on `input`**, not a submit button. Conversion is
  synchronous and cheap (regex/string split), so there's no reason to make
  the visitor click anything; the result and any error update on every
  keystroke/paste.
- **Supports three bsky.app path shapes**, not just `/post/`:
  `post` → `app.bsky.feed.post`, `feed` → `app.bsky.feed.generator`,
  `lists` → `app.bsky.graph.list`. The task only asked about posts, but the
  page is also framed as an AT-URI explainer, and refusing a feed/list link
  with "unrecognised collection" when the shape is well-known felt wrong.
  Anything outside that trio (or an at:// collection outside that trio)
  gets the "unrecognised collection" error, by design.
- **Table renders from best-effort partial data even on error.** If parsing
  fails after the authority (or authority+collection) was already read —
  e.g. rkey missing — the table still shows what *was* parsed, with `—` for
  what wasn't, instead of hiding everything behind the error. Reasoning:
  the explainer function of the table shouldn't switch off exactly when a
  visitor is debugging a URL that didn't quite work.
- **Direction detection order:** `at://` prefix first (case-insensitive on
  the scheme only), then treat as a URL (prepending `https://` if the user
  pasted `bsky.app/…` with no scheme), then give up with a clear "doesn't
  look like either" message. No sniffing inside a URL for `at://` embedded
  as a query param or similar — out of scope.

## The plan (not done / next)

- Only `post`, `feed`, `lists` are mapped. If a future ask wants
  `app.bsky.graph.starterpack` or other NSIDs, add to both
  `BSKY_PATH_TO_NSID` and its inverse — the two tables are the only place
  that knows the mapping.
- No validation of rkey shape (TID format). Presence-only check. Could add
  a soft warning ("doesn't look like a typical record key") without
  blocking conversion, since malformed-but-present rkeys still round-trip.
- Did not attempt any DID/handle resolution, on purpose (network calls are
  banned for this page) — the copy says so. If a future site wants the
  resolved form, that's a different page with a different rule, not a mode
  of this one.

## Gotchas

- `new URL('at://...')` is not reliable for the at:// scheme (not a special
  scheme in WHATWG URL parsing), so the at:// side is parsed by hand
  (`slice(5)` past the literal `at://`, then `split('/')`), not via `URL`.
- bsky.app URLs *are* parsed via `new URL()`, after normalizing a
  scheme-less paste (`bsky.app/profile/...`) by prepending `https://` — but
  only when the string plausibly starts with `bsky.app/`, so a bare
  `profile/x/post/y` doesn't get silently accepted as a URL.
- **`hidden` attribute vs. an authored `display` rule on the same element
  is a real trap, not a hypothetical one — it happened here.** The output
  box had `.output { display: block }` in the page's own `<style>`, and JS
  toggled visibility with `el.hidden = true`. Author CSS always beats the
  UA's `[hidden]{display:none}`, so the box stayed visible — empty but
  bordered — every time conversion failed. Caught by `eyes look`, not by
  reading the code. Fixed by toggling a `.hidden` class on the wrapping
  row instead (with `.outputRow.hidden{display:none}` in local CSS, since
  even a plain `.hidden` class from tokens.css can lose a specificity/order
  tie against a same-specificity local rule). If a future edit adds a
  `display` rule to `#resultBlock` or `#err`, give it the same treatment —
  right now neither has one, which is the only reason their `.hidden`/
  `hidden` toggles work unmodified.
- Checked in a real browser under the production CSP with `eyes` (desktop
  + 390×844 mobile): drove all three example buttons, the copy button
  (clipboard write confirmed via the button's "copied" state), and three
  malformed-input cases (missing rkey, unrecognised collection, not-a-
  bsky.app-URL) — each showed the specific message and, where any component
  had parsed, the correct partial table. Also drove clearing the input back
  to empty, which correctly hides the error, table and output rather than
  leaving a stale result on screen.
