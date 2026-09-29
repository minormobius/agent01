# atlink — handoff

## What this is

A two-way converter between `https://bsky.app/profile/<handle-or-did>/post/<rkey>`
links and `at://<authority>/<collection>/<rkey>` URIs. Direction is auto-detected
from the pasted text (`at://` scheme vs. containing `bsky.app`) — there is no
toggle, per the brief. It's pure string parsing: no `fetch`, no `kit.bskyGet`,
nothing network-shaped anywhere in the JS. This shipped complete in one turn;
I'm not aware of anything left undone from the original ask.

## Decisions

- **Unknown collections don't hard-fail.** If an `at://` URI has a collection
  this tool doesn't recognise (only `app.bsky.feed.post`, `.feed.generator`,
  `.graph.list`, `.graph.starterpack` are mapped to a bsky.app path), it still
  renders the authority/collection/rkey breakdown table — just with no
  bsky.app link and an inline note explaining why. Same in reverse for an
  unrecognised bsky.app path segment. The brief listed "unrecognised
  collection" as one of the malformed-input cases to message clearly, but
  since the URI itself parses fine in that case, showing the breakdown felt
  more honest than refusing the whole input — the page's whole second purpose
  is being an AT-URI explainer, and a well-formed-but-unmapped URI is still
  worth explaining.
- **Bonus: profile-only / repo-root links convert too.** A bare
  `bsky.app/profile/<x>` (no `/post/<rkey>`) becomes `at://<x>` and vice
  versa, with a note that there's no record to point at. Cheap to add once
  the parser existed and rounds out the "explainer" framing.
- **No `kit.handleInput`.** The input here is a URL/URI paste target, not a
  handle-entry field, so the typeahead helper doesn't apply — deliberately
  skipped, not an oversight.
- **Live conversion on `input`, no submit button.** Since there's no network
  call, there's no reason to make the visitor click a button; the result
  updates as they type or paste.

## The plan (nothing blocking, but if extended)

- Could add more collections to the map (e.g. `app.bsky.feed.threadgate`,
  `app.bsky.actor.profile` for `at://<did>/app.bsky.actor.profile/self`) if a
  future request wants broader NSID coverage — the map is a two-line add per
  collection (`SEG_TO_COL` won't have a bsky.app path for most of these
  though, since most record types have no permalink page; only the ones with
  a real bsky.app path belong in the map).
- Could validate DID/handle shape more strictly (right now any non-empty
  string is accepted as an authority) if malformed authorities turn out to be
  a common paste mistake.

## Gotchas

- `kit.js` is loaded with `defer` in `<head>`; the inline `<script>` in the
  body runs before it *executes* during parsing, so don't call `kit.*` at
  the top level of the inline script — only from event handlers, which fire
  after `defer`red scripts have run. Wasted a few minutes double-checking
  this wasn't a real bug before confirming it's fine as written.
- `kit.showError`/`kit.clear` toggle the `hidden` attribute, not a CSS class
  — if you add a `display: none` rule keyed on the element's `id`/class in a
  local `<style>` block, it'll fight the `hidden` attribute and the error box
  will never appear. Caught this once already in this file; if you touch the
  `#err`/`#note` CSS, make sure display is controlled by `hidden` alone.
