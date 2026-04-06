/**
 * Shared vault crypto layer — all client-side, all WebCrypto.
 *
 * Key hierarchy:
 *   passphrase → PBKDF2 → KEK (AES-256-GCM, encrypts identity key)
 *     KEK encrypts/decrypts identity ECDH private key (PKCS8)
 *     ECDH(identity, identity) → HKDF → DEK (AES-256-GCM)
 *       DEK encrypts/decrypts vault.sealed records
 *
 * Personal vault: self-ECDH derives a personal DEK.
 * Org mode: each tier has a random DEK, wrapped per-member via ECDH.
 *
 * Note: KEK uses AES-GCM (not AES-KW) because AES-KW requires input
 * to be a multiple of 8 bytes, but PKCS8-encoded ECDH keys can be
 * 138 bytes depending on the browser — causing failures on some machines.
 *
 * Usage:
 *   import { deriveKek, generateIdentityKey, sealRecord, unsealRecord } from '../../packages/atproto/crypto.js';
 */

const PBKDF2_ITERATIONS = 600_000;
const HKDF_INFO = new TextEncoder().encode('vault-dek-v1');
const MEMBER_WRAP_INFO = new TextEncoder().encode('vault-member-wrap-v1');

// ─── Base64 Helpers ──────────────────────────────────────────────

export function toBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── Key Derivation ──────────────────────────────────────────────

/** Derive a KEK (Key Encryption Key) from a passphrase + salt via PBKDF2. */
export async function deriveKek(passphrase, salt) {
  const raw = new TextEncoder().encode(passphrase);
  const baseKey = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─── Identity Key (ECDH P-256) ───────────────────────────────────

/** Generate a fresh ECDH P-256 key pair. */
export async function generateIdentityKey() {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

/** Export the public key as raw bytes (65 bytes, uncompressed SEC1). */
export async function exportPublicKey(key) {
  const buf = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(buf);
}

/** Import a raw public key (from PDS encryptionKey record). */
export async function importPublicKey(raw) {
  return crypto.subtle.importKey(
    'raw',
    raw.buffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

/**
 * Encrypt the private key with the KEK for PDS storage.
 * Returns iv (12 bytes) + ciphertext concatenated.
 */
export async function wrapPrivateKey(privateKey, kek) {
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer },
    kek,
    pkcs8
  );
  const result = new Uint8Array(12 + ct.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ct), 12);
  return result;
}

/**
 * Decrypt the private key from PDS storage using the KEK.
 * Input is iv (12 bytes) + ciphertext concatenated.
 */
export async function unwrapPrivateKey(wrappedKey, kek) {
  const iv = wrappedKey.slice(0, 12);
  const ct = wrappedKey.slice(12);
  const pkcs8 = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer },
    kek,
    ct.buffer
  );
  return crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits']
  );
}

// ─── DEK Derivation ──────────────────────────────────────────────

/**
 * Derive a workspace DEK from ECDH key agreement.
 * Personal vault: self-agreement (own private + own public).
 * Groups: agreement with each member's public key.
 */
export async function deriveDek(privateKey, publicKey) {
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    bits,
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32).buffer, info: HKDF_INFO.buffer },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─── Low-level Encrypt / Decrypt ─────────────────────────────────

/** Encrypt plaintext bytes with AES-256-GCM. Returns { iv, ciphertext }. */
export async function encrypt(plaintext, dek) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer },
    dek,
    plaintext.buffer
  );
  return { iv, ciphertext: new Uint8Array(ct) };
}

/** Decrypt AES-256-GCM ciphertext back to plaintext bytes. */
export async function decrypt(ciphertext, iv, dek) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer },
    dek,
    ciphertext.buffer
  );
  return new Uint8Array(pt);
}

// ─── Org Tier Key Management ─────────────────────────────────────

/** Generate a random AES-256-GCM key for an org tier. Extractable for wrapping. */
export async function generateTierDek() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/** Export a tier DEK as raw bytes (for wrapping). */
export async function exportDekRaw(dek) {
  const buf = await crypto.subtle.exportKey('raw', dek);
  return new Uint8Array(buf);
}

