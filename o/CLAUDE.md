# o — o.mino.mobi, your Bluesky circle

Handle in, circle out. The account's avatar in the middle, its closest 8 on the
inner ring and the next 16 on the outer, ranked by **total interactions** over
**20 days**: every like, repost, reply and quote, both directions, each worth 1.
A shareable 1200×1200 card with `o.mino.mobi` printed on it.

Built to beat the popular "circle" generators on the things that matter:
**no sign-in, no app password, nothing stored, nothing posted**, the numbers
behind every seat one click away, and fast. Keep it that way: never add a login
to this page, never add a follow-for-access, never send the handle anywhere but
Bluesky's public APIs.

## Surface

Worker `o`, plain route `o.mino.mobi/*` (no custom-domain slot). `deploy-o.yml`:
selftest → `route-dns.mjs --apply` → `wrangler deploy` → fails unless the host
serves the page **and** the avatar proxy answers. Owned by
`claude/focused-knuth-f0oawl`.

| file | holds |
|---|---|
| `circle.js` | pure: `rank` (events → people, weights/direction/window), `rings` (seat geometry, no overlaps), `altText` (the circle as plain text for image alt text), URL ⇄ settings, input cleaning |
| `data.js` | browser fetching: OUT from the account's own repo (likes, reposts, replies, quotes); IN from the AppView per post (getLikes, getRepostedBy, getQuotes, getPostThread depth 1), busiest posts first under `LIMITS.inRequests` |
| `render.js` | the card; the canvas the page shows IS the PNG that is shared |
| `app.js` | input, typeahead submit, cache (sessionStorage, 10 min), tune panel, share/save/copy, hover + click on seats |
| `worker.js` | `/av/<did>/<cid>` avatar proxy with CORS (locked to cdn.bsky.app thumbnails: a strict DID and CID, so not an open proxy); `/<handle>` gets its title rewritten; SPA fallback via `not_found_handling` |
| `typeahead.js` | **copy** of root's `/js/typeahead.js` plus one `bsky-select` event |
| `o.selftest.mjs` | ranking, rings, URL round-trip, hostile query clamping, input cleaning, the worker's path rules |

## Why the avatar proxy exists

`cdn.bsky.app` sends no `Access-Control-Allow-Origin`. A canvas that draws a
cross-origin image without it is tainted and `toBlob` throws, so without the
proxy there is no shareable card. Locally (no worker) the app falls back to the
CDN directly: the circle draws, saving fails. `window.O_PROXY = true` forces the
proxy path for a local stand-in server.

## The request budget (measured 2026-11-23)

IN has no repo to read, so it costs one AppView lookup per (post, kind) with
any engagement. On an active account a full read was 707 lookups; capping at
300 kept the inner 8 identical and 23 of the top 24, 150 swapped three of the
inner 8. `LIMITS.inRequests = 400`. Whatever the budget cuts is printed under
the circle ("not read: …"), never hidden. Read directly, the full pass took
~4 s; in the sandbox's proxied browser ~16–26 s, which is the proxy, not the
work. Measure from a real network before tuning further.

## Alt text

"copy alt text" (next to share, and as a selectable box under "the numbers")
gives the circle as plain text: a header (who, window, how it was ranked,
o.mino.mobi), then a numbered list per ring with each count. A numbered list,
not a padded table, because a screen reader reads padding as noise. It must
fit Bluesky's 2,000-character alt-text cap: if it doesn't, counts are dropped
first, then the tail is cut with "…and N more", never mid-handle (selftest).

## Tune

Hidden behind "tune": window, direction (both / them → you / you → them),
ring sizes (inner 3–12, outer 0–24, an optional third ring 0–32, off by
default; with a third ring every radius pulls in to make room), per-kind weights. Every non-default setting goes in
the URL (`?d=30&dir=in&wr=3&t=24`), so a shared link reproduces the circle. Changing
anything but a longer window re-ranks in memory with no refetch.
