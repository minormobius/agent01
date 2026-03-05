# Threat Model

## Trust Boundaries

### What the Host Knows

**Mode A (trusted_host_v1)**:
- Host sees the responder's DID during eligibility check
- Host generates the credential (secret, tokenMessage, signature)
- Host CAN link DID → credential → ballot
- Privacy relies on host not abusing this linkage
- This is analogous to a trusted election official

**Mode B (anon_credential_v2)**:
- Host sees the responder's DID during eligibility check
- Host signs a blinded message (cannot see the actual tokenMessage)
- Host CANNOT link DID → credential → ballot (when blind signatures are real)
- Privacy is cryptographic, not trust-based
- The stub implementation currently falls back to Mode A behavior

### What the Public Sees

In both modes, the public sees ONLY:
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
- **Mitigation**: Every accepted ballot has a valid credential signature and unique nullifier. In v2 with real blind signatures, the host cannot forge credentials without signing them through the issuance flow. The audit log with rolling hashes provides tamper evidence.

### Vote Buying / Coercion
- **Attack**: Responder sells or is coerced into revealing their vote
- **Mitigation**: In v1, the host could provide a receipt. In v2, the credential is unlinkable, making coercion verification harder. Full receipt-freeness would require additional protocol complexity.

### Credential Theft
- **Attack**: Attacker steals a responder's credential from localStorage
- **Mitigation**: Credentials are poll-scoped and time-limited. Once submitted, the nullifier is spent. The window of vulnerability is between issuance and submission.

### Replay Attack
- **Attack**: Attacker replays a previously submitted ballot
- **Mitigation**: Nullifier uniqueness is enforced atomically in the DO. A replayed nullifier is immediately rejected.

### Timing Analysis
- **Attack**: Host correlates eligibility request time with ballot submission time
- **Mitigation**: In v1, this is a real risk (host can correlate). In v2, the responder could add random delay between credential issuance and ballot submission. The protocol does not enforce timing separation.

### Audit Log Tampering
- **Attack**: Host modifies the audit log after the fact
- **Mitigation**: Rolling hash chain. Each event's hash includes the previous hash. Any modification breaks the chain. Publishing the audit log to ATProto provides additional tamper evidence.

## Trust Summary

| Property | Mode A (v1) | Mode B (v2 with real blind sigs) |
|----------|-------------|----------------------------------|
| One vote per DID | Enforced (DO) | Enforced (DO) |
| Ballot anonymity | Trust-based | Cryptographic |
| Tally correctness | Publicly verifiable | Publicly verifiable |
| Ballot authenticity | Signature verified | Signature verified |
| Host cannot stuff | Audit trail | Audit trail + unforgeable credentials |
| Coercion resistance | Weak | Moderate |
| Timing correlation | Vulnerable | Mitigatable with delay |

## Residual Risks

1. **Cloudflare as infrastructure provider**: CF has access to Worker memory. For nation-state threat models, this matters. For community polls, it's acceptable.
2. **D1 durability**: D1 is eventually consistent. The DO is the authoritative write path; D1 is for recovery and queries.
3. **ATProto public repo**: Published records are permanent on the AT Protocol network. Anonymized ballots cannot be un-published.
