# poll.mino.mobi — ATPolls

## What This Is

ATPolls — verifiable, anonymous polling on Bluesky. Any Bluesky user can create a poll. Any eligible Bluesky user can vote. RSA Blind Signatures (RFC 9474) ensure the host cannot link voter identity to ballot choice. Anonymity is cryptographic, not trust-based.

The protocol design, threat model, and cryptographic rationale live in `poll/PROTOCOL.md`.

## Core Concept

Chaumian blind credentials adapted for ATProto polls:

1. Voter authenticates (proves DID) → host verifies eligibility
2. Voter blinds a token message → host blind-signs it (never sees the token)
3. Voter unblinds → now holds a valid RSA-PSS signature the host can verify but never link
4. Voter submits ballot with credential (no session, no identity) → host verifies signature + nullifier

The host knows **who** is eligible. The host sees **what** was voted. These two sets never intersect — the blind signature is the cryptographic wall between them.

## Architecture

```
Cloudflare Pages (React SPA) → Cloudflare Worker (API)
                                      ├── Durable Objects (per-poll coordinator)
                                      ├── D1 (persistent storage)
                                      └── ATProto PDS (public ballot records)
```

### Durable Objects

Each poll gets a `PollCoordinator` DO keyed by poll ID. The DO is the **authoritative write path** for all state mutations:

- Eligibility consumption (one credential per DID, atomic)
- Blind signing (RSA-PSS over blinded message)
- Ballot acceptance (signature verification + poll binding + nullifier derivation check + nullifier uniqueness)
- Tally computation
- Audit event logging (rolling hash chain)

D1 is the durable store. The DO writes to D1 after accepting state changes.

### Service PDS

A dedicated Bluesky account (`poll.mino.mobi`) whose repo is the **canonical public bulletin board**. It holds:

- `com.minomobi.poll.def` — poll definitions
- `com.minomobi.poll.ballot` — anonymized ballots (published at close, shuffled)
- `com.minomobi.poll.tally` — final tally snapshots

The service account has no personal identity. It's the ballot box.

## Directory Structure

```
poll/
├── PROTOCOL.md              # Protocol design, threat model, cryptographic rationale
├── CLAUDE.md                # This file — implementation guide
├── README.md                # Setup, deployment, API reference
├── apps/
│   ├── web/                 # React + Vite frontend (Cloudflare Pages)
│   │   ├── src/
│   │   │   ├── pages/       # Home, CreatePoll, Poll, Vote, QuickVote, Audit, Admin
│   │   │   ├── hooks/       # useAuth (ATProto app-password auth + refresh tokens)
│   │   │   ├── lib/         # API client
│   │   │   └── components/  # Layout
│   │   └── public/
│   │       └── client-metadata.json  # ATProto OAuth client metadata
│   └── api/                 # Cloudflare Worker backend
│       ├── src/
│       │   ├── index.ts             # Entry point, CORS, routing
│       │   ├── durable-objects/
│       │   │   └── poll-coordinator.ts  # Per-poll DO — the core
│       │   └── routes/
│       │       ├── polls.ts     # CRUD, eligibility, publishing, share-to-bluesky
│       │       ├── ballots.ts   # Anonymous ballot submission + public listing
│       │       └── auth.ts      # App-password verification, sessions, refresh
│       └── migrations/          # D1 SQL migrations (0001–0004)
├── packages/
│   └── shared/              # Shared types, schemas, crypto, ATProto publisher
│       └── src/
│           ├── types/       # Domain types (Poll, Ballot, Tally, etc.)
│           ├── schemas/     # Zod validation (CreatePollSchema, etc.)
│           ├── crypto/      # Credential lifecycle:
│           │                #   deriveTokenMessage (structured, poll-bound)
│           │                #   parseTokenMessage
│           │                #   deriveNullifier (SHA-256 from tokenMessage)
│           │                #   blind/sign/finalize/verify (RFC 9474)
│           │                #   computeBallotCommitment, makeReceipt, audit hash
│           └── atproto/     # PdsPublisher + MockPublisher
└── docs/
    ├── architecture.md      # System architecture summary
    └── threat-model.md      # Trust boundaries and attack mitigations
```

