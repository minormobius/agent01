# airchat — airchat.mino.mobi, yapchat.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Voice-first social on ATProto. Browser records, Whisper transcribes, PDS holds the audio. Identity via Bluesky OAuth.

## Facts

| | |
|---|---|
| Surface | `airchat` |
| Dir | `airchat/` |
| Endpoint | `airchat.mino.mobi, yapchat.mino.mobi` |
| Type | fullstack |
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-airchat.yml` |
| Uses | `atpolls-db` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "airchat"`.

## Airchat

**Live at**: `airchat.mino.mobi`
**Stack**: Cloudflare Worker + D1 + OpenAI Whisper
**Deploy**: `.github/workflows/deploy-airchat.yml`

## What It Does

Voice posts on ATProto. Browser records audio (MediaRecorder API), worker proxies the audio through OpenAI Whisper for transcription, and the worker uploads the audio as a blob to the user's PDS + writes a `com.minomobi.airchat.voice` record referencing the blob. Reads are public (D1 cache of every whitelisted user's records, audio served via the author's PDS `com.atproto.sync.getBlob`). Writes are gated to a small whitelist.

## Architecture

```
Browser (MediaRecorder)  ─►  Cloudflare Worker (BFF)
                                       ├── OpenAI Whisper (transcribe)
                                       ├── user's PDS (uploadBlob + createRecord)
                                       └── D1 (sessions + whitelist + feed cache)
```

## Auth

**OAuth only** (app-password removed). Confidential-client ATProto OAuth — PKCE + DPoP + PAR + `private_key_jwt`. Ported from poll's `apps/api/src/oauth/` to vanilla JS in `airchat/oauth/`. Keypair auto-generates in `airchat_oauth_keypair` (D1, singleton) on first `/client-metadata.json` request — no manual secret config. PDS calls are made with `Authorization: DPoP <token>` plus a fresh DPoP proof per request. Browser only ever holds an opaque `airchat_sid` httpOnly cookie.

**Minimum-privilege scope**: `atproto repo:com.minomobi.airchat.voice blob:audio/*` — the token can write our voice lexicon + upload audio blobs, nothing else (no `transition:generic`).

App-pw helper dispatches (`pdsAuthCall`, `ensureFreshAccess`) remain so legacy app-pw sessions degrade gracefully (force re-auth on first refresh failure).

## Whitelist

Two layers:
- **`airchat_whitelist` D1 table** — durable; seeded from `airchat/whitelist.txt` (handles, DIDs, `list:` entries) on every deploy.
- **`LIVE_WHITELIST_LISTS` in worker.js** — bluesky lists treated as live source of truth. On every auth check, if the DID isn't in the table, we fetch the list (cached 5 min per worker isolate) and check membership. A hit auto-inserts the DID for O(1) future checks. Adding to the bsky list grants access in ≤5 min without a redeploy; removal does NOT auto-revoke (manual DELETE required).

## Migration history

- `0018_airchat.sql` — whitelist, sessions, voices feed cache.
- `0019_airchat_oauth.sql` — OAuth keypair singleton + ephemeral states + `airchat_sessions` columns (`auth_method`, `dpop_key_jwk`, `oauth_scope`).

## Lexicon

`com.minomobi.airchat.voice` — schema doc at `airchat/lexicons/voice.json`. Fields: `audio` (blob ref), `text` (transcript), `duration` (sec), `createdAt`, optional `reply.{parent,root}`, optional `lang[]`.

The bsky appview ignores non-`app.bsky.*` collections, so these records don't enter the firehose-indexable space. They live on the user's own PDS, paid for by the user; the blob is pinned as long as the record references it. We pay $0 for storage.

## Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/airchat/health` | Health + bindings check |
| GET | `/api/airchat/whitelist/check` | Public: is this DID on the whitelist? Optional session-aware |
| POST | `/api/airchat/auth/start` | App-password sign-in; returns session cookie |
| POST | `/api/airchat/auth/oauth/start` | Start OAuth flow; returns auth URL to redirect to |
| GET | `/api/airchat/auth/oauth/callback` | OAuth callback (auth server redirects here); establishes session + 302s to `/` |
| GET | `/client-metadata.json` | OAuth client metadata + public key (served from D1 keypair) |
| GET | `/api/airchat/auth/me` | Current session info |
| POST | `/api/airchat/auth/logout` | Drop session |
| POST | `/api/airchat/transcribe` | Audio body → Whisper → transcript |
| POST | `/api/airchat/post` | Multipart (audio + meta) → uploadBlob + createRecord + cache |
| GET | `/api/airchat/feed` | Public: feed of all whitelisted users' voices (paginated) |
| GET | `/api/airchat/voice` | Public: single voice record by URI |
| POST | `/api/airchat/admin/whitelist/{add,remove}` | Admin (X-Admin-Key) |
| GET | `/api/airchat/admin/whitelist/list` | Admin |

## D1 Tables (on shared `atpolls-db`)

- `airchat_whitelist (did PRIMARY KEY, handle, added_at, added_by, note)`
- `airchat_sessions (session_id PRIMARY KEY, did, handle, pds_url, access_jwt, refresh_jwt, access_expires_at, created_at, last_seen_at)`
- `airchat_voices (uri PRIMARY KEY, did, rkey, cid, pds_url, audio_cid, audio_mime, audio_size, duration_sec, text, reply_root_uri, reply_parent_uri, created_at, indexed_at)`
- `airchat_oauth_keypair (id=1 singleton, private_key_jwk, public_key_jwk, kid, created_at)` — auto-generated on first `/client-metadata.json` request
- `airchat_oauth_states (state PRIMARY KEY, code_verifier, dpop_key_jwk, did, pds_url, auth_server_url, token_endpoint, dpop_nonce, return_to, created_at, expires_at)` — ephemeral, 5-minute TTL

Migrations: `poll/apps/api/migrations/0018_airchat.sql` + `0019_airchat_oauth.sql`.

## Required Secrets

- `OPENAI_API_KEY` — Whisper (`whisper-1` model)
- `ADMIN_KEY` — gates `/api/airchat/admin/*` for whitelist mgmt
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — already in GH Actions

## Cost notes

- Whisper: $0.006/min. At 100 posts/day × 30s avg → ~$0.30/day. Per-request hard cap of 16 MB (Whisper's ceiling is 25 MB).
- Audio storage: $0 to us (lives on poster's PDS).
- Workers/D1: comfortably under free tier.

---


## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-airchat.yml`](../.github/workflows/deploy-airchat.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
