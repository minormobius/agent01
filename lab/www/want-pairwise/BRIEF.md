# want-pairwise — a two-circle Venn of who two Bluesky accounts talk to

## What this is

A single page at `minomobi.com/want-pairwise/`: enter two Bluesky handles and
get a Venn diagram of who each one interacts with most, with the overlap —
accounts both handles interact with — emphasized in the middle. Below the
diagram, the same data repeats as three plain-text columns (only-A, both,
only-B) for accessibility and because a scatter of tiny avatars is a fun
picture but a bad primary source of truth.

## What was asked

First build, from a Bluesky thread: "I want a pairwise interaction circle for
bsky. Enter two handles and get their top n accounts for interaction. Present
it like Venn, emphasize the overlap."

**Second pass** (2026-07-27), a standing style note rather than a new feature
idea: "Handle typeahead. Always always always do handle typeahead in those
entry boxes. And graphs! Always give us a big shiny copy image button baby we
need to copy the graph." Read as two durable defaults for this requester's
sites generally, applied here first: (1) any handle-entry input should offer
live suggestions as the visitor types, and (2) any diagram/graph should carry
a prominent one-click "copy as image" action. Both are implemented below.
Also written to `lab/_profiles/minormobius.bsky.social.md` so a future build
for this requester starts from the same defaults without being asked again.

**Third pass** (2026-07-28), a bug report from actually using the second
pass: "the copy is broken, I'm not getting the pfps coming through, just
letters inside circles. And the first time I tried it copied the graph of the
last generation. Cached??" Two distinct bugs, both fixed — see "Bugs found and
fixed" below.

**Fourth pass** (2026-07-28, same day): "Oof that sucks make it better." No
new specifics — the surrounding thread makes clear this landed *before* the
requester had actually seen the third-pass fix (an aside about the request
possibly being denied because a job was still running), so it isn't a fresh
bug report to diagnose, it's an impatient nudge sent mid-fix. Rather than
guess at a bug that may not exist, this pass went back to the one complaint
from earliest in the thread that was never explicitly addressed by name:
"Hmmm the graph is a little fucked but we overlap!" — from the very first
build, before typeahead or copy-image existed, and nothing in the second or
third pass touched the Venn layout itself. See "Node crowding fix" below.

**Fifth pass** (2026-07-28, same day again): two concrete bug reports, both
fixed — "the copy button is straight up neglecting the pfps (keeps the svg).
Copy button has to pull the pfps in to the image!" and "if it's X and Y you
aren't excluding ONLY X from the X and Y overlap zone. Gotta make these three
mutually exclusive regions." See "Copy-image avatars, take two" and "Overlap
region was not actually mutually exclusive" below.

**Sixth pass** (2026-07-28, same day again): "Still initials only, pls fix.
We gotta bring the pfps in. It'll never ship if we can't paste pfps" —
confirming the fifth pass's fix (removing cache-busting and referrer-strip)
did not work either. This pass stopped guessing at request parameters — see
"The referrer theory was never viable, and neither was the third guess"
below — and shipped a second, structurally different export path instead of
a fourth variant of the same technique. See "A second export path that
doesn't need CORS at all" below.

**Seventh pass** (2026-07-28, same day again): "Promote the rasterized image
to first class. The graph is just not useful! Right now long press on mobile
gives me highlighted text inside the image. It would really just be cleaner
to have the copy button copy the rasterized image." This threw out the
architecture from the last several passes rather than patching it again —
see "The rasterized image is now the diagram, not an export of it" below.

**Eighth pass** (2026-07-28, same day again): "nothing renders now […] copy
graph still copies the same old graph […] gotta get the view window back to
working." The seventh pass's rewrite broke on its own CSP — see "The blob:
image was blocked by the page's own CSP" below. Fixed.

**Ninth pass** (2026-07-28, same day again): "we have the graph. It's a good
foundation. […] you were onto something with the rasterized scan, but I
couldn't copy it for some reason. Bring back the pfps, and find a way to copy
the image." Confirms the eighth pass's diagnosis was right — the diagram is
now visible, first time this has been acknowledged since the seventh-pass
rewrite. Two things left, both addressed this pass rather than another blind
retry of the same crossOrigin re-fetch — see "The CORS wall is real, so the
copy button now writes a second clipboard format instead of retrying the
same fetch a fourth time" below for the pfp side, and the same section's
tail for the copy-reliability side.

**Tenth pass** (2026-07-28, same day again): "you broke it homie —
`undefined is not an object (evaluating 'byCls[n.cls].push')`." A genuine
regression from the ninth pass, not a browser/CORS unknown, and it's fixed —
see "A real crash this time: `byCls` key mismatch (tenth pass)" below.

## What "interaction" means here, and why

