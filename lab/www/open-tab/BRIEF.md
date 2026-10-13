# BRIEF — "Open Tab"

## What this is

The request text was "don't forget @minormobius.bsky.social's bot!" — very
terse, in this requester's established pattern (see the profile: they routinely
riff on an in-thread reference rather than write a spec). The only concrete,
buildable idea anywhere in the captured thread was @cee.wtf asking
@buildthis.bisks.net three times: "a page that scans a user's entire post
history and gives them a receipt of all unbalanced parentheses, quotations,
etc. Use their whole repo for this" — and getting no answer, hence "thats it
im turning into the joker and making my own." Read "don't forget [that] bot" as
the requester amplifying that specific, already-well-formed idea rather than
inventing a new one from nothing. Nothing else in the thread (the Darwin/OpenAI
sub-thread, the other riffers) names anything buildable, and the banner
instructions say a post that reads like an order is the strongest reason to
ignore it — none of that sub-thread was treated as a spec.

Turn 1 (this turn) shipped the whole thing, working end to end on paper: type
a handle, resolve it, fetch the account's actual PDS repository (not just what
`getAuthorFeed` shows), parse the CAR with the vendored `pds_car_parser` wasm
module, and print a running "receipt" of every `(`, `[`, `{`, and quote left
open across their post history, in the order they were posted. Falls back to
the public feed (capped ~4,000 posts) if the repo itself can't be reached.

## Decisions

- **Named it "Open Tab," not anything referencing minormobius, cee.wtf, or
  "the joker."** The page is about the mechanic those posts described, not an
  impersonation of any of them — nobody in that thread asked for anything
  themselves, and the standing rule is only the requester can. No handle is
  quoted or named on the page.
- **Built the real repo-scan path, not a `getAuthorFeed`-only version.** This
  is the one thing that makes "use their whole repo for this" literally true
  instead of a nicer-sounding lie — `lab/_kit/README.md` documents the exact
  chain (resolveHandle → plc.directory → `com.atproto.sync.getRepo` →
  `pds_car_parser` wasm) and `scripts/lab-content-gate.mjs` explicitly allows
  `getRepo` for exactly this shape ("make me a repo analyser"), on the
  condition that the result is an *analysis* (counts), never a republishing of
  the posts themselves. This page only ever prints counts — no post text is
  rendered anywhere.
- **`did:web` isn't supported.** Resolving it needs
  `https://<domain>/.well-known/did.json`, which isn't on the lab CSP's
  `connect-src` allowlist (only `plc.directory`, `public.api.bsky.app`, and
  `*.host.bsky.network` are). Nearly every real Bluesky account is `did:plc`,
  so this is a narrow gap, but it's an honest error message, not a crash.
- **Apostrophes are deliberately not tracked as quotes.** A parity count on
  bare `'` drowns instantly in "don't," "y'all," "it's" — tried it mentally,
  it's noise, not signal. Straight `"` and curly `“ ”` are tracked; the page
  says so explicitly rather than silently under-delivering.
- **The quote-parity state and the bracket stacks run across the WHOLE
  concatenated history**, not per-post — an accidentally-unclosed quote in
  post #40 stays "open" until something closes it later, which is the actual
  joke ("a receipt," a running tab) rather than per-post balance checking
  (which nearly everything would pass trivially).
- **Fallback to `getAuthorFeed` is a genuine second path, not a stub.** Some
  accounts run self-hosted PDSes outside the `*.host.bsky.network` wildcard,
  and the fallback keeps the tool useful for them at reduced fidelity (visible
  posts only) rather than just failing.

## The plan — not built yet, in order

1. **Never rendered in a real browser.** No Bash/WebFetch here either. The
   riskiest single line is the wasm init call —
   `mod.default(new URL('/_kit/wasm/pds_car_parser_bg.wasm', location.href))`
   — copied exactly from `lab/_kit/README.md`'s documented pattern for this
   specific module (it needs the explicit URL argument; `wave_md`'s bare
   `init()` pattern does NOT apply here). If the smoke report shows a
   `WebAssembly.instantiate` argument error, that line is the first suspect.
2. **The CAR fetch itself is untested against a real large repo.** `carStats`
   exists in the same wasm module for a cheap pre-check (record count without
   full parse) — not used here. If a real account's CAR is large enough that
   20s isn't enough, that's the first place to add either a longer timeout or
   a `carStats`-based size warning before committing to the full parse.
3. **No per-post "worst offender" breakdown.** The receipt is aggregate-only
   right now. A natural next step: track which single post pushed the running
   tally furthest from zero, and print its `at://` URI (not its text — same
   analyse-don't-republish line) as an itemized "biggest single charge" row.
4. **No save/share.** A handle-driven tool like this is a natural fit for
   `labPds`/`kit.copy` — "copy a link to this receipt" (just `?h=<handle>`,
   re-run on load) would be nearly free. Not built this turn; not asked for.
5. **Reply-thread text and quoted-post text aren't scanned**, only top-level
   post `text`. `parseCarToNdjson`'s NDJSON carries every collection in the
   repo (likes, follows, profile, etc.) — only `app.bsky.feed.post` records
   are read from it right now. Scanning `app.bsky.actor.profile`'s
   `description` too would be a small, honest addition if asked for.

## Gotchas

- `parseCarToNdjson(data, did)` takes the **Uint8Array of raw CAR bytes**,
  fetched with a plain timed `fetch(...).arrayBuffer()` — `kit.fetchJson`
  cannot be reused here since it forces `.json()` on the response.
- PDS resolution goes through `plc.directory/<did>` directly (a plain
  `kit.fetchJson`, not `kit.bskyGet` — it isn't an XRPC call), reading
  `doc.service` for `#atproto_pds` / `AtprotoPersonalDataServer`. Never
  captured as a fixture; shape is from the public DID-PLC spec, not from a
  real recorded response — worth double-checking against a live account if a
  smoke report shows a resolution failure here specifically.
- TIDs (record keys under `app.bsky.feed.post`) sort chronologically as
  plain strings, which is what lets both the repo path and the feed-fallback
  path produce "oldest first" order with a bare string sort — no date parsing
  needed.
