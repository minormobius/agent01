/**
 * Credential abstraction for anonymous poll system.
 *
 * This module implements the credential lifecycle:
 * - issueCredential: host issues a poll-scoped one-time token
 * - verifyCredential: host verifies token + signature on ballot submission
 * - deriveTokenMessage: compute m = H(version || poll_id || s || expiry)
 * - deriveNullifier: compute nullifier = H("nullifier" || s || poll_id)
 * - makeReceipt: compute a receipt hash for the responder
 *
 * UPGRADE PATH TO BLIND SIGNATURES:
 * In v2, the issuance flow changes:
 * 1. Responder generates s locally, computes m, BLINDS m -> m'
 * 2. Responder sends m' to host (host cannot see m)
 * 3. Host signs m' -> sig(m'), returns to responder
 * 4. Responder unblinds sig(m') -> sig(m)
 * 5. Now responder holds {s, m, sig(m)} without host knowing m
 *
 * To implement this:
 * - Replace `issueCredential` with `blindSign(blindedMessage, hostPrivateKey)`
 * - Add `blindMessage(m, blindingFactor)` on client side
 * - Add `unblindSignature(blindedSig, blindingFactor)` on client side
 * - `verifyCredential` stays the same (checks sig(m) against host public key)
 * - `deriveNullifier` stays the same (derived from s, which host never sees)
 *
 * The interfaces below are designed so that ONLY `issueCredential` needs to
 * change for the blind-signature upgrade. All other functions remain identical.
 */

const BALLOT_VERSION = 1;
const encoder = new TextEncoder();

// Use globalThis.crypto directly — CF Workers requires method calls
// to preserve the receiver (destructuring loses `this` binding).

async function sha256(data: string): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateSecret(): string {
  return randomHex(32);
}

export async function deriveTokenMessage(
  pollId: string,
  secret: string,
  expiry: string
): Promise<string> {
  return sha256(`${BALLOT_VERSION}||${pollId}||${secret}||${expiry}`);
}

export async function deriveNullifier(
  secret: string,
  pollId: string
): Promise<string> {
  return sha256(`nullifier||${secret}||${pollId}`);
}

/**
 * Issue a credential (Mode A: trusted-host).
 *
 * The host knows both the responder DID and the token message in this mode.
 * In Mode B (blind signatures), the host would sign a blinded message instead,
 * never learning the actual token message.
 *
 * @param signingKey - HMAC key material (host's private key)
 * @param tokenMessage - m = H(version || poll_id || s || expiry)
 * @returns HMAC signature over the token message
 */
export async function issueCredential(
  signingKey: string,
  tokenMessage: string
): Promise<string> {
  // In v1: HMAC-SHA256 signature. Host sees tokenMessage.
  // In v2: this would be replaced with RSA blind signature over a blinded message.
  // The host would call blindSign(blindedMessage, rsaPrivateKey) instead.
  return hmacSign(signingKey, tokenMessage);
}

/**
 * Verify a credential's signature.
 *
 * This function is UNCHANGED between v1 and v2.
 * In v2, the unblinded signature is a standard RSA signature that verifies
 * against the host's public key — same interface, different algorithm underneath.
 */
export async function verifyCredential(
  signingKey: string,
  tokenMessage: string,
  signature: string
): Promise<boolean> {
  const expected = await hmacSign(signingKey, tokenMessage);
  return timingSafeEqual(expected, signature);
}

export async function makeReceipt(
  pollId: string,
  tokenMessage: string,
  nullifier: string
): Promise<string> {
  return sha256(`receipt||${pollId}||${tokenMessage}||${nullifier}`);
}

/** Compute a rolling audit hash */
export async function computeAuditHash(
  previousHash: string,
  eventType: string,
  eventPayload: string
): Promise<string> {
  return sha256(`${previousHash}||${eventType}||${eventPayload}`);
}

/** Verify that a tally matches a set of public ballots */
export function recomputeTally(
  ballots: Array<{ option: number; accepted: boolean }>,
  optionCount: number
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (let i = 0; i < optionCount; i++) {
    counts[String(i)] = 0;
  }
  for (const ballot of ballots) {
    if (ballot.accepted && counts[String(ballot.option)] !== undefined) {
      counts[String(ballot.option)]++;
    }
  }
  return counts;
}

// --- Internal helpers ---

async function hmacSign(key: string, message: string): Promise<string> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// --- Blind signature scaffold (Mode B / v2) ---

/**
 * BLIND SIGNATURE INTERFACES
 *
 * These interfaces define the contract for a future blind-signature implementation.
 * In v2, a real RSA blind signature library (e.g., @nicolo-ribaudo/blind-rsa-signatures
 * or a WASM-compiled implementation) would provide these functions.
 */

export interface BlindSignatureProvider {
  /**
   * Client-side: blind a message before sending to the host.
   * The host cannot recover the original message from the blinded version.
   */
  blind(message: Uint8Array, publicKey: CryptoKey): Promise<{
    blindedMessage: Uint8Array;
    blindingFactor: Uint8Array;
  }>;

  /**
   * Host-side: sign a blinded message.
   * The host never sees the original message.
   */
  blindSign(blindedMessage: Uint8Array, privateKey: CryptoKey): Promise<Uint8Array>;

  /**
   * Client-side: unblind the signature.
   * The resulting signature is valid against the original (unblinded) message
   * and the host's public key.
   */
  unblind(
    blindedSignature: Uint8Array,
    blindingFactor: Uint8Array,
    publicKey: CryptoKey
  ): Promise<Uint8Array>;

  /**
   * Anyone: verify an unblinded signature against the original message.
   * This is a standard RSA-PSS verify — no blind-signature awareness needed.
   */
  verify(message: Uint8Array, signature: Uint8Array, publicKey: CryptoKey): Promise<boolean>;

  /** Generate a new RSA key pair for the host. */
  generateKeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }>;
}

/**
 * Stub implementation for development/testing.
 * Falls back to HMAC-based signing (same as v1) but through the v2 interface.
 */
export class StubBlindSignatureProvider implements BlindSignatureProvider {
  async blind(message: Uint8Array): Promise<{ blindedMessage: Uint8Array; blindingFactor: Uint8Array }> {
    // Stub: no actual blinding; message passes through
    return { blindedMessage: message, blindingFactor: new Uint8Array(0) };
  }

  async blindSign(blindedMessage: Uint8Array, _privateKey: CryptoKey): Promise<Uint8Array> {
    // Stub: hash-based signature
    const hash = await globalThis.crypto.subtle.digest('SHA-256', blindedMessage.buffer as ArrayBuffer);
    return new Uint8Array(hash);
  }

  async unblind(blindedSignature: Uint8Array): Promise<Uint8Array> {
    // Stub: no unblinding needed
    return blindedSignature;
  }

  async verify(message: Uint8Array, signature: Uint8Array, _publicKey: CryptoKey): Promise<boolean> {
    const hash = await globalThis.crypto.subtle.digest('SHA-256', message.buffer as ArrayBuffer);
    const expected = new Uint8Array(hash);
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected[i] ^ signature[i];
    }
    return diff === 0;
  }

  async generateKeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
    // Stub: generate an HMAC key and return it as both public/private
    const key = await globalThis.crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, true, ['sign', 'verify']);
    return { publicKey: key, privateKey: key };
  }
}
