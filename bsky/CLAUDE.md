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

### Rule feeds — a feed generator running in the reader's tab

`lib/rulefeed.js`. The case that produced this: a feed whose generator service
stopped answering. Diagnosed 2026-09-05 for
`at://did:plc:7zre4plmd5jllccww575j6sb/app.bsky.feed.generator/chase-the-preprint`:

- the host, `did:web:attie.ai`, is **up** — `did.json`, `describeFeedGenerator`
  and `getFeedSkeleton` all 200
- but its `describeFeedGenerator` lists 29 feeds and **that one is not among
  them**, and its skeleton returns `{"feed":[]}` — an empty list, not an error

Which is why a dropped feed reads as a working, permanently empty one.

**Nothing in the record can rebuild it.** An `app.bsky.feed.generator` record is
`displayName`, `description`, the service `did`, an avatar and `createdAt` —
that is the entire lexicon. The algorithm lives in the operator's server code.
The description is prose intent, and the `rkey` is a name; neither is a ranking.

But a feed defined by **content** rather than by a follow graph needs no server
at all. `collections=['app.bsky.feed.post']` with **no `dids` filter** is the
unfiltered post firehose — unauthenticated, unmetered — and the rule runs in the
tab. Two sources, in this order:

1. **the archive** — scan what IndexedDB already holds. Free, instant, offline,
   and it reaches back as far as the local store, which for a regular reader is
   further than Jetstream will ever replay.
2. **the firehose** — matched live.

The cost is real and is therefore **shown**: without a `dids` filter the socket
carries every post on the network, so `RuleRunner` meters posts scanned, matched,
per-second and KB/s into the feed header. This sandbox cannot measure that rate
(its proxy refuses the WebSocket upgrade — non-101), so rather than guess a
number the app measures it on the reader's own device. `RuleRunner` also
**disconnects on `visibilitychange`**: a firehose in a backgrounded tab is
nobody's intent, and on a phone it is somebody's data plan.

Rules are edited as one directive per line, so tuning a feed needs no JSON:

```
preprint          a term            @arxiv.org      a link domain
"new paper"       an exact phrase   #openscience    a hashtag
-crypto           excludes          doi             any DOI
```

`lib/rulefeed.selftest.mjs` is the important file. A content filter **fails
quietly** — a boundary bug just produces a feed with some wrong posts in it,
which reads as "the algorithm is a bit off" rather than as a bug. So the
negative cases are half the suite, and these are the ones that cost thought:

- **Terms match on word boundaries.** A substring test for `osf` matches
  *crossfade*; `arxiv` matches *arxivist*. Both are asserted not to.
- **`\b` only works next to a word character**, so the boundary is applied only
  at ends that have one — otherwise a term like `10.` could never match.
- **Domains match on a dot boundary.** `arxiv.org` catches `export.arxiv.org`
  but must not catch `notarxiv.org`, and a domain appearing in a *path*
  (`evil.com/arxiv.org/x`) is not a match.
- **Links come from three places** — rich-text facets, `embed.external.uri`, and
  the raw text. Facets are generated by the posting client, so a scripted post
  may have none; trusting them alone silently drops posts.
- **A missing `langs` field passes a language filter.** Absence is not evidence
  of the wrong language.
- **A veto beats every match**, and is tested first because it is the cheapest
  rejection.

The suite also **prints the preset's known false positives** rather than hiding
them — "new paper towels arrived" matches, and always will. A keyword rule is
not a classifier, and the docs should not imply it is.

Verified in Chromium against a seeded archive (2026-09-05): the chip appears,
the archive scan matched exactly the 4 science posts out of 7 seeded with **zero
off-topic leaks**, the editor round-trips the preset, and rewriting the rule to
`sandwich` re-filtered to exactly the sandwich post and persisted.

### What three live runs of the rule actually taught

`.github/workflows/measure-firehose.yml` runs the shipped preset against the
real firehose on a runner (this sandbox's proxy refuses the WebSocket upgrade,
so it is the only place the tail can be observed). Three 90s samples,
2026-09-05:

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| posts/s | 40 | 188 | — |
| KB/s | 37 | 159 | — |
| extrapolated | 3.0 GB/day | 13.1 GB/day | — |
| matched | 0.25% | 0.04% | — |
| **precision** | **3 of 9** | **3 of 6** | **2 of 4** |

**Bandwidth was never the problem.** 37–159 KB/s is less than a single image;
the meter exists to prove that to the reader, not because the number is scary.
Precision was the problem, and each run named a different cause:

