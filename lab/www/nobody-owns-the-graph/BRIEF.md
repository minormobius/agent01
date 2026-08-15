# sketch-out — brief for the next agent

## What this is

Someone asked, over a Bluesky thread about "Agentic Atmosphere," to sketch
out a pitch deck of agentic ATProto — where the value gets captured, and
why it's the users who capture it. The thread wasn't a spec; it was a room:
someone praising ATProto as free infrastructure and citing marque.at as a
small product that solves one problem well, someone else joking that a
"revolutionary agent-to-agent communication system with portable data" is
just Bluesky DMs.

Shipped: a single-file scrolling "deck" — a title, seven short numbered
slides, and a footer. The argument: platforms make money by pricing your
captivity (the wall in the old model IS the product); ATProto makes
identity and data portable, which means that captivity can't be centrally
priced anymore — it just sits with whoever holds the DID. Value moves up to
the app layer (where real product judgment happens) because the protocol
layer commoditizes to free. Slide 3 is not just an assertion — it's a live
demo: type any handle (kit.handleInput), and the page resolves it for real
(`resolveHandle` → `getProfile` → a raw fetch to `plc.directory` for the
DID document, reading `service[].type === 'AtprotoPersonalDataServer'`,
the exact pattern already used in `lab/_kit/pds.js`'s `scoresOf`) and shows
the actual PDS host, off this domain and off bsky.app both.

## Decisions

- **A scrolling page, not a literal paginated slideshow.** A real
  next/prev deck with keyboard nav and slide-snap was tempting (see THE
  PLAN below) but a full turn's worth of extra JS/CSS risk for a page
  that's fundamentally an argument, not an interaction. Numbered sections
  ("01 / 07") give the deck *feel* without the fragility of scroll-snap on
  a page whose content height varies per section — scroll-snap forcing
  full-viewport slides is a common mobile breakage (content taller than
  the viewport gets clipped), so I deliberately didn't reach for it.
- **The old-model diagram is a rectilinear box; the new-model diagram is
  open rings.** This requester's profile (`lab/_profiles/minormobius.bsky.social.md`)
  has a strong recorded preference against rectilinear layouts — but here
  the box is a *deliberate* contrast device (walls = lock-in) against the
  open, borderless rings for the atproto model, not a default grid I
  reached for out of laziness. Worth knowing if a follow-up says "why is
  there a box at all" — that's the reasoning.
- **SVG diagram carries shapes only, no inline text.** Labels live in an
  HTML `<ul class="legend">` below it instead of `<text>` inside the SVG,
  because legend text in plain HTML scales and stays legible at any
  container width; SVG text at a fixed viewBox font-size gets tiny on a
  narrow phone. The profile has a "tests on mobile" pattern recorded
  repeatedly — this was the mobile-safety call for this diagram.
- **plc.directory fetched with a raw `kit.fetchJson`, not through
  `kit.bskyGet`.** `bskyGet` only permits `public.api.bsky.app` XRPC
  methods; the DID document lives on `plc.directory`, which is a separate
  CSP-allowed host (see `lab/www/worker.js`'s `connect-src`) reached the
  same way `pds.js`'s own `scoresOf()` already does it — copied that exact
  pattern rather than inventing a new one.
- **did:web identities are detected and explained, not silently broken.**
  `plc.directory` only resolves `did:plc:*`. A `did:web:*` handle (rare but
  real) gets an honest one-line explanation instead of a fetch that 404s
  with no context.

## The plan — what's not built yet

1. **A real keyboard/swipe slide mode**, if a follow-up wants the deck to
   feel more like an actual presentation: arrow-key / swipe navigation
   between `.slide` sections, a progress-dot rail, `Escape` to return to
   scroll view. The hard part is making it degrade gracefully on a page
   whose slides have very different content heights (some slides are two
   short paragraphs, slide 4/5 are longer) — don't force `100vh` per slide,
   or long slides clip on short/landscape phones. Probably: paginate by
   scrolling to each `.slide`'s top rather than fixed-height panes.
2. **A second, more concrete worked example** beyond marque.at/wisp.place
   (both only named in the source thread, not built into anything here) —
   e.g. an actual mini case study of two apps sharing one identity, walked
   through step by step. Would need real apps to point at; nothing in this
   repo does that today outside this factory's own shared OAuth worker,
   which slide 4 already gestures at.
3. **A second demo path for did:web** — right now it just explains itself
   instead of resolving. Resolving a did:web document means fetching
   `https://<domain>/.well-known/did.json`, which is a host CSP doesn't
   currently allow (arbitrary domains, not just plc.directory) — would need
   a CSP change reviewed by a human, not something to add unilaterally from
   inside a tenant.

## Gotchas

- `resolveHandle.error.json` doesn't tell you the HTTP status — I didn't
  have a fixture with the actual status code for a bad handle, and
  `kit.fetchJson`'s non-OK path never parses the response body (it throws
  before calling `.json()`), so a caught error's `.message` is just
  `HTTP 400` or similar, never the API's own `"Unable to resolve handle"`
  string. The demo's catch block writes its own friendly copy rather than
  surfacing `e.message` verbatim — don't assume a nicer message is
  recoverable from the error object without changing `kit.js` itself
  (which a tenant can't do).
- No fixture exists anywhere in `lab/_kit/fixtures/` for the
  `plc.directory` DID-document response shape. The `service[].type ===
  'AtprotoPersonalDataServer'` field name is trusted only because
  `lab/_kit/pds.js`'s `scoresOf()` already ships that exact lookup in
  production-reviewed code — if that ever turns out wrong, `pds.js` itself
  is broken too, which is a bigger problem than this page.
- Everything above is checked against the fixtures in `lab/_kit/fixtures/`
  and the CSP as written in `lab/www/worker.js`, not against a live handle.
