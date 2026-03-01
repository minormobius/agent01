# poll.mino.mobi — Anonymous Polls on ATProto

## What This Is

An anonymous, sybil-resistant, auditable polling system for Bluesky built on ATProto. Any Bluesky user can create a poll. Any Bluesky user can vote. Votes are anonymous — the system knows WHO voted but not WHAT they voted, and it knows WHAT was voted but not by WHOM. These two halves never meet in persistent storage.

The full protocol design, threat model, and rationale live in `poll/PROTOCOL.md`. Read that first. This file is the implementation guide.

## Core Concept

Two record types on a single sacrificial PDS, separated by design:

- **Participation record**: voter's DID + poll reference. No choice. Written immediately at vote time.
- **Ballot record**: choice + random salt. No voter DID. Published at poll close in shuffled order.

The website function holds both DID and choice for ~100ms during vote processing, then discards the association. The operator's corruption (logging that ~100ms mapping) is the single trust assumption. Everything else is publicly verifiable.

## Architecture

### Players

- **OP** — any Bluesky user who creates a poll
- **Voter** — any Bluesky user who casts a vote
- **Sacrificial PDS** — a dedicated Bluesky account (`poll.mino.mobi`) that stores poll definitions, participation records, and ballot records. Has no personal identity. Is the ballot box.
- **Website** (`poll.mino.mobi`) — static pages + Cloudflare Pages Functions. The trust anchor.

### Why a Sacrificial PDS

Early protocol versions placed participation records on the voter's own PDS. Problem: ATProto lets users delete their own records. A voter who deletes their participation record can vote again and corrupts the audit trail. The voter is not a trusted party.

We also considered using the OP's PDS (stashing the OP's auth). Problems: app passwords can't be scoped (gives full account access), the OP has the most incentive to manipulate their own poll, and stashing credentials is a catastrophic liability.

The sacrificial PDS is the right answer. The operator is a neutral party with no stake in any poll's outcome. The data is on ATProto so it's replicated by the relay network and survives even if poll.mino.mobi goes down.

### Data Flow

```
POLL CREATION:

  OP (browser) ──▶ POST /api/create-poll ──▶ sacrificial PDS: poll definition record
                   (OP authenticated)    └──▶ OP's Bluesky: skeet with option links
                                         └──▶ D1: poll metadata


VOTING:

  Voter (browser) ──▶ POST /api/vote ──▶ sacrificial PDS: participation record (DID, no choice)
                      (voter authenticated) └──▶ D1: pending ballot (choice, no DID)
                                                      │
                                                 [at poll close]
                                                      │
                                                      ▼
                                              sacrificial PDS: ballot records
                                              (all at once, shuffled order)


RESULTS:

  Anyone ──▶ GET /api/results/{pollId} ──▶ reads sacrificial PDS
                                            counts participation records
                                            counts/tallies ballot records
                                            verifies counts match
```

### Directory Structure

```
poll/
├── PROTOCOL.md              # Full protocol design, threat model, rationale
├── CLAUDE.md                # This file — implementation guide
├── .well-known/
│   └── atproto-did          # Bluesky handle verification for poll.mino.mobi
├── index.html               # Create poll UI
├── vote.html                # Vote landing page (handles /vote/{pollId}/{option})
├── results.html             # Results viewer
└── assets/
    └── css/
        └── poll.css         # Styling (match mino.mobi aesthetic)
```

Pages Functions (in repo root, auto-deployed by Cloudflare Pages):

```
functions/
├── api/
│   ├── create-poll.js       # Auth OP → create poll definition on sac PDS + post to OP's feed
│   ├── vote.js              # Auth voter → write participation record + queue ballot in D1
│   ├── results/
│   │   └── [pollId].js      # Tally ballots from sac PDS, verify counts
│   └── publish.js           # Publish pending ballots at poll close
└── _middleware.js            # ATProto OAuth session handling
```

Note: Pages Functions live in the repo root `functions/` directory, NOT in `poll/functions/`. Cloudflare Pages detects `functions/` at the project root. The poll API endpoints coexist with the existing cluster functions (`functions/cluster-batch.js`, `functions/seek-profiles.js`).

## Cloudflare Services Required

### D1 (Edge SQLite Database)