1. **Bare phrases are worthless alone.** Venue-name, link and DOI signals were
   right 3 of 3; bare conversational phrases 0 of 6. `"the paper"` matched
   "#Caturday is for lazy mornings and reading the paper"; `archaeolog*` matched
   "a faux-archaeological dig"; `"just published"` matched an adult account's
   video promo. → the **weak** tier, gated on a link.
2. **Any link is too weak a gate.** The survivors were all journalism *about*
   research: "T-Mobile Park has the cheapest hot dogs in the MLB, a new study
   says", "the new PyPi download count methodology update". Journalism links to
   journalism; scholarship links to a publisher, a preprint server or a DOI. →
   weak terms need a **scholarly** link, one of the rule's own domains or a DOI.
   Also dropped `archive.org` (it hosts everything — it caught a 1983 music
   magazine) and `"new study"` (that is journalism's phrase, not a researcher's).
3. **Hashtags defeat a word-boundary veto.** "#JDVance et al think this will pay
   them handsome political dividends" matched as scholarship: the veto list has
   `vance`, but `\bvance\b` cannot see inside `#JDVance`. Substring matching is
   the obvious fix and is much worse — `vance` inside `advanced` would gut an
   academic feed. → hashtags are **split on camelCase and digit boundaries** for
   the veto pass only (`#JDVance` → `JD Vance`, `#Election2026` →
   `Election 2026`). Run 3 also demoted `"et al"` and `conjecture` from strong
   to weak; both are ordinary English.

Every one of those thirteen live cases is now a regression test with the post
text verbatim, alongside the true positives they must not take with them. **The
selftest caught an ordering bug during fix 2** — the weak pass sat before the
domain and DOI checks, so the scholarly signal it tests for was never in `hits`
yet and no weak term could fire at all.

**What this cannot become.** It is a keyword rule, not a classifier. The suite
prints its own known false positives rather than hiding them. Precision is
climbing but is not solved, and the honest next lever is not more terms — it is
the reader pruning the list in the editor, which is why the editor exists.

**Not verified:** the firehose leg *in a browser*. The rule and its cost are now
measured on a runner; `RuleRunner`'s socket handling, its meter and its
visibilitychange pause have only been exercised against a seeded archive.

### Replay — the slug, and why it is planned before it is paid for

The live tail is a *subscription*: it only ever hands you what happens next, so
a rule feed opened today is empty today however good the rule is. Replay is the
same events addressed by **sequence** instead of by arrival, which is what lets
the same rule be pointed backwards. `planCost()` and `fetchSlug()` in
`lib/archive.js`, reached from the rule header's **reach further back**.

**Plan before you pay.** `planSnapshot` is an index, not a download: given a
collection filter and a seq range it names the segments holding matching events
and, where a block index exists, the **block ranges** inside them. So the size
of a job is knowable before a byte is bought. Measured against the live archive:

| window (seq back from tip) | segments | indexed blocks | whole segments |
|---|---|---|---|
| ~3.4M | 4 | 153 | 3 |
| ~34M | 17 | 1,017 | 14 |
| ~340M | 152 | 14,452 | 113 |

A block is an individually addressable download —
`network.bsky.jetstream.getBlock` takes `{segment, blockIndex}` — where a whole
segment is ~252 MB. That gap is the entire reason to plan first.

**Budget in BYTES, not events**, and the distinction is the whole contract. The
meter is the reader's own quota, so the only promise worth making is "this will
not spend more than N MB". An event cap cannot promise that, because events per
byte depends entirely on how selective the rule is. `fetchSlug` counts wire
bytes off `Content-Length` as each download lands and aborts on the budget
(50 MiB default).

**Never hold the haystack.** The shape is `b/palm/car-stream.js`'s: `snapshot()`
is an async generator over decoded events, so each is tested and dropped unless
it matches. Peak memory is one block plus the keepers. A 50 MB slug of the post
firehose is on the order of a hundred thousand posts and a few hundred matches;
buffering it first would be the entire cost of the operation, for nothing.

**`dids` is deliberately absent.** The follow-graph path is `fetchOlder`; this is
for a CONTENT rule, where narrowing by account is exactly the wrong filter — the
point is to find people you do not already follow.

Four API facts, each of which cost an hour:

- `planSnapshot` is **POST**; `listSegments` is **GET**. Each rejects the other
  verb with `MethodNotAllowed`.
- The filter parameter is **`collections`**. `wantedCollections` is the
  *websocket's* name for it, is **silently ignored** here, and hands back a full
  unfiltered plan with no error at all.
