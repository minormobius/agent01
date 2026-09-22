# dweet — dweet.mino.mobi

<!-- HAND-OWNED. Repo-wide rules live in ../../CLAUDE.md; this surface's host
     worker is documented in ../CLAUDE.md. -->

A feed of **256-character animations**, and a place to write one. Each dweet is
the body of a function called 60 times a second over a 1920×1080 canvas, stored
as a `com.minomobi.dweet.dweet` record in its author's own repo.

It is the dwitter.net form, moved onto ATProto — and the move is not decorative.
At this size the *entire artwork* fits inside a firehose event, so tailing
Jetstream **is** the feed. Nothing is fetched to render a card, nothing is
stored to remember one.

## Facts

| | |
|---|---|
| Endpoint | **`bsky.mino.mobi/dweet/`** — a path, not a subdomain (see below) |
| Dir | `bsky/dweet/` |
| Worker | **`bsky`** — a second `custom_domain` route, *not* a second worker |
| Owning branch | `claude/dwitter-animation-feed-rufn9o` |
| Deploy | [`deploy-bsky.yml`](../../.github/workflows/deploy-bsky.yml) |
| Lexicon | [`../lexicons/com.minomobi.dweet.dweet.json`](../lexicons/com.minomobi.dweet.dweet.json) |
| Scope | `atproto repo:com.minomobi.dweet.dweet` — that alone. **LIVE** since 2026-09-22 (ceiling 87; a real PAR accepted) |
| Cap | 256 graphemes — which is also the top size **category** (64b/128b/256b, in bytes) |

**It shares the `bsky` worker, and it is a PATH rather than a subdomain.** The
first version of this file said an extra custom-domain route "costs nothing".
That was wrong, and run #43 proved it:

```
✘ Trigger configuration for "bsky" was only partially updated:
    You have exceeded the limit of 100 Workers custom domains
    on zone 'mino.mobi'  [code: 100122]
```

A `custom_domain` route spends one of **100 custom domains per zone**, and the
zone is full. That is a different cap from the worker count, which is what the
design originally blamed. Worse, the bind fails at the TRIGGER step *after* the
assets upload — so the run goes red while the new assets are already live, and
stays red on every push while an unbindable route sits in `wrangler.jsonc`.

So the route is removed and dweet lives at `bsky.mino.mobi/dweet/`.
`../worker.js` keeps a hostname dispatch for `dweet.mino.mobi`, **inert** until
the hostname exists.

**There is a way out of the cap, and it needs one thing first.** A plain route
(`{ pattern, zone_name }`, no `custom_domain`) is capped at 1000 per zone rather
than 100 — so the ceiling is not really the blocker. But a plain route does NOT
create DNS: it only matches a hostname that already resolves through
Cloudflare's proxy, and `dweet.mino.mobi` has no DNS record at all. Adding the
route alone would give a **green deploy and a dead hostname**. Order: proxied
DNS record, then the route, then verify the host serves. Full write-up in
`docs/DEPLOYS.md` §4. The dispatch is deliberately narrow — only that host's
bare `/` — because rewriting every path would shadow `/packages/*` and `/lib/*`,
which this page imports from the same asset root the AppView uses.

## Read this before touching a frame

This surface executes **a stranger's code, in the reader's browser**. On
dwitter.net that is merely bold. Here it would be an account takeover, because
of three facts about our own infrastructure:

| | |
|---|---|
| `workers/auth/src/index.ts:132` | the SSO cookie is `Domain=.mino.mobi` |
| `workers/auth/src/index.ts:57` | the origin allowlist has a `*.mino.mobi` wildcard |
| `workers/auth/src/index.ts:431` | `/pds/repo/createRecord` is `needsAuth: true` |

So a dweet running in *this document* could write to the reader's PDS as the
reader, across every collection in `WRITE_COLLECTIONS`:

```js
fetch('https://auth.mino.mobi/pds/repo/createRecord',
      {method:'POST',credentials:'include',body:…})
```

`HttpOnly` does not help — the code never reads the cookie, it just makes the
browser send it. `SameSite=Lax` does not help — this host to `auth.mino.mobi`
is same-site. A dweet whose payload is *posting itself* would be a worm with a
feed for a vector.

[`sandbox.js`](sandbox.js) is the answer and its header is the long version.
Four properties, in the order they matter:

1. **Opaque origin.** `sandbox="allow-scripts"`, **never** with
   `allow-same-origin`. Those two together are not a stricter sandbox, they are
   none: a frame holding both can reach its parent and delete its own sandbox
   attribute.
2. **`default-src 'none'`** inside the frame, with no `connect-src`. No fetch,
   no WebSocket, no beacon. `'unsafe-eval'` is present and is *not* a weakening
   — arbitrary evaluation is the product; the CSP is here for the network.
3. **No injection surface.** `harnessDoc()` is a constant. The dweet is never
   interpolated into the document — it arrives by `postMessage` after load. A
   dweet containing `</script>` is therefore boring rather than a breakout.
4. **A terminable thread.** The dweet runs in a **Worker** on an
   **OffscreenCanvas**, and the frame kills it with `terminate()` if it stops
   acknowledging ticks.

### Why the dweet is not run on the frame's own thread

