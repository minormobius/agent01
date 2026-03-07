# ATPolls

Verifiable, anonymous polling on Bluesky. RSA Blind Signatures (RFC 9474) ensure the host cannot link voter identity to ballot choice.

## Properties

- Responders authenticate via ATProto app passwords
- One ballot credential per eligible DID (enforced atomically)
- Ballots are anonymous — submitted with credential, not identity
- Accepted ballots published to a service-controlled ATProto repo (public)
- Anyone can recompute the tally from public ballot artifacts
- Ballot anonymity is cryptographic, not trust-based

## Architecture

```
Cloudflare Pages (frontend) → Cloudflare Worker (API)
                                    ├── Durable Objects (per-poll coordinator)
                                    ├── D1 (persistent storage)
                                    └── ATProto PDS (public ballot records)
```

See [docs/architecture.md](docs/architecture.md) for details.

## Repo Structure

```
poll/
├── apps/
│   ├── web/           # React + Vite frontend (Cloudflare Pages)
│   │   ├── src/
│   │   │   ├── pages/     # Home, CreatePoll, Poll, Vote, QuickVote, Audit, Admin
│   │   │   ├── hooks/     # useAuth
│   │   │   ├── lib/       # API client
│   │   │   └── components/# Layout
│   │   └── public/
│   │       └── client-metadata.json  # ATProto OAuth client metadata
│   └── api/           # Cloudflare Worker backend
│       ├── src/
│       │   ├── durable-objects/  # PollCoordinator DO
│       │   └── routes/           # polls, auth, ballots
│       └── migrations/           # D1 SQL migrations
├── packages/
│   └── shared/        # Shared types, schemas, crypto, ATProto publisher
│       └── src/
│           ├── types/     # Domain types
│           ├── schemas/   # Zod validation
│           ├── crypto/    # Credential lifecycle + blind sig interfaces
│           └── atproto/   # PDS publisher + mock
└── docs/
    ├── architecture.md    # System architecture
    └── threat-model.md    # Trust boundaries, attacks, live monitoring surface
```

## Local Development

### Prerequisites

- Node.js 18+
- Wrangler CLI (`npm install -g wrangler`)

### Setup

```bash
cd poll

# Install dependencies
npm install

# Build shared package
npm run build:shared

# Copy env template
cp apps/api/.dev.vars.example apps/api/.dev.vars

# Initialize local D1 database
cd apps/api
npm run migrate:local
cd ../..
```

### Run locally

In two terminals:

```bash
# Terminal 1: API (Worker + DO + D1 local)
npm run dev:api

# Terminal 2: Frontend (Vite dev server, proxies /api to Worker)
npm run dev:web
```

Frontend: http://localhost:3000
API: http://localhost:8787

### Mock Mode

By default, `ATPROTO_MOCK_MODE=true` in `.dev.vars`. This:
- Skips real ATProto credential verification (login with any handle)
- Uses in-memory publisher instead of real PDS
- No external network calls needed

### Run Tests

```bash
npm test
```

## Deployment

### 1. Create D1 Database

```bash
cd apps/api
wrangler d1 create atpolls-db
# Copy the database_id into wrangler.toml
```

### 2. Run D1 Migrations

```bash
npm run migrate:remote
```

### 3. Set Worker Secrets

```bash
wrangler secret put RSA_PRIVATE_KEY_JWK
wrangler secret put RSA_PUBLIC_KEY_JWK
wrangler secret put ATPROTO_SERVICE_DID
wrangler secret put ATPROTO_SERVICE_HANDLE
wrangler secret put ATPROTO_SERVICE_PASSWORD
wrangler secret put ATPROTO_SERVICE_PDS
```

### 4. Deploy

The monorepo deploys as a single Cloudflare Worker with static assets:

```bash
# Build frontend + deploy worker with assets
npm run build:web
npx wrangler deploy
```

Or connect to Git for automatic deploys via GitHub Actions.

### 5. Configure Domain

- `poll.mino.mobi` → Worker custom domain in Cloudflare
- Update `FRONTEND_URL` in Worker env
- Update `client-metadata.json` with real domain URLs

### 6. ATProto Service Account

Create a Bluesky account for the poll service. This account's repo hosts the public ballot records.

```bash
wrangler secret put ATPROTO_SERVICE_HANDLE    # e.g., poll.mino.mobi
wrangler secret put ATPROTO_SERVICE_PASSWORD   # app password
wrangler secret put ATPROTO_SERVICE_DID        # did:plc:xxxx
wrangler secret put ATPROTO_SERVICE_PDS        # https://bsky.social
```

Set `ATPROTO_MOCK_MODE=false` in production env.

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
| POST | /api/polls/:id/publish | session (host) | Publish poll to ATProto |
| POST | /api/polls/:id/tally/publish | session (host) | Publish tally to ATProto |
| POST | /api/polls/:id/ballots/publish | session (host) | Publish ballots to ATProto (shuffled) |
| POST | /api/polls/:id/post-to-bluesky | session (host) | Post poll to Bluesky with faceted links |
| POST | /api/polls/:id/eligible/sync | session (host) | Re-sync eligible DIDs from Bluesky |
| GET | /api/polls/:id/eligible | - | Get eligible DID count |

Note: `/ballots/submit` uses credential-based auth (tokenMessage + signature + nullifier), not session-based. This is the anonymity boundary.

## Security

See [docs/threat-model.md](docs/threat-model.md) for the full threat model, including the live monitoring surface analysis.

## Credential System

The system uses RSA Blind Signatures (RFC 9474) for anonymous credentials. See [PROTOCOL.md](PROTOCOL.md) for the full protocol design and cryptographic rationale.
