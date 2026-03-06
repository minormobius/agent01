# Plan: Anonymous Credential v2 — RSA Blind Signatures

## What Changes

Replace HMAC-based credential issuance (host sees everything) with RSA Blind Signatures (RFC 9474). After this, the host **cannot** link a voter's DID to their ballot. The trust assumption ("host doesn't log the ~100ms mapping") becomes a cryptographic guarantee.

## Library

**`@cloudflare/blindrsa-ts`** — Cloudflare's own RFC 9474 implementation. Uses WebCrypto natively, has a Workers-specific `supportRSARAW` optimization for the blind signing step. No Node.js dependencies.

## Key Management

Workers' WebCrypto can't *generate* RSA-PSS keys — only import them. So:

1. Generate a 2048-bit RSA key pair offline (OpenSSL or Node.js script)
2. Store the private key as a Cloudflare Worker secret (`RSA_PRIVATE_KEY_JWK`)
3. Store the public key in the poll definition (so clients can blind/verify)
4. Per-poll keys can come later; start with a single host key pair

We'll add a small script (`scripts/generate-rsa-keypair.js`) to do this once.

## Steps

### Step 1: Add `@cloudflare/blindrsa-ts` dependency

- `npm install @cloudflare/blindrsa-ts -w packages/shared`
- This gives both client-side (blind/unblind) and server-side (blindSign) functions

### Step 2: Implement `RealBlindSignatureProvider` in crypto module

**File**: `packages/shared/src/crypto/index.ts`

Replace the `StubBlindSignatureProvider` with a real implementation that wraps `@cloudflare/blindrsa-ts`:

- `blind(message, publicKey)` → calls the library's `Blind` function
- `blindSign(blindedMessage, privateKey)` → calls `BlindSign` (with `supportRSARAW` on Workers)
- `unblind(blindedSignature, blindingFactor, publicKey)` → calls `Finalize`
- `verify(message, signature, publicKey)` → calls `Verify` (standard RSA-PSS)

Also update `issueCredential` / `verifyCredential` to branch on mode:
- v1: HMAC path (unchanged)
- v2: RSA blind signature path

Export client-side helpers: `blindMessage()`, `unblindSignature()` for the Vote page.

### Step 3: Update the Durable Object eligibility handler

**File**: `apps/api/src/durable-objects/poll-coordinator.ts` — `handleEligibility()`

Replace the current v2 rejection block with real blind signing:

```
if (poll.mode === 'anon_credential_v2') {
  if (!blindedMessage) return error('Blinded message required for v2')
  blindedSig = blindSign(decode(blindedMessage), rsaPrivateKey)
  return { eligible: true, blindedSignature: encode(blindedSig) }
}
```

The DO needs access to the RSA private key. Add it as an env binding (`RSA_PRIVATE_KEY_JWK`) and import it as a CryptoKey on first use.

The `handleBallot()` method needs its verification path updated:
- v1 polls: verify with HMAC (existing)
- v2 polls: verify with RSA-PSS public key

Store the poll's `mode` in the DO state (already there) and branch accordingly.

### Step 4: Update poll creation to store RSA public key

**File**: `apps/api/src/routes/polls.ts` — `createPoll()`

For v2 polls:
- Import the RSA public key from env
- Export it as JWK and store as `hostKeyFingerprint` (or add a new `hostPublicKey` field)
- The public key goes into the poll definition so clients can blind messages against it

Add a new D1 column `host_public_key TEXT` (nullable, only set for v2 polls). Migration 0004.

### Step 5: Update the frontend Vote page

**File**: `apps/web/src/pages/Vote.tsx` — `handleRequestCredential()`

For v2 polls, the client does more work:

