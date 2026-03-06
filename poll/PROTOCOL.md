# Anonymous Polls on ATProto — Protocol Design

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

RSA Blind Signatures (RFC 9474) solve the trilemma. The host verifies eligibility and signs a blinded credential — never seeing the credential itself. The voter unblinds it and submits an anonymous ballot that the host can verify is authentic but cannot link back to any identity.

This is a Chaumian credential scheme adapted for ATProto polls.

### Players

- **Host** — the poll creator. Runs the poll, signs credentials, publishes results.
- **Voter** — any eligible Bluesky user.
- **Service PDS** — a dedicated Bluesky account that stores poll definitions, ballot records, and tally records. Its repo is the public bulletin board.
- **Durable Object** — per-poll coordinator. Serializes all state mutations (eligibility consumption, credential issuance, ballot acceptance, nullifier enforcement).

### Credential Lifecycle

```
VOTER (browser)                    HOST (DO)                    SERVICE PDS
    │                                │                              │
    │── 1. authenticate ────────────▶│                              │
    │   (prove DID via app password) │                              │
    │                                │── check eligibility          │
    │                                │   (DID not yet consumed?)    │
    │                                │── consume DID atomically     │
    │                                │                              │
    │── 2. blind(tokenMessage) ─────▶│                              │
    │   (host cannot see             │── blindSign(blindedMsg) ──┐  │
    │    tokenMessage)               │                           │  │
    │◀── blindedSignature ──────────│◀──────────────────────────┘  │
    │                                │                              │
    │── 3. unblind(blindedSig) ──┐   │                              │
    │   (now holds valid          │   │                              │
    │    RSA-PSS signature over   │   │                              │
    │    tokenMessage)            │   │                              │
    │◀────────────────────────────┘   │                              │
    │                                │                              │
    │── 4. submit ballot ───────────▶│                              │
    │   {tokenMessage,               │── verify RSA-PSS signature   │
    │    issuerSignature,            │── parse tokenMessage          │
    │    nullifier,                  │   (enforce pollId match)      │
    │    choice}                     │── recompute nullifier         │
    │   (NO session/identity)        │   (enforce SHA-256 match)    │
    │                                │── check nullifier uniqueness  │
    │                                │── accept ballot atomically    │
    │                                │                              │
    │                           [at poll close]                     │
    │                                │── shuffle ballots ──────────▶│
    │                                │   (Fisher-Yates)             │
    │                                │   publish to service repo    │
```

### tokenMessage Format

The token message is structured and self-describing:

```
anonpoll:v1:{pollId}:{expiryISO}:{hmacHex}
```

- `pollId` — UUID of the poll (cleartext, so the host can enforce poll binding)
- `expiryISO` — credential expiry timestamp
- `hmacHex` — HMAC-SHA256(secret, "token_v1\0{pollId}\0{expiry}") — ties the token to the voter's secret

The voter generates a random `secret`, derives the token message, blinds it, and sends only the blinded bytes to the host. The host blind-signs without seeing the token. After unblinding, the voter holds a valid RSA-PSS signature over the full structured token message.

### Nullifier

```
nullifier = SHA-256("nullifier\0" + tokenMessage)
```

The nullifier is deterministically derived from the token message. The host recomputes it from the submitted `tokenMessage` and rejects mismatches. This prevents:
- An attacker choosing arbitrary nullifiers for the same credential
- Replaying a credential with different nullifiers to vote multiple times

One credential → one nullifier → one vote.

### Poll Binding

The host parses `tokenMessage` at ballot submission time and verifies `parsedToken.pollId === poll.id`. This prevents cross-poll credential replay — a credential issued for Poll A cannot be used on Poll B, even though both use the same RSA key.

### Ballot Submission

The `/ballots/submit` endpoint does **not** require an authenticated session. The credential `(tokenMessage, issuerSignature, nullifier)` **is** the authorization. This is essential for anonymity — the host has no identity context when processing a ballot.

### Publication

Accepted ballots are published to the service PDS in Fisher-Yates shuffled order after the poll closes. The shuffle breaks submission-time ordering to prevent timing correlation.

Each ballot record on the PDS contains the full credential:
```json
{
  "$type": "com.minomobi.poll.ballot",
  "pollId": "uuid",
  "option": 2,
  "tokenMessage": "anonpoll:v1:...",
  "issuerSignature": "base64url...",
  "nullifier": "hex...",
  "ballotVersion": 1,
  "publicSerial": 42
}
```

The PDS is the **canonical public bulletin board**. Anyone can fetch these records and independently verify every ballot's signature.

The DO also exposes a privacy-minimal view via its API (`GET /ballots`) that returns `ballot_commitment` (SHA-256 of tokenMessage + choice + nullifier) instead of raw credential fields. This gives voters a way to verify their own ballot without the DO API becoming an additional deanonymization surface.

## Verification

Anyone can audit a poll by reading the service PDS:

