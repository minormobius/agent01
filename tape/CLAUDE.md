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
| `/hardware/` | BOM rendered from `parts.json` (checked links, two price tiers), the schematic and power-chain diagrams, and a live power budget |
| `/build/` | assembly — eight stages, each ending at a gate. Structure written, steps wait on a real box |
| `/system/` | **the house standard** — bench, interconnect tiers, build loop, documentation habits, standing decisions. Not tape-specific; lift it out when project two starts |
| `/first-story/` | **the instructions** — for a parent with a phone, not an engineer |
| `/firmware/` | firmware architecture and the state machine |
| `/studio/` | **working**: records a book in tracks and hands back files (it cannot upload — see the two rules below) |
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
- `lib/protocol.js` — the box HTTP API, the SSE events, the network modes, and
  `originCapabilities()`
- `lib/pinmap.js` — the GPIO assignment. The schematic is *drawn from this*, so
  the picture and the firmware cannot disagree about a pin number
- `lib/power.js` — the power budget: per-component draw per state, runtime on a
  given cell, days between charges. `/hardware/` renders it live
- `lib/tape.selftest.mjs` — 41 known-answer checks, run by
  `node scripts/preflight.mjs` and again by the deploy workflow

**Three assertions in that selftest are load-bearing. Do not weaken them:**

1. *A maximal card still fits an NTAG213.* The day it stops fitting is the day
   the project stops being cheap.
2. *No tag on the market can hold a minute of speech.* If that ever becomes
   false, the whole pointer design is worth revisiting — and it should be
   revisited deliberately, with a red test in front of you.
3. *No origin can both record and upload* (see below). If a browser change ever
   makes that test fail, the studio can collapse into one page — so it failing
   is information, not an annoyance.

Every page imports from `lib/` as ES modules over the wire. There is no build
step and there must not be one.

## The two browser rules that shape everything

They pull in opposite directions, and no configuration escapes either.

1. **`getUserMedia` needs a secure context.** On plain HTTP,
   `navigator.mediaDevices` is *undefined*, not merely restricted. So recording
   can only happen on `https://tape.mino.mobi`. Web NFC is gated the same way.
2. **An HTTPS page cannot fetch `http://192.168.4.1`.** Mixed content; no header
   fixes it. The box has no public name and cannot renew a certificate, so it
   serves plain HTTP. So uploading can only happen from the box's own origin.

**Therefore no single origin can do both, and a file crosses between them.** A
file input works on any origin — that is the bridge. `originCapabilities()` in
`lib/protocol.js` encodes this and the selftest checks every combination; the
contradictory pair (secure *and* on the box's origin) throws, because the box
serves HTTP. `TLS_UPGRADE` documents the Plex-style wildcard-DNS trick that would
one day collapse the two pages into one, and the three reasons it is not in v1.

A consequence worth not undoing: **the phone's own voice-memo app is a
first-class input.** It is already installed, handles interruptions properly, and
its output is already backed up. ESP-ADF on the box decodes MP3/AAC/WAV/OGG/
Opus/FLAC/AMR, so there is nothing to convert. Our studio earns its place only by
splitting a book into tracks as you read it.

**Web NFC is Chrome-on-Android only** — about 6% of browsers, never Safari. And
on the box's own access point there is no internet to load an HTTPS page with
anyway. So the box is the tag writer of record; Web NFC is a shortcut, never a
dependency.

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

## Chosen parts

ESP32-S3-WROOM-1 N16R8 · PN532 · MAX98357A + 4Ω driver · microSD · MCP73871
power path · protected 18650 · MCP1700 LDO · two arcade buttons and a volume
**potentiometer** (a physical end stop is the hearing-safety part). ~$56
portable, ~$45 on mains. Full reasoning and the rejected candidates:
[`hardware/`](hardware/index.html).

Two firmware rules that came out of the power budget and the card form factor,
and that a well-meaning simplification would break:

- **Pulse the NFC field**, 10 ms in every 125. A continuous field is 50–80 mA
  and ends the portable version on its own.
- **Refuse more than one tag in the field.** The cards are a deck of playing
  cards; a deck is a stack by nature, and two tags is an anticollision event,
  not a read.

## parts.json and the link check

`parts.json` is the only place the BOM is written down; `/hardware/` fetches and
renders it. **Never hand-edit the table in the HTML.**

`node tape/check-links.mjs [--write]` verifies every source URL. The check is
*not* "does it return 200" — vendors retire and reuse product ids, so a dead
link resolves cheerfully to something else. It matches each source's `expect`
against the page. Three verdicts, because two would be a lie: `ok` (identity
confirmed), `resolves` (200 but JS-rendered or bot-walled), `blocked` (the
vendor refuses automated requests — normal for Amazon and DigiKey).

It is deliberately **not** a `*.selftest.mjs`: preflight must not depend on
twenty third-party websites being up. Run it by hand and commit the result.

Two more selftest invariants worth keeping:

- **No pin is assigned twice, reserved, or absent.** GPIO33–37 carry the octal
  PSRAM on any R8 module and look free on the pinout drawing; GPIO22–25 do not
  exist at all. The test also breaks the map on purpose to prove the check works.
- **Parts with a specific chip have a source verified `ok`** — not merely
  present.

## The system page is meant to outlive this surface

`/system/` is the house standard for building things like tape — the bench, the
three interconnect tiers, the build loop, and the four documentation habits
(parts as data, pin map as code, constraints as tests, decisions logged with
their *reasons*). It lives here because tape is the first hardware project and
keeping it next to a real build is what stops it becoming aspirational. **When
there is a second project, rehome it** (`scripts/rehome.mjs`).

`parts.json` `tools[]` carries an `owned` field, so the shopping list reflects an
actual bench rather than a generic one, and a selftest asserts an owned tool
costs nothing — the total is what is actually being spent.

## Who this is written for

The principal fabricates confidently — has crimped a great many cables and knows
the failure modes — and has no formal EE education, having deliberately avoided
the coursework. **The gap is vocabulary, not capability.** So:

- **Name things.** "The shrouded male header, JST's `B2B-XH-A` family" beats "the
  board-side bit". Naming a part is what makes it orderable and searchable.
- **Give the spec, not the technique.** `SXH-001T-P0.6, 22–28 AWG` is useful;
  "how to make a good crimp" is not.
- **Say the non-obvious fact and stop.** XH is really 2.5 mm despite every
  listing saying 2.54. That is worth a sentence; a tutorial around it is not.

Two rounds of advice have been miscalibrated by assuming inexperience — a
pre-crimped kit was recommended to someone who crimps for a living. When in
doubt, state the fact and let them judge.

## Prices have gone up twice, both times for the same reason

"~$35" (guessed) → "~$56" (generic modules) → **"$69 unbranded / $145 with the
parts actually linked"**. Each revision came from making the estimate more real.
If you quote a price anywhere, take it from `parts.json`, and say which tier.