/** Import raw bytes back into a non-extractable DEK for use. */
export async function importDekRaw(raw) {
  return crypto.subtle.importKey(
    'raw',
    raw.buffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Derive a wrapping key from ECDH agreement between two members. */
async function deriveMemberKey(privateKey, publicKey) {
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    bits,
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32).buffer, info: MEMBER_WRAP_INFO.buffer },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Wrap a tier DEK for a specific member using ECDH key agreement.
 * Returns iv (12 bytes) + ciphertext concatenated.
 */
export async function wrapDekForMember(tierDek, senderPrivateKey, recipientPublicKey) {
  const memberKey = await deriveMemberKey(senderPrivateKey, recipientPublicKey);
  const dekRaw = await crypto.subtle.exportKey('raw', tierDek);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer },
    memberKey,
    dekRaw
  );
  const result = new Uint8Array(12 + ct.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ct), 12);
  return result;
}

/**
 * Derive a legacy AES-KW wrapping key from ECDH agreement.
 * Used for keyrings written before the AES-KW → AES-GCM migration.
 */
async function deriveLegacyWrappingKey(privateKey, publicKey) {
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    bits,
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32).buffer, info: MEMBER_WRAP_INFO.buffer },
    hkdfKey,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

/**
 * Unwrap a tier DEK received from another member.
 * Detects format automatically:
 *   - 60 bytes: AES-GCM (current) — 12-byte IV + 48-byte ciphertext
 *   - 40 bytes: AES-KW (legacy) — raw AES-KW output (32-byte key + 8-byte integrity)
 * Returns an extractable DEK so it can be re-wrapped for other members.
 */
export async function unwrapDekFromMember(wrappedDek, recipientPrivateKey, senderPublicKey) {
  if (wrappedDek.length === 40) {
    // Legacy AES-KW format
    const wrappingKey = await deriveLegacyWrappingKey(recipientPrivateKey, senderPublicKey);
    return crypto.subtle.unwrapKey(
      'raw',
      wrappedDek.buffer,
      wrappingKey,
      'AES-KW',
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  // Current AES-GCM format
  const memberKey = await deriveMemberKey(recipientPrivateKey, senderPublicKey);
  const iv = wrappedDek.slice(0, 12);
  const ct = wrappedDek.slice(12);
  const dekRaw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer },
    memberKey,
    ct.buffer
  );
  return crypto.subtle.importKey(
    'raw',
    dekRaw,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// ─── High-level Seal / Unseal ────────────────────────────────────

/**
 * Seal an inner record into a vault.sealed envelope.
 *
 * The innerType is buried INSIDE the ciphertext — the plaintext envelope
 * reveals only keyringRkey (needed to locate the DEK) and opaque crypto
 * fields. No type census, no temporal analysis.
 *
 * @param {string} innerType - The $type of the inner record
 * @param {object} record - The record to encrypt
 * @param {string} keyringRkey - Rkey of the keyring that holds the DEK
 * @param {CryptoKey} dek - The data encryption key
 */
export async function sealRecord(innerType, record, keyringRkey, dek) {
  const inner = { $innerType: innerType, ...record };
  const json = JSON.stringify(inner);
  const plaintext = new TextEncoder().encode(json);
  const { iv, ciphertext } = await encrypt(plaintext, dek);

  return {
    $type: 'com.minomobi.vault.sealed',
    keyringRkey,
    iv: { $bytes: toBase64(iv) },
    ciphertext: { $bytes: toBase64(ciphertext) },
    createdAt: new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z',
  };
}

/**
 * Unseal a vault.sealed record back to the inner record object.
 *
 * Reads $innerType from inside the decrypted payload (post-shield upgrade)
 * or falls back to the plaintext envelope.innerType for legacy records.
 *
 * @param {object} envelope - The sealed record from PDS
 * @param {CryptoKey} dek - The data encryption key
 * @returns {Promise<{ innerType: string, record: object }>}
 */
export async function unsealRecord(envelope, dek) {
  const ivField = envelope.iv;
  const ctField = envelope.ciphertext;
  if (!ivField?.$bytes || !ctField?.$bytes) {
    throw new Error('Invalid sealed envelope: missing iv or ciphertext bytes');
  }

  const iv = fromBase64(ivField.$bytes);
  const ciphertext = fromBase64(ctField.$bytes);
  const plaintext = await decrypt(ciphertext, iv, dek);
  const json = new TextDecoder().decode(plaintext);
  const parsed = JSON.parse(json);

  const innerType = parsed.$innerType ?? envelope.innerType ?? 'unknown';
  const { $innerType: _, ...record } = parsed;
  return { innerType, record };
}
