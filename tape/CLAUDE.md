# tape — tape.mino.mobi

<!-- HAND-OWNED. Seeded shape from scripts/gen-surface-docs.mjs, then written
     properly. This is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

The open-source NFC card audio player — a Toniebox you build, where the marginal
story costs 20¢ instead of $19.99. A child puts a card on a box and hears a
parent read a book. This surface is not a brochure for that project; three of its
pages *are* the software.

## Facts

| | |
|---|---|
| Surface | `tape` |
| Dir | `tape/` |
| Endpoint | `tape.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/rfid-book-reader-design-ainq0k` |
| Deploy | `.github/workflows/deploy-tape.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) →
`surfaces[]` where `surface == "tape"`.

## The one fact that shapes everything

**An NFC tag cannot hold audio.** NTAG213 has 144 bytes of user memory, NTAG216
has 888. One minute of speech at 24 kbps Opus is 183,600 bytes. A picture book is
4,100× the biggest cheap tag.

So the card carries a 64-bit **pointer** and the box owns the audio on an SD
card. Every good property of this design falls out of that: cards cost 20¢, one
card can hold six books (a playlist is an array), and re-pointing a card is a
JSON edit that never touches the card. If you find yourself designing anything
that puts bytes-per-book on the tag, stop and re-read
[`design/`](design/index.html) §3.1.

## Page map

| Path | What it is |
|---|---|
| `/` | the pitch, the block diagram, the cost arithmetic |
| `/design/` | **the design record** — product + site architecture, four corrections, the decision log. Read this before changing anything here |
| `/hardware/` | bill of materials — deliberately empty until components are selected |
| `/firmware/` | firmware architecture and the state machine |
| `/studio/` | **working**: records a book in the browser, MediaRecorder → Opus |
| `/tags/`, `/c/<id>` | **working**: the card byte layout and a Web NFC writer |
| `/sim/` | **working**: the whole box in a tab — presence playback, debounce, resume |
| `/build/` | assembly guide — waiting on hardware |

## The model lives in `lib/`, and the firmware will share it

Dependency-free ES modules that run in a browser *and* in node, so the site and
the eventual firmware cannot drift apart:

- `lib/tag.js` — the card byte layout, Crockford base32 ids, the two NDEF
  records, `TAG_CAPACITY`, and `fitsTag()`
- `lib/catalog.js` — the manifest (titles, cards, playlists), SD paths,
  validation, the size arithmetic quoted across the site
- `lib/protocol.js` — the box HTTP API, the SSE events, and the three transports
- `lib/tape.selftest.mjs` — 19 known-answer checks, run by
  `node scripts/preflight.mjs` and again by the deploy workflow

**Two assertions in that selftest are load-bearing. Do not weaken them:**

1. *A maximal card still fits an NTAG213.* The day it stops fitting is the day
   the project stops being cheap.
2. *No tag on the market can hold a minute of speech.* If that ever becomes
   false, the whole pointer design is worth revisiting — and it should be
   revisited deliberately, with a red test in front of you.

Every page imports from `lib/` as ES modules over the wire. There is no build
step and there must not be one.

## Two constraints that bite whoever edits this next

**Web NFC is Chrome-on-Android only.** Not Safari, not iOS at all, not any
desktop browser — about 6% of browsers. `/tags/` degrades to an explanation
rather than an error. The box is the tag writer of record; Web NFC is a
shortcut, never a dependency.

**An HTTPS page cannot fetch `http://tape.local`.** Mixed content, and no header
fixes it. This is why `/studio/` is *dual-homed*: this copy records and hands you
files, and the same source is shipped on the box's SD card and served by the box
over plain HTTP, where the upload button works. If you change `/studio/`, you are
changing the box's UI too. `lib/protocol.js` expresses the rule as
`availableTransports()` so it is tested rather than remembered.

## Deploying

Pushes to `claude/rfid-book-reader-design-ainq0k` that touch `tape/**` trigger
[`.github/workflows/deploy-tape.yml`](../.github/workflows/deploy-tape.yml),
which runs the selftest before it deploys.

The sandbox cannot reach Cloudflare — **push to the trigger branch, don't
`wrangler deploy` locally**. Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first,
especially the golden rule: the `wrangler.jsonc` `name` must be the worker that
owns the live custom domain, or the deploy goes green while the site never
changes. `tape.mino.mobi` was unclaimed (502) when this surface was created, so
the first run is what establishes the binding — **check the log for
`tape.mino.mobi (custom domain)`.**

## The worker

Everything is static except one route. `/c/<cardId>` — the URL every card carries
as its first NDEF record — rewrites to `/tags/`, so a stray card tapped on any
phone, with no app installed and the box switched off, says what it is. That
affordance is the whole reason there is a worker rather than plain assets.
