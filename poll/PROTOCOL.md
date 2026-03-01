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

Split the vote into two records on two different PDSes. Decouple them with timestamp randomization.

### Players

- **OP** — the poll creator (any Bluesky user)
- **Voter** — any Bluesky user casting a vote
- **Sacrificial PDS** (`poll.mino.mobi`) — a dedicated Bluesky account that holds poll definitions and ballot records. "Sacrificial" because its sole purpose is to be the anonymous ballot box. It has no personal identity to protect.
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
3. Authenticates via ATProto OAuth (or existing session)
4. Website checks: does the voter's PDS already have a participation record for this poll?
   - **Yes** → "You already voted." Show current results. Done.
   - **No** → proceed
5. Website writes a **participation record** to the voter's PDS:
   - `com.minomobi.poll.participation`
   - Contains: poll URI, timestamp
   - Contains: **no vote choice**
   - Public, tied to the voter's DID
6. Website queues the **ballot** for the sacrificial PDS:
   - `com.minomobi.poll.ballot`
   - Contains: poll URI, choice, random salt
   - Contains: **no voter DID**
   - Stored in D1 with a `publish_after` timestamp (random delay)
7. Voter is done. Page returns immediately.

### The Separation

```
VOTER'S PDS                    WEBSITE                      SACRIFICIAL PDS
                                                            (ballot box)
    │                              │                              │
    │── authenticate ─────────────▶│                              │
    │   (proves DID)               │                              │
    │                              │── check participation ──────▶│
    │                              │   (voter's PDS)              │
    │                              │                              │
    │◀── participation record ─────│                              │
    │   "I voted on poll X"        │                              │
    │   (DID, no choice)           │                              │
    │                              │── queue ballot ─────────────▶│
    │                              │   {choice, salt}             │
    │                              │   (choice, no DID)    [delayed]
    │                              │                              │
    │         [voter is done]      │                              │
    │                         [random delay / poll close]         │
    │                              │── publish ballot ───────────▶│
    │                              │   (choice, salt, no DID)     │
```

The website holds both DID and choice for ~100ms during the vote handler execution. After writing the participation record and queuing the ballot (without DID), the association exists only in RAM and is garbage collected.

### Ballot Publication

Two modes, configurable per poll:

**Streaming (weaker anonymity):** Ballots published with random delays (5–60 min) during the voting window. Good enough for high-volume polls. Timing correlation possible for low-volume polls.

**Batch (strongest anonymity):** All ballots held in D1 until the poll closes, then published to the sacrificial PDS all at once in shuffled order. Zero timing signal. This is the default.

### Results

After ballots are published:
- The sacrificial PDS account replies to the OP's original post with the tally
- Results are also visible at `poll.mino.mobi/results/{pollId}`
- Anyone can independently verify by counting participation records (via relay) and ballots (on sacrificial PDS)

### Re-vote Prevention

The participation record on the voter's PDS is the lock. Before accepting a vote:
1. Website resolves voter's DID → PDS
2. Lists records of type `com.minomobi.poll.participation` on their PDS
3. Checks for a record matching this poll URI
4. If found → reject

The voter cannot delete the participation record without it being visible (repo history), and the website checks at vote time.

## Verification

Anyone can audit a poll:

1. **Count participation records**: Enumerate `com.minomobi.poll.participation` records across the relay, filtered by poll URI → N voters
2. **Count ballots**: Enumerate `com.minomobi.poll.ballot` records on the sacrificial PDS, filtered by poll URI → N ballots, with tally
3. **Compare**: If voter count == ballot count, the poll is clean

Detectable failures:
- **Ballot stuffing**: More ballots than participation records
- **Vote suppression**: More participation records than ballots
- **Double voting**: Multiple participation records on one DID (visible to auditors, prevented by the website)

## Threat Model

| Threat | Possible? | Mitigation |
|---|---|---|
| Ballot stuffing | Detectable | participation count ≠ ballot count |
| Vote suppression | Detectable | participation record exists, no matching ballot |
| Double voting | Prevented | participation record check before accepting |
| Deanonymization by operator | **Yes** | The function sees DID + choice for ~100ms. Operator could add logging. Code is open source and auditable. |
| Deanonymization by Cloudflare | Theoretically | Request logs could contain body + auth. Workers don't log bodies by default. Same trust assumption as any HTTPS service. |
| Timing correlation | Mitigated | Batch mode: zero signal. Streaming mode: random delays break simple correlation. |

**The single trust assumption**: the operator doesn't log the DID↔vote mapping during the ~100ms the vote handler executes. Everything else is publicly verifiable.

This is the Signal model: trust the operator not to be actively malicious, but the protocol limits what even a malicious operator can do to exactly one thing — remembering who voted for what. They cannot forge, stuff, suppress, or double-count.

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

Lives on the voter's PDS. One per poll per voter.

```json
{
  "poll": "at://poll.mino.mobi/com.minomobi.poll.definition/...",
  "votedAt": "datetime"
}
```

No vote choice. Just proof of participation.

### com.minomobi.poll.ballot

Lives on the sacrificial PDS. Published after delay or at poll close.

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
- Purpose: holds poll definitions and ballot records
- Also posts result replies to OPs
- Credentials: app password stored as Cloudflare secret (never in client code)

### Storage

**D1** (Cloudflare's edge SQLite):

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
  publish_after TEXT NOT NULL,  -- ISO datetime
  published INTEGER DEFAULT 0
);
-- NO voter DID column. By design.
```

Free tier: 5M reads/day, 100K writes/day, 5GB storage.

### Pages Functions

```
functions/
├── api/
│   ├── create-poll.js    # OAuth → post to OP's feed + sac PDS + D1
│   ├── vote.js           # OAuth → participation record + queue ballot in D1
│   ├── results.js        # tally from sac PDS or D1
│   └── publish.js        # cron: publish due ballots to sac PDS
└── _middleware.js         # OAuth session handling
```

### Security: Sacrificial PDS Credentials

The sacrificial PDS app password **must live server-side only** — as a Cloudflare environment secret, accessed by Pages Functions. Never in client JavaScript, never in HTML.

The website is server-rendered or client-side with API calls to Functions. The client never touches the sacrificial PDS directly. The Functions are the only code that authenticates to the sacrificial account.

```
CLIENT (browser)                 PAGES FUNCTION              SACRIFICIAL PDS
    │                              │                              │
    │── POST /api/vote ───────────▶│                              │
    │   {pollId, choice}           │── createSession ────────────▶│
    │   + OAuth token              │   (app password from env)    │
    │                              │── createRecord (ballot) ────▶│
    │◀── 200 OK ──────────────────│                              │
    │                              │                              │
    │  [browser never sees         │                              │
    │   sac PDS credentials]       │                              │
```

If the app password were in client-side code, any user could extract it and write arbitrary records to the sacrificial PDS — stuffing ballots, deleting polls, posting spam. Server-side only.

## What Makes This Different

This isn't just "trust the server." The protocol produces **public artifacts** that constrain what the operator can do:

1. **Participation records are on the voter's PDS**, not the operator's. The operator can't forge them (wrong signing key) or delete them.
2. **Ballots are on the sacrificial PDS**, publicly enumerable. The operator can't hide votes after publication.
3. **Count matching is trivial**. Any third party can compare participation count to ballot count.
4. **The only unverifiable claim** is that the operator didn't log the DID↔choice mapping during the ~100ms vote handler window.

The operator's hands are tied everywhere except on the question of anonymity. And even there, active malfeasance (adding logging code to an open-source repo) is required — not passive access.
