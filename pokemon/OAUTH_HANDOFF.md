# OAuth Handoff — poke.mino.mobi

Status: **research-only.** No production code in this branch yet. This document tells the next agent exactly what to wire up so `poke.mino.mobi` can post on a user's behalf via ATProto OAuth, reusing the existing `poll/` BFF worker.

Generated 2026-05-02 from `poll/apps/api/src/oauth/*` (4 modules, ~940 lines total).

---

## A. Architecture summary

`poll/` runs a **BFF (Backend-for-Frontend) confidential client**: the Cloudflare Worker holds an ES256 client signing key and the OAuth refresh token + DPoP key for each user. The SPA never sees a token — it has only an HttpOnly session cookie. The Worker uses `private_key_jwt` (RFC 7523) at the token endpoint and DPoP-bound access tokens (RFC 9449) on PDS write calls. Tokens flow: SPA → Worker session cookie → Worker pulls refresh token + DPoP key from D1 → refreshes access token at user's auth server → calls `com.atproto.repo.createRecord` on user's PDS with `Authorization: DPoP <jwt>` + `DPoP: <proof>`. We use a confidential client (not public-client PKCE) because the access token is PDS write capability; keeping it server-side eliminates token exfiltration via XSS and lets us safely store long-lived refresh tokens in D1 instead of LocalStorage.

---

## B. What's reusable vs new

All four `poll/apps/api/src/oauth/*.ts` modules are **drop-in copy-able** — none hard-code any poll-specific identifier:

| File | Lines | Reusable? | Notes |
|------|-------|-----------|-------|
| `oauth/discovery.ts` | 76 | **Verbatim copy** | Pure ATProto discovery, no poll deps. |
| `oauth/jwt.ts` | 240 | **Verbatim copy** | Pure crypto (DPoP, client assertion, PKCE). |
| `oauth/keypair.ts` | 106 | **Verbatim copy** | D1-backed auto-generated keypair. Uses table `oauth_client_keypair`. |
| `oauth/flow.ts` | 516 | **Verbatim copy** | All identifiers come from `env.OAUTH_CLIENT_ID` and `env.FRONTEND_URL`. Redirect path is hardcoded as `/api/auth/oauth/callback` (line 91 in `flow.ts`) — that's fine if poke uses the same path. |

Reusable but needs **renaming/parameterizing**:

| File | Changes needed |
|------|----------------|
| `routes/auth.ts` | Rename `SESSION_COOKIE = 'atpolls_session'` (line 27) to `mino_poke_session` (or share `mino_session` if running on shared worker). Drop the app-password `startAuth` path if poke is OAuth-only. |
| `index.ts` (`handleClientMetadata`) | All four URL strings (`client_id`, `client_uri`, `redirect_uris`, `client_name`) are hardcoded poll values (lines 304–315). Must be re-emitted for the poke origin. |
| D1 migrations 0005, 0006, 0007 | Apply unchanged to whichever D1 backs the poke worker. Poke can either reuse `atpolls-db` (cheapest — feed already does) or get its own. |

**Poll-specific, do NOT copy:**
- `apps/api/src/durable-objects/poll-coordinator.ts` and `survey-coordinator.ts`
- `apps/api/src/routes/polls.ts`, `ballots.ts`, `surveys.ts`, `survey-ballots.ts`
- `packages/shared/src/crypto/*` (RSA blind signatures — irrelevant)
- The `RSA_PRIVATE_KEY_JWK` / `RSA_PUBLIC_KEY_JWK` secrets (blind-sig only)
- The `ATPROTO_SERVICE_*` secrets (these power the poll *service* PDS bot — only needed if poke also has its own bot account writing to its own repo)

---

## C. The "whitelist" change — there is no static allowlist

**Important finding:** the user said "the existing OAuth worker just needs the new site whitelisted." There is **no allowlist file** — every site that wants to use ATProto OAuth must publish its **own** `client-metadata.json` at its **own** origin. ATProto OAuth uses `client_id = <URL of metadata JSON>`, so each origin is its own client identity by design.

What this means in practice:

- The poll worker **cannot** "whitelist" `poke.mino.mobi`. Poke needs its own `client_id` URL (e.g., `https://poke.mino.mobi/client-metadata.json`) served from poke's origin.
- The redirect URI in poke's metadata MUST be on the same origin as `client_id` (ATProto auth servers enforce this). Suggested: `https://poke.mino.mobi/api/auth/oauth/callback`.
- The Bluesky auth server fetches the metadata JSON at every PAR — there is no registration step, no approval flow.