## Authentication

### ATProto OAuth (Primary)

Users authenticate via the standard ATProto OAuth flow (OAuth 2.1 profile with PKCE + DPoP + PAR). The Worker acts as a BFF (Backend-for-Frontend) confidential client.

**Flow**:
1. User enters their Bluesky handle
2. Backend resolves handle → DID → PDS → authorization server (via `.well-known/oauth-protected-resource` + `.well-known/oauth-authorization-server`)
3. Backend makes a PAR (Pushed Authorization Request) with PKCE + DPoP + client_assertion
4. User is redirected to Bluesky's authorization page
5. User approves, redirected back to `/api/auth/oauth/callback`
6. Backend exchanges code for tokens (DPoP-bound), verifies `sub` matches DID
7. Creates session in D1 (stores OAuth refresh token + DPoP key for token refresh)

**Key design**:
- **Confidential client** (`private_key_jwt`): ES256 keypair authenticates the client at the token endpoint
- **DPoP mandatory**: Ephemeral ES256 keypair per flow, DPoP proofs on all token requests
- **PAR mandatory**: Authorization parameters sent server-to-server, not in URL
- **PKCE S256**: Prevents authorization code interception
- **Scope**: `atproto transition:generic` (needed for "Post to Bluesky" feature)

**OAuth modules**: `apps/api/src/oauth/`
- `jwt.ts` — DPoP proofs, client assertions, PKCE, ES256 key management
- `discovery.ts` — auth server discovery from PDS
- `flow.ts` — PAR, callback, token refresh

**Secrets required**:
- `OAUTH_CLIENT_ID` — must match `client_id` in `client-metadata.json`
- `OAUTH_CLIENT_PRIVATE_KEY_JWK` — ES256 private key for client_assertion
- `OAUTH_CLIENT_PUBLIC_KEY_JWK` — ES256 public key (also in client-metadata.json `jwks`)

Generate with: `node scripts/generate-rsa-keypair.js` (generates both RSA + OAuth keys in one run)

### App-Password Auth (Fallback)

App-password auth is kept for local development and as a fallback. Users can expand "Use app password instead" in the login form.

1. User enters handle + app password
2. Backend verifies via `com.atproto.server.createSession` on user's PDS
3. Stores PDS refresh token in D1 for later use (posting to Bluesky)
4. Creates local session

### Posting to Bluesky

The "Post to Bluesky" button uses the session's stored credentials:
- **OAuth sessions**: Refreshes the DPoP-bound OAuth token to get a PDS access token
- **App-password sessions**: Uses the stored PDS refresh token directly

Both paths call `getPdsAccessToken()` which dispatches based on `auth_method` in the sessions table.

## Credential System

### Token Message

```
anonpoll:v1:{pollId}:{expiryISO}:{hmacHex}
```

Derived client-side: `deriveTokenMessage(pollId, secret, expiry)`. The HMAC ties it to the voter's random secret. The structured format lets the server parse and enforce poll binding.

### Nullifier

```
nullifier = SHA-256("nullifier\0" + tokenMessage)
```

Derived from the token message by both client and server. The server recomputes and enforces the match — prevents arbitrary nullifier injection.

### Blind Signature Flow