- **Planning needs auth** — a direct call with no key is a flat 401. It only
  appeared free earlier because it was going through our worker. So `planCost`
  has two routes: the reader's own key straight to Jetstream, or our
  origin-locked `/api/replay/` proxy when they have not minted one yet. The plan
  is a few KB either way; only the DOWNLOAD spends real bytes, and that is always
  the reader's own key.
- A block range is **inclusive at both ends** (`last - first + 1`).
  `lib/archive.selftest.mjs` pins that, because understating the count
  understates a spending limit.

### It ran. What a 50 MB slug actually buys

`replay-slug.yml` spends the repo's `JETSTREAM_KEY` on the real archive and runs
the surface's shipped rule over what comes back. It deliberately supplies the
**browser** shims — `@bokuweb/zstd-wasm`'s `decompressUsingDict` and
`lib/sha256.js` — not the SDK's node defaults of `node:zlib`/`node:crypto`,
because those defaults are exactly what a browser does not have.

Final run, 2026-09-05:

```
segments read  1 of 40 candidates
events seen    61,951      58,977 create / 2,957 delete / 17 update
requests       130
wire bytes     50.3 MB     7.6 MB/s
zstd frames    127         49.8 MB in -> 181.7 MB out  (3.6x)
posts scanned  58,994      in 6.6s   (8,874/s)
stopped        the 50.0 MB budget
matched        85 unique   (0.144%)   0.6 MB per match
```

The matches are real: bioRxiv, sciencedirect, Cambridge, PLOS, MDPI, Wiley,
Taylor & Francis, Project Gutenberg, bare DOIs. **50 MB of archive is about
59,000 posts and ~85 papers, parsed in under seven seconds.**

**Four bugs this found in code that had never run.** None of them threw; all
four failed as silence, which is why nothing short of spending the key would
have caught them:

1. **`fetchImpl`, not `fetch`.** The SDK ignores an unknown option, so the
   wrapper never ran — `requests 0` while a 262 MB segment plainly downloaded.
   In `fetchOlder` that disabled quota reading; in `fetchSlug` it disabled the
   byte budget the whole function is built around.
2. **The prefetch buffer must sit under the budget.** `snapshotBufferBytes`
   defaults to **64 MiB** and is filled *before* the generator yields anything,
   so a 50 MiB budget aborted mid-prefetch and emitted nothing, every time. Now
   `budget/8`.
3. **Snapshot events are NESTED.** `{ did, seq, time, kind, commit: { operation,
   collection, rkey, rev, cid, record } }` — not the flat payload our own live
   client emits. Both archive paths read `evt.collection` and silently discarded
   every event: 16,234 decoded, zero posts. Now via `commitOf()`.
4. **A whole segment is a ~262 MB ATOMIC download.** A byte budget cannot
   subdivide one, so a window without a block index just aborts on the first
   Content-Length. `fetchSlug` now walks **block-indexed segments only**, newest
   first, one bounded snapshot each, carrying the budget across them — spanning
   them with one wide seq range would drag in the un-indexed ones between.

It also found two rule bugs the live tail never surfaced: `habilitation`
matched a French Disney-park post (ordinary French), and the same preprint came
back twice from two different DIDs — mirror accounts post verbatim, so matches
are deduped by `at://` URI.

**Still not verified:** any of this *in a browser*. The shims are proven against
real dictionary-compressed frames and the logic is the same file, but
`lib/vendor/` is built at deploy time and the sandbox cannot load WASM from a
page. The remaining risk is `zstd.init()`'s wasm path and IndexedDB write volume
under a 59,000-post scan, not the protocol.

### Quoted posts, and why they were unreachable

`quoteCard()` in `lib/blobs.js`. Two bugs, both invisible:

- **The card carried no `data-thread`.** A tap bubbled to the enclosing
  `<article>`, whose own `data-thread` is the OUTER post — so a quoted post
  could not be opened, and worse, tapping it *looked* like it worked and took
  you somewhere else. The delegated handler uses `closest()`, which finds the
  NEAREST ancestor, so an inner `data-thread` wins; that is the whole fix.
- **The raw shape rendered nothing.** From Jetstream a quote is only
  `{uri, cid}` — no author, no text — and the guard `if (!rec.author) return ''`
  dropped it, so quotes silently vanished from the live and rule feeds. A quote
  whose target cannot be described is still a quote worth offering: the bare
  card says so and stays tappable.

