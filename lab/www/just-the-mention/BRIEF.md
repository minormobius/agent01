# BRIEF — sorry-aforementioned

## What this is

A thread asked for a gallery of every post where `@croissanthology.com`
replied to something with *nothing but* the text `@norvid-studies.bsky.social`
— no other words, no punctuation, just the bare mention. "ALL and ONLY those
posts, in a single gallery."

The directory name (`sorry-aforementioned`) comes from the requester's own
"sorry, make the aforementioned website — little snafu at the switchboard" —
they were pointing back at an earlier ask in the thread rather than writing a
fresh spec, and the actual brief (create-a-gallery request from
`minormobius.bsky.social`) is what's quoted above and what got built.

Shipped: a single `index.html` that, on load, resolves `croissanthology.com`
to a DID, walks its `getAuthorFeed` (with `filter=posts_with_replies`) page by
page, and for every reply whose trimmed text case-insensitively equals
`@norvid-studies.bsky.social`, renders a card: the reply itself, plus (when
available) a one-line preview of the post it replied to, linking out to the
real post on bsky.app. Progress is shown live as it scans ("scanning — 340
posts read, 2 matches so far…").

## Decisions

- **Hardcoded the two handles, no `kit.handleInput`.** The subject here isn't
  something a visitor types — it's fixed by the request itself (a specific
  pair of accounts named in the thread). A handle box would invite scanning
  an arbitrary account's replies against an arbitrary target, which is a
  different, un-asked-for tool.
- **Matched on literal post text, not richtext facets.** `record.text.trim()
  === '@norvid-studies.bsky.social'` (case-insensitive). This is the most
  literal reading of "posted only '@norvid-studies.bsky.social'" and is cheap
  and robust. It does NOT verify the text is an actual resolved mention facet
  pointing at the right DID — a post that happens to contain that exact
  string as inert text (not a working mention) would still match. Given the
  string is the full handle, a false positive here is very unlikely in
  practice, but it's a simplification, not a proof.
- **`filter=posts_with_replies` on `getAuthorFeed`**, not the default filter,
  since replies are exactly what we need and are excluded by some filter
  modes.
- **Skip items with a `reason` field** (reposts surfacing in the author's own
  feed) — those aren't authored by croissanthology, so they can't be their
  replies.
- **40-page / ~4000-post safety cap**, with a visible message if it's hit
  rather than silently truncating. No way to know from here how many replies
  the account has ever posted.
- Used `kit.visible()` to drop labelled content before rendering, per the
  kit's moderation rule.

## The plan (not built yet)

Nothing is stubbed — the whole pipeline (resolve → paginate → filter → render)
works end to end as far as it can be verified without a live browser. If a
next turn picks this up because the requester wants more:

1. **Verify against real data.** I have no network access; this has never
   actually run against `public.api.bsky.app`. The harness's post-build
   screenshot pass should catch a broken selector or a JS error, but it can't
   tell you whether croissanthology.com has *any* matching posts, or whether
   the pagination genuinely terminates for a real account. If the harness
   report shows an empty gallery, check whether that's correct (zero matches
   is a legitimate outcome) before assuming a bug.
2. If the requester wants stricter matching (verified mention facet, not just
   literal text), read `record.facets` for a `app.bsky.richtext.facet#mention`
   whose `did` resolves to norvid-studies' DID and whose byte range covers the
   whole trimmed text — more correct, more code, not done here for time.
3. If 4000 posts isn't enough for this account's real history, consider a
   "load more / keep scanning" button instead of a hard cap, so the visitor
   controls how far back it goes rather than the page deciding silently.

## Gotchas

- The `getAuthorFeed` fixture in `lab/_kit/fixtures/getAuthorFeed.json`
  happens to capture a *repost*, not a reply, so it has no `reply` field or
  top-level `reply` sibling on the feed item to check field names against.
  The `item.reply.parent` shape used here (a `ReplyRef` with `root`/`parent`
  PostViews, sibling to `item.post`) is standard AT Protocol lexicon shape,
  not confirmed against a captured fixture — if the harness reports a JS
  error reading `.author` or `.record` off `item.reply.parent`, that's the
  first place to look, and the code already guards for `parent` being a
  `NotFoundPost`/`BlockedPost` (no `.record`) by falling back to "(the
  original post is no longer available)".
- Did not use `/_img/` for avatars — they're only ever displayed in `<img>`
  tags, never drawn to canvas, so the CORS-taint issue that proxy exists for
  doesn't apply here.
