# Anonymous Polls on ATProto

## The Problem

Polls on Bluesky have a trilemma:

1. **Anonymous** — vote not publicly tied to identity
2. **Sybil-resistant** — one vote per person
3. **Verifiable** — can't stuff or suppress ballots

Existing approaches sacrifice one:

| Approach | Anonymous | Sybil | Verifiable | Failure mode |
|---|---|---|---|---|
| PDS records | no | yes | yes | Votes are public — gauche |
| IP tracking (poll.blue) | partially | no | no | Trivially circumvented, no auditability |
| Server-side hash | yes | yes | no | Must trust operator with everything |

## The Protocol

Split the vote into two record types on a single sacrificial PDS. Participation records carry the voter's DID but no choice. Ballot records carry the choice but no DID. Decouple them with batch publication at poll close.

### Design Decision: Why Everything Lives on the Sacrificial PDS

Early versions of this protocol placed participation records on the voter's own PDS. This had an appealing property — the voter's own signing key proved they voted, and the operator couldn't forge participation records.

But ATProto lets users delete their own records. A voter who deletes their participation record can vote again (the re-vote check finds nothing) and corrupts the audit trail (fewer participation records than ballots, indistinguishable from ballot stuffing). The voter is not a trusted party — they have incentive to game the system.

Moving participation records to the sacrificial PDS fixes this. The voter can't delete them. The tradeoff: the operator now controls both record types and could theoretically forge participation records. But the operator was already the trust anchor for anonymity, so this doesn't expand the threat surface. And forging participation records would only be useful to cover ballot stuffing — which requires the operator to be actively malicious, not passively negligent.

The bonus: the voter never grants write access to their PDS. OAuth only needs identity verification scope, not repo write scope. Simpler auth, smaller attack surface.

### Players

- **OP** — the poll creator (any Bluesky user)
- **Voter** — any Bluesky user casting a vote
- **Sacrificial PDS** (`poll.mino.mobi`) — a dedicated Bluesky account that holds poll definitions, participation records, and ballot records. "Sacrificial" because its sole purpose is to be the anonymous ballot box. It has no personal identity to protect.
- **Website** (`poll.mino.mobi`) — the web app that mediates between voters and the sacrificial PDS. This is the trust anchor.

### Poll Creation

1. OP visits `poll.mino.mobi`, authenticates via ATProto OAuth
2. Types poll question (≤300 chars) + defines N options
3. Submit triggers two writes:
   - **OP's Bluesky account** posts the poll as a skeet with N clickable links. Each link is `poll.mino.mobi/vote/{pollId}/{optionIdx}`. The links render as the option text.
   - **Sacrificial PDS** creates the poll definition record: question, options, close time.

The OP's post looks like a normal Bluesky post with clickable options.

### Voting

1. Voter sees OP's poll post on Bluesky, clicks the link for their chosen option
2. Lands on `poll.mino.mobi/vote/{pollId}/{optionIdx}`
3. Authenticates via ATProto OAuth (identity verification only — no PDS write access needed)
4. Website checks: does the sacrificial PDS already have a participation record for this DID on this poll?
   - **Yes** → "You already voted." Show current results. Done.
   - **No** → proceed