The quote's author is also `data-profile`, so the header opens the quoted
account rather than the quoting one.

### "Cannot mint a service token" told nobody anything

`serviceToken()` returned a bare `null` for four unrelated failures — not signed
in, session missing the rpc scope, the PDS refusing, an exception — and the
status line rendered all four as *"this session cannot mint a service token"*.
Unactionable, and it hid the commonest cause completely.

That cause: **a session created before `rpc:com.atproto.server.getServiceAuth`
was added to `SCOPE` carries the old grant forever.** `hasScope()` reads the
GRANTED scope, not what the site would ask for today, so a reader who signed in
earlier can never personalise a feed and nothing anywhere says why. Signing in
again fixes it.

So `serviceToken` now returns `{token, reason, fix}`, the status line prints the
reason, and `fix: 'rescope'` puts a one-tap **reauthorise** banner above the
feed. `ensureScope` REDIRECTS, so it needs a real gesture — it cannot be done
silently on the reader's behalf.

**And a real bug in `workers/auth` behind it.** The `/pds/*` proxy injected
`repo=<did>` into every GET without one, and into every JSON POST. That is right
for the `com.atproto.repo.*` methods and wrong for the other two:
`sync.getBlob` takes `did`, and `server.getServiceAuth` takes `aud`/`lxm`/`exp`
and no repo at all. Sending a parameter a lexicon does not declare is at best
noise and at worst a validation failure on a strict PDS — exactly the fault that
surfaces as an unexplained mint failure. Routes now carry an explicit
`repoScoped` flag instead of the assumption.

### The rule feed replays by default

Reported as "knowledge chase is still reading firehose", and correctly: the tail
was the default and replay was a button. That is backwards. A subscription only
hands you what happens NEXT, so a rule feed opened today is empty today however
good the rule is — which is the whole reason the archive exists.

Now, **with a key, `startRuleFeed` replays a slug immediately** and the live
tail is an explicit *also listen live*. Without one it falls back to the
firehose and says plainly that the archive is where the feed actually fills up,
and where to get a free key. `apikey.hasKey()` decides, synchronously, with no
dependency on `lib/vendor/` — see the sign-out post-mortem for why that matters.

### Read the paper — a PDF, in the feed

`lib/paper.js`, opened from a 📄 button under any post whose links include a
readable paper. pdf.js renders it to canvas: scrollable, zoomable, with its
hyperlinks live.

**Only arXiv, and that is a measurement, not a preference.** The blocker is CORS
again, and the answer happens to be good for the source that matters most here:

| host | browser-fetchable |
|---|---|
| **arxiv.org** | **YES — `ACAO: *` AND Range** |
| osf.io | no (Range, but no CORS) |
| ncbi PMC, biorxiv, medrxiv, plos, mdpi, nature | no |

arXiv allowing a cross-origin read *and* byte ranges is what makes this work:
pdf.js fetches the structure and only the pages being looked at, instead of
pulling a 20 MB download before drawing anything. Everywhere else the browser
cannot read the bytes — `no-cors` yields an opaque body, which is not a PDF you
can parse. Those links stay ordinary links and **no button is offered**, because
a button that opens an error is worse than the link the reader already had.

An `/abs/` link resolves to the PDF, which matters: an abstract page is what
people actually post.

pdf.js is ~508 KB plus a 1.3 MB worker, so it is **dynamically imported on the
tap** and is never in the app shell. `deploy-bsky.yml` stages it.

Four things cost a run each, and all four fail the same way — silently:

- **Use the LEGACY build.** pdfjs 6's modern bundle calls
  `Map.prototype.getOrInsertComputed`, which Chromium 1194 does not have.
  Pages size correctly and draw *nothing*; the only clue is a console
  TypeError. The legacy bundle ships the core-js polyfill.
- **`viewport.convertToViewportRectangle` was REMOVED in v6**, and
  `Util.applyTransform` still exists but no longer returns a destructurable
  point. Both throw inside the annotation pass, so every link vanishes —
  indistinguishable from a PDF that has no links. The viewport transform is an
  ordinary affine matrix, so `rectToViewport()` does the arithmetic here and is
  unit-tested. It cannot be renamed out from under us.
- **The document has no `destroy()`** — teardown is `loadingTask.destroy()`.
  The old call was `doc?.destroy?.()`, and the optional call made the missing
  method silent, leaking the worker. Optional chaining on a method you believe
  exists hides exactly this.
