# Plan: ATProto OAuth Sign-In

## Goal
Replace app-password authentication with ATProto OAuth. Users click "Sign in with Bluesky" → redirect to Bluesky's authorization page → redirect back with session. No more pasting app passwords.

## Architecture: BFF (Backend-for-Frontend)

The Cloudflare Worker handles all OAuth complexity. The frontend is just a redirect target.

```
Browser                          Worker (BFF)                     Bluesky Auth Server
  |                                  |                                    |
  |-- POST /api/auth/oauth/start --> |                                    |
  |   (handle)                       |-- resolve handle → DID → PDS ---> |
  |                                  |-- GET /.well-known/oauth-protected-resource
  |                                  |-- GET /.well-known/oauth-authorization-server
  |                                  |-- POST PAR endpoint (PKCE + DPoP) |
  |                                  |   (returns request_uri)           |
  |                                  |-- store state in D1 ------------> |
  | <-- 200 {authUrl} -------------- |                                    |
  |                                  |                                    |
  |-- redirect to authUrl ---------> |                                    |
  |                                  |                    (user approves) |
  | <-- redirect to callback with code --------------------------------- |
  |                                  |                                    |
  |-- GET /api/auth/oauth/callback ->|                                    |
  |   (?code=...&state=...)          |-- POST token endpoint ----------> |
  |                                  |   (code + PKCE verifier + DPoP)   |
  |                                  |<-- {access_token, refresh_token} - |
  |                                  |-- verify sub DID matches -------> |
  |                                  |-- create session in D1            |
  | <-- redirect to / with cookie -- |                                    |
```

## Key Design Decisions

1. **Confidential client** (private_key_jwt) — we have a backend, so we get longer sessions and stronger auth
2. **DPoP mandatory** — required by ATProto OAuth spec, prevents token theft
3. **PAR mandatory** — required by spec, no query-string leakage of auth params
4. **PKCE S256** — required, prevents authorization code interception
5. **BFF pattern** — all crypto happens server-side, browser never sees tokens
6. **Scope: `atproto transition:generic`** — needed for "Post to Bluesky" feature

## Implementation Steps

### Phase 1: Crypto & Client Identity

**1. Generate client keypair (ES256)**
- Generate ES256 keypair for `private_key_jwt` client authentication
- Store as Worker secrets: `OAUTH_CLIENT_PRIVATE_KEY_JWK`, `OAUTH_CLIENT_PUBLIC_KEY_JWK`
- Add key generation to `scripts/generate-rsa-keypair.js` (rename to `scripts/generate-keys.js`)

**2. Update client-metadata.json**
```json
{
  "client_id": "https://poll.mino.mobi/client-metadata.json",
  "client_name": "ATPolls",
  "client_uri": "https://poll.mino.mobi",
  "redirect_uris": ["https://poll.mino.mobi/api/auth/oauth/callback"],
  "scope": "atproto transition:generic",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "private_key_jwt",
  "token_endpoint_auth_signing_alg": "ES256",
  "jwks": { "keys": [<public key from step 1>] },
  "dpop_bound_access_tokens": true,
  "application_type": "web"
}
```

### Phase 2: OAuth Backend (Worker)

**3. Auth server discovery** (`apps/api/src/oauth/discovery.ts`)
- `fetchProtectedResourceMeta(pdsUrl)` → `GET {pdsUrl}/.well-known/oauth-protected-resource`
- `fetchAuthServerMeta(authServerUrl)` → `GET {authServerUrl}/.well-known/oauth-authorization-server`
- Reuse existing `resolveHandleToDid()` and PDS resolution

**4. DPoP module** (`apps/api/src/oauth/dpop.ts`)
- Generate ES256 DPoP keypair per auth flow (ephemeral, not the client key)
- `createDpopProof(privateKey, method, url, nonce?, accessToken?)` → signed JWT
- Handle nonce rotation (retry on 400 with new `DPoP-Nonce` header)
- Store DPoP private key in D1 session (needed for token refresh)

**5. Client assertion** (`apps/api/src/oauth/client-assertion.ts`)
- `createClientAssertion(clientPrivateKey, clientId, tokenEndpoint)` → signed JWT
- Standard `private_key_jwt` auth per RFC 7523

**6. Start endpoint** (wire into `apps/api/src/routes/auth.ts`)
- `POST /api/auth/oauth/start` handler:
  1. Accept `{ handle }` from frontend
  2. Resolve handle → DID → PDS → auth server metadata
  3. Generate PKCE code_verifier + code_challenge (S256)
  4. Generate state (random)
  5. Generate DPoP keypair (ephemeral)
  6. POST PAR endpoint with client_assertion + DPoP proof
  7. Store in D1 `oauth_states`: state → code_verifier, dpop_key, auth_server_meta, DID
  8. Return `{ authUrl }`

