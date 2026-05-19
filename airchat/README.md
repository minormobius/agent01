# airchat — voice-first social on ATProto

Voice posts on Bluesky. Audio lives as a blob on the user's PDS; a custom
lexicon `com.minomobi.airchat.voice` carries the Whisper transcript and a ref
to the blob.

## What it is

```
Browser (MediaRecorder)  ─►  Cloudflare Worker (BFF)  ─►  user's PDS
                                       │
                                       ▼
                                OpenAI Whisper
```

- **Read**: public. Anyone hits `/api/airchat/feed` to read the D1-cached feed
  of every whitelisted user's voice records. Audio plays via the user's PDS
  `com.atproto.sync.getBlob` endpoint.
- **Write**: gated to a small whitelist. The whitelist controls our UX +
  transcription service. Anyone could fork the schema and write to their own
  PDS independently — that's the ATProto promise.

## Tech

- Cloudflare Worker (`worker.js`) — assets binding for the static page, D1 for
  sessions + whitelist + feed cache, OpenAI Whisper proxy.
- Auth: app-password creates a session against the user's PDS; opaque
  `airchat_sid` cookie (httpOnly) maps to a server-side row in
  `airchat_sessions`. Browser never sees the PDS access token. OAuth port is
  a follow-up.
- D1: shared `atpolls-db` (with poll, feed, rite).
- Lexicon: `lexicons/voice.json` (documentation; ATProto does not enforce
  custom lexicons centrally).

## Operator setup (one-time after first deploy)

1. Set the OpenAI key as a worker secret:

   ```sh
   cd airchat
   echo -n 'sk-...' | npx wrangler secret put OPENAI_API_KEY --name airchat
   ```

2. Set an admin key for whitelist management:

   ```sh
   openssl rand -hex 32 | tee /tmp/airchat-admin-key
   cat /tmp/airchat-admin-key | npx wrangler secret put ADMIN_KEY --name airchat
   ```

3. Add yourself to the whitelist. Two equivalent ways:

   **Via API (after secrets are set):**
   ```sh
   curl -X POST https://airchat.mino.mobi/api/airchat/admin/whitelist/add \
     -H "X-Admin-Key: $(cat /tmp/airchat-admin-key)" \
     -H "Content-Type: application/json" \
     -d '{"did":"did:plc:YOUR_DID","handle":"yourhandle.bsky.social","note":"founder"}'
   ```

   **Or via wrangler directly:**
   ```sh
   npx wrangler d1 execute atpolls-db --remote \
     --command "INSERT OR REPLACE INTO airchat_whitelist (did, handle, note) VALUES ('did:plc:YOUR_DID', 'yourhandle.bsky.social', 'founder');"
   ```

4. Add invitees the same way.

## Admin API

All require `X-Admin-Key` header.

| Method | Path | Body |
|---|---|---|
| POST | `/api/airchat/admin/whitelist/add` | `{ did, handle?, note? }` |
| POST | `/api/airchat/admin/whitelist/remove` | `{ did }` |
| GET | `/api/airchat/admin/whitelist/list` | — |

## Cost notes

- Whisper: $0.006 / minute (`whisper-1`). At 100 posts/day × 30s avg = 0.5 min
  × 100 = ~$0.30/day. The worker caps each request at 16 MB, which is well
  inside Whisper's 25 MB ceiling.
- Workers/D1: free tier easily covers expected volume.
- Audio storage: $0 to us; blobs live on the poster's PDS.

## Open follow-ups

- OAuth (DPoP + PAR + private_key_jwt) instead of app passwords. Reuse poll's
  modules — they're already battle-tested for the same flow.
- Threading: lexicon supports `reply` (parent + root); UI needs the
  reply-to-card affordance + a threaded view.
- Mobile UX polish: push-to-talk gesture, haptic feedback on start/stop.
- Per-user rate limit on transcription (currently relies on Cloudflare's
  default request-per-second caps).
