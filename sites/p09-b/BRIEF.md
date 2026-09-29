# BRIEF — sketch-out

## What this is
A reply, in the thread's own terms, to "who's building this" / "agentic
atmosphere": a small pitch-deck-shaped page arguing that in an
agent-mediated ATProto world, value capture lands on users rather than
whatever tool sits between them and their agent — because identity (a DID)
and data (a repo on a PDS) stop being things a platform issues and can
revoke.

Shipped: a 7-slide, full-viewport scroll deck (`section.slide`, CSS
scroll-snap, bottom dot nav, arrow-key nav). Slides: title → the old
platform-mediated shape → what ATProto changes (with a canvas-rendered
comparison diagram) → composability (cites marque.at and wisp.place as real
examples, not hypotheticals) → a **live interactive demo** → why value
lands on users → a deliberately-empty closing slide explaining what was
left out and why.

## Decisions
- **The demo is the actual argument, not decoration.** Slide 5 resolves the
  visitor's own typed handle to its real DID via `kit.handleInput` (or
  `resolveHandle` as a fallback if they type-and-submit without picking),
  then fetches the DID document from `plc.directory` directly (allowed by
  the CSP per `lab/_kit/README.md`'s pds_car_parser section) and reads the
  `AtprotoPersonalDataServer` service entry for the PDS host. This is the
  hardest/most load-bearing piece per the profile's "arch-brainstorm"
  pattern — a proof, not just prose.
- **No fixture exists for the plc.directory response shape** (only
  `resolveHandle`/`getProfile`/etc. are fixture'd). The field names used
  (`service[].type === 'AtprotoPersonalDataServer'`, `.serviceEndpoint`)
  are from the DID-core / ATProto spec shape from memory, not verified
  against a captured response. If the browser screenshot pass shows the
  demo erroring on a real handle, this is the first place to check —
  log `doc` to see the actual shape before changing anything else.
- **did:web handles are handled but not resolved** — plc.directory only
  serves did:plc. The code detects the prefix and shows an honest
  "can't look this up from here" message rather than attempting a fetch
  the CSP would block anyway (connect-src has no wildcard for arbitrary
  web hosts).
- **The comparison diagram follows this requester's standing preference**
  (see `lab/_profiles/minormobius.bsky.social.md`, iterations 7 and the
  "always" note): rendered once to an offscreen `<canvas>`, shipped to the
  page as a single flat `<img>` (not live DOM/SVG, so mobile long-press
  doesn't select text), with a prominent gradient "copy image" button using
  `ClipboardItem` and a download fallback if the Clipboard API isn't
  available.
- **Did not name any person from the source thread on the page.** Product
  names (marque.at, wisp.place) are cited as concrete, on-topic evidence;
  no handle is quoted or attributed, per the task's instruction to treat
  the thread as context rather than something to lift from directly.
- **No CARD.json** — this is an interactive page (scroll deck + a live
  resolver), so the default screenshot-based link card is the better advert
  than a generated image would be, per the task's own guidance on that
  tradeoff.

## The plan (not built yet, in order)
1. **Verify the plc.directory shape for real** — this is the one thing I
   could not check from the sandbox at all (no network). If it's wrong,
   the fix is almost certainly just the key path into `doc.service`.
2. **A second live proof, if the first one lands well**: show the same
   visitor's own repo's `com.minomobi.lab.doc`/`.score` records (via
   `labPds()`/`store.load`) to make "and you can already write structured
   data through a narrow scope" concrete, not just "here's a document that
   exists." Didn't do this in turn one because it requires sign-in
   (OAuth), and the task's OAuth-optional guidance argues against gating
   the deck's core argument behind a login the first four slides don't
   need.
3. **Consider a second diagram** for slide 4 (composability) — currently
   text-only. A node graph (this factory / marque / wisp / auth.mino.mobi
   all touching one DID) would match this requester's stated taste for
   diagram-shaped answers, but wasn't worth the time in this turn against
   getting the live demo actually correct.
4. If the deck reads as too text-heavy on a rescan, the "why users" slide
   (slide 6) is the thinnest one — it's the only slide with no diagram and
   no interactivity, and would be the first candidate for a small visual.

## Gotchas
- `kit.handleInput`'s `onPick` only fires on an actual dropdown pick, not
  on Enter with nothing highlighted — the demo form's submit handler is a
  deliberate second path for someone who types a full handle and hits
  enter/tap-resolve without using the dropdown. Don't remove one thinking
  the other covers it.
- The deck disables page-level scrolling (`body { overflow: hidden }`) and
  puts the actual scroll on `.deck` — if a future edit adds page content
  outside `<main class="deck">`, it will not be reachable by normal
  scrolling and needs its own handling.
- `plc.directory` fetches happen straight through `kit.fetchJson`, not
  `kit.bskyGet` (that helper is AppView-only, and plc.directory is a
  different allowlisted host in the CSP) — don't try to route it through
  `bskyGet`, it'll reject with the "not an allowed method" error.