There is no public Bluesky endpoint that answers "who does account X interact
with" directly — no `getActorLikes`, nothing like it, and the allowed-method
list in `scripts/lab-content-gate.mjs` / `kit.bskyGet` rules out anything that
would read from an unbounded stream (`searchPosts`, `getFeed`, etc.) rather
than a subject the visitor named. So this defines "interaction" as: **who each
account replies to, quotes, mentions, or reposts, tallied across their most
recent public posts** — sourced entirely from `app.bsky.feed.getAuthorFeed`,
which is the visitor's own named subject and nothing else.

Per handle, the flow is:

1. `com.atproto.identity.resolveHandle` — turn the typed handle into a DID.
   Handled defensively: `resolveHandle.error.json` is what a typo returns, and
   the page surfaces a plain "check the spelling" message rather than a raw
   HTTP error, since `kit.fetchJson` throws on non-2xx without the body.
2. `app.bsky.feed.getAuthorFeed`, paginated up to 3 pages (300 posts), through
   `kit.visible()` so moderation-labelled posts are dropped before anything is
   counted.
3. Per feed item: if it's a repost (`reason.$type ===
   'app.bsky.feed.defs#reasonRepost'`), tally `post.author` — that is who the
   queried account amplified — and nothing else from that item, since the
   post's own reply/quote/mention data belongs to whoever wrote it, not to the
   account being measured. Otherwise it's the account's own post or reply:
   tally the reply's parent (and root, if a different account) via
   `item.reply.*.author`, the quoted post's author via the hydrated
   `post.embed` (`app.bsky.embed.record#view` / `recordWithMedia#view`, not
   the raw `record.embed`, which only has a URI), and every
   `app.bsky.richtext.facet#mention` DID in `post.record.facets`.
4. Top N (visitor-set, 3–20, default 10) by count. Any tallied account
   discovered only through a mention (no inline author view) gets its
   handle/avatar filled in with one memoized `app.bsky.actor.getProfile` call
   per unique DID — deduped across both sides so a shared account isn't
   fetched twice.

The two top-N lists are then intersected by DID for the overlap.

## The Venn itself

**Superseded by the seventh pass — see "The rasterized image is now the
diagram, not an export of it" below for the current architecture.** This
section is kept for the geometry, which did not change: `computeVennLayout`
still lays every node out in a virtual 680×380 space (`VW`/`VH`) using
rejection sampling — pick a random point, test it against both circles'
actual radii, keep it if it's in the region asked for (only-A / only-B /
both) and clear of every node already placed, otherwise resample (400 tries,
then a fixed fallback spot). Circle separation shifts a little with how much
overlap there actually is — more shared accounts pulls the circles closer —
but never goes to fully separate or fully merged, so it always reads as a
Venn diagram even when the overlap is small. "Shared" nodes get a white glow
ring; only-A/only-B nodes get a ring in their own circle's color. What
changed in the seventh pass is *what consumes this layout*: it used to feed
both a live DOM render and a separate canvas export; now it feeds only
`renderVennPng`, which is the only renderer left.

## Node crowding fix (fourth pass)

`sampleRegion` only ever rejected a candidate point for landing outside the
requested Venn region (only-A / only-B / both) — it never checked a candidate
against the avatar dots *already placed*. With topN set high (the input
allows up to 20 a side, so up to 40 dots in a 680×380 box) that let avatar
circles land squarely on top of each other, which reads exactly like "the
graph is a little fucked": a diagram that's structurally correct but visually
a mess of overlapping photos where you can't tell how many accounts are
really there. Two changes:

1. `sampleRegion` now also takes the already-placed nodes and a minimum
   center-to-center distance, and rejects a candidate that lands closer than
   that to any existing node — not just candidates outside the circle. If all
   400 tries fail to find a fully clear spot (which can genuinely happen once
   a region is nearly saturated), it keeps whichever candidate had the most
   clearance rather than one of the not-quite-clear-enough ones, and the old
   *fixed* fallback point (same `{x, y}` every time a region failed) is now a
   small spiral offset by how many nodes have already fallen back to it — the
   old version could and did stack multiple avatars exactly on top of each
   other in the one case (near-total sampling failure) it was supposed to be
   the safety net for.
2. `computeVennLayout` now shrinks the avatar dot diameter (40px → 34px → 28px)
   as total node count rises past 16 and 24, so a busy compare has more room
   to actually satisfy the new spacing check instead of relying on the
   fallback path more often as N grows.

`renderVennPng`'s canvas export had a separate, independent bug this exposed:
it hardcoded a 40px node radius rather than reading `node.d` from the layout,
so once dot size became variable the copied PNG would have drawn crowded
diagrams with dots a different size than what the DOM was actually showing.
Fixed to read `n.d` per node, same as the DOM renderer already did.

**Not verified against the copy-image CORS/avatar question raised in the
third pass** — this pass didn't touch `loadImageForCanvas` at all. That is
still open; see "What's open" below, unchanged from last pass.

## Handle typeahead

