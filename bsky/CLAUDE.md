# bsky — bsky.mino.mobi

<!-- HAND-OWNED. Seeded by scripts/gen-surface-docs.mjs, then rewritten.
     Repo-wide rules live in ../CLAUDE.md; the index is ../docs/SURFACES.md. -->

An **AppView with no database**. Type a handle; the page assembles that account's
timeline in-tab and keeps it live. There is no index here, no cron, no D1, and
nothing is persisted — reload and it's gone.

It exists to prove a specific claim in [`docs/APPVIEW-FEASIBILITY.md`](../docs/APPVIEW-FEASIBILITY.md):
that the aggregation an AppView is *for* is now available to a browser, free,
from public services — so most of what people mean by "build our own AppView"
needs no backend at all.

## Facts

| | |
|---|---|
| Surface | `bsky` |
| Dir | `bsky/` |
| Endpoint | `bsky.mino.mobi` |
| Type | frontend (Worker-with-assets; the worker is one route) |
| Owning branch | `claude/bsky-app-view-feasibility-8sdflz` |
| Deploy | [`.github/workflows/deploy-bsky.yml`](../.github/workflows/deploy-bsky.yml) |
| Uses | — (no shared backend; three public services, none of ours) |
| Provides | — |

## How it works

Three services do the work an AppView would otherwise do, and each answers a
different kind of question:

| Question | Answered by | Auth |
|---|---|---|
| what did the people I follow post — including the last ~36h? | **Jetstream v2** live tail, `dids` filtered to the follow graph, timestamp cursor for history | none |
| how many likes / reposts / replies / quotes? | **Constellation**, the global backlink index | none |
| who is this account (name, avatar)? | the public AppView, hydration only | none |

**The load-bearing trick is Jetstream v2's `dids` filter.** It accepts up to
10,000 accounts and filters *server-side*, so a personal timeline is one
WebSocket rather than one request per followed account. That single fact is
what removes the backend. `packages/atproto/jetstream.js` is the client.

Constellation is the other half: a network-wide *reverse* index (target →
records pointing at it), which is the one thing a browser genuinely cannot
compute for itself. `packages/atproto/constellation.js` wraps it; `postCounts()`
returns the `{likeCount, repostCount, replyCount, quoteCount}` an AppView would
have handed you, in one request.

The public AppView is used **only** for profile hydration and the seed fallback.
Sourcing the feed from it would make this a client, not an AppView, which is the
whole distinction the surface is here to demonstrate.

## History comes free, up to a point

The cursor accepts a unix-microsecond timestamp, not just a seq, so `since`
replays the recent past over the same unauthenticated socket and cuts over to
live with no seam. Measured against a 90-account list: **494 posts for a 6h
window, caught up in under 10s; 1,635 posts for 24h.** No key, no fan-out.

**The window is ~36h, and past it the server clamps silently** — no error, no
flag. That is why the depth selector stops at 36h instead of offering a week:
`clampSince()` caps the request and the UI reports the depth actually asked for,
so the page never implies history it cannot deliver.

## Why there is a worker at all

Only for history *older* than that window, and for two independent reasons:

- **live tail** — WebSocket, no auth, not metered → the browser does it itself.
- **archive** — HTTP, **API key**, metered in bytes → needs a secret holder.
- **and the archive is zstd.** `@bsky/jetstream` abstracts a runtime precisely
  here: its Node branch uses `zlib.zstdDecompressSync`, its **browser branch
  ships no default** (nor a sync sha256, since WebCrypto is async-only). So the
  page could not decode a segment even with a free key. workerd's
  `nodejs_compat` provides both — verified locally with `wrangler dev`.

A key in a static page is a published key, so `worker.js` proxies the archive
endpoints at `/api/replay/*` behind `JETSTREAM_API_KEY`, with an allowlist
(`planSnapshot`, `listSegments`, `getSegment`) rather than a pass-through — this
worker holds a metered credential. `Range` and `Retry-After` pass through both
ways, because a metered download that hits its quota resumes from a byte offset
instead of re-paying for what it already has.

**The secret is not set.** Until it is, `/api/replay/*` answers 503 with a
reason, `/api/health` reports `replay: false`, and the page says so in its
status strip. History then falls back to `seedFromAppView()` — a capped
fan-out over the public AppView, which is the expensive path and is labelled as
such in the UI. That is deliberate: the fallback makes the cost of *not* having
replay visible instead of hidden.