- **Never two `render()` calls in flight on one page.** The observer starts one,
  the reader zooms, `setZoom` starts another on the same page object. Renders
  are now serialised per page, and zoom supersedes by bumping a generation
  rather than cancelling — cancelling mid-flight is the other way to break it.

**Verified in Chromium** against a hand-built 2-page PDF with a link annotation:
both pages render (2,814 dark pixels on page 1 — text actually drawn), the
annotation becomes a live `<a>` to the right URL, zoom re-renders at the new
scale (canvas 748 → 935 px wide, not an upscaled bitmap), close restores the
page, and the button appears for arXiv and not for biorxiv or nature.

**Not fixed, and not root-caused:** pdf.js emits one uncaught
`Cannot read properties of null (reading '_post')` per teardown, and one more
per zoom. In isolation every operation this viewer performs is clean — import,
`getDocument`, concurrent renders of different pages, `getAnnotations`,
`loadingTask.destroy()` — so it is something about the combination. Four
plausible fixes did not remove it; two of them were real bugs and stayed. It has
no observed effect on rendering, links, zoom or teardown, and it does not fire
unless a paper is opened.

### Navigation: keeping your place, and swiping back

**Losing your place is the most expensive bug a feed reader can have.** You tap
a post, read the thread, come back — and you are at the top, with no way to find
the post you were on or anything below it. Everything already scrolled past is
effectively gone.

`showTab()` used to `window.scrollTo(0, 0)` unconditionally. It no longer
scrolls at all; `route()` decides, because only the router knows whether you are
ARRIVING somewhere (top) or GOING BACK (where you were). Offsets live in
`scrollMemory`, keyed by route.

Two details that are easy to get wrong:

- **Restore across two animation frames.** One frame lands before the feed has
  height, and the scroll silently clamps to 0.
- **Thread and profile offsets are dropped on leaving.** Those screens rebuild
  their content, so a remembered offset would land on different posts. The home
  feed survives because `showTab` only HIDES `#v-home` — the posts are still
  there and the offset still means what it meant.