**What**: Cloudflare's serverless SQL database. Real SQLite, runs at the edge next to Pages Functions. Free tier: 5M reads/day, 100K writes/day, 5GB storage.

**Why**: Stages pending ballots during the voting window. The ballots sit in D1 (choice + salt, NO voter DID) until the poll closes, then get published to the sacrificial PDS in shuffled order. D1 is not publicly readable — only the Functions can access it.

**Setup**:
1. Cloudflare dashboard → Workers & Pages → D1 SQL Database → Create database
2. Name it `poll-db` (or similar)
3. In the Pages project settings → Functions → D1 database bindings → add binding:
   - Variable name: `DB`
   - D1 database: select `poll-db`
4. Functions access it as `context.env.DB`

**Schema** (run via D1 console or migration):

```sql
CREATE TABLE polls (
  id TEXT PRIMARY KEY,           -- random ID (e.g., nanoid)
  question TEXT NOT NULL,
  options TEXT NOT NULL,          -- JSON array of strings
  created_by TEXT NOT NULL,       -- OP's DID
  post_uri TEXT,                  -- at:// URI of OP's Bluesky post
  poll_record_uri TEXT,           -- at:// URI on sacrificial PDS
  closes_at TEXT NOT NULL,        -- ISO 8601 datetime
  results_posted INTEGER DEFAULT 0
);

CREATE TABLE pending_ballots (
  id TEXT PRIMARY KEY,           -- random ID
  poll_id TEXT NOT NULL,
  choice INTEGER NOT NULL,       -- index into options array
  salt TEXT NOT NULL,             -- random string, prevents content dedup
  queued_at TEXT NOT NULL,        -- ISO 8601
  published INTEGER DEFAULT 0
);
-- NO voter DID column in pending_ballots. This is by design.
-- The separation of identity from choice is the core privacy guarantee.

CREATE INDEX idx_pending_poll ON pending_ballots(poll_id, published);
CREATE INDEX idx_polls_closes ON polls(closes_at, results_posted);
```

### Environment Secrets

Add these in Cloudflare Pages → Settings → Environment variables (encrypt):

- `POLL_HANDLE` — the sacrificial account's handle (`poll.mino.mobi`)
- `POLL_APP_PASSWORD` — app password for the sacrificial account
- `POLL_OAUTH_CLIENT_SECRET` — OAuth client secret (if using confidential client)
- `POLL_ENCRYPTION_KEY` — for encrypting any session tokens (generate a random 256-bit key)

These are accessible in Functions as `context.env.POLL_HANDLE`, etc.

### Scheduled Worker (Cron Trigger)

**What**: A Cloudflare Worker that runs on a schedule. Free tier supports cron triggers at 1-minute minimum intervals.

**Why**: Publishes pending ballots after polls close. The cron worker checks D1 for polls past their `closes_at` that haven't been published yet, reads their pending ballots, shuffles them, and publishes them all to the sacrificial PDS at once.

**Important**: Cron triggers require a separate Workers deployment — Pages Functions don't support cron. You'll need a small Worker (`workers/poll-publish/`) with a `[triggers]` section in `wrangler.toml`:

```toml
name = "poll-publish"
main = "src/index.js"
compatibility_date = "2024-01-01"

[triggers]
crons = ["* * * * *"]  # every minute

[[d1_databases]]
binding = "DB"
database_name = "poll-db"
database_id = "<your-d1-database-id>"
```

Alternatively, the publish step can be triggered manually via `POST /api/publish` or called by the results page when a closed poll's ballots haven't been published yet.

## Sacrificial Bluesky Account Setup

Same pattern as Modulo and Morphyx:

1. **Create account**: Sign up for a new Bluesky account (e.g., `poll-minomobi.bsky.social`)
2. **Note the DID**: After creation, find the DID (starts with `did:plc:`)
3. **Create verification file**: Add `poll/.well-known/atproto-did` to the repo containing just the DID string
4. **DNS**: In Cloudflare DNS, add CNAME record: `poll` → your Pages deployment URL (e.g., `minomobi-com.pages.dev`)
5. **Custom domain**: In Cloudflare Pages → Custom domains, add `poll.mino.mobi`
6. **Change handle**: In Bluesky settings, change handle to custom domain → enter `poll.mino.mobi` → it verifies via the `/.well-known/atproto-did` file
7. **App password**: Generate an app password in Bluesky settings → App Passwords
8. **Store secret**: Add as Cloudflare Pages environment secret `POLL_APP_PASSWORD`