Because removing a hung iframe does not stop it, and the first version of this
file got that wrong. `while(1)` is seven characters. Measured in Chromium:

| sequence | result |
|---|---|
| a plain dweet, then anything | fine |
| `while(1)`, then a **glsl** dweet | the second one is killed too |
| `while(1)`, then a plain **js** dweet | also killed |

The runaway keeps its renderer thread, and every sandboxed frame created
afterwards is allocated into that same starved process. **One nine-character
dweet poisoned every dweet for the rest of the session**, while the watchdog
removed the element and reported success. The page was already dead.

`Worker.terminate()` is the only primitive in the platform that reliably aborts
a running loop. So:

- the dweet runs in a worker, drawing to an `OffscreenCanvas` transferred from
  the frame;
- the **frame** drives the clock, one tick per `requestAnimationFrame`, and
  will not send the next tick until the worker acks the last — which bounds the
  queue and makes a stall unambiguous;
- the frame's own thread stays responsive however hard the worker spins, so it
  is the thing that can act, and it terminates the worker after `WATCHDOG_MS`.

Verified: after a `while(1)`, the next dweet — js or glsl — runs clean.

**Measure liveness on a clock, never on a frame count.** An earlier version
beat every 30 frames, which reaps a dweet that is merely expensive; it killed
the glsl seed under software rasterisation and would kill a heavy shader on a
weak phone.

**And keep the budget generous — 6s, not 2.5s.** This cost a second
measurement. At 2500ms the `ribbon` seed (121 characters, measured at
**0.6 ms/frame**) was reaped in the feed while passing in isolation. Nothing was
wrong with it: five cards were mounted and two were full-screen shaders being
rasterised in software, which starved the 2D worker past its deadline. That is
the watchdog's blind spot — **it cannot tell "stuck" from "starved by its
neighbours"**, and on a weak phone the second is ordinary. So the budget sits
where no legitimate single frame could land, and what it actually detects is the
case that matters: a dweet that never acknowledges a frame at all. `while(1)` is
still caught, six seconds later, costing one worker.

The other half of that fix is in `app.js`: the IntersectionObserver uses
**`rootMargin: 0`**. Pre-warming a card off-screen sounds friendly and is not —
a 16:9 card is most of a phone screen, so a 200px margin had three dweets
animating at once.

**Pause is not teardown.** A card scrolled out of view is paused and resumed
constantly, and a terminated worker cannot be restarted — so `dweet:pause` stops
the ticks while `dweet:stop` kills the worker, and only the latter runs when a
frame is being discarded. `destroy()` sends the kill *before* removing the
element, because removing it is precisely what does not work.

Running in a worker also tightened isolation for free: there is no `window`,
no `document` and no `parent` in there at all, so a dweet reaching for the DOM
now gets `parent is not defined` rather than a cross-origin refusal.

`sandbox.selftest.mjs` asserts all four and preflight runs it. **If a change
makes it fail, revert the change — do not relax the test.**

```bash
node bsky/dweet/sandbox.selftest.mjs
```

## The two languages, and why not a third

`lang` is `js` or `glsl`. Both are hand-golfable and both are *readable*, which
is the whole point: a dweet is read as often as it is run, and the social act
here is remixing — golfing three characters off someone's piece and spending
them on something prettier. That only works when the source **is** the post.

**Do not add WASM or any compiled target.** It would mean posting build output:
unreadable, unremixable, and no faster in practice. Performance is not the
bottleneck at this size — you cannot write a hot loop in 140 characters
expensive enough to beat the cost of rasterising it. `glsl` is where the real
headroom lives, per-pixel on the GPU, and it costs none of the legibility.

| | js | glsl |
|---|---|---|
| body of | `u(t)` at 60fps | `main()` |
| time | `t` seconds | `t` seconds |
| helpers | `S` `C` `T` sin/cos/tan, `R(r,g,b,a)` | — |
| surface | `c` canvas, `x` 2d context | `r` resolution, `FC` fragcoord |
| output | draw on `x` | `o`, a `vec4` |

The 2D canvas is **not auto-cleared between frames**, exactly as on dwitter.
Trails are the default and clearing costs you characters — `c.width|=0` is the
standard ten-character sacrifice. Half the idiom of the form comes from this.

## The cap is 256, and the tiers are the interesting part

**256 graphemes, not dwitter's 140.** The number does three jobs at once:

1. **A whole sketch fits in one Bluesky post, with a tag *and* a permalink.**
   A post is 300 graphemes; `256 + " #dweet" (7) + a permalink (~32) = 295`.
   280 was considered and rejected for exactly this: it fits the tag (287) but
   not the link (319).
2. **It *is* the top size category**, so every ASCII sketch lands in a named
   demoscene tier with no escape hatch. `open` becomes reachable only by
   spending multi-byte characters — which genuinely do cost more bytes — so the
   ladder stays honest instead of decorative.
3. **It is a power of two**, which is the tradition's own unit.

`sandbox.selftest.mjs` pins all of that arithmetic. If `MAX_CHARS` ever rises
again, the `code + tag + permalink also fits` assertion is the one that should
stop it.

**The architectural claim is unaffected.** It was never about 140, or 256 — only
about being small enough to ride whole inside a firehose event, so the feed
needs no index. Raise it to a kilobyte and the argument starts to bend; 256 does
not touch it.