## The UI

Mobile-first, one column, three tabs, and posts. `index.html` is the shell,
`app.js` drives it, `lib/sources.js` supplies the posts.

| Tab | What it is |
|---|---|
| **Home** | `simcluster` by default — this repo's own feed generator at `feed.mino.mobi`, which returns a SKELETON of `at://` URIs that `getPosts` hydrates into real posts with counts. Chips switch to the liked feed, a **live** follow-graph timeline over one Jetstream socket, or **stored** (whatever this browser holds). |
| **Notifs** | Built from Constellation, not from Bluesky. A notification *is* a backlink, so this works signed out, for any handle. |
| **Me** | Profile, local store, and the deep-history key. |

Deliberate choices worth keeping:

- **Boot never waits on auth.** `selectFeed()` runs before `auth().init()`
  settles, and sign-in only affects the top-right button and the Me tab. An
  earlier version awaited the profile fetch first, so a slow or unreachable auth
  worker left the page permanently blank. Reading needs no account; the code
  should say that structurally, not just in the copy.
- **`[hidden]{display:none!important}`** is load-bearing. `.chips` is
  `display:flex`, which beats the UA stylesheet's `[hidden]` rule, so the feed
  chips stayed visible on every tab until this was added.
- **16px inputs.** Anything smaller makes iOS Safari zoom on focus.
- **`viewport-fit=cover` + `env(safe-area-inset-bottom)`** on the tab bar and
  the FAB, or both sit under the home indicator.
- Default feed is algorithmic on purpose: a new visitor has no follow graph, and
  an empty timeline is a bad first screen.

### Likes and reposts, and the scope that gates them

`lib/actions.js`. A like is a record — `app.bsky.feed.like` with a subject
carrying the post's URI **and CID** — so undoing one means deleting a record,
which means knowing its rkey. The read path here is unauthenticated and
therefore has no `viewer` block, so the rkey comes from two places in order:

1. **Local** — what `createRecord` returned, mirrored to `localStorage`.
2. **Constellation** — `listLinks(uri, LINK.likes, { did: me })` asks the global
   index "did this account like this post?" and hands back the rkey. No auth.
   This is how a like made in the official app becomes undoable here.

The index lags a write by seconds, which is why local wins.

**Carry the `cid`.** A like whose subject has no CID is rejected by the PDS.
Both `fromHydrated` (from `post.cid`) and the Jetstream path (from
`payload.cid`) keep it; anything that drops it silently breaks liking.

**These are gated on the auth ceiling.** `app.bsky.feed.like` and
`app.bsky.feed.repost` were added to `WRITE_COLLECTIONS` in
`workers/auth/src/oauth/scope.ts`, and **this branch now owns the `auth`
surface** (handed over at the principal's instruction — see
[`workers/auth/CLAUDE.md`](../workers/auth/CLAUDE.md)). It is deployed and live:
`auth.mino.mobi/client-metadata.json` lists **77 collections**, both of these
among them, plus `rpc:com.atproto.server.getServiceAuth` for custom feeds.
`actions.available()` still reads that file at boot, so if the ceiling ever
narrows the buttons explain themselves rather than failing at the consent screen
with `invalid_scope`.

Owning that surface means owning its hazard. `node scripts/check-auth-scope.mjs`
runs before every auth deploy and **must stay green**: on 2026-07-29 a branch
with a stale `workers/` shipped a green build that dropped the ceiling from 66
collections to 61 and broke four sites. Only ever add to `WRITE_COLLECTIONS`,
never remove.

### Installing it — the PWA, and the one rule that is a security rule

`manifest.json` + `sw.js` + `icons/`. Installing matters more here than it does
for most apps, because **the archive is already on the device**: the posts live
in IndexedDB and the shell is precached, so an installed copy opened with no
network shows the month of history this browser accumulated rather than a
dinosaur. Offline is the feature, not a nicety.

`sw.js` has three rules and the first one is not about caching:

1. **Never touch `/api/*`.** `/api/feedgen` forwards the reader's own
   service-auth JWT and returns **their** personalised feed. Cache Storage is
   per-origin, not per-account — caching that would hand one reader's For You to
   whoever opens the app next on a shared phone, and would outlive a token
   deliberately valid for about a minute. There is no cache policy that makes
   this safe; the worker stays out of the way. `lib/sw.selftest.mjs` asserts the
   bypass still exists, so deleting it fails a test rather than shipping.