The account's profile should clearly state its purpose: "Anonymous ballot box for poll.mino.mobi. This account holds poll definitions and ballot records. It does not represent a person."

## ATProto OAuth

Voters and OPs authenticate via ATProto OAuth to prove they control a DID. The poll app needs:

- **Identity verification** (who is this user?) — required for both voting and poll creation
- **Write access to OP's feed** — required only for poll creation (to post the poll as a skeet)
- **No write access to voter's PDS** — voters don't need to grant any write permissions

### OAuth Client Registration

ATProto OAuth requires a client metadata document served at a well-known URL. The client metadata declares what scopes the app requests and where callbacks go.

Serve `poll/.well-known/oauth-client-metadata.json` (or configure at the OAuth provider level). Key fields:
- `client_id`: `https://poll.mino.mobi`
- `redirect_uris`: `["https://poll.mino.mobi/oauth/callback"]`
- `scope`: `atproto` (or more specific scopes when available)
- `grant_types`: `["authorization_code"]`
- `token_endpoint_auth_method`: `none` (public client) or `client_secret_post` (confidential)

### OAuth Flow

1. User clicks "sign in" → redirect to their PDS authorization endpoint
2. User authorizes the poll app
3. PDS redirects back to `poll.mino.mobi/oauth/callback` with auth code
4. Pages Function exchanges code for access token
5. Function uses token to get user's DID
6. Session established (store in encrypted cookie or short-lived KV entry)

### Important OAuth Considerations

- ATProto OAuth is still evolving. Check the latest spec at `atproto.com/specs/oauth` before implementing.
- For poll creation, the app needs write access to create a post on the OP's account. This is a broader scope than voting (which needs only identity verification).
- Consider two OAuth flows: a lightweight "verify identity" for voting and a "post on my behalf" for poll creation. Or use a single flow with the broader scope.
- The `_middleware.js` should handle session validation on every API request, extracting the authenticated DID from the session cookie.

## Lexicons

Three record types, all living on the sacrificial PDS.

### com.minomobi.poll.definition

Created when a poll is submitted. One per poll.

```json
{
  "$type": "com.minomobi.poll.definition",
  "question": "Which diagnostic platform will dominate POC by 2030?",
  "options": ["Cepheid GeneXpert", "BioFire FilmArray", "Abbott ID NOW", "Other"],
  "createdBy": "did:plc:abc123...",
  "postUri": "at://did:plc:abc123.../app.bsky.feed.post/xyz",
  "closesAt": "2026-03-08T00:00:00Z"
}
```

### com.minomobi.poll.participation

Written at vote time. One per voter per poll. Carries the voter's DID but NOT their choice.

```json
{
  "$type": "com.minomobi.poll.participation",
  "poll": "at://did:plc:pollaccount/com.minomobi.poll.definition/abc123",
  "voter": "did:plc:voterxyz...",
  "votedAt": "2026-03-02T14:30:00Z"
}
```

### com.minomobi.poll.ballot

Published at poll close. One per vote. Carries the choice but NOT the voter's DID.

```json
{
  "$type": "com.minomobi.poll.ballot",
  "poll": "at://did:plc:pollaccount/com.minomobi.poll.definition/abc123",
  "choice": 2,
  "salt": "a7f3b9c2e1d4..."
}
```

The salt is a random string generated at vote time. It prevents deduplication by content — without it, two votes for option 2 would have identical record content, and ATProto repo internals might deduplicate them.

## User Flows

### Creating a Poll

1. OP visits `poll.mino.mobi`
2. Signs in via ATProto OAuth (needs write scope for posting)
3. Types question (≤300 chars) and 2–6 options
4. Sets poll duration (e.g., 1 day, 3 days, 7 days)
5. Clicks "post poll"
6. Backend:
   a. Creates poll definition record on sacrificial PDS
   b. Creates a Bluesky post on OP's account with the question text and N facet links:
      - Each option is a clickable link: `[Option text](https://poll.mino.mobi/vote/{pollId}/{optionIdx})`
      - The post text reads like: "Poll: Which diagnostic platform will dominate POC by 2030?\n\nCepheid GeneXpert | BioFire FilmArray | Abbott ID NOW | Other"
      - Each option name is a link facet pointing to the vote URL
   c. Stores poll metadata in D1
