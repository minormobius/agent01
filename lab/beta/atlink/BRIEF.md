# atlink — BRIEF

## What this is

A single static page at `beta.minomobi.com/atlink/` that converts between the
two ways an AT Protocol Bluesky post gets addressed: a `bsky.app` web URL
(`https://bsky.app/profile/<handle-or-did>/post/<rkey>`) and the canonical
`at://` record URI (`at://<authority>/app.bsky.feed.post/<rkey>`). It also
doubles as a small explainer for how an AT URI is put together (authority /
collection / rkey), broken out into a table alongside the converted result.

## What was asked

Built as a lab-beta tenant per the task brief in the originating conversation:
paste either form, detect direction automatically (no direction picker),
convert with pure string parsing and zero network calls, show the parsed
components in a labelled table, surface malformed input with a specific inline
message instead of failing silently or leaving a stale result on screen, offer
a copy-to-clipboard button on the output, and give three clickable examples
covering both directions with at least one `did:` authority.

## Decisions made

- **Direction detection**: if the trimmed input starts with `at://` it's
  treated as an AT URI; else if it contains `bsky.app` it's treated as a web
  URL; anything else is an immediate error. This is a simple, predictable rule
  and matches how a user would actually paste these two formats.
- **Collection restriction**: an `at://` input is only convertible to a
  `bsky.app` URL when its collection is exactly `app.bsky.feed.post`, since
  that's the only record type `bsky.app/profile/*/post/*` can display. Any
  other collection (e.g. `app.bsky.graph.follow`) surfaces as an explicit
  "unrecognised collection" error rather than producing a URL that would
  404. There's no such restriction going the other way — a bsky.app post URL
  always implies `app.bsky.feed.post`.
- **Canonicalness note**: when the parsed authority doesn't start with `did:`
  (i.e. it's a handle), a note appears under the result explaining that the
  handle form isn't canonical and that resolving handle↔DID needs a network
  lookup this page deliberately doesn't perform. This satisfies the brief's
  requirement without ever making a fetch.
- **Live conversion**: the page converts on every keystroke (`input` event)
  rather than requiring a submit action — feels more like a utility, and the
  "no stale result" requirement is trivially satisfied since the DOM is fully
  re-rendered (or cleared to an error) on every change.
- **Copy button**: uses `navigator.clipboard.writeText`, falling back to a
  hidden-textarea + `execCommand('copy')` for older browsers/contexts where
  the clipboard API is unavailable.
- **Styling**: copied the dark/monospace/single-accent-colour convention from
  `lab/beta/index.html` (same CSS variables, same breadcrumb pattern) rather
  than inventing a new visual language, per the style instructions.

## What's still open

- No automated test was run beyond manual reasoning about the regexes; worth
  eyeballing in a real browser against a handful of real bsky.app URLs
  (including ones with query strings or trailing slashes) before treating this
  as fully verified.
- The three examples use a real-looking but not verified-live rkey
  (`3l6oyqzy5x22a`) and a real Bluesky DID (`jay.bsky.team`'s). They're only
  used for local string parsing, so their liveness doesn't matter, but if this
  page is ever extended to *validate* a record's existence (it currently
  doesn't, by design), those examples should be revisited.
- Collection-name matching is exact-string (`app.bsky.feed.post`) with no
  fuzzy suggestions ("did you mean...") for typos in the collection segment —
  could be a nice follow-up but wasn't asked for.