1. Client: `secret = randomHex(32)`
2. Client: `tokenMessage = deriveTokenMessage(pollId, secret, expiry)`
3. Client: `{blindedMsg, inv} = blind(tokenMessage, hostPublicKey)`
4. Client → Server: `POST /eligibility/request` with `{blindedMessage}` + session auth
5. Server: verify DID eligible, consume DID atomically, `blindSig = blindSign(blindedMsg, privateKey)`
6. Server → Client: `{blindedSignature}`
7. Client: `issuerSignature = finalize(tokenMessage, blindedSig, inv, publicKey)`
8. Client: `nullifier = deriveNullifier(tokenMessage)`
9. Client → Server: `POST /ballots/submit` with `{tokenMessage, issuerSignature, nullifier, choice}` — **no session**
10. Server: parse tokenMessage → enforce pollId. Verify RSA-PSS signature. Recompute nullifier → enforce match. Check nullifier uniqueness. Accept.

### Server-Side Verification (handleBallot)

```
1. parseTokenMessage(tokenMessage) → {pollId, expiry, hmac}
2. Reject if pollId !== state.poll.id
3. verifyRSACredential(tokenMessage, issuerSignature, publicKey)
4. expectedNullifier = deriveNullifier(tokenMessage)
5. Reject if nullifier !== expectedNullifier
6. Reject if nullifier already in spent set
7. Accept ballot, add nullifier to spent set
```

## Eligibility Modes

Polls support multiple eligibility restrictions:

| Mode | Description |
|------|-------------|
| `open` | Any Bluesky user |
| `followers` | Host's followers (snapshot at creation, re-syncable in draft) |
| `mutuals` | Host's mutuals (snapshot at creation, re-syncable in draft) |
| `at_list` | Members of an ATProto list (snapshot at creation) |
| `did_list` | Explicit DID whitelist (set at creation) |

Eligible DIDs are stored in `poll_eligible_dids` table. The DO checks this table during eligibility requests.

## Poll Lifecycle

```
draft → open → closed → finalized
```

- **draft**: Configure poll, sync eligible DIDs, no voting
- **open**: Voters can request credentials and submit ballots
- **closed**: No new ballots accepted. Host can publish ballots to PDS.
- **finalized**: Irreversible. Tally is final.

## Public Bulletin Board

**PDS is canonical.** The service PDS publishes full `(tokenMessage, issuerSignature, nullifier, choice)` for every ballot. Anyone can fetch these records and independently verify every signature.

**DO endpoint is privacy-minimal.** The `GET /ballots` API returns `ballot_commitment` (SHA-256 of tokenMessage + choice + nullifier) instead of raw credential fields. Voters can verify their own ballot by opening the commitment with their secret.

## Bluesky Integration

### QuickVote

Polls are shared on Bluesky as posts with link facets. Each option name is a clickable link pointing to `/v/{pollId}?c={optionIndex}`. Clicking an option from the Bluesky app opens the QuickVote page, which:

1. Authenticates the voter (or uses existing session)
2. Requests a credential
3. Submits the ballot
4. Shows confirmation

All in one flow — no manual "request credential" or "select option" steps.

### Post to Bluesky

The admin page has a "Post to Bluesky" button that creates a properly faceted post using the host's stored PDS session:

```
Which diagnostic platform will dominate POC by 2030?

Cepheid GeneXpert
BioFire FilmArray
Abbott ID NOW
Other

View poll · Verifiable & anonymous · 24h left
```

Each option name is on its own line and is a link facet (blue clickable text on Bluesky) pointing to `/v/{pollId}?c={index}`. "View poll" links to the results page at `/poll/{pollId}`.

## D1 Schema

Key tables (see `apps/api/migrations/` for full schema):

- **polls**: id, host_did, question, options (JSON), status, mode, eligibility_mode, host_key_fingerprint, host_public_key, opens_at, closes_at
- **eligibility**: poll_id, responder_did, eligibility_status, consumed_at — tracks credential consumption
- **ballots**: ballot_id, poll_id, nullifier (UNIQUE), choice, token_message, issuer_signature, accepted, rolling_audit_hash, published_record_uri
- **poll_eligible_dids**: poll_id, did — whitelist for restricted polls
- **tally_snapshots**: poll_id, counts_by_option (JSON), ballot_count, final
- **audit_events**: poll_id, event_type, event_payload, rolling_hash — tamper-evident log
- **sessions**: session_id, did, handle, pds_url, refresh_token, expires_at — auth sessions with PDS refresh tokens for posting

