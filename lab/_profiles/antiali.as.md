# @antiali.as

## First build
`turn-venn` — "turn the Venn diagram into the predator handshake meme." A
joke/meme generator, no Bluesky data involved (not about any account or
handle) — pure client-side canvas drawing.

## Palette and type
No stated preference yet; used the kit defaults (dark surface, amber accent)
plus a blue/amber pair for the two Venn circles so they read as distinct
without clashing with the kit's own accent.

## Features they reach for
Asked for a meme-format generator rather than a data tool — leans toward
playful/joke sites. Gave a "shuffle example" preset picker and a PNG download
unprompted, since a meme generator with nothing to export or riff on would be
a dead end; not yet confirmed as a standing preference, watch for whether
future requests ask for these again.

## Said no to
Nothing yet — first build.

## Second pass on `turn-venn`
The follow-up wasn't from this requester directly — it was the standing
"always be viral" directive to add a Bluesky share CTA to every lab app.
Implemented as a compose-intent link that round-trips the page's own state
through query params, so the shared link reproduces the exact meme rather
than a blank generator. Worth reusing this shape (state-in-URL + intent link)
on future builds for this requester, since meme/generator sites are their
pattern and a share button that shares nothing state-specific is a weak CTA.
