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

## The /prod editor (this build)

`/prod` (`prod/editor.js`) is now a working mixer, not just a verifier:

- **Load** a session → every track's chunks are pulled across PDSes, reassembled,
  decoded, and placed on one aligned timeline (by `localStartOffsetMs`).
- **Per-track:** gain slider, mute (`M`), solo (`S`).
- **Master trim:** in/out sliders crop the mix; the trimmed regions are shaded on every lane.
- **8-bit music bed:** pick a bed, set its level, preview it, and it's mixed under the
  voices. Beds come from `lib/chiptune.js` — a self-contained extraction of `/music`'s
  Web Audio synth (`playNote` oscillator voices + `OfflineAudioContext` render). A bed is
  rendered one loop offline then **tiled by sample-copy**, so an hour of bed costs one
  short render plus a memcpy, not thousands of oscillator nodes. The "8-Bit Demo" is
  lifted verbatim from `/music`; "Mellow Loop" and "Outro Pulse" are quieter authored beds.
- **Transport:** live preview (per-track gains/mute/bed applied via gain nodes) and
  **render-down** — one `OfflineAudioContext` mix of the audible tracks + bed, cropped to
  the trim, encoded to WAV (the same encoder as `/music`'s export) and downloaded.

Voice buffers are decoded once and reused across the online preview context and the
offline render context (AudioBuffers are context-independent). The render is the seam to
the next slice: instead of (or as well as) downloading, the mixdown becomes the chunked
`com.minomobi.podcast.episode` audio.

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

When these collections are wired to writes, add them to `WRITE_COLLECTIONS` in
`workers/auth/src/oauth/scope.ts` (and a `blob:audio/*` allowance) so the shared OAuth
consent screen covers them.

## Worker routes (`worker.js`)

| Route | Purpose |
|---|---|
| `GET /feed.xml` | iTunes-compatible RSS, generated from `pod_episodes` (D1) |
| `GET /api/episodes` | JSON episode list (powers `/listen` + the landing page) |
| `POST /api/publish` | Register a published episode: resolves the `episode` record, caches a `pod_episodes` row |
| `GET /enclosure?uri=<at-uri>` | Streams an episode's chunked blobs as one file (Range-aware) — the RSS `<enclosure>` |
| `GET /api/health` | `{ ok: true, surface: "pod" }` |
| `WS /api/room/<id>/ws` | Room coordinator signaling (see the sync slice) |
| `/`, `/room/`, `/prod/`, `/listen/`, assets | Served from the `ASSETS` binding |

Every D1 read is **guarded** — until the `pod_episodes` migration lands the feed is valid
but empty, so the surface deploys before the schema does.

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
4. **Drift correction** — for long sessions, periodic re-pings + resample on the measured
   per-client `clockSkewMs` (already captured).
5. Editor polish — crossfade, per-track trim handles, waveform display, ducking the bed
   under speech.
6. Robustness: progressive (during-recording) chunk upload for crash resilience; TURN
   relay for peers behind symmetric NAT; host-reconnect handling in the DO.
