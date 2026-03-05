import { describe, it, expect } from 'vitest';
import {
  generateSecret,
  deriveTokenMessage,
  deriveNullifier,
  issueCredential,
  verifyCredential,
  makeReceipt,
  computeAuditHash,
  recomputeTally,
} from './index.js';

describe('credential crypto', () => {
  const signingKey = 'test-signing-key-for-hmac-operations';
  const pollId = '550e8400-e29b-41d4-a716-446655440000';
  const expiry = '2026-12-31T23:59:59Z';

  it('generateSecret returns 64-char hex', () => {
    const s = generateSecret();
    expect(s).toHaveLength(64);
    expect(s).toMatch(/^[0-9a-f]+$/);
  });

  it('deriveTokenMessage is deterministic', async () => {
    const secret = 'a'.repeat(64);
    const m1 = await deriveTokenMessage(pollId, secret, expiry);
    const m2 = await deriveTokenMessage(pollId, secret, expiry);
    expect(m1).toBe(m2);
    expect(m1).toHaveLength(64);
  });

  it('different secrets produce different token messages', async () => {
    const m1 = await deriveTokenMessage(pollId, 'a'.repeat(64), expiry);
    const m2 = await deriveTokenMessage(pollId, 'b'.repeat(64), expiry);
    expect(m1).not.toBe(m2);
  });

  it('deriveNullifier is deterministic and poll-scoped', async () => {
    const secret = 'c'.repeat(64);
    const n1 = await deriveNullifier(secret, pollId);
    const n2 = await deriveNullifier(secret, pollId);
    expect(n1).toBe(n2);

    // Different poll => different nullifier
    const n3 = await deriveNullifier(secret, 'other-poll-id');
    expect(n1).not.toBe(n3);
  });

  it('issueCredential + verifyCredential round-trips', async () => {
    const secret = generateSecret();
    const m = await deriveTokenMessage(pollId, secret, expiry);
    const sig = await issueCredential(signingKey, m);

    expect(await verifyCredential(signingKey, m, sig)).toBe(true);
  });

  it('verifyCredential rejects wrong key', async () => {
    const m = await deriveTokenMessage(pollId, generateSecret(), expiry);
    const sig = await issueCredential(signingKey, m);
    expect(await verifyCredential('wrong-key', m, sig)).toBe(false);
  });

  it('verifyCredential rejects tampered message', async () => {
    const m = await deriveTokenMessage(pollId, generateSecret(), expiry);
    const sig = await issueCredential(signingKey, m);
    expect(await verifyCredential(signingKey, m + 'tampered', sig)).toBe(false);
  });

  it('verifyCredential rejects tampered signature', async () => {
    const m = await deriveTokenMessage(pollId, generateSecret(), expiry);
    const sig = await issueCredential(signingKey, m);
    const tampered = sig.slice(0, -2) + 'ff';
    expect(await verifyCredential(signingKey, m, tampered)).toBe(false);
  });

  it('makeReceipt is deterministic', async () => {
    const r1 = await makeReceipt(pollId, 'token123', 'null123');
    const r2 = await makeReceipt(pollId, 'token123', 'null123');
    expect(r1).toBe(r2);
    expect(r1).toHaveLength(64);
  });

  it('computeAuditHash chains correctly', async () => {
    const h0 = '0'.repeat(64);
    const h1 = await computeAuditHash(h0, 'event1', 'payload1');
    const h2 = await computeAuditHash(h1, 'event2', 'payload2');

    expect(h1).not.toBe(h0);
    expect(h2).not.toBe(h1);
    expect(h1).toHaveLength(64);

    // Deterministic
    const h1b = await computeAuditHash(h0, 'event1', 'payload1');
    expect(h1b).toBe(h1);
  });
});

describe('recomputeTally', () => {
  it('counts accepted ballots correctly', () => {
    const ballots = [
      { option: 0, accepted: true },
      { option: 1, accepted: true },
      { option: 0, accepted: true },
      { option: 2, accepted: true },
      { option: 1, accepted: false }, // rejected, should not count
    ];
    const result = recomputeTally(ballots, 3);
    expect(result).toEqual({ '0': 2, '1': 1, '2': 1 });
  });

  it('returns zeros for empty ballots', () => {
    const result = recomputeTally([], 3);
    expect(result).toEqual({ '0': 0, '1': 0, '2': 0 });
  });

  it('ignores invalid option indices', () => {
    const ballots = [
      { option: 0, accepted: true },
      { option: 99, accepted: true }, // out of range
    ];
    const result = recomputeTally(ballots, 2);
    expect(result).toEqual({ '0': 1, '1': 0 });
  });
});

describe('full credential lifecycle', () => {
  it('simulates complete Mode A flow', async () => {
    const signingKey = 'host-signing-key';
    const pollId = crypto.randomUUID();
    const closesAt = '2026-12-31T23:59:59Z';

    // 1. Responder generates secret
    const secret = generateSecret();

    // 2. Host derives token message and signs it (in Mode A, host sees everything)
    const tokenMessage = await deriveTokenMessage(pollId, secret, closesAt);
    const signature = await issueCredential(signingKey, tokenMessage);
    const nullifier = await deriveNullifier(secret, pollId);

    // 3. Credential issued to responder: {secret, tokenMessage, signature, nullifier}
    // This lives in the browser only, never in the responder's ATProto repo

    // 4. Responder submits ballot anonymously
    const ballot = {
      choice: 1,
      tokenMessage,
      issuerSignature: signature,
      nullifier,
      ballotVersion: 1,
    };

    // 5. Host verifies
    expect(await verifyCredential(signingKey, ballot.tokenMessage, ballot.issuerSignature)).toBe(true);

    // 6. Same nullifier cannot be reused
    const nullifierSet = new Set<string>();
    nullifierSet.add(nullifier);
    expect(nullifierSet.has(nullifier)).toBe(true); // Would reject second submission

    // 7. Different secret => different nullifier (another voter)
    const secret2 = generateSecret();
    const nullifier2 = await deriveNullifier(secret2, pollId);
    expect(nullifier2).not.toBe(nullifier);
    expect(nullifierSet.has(nullifier2)).toBe(false); // Would accept
  });
});