**Swipe back is an EDGE swipe**, starting within 32px of the left edge, and that
scoping is the whole design. This app already uses horizontal drags for other
things: the lightbox pages through a post's images, the PDF viewer pans a zoomed
page. A general "swipe right anywhere goes back" would fight both, and a gesture
that sometimes navigates away mid-read is worse than no gesture. It also bails
on multi-touch (that is a pinch), on more vertical than horizontal travel (that
is a scroll), and when an overlay is open (the gesture is the overlay's).

### Repost, or quote?

Tapping ↻ on a post you have NOT reposted opens a two-item menu; un-reposting
skips it, because there is only one way to undo. A repost is two different
intentions sharing one glyph, and doing the wrong one is public.

`toggleAction()` is extracted rather than duplicated: the menu's "Repost" must
do exactly what a direct tap does, and a second copy would drift.

**A quote needs the quoted post's CID**, exactly like a like — `app.bsky.embed.record`
with only a URI is rejected. The composer checks before opening rather than
failing after the reader has written something.

### Posting pictures

`prepareImage()` in `lib/compose.js`, and the picker in the compose sheet.

The auth ceiling already declared `blob:image/*` and `blob:video/*`, so this
needed no worker change — but **a scope is only granted if it is asked for**, and
`SCOPE` did not ask. A session minted before this line will not have it; the
reauthorise banner covers that.

Two things must both be right or the post looks broken in other clients:

- **Size.** The PDS blob ceiling is ~1 MB and a modern phone photo is 3–8 MB, so
  an untouched upload fails — at the very END, after the reader has written
  their post. `prepareImage` resizes to a 2000px long edge and then re-encodes at
  falling quality until it fits. Resizing alone is not enough for a noisy image;
  quality alone is not enough for a 40-megapixel one. Measured: a 22.8 MB
  full-noise PNG became a 774 KB JPEG.
- **Aspect ratio**, measured from the ENCODED bitmap rather than the source
  file. Every client lays an image out from `aspectRatio` before the bytes
  arrive; if it disagrees, the feed jumps as pictures load.

A PNG screenshot under the ceiling stays PNG — re-encoding text as JPEG fringes
it.

Blobs are uploaded FIRST and only then referenced: a `createRecord` naming a
blob that does not exist is rejected, and the reader would lose their text to an
error mentioning neither.

**Video is not supported, and not by oversight.** `app.bsky.embed.video` expects
a blob that Bluesky's own video service has transcoded — the official client
uploads through `app.bsky.video.uploadVideo` at `did:web:video.bsky.app`, using
a service-auth JWT, not a plain PDS blob. A raw upload would produce a post that
does not play anywhere. The picker says so rather than skipping the file
silently. The token minting for it already exists (`lib/feedgen.js`), so this is
a known piece of work, not a wall.

### Link cards render; they are just rare

We DO handle `app.bsky.embed.external` — thumbnail, host, title, description.
Measured across 40 real posts from `bsky.app`: 17 quote embeds, 13 no embed, 7
images, 2 video, **1 external card**, and 3 posts carrying a link with no card
at all.

That is the thing to understand before "fixing" it: **Bluesky does not generate
cards, the POSTING CLIENT does.** It fetches the page's metadata at compose time
and attaches it to the record. A bare URL in text is just a link facet, and
there is nothing in the record to render.

So generating a preview for a bare link means fetching that page ourselves —
which is the CORS wall again, and this time nearly every site is on the far side
of it. That is the real shape of the "live preview pane" ambition: not a
rendering problem, a fetching one.

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

### Signing out — and the one missing function that killed four buttons

`signOut()` in `app.js`. It is worth reading the failure before the feature,
because the shape of it recurs.

**`signOut` was referenced but never defined.** The button, this documentation
and the commit message announcing it all shipped; the function did not. Nothing
caught it:

- it is not a syntax error, so `node --check` passed;
- the identifier is only evaluated when that LINE runs, so the module loaded and
  the whole app booted normally;
- the line is `$('me-signout')?.addEventListener(…)`, so **signed out** the
  element is null, the `?.` short-circuits and the line never executes — every
  test that was not signed in passed;
- and when it did run it threw a `ReferenceError` that aborted the rest of
  `renderMe()`, so **"clear the store", "save key" and "forget key" — all wired
  after it — were dead too.** One missing function, four dead controls, only for
  signed-in readers, with no visible error.

It was "verified" originally by grepping the deployed asset for the string
`me-signout`, which finds the button's id and proves nothing about the handler.

Three things came out of it, and all three should stay:

1. **`lib/wiring.selftest.mjs`** fails the build when any handler names a
   function that is not defined — it knows `addEventListener`, `.onclick =`, and
   `app.js`'s own `on()` wrapper. Moving the Me tab onto `on()` silently took
   those buttons out of the test's view, so the guard has to know every way a
   handler is attached or it stops guarding the moment the wiring is refactored.
2. **`on(id, event, fn)`** replaces sequential `addEventListener` calls in
   `renderMe`. Wiring eight buttons in a row makes every later control depend on
   every earlier one; `on()` catches, logs, and says so in the status line.
3. **`lib/apikey.js`.** "Save key" called `await archive()`, and `archive.js`
   statically imports `lib/vendor/` — WASM zstd and the bundled SDK, both built
   at deploy time. If either fails to load that import rejects and the button
   dies silently. Saving a key is `localStorage.setItem`; it has no business
   depending on a decompressor, least of all when the reader is trying to set up
   the key that the decompressor needs. Key storage is now dependency-free and
   `archive.js` re-exports it.

What `signOut()` itself must keep doing:

- **`actions.forgetInteractions()` first.** The like/repost rkeys belong to one
  account; leaving them paints hearts on the next reader's feed for likes that
  are not theirs, and an unlike would try to delete a record in a repo they do
  not own.
- **Keep the post cache.** Those are public posts this browser collected, not
  account data, and discarding them throws away the archive the design rests on.
  Clearing it is a separate, explicit button.
- **Say it signs you out everywhere** — the session is a `*.mino.mobi` domain
  cookie. And the client's method is `logout()`, not `signOut()`.

### The status line used to lie

`connectionStatus()` in `app.js`, and the same rule inside `RuleRunner`.

The old wiring was `onConnect: () => say('live · …')` and
`onDisconnect: () => say('reconnecting…')`, straight through — and the header
then reads **"reconnecting" essentially always, while posts are visibly
arriving**. The reason is that a Jetstream socket ending is NORMAL: it closes
when a replay finishes, on idle, on a host rotation. Every close painted
"reconnecting…", the reconnect painted over it, and the backoff grows to 30s —
so the lie is what is on screen most of the time.

The status was reporting socket transitions when what a reader wants to know is
whether posts are still coming. So now: a drop is only reported if it has not
repaired itself within `RECONNECT_GRACE_MS` (2.5s), and the line counts what has
actually arrived (`state.conn.bump()` per delivered event). `selectFeed` calls
`stop()` so a stale timer from an abandoned feed cannot fire over the new one.

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
