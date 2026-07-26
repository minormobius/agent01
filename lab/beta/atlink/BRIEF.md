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

## Iteration: input hygiene

Re-checked the parsing against the edge cases the previous pass had flagged as
unverified: a trailing slash after the rkey, a `?query=string` or `#fragment`
tacked onto a bsky.app URL, and an uppercase `AT://` scheme. The `bsky.app`
side was fine — its regex excludes `/`, `?` and `#` from the captured rkey,
and scheme matching is case-insensitive throughout.

The `at://` side was **not** actually fine, despite what this section
previously claimed: `parseAtUri`'s rkey extraction was
`parts.slice(2).join('/')`, which reassembles everything after the collection
segment with `/` separators re-inserted — so `at://did:plc:x/app.bsky.feed.post/abc/`
(one trailing slash, which people paste often enough — e.g. copied from a
browser address bar that auto-appends one) produced a parsed rkey of `abc/`
with the slash still attached, and that leaked into the `bsky.app` output URL
and the breakdown table. Fixed by stripping trailing slashes from the rkey
after the query/fragment split (`.replace(/\/+$/, '')`), order matters: strip
`?`/`#` first, then trailing `/`, since a trailing slash can also sit right
before a query string.

What *was* missing before this: pasting a URI copied out of Markdown or a chat
client often carries one layer of wrapping punctuation along with it —
`` `at://...` ``, `<at://...>`, or `"at://..."`. That wrapper made the input
unrecognisable (the leading backtick or `<` broke both the `at://` prefix
match and the `bsky.app` substring match cleanly, but left a stray trailing
character that could confuse the parsed rkey). Added an `unwrap()` step that
strips one matched pair of `<>`, `` ` ``, `"` or `'` from the trimmed input
before conversion runs. It only fires when both ends match, so it can't
mis-fire on a URL that legitimately contains one of those characters
mid-string (none of the formats here do).

## What's still open

- The three examples use a real-looking but not verified-live rkey
  (`3l6oyqzy5x22a`) and a real Bluesky DID (`jay.bsky.team`'s). They're only
  used for local string parsing, so their liveness doesn't matter, but if this
  page is ever extended to *validate* a record's existence (it currently
  doesn't, by design), those examples should be revisited.
- Collection-name matching is exact-string (`app.bsky.feed.post`) with no
  fuzzy suggestions ("did you mean...") for typos in the collection segment —
  could be a nice follow-up but wasn't asked for.
- `unwrap()` strips only one layer of wrapping. A double-wrapped paste (e.g.
  a backtick-fenced string that itself was copied with angle brackets) would
  need two passes; not handled, and unlikely enough in practice not to bother.