No table stores voter DID alongside choice. The `eligibility` table records that a DID consumed a credential. The `ballots` table records anonymous ballots. These are deliberately separate.

## Deployment

See `README.md` for full deployment instructions. Key points:

- **Frontend**: Cloudflare Pages (React + Vite build)
- **Backend**: Cloudflare Worker with DO + D1 bindings
- **Migrations**: Run via GitHub Actions (`d1-migrate.yml`) or wrangler CLI
- **Deploy**: GitHub Actions (`deploy-poll.yml`) triggers on push to main or `claude/bluesky-anonymous-polls-*` branches
- **Secrets**: RSA_PRIVATE_KEY_JWK, RSA_PUBLIC_KEY_JWK, ATPROTO_SERVICE_* credentials

### Service Account Setup

1. Create Bluesky account for the poll service
2. Set up custom domain handle via `/.well-known/atproto-did`
3. Generate app password → set as Worker secret
4. Set `ATPROTO_MOCK_MODE=false` in production

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/atproto/start | - | Authenticate with handle + app password |
| POST | /api/auth/refresh | refresh token | Refresh session |
| POST | /api/auth/logout | session | Destroy session |
| GET | /api/me | session | Current user |
| POST | /api/polls | session | Create poll |
| GET | /api/polls | - | List polls |
| GET | /api/polls/:id | - | Get poll |
| POST | /api/polls/:id/open | session (host) | Open poll |
| POST | /api/polls/:id/close | session (host) | Close poll |
| POST | /api/polls/:id/finalize | session (host) | Finalize poll (irreversible) |
| DELETE | /api/polls/:id | session (host) | Delete poll |
| POST | /api/polls/:id/eligibility/request | session | Request blind-signed credential |
| POST | /api/polls/:id/ballots/submit | **credential** | Submit anonymous ballot |
| GET | /api/polls/:id/ballots | - | List public ballots (commitment view) |
| GET | /api/polls/:id/tally | - | Get tally |
| GET | /api/polls/:id/audit | - | Audit transcript |
| POST | /api/polls/:id/publish | session (host) | Publish poll def to ATProto |
| POST | /api/polls/:id/tally/publish | session (host) | Publish tally to ATProto |
| POST | /api/polls/:id/ballots/publish | session (host) | Publish ballots to ATProto (shuffled) |
| POST | /api/polls/:id/post-to-bluesky | session (host) | Post poll to Bluesky with faceted links |
| POST | /api/polls/:id/eligible/sync | session (host) | Re-sync eligible DIDs from Bluesky |
| GET | /api/polls/:id/eligible | - | Get eligible DID count |

Note: `/ballots/submit` uses credential-based auth (tokenMessage + signature + nullifier), not session-based. This is the anonymity boundary.

## Working With This Repo

When Claude is asked to modify the poll system:
1. The monorepo root is `poll/`. Run `npm install` there.
2. Shared code goes in `packages/shared/` — types, schemas, crypto, ATProto publisher.
3. Build shared first: `npm run build:shared`
4. Tests: `npm test` (vitest, runs shared crypto tests)
5. Type check: `npx tsc -p apps/web/tsconfig.json --noEmit` and `npx tsc -p apps/api/tsconfig.json --noEmit`
6. Local dev: `npm run dev:api` + `npm run dev:web` in two terminals
7. Mock mode (`ATPROTO_MOCK_MODE=true`) skips real ATProto calls

## Styling

The frontend is a React SPA. Styling is in `apps/web/public/` CSS files. Match the mino.mobi aesthetic: monospace headers, clean cards, dark red accent, cream/dark mode responsive.
