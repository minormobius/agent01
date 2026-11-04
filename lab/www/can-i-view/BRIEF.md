# BRIEF — view-this

## What this is

The requester posted an image URL (`cdn.bsky.app/img/feed_thumbnail/...`) and
just asked "can you view this image?" — a literal capability question, in the
context of a thread about `eulerize` (someone else's map-tracing app, built by
`@buildthis.bisks.net`, not this factory's concern). No app to build, no
mechanic to invent — the honest answer to the question *is* the site.

Shipped as a one-page answer in two parts: (1) what the build agent actually
received when the harness fetched that URL — raw undecoded WEBP bytes, shown
verbatim in a scroll box, because a language model reading a wall of binary
garbage genuinely cannot turn it into "a photo of X"; a toggle explains the one
thing that *is* readable — the RIFF/WEBP/VP8X container signature at the front,
which is pattern-matching on ASCII, not image understanding. (2) the image
itself, embedded live via `<img src="https://cdn.bsky.app/...">` — the browser
decodes WebP natively, so the visitor's own device does what I can't.

## Decisions

- **Showed the real image, not a mockup.** The requester explicitly linked
  this exact CDN URL, so it's "media for a subject the visitor named" — the
  one rule with teeth in `lab/www/CLAUDE.md` permits this outright. It is not
  a feed pull, not search, not a stream — one static URL someone posted.
- **Used `<img src="https://cdn.bsky.app/...">` directly, not `/_img/`.**
  `/_img/` exists so a *canvas* can draw/export an avatar without tainting.
  This page never touches canvas — it just displays — and `img-src` in
  `worker.js`'s CSP already allows `https://cdn.bsky.app` outright. Simpler
  and one fewer moving part.
- **No handle lookup, no kit.handleInput.** Per the requester's profile
  (`lab/_profiles/ezba.bsky.social.md`), they're comfortable with pure-concept
  pages that skip the Bluesky-lookup pattern entirely when the request doesn't
  call for one. This one doesn't.
- **Rainbow gradient chrome, plain reading surface, mechanism behind a
  pulsing toggle** — all three are established, confirmed preferences from
  the profile. Applied to: the h1, the card borders, the toggle button, the
  image frame. Body copy stays kit-default muted/plain.
- **Did not literally byte-for-byte reproduce the fetched file.** The raw
  bytes contain invalid UTF-8 sequences; what's shown is a representative
  chunk from the same source (already passed through UTF-8 replacement-char
  mangling by the Read tool), which is honestly labelled as "the first
  stretch," not "the complete file." Good enough to make the point without
  claiming more precision than it has.

## The plan (if there's a next turn)

There probably isn't more to build here — it's a direct answer to a direct
question, not a tool with more depth to add. If a follow-up comes in:
- If the requester asks "what if the image never loads" — there's already an
  `error` handler on the `<img>` that swaps in an explanation (deleted /
  expired CDN link), so that's covered.
- If they push further on "how does WEBP actually work" — the toggle currently
  stops at the container signature. Going further (VP8 lossy vs VP8L
  lossless, the actual entropy coding) would be a real rabbit hole and
  probably wants its own reveal layer rather than expanding this one — this
  requester's profile shows they like mechanism-as-opt-in, not
  mechanism-as-wall-of-text.

## Gotchas

- The real difficulty here was **NOT** technical — it's tempting to
  over-engineer a "capability demo" out of a yes/no question. Resisted that;
  the page is short on purpose.
- The image URL in `/tmp/lab-refs.md` came with **no `@format` suffix**
  (no `@jpeg`/`@webp`), which doesn't match the `/_img/` proxy's
  `CDN_PATH` regex in `worker.js` (that regex requires the suffix). Checked
  `lab/_kit/fixtures/getPostThread.json` to confirm: real AppView responses
  also omit the suffix on `thumb`/`fullsize` URLs. So the URL as given is
  correct and complete — do not append `@webp` to it, and don't be surprised
  the `/_img/` proxy wouldn't accept it unmodified if a future edit tries to
  route through there instead.
