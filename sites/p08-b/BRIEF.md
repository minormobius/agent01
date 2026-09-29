# BRIEF — atlink

## What this is

A two-way AT Protocol permalink converter. Paste a `https://bsky.app/profile/<handle-or-did>/post/<rkey>`
URL and get the canonical `at://<authority>/app.bsky.feed.post/<rkey>` URI, or
paste an `at://` URI and get the `bsky.app` URL. Direction is auto-detected
from the input — no toggle, no mode switch. Pure string parsing, zero network
calls, computed entirely client-side.

## Acceptance list (from the request, verified with eyes tools before calling this done)

1. Paste a bsky.app post URL → get the at:// URI.
2. Paste an at:// URI → get the bsky.app URL.
3. Direction auto-detected from the input, not chosen by the user.
4. Parsed components (authority, collection, rkey) broken out in a labelled table.
5. Copy note: an at:// URI with a **handle** authority is not canonical (DID
   is canonical); resolving one to the other needs a network lookup this page
   deliberately doesn't do.
6. Malformed input gets a clear inline message naming the specific problem
   (missing rkey / unrecognised collection / not a bsky.app URL), not a
   silent failure or a stale result left on screen.
7. Copy-to-clipboard button on the output.
8. Three clickable examples, covering both directions, at least one with a
   `did:` authority.
9. Mobile-safe: viewport meta, 16px+ inputs, 44px+ tap targets, no horizontal
   scroll at 360px, nothing hover-only, prefers-reduced-motion respected
   (kit handles this one).
10. `<title>`, `og:title`, `og:description` present and written for a stranger
    scrolling past.

## Decisions

- Only `app.bsky.feed.post` is treated as a recognised collection for
  conversion — the request's own worked examples are post permalinks, and
  a converter that silently "handles" every collection without a matching
  bsky.app URL shape would be guessing. Any other collection in an at://
  URI is reported as "unrecognised collection", per the spec's own wording.
- No `kit.handleInput` — this page never asks for a handle to look someone
  up, it parses whatever authority string is embedded in the pasted link.
  Using the typeahead here would imply a resolution step that doesn't happen.
- No `pds.js` / sign-in — nothing to remember across visits, there's no
  per-visitor state worth a repo write for a stateless converter.
- Conversion runs live on every keystroke (debounce-free — the work is a
  couple of regexes, not a network call) rather than requiring a button
  press, so the table updates as you type or paste.
- Loose validation on the authority segment (non-empty, no `/`, no spaces)
  rather than strict DID-method/handle-grammar checking — the page's job is
  format conversion, not a validator for every AT Protocol identifier rule.

## The plan (what's not built)

- Nothing held back knowingly at time of writing — this is a small, complete
  scope. If a future turn wants more: supporting other record types (e.g.
  `app.bsky.feed.generator`, `app.bsky.graph.list`) by mapping to their own
  bsky.app URL shapes (`/feed/<rkey>`, `/lists/<rkey>`) rather than only
  posts would be the natural next step — the parsing skeleton here
  (`parseAtUri`/`parseBskyUrl`) is written so that's a lookup table away, not
  a rewrite.

## Gotchas

- Nothing surprising hit during the build. The one thing worth flagging for a
  future turn: the direction-detection for the bsky.app branch is a plain
  `indexOf('bsky.app') !== -1` substring check, not a URL-host check, because
  the host check only runs *inside* `parseBskyUrl` (which needs `new URL()`
  to already have a protocol). That's deliberate — it's what lets
  `evilbsky.app/profile/...` get caught and reported as "not a bsky.app URL"
  with the actual host named, rather than falling into the generic "doesn't
  look like either format" message. Checked with eyes/drive: verified against
  all 9 acceptance items above, including both error phrasings and the
  DID-authority example, at 1280×800 and 390×844 (mobile). No console errors
  on any pass.