**7. Callback handler** (wire into `apps/api/src/routes/auth.ts`)
- `GET /api/auth/oauth/callback?code=...&state=...&iss=...`:
  1. Look up state in D1 → get code_verifier, dpop_key, token_endpoint
  2. Delete state row (single-use)
  3. Exchange code for tokens (client_assertion + DPoP proof)
  4. Verify `sub` matches expected DID
  5. Create session in D1 (store OAuth refresh_token + dpop_key)
  6. Redirect to frontend with session cookie

**8. Token refresh update**
- Update `getPdsAccessToken()` for OAuth sessions:
  - Use stored OAuth refresh_token + DPoP key
  - Handle single-use refresh token rotation
  - Handle DPoP nonce rotation

### Phase 3: D1 Schema

**9. Migration `0005_oauth.sql`**
```sql
CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  dpop_private_key_jwk TEXT NOT NULL,
  did TEXT,
  auth_server_url TEXT NOT NULL,
  token_endpoint TEXT NOT NULL,
  pds_url TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

ALTER TABLE sessions ADD COLUMN dpop_private_key_jwk TEXT;
ALTER TABLE sessions ADD COLUMN auth_method TEXT DEFAULT 'app_password';
```

### Phase 4: Frontend

**10. Login UI**
- Replace handle + app password form with:
  - Handle input field
  - "Sign in with Bluesky" button
- Button calls `/api/auth/oauth/start` → redirects to Bluesky
- On callback, session cookie is set → `GET /api/me` succeeds

**11. QuickVote redirect preservation**
- Before redirect, store `{pollId, choice}` in sessionStorage
- After OAuth callback redirect to `/`, check sessionStorage
- If pending vote exists, redirect to `/v/{pollId}?c={choice}` to continue

**12. Update useAuth hook**
- Add `loginWithOAuth(handle)` — calls start endpoint, redirects
- Keep `loginWithAppPassword` behind env flag for local dev
- Handle post-callback initialization (detect fresh session)

### Phase 5: Mock Mode

**13. Update mock mode**
- When `ATPROTO_MOCK_MODE=true`, skip OAuth and create session directly from handle
- Mock the start endpoint to return a fake authUrl that immediately callbacks
- No network calls needed for local dev

### Phase 6: Cleanup & Docs

**14. Update docs**
- CLAUDE.md: Document OAuth flow, new secrets
- README.md: Update deployment secrets list
- PROTOCOL.md: Note OAuth as auth method

## Files Changed

### New files
- `apps/api/src/oauth/discovery.ts`
- `apps/api/src/oauth/dpop.ts`
- `apps/api/src/oauth/client-assertion.ts`
- `apps/api/migrations/0005_oauth.sql`

### Modified files
- `apps/api/src/routes/auth.ts` — add OAuth routes
- `apps/api/src/index.ts` — add OAuth env vars
- `apps/web/src/hooks/useAuth.tsx` — OAuth login flow
- `apps/web/src/components/Layout.tsx` — "Sign in with Bluesky" button
- `apps/web/src/pages/QuickVote.tsx` — redirect preservation
- `apps/web/public/client-metadata.json` — real metadata
- `scripts/generate-rsa-keypair.js` → `scripts/generate-keys.js` — add ES256

## New Secrets
- `OAUTH_CLIENT_PRIVATE_KEY_JWK` — ES256 private key for client_assertion
- `OAUTH_CLIENT_PUBLIC_KEY_JWK` — ES256 public key (embedded in client-metadata.json)

## Risks & Mitigations

1. **DPoP key storage in D1**: Sensitive, but same risk profile as existing refresh tokens. D1 is encrypted at rest on Cloudflare.

2. **QuickVote UX**: The redirect breaks the inline voting flow. Mitigated by sessionStorage preservation of intent. First-time voters see one redirect; returning voters (existing session) vote instantly.

3. **Auth server availability**: If Bluesky's auth server is down, no one can log in. Same risk as current PDS dependency, but now through a different endpoint.

4. **Scope breadth**: `transition:generic` is broad. Could split into voter scope (`atproto` only) and host scope (`transition:generic`) later. For v1, single scope is simpler.

5. **Fallback**: Keep app-password auth behind `ATPROTO_MOCK_MODE` or a feature flag. Remove from production UI but keep the endpoint for emergencies.
