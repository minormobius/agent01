# BRIEF — probably-have / "Endless You"

## What this is

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

1. **Verify in a real browser — there was none this turn.** Confirm the
   `@jpeg`-append actually produces a 200 from `/_img/`, that the triangle
   warp isn't inverted on mirrored tiles, and that touch drag works at
   phone width. This is the single highest-value check: the whole point of
   this turn was fixing something that couldn't be observed failing or
   passing without one.
2. **Port `take-escher`'s endless buffer** (`faceMap`/`frontier`,
   `growBuffer`/`retireBuffer`, `maybeRecenter`) if a future request asks
   for it — same porting note `more-latter`'s BRIEF left, still true here.
3. **The affine warp is an approximation of the true conformal map** — said
   honestly in the page copy. Only worth revisiting if it visibly distorts
   faces more than is charming.

## Gotchas

- **The fixture's avatar URL has no format suffix.** Don't assume
  `cdn.bsky.app` URLs always end `@jpeg` — the real API response captured
  here doesn't, and `/_img/`'s `CDN_PATH` regex is strict about requiring
  one. Test any avatar-URL handling against the actual fixture file, not
  against the shape shown in `lab/_kit/README.md`'s example snippet, which
  is the same naive split and would 400 on this exact fixture.
- **No browser at all this turn** — same caveat `more-latter`'s BRIEF
  carried forward about the triangle-warp math and mirroring "working for
  free." Nothing here has been visually confirmed either.
- `ctx.clip()` must run before `ctx.transform()`, in destination
  (screen-pixel) coordinates — reordering this silently draws nothing or
  the whole unclipped image.