### Size categories, after the demoscene

Borrowed from [demosky.app](https://demosky.app), which badges sketches
`64b / 128b / 256b / …` with no hard limit at all — the 256-byte-intro
tradition, where the tier is the achievement rather than the ceiling.

| | counted in | why |
|---|---|---|
| the **cap** (280) | graphemes | it is what a person types against, and what `maxGraphemes` means |
| the **tier** (64b/128b/256b) | UTF-8 bytes | it is what the tradition measures, and what the record costs |

Two units on purpose. For ASCII — which golfed code nearly always is — they
coincide, so the distinction only shows up for someone doing Unicode tricks,
where bytes is the honest number. Above 256 bytes the tier reads `open`.

### 140 survived as a badge, and it earns its keep

A `js` dweet of 140 graphemes or fewer uses *exactly* dwitter.net's own
namespace, so it can be pasted there and will run. That is an **interop fact**,
not nostalgia, and `dwitterPortable()` surfaces it as a `dwitter` chip. `glsl`
never qualifies — dwitter has no shader harness.

## Both GLSL dialects run here

`wrapFragment()` in `sandbox.js` accepts either vocabulary, chosen by whether
the source defines a top-level `mainImage`:

| | ours | Shadertoy / demosky |
|---|---|---|
| shape | bare body of `main()` | `void mainImage(out vec4, in vec2)` |
| time | `t` | `iTime`, `u_Time` |
| resolution | `r` | `iResolution` |
| fragcoord | `FC` | the second parameter |
| output | `o` | the out parameter |
| also | `PI` | `PI` |

The head declares **all** of it — an unused uniform is free — so a sketch may
mix the two. This is what makes us a superset rather than a competitor: a
demosky sketch pastes in and runs, and the `interop` seed is exactly that, kept
in their dialect on purpose so a regression in the shim breaks a visible card.

One deliberate improvement: demosky hardcodes
`const vec2 iResolution = vec2(512.0)`, so a sketch there cannot know its
viewport. Here it is a real uniform carrying the true canvas size. A sketch that
only *reads* it is unaffected; one that used it in a constant expression would
not compile, and that is the single known incompatibility.

**`wrapFragment` is defined once** and injected into the worker with
`.toString()`, so the function the selftest exercises is the function that
ships. It must stay closure-free; the selftest asserts that.

## captureTime

Also from demosky, and the best small idea they have. The composer records where
the live preview happened to be when you pressed post — no separate "capture"
gesture, because one more button to get a good thumbnail is a button nobody
presses — and stores it as integer milliseconds.

A card then draws **that one frame** while paused, so a scrolled-past dweet
shows the moment its author framed rather than whatever `t=0` looks like — which,
for anything that draws itself over time, is an empty canvas. Resuming carries
on from the same moment, so there is no jump.

Integer milliseconds, not a float of seconds: the lexicon language has no float,
and demosky's own `captureTime` is a *stringified* float, which is a worse
contract than picking a unit.

## Files

| | |
|---|---|
| `sandbox.js` | the execution boundary. Read its header first |
| `sandbox.selftest.mjs` | asserts the isolation invariants; preflight runs it |
| `app.js` | feed (Jetstream) + composer (auth) + share sheet + remix counts |
| `share.js` | what a Bluesky post of a dweet *is* — pure, so the budgets are testable |
| `share.selftest.mjs` | grapheme budgets, UTF-8 facet offsets, the still picker |
| `gif.js` | animated-GIF encoder: median cut, Bayer dither, LZW. No dependencies |
| `gif.selftest.mjs` | encodes, then DECODES with an independent reader, and compares |
| `video.js` | the MOVING post: MediaRecorder → the Bluesky video service → `presentation: "gif"` |
| `video.selftest.mjs` | codec selection, the MP4 box walker, the job state machine, polling |
| `event.js` | one place that knows the Jetstream wire shape |
| `event.selftest.mjs` | pinned to a payload captured off the live firehose |
| `seeds.js` | the house set, shown when the wire is quiet |
| `index.html` | shell, styles, and the two sheets |

## Data sources

| Question | Answered by | Auth |
|---|---|---|
| what dweets exist | **Jetstream v2**, filtered to the one collection | none |
| who made it | the public AppView, profile hydration only | none |
| how many remixes | **Constellation** on `com.minomobi.dweet.dweet` + `.remixOf` | none |
| posting | the shared OAuth worker, one narrow scope | session |

`remixOf` being an `at-uri` is what makes the remix tree free: it is an ordinary
backlink, so the global index answers "what came from this" without us storing
an edge anywhere.

## Quirks

- **Refresh stays on `/dweet/`.** `show()` used to `history.replaceState` a
  hardcoded `'/'`, written when the plan was a subdomain of its own — so at
  `bsky.mino.mobi/dweet/` every tab switch rewrote the URL to the AppView's
  root and a refresh left the surface entirely. The base is now derived from
  `location.pathname`, which is right wherever this is mounted, including if
  the subdomain ever does get bound.
- **The handle field has typeahead**, from the AppView's own `lib/typeahead.js`
  — same asset root, same origin, one implementation, including the abort race
  and the ARIA combobox roles. It replaced a `prompt()`, which has no
  completion, no validation and nowhere to say what is being consented to.
  `doSignIn()` calls `typeahead.close()` FIRST: a debounced request fired just
  before Enter otherwise lands afterwards and drops its menu over the sheet,
  where it silently intercepts the taps meant for the button underneath. That
  bug was live on the AppView until a click test caught it.
- **The feed starts empty and that is correct.** A brand-new lexicon has no
  volume. `app.js` asks for the full 36h replay window and falls back to the
  house set after four seconds of silence. Seeds are marked `local: true`,
  carry no `at://` URI, and cannot be remixed onto — nothing should ever imply
  they are records.
- **Only visible dweets run**, with no `rootMargin` — see the watchdog note. A
  column of 60fps canvases all animating at once is the one way this page could
  be heavier than the AppView it shares a worker with, and it was also what
  tripped the watchdog on an innocent sketch.
- **Every run gets a new frame.** Re-running destroys and rebuilds, which is
  also the cheapest guarantee that one dweet cannot leave state for the next.
- **Records off the wire are data, never markup.** `src` goes to a `<pre>` as
  `textContent` and to the frame by `postMessage`. A record that fails
  `validate()` is dropped, not repaired.
- **Scope is fixed at authorization**, so a session minted on another
  `*.mino.mobi` site may not cover this collection. The composer calls
  `ensureScope()` from the click, because the redirect needs a user gesture.

## The socket had never once connected

Reported as *"I appear to be disconnected always"*, and it was not the status
line being pessimistic. `app.js` passed `kinds: [KIND.COMMIT]`. **The constants
are lowercase** — `KIND.commit` — so the value was `undefined`, which
stringifies into a query parameter perfectly happily. Measured against the live
host on 2026-09-22:

```
?collections=com.minomobi.dweet.dweet&kinds=undefined
  -> 400 {"error":"InvalidRequest",
          "message":"subscribe: invalid options: unknown kind \"undefined\""}
?collections=com.minomobi.dweet.dweet&kinds=commit
  -> 426   (i.e. the options were fine; it only wanted a real upgrade)
```

The rejection happens **before the WebSocket upgrade**, so there is no open
socket, no error event on the wire, and nothing to see except a reconnect loop
whose backoff grows to 30s. This surface therefore never received a single
event from the day it shipped. One character of case.

Two fixes, because one of them would have caught it and the other makes the
whole class loud:

- `packages/atproto/jetstream.js` **throws** on a kind the server does not
  know, naming the value and listing the valid ones. `connect()` builds the URL
  inside its `try`, so this reaches the caller's `onError` instead of looking
  like an unreachable host. `packages/atproto/jetstream.selftest.mjs` pins it,
  along with the rest of the query string — the collection cap, the
  inclusive-seq cursor, and `since` clamping to the 36h window.
- the status line stopped reporting socket transitions. See below.

### …and it would still have been empty, because the payload is FLAT

The socket fix alone would not have shown a single dweet. The handler began:

```js
const commit = payload?.commit;
if (!commit || commit.operation !== 'create') return;
```

and **there is no `payload.commit`**. A v2 payload, captured off the live wire
2026-09-22, is flat:

```json
{ "$type": "network.bsky.jetstream.subscribeEvents#commit",
  "did": "did:plc:…", "collection": "app.bsky.feed.post",
  "rkey": "3mw4nco5knc25", "rev": "3mw4ncoxwsq2j", "cid": "bafyrei…",
  "operation": "create", "record": { … },
  "seq": 26210877813, "time": "2026-09-22T16:25:42.157412Z" }
```

Two independent bugs, one symptom, and **either alone empties the feed**. The
AppView next door reads the flat shape correctly (`onLiveEvent`), and so does
`eventUri()`; only this surface read it as nested.

The confusion has a real source, and `bsky/CLAUDE.md` records the same mistake
made in the *other* direction: the ARCHIVE's snapshot events genuinely are
nested (`{did, seq, time, kind, commit:{operation, collection, rkey, rev, cid,
record}}`), and the archive paths once read `evt.collection` and silently
discarded 16,234 events. Two shapes, one field name, and both failures are
silence.

So the wire format now lives in **one file**, `event.js`, with
`event.selftest.mjs` pinned to a payload captured from the live firehose —
including a real delete, which carries no `record` and no `cid`. The test
asserts the nested shape comes back `null` rather than half-parsed, because a
half-parse is a dweet with no source, which is worse than nothing.

`dweetFromEvent` also fixed two things the old handler got wrong and one it
did not do at all: a missing `createdAt` now falls back to the EVENT's time
rather than to *now* (which sorted old replays to the top), `update` is
accepted (an edited dweet is still a dweet), and **deletes are honoured** —
`cards` maps `at://` to element, the frame is destroyed before the element is
removed, and the withdrawn dweet leaves the feed.

### The status line was lying in both directions

`onDisconnect` went straight through to *"disconnected — retrying"*. That is
the same bug the AppView next door fixed in `connectionStatus()`, and the same
fix is ported here: a drop is only reported if it has not repaired itself
within `RECONNECT_GRACE_MS` (2.5s), because **a Jetstream socket ending is
normal** — a replay finishing, an idle timeout, a host rotation.

But dweet needed a third state the AppView does not. This socket is filtered to
**one** collection, and that collection is new, so *connected and silent* is
the correct state for hours at a time. A line that can only say live or dead
has no way to say that, and silence reads as failure. So it says it:

| | |
|---|---|
| connected, nothing seen | `live · tailing com.minomobi.dweet.dweet — nothing posted yet` |
| connected, events flowing | `live · N dweets seen` (counted per delivered event) |
| dropped, inside the grace | *nothing changes on screen* |
| dropped, past the grace | `reconnecting…` |
| never connected, 3+ attempts | `cannot reach the firehose — still retrying` |

That last row exists because "connecting…" that never resolves is its own
answer and the page should give it rather than spinning forever.

### Verified against the real firehose, and then against the real path

Both halves, 2026-09-22, and the first one settles a caveat this repo has
carried for weeks — **this sandbox can open a WebSocket after all**, given
`NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`:

```
kinds=undefined  opened=false  ERROR Received network error or non-101 status code
kinds=commit     opened=true   still open after 8s, 0 events
```

That is the A/B, over a real socket, of exactly the two URLs the code built
before and after. The zero events on the good one is not a failure: nothing
has posted to this collection yet, which is the state the status line now has
words for. The post firehose over the same transport gives **456 events in
10s — 47/s, 43 KB/s**, matching the 40/s and 37 KB/s `measure-firehose.yml`
recorded from a runner.

Then the whole feed path in Chromium, with `routeWebSocket` standing in for
Jetstream and serving real-shaped v2 messages: the client's own URL carries
`kinds=commit`, the status reads **live · 2 dweets seen** with a green dot, two
cards render, **a duplicate is deduped** (delivery is at-least-once), a record
over the cap is **dropped not truncated**, an `app.bsky.feed.post` event is
ignored, the house seeds are hidden once real work arrives, a **delete removes
its card and its iframe** leaving exactly one behind, and there are no page
errors. A deliberately broken shader in that run rendered
`compile: ERROR: 0:2: 'S' : no matching overloaded function found` inside its
own frame, which is the fault path working.

## Sharing a dweet — and why it is not a GIF

`share.js` (pure), `gif.js` (pure), the capture path in `sandbox.js`, and the
share sheet in `app.js`. A **share** button sits on every card and in the
composer.

### The measurement that decided the design

The obvious idea is to attach the animated GIF to the post. It does not work,
and these are the three facts, measured 2026-09-22 rather than recalled:

- **The AppView never hands out the blob you uploaded.** It hands out a
  `cdn.bsky.app/img/...` URL, and that CDN is a **transcoder**. The bare URL
  as the API returns it answers `image/webp`; `@jpeg` answers `image/jpeg`;
  `@png` answers `image/png`. The output format is chosen by the reader's
  client, so the uploaded bytes are not what anybody sees.
- **The official composer re-encodes every picture to JPEG before upload**
  (`social-app/src/state/gallery.ts`: `format: SaveFormat.JPEG`).
- **Motion in the Bluesky app is an external-embed PLAYER on a host
  allowlist** — tenor, giphy, klipy and the video sites
  (`social-app/src/lib/strings/embed-player.ts`). It is keyed on where a link
  points, not on what a file is, so nothing we upload can join it.

The one in-feed animated path is `app.bsky.embed.video`, which needs a
transcode through `app.bsky.video.uploadVideo` at `did:web:video.bsky.app`
with a service-auth JWT — the same wall the AppView records for video posting,
and a real piece of work rather than a mystery. Not done.

**Not verified:** an actual animated-GIF upload, which needs a session this
sandbox cannot mint. Every observable signal says it would be shown as a still;
none of them is the experiment itself.

### So the post is three things

| | |
|---|---|
| **text** | the source, verbatim | 
| **image** | one still, at a moment that is not blank |
| **link** | one tap to the same dweet, running |

The budget is the whole design and it is why the cap is 256: 256 graphemes of
source, two blank lines, and a 22-character shortened link text is 280, inside
Bluesky's 300. **So the source always fits and is never truncated** — a
truncated dweet is not a dweet, it is a typo. The optional credit line
(`"title" · N chars of JavaScript · 256b`) is what gives way, as a whole rather
than trimmed to a stub, and the sheet says which part it dropped.

The link's *text* is short while its facet's `uri` is the real one, which is
exactly how every client shortens a long URL. Facet offsets are **UTF-8
bytes**, not string indices — and golfed JavaScript is full of non-ASCII, so
this is the one place that arithmetic visibly breaks. The selftest builds a
post around `"héllo→✨"` and decodes the byte range back out.

### The permalink carries the dweet, not a reference to it

`?s=<base64url of the source>&l=glsl&t=<title>`. Deliberately **not**
`?at=<uri>`, though that would be canonical: a record URI needs a DID document
lookup, a PDS round trip, and a record that has actually landed — three ways
for a shared link to be dead in the first minute after posting, which is the
minute it gets clicked. The source is 256 characters and fits in a query
string, so the link is true offline, true for a draft that was never posted,
and true for a house seed that is not a record at all.

Arriving with one pins that dweet **above** the feed in its own container, so a
live dweet landing a second later cannot push the thing somebody clicked on off
the top, and it plays immediately — arriving at a still of the thing you
clicked to see move would be the wrong first second.

### Capture: pixels come OUT of the sandbox

`captureFrames()` in `sandbox.js`, plus a `grab` message in the worker.

The dweet's pixels leave the sandbox as raw RGBA and the parent writes them
into a canvas or a GIF. **Nothing was relaxed for it** — no sandbox token, no
CSP source — because pixels are data and nothing on the way out is evaluated.
`sandbox.selftest.mjs` asserts exactly that, alongside the two guards that
matter: only `window.parent` may send a capture, and a capture is refused if
the frame has already `started`, so it can never become a second program inside
a card that is playing.

A capture gets its **own throwaway frame**, for three reasons and the third is
the one that bites:

- a card that is playing must not stutter because somebody pressed share;
- the clock has to be arithmetic, not rAF, or the same dweet exports
  differently on a fast machine and a slow one;
- and a frame runs exactly one program for its whole life, so re-using a card's
  frame would be refused — *silently*, because `started` is already true.

Downsampling happens **inside** the worker: a full frame is 1920×1080×4 =
8.3 MB and a capture is dozens of them, all crossing a postMessage boundary.
`downsample()` is hoisted out and injected by `.toString()`, the same way
`wrapFragment` is, so its three silent failures are unit-tested rather than
observed as a picture:

- **the flip.** `gl.readPixels` is bottom-up and `getImageData` is top-down, so
  a shader captured without the flip exports upside down while looking
  perfectly correct live.
- **empty boxes.** Without the `max(y0+1, …)` guard a box can be zero-high, the
  divide gives NaN, and a `Uint8ClampedArray` stores NaN as 0 — a black speckle.
- **averaging at all.** Point-sampling 1920 down to 320 throws away five pixels
  in six, which for a shader of thin bright lines is the difference between an
  animation and a field of flicker.

320×180 and 1280×720 are not round numbers picked for looks: 1920/320 = 6 and
1080/180 = 6 exactly, so the box filter is a clean 6×6 average.

### The still was black, and the fix is a measurement

The first working capture produced a **perfectly black 1280×720 still** — 0 lit
pixels of 921,600. Not a capture bug. The house heartbeat's loop is
`for(a=t%8;a>0;a-=.01)`, which **at t=0 runs zero times**. A dweet that draws
nothing at the start is the common case, not an edge.

A fixed non-zero default would have been a guess. Instead the sheet captures
**four candidates three seconds apart** in one compile and `pickStill()` chooses:

1. **if candidate 0 has anything in it, take it** — that is the author's own
   `captureTime`, a moment they chose on purpose, and a busier later frame is
   not a reason to overrule them;
2. otherwise take the **fullest** of the rest. Progressive-draw sketches
   accumulate, so the fullest is also the most finished-looking; first
   non-blank caught the heart one quarter drawn.

The 12-second window is itself measured against a real sketch: the heartbeat
redraws over an **eight**-second cycle, so anything shorter only ever catches a
partial heart. Brightness is sampled on a **prime** stride so a regular pattern
— a grid, a column of bars — cannot alias into "empty", and the threshold is
generous so a dark sparse sketch is kept rather than hunted past. If every
candidate is under it, the first is used and the sheet *says* the dweet draws
almost nothing, instead of showing a black rectangle that reads as a fault.

### The GIF

`gif.js`: a 5:5:5 histogram, median cut to a global palette, a 32768-entry
nearest-colour cache, Bayer 4×4 ordered dithering, and GIF's variable-width
LZW in 255-byte sub-blocks. Defaults to 320×180, 25 frames at 12.5fps, 128
colours. Measured output for the house heartbeat: **77 KB**.

Two details that are not arbitrary:

- **Median cut splits the box with the widest channel spread, not the most
  pixels.** One flat background can hold 90% of a frame's pixels and would eat
  the whole palette while the moving part got two entries.
- **The cut is at the weighted median.** Cutting the range at its midpoint
  gives near-empty boxes whenever the distribution is lopsided, which it always
  is.

Dithering is on by default because a shader's gradient banding into stripes is
the commonest ugly GIF, and the amplitude scales with the palette's own step
size — a fixed amplitude does nothing at 256 colours and shreds the image at 16.

**It is verified by decoding, twice, neither time by the encoder.** A broken
GIF encoder does not throw: it writes a file of the right length with a valid
header that renders as coloured static from the byte where the LZW code width
first sheared, and every byte in the shear is a legal byte. So
`gif.selftest.mjs` carries a decoder written from the GIF89a spec and round-trips
known images through it — flat colours exactly, 16,384 pseudo-random pixels
across every code-width step, frame counts, delays and the loop block. Then the
real file is opened by **Chromium's own decoder** and compared pixel by pixel:
40×24, 960 pixels, 0 wrong.

(ffmpeg refuses these files. That is not a finding: the ffmpeg shipped with
Playwright's browsers has **no GIF decoder compiled in** — `-decoders` lists
mjpeg and nothing else — so "Invalid data found" is what it says about any GIF.
Checking the tool before believing the tool saved a day of chasing a bug that
was not there.)

## Posting it MOVING — which does work

`video.js`. The GIF never could animate on Bluesky, for the three measured
reasons above. This does, and it turns on one field in the lexicon:

```
app.bsky.embed.video.presentation   knownValues: ["default", "gif"]
```

`presentation: "gif"` is honoured by the official client — branched on in
`social-app/src/components/Post/Embed/VideoEmbed/index.tsx`, which swaps in
`GifPresentationControls`. So a two-second clip posted this way **autoplays and
loops in the feed with no scrubber**: a dweet, moving, in somebody's timeline.
That is the thing the GIF was reaching for and could not have.

### It needs no worker change, and no credential of ours

Measured 2026-09-22:

```
video.bsky.app  OPTIONS  -> 204, access-control-allow-origin: *
                            allow-headers authorization,content-type
getUploadLimits unauthed -> 401 {"canUpload":false,"error":"missing_token"}
uploadVideo     unauthed -> 401 {"error":"missing token"}
```

CORS `*`, so **the browser uploads directly** — no relay, and this surface's
worker never sees the bytes. The credential is the reader's own: their PDS
mints a service-auth JWT with `aud: did:web:video.bsky.app` and
`lxm: com.atproto.repo.uploadBlob`, exactly what the official client asks for.
`/pds/server/getServiceAuth` is already on the auth worker's allowlist with
`repoScoped: false`, and `rpc:com.atproto.server.getServiceAuth` is already in
`RPC_SCOPES` and therefore in the live ceiling. **Nothing to deploy.** The page
asks for that scope only when the reader chooses a moving post.

### Not ffmpeg, and the reason is size

ffmpeg in a browser means ffmpeg.wasm: ~25 MB of download before a single frame
is encoded, on a page whose whole premise is that the artwork is 256 bytes. The
browser already ships an encoder, usually a hardware one, and `MediaRecorder`
is the two-line way to reach it.

WebCodecs `VideoEncoder` is the other route and beats MediaRecorder in one
respect — it runs faster than real time, where a stream is paced by the clock,
so a 2s clip currently takes 2s to record. It loses on two: it emits raw H.264
chunks with **no container**, so it needs an MP4 muxer we would have to write
and keep correct, and it is absent in more browsers (including, notably, the
Chromium in this sandbox — `VideoEncoder` is `undefined` there under every flag
combination tried). If the pacing ever becomes the complaint, WebCodecs plus a
muxer is the upgrade. ffmpeg is not.

### `isTypeSupported` lies, so the file is opened and asked

This is the trap, and it would have shipped. Measured in Chromium 1194:

```
MediaRecorder.isTypeSupported('video/mp4')                -> true
MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')    -> false
…and the file it then writes: ftyp isom, stsd sample entry `vp09`
```

That file is an mp4 by extension, by mime type, and by
`app.bsky.embed.video`'s own `accept: ["video/mp4"]`. **Nothing downstream
would have caught it** before a transcoder expecting H.264 did.

Two defences, because either alone is wrong:

- **Ask for the codec by name.** `MP4_TYPES` are all explicit `avc1` strings.
- **Then check what came back.** `mp4Codec()` walks
  `moov > trak > mdia > minf > stbl > stsd` and reads the sample entry's type,
  which IS the codec. `recordMp4` rejects anything that is not `avc1`/`avc3`
  with a message naming what it got.

The second exists because refusing the bare type outright is the safe-*looking*
choice and is wrong in the direction that matters: a browser accepting only the
short form is quite likely a Safari, which is most of this surface's traffic,
and "no H.264 encoder" would be a false negative it could do nothing about. So
`pickMimeType` returns `{type, certain}`, an uncertain pick is still tried, and
the **output** is the arbiter. Verified against a real recording from this
Chromium: `mp4Codec()` returned `vp09`, which is the upload it would have
blocked.

### Everything is checked before anything is spent

`getUploadLimits` runs **before** the recording, because a daily video quota
discovered after two seconds of recording and thirty of transcoding is the
worst possible moment — the same principle as the shuffle composer checking its
blob scope while nothing is at stake. The scope escalation happens before that
again, since `ensureScope` redirects and a redirect between an upload and its
record would leave an orphan blob, burn a quota slot and lose the author's text.

`awaitJob` honours the lexicon's own rule — *"All values not listed as a known
value indicate that the job is in process"* — so an unrecognised state means
**keep waiting**, not fail. Reading it the other way would abandon good uploads
the day Bluesky adds a stage. It also always ends: a job that never settles
times out saying what stage it reached and that **nothing was posted**, rather
than spinning forever, which is the exact shape of bug the AppView's video
button once had.

### The GIF stays, and stopped depending on a download

The GIF is still the right artifact for everywhere that is not Bluesky — a
chat, a wiki, a README, a Mastodon post. What changed is how it leaves the
page. It used to be a synthetic click on a hidden anchor, which is the classic
way to make a save button that does nothing on a phone: by the time a 2s
recording and an encode have finished, the tap's transient activation is long
gone, and iOS Safari has never handled a programmatic `blob:` download well
regardless. (Chromium still fires it after a 3.5s await — tested — so this is
not a universal failure, which is exactly why it is easy to ship.)

So the GIF is now **put on screen**, and the reader gets the three exits that
work everywhere: the image itself (long-press → Save Image on a phone,
right-click on a desktop), `navigator.share({files})` where the platform takes
it — which on iOS is the share sheet, Photos included — and a **real anchor**
they click themselves, carrying its own activation and needing none of ours.

### Scopes

Sharing needs `repo:app.bsky.feed.post` and `blob:image/*` on top of the dweet
collection. **Both are already in the live ceiling** — verified 2026-09-22
against `auth.mino.mobi/client-metadata.json`: 87 collections, both present —
so this needed **no deploy of `workers/auth`**. A moving post adds
`rpc:com.atproto.server.getServiceAuth`, which is likewise already in the
ceiling. But a scope is only granted if it is asked for, and a session minted
for the dweet collection alone does not have any of them, so `postToBsky()`
calls `ensureScope()` **from the click** with whichever set the chosen mode
needs — before anything is spent, rather than between an upload and the record.
A redirect in that gap would leave an orphan blob, burn a video quota slot and
lose the author's text.

## Posting: shipped

`com.minomobi.dweet.dweet` went live on 2026-09-22 — the auth owner
(`claude/browser-cad-ideation-ollmd3`) took the hunk and deployed it. Live
ceiling is **87 collections**, the `com.minomobi.cad.*` family intact, and a
real PAR against `bsky.social` carrying `atproto repo:com.minomobi.dweet.dweet`
came back with an `authUrl` — which is the check that proves the authorization
server agrees, not just that the metadata says so.

What follows is kept because it is the protocol for the NEXT collection anyone
here needs.

### How that request was made

`com.minomobi.dweet.dweet` is in `workers/auth/src/oauth/scope.ts` on this
branch, and the gate is green:

```
live ceiling: 86 collections · this tree: 87
adding: com.minomobi.dweet.dweet
✓ no live scope would be dropped
```

**The `auth` surface is owned by `claude/browser-cad-ideation-ollmd3`, so a push
from here deploys nothing for it** — which is the correct state, not an
oversight. `workers/auth/CLAUDE.md` documents the protocol verbatim: *"Other
branches add a collection to `WRITE_COLLECTIONS` on their own tree and then ask
the owner to deploy, because only the owning branch's push deploys."* So the ask
is one line, and that file's own checklist is the acceptance test:

| its rule | here |
|---|---|
| the diff only inserts | vs the owner: **nothing removed**, added exactly `com.minomobi.dweet.dweet` |
| additive vs `main` | **nothing removed**; +7 (their 6 `cad.*` and this one) |
| `check-auth-scope` green | ✓ above |
| origins preserved | 31 = 31, none dropped |
| `tsc --noEmit` | clean |

**Do not take the auth surface to ship this.** That file records what ownership
churn costs: run #38 deployed a stale tree and took the ceiling 66 → 61 in one
green build, breaking sign-in on four sites. And this branch was itself 102
lines behind the owner across `src/index.ts` and `src/oauth/flow.ts` — the fix
that stopped a `refresh_token` grant per request from revoking token families
and killing live sessions. **`check-auth-scope` would have gone green while that
regressed**, because it guards the ceiling and not the code. The auth tree here
was therefore taken byte-identical from the owner first, and only then added to.

Until it ships, dweet reads, renders, previews and remixes; sign-in cannot grant
its scope, so nothing can be posted. `client-metadata.json` is also edge-cached
at `max-age=60` and the authorization server caches independently, so allow a
minute after that deploy before concluding it failed — and confirm with a real
PAR, per the auth docs.

## Moderation

Executable posts from strangers. Nothing autoplays off-screen, and the sandbox
is the hard boundary — but the social layer is deliberately unbuilt. Before this
is promoted anywhere: no auto-run from accounts the reader does not follow, and
a report path. ATProto labelers apply to these records like any other.

## What was actually verified

Driven in headless Chromium against the real surface (2026-09-21), not reasoned
about:

- **The attack is blocked.** A real 91-character payload —
  `fetch('https://auth.mino.mobi/pds/repo/createRecord',{method:'POST',credentials:'include'})`
  — posted through the composer and run. Zero requests reached the auth worker;
  the console carries *"Refused to connect … because it violates the following
  Content Security Policy directive: default-src 'none'"*.
- **The DOM is unreachable** from a dweet: `parent is not defined`.
- **`while(1)` is contained** — the frame reports the hang, the page stays
  responsive, and the next dweet runs normally (this is the regression that
  motivated the worker).
- **A blob: worker inherits the frame's CSP**, so `fetch` is blocked inside it
  too. Probed directly before the rewrite, because if it were false the worker
  design would have handed the dweet its network back.
- **Both languages render**, and feed cards resume after being scrolled away.
- **The interop shim works on a real demosky-dialect sketch** — a top-level
  `mainImage` reading `iTime` and `iResolution` compiles and animates through
  our harness, at a true 1920×1080 rather than their fixed square.
- **`ribbon` at 0.6 ms/frame** — the number that proved the 2.5s watchdog was
  reaping healthy dweets rather than the dweet being slow.
- Every seed was rendered frame-by-frame and eyeballed before being committed.

**Not verified:** anything requiring a real session. No `createRecord` has ever
run from here, so posting, `ensureScope` escalation and the remix `at-uri` are
code-complete and unobserved. The Jetstream tail is also unproven in a browser
— this sandbox's proxy refuses the WebSocket upgrade, so the feed has only ever
been seen in its house-set fallback. Both are the same gaps the AppView next
door records, for the same reasons.
