# BRIEF — probably-have / "Endless You"

## Turn 3 update (this turn)

No new ask from abeliansoup this turn — the requester's posts in the thread
are the same avatar-loading complaint turn 2 already fixed, plus a plea not
to lose to norvid's other request, not a new technical instruction. (The
riffing about fish shapes, hex tiling and infinite buffers is minormobius and
norvid talking about `take-escher`, a different tenant — not something this
site's requester asked for, and not this directory's to build anyway.) So
this turn worked the plan: since a browser still isn't available, I did the
next best thing and re-derived the hyperbolic math and the affine
texture-warp by hand rather than trusting three turns of "ported, never run."

**Verified correct, by manual derivation:**
- The {p,q} circumradius formula (`coshC = cot(pi/p)*cot(pi/q)`, `rV =
  tanh(c/2)`) matches the standard hyperbolic-right-triangle identity
  `cosh(c) = cot(A)cot(B)` plus the Poincare-distance conversion.
- `reflectAcross` — move z1 to the origin, reflect across the diameter that
  z2 lands on, move back — is a correct geodesic reflection.
- `triangleTransform`'s Cramer's-rule affine solve: fed the identity case
  (source triangle = destination triangle = the unit right triangle) by hand
  and every coefficient came out exactly right (a=1,d=1, everything else 0).

**Found and fixed a real bug:** `faceKey` deduped BFS-discovered faces by
rounding their centroid to 3 decimal places. Two paths reaching the *same*
face land within ~1e-12 of each other (compounded double-precision error),
but near the rim of the disk genuinely *different* faces can sit closer
together than 1e-3 — so the old precision was merging distinct faces and
dropping one, which would show up as missing tiles/gaps toward the edge of
the patch, worst on the tighter tilings ({8,3}, {7,3}). Bumped to 1e7, which
is far above the numerical-noise floor and far below the closest distinct
faces should plausibly get within a 220-tile patch. Not able to confirm the
before/after visually — still no browser — but the reasoning is solid and
the change is one-line and low-risk either way.

## Turn 2 update

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

1. **Verify in a real browser — there still hasn't been one.** Three turns
   have now touched this blind. Confirm the direct-CDN `img.src` actually
   paints, that the triangle warp isn't inverted on mirrored tiles, that the
   `faceKey` precision fix (turn 3) actually closed the rim gaps rather than
   introducing overlapping duplicate tiles, and that touch drag works at
   phone width. Still the single highest-value check, and now the one thing
   this project most needs before doing anything else.
2. **Port `take-escher`'s endless buffer** (`faceMap`/`frontier`,
   `growBuffer`/`retireBuffer`, `maybeRecenter`) if a future request asks
   for it — same porting note `more-latter`'s BRIEF left, still true here.
   (Not this: the fish/hex/infinite-tiling riffing elsewhere in the thread
   is about `take-escher`, a different tenant, not a request against this
   site.)
3. **The affine warp is an approximation of the true conformal map** — said
   honestly in the page copy, and the *formula itself* checked out by hand
   this turn (turn 3). Only worth revisiting if a real browser shows it
   visibly distorting faces more than is charming.
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
- **No browser at all, any of the three turns.** Nothing here has been
  visually confirmed — not the direct-CDN load, not the triangle-warp math,
  not touch drag, not the turn-3 `faceKey` fix. All of it checks out on
  paper; none of it has been seen rendered.
- `ctx.clip()` must run before `ctx.transform()`, in destination
  (screen-pixel) coordinates — reordering this silently draws nothing or
  the whole unclipped image.
