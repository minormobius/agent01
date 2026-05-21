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
- Auth: **OAuth only** (ATProto, PKCE + DPoP + PAR + private_key_jwt,
  confidential client). Worker holds the DPoP-bound access token;
  PDS calls go with `Authorization: DPoP <token>` + a fresh DPoP proof
  per request. Keypair auto-generates in `airchat_oauth_keypair` on
  first `/client-metadata.json` request — no manual secret config.
  Browser only ever sees an opaque `airchat_sid` httpOnly cookie.

  **Minimum-privilege scope:**
  `atproto repo:com.minomobi.airchat.voice blob:audio/*`. The token can
  write our voice lexicon and upload audio blobs — *nothing else*. It
  cannot post to bsky.feed.post, follow accounts, send chat messages,
  upload images, or write any other record collection. Compare to the
  bridge `transition:generic` scope that grants everything a bsky
  client does.

  App-password auth was removed in favor of OAuth-only. Helper
  dispatches for legacy app-pw sessions remain so old sessions degrade
  gracefully (force re-auth on first refresh failure).

- Whitelist (write access): two layers.
  - **`airchat_whitelist` D1 table** — durable; seeded from
    `airchat/whitelist.txt` on every deploy.
  - **Live bsky lists** — listed in `LIVE_WHITELIST_LISTS` in
    `worker.js`. On every auth check, if the DID isn't in the table,
    we fetch the list (cached 5 min per worker isolate) and check
    membership. A hit auto-inserts the DID into the table for O(1)
    future checks.

  **Effect**: adding someone to the bsky list grants them access in
  ≤5 minutes without a redeploy. Removal does NOT auto-revoke — the
  cached row sticks. For a hard revoke:
  `wrangler d1 execute atpolls-db --remote --command "DELETE FROM airchat_whitelist WHERE did = '...'"`.
- D1: shared `atpolls-db` (with poll, feed, rite).
- Lexicon: `lexicons/voice.json` (documentation; ATProto does not enforce
  custom lexicons centrally).

## Verifying a deploy

```sh
curl https://airchat.mino.mobi/api/airchat/health | jq .
```

Should return `{"ok":true,"bindings":{"db":true,"assets":true,"openai":true,"admin":true},...}`.
If `openai` or `admin` are false after a deploy, the corresponding GH
secret isn't set in repo Settings → Secrets → Actions.

## Operator setup (one-time after first deploy)

1. Add `OPENAI_API_KEY` to **GitHub repo secrets**
   (Settings → Secrets and variables → Actions → New repository secret).
   The deploy workflow pushes it to the airchat worker on every deploy
   via `wrangler secret put OPENAI_API_KEY --name airchat`. This avoids
   the common "ran wrangler from the wrong cwd, silently targeted a
   different worker" gotcha — set it once in GitHub Settings, the
   workflow keeps the worker in sync.

   To verify after a deploy, hit `/api/airchat/health` and look for
   `"openai":true` in the bindings:

   ```sh
   curl https://airchat.mino.mobi/api/airchat/health
   ```

2. (Optional) Add `AIRCHAT_ADMIN_KEY` to GH repo secrets if you want
   the admin API enabled. The deploy workflow pushes it to the worker
   as `ADMIN_KEY` on every deploy. If you don't set it, file-based
   whitelist seeding still works.

   ```sh
   # Generate locally if you want one
   openssl rand -hex 32
   ```

   Manual fallback (only if not using GH secrets):

   ```sh
   cd airchat
   echo -n 'sk-...' | npx wrangler secret put OPENAI_API_KEY --name airchat
   ```

   **Important**: always pass `--name airchat`. Without it wrangler uses
   whatever `wrangler.jsonc` it finds in the cwd, which may target the
   wrong worker (eg the root landing-page worker) and silently
   apply the secret there instead.

3. Add yourself + invitees to the whitelist. **Easiest**: edit
   `airchat/whitelist.txt`, commit, push. Three formats accepted:

   - bluesky handle (resolved via public API)
   - DID (inserted as-is)
   - `list:<bsky-list-url-or-at-uri>` — expanded into every member's
     DID. Use this to bulk-grant access from a curated bsky list.

   Idempotent — re-pushing doesn't duplicate or clobber existing
   entries (PRIMARY KEY is the DID).

   Other ways:

   **Via admin API (after ADMIN_KEY is set):**
   ```sh
   curl -X POST https://airchat.mino.mobi/api/airchat/admin/whitelist/add \
     -H "X-Admin-Key: $(cat /tmp/airchat-admin-key)" \
     -H "Content-Type: application/json" \
     -d '{"did":"did:plc:YOUR_DID","handle":"yourhandle.bsky.social","note":"founder"}'
   ```

   **Or wrangler directly:**
   ```sh
   npx wrangler d1 execute atpolls-db --remote \
     --command "INSERT OR REPLACE INTO airchat_whitelist (did, handle, note) VALUES ('did:plc:YOUR_DID', 'yourhandle.bsky.social', 'founder');"
   ```

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
