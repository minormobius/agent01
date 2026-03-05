# Architecture Summary

## System Overview

Anonymous Polls is a privacy-preserving, publicly auditable poll system built on AT Protocol and Cloudflare infrastructure.

### Core Properties
- Responders authenticate privately via ATProto OAuth
- Each eligible responder receives exactly one ballot credential
- Responders do NOT publish ballots from their own ATProto repos
- Accepted anonymized ballots are published from a service-controlled ATProto repo
- The public can verify the tally from public ballot artifacts
- The host enforces one-vote-per-eligible-responder via Durable Objects

### Deployment Shape

```
Cloudflare Pages (frontend)     Cloudflare Worker (API)
       polls.example.com    -->    api.polls.example.com
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
2. **Authentication**: Responder logs in via ATProto OAuth → session in D1
3. **Credential Issuance**: Responder requests eligibility → DO issues one-time credential → DID marked consumed
4. **Ballot Submission**: Responder submits ballot with credential (no identity) → DO verifies signature + nullifier uniqueness → ballot accepted atomically
5. **Publication**: Accepted ballot published to service ATProto repo (no responder DID in record)
6. **Verification**: Anyone can fetch public ballots and recompute tally

### Key Design Decisions

1. **Durable Objects as serialized write coordinators**: All state mutations go through a per-poll DO, ensuring atomic eligibility consumption, nullifier uniqueness, and tally updates.

2. **D1 for persistence and queryability**: The DO is authoritative for live state; D1 provides durable storage, historical queries, and recovery.

3. **Credential-based ballot submission**: The `/ballots/submit` endpoint does NOT require an authenticated session. The credential (tokenMessage + signature + nullifier) IS the authorization. This is essential for anonymity.

4. **Two modes in one codebase**: Mode A (trusted_host_v1) is fully functional. Mode B (anon_credential_v2) uses the same interfaces with a clear upgrade path to blind signatures.

5. **Service-repo publication**: All public ballot records are written to a service-controlled ATProto repo using `com.minomobi.poll.*` record types. Responder repos are never involved.
