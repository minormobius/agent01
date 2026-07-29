# BRIEF — probably-have / "Endless You"

## Turn 2 update (this turn)

abeliansoup reported the avatar bug **again**, but this time as 500s "querying
your own domain" — i.e. the `/_img/` proxy this site's first turn built to
dodge canvas tainting — and pointed out that the handle-search dropdown
(`kit.handleInput`, which sets `<img src>` straight to the CDN URL) kept
working the whole time. That's the tell: the `lab` worker's `/_img/` hop
(fetch cdn.bsky.app, re-serve same-origin) is itself flaky, and this page
never had a reason to depend on it.

**Fix:** `loadHandle` now sets `img.src = profile.avatar` directly — no proxy,
no `crossOrigin` attribute. `/_img/` exists only so a canvas *export*
(toBlob/toDataURL) doesn't throw on a tainted canvas; this page only ever
draws to the screen, so tainting is irrelevant and the proxy was pure
unnecessary risk. Removed the `imgProxyPath`/`@jpeg`-append helper turn 1
built entirely to satisfy that now-unneeded proxy. The CSP's `img-src`
already allowlists `https://cdn.bsky.app`, so this needs no worker change.

**If a later turn adds a "save/share as image" button**, that's the one
feature that legitimately needs `/_img/` back (with the `@jpeg`-append logic,
which is still correct for that case) — see the comment left in `loadHandle`.
Until then, don't reintroduce the proxy hop.

## What this is (turn 1)

The requester (abeliansoup) replied to the thread around `take-escher`
("Shoal", a fish tiling) and `more-latter` ("Infinite You", the avatar
version of the same idea): "you're almost there but the avatars are failing
to load. please resolve as a matter of great haste." That's a bug report
against `more-latter`, not a request for a new concept — but the containment
gate only lets a build write inside its own tenant directory, and this
request's slug is `probably-have`, a new one. So this turn is a from-scratch
reimplementation of `more-latter`'s hyperbolic avatar tiling, with the actual
bug found and fixed, rather than an edit to the original.

Shipped this turn: the full `more-latter` design (real {p,q} hyperbolic
reflection tiling via edge-reflection BFS, avatar warped onto each tile via
a per-triangle affine solve, drag-to-pan as one accumulated Möbius isometry,
four preset tilings to cycle through) — plus the avatar fix, which was the
entire point of the request.

## The bug, and the fix

`lab/www/worker.js`'s `/_img/` proxy matches the incoming path against
`CDN_PATH`, a regex that **requires** a trailing `@(jpeg|png|webp)` — it is
not optional. `more-latter`'s `imgProxyPath` (and the kit README's own
example snippet) just splits the profile's `avatar` URL on the literal
substring `cdn.bsky.app/` and passes the remainder straight through. The
checked-in fixture, `lab/_kit/fixtures/getProfile.json`, has an `avatar` URL
with **no format suffix at all**:

    https://cdn.bsky.app/img/avatar/plain/did:plc:.../bafkrei...

(no `@jpeg` on the end). Passed through unmodified, `/_img/` sees a path
that doesn't match `CDN_PATH` and returns `400 not a Bluesky CDN image
path` — which is exactly "the avatar is failing to load." `which-enumerates`'s
BRIEF already flagged this same fixture oddity in passing (its own code
happens to work anyway because splitting on the substring never throws;
whether its image actually loaded 200 in a real browser was never
confirmed there either).

The fix, in this build's `imgProxyPath`: if the path after `cdn.bsky.app/`
doesn't already end in a recognised suffix, append `@jpeg`. That's not a
guess — Bluesky's "plain" avatar preset always re-encodes to jpeg regardless
of the source format, so appending it is either a no-op (suffix already
correct) or supplies the exact suffix the CDN would have used.

## Decisions

- **New tenant, not a patch to `more-latter`.** Can't touch it — the gate
  rejects any diff outside this directory. Named it differently
  ("Endless You" vs "Infinite You") so the two coexist without confusion
  rather than reading as duplicates.
- **Ported the whole `more-latter` design rather than a minimal fix-only
  page.** The request was urgent ("great haste") about the one thing that
  was broken, not a request to simplify the concept — so the fastest honest
  answer is the same experience, working.
- **Still the fixed ~220-tile patch, not the endless buffer `take-escher`
  eventually grew.** Same reasoning `more-latter`'s own BRIEF gave: porting
  that machinery in one turn with no browser to test in is the wrong risk
  to take when the actual ask this turn was about avatars loading, not
  panning distance.

## The plan (next agent, in order)

1. **Verify in a real browser — there still hasn't been one.** Two turns
   have now fixed avatar loading blind. Confirm the direct-CDN `img.src`
   actually paints, that the triangle warp isn't inverted on mirrored
   tiles, and that touch drag works at phone width. Still the single
   highest-value check.
2. **Port `take-escher`'s endless buffer** (`faceMap`/`frontier`,
   `growBuffer`/`retireBuffer`, `maybeRecenter`) if a future request asks
   for it — same porting note `more-latter`'s BRIEF left, still true here.
3. **The affine warp is an approximation of the true conformal map** — said
   honestly in the page copy. Only worth revisiting if it visibly distorts
   faces more than is charming.
4. **If a "save/share as image" feature is ever requested**, that's the one
   thing that needs `/_img/` (with the `@jpeg`-append fix from turn 1 —
   still correct, just no longer used) back in the loop, since canvas
   export needs same-origin bytes. Don't add it preemptively.

## Gotchas

- **Two different avatar-loading bugs, two turns.** Turn 1: `/_img/`'s
  `CDN_PATH` regex requires a trailing `@jpeg`/`@png`/`@webp` suffix that
  the real `getProfile` fixture doesn't have — 400. Turn 2: the `/_img/`
  proxy itself was reported flaky (500s), while the handle-search dropdown
  (which hits `cdn.bsky.app` directly, no proxy) kept working — so this
  turn dropped the proxy entirely rather than patching it again. If avatars
  break a third time, suspect something else — CSP, the CDN itself, a
  malformed handle — before reaching for `/_img/` again.
- **No browser at all, either turn.** Nothing here has been visually
  confirmed — not the direct-CDN load, not the triangle-warp math, not
  touch drag.
- `ctx.clip()` must run before `ctx.transform()`, in destination
  (screen-pixel) coordinates — reordering this silently draws nothing or
  the whole unclipped image.
