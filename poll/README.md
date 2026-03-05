# Anonymous Polls — ATProto

Privacy-preserving, publicly auditable poll system built on AT Protocol with Cloudflare infrastructure.

## Properties

- Responders authenticate via ATProto OAuth (private)
- One ballot credential per eligible DID (enforced atomically)
- Ballots are anonymous — submitted with credential, not identity
- Accepted ballots published to a service-controlled ATProto repo (public)
- Anyone can recompute the tally from public ballot artifacts
- Two modes: trusted-host v1 (fully working) and anonymous-credential v2 (scaffold with blind signature upgrade path)

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
│   │   │   ├── pages/     # Home, CreatePoll, Poll, Vote, Audit, Admin
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
    ├── architecture.md
    ├── threat-model.md
    └── upgrade-blind-signatures.md
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
- Skips real ATProto OAuth (login with any handle)
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
wrangler d1 create anon-polls-db
# Copy the database_id into wrangler.toml
```

### 2. Run D1 Migrations

```bash
npm run migrate:remote
```

### 3. Set Worker Secrets

```bash
wrangler secret put CREDENTIAL_SIGNING_KEY
wrangler secret put ATPROTO_SERVICE_DID
wrangler secret put ATPROTO_SERVICE_HANDLE
wrangler secret put ATPROTO_SERVICE_PASSWORD
wrangler secret put ATPROTO_SERVICE_PDS
```

### 4. Deploy Worker

```bash
cd apps/api
wrangler deploy
```

This deploys the Worker with Durable Object bindings and D1.

### 5. Deploy Frontend

```bash
cd apps/web
npm run build
wrangler pages deploy dist --project-name=anon-polls
```

Or connect to Git for automatic Cloudflare Pages deploys.

### 6. Configure Domains

- `polls.example.com` → Pages deployment (custom domain in CF Pages)
- `api.polls.example.com` → Worker (custom domain in CF Workers)
- Update `FRONTEND_URL` in Worker env to `https://polls.example.com`
- Update `VITE_API_URL` in frontend build to `https://api.polls.example.com`
- Update `client-metadata.json` with real domain URLs

### 7. ATProto Service Account

Create a Bluesky account for the poll service. This account's repo hosts the public ballot records.

```bash
# Set the credentials as Worker secrets
wrangler secret put ATPROTO_SERVICE_HANDLE    # e.g., polls.example.com
wrangler secret put ATPROTO_SERVICE_PASSWORD   # app password
wrangler secret put ATPROTO_SERVICE_DID        # did:plc:xxxx
wrangler secret put ATPROTO_SERVICE_PDS        # https://bsky.social
```

Set `ATPROTO_MOCK_MODE=false` in production env.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/atproto/start | - | Start ATProto OAuth |
| GET | /api/auth/atproto/callback | - | OAuth callback |
| POST | /api/auth/logout | session | Destroy session |
| GET | /api/me | session | Current user |
| POST | /api/polls | session | Create poll |
| GET | /api/polls/:id | - | Get poll |
| POST | /api/polls/:id/open | session (host) | Open poll |
| POST | /api/polls/:id/close | session (host) | Close poll |
| POST | /api/polls/:id/eligibility/request | session | Request credential |
| POST | /api/polls/:id/ballots/submit | **credential** | Submit anonymous ballot |
| GET | /api/polls/:id/ballots | - | List public ballots |
| GET | /api/polls/:id/tally | - | Get tally |
| GET | /api/polls/:id/audit | - | Audit transcript |
| POST | /api/polls/:id/publish | session (host) | Publish poll to ATProto |
| POST | /api/polls/:id/tally/publish | session (host) | Publish tally to ATProto |

Note: `/ballots/submit` uses credential-based auth, not session-based. This is the privacy-preserving design.

## Security

See [docs/threat-model.md](docs/threat-model.md).

## Upgrade Path

See [docs/upgrade-blind-signatures.md](docs/upgrade-blind-signatures.md) for the blind signature upgrade plan.
