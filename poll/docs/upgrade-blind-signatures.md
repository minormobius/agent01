# Upgrade Path: Blind Signatures

## Current State (v1: trusted_host)

The credential module uses HMAC-SHA256 for signing:
- `issueCredential(signingKey, tokenMessage)` → HMAC signature
- `verifyCredential(signingKey, tokenMessage, signature)` → boolean
- Host sees the full tokenMessage during issuance
- Host CAN link DID → tokenMessage → ballot

## Target State (v2: anonymous credential)

Replace HMAC with RSA Blind Signatures (RFC 9474):

### What Changes

1. **Key generation**: Host generates RSA key pair (done once per poll or globally)
   - Public key published in poll definition
   - Private key stored as Worker secret

2. **Issuance flow** (the ONLY part that changes):
   ```
   Current (v1):
     Responder: generates secret s
     Host: computes m = H(version || poll_id || s || expiry)
     Host: sig = HMAC(signingKey, m)
     Host: returns {s, m, sig} to responder

   Future (v2):
     Responder: generates secret s
     Responder: computes m = H(version || poll_id || s || expiry)
     Responder: blinds m → m' = blind(m, blindingFactor, hostPublicKey)
     Responder: sends m' to host
     Host: blindSig = RSA_sign(hostPrivateKey, m')   ← host never sees m
     Host: returns blindSig to responder
     Responder: sig = unblind(blindSig, blindingFactor, hostPublicKey)
     Responder: now holds {s, m, sig} — host never saw m or sig
   ```

3. **Verification** (UNCHANGED):
   - `verifyCredential(hostPublicKey, m, sig)` → RSA-PSS verify
   - Same interface, different algorithm underneath

4. **Nullifier derivation** (UNCHANGED):
   - `deriveNullifier(s, pollId)` → hash
   - Host never sees s in v2

### Files to Modify

| File | Change |
|------|--------|
| `packages/shared/src/crypto/index.ts` | Replace `issueCredential` internals with blind signing; replace `verifyCredential` with RSA-PSS verify |
| `apps/api/src/durable-objects/poll-coordinator.ts` | In `handleEligibility`, accept blinded message and call `blindSign` instead of full credential generation |
| `apps/web/src/pages/Vote.tsx` | Before requesting eligibility, generate s locally, compute m, blind it, send blinded message; after receiving blind signature, unblind |
| `apps/web/src/lib/api.ts` | Add blinded message to eligibility request |
| Poll definition | Include host RSA public key |

### What Does NOT Change

- Nullifier derivation
- Ballot submission flow
- Ballot verification
- Audit log structure
- D1 schema
- ATProto record shapes
- Tally computation
- Admin interface
- Public poll page

### Recommended Libraries

For Cloudflare Workers (WebCrypto-compatible):
- `blind-rsa-signatures` npm package (implements RFC 9474)
- Or custom WebCrypto implementation using RSA-PSS with blinding

### Implementation Steps

1. Add blind RSA library to `packages/shared`
2. Add `BlindSignatureProvider` implementation (interface already defined in crypto module)
3. Update `issueCredential` to branch on poll mode
4. Update frontend Vote page to perform client-side blinding
5. Update eligibility endpoint to accept/return blinded messages
6. Add integration test for full blind signature round-trip
7. Update threat model to reflect cryptographic anonymity guarantee

### Estimated Effort

The interfaces are designed for this. The actual change is:
- ~100 lines in the crypto module
- ~30 lines in the DO eligibility handler
- ~40 lines in the Vote page
- Test updates

The `BlindSignatureProvider` interface in the crypto module is the exact contract.