Both handle inputs call `app.bsky.actor.searchActorsTypeahead` (on the kit's
allowlist — it takes what the visitor is actively typing as its subject, same
as `resolveHandle` takes what they finished typing) once the field holds 2+
characters, debounced 200ms. Responses are sequence-numbered so a slow reply
to an earlier keystroke can never overwrite a newer one's results. The
dropdown is a plain positioned `<div role="listbox">` under each input —
mouse click, Enter, and Arrow Up/Down all work; Escape or blur closes it. This
does not touch `resolveHandle` or the interaction logic at all — it only ever
prefills the text field, so a selection is exactly as if the visitor had typed
the handle themselves.

## Copy graph image (superseded — see next section)

Original approach, kept for history: the Venn was plain HTML/CSS on the live
page, and a separate "copy graph image" button re-drew the same computed
layout onto an offscreen `<canvas>` only when clicked, to put a PNG on the
clipboard. The seventh pass replaced this — the canvas render is no longer
offscreen-and-on-demand, it's the primary visible diagram. See below.

## The rasterized image is now the diagram, not an export of it (seventh pass)

The request: "Promote the rasterized image to first class. The graph is just
not useful! Right now long press on mobile gives me highlighted text inside
the image. It would really just be cleaner to have the copy button copy the
rasterized image." Read together, this is a complaint about *architecture*,
not styling: a diagram built from live DOM/SVG elements (positioned `<img>`s,
an inline `<svg>` with `<text>` nodes for the "real-photo version" escape
hatch) reads to a mobile browser's long-press gesture as selectable page
content, not a single picture — so long-pressing it can select text/elements
instead of offering the native "Copy Image" the requester expects, even
though it looks like a flat image. The fix is structural: make the one
rendered PNG the actual on-page diagram, so long-press and the copy button
both act on the same real raster with nothing live layered over it.

What changed:
- `renderResults` now calls `renderVennPng` (the existing canvas renderer)
  once per compare, turns the resulting `Blob` into an object URL via
  `URL.createObjectURL`, and sets that as the `src` of a plain
  `<img id="vennImg" class="venn">` — that image *is* the diagram now. The
  previous object URL is revoked on the next compare to avoid leaking blobs.
- The live DOM Venn (`renderVennDOM`, and its `.venn .circle`/`.venn .node`
  CSS) is deleted entirely, along with `makeAvatarNode` and the `pctW`/`pctH`
  percentage helpers that existed only to position it.
- The "real-photo version" SVG escape hatch from the sixth pass
  (`buildShareSvg`, `svgEl`, the `#sharePanel`/`realPhotoBtn` markup and CSS)
  is deleted too — it was the thing most directly implicated in "highlighted
  text inside the image" (its `<text>` nodes for captions, initials and the
  credit line sit in the same DOM as its `<image>` avatars), and it's now
  redundant: the primary image already shows through whatever avatars CORS
  allows, same as that panel did.
- `lastVennState` now carries the rendered `blob` itself (plus the object
  `url` currently on screen). The "copy graph image" button no longer
  re-renders on click — it just copies `lastVennState.blob`, which is
  *literally* the same bytes the visitor is looking at. This also means each
  avatar is now fetched only **once** per compare (through
  `loadImageForCanvas`, for the canvas draw) instead of twice (a plain
  `<img>` for display plus a `crossOrigin` re-fetch for the export) — the
  live-DOM version's double-fetch is gone along with the live DOM.