7. OP sees confirmation with link to their post

### Voting

1. Voter sees OP's poll post on Bluesky
2. Clicks the link for their chosen option (e.g., "BioFire FilmArray")
3. Lands on `poll.mino.mobi/vote/{pollId}/{optionIdx}`
4. Page shows the poll question, highlights which option they're voting for
5. If not signed in → "sign in to vote" button (OAuth, identity-only scope)
6. If already voted → "you already voted" message + current participation count
7. If eligible → "confirm vote" button
8. On confirm:
   a. Function checks for existing participation record on sacrificial PDS
   b. If none: writes participation record (DID, no choice) to sacrificial PDS
   c. Queues ballot (choice, salt, no DID) in D1
   d. Returns success
9. Voter sees confirmation: "vote recorded. Results at poll close."

### Viewing Results

1. Anyone visits `poll.mino.mobi/results/{pollId}` (or clicks "results" link)
2. Page reads poll definition from sacrificial PDS
3. Before close: shows participation count only ("47 votes cast, closes in 2d 4h")
4. After close: shows full tally + bar chart + participation count
5. Verification section: "N participation records, N ballots — counts match ✓"

### Results Reply

After poll close and ballot publication:
1. The cron worker (or publish function) posts a reply from the sacrificial account to the OP's original post
2. Reply contains the tally: "Results: Cepheid GeneXpert 42% | BioFire FilmArray 31% | Abbott ID NOW 19% | Other 8% — 47 votes"
3. This makes results visible in the Bluesky thread without visiting the website

## API Endpoints

### POST /api/create-poll

**Auth**: OAuth session (needs write scope)

**Body**:
```json
{
  "question": "string (max 300 chars)",
  "options": ["string", ...],
  "duration": "1d" | "3d" | "7d"
}
```

**Steps**:
1. Validate session → get OP's DID
2. Validate question length, option count (2–6)
3. Generate poll ID
4. Compute `closesAt` from duration
5. Create `com.minomobi.poll.definition` on sacrificial PDS
6. Create Bluesky post on OP's account with option links
7. Store poll in D1
8. Return `{ pollId, postUri }`

### POST /api/vote

**Auth**: OAuth session (identity-only scope)

**Body**:
```json
{
  "pollId": "string",
  "choice": 0
}
```

**Steps**:
1. Validate session → get voter's DID
2. Look up poll in D1 → verify not closed
3. Check sacrificial PDS for existing participation record for this DID + poll
4. If exists → return `{ error: "already voted" }`
5. Write participation record to sacrificial PDS: `{ poll, voter: DID, votedAt }`
6. Generate random salt
7. Insert into D1 `pending_ballots`: `{ poll_id, choice, salt }` — **NO DID**
8. Return `{ success: true }`

**Critical**: Between steps 1 and 7, the function holds both the DID and the choice in memory. After step 7 completes, the DID is not stored anywhere in association with the choice. This is the ~100ms privacy window.

### GET /api/results/[pollId]

**Auth**: None (public)

**Steps**:
1. Look up poll in D1
2. Count participation records on sacrificial PDS for this poll
3. If poll still open → return `{ participationCount, closesAt, status: "open" }`
4. If poll closed → tally ballot records on sacrificial PDS
5. Return `{ question, options, tally: [count, ...], participationCount, ballotCount, status: "closed" }`

### POST /api/publish

**Auth**: Cron trigger or admin key

**Steps**:
1. Query D1 for polls past `closes_at` with `results_posted = 0`
2. For each poll:
   a. Read all `pending_ballots` for this poll from D1
   b. Shuffle the ballot array (Fisher-Yates)
   c. Write each ballot as a `com.minomobi.poll.ballot` record to sacrificial PDS
   d. Post results reply to OP's original post from sacrificial account
   e. Mark poll as `results_posted = 1` in D1
   f. Delete pending ballots from D1

