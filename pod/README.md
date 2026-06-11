# pod — minomobi Podcast Studio

**Live at:** `pod.mino.mobi` *(domain attach pending — first deploy stands the worker up at `pod.workers.dev`)*
**Stack:** Cloudflare Worker (assets binding) + D1 (shared `atpolls-db`) + ATProto PDS blobs
**Deploy:** `.github/workflows/deploy-pod.yml`

A browser podcast studio built on ATProto. Get people talking in a room, record each
voice locally at full quality, collect the tracks, edit them down, publish an RSS feed.

```
pod.mino.mobi/          landing + RSS feed of published episodes
pod.mino.mobi/room/     the lobby — permalinked rooms people join to record
pod.mino.mobi/prod/     the editor — collect tracks, align, mix, publish
pod.mino.mobi/feed.xml  iTunes-compatible RSS
```

This directory is currently the **scaffold**: the worker, landing page, RSS generator,
lexicons, and deploy wiring are in place. `/room` and `/prod` are documented placeholders.

---

## The pipeline (6 steps) and where each stands

| Step | Status | Notes |
|---|---|---|
| 1. Multi-person lobby over the internet | **Built** (`/room`, own `RoomCoordinator` DO) | `audio/` kept separate by decision; pod has its own |
| 2. Record locally per participant | **Built** (`/room`) | The "double-ender": each browser records **its own mic** at 128 kbps; WebRTC is monitoring only |
| 3. Send recordings to an accessible location | **Built** | Chunked atproto blobs (byte-range slices) on each speaker's own PDS |
| 4. Collect all recordings in one browser | **Built** (`/prod`) | Driven by the `session` manifest record |
| 5. Sync tracks + edit down | **Built** (`/prod`) | Aligned timeline + per-track gain/mute/solo + master in/out trim + render-down to WAV |
| 6. Bring in music tracks | **Built** (`/prod`) | 8-bit chiptune beds rendered from `/music`'s synth (`lib/chiptune.js`) |

## The sync slice — what this build wires end-to-end

`/room` (`room/studio.js`) + the `RoomCoordinator` DO (`worker.js`) + `/prod`
(`prod/editor.js`) form a working loop:

1. **Sign in** via the shared `auth.mino.mobi` OAuth client (vendored to `pod/lib/auth.js`).
2. **Join a room** — first opener is host; the `?r=<roomId>` link invites others. WebRTC
   mesh (lower-DID-initiates) carries the live conversation; STUN only.
3. **Clock sync** — 7 NTP-style pings to the DO; the smallest-RTT sample gives
   `clockOffsetMs` (server − client).
4. **Host arms recording** — the DO stamps one `epochMs` and broadcasts it. Every client
   starts a high-quality local `MediaRecorder` and records
   `localStartOffsetMs = recStart + clockOffset − epoch`.
5. **Stop → upload** — each client byte-slices its recording into ≤4 MB chunks, uploads
   each as an atproto blob via the auth proxy, and writes a `com.minomobi.podcast.track`
   (chunks + sync metadata). The host maintains the `com.minomobi.podcast.session` manifest.
6. **Verify in `/prod`** — load the session, pull every track's chunks (across PDSes),
   reassemble + decode, and play them aligned by `localStartOffsetMs`. If sync holds, the
   voices overlap naturally.

## The /prod editor (clip-based, mobile-first)

`/prod` (`prod/editor.js`) is a clip timeline, not a fixed mixer:

- **Load** a session → every track's chunks are pulled across PDSes, reassembled and
  decoded into one **clip per track**, positioned on its own lane by the recorded
  `localStartOffsetMs` (the captured alignment is the starting layout).
- **Clips** are the unit of editing: **drag the body to move**, **drag an edge to crop**
  (trim head/tail), **duplicate**, **delete**, set **gain**, **mute**. Selecting a clip
  opens an inspector with all of it plus ±100 ms nudge.
- **Music as blocks:** *+ Music* renders an 8-bit bed (`lib/chiptune.js`) to a short clip
  you place, crop, and duplicate **freely against the voices** — not a fixed full-length
  bed. Music lives on its own lane.
- **Voice filters:** per voice clip — Warm, Phone, Bright, Robot, Chipmunk, Deep. Ported
  from `airchat/lib/filters.js` to `lib/filters.js` (offline `AudioBuffer→AudioBuffer`
  renders, no external deps). Applying a filter recomputes the clip's effective buffer;
  pitch filters change length, so the crop re-clamps.
- **Timeline:** fixed px/second with zoom ±, horizontal scroll, a left lane gutter — built
  **mobile-first** (the controls no longer run off-screen). Drag is pointer-events, so
  touch and mouse both work.
