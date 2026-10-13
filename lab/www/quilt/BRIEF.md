# Quilt — BRIEF

## What this is

Requested in a Bluesky thread as: "make a website where you point it at a
bsky thread and it returns a tiled grid of all the images uploaded to that
thread." The thread that spawned it had originally asked for "a single
tiled image," then reframed as "a tiled grid" — I built both: the page
always shows a live CSS grid, and a "download as one image" button bakes
the same tiles into a real composited PNG.

Shipped and working end to end: paste a `bsky.app/profile/.../post/...`
link or an `at://` URI, it resolves the handle if needed
(`resolveHandle`), fetches the **whole thread in one call**
(`getPostThread` with `depth: 1000, parentHeight: 1000`, then climbs to the
root — see this turn's fix below), walks the reply tree recursively, and
collects every `app.bsky.embed.images` (and the images half of
`recordWithMedia`) from every non-hidden post in it. Grid
renders responsively (`auto-fill, minmax(140px, 1fr)`), each tile links to
the fullsize image in a new tab and shows `@handle` as a permanent
(non-hover) caption.

## What this turn shipped

A requester reported "No images anywhere in that thread — just words" on a
thread that had plenty, in many chained replies. Root cause: the previous
turn fetched with `parentHeight: 0`, which returns the linked post and
everything *under* it, but nothing above it. If the visitor pastes a link
to a reply partway down the thread (very normal — "threadtiles" was
announced by a reply, not the root post, in the thread that spawned this
site), the walker never saw the root, any other ancestor, or any sibling
reply-branch off them. It would find images only in the one sub-branch
under the exact post linked — on many real threads, none.

Fixed by requesting `parentHeight: 1000` too, then climbing `thread.parent`
back to the true root (the last node whose `.parent` is still a
`threadViewPost`) before running the existing downward `walk()`. Now every
branch gets visited regardless of which post in the thread the visitor
linked. Not yet re-verified against a real multi-branch thread in a
browser — the harness screenshot pass only drives whatever fixture/page
state loads by default, so if the next report says images are *still*
missing from certain branches, check whether `parentHeight: 1000` is
actually the server's max (it's documented as max 1000, same as `depth`,
but unverified live) and whether `findRoot` stops correctly on a
`blockedPost`/`notFoundPost` ancestor (it does — the while loop's
`$type === 'threadViewPost'` guard excludes both, so climbing stops one
short of a blocked/deleted ancestor rather than throwing).

## Decisions

- **Only images posted directly into the thread, not images inside a
  quoted post.** A reply that *quotes* someone else's post with images is
  showing media from a post the visitor did not name — same reasoning as
  the firehose rule, just one hop narrower. If a future ask wants those
  included too, it's a small addition: `embed.$type ===
  'app.bsky.embed.record#view'` → walk into
  `embed.record.value.embed.images` — but flag the label/takedown risk
  explicitly, since a quoted post is not covered by `kit.hidden()` the same
  way a thread post is (the embedded `viewRecord` carries its own
  `labels`, so it'd need its own `hidden()`-style check, not a blanket
  grab).
- **One `getPostThread` call, no pagination loop.** `depth: 1000` returns
  the entire nested tree in the single response per the fixture's shape,
  so there is no multi-request crawl to get wrong. If a thread is deep
  enough that the API truncates it (unverified — never seen it happen),
  the walker just sees fewer `replies` and silently shows fewer images;
  worth watching for a report before building truncation handling nobody
  needs.
- **The composited download is capped at 144 images (12×12 @ 220px).**
  Keeps canvas size and load time bounded; the on-page grid still shows
  everything. Images for the composite are loaded through `/_img/` (same
  trick as avatars) because drawing a `cdn.bsky.app` image onto a canvas
  taints it — `feed_thumbnail`/`feed_fullsize` are already on the proxy's
  allowlist, which is what makes this possible at all.
- **No `kit.handleInput`.** The input here is a post/thread URL, not a
  handle, so the typeahead doesn't apply.
- **No sign-in, no `labPds` save.** Nothing here is worth persisting to a
  visitor's repo — it's a one-shot lookup, not a thing with state.

## The plan (not built yet, in order)

1. **Verify the root-climb fix against a real multi-branch thread** — does
   pasting a link to a reply buried in the middle of a thread now pull
   images from branches the walker couldn't reach before this turn? Also
   check: does a long thread (50+ replies, mixed images/videos/quotes)
   render without the page locking up? The walker has a 4000-node safety
   cap but was never run against a real large thread.
2. **Video thumbnails** are currently skipped entirely (`embed.$type ===
   'app.bsky.embed.video#view'` is ignored). If a future report asks for
   them, the video view carries a `thumbnail` field — easy add, but decide
   first whether a video's cover frame counts as "an image uploaded to the
   thread" or is out of scope.
3. **A visible "which post is this from" breadcrumb per tile** beyond the
   `@handle` caption — currently clicking a tile just opens the raw image,
   not the post it came from. The post permalink is already computed in
   `imagesOnPost` (`it.link`) but unused in the render; wiring it to a
   second small link on each tile is a few lines.

## Gotchas

- `getPostThread`'s `uri` param needs a real DID authority, not a handle —
  resolving via `resolveHandle` first avoids relying on undocumented
  handle-authority support in the AppView's at-uri handling. Untested
  whether a bare handle authority would have worked anyway; resolving
  first is the safe, verified-by-fixture path.
- The `/_img/` proxy's regex requires the **exact** CDN path shape
  (`img/<kind>/plain/<did>/<cid>@<fmt>`) with no query string — don't try
  to reuse it for anything that isn't a direct `cdn.bsky.app` URL already
  shaped that way.