## Styling

Match the mino.mobi aesthetic: monospace headers, serif body, dark red accent (`--link: #8b0000`), cream/dark mode responsive. Reference `cluster/index.html` for the CSS variable system and component patterns.

The poll pages should feel like part of the same site — same `<h1>` breadcrumb pattern (`mino.mobi / poll`), same progress bars, same form styling.

## Security Considerations

### Sacrificial PDS Credentials
- App password in Cloudflare environment secrets ONLY
- Never in client-side JavaScript, never in HTML, never in the repo
- Functions are the sole code that authenticates to the sacrificial account

### The ~100ms Window
- The vote handler function holds DID + choice simultaneously for the duration of the request (~100ms)
- After writing participation (DID, no choice) and queuing ballot (choice, no DID), the association is garbage collected
- The operator could add logging to capture this — that's the trust assumption
- Code is open source and auditable

### D1 Privacy
- `pending_ballots` table has NO voter DID column
- Even direct D1 access (by the operator) reveals only aggregate vote counts per option, not who voted for what
- After ballot publication, pending ballots are deleted from D1

### Request Logging
- Cloudflare Workers/Pages Functions do not log request bodies by default
- The operator should NOT enable request body logging on the vote endpoint
- This is the same trust assumption every HTTPS service makes

### Record Deletion Attack
- Voters cannot delete participation records (records are on sacrificial PDS, not voter's PDS)
- The operator can delete records but has no incentive (would break their own polls)
- ATProto repo history makes deletion detectable by anyone running a relay

## Verification

Any third party can audit a poll:

1. Query sacrificial PDS for `com.minomobi.poll.participation` records matching the poll URI → count unique voter DIDs
2. Query sacrificial PDS for `com.minomobi.poll.ballot` records matching the poll URI → count ballots and tally choices
3. Verify: participation count == ballot count
4. Verify: no DID appears twice in participation records

If counts don't match:
- More ballots than participation records → ballot stuffing
- More participation records than ballots → vote suppression (ballots not published)

## Implementation Order

Suggested build sequence:

1. **Sacrificial account setup** — create Bluesky account, domain verification, app password
2. **D1 database** — create database, run schema migration
3. **OAuth scaffolding** — `_middleware.js`, client metadata, callback handler, session management
4. **POST /api/vote** — the core: participation record + ballot queue. Test this thoroughly.
5. **POST /api/create-poll** — poll definition on sac PDS + post to OP's feed
6. **GET /api/results/[pollId]** — tally from sac PDS records
7. **vote.html** — vote landing page (shows poll, auth, confirm button)
8. **results.html** — results viewer (bar chart, verification section)
9. **index.html** — poll creation form
10. **Publish mechanism** — cron worker or manual trigger for batch ballot publication
11. **Results reply** — post tally as reply to OP's original post

## Dependencies and Prior Art

- **ATProto OAuth**: Check `atproto.com/specs/oauth` for the latest spec. This is the most complex part. Consider using `@atproto/oauth-client-node` if available, or implement the PKCE flow manually.
- **Bluesky API**: `public.api.bsky.app` for reads, authenticated PDS endpoints for writes. Same patterns used in `src/post_thread.py` and `functions/cluster-batch.js`.
- **D1**: Cloudflare's documentation at `developers.cloudflare.com/d1/`. Query with `context.env.DB.prepare(sql).bind(...).run()`.
- **Existing patterns**: The Pages Functions in `functions/cluster-batch.js` and `functions/seek-profiles.js` show the request/response patterns, CORS headers, and error handling conventions used in this project.

## What's NOT in Scope

- **Cryptographic voting** (homomorphic encryption, blind signatures, zero-knowledge proofs) — these would eliminate the trust assumption but are dramatically more complex. The current protocol is a practical system, not an academic exercise.
- **Multi-sacrificial-PDS** (federation of ballot boxes) — theoretically better for decentralization, but adds coordination complexity for marginal trust improvement. The operator is already neutral.
- **Voter-PDS participation records** — ruled out because voters can delete their own records. See PROTOCOL.md for full rationale.
- **Stashing OP credentials** — ruled out because app passwords can't be scoped, creating catastrophic liability. See PROTOCOL.md for full rationale.