- **Transport / export:** live preview and **render-down** — one `OfflineAudioContext`
  pass over all clips (`scheduleClips`) → WAV (same encoder as `/music`'s export) →
  download or publish.

Decoded voice buffers and filtered/bed buffers are reused across the preview and offline
render contexts (AudioBuffers are context-independent). `scheduleClips()` is the single
path behind preview, download, and publish.

### Prerequisites to actually run it

- **`pod.mino.mobi` must be attached** (not `pod.workers.dev`): the OAuth client calls
  `auth.mino.mobi` with credentials, which only allows `*.mino.mobi` origins, and the
  `.mino.mobi` SSO cookie can't reach `workers.dev`.
- **Scope:** login requests `transition:generic` for now so writes to the new podcast
  collections work against the already-deployed auth worker. Tighten to enumerated
  `repo:com.minomobi.podcast.*` + `blob:audio/*` once those are added to
  `workers/auth/src/oauth/scope.ts` and auth redeploys (`SCOPE` in `room/studio.js`).

## Decisions locked in

- **Storage: chunked atproto blobs.** Every track and the final mixdown is split into
  ordered sub-blobs (≤50 MB each) referenced by a record. $0 storage cost to minomobi —
  each speaker's audio lives on their own PDS (airchat's economics). The trade-off: a
  podcast `<enclosure>` must be **one** dereferenceable URL, so the worker will stitch an
  episode's chunks behind a single range-seekable `/enclosure/<rkey>` route.
- **`audio/` stays separate.** pod builds its own recording-aware room (modeled on
  `audio/apps/api/src/durable-objects/room-coordinator.ts`) rather than absorbing it.

## The four load-bearing problems

1. **Local recording, not the call.** A studio beats "record the Zoom" because each
   participant records their own mic locally at full fidelity (48 kHz, high-bitrate Opus,
   ideally stereo) while WebRTC carries only the lossy real-time mix for monitoring. Keep
   the N pristine local tracks; throw the mesh audio away. (airchat records mono 32 kbps —
   far too low; bump quality here.)

2. **Track synchronization — the hard one.** N independently-recorded tracks start at
   different moments and their audio clocks drift (tens–hundreds of ms over an hour).
   Hybrid plan:
   - *Coarse:* the room broadcasts a shared **recording epoch** (one server timestamp);
     each client stores its local-start offset (`localStartOffsetMs`).
   - *Fine:* an audible sync tone/countdown at the top, for peak-alignment fallback.
   - *Drift:* periodic NTP-style round-trips through the DO estimate per-client clock skew
     (`clockSkewMs`), corrected by resampling in `/prod`.

3. **Large files over atproto blobs.** PDS blob size limits force chunking for hour-long
   tracks. Chunking also gives crash resilience and progressive upload during recording.
   The published enclosure is stitched back into one URL by the worker.

4. **Editor memory ceiling.** Decoded PCM is ~10 MB/min/stereo-track — a 1-hour 4-person
   session is multiple GB if naïvely decoded. `/prod` must do lazy/streamed decode and
   chunked `OfflineAudioContext` render-down, not "load it all."

## Lexicons (`pod/lexicons/`)

- `com.minomobi.podcast.track` — one participant's local recording: ordered blob `chunks`
  + sync metadata (`epochMs`, `localStartOffsetMs`, `clockSkewMs`, `sampleRate`, …).
- `com.minomobi.podcast.session` — a room session: `roomId`, `host`, `participants`, and
  the AT-URIs of every track. The manifest `/prod` loads.
- `com.minomobi.podcast.episode` — a published episode: the mixdown as ordered `audio`
  chunks + RSS metadata (`pubDate`, `episodeNumber`, `durationSec`, `image`, `guid`).
- `com.minomobi.podcast.subscription` — one feed the user follows in `/app` (`url`, cached
  `title`, `createdAt`). rkey = deterministic hash of the URL (idempotent, no dupes).

When these collections are wired to writes, add them to `WRITE_COLLECTIONS` in
`workers/auth/src/oauth/scope.ts` (and a `blob:audio/*` allowance) so the shared OAuth
consent screen covers them.

## Worker routes (`worker.js`)

| Route | Purpose |
|---|---|
| `GET /u/<handle-or-did>/feed.xml` | **Per-publisher RSS, owned by their PDS** — lists that repo's episode records live, no D1 (see below) |
| `GET /feed.xml` | Communal RSS across all publishers, generated from `pod_episodes` (D1) |
| `GET /api/episodes` | Communal JSON episode list (D1) |
| `GET /api/episodes?handle=<h>` | One publisher's episodes, read straight from their PDS |
| `POST /api/publish` | Add an episode to the *communal* discovery feed (resolves the record, caches a `pod_episodes` row) |
| `GET /api/shows` | Distinct publishers on the communal feed (powers the `/shows` directory) |
| `GET /api/fetch?url=<feed>` | **Guarded** server-side RSS proxy so `/app` can read any cross-origin feed |
| `GET /enclosure?uri=<at-uri>` | Streams an episode's chunked blobs as one file (Range-aware) — the RSS `<enclosure>` |
| `GET /api/health` | `{ ok: true, surface: "pod" }` |
| `WS /api/room/<id>/ws` | Room coordinator signaling (see the sync slice) |
| `/`, `/room/`, `/prod/`, `/listen/`, `/shows/`, `/app/`, assets | Served from the `ASSETS` binding |

