# dweet — dweet.mino.mobi

<!-- HAND-OWNED. Repo-wide rules live in ../../CLAUDE.md; this surface's host
     worker is documented in ../CLAUDE.md. -->

A feed of **140-character animations**, and a place to write one. Each dweet is
the body of a function called 60 times a second over a 1920×1080 canvas, stored
as a `com.minomobi.dweet.dweet` record in its author's own repo.

It is the dwitter.net form, moved onto ATProto — and the move is not decorative.
At 140 characters the *entire artwork* fits inside a firehose event, so tailing
Jetstream **is** the feed. Nothing is fetched to render a card, nothing is
stored to remember one.

## Facts

| | |
|---|---|
| Endpoint | `dweet.mino.mobi` |
| Dir | `bsky/dweet/` |
| Worker | **`bsky`** — a second `custom_domain` route, *not* a second worker |
| Owning branch | `claude/bsky-app-view-feasibility-8sdflz` |
| Deploy | [`deploy-bsky.yml`](../../.github/workflows/deploy-bsky.yml) |
| Lexicon | [`../lexicons/com.minomobi.dweet.dweet.json`](../lexicons/com.minomobi.dweet.dweet.json) |
| Scope | `atproto repo:com.minomobi.dweet.dweet` — that alone |

**It shares the `bsky` worker because the account is at its worker cap.** An
extra custom-domain route costs nothing; an extra worker was not available.
`../worker.js` maps only this host's bare `/` to `/dweet/index.html` — narrow on
purpose, because rewriting every path would shadow `/packages/*` and `/lib/*`,
which this page imports from the same asset root the AppView uses.

> ⭐ A deploy must bind **both** patterns. If the log shows
> `bsky.mino.mobi (custom domain)` but not `dweet.mino.mobi (custom domain)`,
> this surface is not live however green the run was.

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

## Why the limit stays at 140

Not nostalgia — architecture. A record small enough to ride inside a firehose
event needs no index to read. Raise the limit and cards must be fetched;
fetching needs an index; an index is the backend this surface and the AppView
beside it both exist to do without. The constraint that makes the art form also
makes the architecture free.

Counting is by **grapheme**, not UTF-16 code unit, matching the lexicon's
`maxGraphemes` and what a person typing actually perceives. `countChars()` uses
`Intl.Segmenter`; the selftest pins the emoji case.

## Files

| | |
|---|---|
| `sandbox.js` | the execution boundary. Read its header first |
| `sandbox.selftest.mjs` | asserts the isolation invariants; preflight runs it |
| `app.js` | feed (Jetstream) + composer (auth) + remix counts (Constellation) |
| `seeds.js` | the house set, shown when the wire is quiet |
| `index.html` | shell and styles |

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

- **The feed starts empty and that is correct.** A brand-new lexicon has no
  volume. `app.js` asks for the full 36h replay window and falls back to the
  house set after four seconds of silence. Seeds are marked `local: true`,
  carry no `at://` URI, and cannot be remixed onto — nothing should ever imply
  they are records.
- **Only visible dweets run.** An `IntersectionObserver` starts and stops
  frames. A column of 60fps canvases all animating at once is the one way this
  page could be heavier than the AppView it shares a worker with.
- **Every run gets a new frame.** Re-running destroys and rebuilds, which is
  also the cheapest guarantee that one dweet cannot leave state for the next.
- **Records off the wire are data, never markup.** `src` goes to a `<pre>` as
  `textContent` and to the frame by `postMessage`. A record that fails
  `validate()` is dropped, not repaired.
- **Scope is fixed at authorization**, so a session minted on another
  `*.mino.mobi` site may not cover this collection. The composer calls
  `ensureScope()` from the click, because the redirect needs a user gesture.

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
- Every seed was rendered frame-by-frame and eyeballed before being committed.

**Not verified:** anything requiring a real session. No `createRecord` has ever
run from here, so posting, `ensureScope` escalation and the remix `at-uri` are
code-complete and unobserved. The Jetstream tail is also unproven in a browser
— this sandbox's proxy refuses the WebSocket upgrade, so the feed has only ever
been seen in its house-set fallback. Both are the same gaps the AppView next
door records, for the same reasons.
