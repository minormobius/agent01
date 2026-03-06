/**
 * Credential system for anonymous polls — RSA Blind Signatures (RFC 9474).
 *
 * Flow:
 * 1. Responder generates secret locally, computes tokenMessage, BLINDS it
 * 2. Responder sends blindedMsg to host (host cannot see tokenMessage)
 * 3. Host blind-signs blindedMsg, returns blindSig
 * 4. Responder unblinds (finalize) blindSig -> real RSA-PSS signature
 * 5. Responder now holds {secret, tokenMessage, signature} — host never learned tokenMessage
 * 6. Ballot submission: verifier checks RSA-PSS signature. Standard RSA verify, no blind awareness.
 */

import { RSABSSA } from '@cloudflare/blindrsa-ts';
import type { BlindRSA } from '@cloudflare/blindrsa-ts';

const BALLOT_VERSION = 1;
const encoder = new TextEncoder();

// --- Suite singleton ---
// RFC 9474: RSABSSA-SHA384-PSS-Randomized
// On CF Workers, pass supportsRSARAW: true for the optimized path.
let _suite: BlindRSA | null = null;

export function getBlindRSASuite(supportsRSARAW = false): BlindRSA {
  if (!_suite) {
    _suite = RSABSSA.SHA384.PSS.Randomized({ supportsRSARAW });
  }
  return _suite;
}

// --- Hashing & randomness ---

async function sha256(data: string): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Base64url encoding for transport ---

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode base64url to bytes with a size limit to prevent memory exhaustion.
 * Default max 10KB — sufficient for RSA-4096 signatures (512 bytes) with margin.
 */
export function fromBase64Url(str: string, maxDecodedBytes = 10_000): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  if (binary.length > maxDecodedBytes) {
    throw new Error(`Decoded size ${binary.length} exceeds limit ${maxDecodedBytes}`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// --- Core credential functions ---

export function generateSecret(): string {
  return randomHex(32);
}

/**
 * Derive a token message using HMAC-SHA256 with proper domain separation.
 *
 * SECURITY: Uses HMAC-SHA256(key=secret, message="token_v{version}\x00{pollId}\x00{expiry}")
 * to prevent input boundary confusion and length extension attacks.
 */
export async function deriveTokenMessage(
  pollId: string,
  secret: string,
  expiry: string
): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const data = encoder.encode(`token_v${BALLOT_VERSION}\x00${pollId}\x00${expiry}`);
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, data);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derive a nullifier using HMAC-SHA256 with proper domain separation.
 *
 * SECURITY: Uses HMAC-SHA256(key=secret, message="nullifier\x00" + pollId) instead of
 * plain SHA-256 concatenation. This prevents:
 * - Input boundary confusion (e.g., secret="a||b" vs secret="a", pollId="b||...")
 * - Preimage attacks against the nullifier format
 * - Length extension attacks (SHA-256 is vulnerable, HMAC is not)
 */
export async function deriveNullifier(
  secret: string,
  pollId: string
): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const data = encoder.encode(`nullifier\x00${pollId}`);
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, data);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function makeReceipt(
  pollId: string,
  tokenMessage: string,
  nullifier: string
): Promise<string> {
  return sha256(`receipt||${pollId}||${tokenMessage}||${nullifier}`);
}

/**
 * Compute a ballot commitment for public records.
 *
 * SECURITY: This replaces publishing raw tokenMessage + nullifier in ballot records.
 * The commitment is binding (can't find two inputs that hash to the same value) but
 * hiding (observers can't recover tokenMessage or nullifier without the preimage).
 * Voters can prove their own ballot by opening the commitment with their secret.
 */
export async function computeBallotCommitment(
  tokenMessage: string,
  choice: number,
  nullifier: string
): Promise<string> {
  return sha256(`ballot_commitment||${tokenMessage}||${choice}||${nullifier}`);
}

export async function computeAuditHash(
  previousHash: string,
  eventType: string,
  eventPayload: string
): Promise<string> {
  return sha256(`${previousHash}||${eventType}||${eventPayload}`);
}

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

// --- RSA Blind Signature operations ---

/**
 * Import an RSA public key from JWK format.
 * Used by both client (for blinding) and server (for verification).
 */
export async function importRSAPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSA-PSS', hash: 'SHA-384' },
    true,
    ['verify']
  );
}

/**
 * Import an RSA private key from JWK format.
 * Used by the server for blind signing.
 */
export async function importRSAPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSA-PSS', hash: 'SHA-384' },
    true,
    ['sign']
  );
}

/**
 * Export an RSA public key as JWK.
 */
export async function exportRSAPublicKeyJWK(key: CryptoKey): Promise<JsonWebKey> {
  return globalThis.crypto.subtle.exportKey('jwk', key);
}

/**
 * Client-side: blind a token message before sending to the host.
 * Returns the blinded message and the inverse (blinding factor) needed for finalization.
 */
export async function blindMessage(
  tokenMessage: string,
  publicKey: CryptoKey,
  supportsRSARAW = false
): Promise<{ blindedMsg: string; inv: string }> {
  const suite = getBlindRSASuite(supportsRSARAW);
  const msgBytes = encoder.encode(tokenMessage);
  const { blindedMsg, inv } = await suite.blind(publicKey, msgBytes);
  return {
    blindedMsg: toBase64Url(blindedMsg),
    inv: toBase64Url(inv),
  };
}

/**
 * Server-side: blind-sign a blinded message.
 * The server never sees the original token message.
 */
export async function blindSign(
  blindedMsgB64: string,
  privateKey: CryptoKey,
  supportsRSARAW = false
): Promise<string> {
  const suite = getBlindRSASuite(supportsRSARAW);
  const blindedMsg = fromBase64Url(blindedMsgB64);
  const blindSig = await suite.blindSign(privateKey, blindedMsg);
  return toBase64Url(blindSig);
}

/**
 * Client-side: finalize (unblind) the blind signature.
 * The result is a standard RSA-PSS signature over the original token message.
 */
export async function finalizeBlindSignature(
  tokenMessage: string,
  blindSigB64: string,
  invB64: string,
  publicKey: CryptoKey,
  supportsRSARAW = false
): Promise<string> {
  const suite = getBlindRSASuite(supportsRSARAW);
  const msgBytes = encoder.encode(tokenMessage);
  const blindSig = fromBase64Url(blindSigB64);
  const inv = fromBase64Url(invB64);
  const signature = await suite.finalize(publicKey, msgBytes, blindSig, inv);
  return toBase64Url(signature);
}

/**
 * Verify an RSA-PSS signature over a token message.
 * Validates key algorithm properties before verification to prevent
 * algorithm substitution attacks.
 */
export async function verifyRSACredential(
  tokenMessage: string,
  signatureB64: string,
  publicKey: CryptoKey,
  supportsRSARAW = false
): Promise<boolean> {
  // SECURITY: Validate key properties to prevent algorithm substitution
  if (publicKey.type !== 'public') {
    throw new Error('Invalid key: expected public key');
  }
  const algo = publicKey.algorithm as RsaHashedKeyAlgorithm;
  if (algo.name !== 'RSA-PSS' || algo.hash?.name !== 'SHA-384') {
    throw new Error('Invalid key: must be RSA-PSS with SHA-384');
  }

  const suite = getBlindRSASuite(supportsRSARAW);
  const msgBytes = encoder.encode(tokenMessage);
  const signature = fromBase64Url(signatureB64);
  return suite.verify(publicKey, signature, msgBytes);
}

