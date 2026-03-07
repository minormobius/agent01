# Architecture Summary

## System Overview

ATPolls is a privacy-preserving, publicly auditable poll system built on AT Protocol and Cloudflare infrastructure.

### Core Properties
- Responders authenticate privately via ATProto app passwords
- Each eligible responder receives exactly one ballot credential
- Responders do NOT publish ballots from their own ATProto repos
- Accepted anonymized ballots are published from a service-controlled ATProto repo
- The public can verify the tally from public ballot artifacts
- The host enforces one-vote-per-eligible-responder via Durable Objects
- Ballot anonymity is cryptographic (RSA Blind Signatures, RFC 9474)

### Deployment Shape

```
Cloudflare Pages (frontend)     Cloudflare Worker (API)
       poll.mino.mobi       -->    (same-origin, /api/*)
              |                          |
              |                    +-----+------+
              |                    |            |
              |              Durable Objects    D1
              |              (per-poll          (persistent
              |               coordinator)      queryable store)
              |                    |
              |                    v
              |              ATProto PDS
              |              (service repo for
              |               public ballot records)
```

### Data Flow

1. **Poll Creation**: Host creates poll → stored in D1 + DO initialized
2. **Authentication**: Responder logs in via app password → session in D1, PDS refresh token stored
3. **Credential Issuance**: Responder requests eligibility → client blinds token → DO blind-signs → client unblinds → DID marked consumed
4. **Ballot Submission**: Responder submits ballot with credential (no identity) → DO verifies RSA-PSS signature + poll binding + nullifier derivation + nullifier uniqueness → ballot accepted atomically
5. **Publication**: At poll close, accepted ballots published to service ATProto repo in Fisher-Yates shuffled order (no responder DID in record)
6. **Verification**: Anyone can fetch public ballots, verify every signature, and recompute tally

### Key Design Decisions

1. **Durable Objects as serialized write coordinators**: All state mutations go through a per-poll DO, ensuring atomic eligibility consumption, nullifier uniqueness, and tally updates.

2. **D1 for persistence and queryability**: The DO is authoritative for live state; D1 provides durable storage, historical queries, and recovery.

3. **Credential-based ballot submission**: The `/ballots/submit` endpoint does NOT require an authenticated session. The credential (tokenMessage + signature + nullifier) IS the authorization. This is essential for anonymity.

4. **RSA Blind Signatures for anonymous credentials**: The system uses RSA Blind Signatures (RFC 9474) so the host cannot link voter identity to ballot choice. The client blinds the token message, the host blind-signs it, and the client unblinds to obtain a valid credential the host has never seen.

5. **Service-repo publication**: All public ballot records are written to a service-controlled ATProto repo using `com.minomobi.poll.*` record types. Responder repos are never involved.

6. **Structured tokenMessage with poll binding**: The token message includes the poll ID in cleartext, preventing cross-poll credential replay. The nullifier is deterministically derived from the token message, preventing arbitrary nullifier injection.

### Public vs. Authenticated Endpoints

| Classification | Endpoints | Notes |
|---|---|---|
| **Fully public** | GET /polls, GET /polls/:id, GET /tally, GET /ballots, GET /audit, GET /eligible | Transparency by design — auditability |
| **Session required** | POST /polls, POST /open, POST /close, POST /eligibility/request | Identity verification for eligibility |
| **Credential-based** | POST /ballots/submit | No session — credential IS auth |
| **Host only** | POST /finalize, DELETE /polls/:id, POST /publish, POST /post-to-bluesky | Poll owner actions |

See [threat-model.md](threat-model.md) for the live monitoring analysis of public endpoints.