1. **Fetch ballots**: Enumerate `com.minomobi.poll.ballot` records for the poll
2. **Verify each signature**: Check RSA-PSS signature over tokenMessage using the host's public key
3. **Verify poll binding**: Parse tokenMessage, confirm pollId matches
4. **Verify nullifier binding**: Recompute SHA-256("nullifier\0" + tokenMessage), confirm it matches
5. **Check uniqueness**: No duplicate nullifiers
6. **Recompute tally**: Count choices

Every step is public and requires no trust in the host.

## Threat Model

| Threat | Possible? | Mitigation |
|---|---|---|
| Ballot stuffing (by host) | Detectable | Every ballot requires a valid blind signature. Host cannot forge credentials without going through the blind issuance flow with a real eligible DID. Audit log with rolling hashes provides tamper evidence. |
| Double voting | Prevented | Nullifier uniqueness enforced atomically in the DO. Nullifier derived from tokenMessage — cannot be chosen arbitrarily. |
| Cross-poll credential replay | Prevented | tokenMessage contains pollId in cleartext. Host parses and enforces poll binding. |
| Credential theft (XSS) | Mitigated | Credentials are poll-scoped and time-limited. Once submitted, the nullifier is spent. Window is between issuance and submission. |
| Deanonymization by host | **No** (cryptographic) | RSA Blind Signatures (RFC 9474). Host signs blinded bytes — never sees tokenMessage. Cannot link DID → credential → ballot. |
| Deanonymization by Cloudflare | Theoretically | CF has access to Worker memory. Same trust assumption as any HTTPS service. Acceptable for community polls. |
| Timing correlation | Mitigated | Batch publication with Fisher-Yates shuffle breaks ordering. Voter can add delay between issuance and submission. Blind signature ensures host can't link even with timing data. |
| Audit log tampering | Detectable | Rolling hash chain. Each event includes previous hash. Published to ATProto for additional tamper evidence. |

### Trust Summary

| Property | Guarantee |
|----------|-----------|
| One vote per DID | Enforced (DO + eligibility consumption) |
| Ballot anonymity | **Cryptographic** (RSA Blind Signatures, RFC 9474) |
| One ballot per credential | Enforced (deterministic nullifier + uniqueness check) |
| Poll-scoped credentials | Enforced (structured tokenMessage, server-side parsing) |
| Tally correctness | Publicly verifiable (PDS records + RSA-PSS verification) |
| Ballot authenticity | RSA-PSS signature verified by host and verifiable by anyone |
| Host cannot stuff | Audit trail + unforgeable credentials |
| Coercion resistance | Moderate (credential unlinkable) |

### What Changed from the Original Design

The original protocol (pre-blind-signatures) used a trust-based separation:
- **Participation records** (DID, no choice) on a sacrificial PDS
- **Ballot records** (choice, no DID) published at close
- The operator saw both for ~100ms during the vote handler — the single trust assumption

The blind signature upgrade eliminated the trust assumption entirely. Anonymity is now **cryptographic**, not trust-based. There are no participation records. The host never sees the token message it signs.

## Lexicons

### com.minomobi.poll.def

Poll definition. One per poll, on the service PDS.

```json
{
  "$type": "com.minomobi.poll.def",
  "pollId": "uuid",
  "question": "Which diagnostic platform will dominate POC by 2030?",
  "options": ["Cepheid GeneXpert", "BioFire FilmArray", "Abbott ID NOW", "Other"],
  "opensAt": "datetime",
  "closesAt": "datetime",
  "mode": "anon_credential_v2",
  "hostKeyFingerprint": "sha256hex",
  "hostPublicKey": "JWK JSON string",
  "createdAt": "datetime"
}
```

### com.minomobi.poll.ballot

Published at poll close. One per accepted vote. On the service PDS.

```json
{
  "$type": "com.minomobi.poll.ballot",
  "pollId": "uuid",
  "option": 2,
  "tokenMessage": "anonpoll:v1:pollId:expiry:hmac",
  "issuerSignature": "base64url RSA-PSS signature",
  "nullifier": "sha256hex",
  "ballotVersion": 1,
  "publicSerial": 42
}
```

### com.minomobi.poll.tally

Final tally snapshot. One per poll, on the service PDS.

```json
{
  "$type": "com.minomobi.poll.tally",
  "pollId": "uuid",
  "countsByOption": {"0": 42, "1": 31, "2": 19, "3": 8},
  "ballotCount": 100,
  "computedAt": "datetime",
  "final": true
}
```

## Residual Risks

1. **Cloudflare as infrastructure provider**: CF has access to Worker memory. For nation-state threat models, this matters. For community polls, it's acceptable.
2. **D1 durability**: D1 is eventually consistent. The DO is the authoritative write path; D1 is for recovery and queries.
3. **ATProto public repo**: Published records are permanent on the AT Protocol network. Anonymized ballots cannot be un-published.
4. **Single RSA key**: All polls on the same instance share one RSA key pair. Cross-poll replay is prevented by poll binding in the tokenMessage, not by key separation.
