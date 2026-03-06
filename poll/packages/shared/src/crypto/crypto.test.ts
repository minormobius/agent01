import { describe, it, expect } from 'vitest';
import {
  generateSecret,
  deriveTokenMessage,
  deriveNullifier,
  makeReceipt,
  computeAuditHash,
  recomputeTally,
} from './index.js';

describe('credential crypto', () => {
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

