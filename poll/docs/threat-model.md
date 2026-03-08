# Threat Model

## Trust Boundaries

### What the Host Knows

- Host sees the responder's DID during eligibility check
- Host signs a blinded message (cannot see the actual tokenMessage)
- Host CANNOT link DID → credential → ballot
- Privacy is cryptographic, not trust-based (RSA Blind Signatures, RFC 9474)

### What the Public Sees

The public sees ONLY:
- Poll definition (question, options, timing)
- Anonymized ballots (choice, tokenMessage, signature, nullifier)
- Tally snapshots
- Audit transcript (rolling hashes)

The public NEVER sees:
- Which DID voted
- Which DID received which credential
- The eligibility consumption log (private to host)

## Attacks and Mitigations

### Double Voting
- **Attack**: Responder tries to vote twice
- **Mitigation**: DO tracks consumed DIDs (one credential per DID) and spent nullifiers (one ballot per credential). Both checks are serialized in the DO.

### Ballot Stuffing (by host)
- **Attack**: Malicious host creates fake ballots
- **Mitigation**: Every accepted ballot has a valid credential signature and unique nullifier. The host cannot forge credentials without signing them through the blind issuance flow. The audit log with rolling hashes provides tamper evidence.

### Vote Buying / Coercion
- **Attack**: Responder sells or is coerced into revealing their vote
- **Mitigation**: The credential is unlinkable, making coercion verification harder. Full receipt-freeness would require additional protocol complexity.

### Credential Theft
- **Attack**: Attacker steals a responder's credential from sessionStorage
- **Mitigation**: Credentials are poll-scoped and time-limited. Once submitted, the nullifier is spent. The window of vulnerability is between issuance and submission. Credentials are stored in sessionStorage (clears on tab close), not localStorage.

### Replay Attack
- **Attack**: Attacker replays a previously submitted ballot
- **Mitigation**: Nullifier uniqueness is enforced atomically in the DO. A replayed nullifier is immediately rejected.

### Cross-Poll Credential Replay
- **Attack**: Attacker uses a credential issued for Poll A to vote on Poll B
- **Mitigation**: tokenMessage contains `pollId` in cleartext. The server parses it and rejects if `parsedToken.pollId !== poll.id`. Even though both polls share the same RSA key, the poll binding prevents cross-poll replay.

### Arbitrary Nullifier Injection
- **Attack**: Attacker submits a valid credential with a different nullifier to vote again
- **Mitigation**: Nullifier is deterministically derived: `SHA-256("nullifier\0" + tokenMessage)`. The server recomputes and rejects mismatches. One credential → one nullifier → one vote.

### Timing Analysis
- **Attack**: Host correlates eligibility request time with ballot submission time
- **Mitigation**: The blind signature ensures the host cannot link the credential to the ballot even with timing data. The voter could add random delay between credential issuance and ballot submission. The protocol does not enforce timing separation.

### Audit Log Tampering
- **Attack**: Host modifies the audit log after the fact
- **Mitigation**: Rolling hash chain. Each event's hash includes the previous hash. Any modification breaks the chain. Publishing the audit log to ATProto provides additional tamper evidence.

## Live Monitoring Surface

An attacker with no credentials can observe the system in real-time via unauthenticated public endpoints. This is a transparency-by-design trade-off, but creates timing correlation risks.

### What's observable without authentication

| Observable | Endpoint | Risk |
|---|---|---|
| Poll metadata + status | `GET /api/polls/:id` | Low — intentional |
| **Live vote distribution** | `GET /api/polls/:id/tally` | **High** — reveals vote-by-vote arrival |
| Ballot commitment list (growing) | `GET /api/polls/:id/ballots` | Medium — list growth rate leaks timing |
| Audit event timestamps | `GET /api/polls/:id/audit` | Medium — `ballot_accepted` timestamps |
| Eligible voter count | `GET /api/polls/:id/eligible` | Low — leaks pool size for restricted polls |
| Draft poll discovery | `GET /api/polls` | Low — reveals unpublished polls |

### The timing correlation attack

The most significant real-time leak is the tally endpoint. An attacker polling it every second can see exactly when each vote arrives and which option it went to. Combined with social signals (who's online, who just authenticated), this enables probabilistic deanonymization — even though the blind signature makes *cryptographic* deanonymization impossible.

```
Observer polls GET /tally every 1s:
  T=0:  {A: 10, B: 15}
  T=1:  {A: 10, B: 15}   — no change
  T=2:  {A: 10, B: 16}   — someone just voted B
  T=3:  {A: 10, B: 16}   — no change
```

Combined with: "Alice tweeted 'just voted!' at T=2" → probable correlation.

### Recommended mitigations (not yet implemented)

1. **Gate tally behind poll close**: Don't serve live counts while `status === 'open'`
2. **Gate ballot list behind poll close**: Don't return commitments until voting ends
3. **Batch audit event visibility**: Suppress `ballot_accepted` timestamps until close
4. **Filter draft polls from public list**: Only show `open` or later to unauthenticated callers

### What remains observable even with mitigations

- Poll existence and definition (voters need to find it)
- Eligible voter count (voters need to know scope)
- Final ballot set on service PDS (auditability requires it)
- That a ballot was submitted (server processes it) — but not which choice or whose

## Trust Summary

| Property | Guarantee |
|----------|-----------|
| One vote per DID | Enforced (DO) |
| Ballot anonymity | Cryptographic (RSA Blind Signatures) |
| One ballot per credential | Enforced (deterministic nullifier) |
| Poll-scoped credentials | Enforced (structured tokenMessage) |
| Tally correctness | Publicly verifiable |
| Ballot authenticity | RSA-PSS signature verified |
| Host cannot stuff | Audit trail + unforgeable credentials |
| Coercion resistance | Moderate (credential unlinkable) |
| Timing correlation | Mitigatable (see recommendations above) |

## Residual Risks

1. **Cloudflare as infrastructure provider**: CF has access to Worker memory. For nation-state threat models, this matters. For community polls, it's acceptable.
2. **D1 durability**: D1 is eventually consistent. The DO is the authoritative write path; D1 is for recovery and queries.
3. **ATProto public repo**: Published records are permanent on the AT Protocol network. Anonymized ballots cannot be un-published.
4. **Live tally endpoint**: Real-time vote counts leak temporal voting patterns to any observer. Cryptographic anonymity is preserved, but statistical correlation attacks are possible against small polls.
5. **Single RSA key**: All polls share one key pair. Cross-poll replay prevented by poll binding, not key separation.