2. **Never touch cross-origin.** CDN images, the public AppView, Constellation,
   the PDS, `auth.mino.mobi` — already HTTP-cached, or authenticated, or the
   live tail that must not be stale. Opaque cross-origin responses also cost far
   more quota than they appear to, and this origin's quota belongs to the
   archive.
3. **Never serve a stale document.** Navigations are network-first so a deploy
   reaches installed readers on next launch; the cache is the offline fallback.
   A navigation carrying a query string (the OAuth callback's `?code=…`) is
   never read from or written to the cache.

Sub-resources are stale-while-revalidate under a version-named cache
(`bsky-shell-v1`), purged on `activate`.

**There is no unprompted `skipWaiting()`, deliberately.** This app is one module
graph; activating a new worker under a page that already imported the old
`app.js` can mix versions inside one session. So a new worker waits and the Me
tab grows an *update now* button. Two traps that cost a test run each:

- **`controllerchange` fires for two different reasons.** An updated worker
  taking over (reload — or the page keeps running the old modules), and
  `clients.claim()` adopting a page that had no controller, which is **every
  first visit**. Reloading on the second gave every new reader a gratuitous
  double-load. `hadController`, snapshotted at registration, is what separates
  them.
- **Gate registration on `isSecureContext`, not on the hostname.** The first
  version checked `hostname === 'localhost'` and so silently refused to register
  on `127.0.0.1`, which is equally a secure context. The API's own condition is
  the right condition.

**Tabs are hash-routed** (`#/`, `#/search`, `#/notifs`, `#/me`) — not for
shareable links, but because a standalone PWA has no browser chrome, so
Android's hardware back button walks `history` and closes the app when the stack
is empty. A hash per tab makes back go Notifs → Home. It also gives the
manifest's `shortcuts` somewhere to point.

**Icons are generated**, by `scripts/gen-bsky-icons.mjs` — dependency-free
(4x supersampled RGBA, PNG written with `node:zlib` deflate and a hand-rolled
CRC32), because five small images are not worth the only native dependency in
the tree. Re-run it only if the mark changes. **The mark is not Bluesky's
butterfly**: this is a third-party client and borrowing their logo would
misrepresent who made it. It is six accounts on a ring wired to one hub — the
`dids` filter, which is the thing this surface is actually about.

`apple-mobile-web-app-status-bar-style` is **`default`**, not
`black-translucent`: translucent slides the topbar under the iOS clock (nothing
pads for `safe-area-inset-top`), and a hardcoded black bar is wrong for Paper
and Sepia. `default` lets iOS tint from `theme-color`, which `theme.js` already
keeps in step with the palette.

Verified in Chromium against a local server serving the same content types
production does (2026-09-05). Behaviour: the worker registers at scope `/`,
**zero** spurious reloads on first install, 25 shell entries cached, `/api/*`
absent from Cache Storage with the second request reaching the server, an
offline reload painting the full shell with all four tabs, back stepping
Me → Notifs, no page errors.

Installability was checked through Chromium's **own** manifest pipeline
(`Page.getAppManifest` over CDP) rather than by `fetch`ing the file, because
fetching only proves it is reachable — the parser is what decides. Zero parse
errors, and every criterion met: name, `start_url`, `display: standalone`,
192 and 512 icons that load at exactly their declared sizes, a maskable icon,
a registered worker, and both shortcuts resolving to `#/search` and `#/notifs`.

That also settles a content-type worry: the spec asks for
`application/manifest+json` and Cloudflare Static Assets serves `.json` as
`application/json`. Chromium parses it without complaint, so this is not worth
a worker route to fix.

Two field-name traps if you ever re-run that check: CDP's `parsed` is a legacy
field and comes back **empty** — the real result is under `manifest` — and the
icon objects there expose `url`/`sizes`/`type` but **not** `purpose`, so
maskable has to be read from the raw document. Both cost a run each and both
looked exactly like product bugs.

Not verified: `beforeinstallprompt` and the actual install — headless Chromium
does not fire it, and iOS has no API at all.

### Palettes

`lib/theme.js`. Seven palettes plus `auto`, which follows the OS and is the
default. Every colour in the stylesheet comes from nine tokens, so a palette is
a data object and adding one means adding an entry — nothing else.

Two things that must stay:

- **The inline boot script in `index.html`** duplicates a few lines of
  `theme.js` on purpose. A module import resolves *after* first paint, which is
  long enough to flash a white screen at someone who chose Midnight.
- **`lib/theme.selftest.mjs`** recomputes WCAG contrast for every palette and
  fails if one drops below 4.5:1 for text or 3:1 for muted/accent. A palette
  that cannot be read is not a palette. All seven currently pass.

### The following feed

Signed in, `following` is the default chip and the feed is strictly
reverse-chronological — no ranking. It uses the same single Jetstream socket as
`live`, but ordering matters here: a replay arrives oldest-first, live events
arrive newest-first, and the local store contributes posts from any time.
Prepending would interleave those three wrongly, so `insertSorted()` places each
post by `createdAt`. Signed out, the default stays `simcluster`.

### Blobs — two shapes, and only one has URLs

`lib/blobs.js`. The same post arrives differently depending on its source, and
this is the thing to understand before touching media:

| Source | `embed` shape | Media |
|---|---|---|
| `getPosts` / `getAuthorFeed` (feeds, profiles) | `app.bsky.embed.images#view` | `thumb` / `fullsize` are **complete CDN URLs** |
| Jetstream, and anything stored from it | `app.bsky.embed.images` | **blob refs** — `{$type:'blob', ref:{$link:'bafkrei…'}}` |

A blob ref is meaningless on its own: it needs the DID of the repo holding it.
That is why every function in `blobs.js` takes `did`, and why `renderEmbed`
takes the raw record *and* the optional hydrated view — it prefers the view and
reconstructs from the ref when there is none.

```
avatar        cdn.bsky.app/img/avatar/plain/<did>/<cid>@jpeg
feed thumb    cdn.bsky.app/img/feed_thumbnail/plain/<did>/<cid>@jpeg
feed fullsize cdn.bsky.app/img/feed_fullsize/plain/<did>/<cid>@jpeg
video         video.bsky.app/watch/<URL-ENCODED did>/<cid>/playlist.m3u8
              …/thumbnail.jpg   (302s to video.cdn.bsky.app; poster follows it)
```

The image host takes a bare DID; the **video host percent-encodes it**. All
verified live: the reconstructed-from-ref URL returns `200 image/jpeg`, view
thumbs return `200 image/webp`, and the playlist returns
`application/vnd.apple.mpegurl`.

Video is HLS. Safari and iOS — the mobile target — play it natively from a
`<video src>`; other browsers show the poster and fall through to the link. No
`hls.js`: 300 KB for a fallback path is not worth it here.

Every image sets `aspect-ratio` from the record's own `aspectRatio` before it
loads, so the feed does not jump under the reader's thumb, and carries the
post's `alt` text.

### Signing out

`signOut()` in `app.js`. Three things it must keep doing:

- **`actions.forgetInteractions()` first.** The like/repost rkeys in
  `localStorage` belong to one account; leaving them would paint hearts on the
  next reader's feed for likes that are not theirs, and an unlike would try to
  delete a record in a repo they do not own.
- **The post cache is KEPT.** Those are public posts this browser collected, not
  account data, and discarding them would throw away the archive the whole
  design rests on. Clearing it is a separate, explicit button.
- **Say that it signs you out everywhere.** The session is a `*.mino.mobi`
  domain cookie, so this is not a per-site sign-out and should not surprise
  anyone.

### Custom feeds, and the one place "frontend-only" bends

`lib/feedgen.js` + the `/api/feedgen` route in `worker.js`. This is what makes
the surface an AppView rather than a reader: **any** `app.bsky.feed.generator`
on the network renders here, personalised to whoever is signed in —
@spacecowboy17's *For You* included.

How a third-party feed knows who you are: it is an independent service, and
Bluesky's own AppView identifies the reader to it with a short-lived
**service-auth JWT** — `iss` the reader's DID, `aud` the feed's service DID,
`lxm` the single method it may be used for. The browser can mint the identical
thing, because `com.atproto.server.getServiceAuth` runs on the reader's **own
PDS**. Nobody trusts us with anything: the credential is theirs, scoped to one
audience and one method, and lives about a minute. `SCOPE` in `compose.js`
carries `rpc:com.atproto.server.getServiceAuth`, which the auth worker's
`RPC_SCOPES` already allowed.

**What the browser cannot do is send it.** Feed generators do not answer with
CORS headers. Measured 2026-09-05:

| Generator | `access-control-allow-origin` |
|---|---|
| `foryou.club` (For You) | **none** |
| `api.graze.social` | **none** |
| `feed.mino.mobi` (ours) | `*` — which is why simcluster loads directly |

**But not every feed needs it.** A survey of 10 live feed services on
2026-09-05 found 3 that already answer browsers:

| Service | `access-control-allow-origin` |
|---|---|
| `discover.bsky.app` (Bluesky's own Discover) | `*` |
| `algo.pop2.bsky.app` | `*` |
| `feeds.bluesky.day` | `*` |
| `foryou.club`, `api.graze.social`, `feedsky.jazco.io`, `skyfeed.me`, `skyfeed.xyz`, `attie.ai`, `beta.graze.social` | none |

So `loadCustomFeed()` **tries direct first and falls back to the relay**, caching
the verdict per service DID so a refusal costs one request once. For a third of
the feeds tried — including Bluesky's own — no worker touches the request at
all, and the status line says which path was used. The less traffic through the
relay, the smaller the thing anyone has to trust.

Exactly which steps a browser can do, measured:

| Step | Browser? |
|---|---|
| 1. the generator record (public AppView) | ✅ CORS `*` |
| 2. the DID document — `did:plc:` via plc.directory | ✅ CORS `*` |
| 2. the DID document — `did:web:` on the operator's host | ⚠️ only if they allow it |
| 3. **`getFeedSkeleton` on the generator** | ⚠️ only if they allow it |
| 4. hydrate with `getPosts` (public AppView) | ✅ CORS `*` |

**None of this is encryption, and the relay holds no key.** Measured in
Chromium against a local server that returns a known plaintext body: a plain
cross-origin `fetch` throws `TypeError: Failed to fetch`; the identical request
with `mode:'no-cors'` *resolves*, with `response.type === 'opaque'`,
`status === 0`, zero readable headers and an empty body — while the server logs
show it served the plaintext every time. The bytes reach the browser process
intact; the browser then refuses to hand them to the page, because the
Same-Origin Policy says a response may only be read by an origin the server
opted in. `no-cors` is the spec's name for "you may fire, you may not look" —
and it **strips `Authorization`** (not a CORS-safelisted request header), so it
could not carry the service-auth JWT even if the body were readable. Our worker
reads the body for exactly one reason: it is not a browser, so no policy applies
to it.

Two other routes exist and are worth knowing before anyone "fixes" this:

| Route | CORS to a browser | Personalised? |
|---|---|---|
| `public.api.bsky.app/xrpc/app.bsky.feed.getFeed` | `*` — verified | **no** — unauthenticated, so For You returns its "requires authentication" placeholder |
| the reader's own PDS + `atproto-proxy: did:web:api.bsky.app#bsky_appview` | `*` — verified on `bsky.social` and a `*.host.bsky.network` PDS | **yes** — the PDS forwards to Bluesky's AppView, which mints service auth for the reader |

The second is how the official client does it and it would remove `/api/feedgen`
from the personalised path entirely. It is not free: it needs
`app.bsky.feed.getFeed` added to `workers/auth`'s `/pds/*` allowlist (a fixed
eight-route list) plus `atproto-proxy` passthrough, and it routes every custom
feed through Bluesky's AppView — which is the thing this surface exists not to
be a client of. A real option, an honest trade, not an obvious win.

There is no client-side way around a missing CORS header — the browser enforces
it on the response, `no-cors` gives an unreadable opaque body, and a service
worker is bound by the same rule. The only real fixes are a relay like this one,
or the operator adding one header. Ours (`feed.mino.mobi`) sends it.

So `/api/feedgen` is a CORS shim and nothing else. Two properties keep it
honest, and both must survive any edit:

1. **It holds no credential.** The `Authorization` header is the reader's own
   JWT, forwarded untouched, never read, logged or stored.
2. **The caller does not choose the host.** It passes an `at://` feed URI; the
   worker resolves the generator record and the DID document *itself* and calls
   only the endpoint that document names. Letting a caller name the target would
   make this an open proxy. Verified: a URL, a non-generator collection and
   garbage all return `400 unresolvable_feed`.

A feed with no valid token still answers — with a **generic** list, not an
error. The status line says which you are looking at rather than letting a
default masquerade as yours. (Two different malformed tokens return
byte-identical lists, so the fallback reads no identity.)

Residual risk worth knowing: the auth worker injects `repo=<did>` into every
proxied GET, and `getServiceAuth` takes no such param. Two PDS hosts returned an
identical 401 with and without it, so it is not rejected on validation — but
auth fails before the handler, so that is evidence rather than proof.

### One consent, and the loop that made repost impossible

`lib/compose.js` exports one `SCOPE` covering **post, like and repost**, and
sign-in requests all of it. The rule this repo states is a NARROW scope — only
what this site writes — not a minimal one, and this site writes all three.

The earlier design asked for `feed.post` alone and escalated with
`ensureScope()` on the first like. That cost a second consent screen and a third
for the first repost. Worse: while `app.bsky.feed.like`/`.repost` were still
missing from the auth worker's ceiling, the authorization server would not grant
them, so every escalation came back **without** the scope and the next tap
escalated again — an unbreakable loop with no error to explain it. The ceiling
now carries both (77 collections), and asking up front means it cannot recur.
If you ever add a fourth write, add it to `SCOPE` *and* to `WRITE_COLLECTIONS`,
in that order of thinking but the opposite order of deploying.

### Tap targets, the lightbox, and the post menu

- **The whole post card opens the thread.** `data-thread` is on the `<article>`,
  not the text, so the dead margin beside the avatar works — that gutter was the
  single most-missed tap on a phone. One delegated handler resolves most-specific
  first: profile links, then media, then `button[data-act]`, then real links,
  then the card.
- **`lib/lightbox.js`** replaces opening the image file in a tab, which lost the
  album, the alt text and your place in the feed. Horizontal drag pages the
  post's images, vertical drag dismisses, two fingers pinch anchored on their
  midpoint, double-tap toggles 1x/2.5x anchored on the tap. **The drag axis is
  locked once**, on the first 8px — deciding per-frame makes a diagonal drag
  jitter between paging and dismissing. `touch-action:none` on the stage is
  required or the browser claims the gesture first.
- **`lib/share.js`** is the ⋯ menu: copy link, copy text, copy image, view on
  bsky.app. Copying an image must hand `ClipboardItem` an **unresolved promise**
  — awaiting the blob first loses Safari's user-gesture context and the write is
  refused. Clipboards only take `image/png`, so the CDN's jpeg/webp is redrawn
  through a canvas.
- **The menu ignores scroll events for 400ms after opening.** Bringing the
  button into view and the momentum from the tap both fire scroll immediately,
  and closing on those makes the menu impossible to open near the bottom.

### Notifications are chronological, via TID

`lib/tid.js`. Constellation returns `{did, collection, rkey}` and **no
timestamp**, which is why notifications could once only be grouped by kind. But
an rkey is a TID and a TID encodes the microsecond it was minted, so decoding it
gives a real time for every like, reply and follow, and the list sorts into true
reverse-chronological order across all three.

Checked against 8 real posts: the decoded time matched the record's own
`createdAt` to the millisecond in 6 of 8, within 15s in the other two. It is
still a *claim* by whoever wrote the record — nothing verifies a client's clock
— so it orders a list and proves nothing.

Polling runs every 90s, and **only while the tab is visible and Notifs is the
open tab**. A refresh is quiet: the current list stays on screen until the new
one is ready, so a poll never blanks what someone is reading.

### Threads and replies

Tapping a post's text opens `#/thread/<uri>`. `getPostThread` returns a
recursive `threadViewPost`: `parent` walks up, `replies` walks down, and blocked
or deleted nodes come back as a different `$type` with **no `post`** — so every
walk checks rather than assumes. `getThread()` flattens replies depth-first,
carrying a `level` for indentation, which the CSS caps at 4 so a thirty-deep
argument does not slide off a phone.

**A reply carries BOTH `root` and `parent`, and the root is the thread's root —
not the post being replied to.** Take it from the parent's own
`record.reply.root` and only fall back to the parent itself when replying to a
top-level post. Getting this wrong detaches the reply in every client, which is
the kind of bug that looks fine locally and is invisible until someone else
loads the thread.

### Profile tabs and the media wall

Posts / Media, with Media an infinite masonry. Three things are deliberate:

- **CSS `columns`**, not a measured grid. True masonry with no measuring pass
  and no reflow jank; the trade is column order rather than row order, which for
  a photo wall does not matter.
- **`.mtile img { height: auto }` is load-bearing.** Tiles carry `width`/`height`
  attributes from the post's `aspectRatio` so space is reserved before the image
  loads — but without `height:auto` the attribute becomes the *used* height and a
  3300x1968 photo renders 1968px tall inside a 212px column. Measured: 1968px
  before the fix, 126px after.
- **The sentinel is recreated per page**, never reused. An IntersectionObserver
  watching an element that stays in view after an append fires again
  immediately, which is how an infinite scroll becomes a runaway request loop.
  Leaving the profile disconnects the observer, or it keeps paging a screen
  nobody is looking at.

One tester's note: `page.mouse.wheel` does **not** scroll an emulated touch
device. A scroll test that uses it will report "infinite scroll broken" when it
works fine — scroll the document instead.

### Search and profiles

Two depths of people search, deliberately: `searchActorsTypeahead` (prefix,
max 10, per keystroke) drives the menu; `searchActors` (display names and
bios, paged) runs on Enter. **`runSearch()` must call `typeahead.close()`
first** — a debounced suggestion request fired just before Enter otherwise
lands afterwards and drops its menu over the results, where it silently
intercepts taps. That bug was live until a click test caught it.

Profiles are a screen, not a tab: `#/profile/<handle>`, reachable from any
avatar, name, handle or search row via one delegated `[data-profile]` listener
rather than a binding per post.

### No DMs

`chat.bsky.*` is a **centralised service**, not repo records. DMs never enter
the firehose, so they are not in Jetstream, not in the archive, and not
reachable by anything in this design — no amount of frontend work gets to them.
Proxying them would need `rpc:chat.bsky.*` scopes plus `atproto-proxy` support
in `workers/auth`, whose `/pds/*` proxy is a fixed eight-route allowlist with no
chat routes. That is a different surface's branch and a different kind of
product. The Me tab says so rather than leaving a dead tab.

## Caching — read this before touching lib/cache.js

The cache is not an optimisation. **It is the archive**, and it is why the ~36h
window stops being a ceiling.

Jetstream replays about 36 hours and no further. But that is a *rolling* window:
today's 36 hours are not tomorrow's. A client that keeps what it saw accumulates
history the network will never serve it again.

```
visit 1  →  36h replayed, all of it stored
visit 2  →  resume at the stored seq; the ~24h gap is inside the window,
            so it is filled with NO hole.  store now holds ~60h
visit 30 →  the store holds a month, from a service that never offers
            more than a day and a half at once
```

**The rule that makes this work: resume by `seq`, never by time.**

| Situation | Reconnect with | Why |
|---|---|---|
| stored cursor, last seen < 30h ago | `cursor=<seq>` | continuous — no hole, and no re-downloading the window |
| no cursor (first visit) | `since=<hours>` | nothing to bridge to |
| cursor older than ~30h | `since=<hours>` **and `recordGap()`** | the bridge is impossible; the hole gets written down |

`resumePlan()` is the only place that decision is made — don't re-derive it at a
call site. Resuming by *time* instead would re-download the whole window every
visit and still leave the same hole.

**Every write is keyed on the record's `at://` URI.** Jetstream delivery is
at-least-once and the cursor is inclusive, so the first event after a resume is
always one you already hold. Do not "optimise" a put into an append.

Other things that are load-bearing:

- **Store posts you do not render.** Replies filtered out of the feed still go
  to disk — a profile view later will want them. `onEvent` stores first and
  filters second, deliberately.
- **Writes are batched** (100 at a time, flushed on a timer and on
  `visibilitychange`). A replay delivers thousands of events; one transaction
  per event would jam the main thread. `visibilitychange` rather than `unload`
  because `unload` does not fire reliably on iOS.
- **Gaps are recorded, not hidden.** A feed that silently omits a day looks
  exactly like a quiet day. That is the one thing a history view must never do.
- **Everything degrades without it.** Private windows and blocked site data make
  IndexedDB throw; `available()` is checked once at boot and every cache call is
  guarded. No local store means a session-only feed, never an error.
- Eviction is oldest-first past `MAX_POSTS` (50k). Call `evict()` after a replay
  settles, not per event.

Nothing here is ever uploaded. There is no server in this design to upload it to.

## Quirks

- **A depth of `live only` genuinely starts empty**, and the empty state says so
  rather than spinning. Any other depth backfills first.
- **Delivery is at-least-once.** Jetstream replays the cursor inclusively and may
  redeliver across a reconnect, so every write is keyed on the record's `at://`
  URI (`eventUri()`). Handlers must stay idempotent.
- **Deletes arrive as events**, carrying no record — just collection and rkey.
  The feed removes the post rather than ignoring the event.
- **Account-level events** (`identity`, `account`, `sync`) carry no collection
  and flow even to a collection-filtered consumer, by design. This surface only
  subscribes `kinds=commit`, so it doesn't see them; anything that needs to react
  to an account deletion must widen `kinds` rather than filter them out later.
- **The DOM is the only store.** A 400-post ring buffer, trimmed oldest-first.
- `bsky/packages/` is **gitignored** and staged at deploy time from
  `packages/atproto/` (the `b/` and mappa pattern) — the assets root is `bsky/`,
  so `../packages/` would 404 in the browser. Edit `packages/atproto/`, never a
  staged copy. Changes to those three modules are in this workflow's `paths:`,
  so they redeploy this surface.

## Deploying

Pushes to `claude/bsky-app-view-feasibility-8sdflz` touching this surface's
paths trigger [`deploy-bsky.yml`](../.github/workflows/deploy-bsky.yml).
`main` does not deploy — see the repo [`CLAUDE.md`](../CLAUDE.md).

**`bsky.mino.mobi` did not resolve before this branch.** No worker owned it, so
the first deploy attaches the custom domain. Per the golden rule, green is not
proof: **confirm the run log binds `bsky.mino.mobi (custom domain)`**, and
`curl -sI https://bsky.mino.mobi` before believing the surface is live.

## Not done yet

- **Verified live (2026-09-05, from node):** the v2 subprotocol handshake, the
  `{$type, payload}` envelope, `seq` cursor tracking, and that deletes arrive
  without a record (2 of 25 sampled events) — the delete path is exercised, not
  assumed. The `dids` filter was driven end to end via `getListMembers` on the
  feed worker's seed list: 90 accounts, one socket, no events from outside the
  filter. The timestamp cursor, its ~36h boundary and its silent clamp were
  measured directly. Constellation's counts were checked against a real post.
- **The archive path is only half-verified.** The key is now set and
  `planSnapshot` returns real plans through the proxy (block-mode ranges, not
  whole segments). Nothing has been *downloaded or decoded* — `getSegment` is
  deliberately off the allowlist.
- **The next move is probably not this worker at all.** A user's own key can go
  straight from their browser to the archive: CORS is `*` with `Authorization`
  and `Range` allowed, the zstd dictionary is 64 KiB and unauthenticated, and
  `@bsky/jetstream`'s browser branch takes an injected `decompressor`/`sha256`
  (`@bokuweb/zstd-wasm` handles the dictionary; `fzstd` does not — it throws).
  See docs/APPVIEW-FEASIBILITY.md §3. That path pools no quota and makes us
  custodian of no credential.
- **The live tail is the one path never exercised in a browser.** The DOM,
  routing, lightbox, masonry, feeds, threads, search and notifications have all
  been driven by a real page load. `WebSocket` subprotocol negotiation has not:
  this sandbox's proxy blocks WebSockets, so the `live` and `following` chips
  are verified in node against the real host and untested in Chromium. Same for
  **reach further back**, which needs the archive.
- **The install prompt is unverified.** Registration, caching, offline, the
  update path and the two safety rules are all exercised in Chromium, but
  `beforeinstallprompt` does not fire headless and iOS has no API at all, so
  the actual add-to-home-screen has only been reasoned about.
- **No write has ever been made from here.** Post, reply, like and repost are
  code-complete and consent works, but nothing in this sandbox can complete an
  OAuth round trip, so the actual `createRecord` calls are unverified end to
  end. The `repost` path in particular was reported broken once by the
  principal and fixed by widening `SCOPE` — that fix is reasoned, not observed.
- No moderation. Labels, blocks and mutes are not applied. An AppView that
  showed anyone else's timeline would need them before it were fair to call it
  one; see §6 of the feasibility doc.
- No DMs, and there cannot be — see above.
- The relay's own `JETSTREAM_API_KEY` may not be worth keeping. It buys archive
  *metadata* only, and the BYO-key path above makes us custodian of nothing.
  Open question, not a decision.
