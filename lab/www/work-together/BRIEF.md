# work-together — brief for the next agent

## What this is

words.bsky.social asked for a site built *with* @buildthis.bisks.net: combine
"respective website catalogs" to produce "unique/beautiful offspring" sites,
and to keep finding creative ways to communicate. buildthis.bisks.net posted
their own first pass at `bisks.net/crossbreed` and said to tag them to keep
building — that's a site on a different domain we have no access to; this
directory is the words.bsky.social side of the same idea, not a client of it.

There is no way here to actually combine two people's *website catalogs*
(that would mean reading arbitrary external sites, which nothing in this repo
can do) and no way to deploy a brand new site from a form (the lab factory
does that from a Bluesky mention, not from a page). So this first turn built
the honest adjacent thing: a **catalog splicer**. Type two Bluesky handles
(defaults to `words.bsky.social` and `buildthis.bisks.net`, both editable via
`kit.handleInput`), hit "splice them together", and it:

- fetches both profiles (`app.bsky.actor.getProfile`)
- draws both avatars through `/_img/` into an offscreen canvas and averages
  each to an RGB colour (real pixel data, not a hash-derived guess, when an
  avatar exists — falls back to a hashed HSL colour if not)
- seeds a `mulberry32` PRNG from `hash32(didA + didB)`, so the same pair of
  handles always shares a *family* of results, and "splice again" reseeds
  within that family rather than rolling fresh
- generates a portmanteau name from both display names, a tagline built from
  words pulled out of both bios, and a generative motif (gradient + seeded
  overlaid circles + both avatars clipped into circles and composited with
  `overlay`) on a 320×320 canvas

That's the whole page. It ships and is usable end to end for any two handles,
not just the two named in the thread.

## Decisions

- **No PDS save, no sign-in, this turn.** `pds.js` would let a visitor save a
  favourite splice to their own repo, but the hard, risky part of this task
  was the avatar-compositing + deterministic generation, and that's what a
  twenty-minute turn should prove. Sign-in is easy to bolt on later; it isn't
  what could have silently gone wrong.
- **Didn't call it "crossbreed."** buildthis.bisks.net already used that name
  for their build at a different domain. Not a trademark issue, just don't
  want a visitor confusing the two projects or thinking this is a mirror of
  theirs. Called it "splice" / "catalog splicer" instead.
- **Framed honestly, in the page copy itself** ("This is a preview, not a
  deploy…"). The request describes something no static page here can
  literally do (spin up a new hosted site from two catalogs), and the brief
  for this factory is explicit about not overclaiming. Said so in the `<p
  class="honest">` block rather than pretending the motif *is* a new website.
- **Real avatar pixels over a hash-only palette.** Colour comes from decoding
  each avatar image (via `/_img/`, which doesn't taint the canvas) when one
  exists, not just from hashing the handle string — it makes the "offspring"
  actually look like a blend of two specific people rather than two random
  seeds that happen to have their names attached.

## The plan — what's not built yet, in order

1. **Let a visitor save a splice to their own repo** via `labPds().save()`
   (optional sign-in) — a named slot per generated offspring, so a good one
   isn't lost on refresh. Needs a "name this one" prompt and a small gallery
   of previously-saved splices loaded from `store.list()`.
2. **Pull real "catalog" material from posts, not just the bio.** Right now
   the tagline only reads `profile.description`. `getAuthorFeed` is on the
   allowlist and already in the fixtures — pull a few recent post texts per
   handle and fold their words into the tagline pool too, so two prolific
   posters produce a noticeably richer blend than two quiet accounts.
3. **A small gallery/history view** if saves land (#1): show the last few
   splices this browser (or repo) generated, so "keep trying" has something
   to point back at across visits.
4. **Consider a second input mode**: instead of two handles, accept a single
   handle plus the visitor's own signed-in account, so "splice yourself with
   someone" doesn't need two typed handles. Only worth it if a request asks
   for it — don't build ahead of the ask.

The hard part still worth naming for whoever picks this up: the current
generative motif is deliberately simple (gradient + circles + two clipped
avatars). If the next ask is "make it more beautiful," the shapes/composite
modes in `drawMotif` are the whole surface to push on — try more than one
composite operation (`multiply`, `screen`) chosen by the seed rather than
fixed to `overlay`, and vary shape *type* (arcs vs. rects vs. paths) by seed
too, not just position/radius.

## Gotchas

- `cdn.bsky.app` avatars taint a canvas — no CORS header. Must go through
  `/_img/<path-after-cdn.bsky.app/>`, confirmed against `lab/_kit/README.md`.
  `crossOrigin="anonymous"` does *not* fix this; it just makes the image fail
  to load, so don't add it back in "for safety."
- `kit.bskyGet` only permits methods that take a visitor-named subject —
  `getProfile` with `actor: handle` works directly, no need to
  `resolveHandle` first. Kept it to one call per handle rather than two.
- Fixtures (`getProfile.json`) were captured against the *previous* service
  account DID — don't copy identifiers out of them, only field shapes. Used
  `profile.displayName`, `.handle`, `.avatar`, `.description`, `.did` — all
  present and named exactly that in the fixture.
- Untested in a real browser by me (no Bash/WebFetch here) — the harness
  screenshots it after this turn ends; if avatar fetch/proxy 400s in
  practice, the `img.onerror` fallback to a hashed colour should keep the
  page usable rather than blank, but I haven't seen it run.