Every D1 read is **guarded** — until the `pod_episodes` migration lands the communal feed
is valid but empty, so the surface deploys before the schema does.

### Per-publisher feeds are PDS-owned

A user's podcast feed at **`/u/<handle>/feed.xml`** needs no central state. The episode
records live in *their* repo (`com.minomobi.podcast.episode`) and the enclosure streams
from *their* PDS, so the worker just: resolve handle → DID → PDS, `listRecords` the episode
collection, render RSS. The channel title / artwork / summary come from the publisher's
Bluesky profile (`getProfile`). **Writing the episode record IS publishing the feed** —
the user's RSS updates the moment `/prod` calls `createRecord`, with no write to our D1.

`POST /api/publish` and the communal `/feed.xml` are *only* for cross-user discovery: they
add a row to `pod_episodes` so an episode also shows on the all-publishers feed and the
`/listen` home. A publisher who never hits `/api/publish` still has a complete, working,
self-owned feed at `/u/<handle>/feed.xml`. `/listen?handle=<h>` is the human view of one
show, also sourced from the PDS.

## Discovery (`/shows`) + the podcast app (`/app`)

- **`/shows`** — a directory of every publisher (`/api/shows` = `DISTINCT did` over
  `pod_episodes`), each hydrated with their Bluesky profile and linking to their
  PDS-owned feed + an "Add to app" deep-link (`/app/?add=<feed>`).
- **`/app`** — a real, self-contained podcast client (no build). Subscribe to **any** RSS
  feed, parse it client-side with `DOMParser`, and play episodes in a sticky player.
  - **Subscriptions are PDS records.** Signed in, each feed is a
    `com.minomobi.podcast.subscription` record in *your* repo, so subscriptions sync
    across every device. The rkey is a deterministic FNV-1a hash of the feed URL, so the
    same feed is never duplicated (`putRecord` is idempotent). Signed out, they live in
    `localStorage`; on sign-in, local-only feeds are pushed up and the PDS becomes the
    source of truth. Auth is the shared OAuth client (SSO cookie, so a session from any
    `*.mino.mobi` site is picked up automatically).
  - **Saved feeds** render in a bounded, **scrollable** list (not an overflowing chip row).
  - Same-origin feeds (our PDS feeds) are fetched directly; cross-origin feeds go through
    **`/api/fetch`**, a guarded server-side proxy — `http(s)` only, private/loopback hosts
    blocked (basic SSRF defense), feed-ish content-types only, 5 MB cap, 5-min cache. Audio
    enclosures play straight from their host by the `<audio>` element, never via the proxy.

## Roadmap (next slices)

1. ~~**Sync slice** — dual local recording + server epoch + chunked upload + `session`
   manifest, end-to-end for one room.~~ **Done (this build).**
2. ~~`/prod` editing — gain/trim + music/bed tracks; render-down.~~ **Done.**
3. ~~**Publish flow** — `/prod` publishes the mixdown as a chunked
   `com.minomobi.podcast.episode`; `pod_episodes` migration + the `/enclosure`
   streaming route; `/listen` feed player; handle typeahead.~~ **Done (this build).**
   - **Known limit:** episodes publish as **WAV** (what `/prod` renders). The
     enclosure *streams* chunks so the worker never holds the whole file, but
     WAV is heavy on the publisher's PDS for long episodes. Next: encode the
     mixdown to MP3/Opus client-side before chunking (vendor `lamejs` or use an
     `OfflineAudioContext`→Opus path).
   - **Scope note:** publishing writes `com.minomobi.podcast.episode`, so it
     needs a session minted with `transition:generic` (what `/room` + `/prod`
     request). An existing UNIFIED-scope SSO session can't write episodes until
     the podcast collections are added to `workers/auth/src/oauth/scope.ts`.
4. ~~**Clip editor** — move/crop/duplicate/delete clips, music as placeable blocks,
   per-clip voice filters (ported from airchat), mobile-first timeline.~~ **Done (this build).**
5. **Drift correction** — for long sessions, periodic re-pings + resample on the measured
   per-client `clockSkewMs` (already captured).
6. Editor polish — waveform display in clips, snapping/magnetic edges, crossfade on
   overlap, ducking the music bed under speech, auto-scroll the playhead.
7. Robustness: progressive (during-recording) chunk upload for crash resilience; TURN
   relay for peers behind symmetric NAT; host-reconnect handling in the DO; MP3/Opus
   episode encoding (the WAV limit above).