5. Website writes a **participation record** to the sacrificial PDS:
   - `com.minomobi.poll.participation`
   - Contains: poll URI, voter's DID, timestamp
   - Contains: **no vote choice**
   - Public, immutable by the voter (they don't control the sacrificial PDS)
6. Website queues the **ballot** in D1:
   - Contains: poll ID, choice, random salt
   - Contains: **no voter DID**
   - Staged for publication at poll close
7. Voter is done. Page returns immediately.

### The Separation

```
VOTER (browser)                WEBSITE (function)           SACRIFICIAL PDS
                                                            (ballot box)
    │                              │                              │
    │── authenticate ─────────────▶│                              │
    │   (proves DID ownership)     │                              │
    │                              │── check participation ──────▶│
    │                              │   (query sac PDS records)    │
    │                              │                              │
    │                              │── participation record ─────▶│
    │                              │   (DID, poll, no choice)     │
    │                              │                              │
    │                              │── queue ballot in D1         │
    │                              │   (choice, salt, no DID)     │
    │                              │                              │
    │◀── 200 OK ──────────────────│                              │
    │   [voter is done]            │                              │
    │                              │                              │
    │                         [at poll close]                     │
    │                              │── publish all ballots ──────▶│
    │                              │   (shuffled, no DIDs)        │
```

The website holds both DID and choice for ~100ms during the vote handler execution. After writing the participation record (DID, no choice) and queuing the ballot in D1 (choice, no DID), the association exists only in RAM and is garbage collected.

The voter's PDS is never written to. The voter's browser never touches the sacrificial PDS. The function is the only intermediary.

### Ballot Publication

Two modes, configurable per poll:

**Streaming (weaker anonymity):** Ballots published with random delays (5–60 min) during the voting window. Good enough for high-volume polls. Timing correlation possible for low-volume polls.

**Batch (strongest anonymity):** All ballots held in D1 until the poll closes, then published to the sacrificial PDS all at once in shuffled order. Zero timing signal. This is the default.

### Results

After ballots are published:
- The sacrificial PDS account replies to the OP's original post with the tally
- Results are also visible at `poll.mino.mobi/results/{pollId}`
- Anyone can independently verify by counting participation records and ballots on the sacrificial PDS

### Re-vote Prevention

The participation record on the sacrificial PDS is the lock. Before accepting a vote:
1. Website authenticates voter (gets DID from OAuth)
2. Queries sacrificial PDS for `com.minomobi.poll.participation` records matching this DID + poll
3. If found → reject

The voter cannot delete participation records because they don't control the sacrificial PDS. The operator controls deletion, but has no incentive to delete participation records (it would only allow double-voting, which corrupts their own poll).

## Verification

Anyone can audit a poll by reading the sacrificial PDS:

1. **Count participation records**: Enumerate `com.minomobi.poll.participation` records on the sacrificial PDS, filtered by poll URI → N voters
2. **Count ballots**: Enumerate `com.minomobi.poll.ballot` records on the sacrificial PDS, filtered by poll URI → N ballots, with tally
3. **Compare**: If voter count == ballot count, the poll is clean
4. **Check for duplicates**: Verify no DID appears twice in participation records for the same poll

Detectable failures:
- **Ballot stuffing**: More ballots than participation records
- **Vote suppression**: More participation records than ballots (participation written, ballot never published)
- **Double voting**: Duplicate DIDs in participation records for the same poll

## Threat Model

| Threat | Possible? | Mitigation |
|---|---|---|
| Ballot stuffing | Detectable | participation count ≠ ballot count |
| Vote suppression | Detectable | participation record exists, no matching ballot |
| Double voting | Prevented | participation record check on sac PDS (voter can't delete) |
| Record deletion by voter | Prevented | records are on sac PDS, not voter's PDS |
| Deanonymization by operator | **Yes** | The function sees DID + choice for ~100ms. Operator could add logging. Code is open source and auditable. |
| Deanonymization by Cloudflare | Theoretically | Request logs could contain body + auth. Workers don't log bodies by default. Same trust assumption as any HTTPS service. |
| Timing correlation | Mitigated | Batch mode: zero signal. Streaming mode: random delays break simple correlation. |
| Operator forges participation records | Theoretically | Operator could create fake participation records to cover stuffed ballots. But this requires active malfeasance + is detectable if anyone tracks participation in real time. |

**The single trust assumption**: the operator doesn't log the DID↔vote mapping during the ~100ms the vote handler executes. Everything else is publicly verifiable.

This is the Signal model: trust the operator not to be actively malicious, but the protocol limits what even a malicious operator can do to exactly one thing — remembering who voted for what. They cannot stuff ballots without it being detectable, and they cannot allow double-voting.

## Lexicons

### com.minomobi.poll.definition

Lives on the sacrificial PDS. Created when a poll is submitted.

```json
{
  "question": "string (max 300 chars)",
  "options": ["string", "string", ...],
  "createdBy": "did:plc:... (OP's DID)",
  "postUri": "at://... (OP's Bluesky post)",
  "closesAt": "datetime",
  "visibility": "public"
}
```

### com.minomobi.poll.participation

Lives on the sacrificial PDS. One per poll per voter. Written at vote time.

```json
{
  "poll": "at://poll.mino.mobi/com.minomobi.poll.definition/...",
  "voter": "did:plc:... (voter's DID)",
  "votedAt": "datetime"
}
```

No vote choice. The voter's DID is here for re-vote prevention and auditing. The voter cannot delete this record.

### com.minomobi.poll.ballot

Lives on the sacrificial PDS. Published at poll close (batch mode) or after random delay (streaming mode).

```json
{
  "poll": "at://poll.mino.mobi/com.minomobi.poll.definition/...",
  "choice": 0,
  "salt": "random-string"
}
```

No voter DID. The salt prevents deduplication by content (two votes for the same option look different in the repo).

## Infrastructure

### Subdomain

- `poll.mino.mobi` — CNAME to Pages deployment
- `poll/.well-known/atproto-did` — Bluesky handle verification for the sacrificial account

### Sacrificial Bluesky Account

- Handle: `poll.mino.mobi`
- Purpose: holds poll definitions, participation records, and ballot records
- Also posts result replies to OPs
- Credentials: app password stored as Cloudflare secret (never in client code)

### Storage

**D1** (Cloudflare's edge SQLite — free tier: 5M reads/day, 100K writes/day, 5GB):

```sql
CREATE TABLE polls (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  options TEXT NOT NULL,        -- JSON array
  created_by TEXT NOT NULL,     -- OP's DID
  post_uri TEXT,                -- OP's Bluesky post
  poll_record_uri TEXT,         -- at:// URI on sacrificial PDS
  closes_at TEXT NOT NULL,      -- ISO datetime
  results_posted INTEGER DEFAULT 0
);

CREATE TABLE pending_ballots (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL,
  choice INTEGER NOT NULL,
  salt TEXT NOT NULL,
  queued_at TEXT NOT NULL,      -- ISO datetime
  published INTEGER DEFAULT 0
);
-- NO voter DID column. By design.
```

D1 stages ballots during the voting window. At poll close, a worker reads all pending ballots for the poll, shuffles them, publishes to the sacrificial PDS, and marks them as published.

### Pages Functions

```
functions/
├── api/
│   ├── create-poll.js    # OAuth → post to OP's feed + sac PDS + D1
│   ├── vote.js           # OAuth → participation record on sac PDS + queue ballot in D1
│   ├── results.js        # tally from sac PDS
│   └── publish.js        # cron: publish pending ballots at poll close
└── _middleware.js         # OAuth session handling
```

### Security: Sacrificial PDS Credentials

The sacrificial PDS app password **must live server-side only** — as a Cloudflare environment secret, accessed by Pages Functions. Never in client JavaScript, never in HTML.

The client never touches the sacrificial PDS directly. The Functions are the only code that authenticates to the sacrificial account.

```
CLIENT (browser)                 PAGES FUNCTION              SACRIFICIAL PDS
    │                              │                              │
    │── POST /api/vote ───────────▶│                              │
    │   {pollId, choice}           │── createSession ────────────▶│
    │   + OAuth token              │   (app password from env)    │
    │                              │── createRecord ─────────────▶│
    │                              │   (participation, then       │
    │◀── 200 OK ──────────────────│    ballot queued in D1)      │
    │                              │                              │
    │  [browser never sees         │                              │
    │   sac PDS credentials]       │                              │
```

If the app password were in client-side code, any user could extract it and write arbitrary records to the sacrificial PDS — stuffing ballots, deleting polls, posting spam. Server-side only.

## What Makes This Different

This isn't just "trust the server." The protocol produces **public artifacts** on the sacrificial PDS that constrain what the operator can do:

1. **Participation records are public and immutable by voters.** The operator controls them, but forging them is detectable (real-time watchers would see participation records appear without corresponding OAuth auth events).
2. **Ballots are publicly enumerable.** The operator can't hide votes after publication.
3. **Count matching is trivial.** Any third party can compare participation count to ballot count on the same PDS.
4. **The voter's PDS is never touched.** No write access needed, no records to delete, no audit trail to corrupt.
5. **The only unverifiable claim** is that the operator didn't log the DID↔choice mapping during the ~100ms vote handler window.

The operator's hands are tied everywhere except on the question of anonymity. And even there, active malfeasance (adding logging code to an open-source repo) is required — not passive access.
