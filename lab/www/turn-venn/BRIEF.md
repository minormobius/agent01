# turn-venn — the two-circle Venn diagram, but the overlap is the Predator handshake

## What this is

A single page at `minomobi.com/turn-venn/`: type two group labels and what
they secretly have in common, and get a Venn diagram where the overlap isn't
a plain lens shape — it's the "two guys clasping forearms" handshake meme
(the one people call the Predator handshake, after the Dutch/Dillon scene),
drawn with one arm in camo and one in tactical black. Below the diagram the
same three inputs repeat as a plain sentence, for accessibility and because
the canvas has no text a screen reader can read.

## What was asked

From a Bluesky thread (`@antiali.as`): "turn the Venn diagram into the
predator handshake meme." No prior context in this repo for this requester —
first build, no profile existed yet (`lab/_profiles/antiali.as.md` created by
this build).

## Why there's no film still, and no network call at all

Two independent reasons converge on the same answer: draw it from scratch.

1. **No network in this sandbox and none allowed at runtime** — the CSP's
   `connect-src` only permits `public.api.bsky.app` and `plc.directory`, and
   there's no image CDN on the allowlist regardless. A `<img src="...predator
   handshake.jpg">` from anywhere else would be blocked outright.
2. **It's a copyrighted film frame.** Even if hotlinking worked, a screenshot
   from *Predator* isn't something to embed into a generator that redistributes
   it under a different label. The meme *format* — two arms, two colors, a
   fist in the middle — isn't the copyrighted part; the specific frame is.

So the whole illustration — both forearms, the camo blotches, the wristband,
the clasped fist, the knuckle bumps — is drawn on a `<canvas>` with primitive
shapes and fills. Nothing is loaded from anywhere; the page has no `<img>` at
all.

## How the Venn/handshake merge actually works

The two Venn circles are drawn as translucent-tinted full circles first (so
the "only A" / "only B" regions read as an ordinary Venn diagram), then the
context is clipped twice in a row — `ctx.clip()` to circle A, then `ctx.clip()`
again to circle B — which intersects the two clip regions down to exactly the
lens-shaped overlap. The handshake is drawn once, sized larger than the lens,
inside that double clip, so only the part that lands inside the intersection
is ever visible. The circle *outlines* are stroked afterward, outside the
clip, so the Venn borders still cross visibly over the artwork the way a
hand-pasted meme edit would show the circle line drawn over the image.

Camo blotches for the left arm are generated once at page load
(`CAMO_BLOTCHES`, fixed array of ellipses with a stored position/rotation/
color) rather than regenerated inside `draw()` — regenerating on every
keystroke would make the pattern visibly jitter as someone types, which reads
as a bug, not texture.

## Other decisions

- **Presets carry the joke, not the instructions.** The three inputs default
  to a random pick from a small set of prewritten pairs (tabs/spaces,
  cat/dog people, vim/emacs, etc.) so the page is funny before anyone types
  anything, with a "shuffle example" button to re-roll. Typing into any field
  overrides only that field — `currentValues()` falls back to the first
  preset's text only when a field is empty, never blanking the picture.
- **Download is `canvas.toDataURL('image/png')` into a hidden, in-DOM `<a
  download>`**, clicked programmatically. No server round trip, no library —
  this is the standard client-only canvas export pattern and needs nothing
  from the kit.
- **Text-alternative caption below the canvas**, built with
  `createElement`/`textContent` (never string-built `innerHTML`) even though
  every value here is the visitor's own typed input and not attacker
  content — kept to the same discipline as sites that do render other
  people's strings, so the pattern doesn't have to be relearned per site.
- Used the kit's `.err`/`hidden` convention (`kit.clear`/`kit.showError`) for
  the one thing that can actually fail per-browser: `canvas.toDataURL` inside
  a try/catch, in case a browser ever refuses canvas export.

## Iteration 2 — share-to-Bluesky CTA

Task this round: "always be viral (share for bluesky call-to-action cards in
every app)" — a standing directive for lab sites, not a new request from
`@antiali.as` specifically. Added a "Share to Bluesky" card below the caption.

How it works: clicking it builds `https://bsky.app/intent/compose?text=...`
(the public, no-auth Bluesky compose-intent link — a plain navigation, not an
XRPC call, so it needs no `kit.bskyGet` and isn't subject to `connect-src`)
with the caption sentence plus a link back to this page. That link carries the
three field values as `?a=&b=&c=` query params, so **the person who clicks
through sees the exact handshake that was shared**, not a blank form — the
form reads `a`/`b`/`c` off `location.search` on load (`valuesFromUrl`) and
prefills from them in preference to the random preset. This is the whole
mechanic: without it, "share" would post a link to an empty generator, which
is a much weaker call to action than sharing the specific joke someone made.

Values from the URL are still clamped to the same `maxlength`s as the inputs
(40/40/60) before being drawn, so a hand-edited query string can't do
anything the text inputs couldn't already.

No fixture needed for this — `bsky.app/intent/compose` is a link format, not
an API response, so there's no JSON shape to get wrong. Not verified in a
real browser (no network/browser tools here); the thing most worth
double-checking on the next pass is that Bluesky still honours this intent
URL format unchanged.

## What's open / unverified

- **Never rendered.** No Bash/WebFetch/browser available in this sandbox.
  Read carefully for balanced braces and correct canvas API usage (in
  particular that path-building calls made under a `translate`/`rotate`/
  `scale` between `save()`/`restore()` bake the transform into the recorded
  path — that's relied on for the camo ellipses — which is standard canvas
  behavior but unverified against a real render here).
- No profile existed for `@antiali.as` before this build; created one from
  this request (see `lab/_profiles/antiali.as.md`). Future iterations should
  read it before assuming defaults.
- A possible follow-up: let the download button also offer a square/portrait
  crop for sharing to platforms that crop link cards differently — not built
  here since it wasn't asked for.