- The CORS situation itself is unchanged and still not confirmed either way
  from this sandbox: `loadImageForCanvas` still attempts a `crossOrigin:
  'anonymous'` re-fetch per avatar, and a node whose fetch fails still falls
  back to a plain initial-letter circle **in the rendered image itself now**,
  not just in a separate export — so if `cdn.bsky.app` still doesn't grant
  anonymous CORS, the *primary* diagram shows initials instead of photos,
  which is a real regression from the sixth pass's SVG panel if that panel's
  photos were in fact rendering (never confirmed either way — see the sixth
  pass's own "not verified" notes, which still apply). This is the honest
  trade this pass made: reliable long-press/copy behavior on a plain image,
  at the cost of giving up the one path (the SVG panel) that could show real
  photos regardless of the CORS answer. If a future report says avatars are
  back to initials-only and that matters more than the long-press fix, the
  next move is not another SVG panel (that reintroduces this pass's bug) but
  investigating whether `cdn.bsky.app` has a same-origin-friendly variant URL
  or accepts a `?` sized-thumbnail param that happens to carry CORS headers —
  genuinely unresearched, not just unverified.
- Rendering the PNG is now on the critical path of every compare (awaited
  inside `renderResults`, before `resultsEl` un-hides), not deferred to a
  button click. This adds the per-avatar CORS-fetch latency (up to 2.5s
  timeout each, though real failures error fast) to every compare, not just
  ones where the visitor clicks copy. Not treated as a problem this pass —
  the loading state is already covered by the existing "comparing…" button
  label — but worth knowing if a future report is about the compare feeling
  slower than it used to.

## The blob: image was blocked by the page's own CSP (eighth pass)

The seventh pass made `renderVennPng`'s canvas the primary on-page diagram by
setting `vennImgEl.src = URL.createObjectURL(blob)`. That is a `blob:` URL, and
this domain's CSP — `lab/www/_headers`, shared infra this tenant cannot edit —
sets `img-src 'self' data: https://cdn.bsky.app`. There is no `blob:` in that
list. `'self'` does not implicitly cover `blob:` URLs the way it's easy to
assume it would (a well-known cross-browser CSP gotcha, not specific to this
site) — the browser refuses to load it, `<img>` fires no visible error and
there's no `onerror` handler on it, so the diagram was simply blank. Every
other complaint in this pass follows from that one fact: "nothing renders" is
the blocked `<img>`; "copy graph still copies the same old graph" is the
copy button working correctly (`ClipboardItem` writes bytes straight to the
OS clipboard, which `img-src` has no say over) while giving no visual
confirmation it had actually updated, because the on-page preview never
changed at all.

Fixed without touching `_headers` (outside this tenant's directory, and CSP is
deliberately shared/hardened infra — see `lab/www/CLAUDE.md`): `renderVennPng`
now also calls `canvas.toDataURL('image/png')` on the same painted canvas and
returns both encodings. The visible `<img>` gets the `data:` URI, which the
CSP does allow; the clipboard button still gets the `Blob` from
`canvas.toBlob`, unchanged. This also deletes the `URL.createObjectURL`/
`revokeObjectURL` pair `renderResults` used to manage for the old `<img>` —
data URIs don't need revoking, so that bookkeeping is just gone, not replaced.

**Not verified from this sandbox — no browser here, same limitation as every
prior pass.** This is a straightforward reading of a documented CSP behavior
(blob: needs an explicit grant even under 'self'; data: does not), and
`canvas.toDataURL()`/`canvas.toBlob()` are being called on the exact same
canvas contents so they cannot diverge from each other — but if a future
report says the diagram is *still* blank, the CSP was not the (whole) cause
and the actual next step is checking the browser console for what the `<img>`
`error` event or a CSP violation report actually names, not a fourth guess at
the encoding.

## A real crash this time: `byCls` key mismatch (tenth pass)

The ninth pass added `buildShareHtml`, awaited on every compare's critical
path (`renderResults` calls it right after `renderVennPng`). It built a
lookup object with keys `'only-a'`, `'both'`, `'only-b'` and then did
`byCls[n.cls].push(n.entry)` for every node in the layout. But nodes are
tagged with `cls: 'shared'` for the overlap region, not `'both'` — see
`computeVennLayout`'s `place(both, 'both', 'shared')` call (third argument is
the `cls` string; second is the `sampleRegion` region name, which *is*
`'both'` — the two got conflated when `buildShareHtml` was written).
`byCls['shared']` was `undefined`, so `.push` threw on the very first shared
node in *every* compare, which is why the previous pass never actually
verified — the crash happened before `vennImgEl.src` or anything after it in
`renderResults` could run, so nothing rendered and nothing had a chance to be
seen as working. `drawNodeRing` (right above `buildShareHtml`, and correctly
using `cls === 'shared'`) was the tell that `'shared'` is the real value.

Fixed: `byCls` now uses `{ 'only-a': [], shared: [], 'only-b': [] }`, and the
one read site (`shareColumn('both', '#ffffff', byCls.both)`) now reads
`byCls.shared`. One-line-equivalent fix, no architecture change. This is the
kind of bug the "not verified from this sandbox" caveats on every prior pass
exist to warn about — a plain JS typo can hide behind "avatar CORS is
probably still broken" until someone actually runs the page. **If a future
report is a raw JS exception message like this one, grep for the exact
property name in the error before reasoning about CORS/network/browser
causes at all** — it is almost always faster and it was the actual bug here.

Not otherwise touched this pass — the CORS/avatar situation described below
is unchanged and still unverified from this sandbox; this was purely a crash
fix so the page runs again at all.

## The CORS wall is real, so the copy button now writes a second clipboard format instead of retrying the same fetch a fourth time (ninth pass)

Three prior passes (third, fifth, sixth) each tried a different variant of the
same idea — a `crossOrigin: 'anonymous'` re-fetch of the avatar, so a
`<canvas>` can legally read its pixels back out — and all three got the same
report back: every avatar renders as a plain initial. This pass stopped
varying that request and instead checked whether there was any OTHER
client-side route to the raw bytes. There is exactly one that would sidestep
CORS entirely: read the avatar straight off the account's own PDS instead of
`cdn.bsky.app`, since a blob read there needs no cross-origin grant on the CDN
specifically. **That route is closed on purpose, not by oversight** —
`scripts/lab-content-gate.mjs`'s `ALLOWED_XRPC` permits exactly one method
under the sync family (repo reads, for the CAR-parser flow) and explicitly
bans the rest, blob reads included, in both the allowlist comment and the
`BANNED` substring list. So there is no third client-side option: either
`cdn.bsky.app` grants anonymous CORS to a canvas read (three passes of
identical failure reports say no) or it doesn't, and nothing this tenant can
build changes that.

Given that wall, this pass added a second thing to the clipboard instead of a
fourth guess at the first thing. `copyImgBtn`'s click handler used to write a
single `image/png` `ClipboardItem`. It now also builds a self-contained HTML
fragment (`buildShareHtml`) — the same only-A/both/only-B grouping as the
`.cols` list at the bottom of the page, but with a real `<img>` per avatar
instead of a link — and writes it as a second representation, `text/html`, in
the same `ClipboardItem`. **This works without any CORS grant at all**,
because it never touches a canvas: a plain `<img src>` needs no cross-origin
permission to *display*, only to have its pixels read back into JS, and the
image in a pasted HTML fragment is fetched by whatever app the visitor pastes
into, not by this page. Paste into something that renders rich HTML — Docs,
Notion, Slack, Mail compose — and every avatar is a real photo, unconditionally.
Paste into something that only accepts a flat image (Bluesky's own composer,
most chat apps, Photos) and it falls back to the PNG, initials and all, same
as before. The `.note` copy and `NOTE.txt` both say this plainly rather than
implying the pfp problem is fully solved — it isn't, for the flat-image case,
and can't be from inside this tenant.

The write itself also got more resilient, addressing the second half of "I
couldn't copy it": if a browser rejects a multi-representation `ClipboardItem`
outright (write() throwing on the `text/html` + `image/png` combination,
which some engines have done historically), it now retries with `image/png`
alone rather than falling straight to the "open in a new tab" escape hatch —
so a partial success (PNG copies, HTML doesn't) is not treated the same as a
total failure. And when it genuinely can't write anything, the button now
shows the actual `Error.name` it caught (e.g. `NotAllowedError`,
`SecurityError`) instead of a generic "opened in a new tab" with no diagnostic
value — if this is still broken next pass, that name is the thing to chase,
not another blind guess.

**Not verified from this sandbox — no browser here, same limitation as every
pass before this one.** The HTML-fragment idea rests on solid ground (a plain
`<img>` needing no CORS to display is proven elsewhere on this very page,
and multi-representation `ClipboardItem` writes are a documented, supported
part of the Async Clipboard API in Chromium and recent Firefox — Safari's
support for `text/html` writes specifically is the least certain of the
three and is exactly why the PNG-only retry exists). If a future report says
the rich-paste version is *also* blank or also missing photos, the next
thing to check is not another clipboard-format idea but literally opening
the browser console on a paste failure — something no pass including this
one has been able to do.

## Overlap region was not actually mutually exclusive (fifth pass)

`sampleRegion`'s region test compared BOTH circles at the same shrunk radius,
`R * 0.86` — "in region a" meant `dA <= 0.86R && dB > 0.86R`. But the circles
actually drawn on screen are the full radius `R`, not `0.86R`. A candidate
point could be within `0.86R` of A and between `0.86R` and `R` of B — passing
the "only A" test — while still sitting inside B's real, drawn circle. That
dot would render classified only-A but visually inside the overlap lens,
which is exactly what got reported: "you aren't excluding ONLY X from the X
and Y overlap zone." (This is a rendering bug only — the earlier "top N
lists intersected by DID" classification behind the summary counts and the
plain-text columns was already correctly mutually exclusive; only the avatar
*placement* could straddle the boundary.)

Fixed by splitting the test: "comfortably inside" a circle still uses the
shrunk `0.86R` (keeps a dot from hugging its own circle's edge), but
"excluded from" the other circle now uses the real drawn radius `R` plus that
dot's own half-width (`dotR`, newly passed into `sampleRegion`), so an only-A
dot's nearest edge can never touch, let alone sit inside, B's drawn circle.
The 400-try loop's fixed-anchor fallback (used only when it can't find a
clear spot at all) was pushed further out — `R * 0.4` from center to
`R * 0.7` — so it keeps satisfying the new stricter exclusion test even at
the layout's closest circle separation, rather than reintroducing the same
bug in the one path that has no candidate list left to check against.

## Copy-image avatars, take two (fifth pass)

The third-pass fix (a cache-busting query param on the crossOrigin re-fetch,
plus `referrerPolicy: 'no-referrer'`) did not fix the actual complaint — the
report this pass was "whatever you tried didn't work […] copy button has to
pull the pfps in to the image," which means every avatar in the exported PNG
is still coming back as a plain initial. Since that fix demonstrably did not
work, both parts of it are removed rather than layered on with a third guess:

- The cache-busting param is gone. Appending an arbitrary query string to a
  CDN-served image URL can change what the CDN treats as its routing or
  cache key; that's a plausible way to make things worse, and there was never
  confirmation it helped.
- `referrerPolicy: 'no-referrer'` is gone. This is the more likely actual
  culprit: a CDN with referrer-based hotlink protection can reject a
  referrerless image request outright, which would explain the exact
  symptom reported — avatars load fine as plain `<img>` tags on the live
  page (normal referrer sent) but never load in the crossOrigin re-fetch
  (referrer explicitly stripped) — deterministically, not intermittently,
  which matches "straight up neglecting the pfps" better than a flaky-cache
  theory does.

The re-fetch now differs from the live page's own successful `<img>` load in
exactly one respect: `crossOrigin = 'anonymous'`, which is not optional — a
canvas cannot read back the pixels of an image that was not loaded that way,
which is the entire reason the second fetch exists at all.

**Still not verifiable from this sandbox — this is a real limitation, not a
formality.** There is no way to load a page here, so this is a reasoned bet,
not a confirmed fix. If a future report says the exported PNG is *still*
initials-only after this, the honest remaining explanation is that
`cdn.bsky.app` simply does not grant CORS to anonymous cross-origin reads at
all, referrer or no. That is not fixable from inside this page: reading
pixels out of a cross-origin image into a canvas is a hard browser security
restriction with no in-browser workaround (an SVG `<foreignObject>`/embedded-
image trick looks like a loophole but modern browsers taint the canvas
through it the same as a direct cross-origin draw). The only real fix at that
point would be a same-origin proxy that re-serves the image bytes, which this
tenant cannot build — no backend, and `worker.js` is shared infra outside
this directory. If that's the actual situation, the right next step is to
stop attempting the CORS reload entirely (saving the wasted per-avatar
timeout) and say plainly in the page that photo avatars aren't available in
the copied image, rather than trying a fourth variant of a request that a
missing CORS grant would make impossible to fix from here regardless of how
it's phrased.

## The referrer theory was never viable, and neither was the third guess (sixth pass)

The fifth pass removed `referrerPolicy: 'no-referrer'` from the canvas
avatar re-fetch on the theory that a referrer-checking CDN was rejecting the
referrerless request, reasoning "avatars load fine as plain `<img>` tags on
the live page (normal referrer sent)". That premise was checked against the
wrong evidence and was false: `fillAvatar` (used for every avatar `<img>` on
this page — id cards, typeahead rows, venn nodes) has always set
`img.referrerPolicy = 'no-referrer'` too, and — independently —
`lab/www/worker.js` sets `Referrer-Policy: no-referrer` as a response header
on every response this page gets, which governs the referrer sent by every
outgoing request the page makes regardless of any per-element attribute.
Every avatar load on this site, live page and canvas re-fetch alike, has
been referrerless the entire time. There was never a referrer difference to
fix, in either direction.

That closes the request-tweak hypothesis space, not just for this one
knob but structurally: three passes have now tried (a) cache-busting + a
no-op referrer strip (third pass — reported broken), (b) neither (fifth
pass — reported broken again this pass), and referrer was never actually a
variable in either. The honest reading is that `cdn.bsky.app` does not grant
anonymous cross-origin reads on these avatar URLs, which nothing in a
request built from this tenant can produce a header for. `loadImageForCanvas`
still attempts the CORS reload — cheap, and correct if that reading is
wrong — but this pass stopped treating it as the only path to real photos
in an exported image, since guessing a fourth variant of the same request
had nothing new behind it.

## A second export path that doesn't need CORS at all (sixth pass — removed in the seventh)

**This entire approach was deleted in the seventh pass** — see "The
rasterized image is now the diagram, not an export of it" above for why (in
short: this panel's live `<svg>`/`<text>` structure is what caused "long
press gives highlighted text" on mobile). Kept below for history only; there
is no `buildShareSvg`, `svgEl`, `#sharePanel` or `realPhotoBtn` in the code
anymore.

A canvas needs CORS because it exposes raw pixels back to JS
(`toBlob`/`toDataURL`/`getImageData`); a browser refuses that unless the
image's response granted it, precisely to stop a page from reading pixels
of cross-origin content it has no permission to see. But *displaying* a
cross-origin image needs no such grant — that is the entire reason the
plain `<img>` avatars all over this page have always rendered real photos
correctly, canvas problems notwithstanding.

The new "real-photo version" button builds a second rendering of the same
`layout` object as an inline SVG (`buildShareSvg`), placed directly in the
page's own DOM — a `<circle>` clip-path per node and an `<image href>`
pointing straight at the real `cdn.bsky.app` URL, degrading to a plain
initial circle only when an entry genuinely has no avatar URL. Because it is
DOM content rather than a canvas, it never asks the browser to hand pixels
back to JS, so there is nothing for a missing CORS grant to block. The
tradeoff: JS cannot flatten a DOM subtree into a single clipboard image on
its own — that capability doesn't exist — so getting the result onto the
clipboard is a manual right-click (long-press on mobile) → "Copy Image" on
the rendered SVG, not a one-click button. The panel says this plainly. It
deliberately does **not** load via `<img src="data:image/svg+xml;...">`,
which runs in a browser-enforced "image context" that does not fetch
resources the SVG itself references — that would have silently produced a
blank image. An inline `<svg>` in the actual document does not have that
restriction; its `<image>` children are ordinary subresource loads under the
page's existing `img-src` CSP, the same one that already allows
`cdn.bsky.app` for every other avatar on the page.

**Not verified from this sandbox — no browser here.** The layout math is
shared with the already-unverified DOM/canvas renderers, so a new geometry
bug is unlikely, but two things are genuinely untested: whether
`<image clip-path="url(#id)">` clips as expected across engines (Safari has
had SVG clip-path quirks historically), and whether "Copy Image" appears in
the context menu for an `<image>` nested inside an inline `<svg>` in every
target browser — Chrome and Firefox are expected to offer it; if a browser
doesn't, the visitor still sees real photos on screen and can screenshot,
which is strictly better than the initials-only PNG path, just not what the
hint text promises for that one browser. If a future report says this panel
is blank or the context menu has no "Copy Image" entry, that is the next
thing to chase — not another canvas/CORS guess.

## Bugs found and fixed (third pass)

**"Copied the graph of the last generation. Cached??"** — not a cache, a race.
The submit handler had no re-entrancy guard: it disabled `goBtn` but never
checked that flag itself, and disabling a button is not a hard guarantee
against a second `submit` event arriving first (an Enter keypress in a text
field can trigger implicit form submission through a path that does not
reliably respect a disabled default button across browsers). Two overlapping
compares meant whichever `renderResults` call happened to *resolve* last —
not whichever the visitor *started* last — is the one that ends up in
`lastVennState` and on screen. Started a compare, then started a second
before the first returned, and the older one's slower network round trip
finished after the newer one's faster one: on screen and in the copy, you get
the old pairing. Fixed with a plain `comparing` boolean checked at the top of
the submit handler, so a second submit while one is in flight is a no-op
instead of a race. (The handle typeahead already used the right pattern for
this — a sequence counter — this just needed the same discipline applied to
the compare button itself.)

**"Not getting the pfps, just letters inside circles" (in the copied image
only, not the live page)** — the copy-image canvas re-fetches every avatar a
second time with `crossOrigin: 'anonymous'`, because only a CORS-cleared
image can have its pixels read back out of a `<canvas>`. That same URL is
already sitting on the page as a plain `<img>` with no `crossOrigin` at all
(the live-page avatar). If the browser serves that existing cache entry for
the second, CORS-mode request instead of genuinely refetching it, the image
can appear to "load" without CORS ever actually having been granted — which
taints the canvas silently instead of failing cleanly, and every avatar in
the export falls back to initials. Fixed by appending a cache-busting query
param to the second fetch, so it is always a distinct request from the live
page's own `<img>` and can never reuse a mismatched cache entry. Also cut the
per-image timeout from 4s to 2.5s, since a real CORS failure errors almost
immediately and the timeout is only a hang-safety-net, not the normal path.
**Not fully verifiable from this sandbox** — see "What's open" below: this
fixes the specific stale-cache mechanism, but if `cdn.bsky.app` simply never
grants CORS at all (rather than only when a mismatched cache entry gets
reused), the export will still fall back to initials every time, correctly
but not to the visitor's liking. The note text below the form was reworded to
say this plainly rather than imply it's a rare edge case.

## Decisions worth flagging

- **`getProfile`, not `getProfiles`.** The plural batch endpoint is on the
  allowlist, but `kit.bskyGet` builds its query string with
  `new URLSearchParams(params).toString()`, which does not repeat an array
  param as `actors=a&actors=b` — it stringifies the array with commas instead,
  which is the wrong wire format. Rather than reach around `kit.bskyGet` to
  build that request by hand, this calls singular `getProfile` once per
  unique DID, memoized so concurrent/duplicate lookups collapse to one
  request. Simpler and correct, at the cost of more requests than a working
  batch call would need.
- **Every network-sourced string (handle, displayName) is set via
  `.textContent`/DOM properties, never `innerHTML` string interpolation.** A
  Bluesky display name is attacker-controllable content by definition — it's
  whatever a stranger's mentioned account has set it to — so building markup
  by concatenating it in would be a real injection vector, not a theoretical
  one.
- **Avatar URLs are only used if they start with `https://`.** Belt-and-braces
  against anything else ending up in an `<img src>`; images loaded this way
  can't execute script regardless, but there's no reason to accept anything
  but a real Bluesky CDN URL.
- Handles are lowercased and stripped of a leading `@` before use; entering the
  same handle twice is rejected client-side before any network call.

## What's open / unverified

- **The tenth-pass crash fix is the one thing this pass is confident about**
  without a browser — it's a plain property-name mismatch, both sides visible
  in the same file, not a network/CORS reasoning chain. Everything below this
  bullet is unchanged from the ninth pass and still genuinely unverified.
- **Confirmed live for the first time in the ninth pass**: "we have the
  graph" — the eighth-pass CSP fix (data: URI instead of blob:) worked, the
  diagram genuinely renders. Also worth knowing: `lab/www/worker.js`'s
  `img-src` gained `blob:` at some point after the eighth pass (a human
  edit to shared infra, not this tenant) — the data: URI approach still
  works and wasn't switched back, since it needs no revoke bookkeeping, but
  a future pass could use either.
- **The avatar/CORS question is now treated as closed, not open** — see
  "The CORS wall is real…" above. Three passes of identical failure reports
  plus a confirmed dead end on the one client-side workaround (reading the
  blob from the account's own PDS, banned by the content gate on purpose)
  is enough to stop varying the same request a fourth time. The flat PNG
  will keep showing initials for any avatar `cdn.bsky.app` won't grant a
  canvas read for, and that's stated in the `.note` copy now rather than
  implied to be a rare edge case. If a future report says the CDN
  *sometimes* grants it (some avatars real photos, others not, inconsistent
  rather than uniformly initials-only), that would be new information worth
  chasing — a uniform "always initials" report is not.
- **Not verified — the new text/html clipboard write.** See "The CORS
  wall is real…" above for the reasoning and what would falsify it.
- **Never rendered (still, fifth pass).** The node-crowding fix and the
  fifth-pass mutual-exclusion fix are both plain geometry — no network
  calls, nothing that can drift between fixtures and reality — but neither
  has been seen rendered any more than anything else here has. If spacing or
  region boundaries still look off, the knobs are the `D` size thresholds
  and `D * 0.92` minimum-clearance multiplier (crowding) and the `R * 0.86`
  / `R + dotR` split (region exclusion), both in `computeVennLayout`/
  `sampleRegion`.
- **The avatar/CORS question is still open, and now matters more than it did
  before.** Through the fifth and sixth passes, every avatar came back as a
  plain initial in the canvas export, across every request variant tried
  (cache-bust + referrer-strip; neither) — `loadImageForCanvas`'s comments
  have the full history. The seventh pass removed the SVG "real-photo
  version" panel that had been the fallback for this (see above), so as of
  this pass the canvas render's CORS behavior is no longer just an export
  quality question — it directly determines what the **primary on-page
  diagram** shows. If a future report says the diagram itself is
  initials-only, that confirms `cdn.bsky.app` doesn't grant anonymous CORS at
  all, and the honest options are: accept initials as the real limitation
  and say so in the UI (already partly done in the `.note` copy), or research
  an actual same-origin/CORS-friendly avatar URL variant — not another
  client-side request tweak on the same URL, and not re-adding the SVG panel
  (it directly caused this pass's bug report).
- **Never rendered.** No Bash/WebFetch/browser in this sandbox. Every field
  name (`item.reply.parent.author`, `post.embed.record.author`,
  `reason.$type`, `facet.features[].did`) is either confirmed directly against
  the checked-in fixtures or is a stable, long-documented part of the AT Proto
  lexicon, but the combination has not run against a live response.
  `getAuthorFeed.json`'s one example item is itself a `reasonRepost` case,
  which is what confirmed the repost-handling logic actually matches the real
  shape (`reason.by` is the queried actor, `post.author` is who got
  reposted) rather than being a guess.
- **No proportional-area Venn.** Circle separation nods toward the overlap
  ratio but this is not a true area-proportional (Euler) diagram — doing that
  correctly for two circles is solvable but adds real risk for a cosmetic
  gain, given this can't be checked visually before shipping.
- A future iteration could add mutual-follow counts (`getFollows`/
  `getFollowers`) as a second lens alongside interactions, or let a visitor
  click a shared account to re-run the comparison centered on it.
- **Still never rendered.** `searchActorsTypeahead`'s response shape was
  assumed identical to `searchActors` (same `{ actors: [...] }` list of
  `actor.defs#profileViewBasic`, which is what the fixture for the latter
  confirms field-by-field) since there is no separate fixture for the
  typeahead variant — plausible, given both are AppView search over the same
  actor index, but unconfirmed.
- **Confirmed in real use across two passes (third and fifth, 2026-07-28):
  `cdn.bsky.app` avatars have not yet survived the canvas export** — every
  avatar came back as a plain initial. As of the seventh pass this canvas
  render is the primary diagram, not a separate export, so this bullet and
  the one above it are really the same open question now.
- `canvas.toBlob('image/png')` and `navigator.clipboard.write` with a
  `ClipboardItem` are both broadly-supported standard APIs and were not
  reported as broken this pass — the complaint was specifically about missing
  avatars, not a failed copy, so the clipboard mechanics themselves appear to
  work.