**Concrete metadata JSON to publish at `https://poke.mino.mobi/client-metadata.json`** (modeled on poll's `handleClientMetadata`, lines 302–343 of `apps/api/src/index.ts`):

```json
{
  "client_id": "https://poke.mino.mobi/client-metadata.json",
  "client_name": "Critter Red",
  "client_uri": "https://poke.mino.mobi",
  "redirect_uris": ["https://poke.mino.mobi/api/auth/oauth/callback"],
  "scope": "atproto transition:generic",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "private_key_jwt",
  "token_endpoint_auth_signing_alg": "ES256",
  "dpop_bound_access_tokens": true,
  "application_type": "web",
  "jwks": { "keys": [ /* injected from D1 oauth_client_keypair at request time */ ] }
}
```

`scope` MUST include `transition:generic` — without it the access token can read but not write `app.bsky.feed.post`. Poll learned this the hard way (see flow.ts:371-374, which only enforces `atproto` is granted; the `transition:generic` requirement is enforced implicitly by the PDS rejecting writes).

---

## D. Step-by-step integration plan

Decision point first: **does poke get its own worker, or share poll's worker?** This doc assumes its own worker (`mino-poke-api`) for clean separation. If sharing, see Open Questions §F.

### D.1 Files to create

1. **`pokemon/api/wrangler.toml`** (new) — minimal worker config:
   - `name = "mino-poke-api"`
   - `main = "src/index.ts"`
   - `compatibility_date = "2024-07-18"`, `compatibility_flags = ["nodejs_compat", "sqlite"]`
   - `[vars]` with `FRONTEND_URL = "https://poke.mino.mobi"`, `ATPROTO_MOCK_MODE = "false"`
   - `[[d1_databases]]` binding `DB`, `database_name = "atpolls-db"` (reuse) OR a fresh DB
   - No DOs needed (poke has no per-resource state machine)

2. **`pokemon/api/src/index.ts`** — entry point. Routes:
   - `GET /client-metadata.json` → `handleClientMetadata(env)` (port from poll index.ts:302–343, with poke URLs)
   - `/api/auth/*` → `handleAuthRoutes()`
   - `POST /api/post` → new endpoint that takes `{text, programJson}` and writes two records to user's PDS:
     - `app.bsky.feed.post` (the visible Bluesky post — text + self-link)
     - `com.minomobi.pokeplay.program` (the structured script record — see open question)
   - Static fallback to `env.ASSETS.fetch(request)` for the SPA files

3. **`pokemon/api/src/oauth/{discovery,jwt,keypair,flow}.ts`** — verbatim copies from `poll/apps/api/src/oauth/`

4. **`pokemon/api/src/routes/auth.ts`** — copy of `poll/apps/api/src/routes/auth.ts`. Edits:
   - `SESSION_COOKIE = 'mino_poke_session'`
   - Delete `startAuth` (app-password path) — poke is OAuth-only
   - Keep `getSession`, `getPdsAccessToken`, the OAuth start/callback/refresh handlers

5. **`pokemon/api/src/routes/post.ts`** — new. Handler for `POST /api/post`:
   - `const auth = await getPdsAccessToken(request, env)`; 401 if null
   - Build the `app.bsky.feed.post` record (text, createdAt, optional facets)
   - POST to `${auth.pdsUrl}/xrpc/com.atproto.repo.createRecord` with `Authorization: DPoP ${auth.accessJwt}` + `DPoP: <proof>`. Use `createDPoPProof(auth.dpopKeyPair, 'POST', url, undefined, auth.accessJwt)` and retry-on-nonce pattern. Pattern is in `poll/apps/api/src/routes/polls.ts` lines 778–830.
   - Repeat for the `com.minomobi.pokeplay.program` record (same flow, different `collection`)

6. **`pokemon/api/migrations/0001_oauth.sql`** — concatenation of poll migrations 0005 + 0006 + 0007 (sessions, oauth_states, oauth_client_keypair, oauth_scope column). Note: the sessions table is created by poll migration 0001 — extract just the CREATE TABLE for sessions if not reusing `atpolls-db`.

7. **`pokemon/api/package.json`** — `{ "type": "module" }` plus `wrangler` devDep.

### D.2 Files to edit

1. **`pokemon/wrangler.jsonc`** — currently a Pages-style static config (`"name": "mino-poke"`, `"assets": { "directory": "." }`). Either:
   - **(a) merge into the worker config**: change to a Workers-with-assets config (mirrors `poll/wrangler.jsonc`) so a single deploy serves both static files and API routes from the worker, OR
   - **(b) keep Pages for static, deploy worker separately at `api.poke.mino.mobi`**: requires CORS configuration and changes the cookie domain story (see Gotchas).

   **(a) is strongly recommended** — that's what poll does and it eliminates the cross-origin cookie problem.

2. **`pokemon/ui.js`** lines 188–208 — replace the `bsky.app/intent/compose` flow with a session-aware fetch to `/api/post`. The button handler should:
   - `GET /api/me` first; if 401, redirect to `/api/auth/oauth/start` (or show a Sign In button that POSTs `{handle}` to `/api/auth/oauth/start` and then `window.location = result.authUrl`)
   - On success, POST `{text, programJson}` to `/api/post` with `credentials: 'include'`
   - Show the returned post URI as a "View on Bluesky" link

3. **`pokemon/index.html`** — add a "Sign in with Bluesky" button + handle input (mirror `poll/apps/web/src/pages/Home.tsx` if that exists, otherwise just a single text input + button calling `loginOAuth`).

### D.3 Worker secrets/vars

Set via Cloudflare dashboard or `wrangler secret put`:

| Name | Type | Value |
|------|------|-------|
| `OAUTH_CLIENT_ID` | secret (or var) | `https://poke.mino.mobi/client-metadata.json` |
| `FRONTEND_URL` | var (in wrangler.toml) | `https://poke.mino.mobi` |
| `ATPROTO_MOCK_MODE` | var | `false` |

**That's it for OAuth.** The legacy `OAUTH_SIGNING_PRIVATE_KEY_JWK` / `OAUTH_SIGNING_PUBLIC_KEY_JWK` secrets in the root `CLAUDE.md` are **no longer needed** — the poll codebase moved to D1-backed auto-generated keypairs (`apps/api/src/oauth/keypair.ts`). The keypair is created on first request to `/client-metadata.json` and persists in the `oauth_client_keypair` D1 table. The fallback at index.ts:324–333 reads the env vars only if the D1 lookup fails on first deploy.

Commands:
```bash
cd pokemon/api
npx wrangler secret put OAUTH_CLIENT_ID
# paste: https://poke.mino.mobi/client-metadata.json
npx wrangler d1 execute atpolls-db --file=migrations/0001_oauth.sql --remote
npx wrangler deploy
# Hit https://poke.mino.mobi/client-metadata.json once to trigger keypair gen.
# Hit https://poke.mino.mobi/api/debug/oauth (port handler from index.ts:350+) to verify.
```

### D.4 Client-metadata JSON URL

Served by the worker at `https://poke.mino.mobi/client-metadata.json`. The JWK in `jwks.keys[]` is read from D1 at request time — never hand-edit. The endpoint sends `Cache-Control: public, max-age=600` and `Access-Control-Allow-Origin: *` (auth server fetches it cross-origin).

### D.5 SPA-side code shape (do NOT implement here, just sketch)

Replacement for `pokemon/ui.js` lines 188–208:

```
postBtn.click:
  user = await fetch('/api/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null)
  if (!user) { showSignInPrompt(); return; }
  body = { text: composeText(script, BOT_HANDLE), program: parseScript(script) }
  res = await fetch('/api/post', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  // res = { postUri, postCid, programUri, programCid }

signInPrompt.submit (handle input):
  res = await fetch('/api/auth/oauth/start', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle, returnTo: location.pathname + location.search })
  })
  window.location.href = res.authUrl
```

### D.6 Compose-replacement summary

Old (`ui.js:206`): `window.open('https://bsky.app/intent/compose?text=...', '_blank')`
New: `fetch('/api/post', { method: 'POST', credentials: 'include', body: ... })` after auth check.

Two records get written per click: the human-readable `app.bsky.feed.post` and the structured `com.minomobi.pokeplay.program` lexicon record (so the bot account can replay scripts by reading the program record instead of parsing post text).

---

## E. Gotchas found while reading

1. **DPoP nonce is per-server and rotates.** Poll caches the nonce *per session* in the `dpop_key_jwk` JSON blob (flow.ts:378–382, 496–500): `JSON.stringify({ ...dpopKeySerialized, nonce: finalNonce })`. Every PDS request must retry on 400/401 if a `DPoP-Nonce` header comes back. The retry pattern needs a **fresh client_assertion** each time too because `jti` must be unique (flow.ts:179–182). Bug-bait: don't reuse the nonce across different servers (auth server vs PDS each rotate independently).

2. **Token refresh requires re-discovery.** `refreshOAuthToken()` (flow.ts:436) calls `discoverAuthServer(pdsUrl)` again rather than caching the token endpoint. This is fine but doubles the latency of every refresh. If poke makes a write per click, consider caching the token endpoint per session.

3. **Session cookie is `SameSite=Lax`, HttpOnly, Secure (when https), Path=/** (auth.ts:67–71). It is **NOT scoped to a domain attribute**, so it stays on the exact origin. If poke deploys the worker on a different subdomain than the SPA (e.g., `api.poke.mino.mobi`), the cookie won't be sent on SPA-origin fetches → auth breaks. **Solution: use the same-origin worker-with-assets pattern (see D.2 option a).**

4. **`startOAuth` requires the user's handle up front** (flow.ts:106). Poke needs an input box — no "Sign in with Bluesky" universal button works because we need to discover the user's PDS before the redirect. (This is an ATProto-ism, not a poll bug.)

5. **OAuth scope must be requested AND granted.** The `scope` param goes into the PAR body (flow.ts:157). The callback verifies `tokens.scope.includes('atproto')` (flow.ts:371) but does NOT verify `transition:generic`. If a user only grants `atproto`, the session is created but PDS writes will 403 silently. The `getMe` endpoint exposes `canPost: session.oauthScope?.includes('transition:generic')` (auth.ts:241) — poke's UI should hide the POST button when `!canPost` and re-prompt for elevated scope.

6. **Identity resolution is unauthenticated and uncached.** `resolveHandle` (flow.ts:45) and `resolvePds` (flow.ts:58) hit `public.api.bsky.app` and `plc.directory` on every login. Both are fast (<100ms typically) but unhandled if those services are down. No retry, no cache.

7. **The `oauth_states` table is single-use.** Row is deleted on callback (flow.ts:263). If the user hits back-button and re-clicks, they get "OAuth state not found" (flow.ts:259). Poke's UI should detect the `?error=` query param after redirect (poll does this in `useAuth.tsx:75–85`) and surface it clearly.

8. **CORS on `/api/*` echoes `FRONTEND_URL` only** (index.ts:175). If poke shares the poll worker, `Access-Control-Allow-Origin` must become a multi-origin check, not the current single-string compare.

9. **No CSRF protection beyond SameSite=Lax.** Poll relies on `SameSite=Lax` to prevent cross-site POSTs. That's adequate for `/api/post` because the cookie won't be sent on third-party form submits, but a state-changing GET would be vulnerable. Keep `/api/post` as POST-only.

10. **The keypair migration (`oauth_client_keypair`) was added late.** Migration 0006 was added after deployment — the fallback in `handleClientMetadata` (index.ts:323–333) reads `OAUTH_SIGNING_PUBLIC_KEY_JWK` from env if D1 lookup fails. Poke can skip this fallback entirely if it runs migration 0006 before first request.

---

## F. Open questions for the user

These need answers **before** the receiving agent can start cleanly:

1. **One worker or two?**
   - Option A: Poke gets its own worker (`mino-poke-api`) deployed under `pokemon/api/`. Clean isolation. Recommended.
   - Option B: Add poke routes to the existing `poll` worker. Saves one Worker billing line but couples the codebases. Cookie domain becomes `.mino.mobi` (no longer per-app), which has security implications.
   - Option C: Pages + separate API worker on a different subdomain. Adds CORS + cookie-domain complications. **Don't pick this.**

2. **Share `atpolls-db` or new D1?** Reusing is cheaper and the `sessions` / `oauth_states` / `oauth_client_keypair` tables are app-agnostic. But poke and poll would share a session table (a session created on one would be visible to the other). Cookie name disambiguates client-side, but a leaked session ID would work on either app. Recommendation: **share `atpolls-db`** with a `app TEXT` column added to `sessions`, OR **new DB** if isolation matters.

3. **Lexicon name for the script record?** Suggestion: `com.minomobi.pokeplay.program` with shape `{ $type, script: string, createdAt: datetime, label?: string }`. Confirm or correct.

4. **Bot account.** User said the bot handle is `poke.mino.mobi`. Confirm:
   - Does that account already exist on Bluesky?
   - Is `pokemon/.well-known/atproto-did` (or `pokemon/_redirects` to the root `.well-known/atproto-did`) configured?
   - Is the bot expected to *read* `com.minomobi.pokeplay.program` records and reply, or just to be tagged in posts? (This doc covers the user-side OAuth — the bot's read/reply loop is a separate workstream and would live in a Worker similar to `workers/bsky-bot/`.)

5. **PWA persistence?** Poll uses a 90-day refresh token stored in IndexedDB (`useAuth.tsx:25–62`) so PWA users stay logged in across cookie expiry. Does poke want the same? (Adds complexity but is copy-paste from poll.)

6. **Scope policy.** Always request `atproto transition:generic`, or have a "read-only" mode that requests just `atproto` and only elevates when the user clicks POST? Poll requests both up front.

7. **TODO confirm:** the user said "OAuth worker just needs the new site whitelisted" — that's not how ATProto OAuth works (see §C). The user may have been thinking of OAuth 2.0 with pre-registered clients. Worth clarifying this expectation before the next agent starts, because it changes the scope of the work (publishing a metadata JSON + standing up a callback route, vs editing a config in the existing worker).
