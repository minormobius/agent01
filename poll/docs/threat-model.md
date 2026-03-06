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
- **Attack**: Attacker steals a responder's credential from localStorage
- **Mitigation**: Credentials are poll-scoped and time-limited. Once submitted, the nullifier is spent. The window of vulnerability is between issuance and submission.

### Replay Attack
- **Attack**: Attacker replays a previously submitted ballot
- **Mitigation**: Nullifier uniqueness is enforced atomically in the DO. A replayed nullifier is immediately rejected.

### Timing Analysis
- **Attack**: Host correlates eligibility request time with ballot submission time
- **Mitigation**: The responder could add random delay between credential issuance and ballot submission. The protocol does not enforce timing separation, but the blind signature ensures the host cannot link the credential to the ballot even with timing data.

### Audit Log Tampering
- **Attack**: Host modifies the audit log after the fact
- **Mitigation**: Rolling hash chain. Each event's hash includes the previous hash. Any modification breaks the chain. Publishing the audit log to ATProto provides additional tamper evidence.

## Trust Summary

| Property | Guarantee |
|----------|-----------|
| One vote per DID | Enforced (DO) |
| Ballot anonymity | Cryptographic (RSA Blind Signatures) |
| Tally correctness | Publicly verifiable |
| Ballot authenticity | RSA-PSS signature verified |
| Host cannot stuff | Audit trail + unforgeable credentials |
| Coercion resistance | Moderate (credential unlinkable) |
| Timing correlation | Mitigatable with delay |

## Residual Risks

1. **Cloudflare as infrastructure provider**: CF has access to Worker memory. For nation-state threat models, this matters. For community polls, it's acceptable.
2. **D1 durability**: D1 is eventually consistent. The DO is the authoritative write path; D1 is for recovery and queries.
3. **ATProto public repo**: Published records are permanent on the AT Protocol network. Anonymized ballots cannot be un-published.
