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

Plain HTML/CSS, no SVG, no canvas. The diagram container has a fixed
`aspect-ratio` (680:380) so that percentage-based `left`/`top`/`width`/`height`
— computed against 680 for anything horizontal and 380 for anything vertical —
resolve to the *same* physical pixel scale on both axes at any render size,
which is what keeps the circles and avatar dots circular instead of stretched.
Avatar placement uses rejection sampling: pick a random point in the diagram's
bounding box, test it against both circles' actual radii, keep it if it's
in the region asked for (only-A / only-B / both), otherwise resample (400
tries, then a fixed fallback spot). Circle separation shifts a little with how
much overlap there actually is — more shared accounts pulls the circles closer
— but never goes to fully separate or fully merged, so it always reads as a
Venn diagram even when the overlap is small. "Shared" nodes get a white glow
ring; only-A/only-B nodes get a ring in their own circle's color — that's the
actual overlap emphasis, since faking a true two-color Venn *region* fill
without SVG boolean ops isn't worth the risk of getting it subtly wrong
unrendered.

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

## Copy graph image

The Venn stays plain HTML/CSS for the live page (unchanged from the first
build), but the "copy graph image" button re-draws the *same* computed layout
onto an offscreen `<canvas>` and puts the PNG on the clipboard via
`navigator.clipboard.write` + `ClipboardItem`. To make that possible without
re-randomizing the diagram, `renderVenn` was split into `computeVennLayout`
(pure geometry + node positions, called once per compare) and `renderVennDOM`
(paints it) — the same layout object now backs both the DOM and the canvas, so
the copied image matches what's on screen instead of a fresh random sample of
avatar placement.

Avatars are the one thing that can't just be copied from the DOM `<img>`
elements — reading pixels back out of a `<canvas>` requires the image to have
loaded in CORS mode, so each avatar is fetched a *second* time as a bare
`Image()` with `crossOrigin = 'anonymous'`. If Bluesky's CDN doesn't grant
that for a given avatar, the browser's own CORS check fails the load outright
(it never renders into anything, tainted or not), so the fallback is silent
and node-local: that one avatar becomes a plain initial-letter circle in the
exported PNG only. The live page's own avatars, loaded the ordinary way with
no `crossOrigin`, are completely unaffected either way. If clipboard image
writes aren't available at all (insecure context, older browser, permission
declined), the PNG opens in a new tab instead of failing silently.

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

- **Never rendered (still, fifth pass).** The node-crowding fix and the
  fifth-pass mutual-exclusion fix are both plain geometry — no network
  calls, nothing that can drift between fixtures and reality — but neither
  has been seen rendered any more than anything else here has. If spacing or
  region boundaries still look off, the knobs are the `D` size thresholds
  and `D * 0.92` minimum-clearance multiplier (crowding) and the `R * 0.86`
  / `R + dotR` split (region exclusion), both in `computeVennLayout`/
  `sampleRegion`.
- **The copy-image avatar/CORS question is confirmed still broken as of this
  pass's bug report**, and the third pass's specific fix (cache-busting) did
  not resolve it. This pass removed that fix along with the referrer-
  stripping, on the theory the referrer strip was the actual cause — see
  "Copy-image avatars, take two" above. Unconfirmed either way: if a future
  report says the exported PNG is still initials-only, the next step is to
  stop attempting the CORS reload in `loadImageForCanvas` altogether and say
  plainly on the page that photo avatars can't make it into the copied
  image, rather than trying a fourth variant of the same request.
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
- **Confirmed in real use across two passes now (third and fifth,
  2026-07-28): `cdn.bsky.app` avatars have not yet survived the copy-image
  canvas export** — every avatar has come back as a plain initial in the
  exported PNG. See "Copy-image avatars, take two" above for the fifth
  pass's fix and what's still genuinely unverified about it.
- `canvas.toBlob('image/png')` and `navigator.clipboard.write` with a
  `ClipboardItem` are both broadly-supported standard APIs and were not
  reported as broken this pass — the complaint was specifically about missing
  avatars, not a failed copy, so the clipboard mechanics themselves appear to
  work.