1. Generate `secret` locally (using `generateSecret()` from shared crypto)
2. Compute `tokenMessage = deriveTokenMessage(pollId, secret, closesAt)`
3. Blind: `{blindedMessage, blindingFactor} = blind(tokenMessage, hostPublicKey)`
4. Send only `blindedMessage` to `/eligibility/request`
5. Receive `blindedSignature` back
6. Unblind: `issuerSignature = unblind(blindedSignature, blindingFactor, hostPublicKey)`
7. Derive `nullifier = deriveNullifier(secret, pollId)` locally
8. Store credential in localStorage (same shape as v1)
9. Ballot submission is identical — `{choice, tokenMessage, issuerSignature, nullifier}`

The shared crypto functions (`generateSecret`, `deriveTokenMessage`, `deriveNullifier`) are already exported and work in the browser.

### Step 6: Re-enable v2 in the UI

**File**: `apps/web/src/pages/CreatePoll.tsx`

- Add back the `anon_credential_v2` option in the mode dropdown
- Remove the "coming soon" text
- Remove the rejection guard in `createPoll()` route handler

### Step 7: Update schemas and types

- `EligibilityResponse` type: add `blindedSignature?: string` field
- `Poll` type: add `hostPublicKey?: string` field
- `PollDefRecordSchema`: add `hostPublicKey` field
- `CreatePollSchema`: allow `anon_credential_v2` again (already in enum, just ungated)
- Migration 0004: `ALTER TABLE polls ADD COLUMN host_public_key TEXT`

### Step 8: Key generation script

**File**: `scripts/generate-rsa-keypair.js`

Simple Node.js script that:
1. Generates 2048-bit RSA-PSS key pair
2. Exports private key as JWK (paste into CF secret)
3. Exports public key as JWK (stored per-poll)

### Step 9: Update docs and threat model

- `docs/threat-model.md`: update Mode B to reflect real cryptographic guarantee
- `docs/upgrade-blind-signatures.md`: mark as implemented
- `PROTOCOL.md`: update the trust assumption section

## What Does NOT Change

- Nullifier derivation (`H("nullifier" || secret || pollId)`)
- Ballot submission flow and schema
- Ballot verification logic (signature check, nullifier uniqueness)
- D1 tables: `ballots`, `eligibility`, `audit_events`, `tally_snapshots`
- Poll lifecycle (draft → open → closed → finalized)
- ATProto record shapes for published ballots
- Audit hash chain
- Fisher-Yates shuffle at publish time

## Risks & Mitigations

1. **Bundle size**: `@cloudflare/blindrsa-ts` depends on `sjcl` for big-integer math. Should be fine for Workers (no bundle limit) and frontend (tree-shakeable). Verify build size doesn't blow up.

2. **Key rotation**: Starting with a single host key pair. If it's compromised, all v2 polls are compromised. Future: per-poll key pairs (generate on poll creation, store private key in DO storage).

3. **Browser compatibility**: The library uses WebCrypto which is available in all modern browsers. The `blind`/`unblind` operations use sjcl's big-integer math, not WebCrypto RSA directly, so no browser RSA restrictions apply.

4. **Backward compatibility**: v1 polls continue working unchanged. Mode is per-poll. Both can coexist.

## Estimated Scope

| File | Change Size |
|------|------------|
| `packages/shared/src/crypto/index.ts` | ~80 lines (new provider + helpers) |
| `apps/api/src/durable-objects/poll-coordinator.ts` | ~30 lines (eligibility + ballot verify) |
| `apps/api/src/routes/polls.ts` | ~15 lines (store public key) |
| `apps/web/src/pages/Vote.tsx` | ~40 lines (client-side blinding) |
| `apps/web/src/pages/CreatePoll.tsx` | ~5 lines (re-enable v2) |
| `packages/shared/src/types/index.ts` | ~5 lines (new fields) |
| `packages/shared/src/schemas/index.ts` | ~5 lines (new fields) |
| `scripts/generate-rsa-keypair.js` | ~30 lines (new file) |
| Migration 0004 | ~3 lines |
| Docs updates | ~20 lines |
