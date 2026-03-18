/**
 * Vault crypto layer — all client-side, all WebCrypto.
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
 */

const PBKDF2_ITERATIONS = 600_000;
const HKDF_INFO = new TextEncoder().encode("vault-dek-v1");

// --- Key Derivation ---

/** Derive a KEK (Key Encryption Key) from a passphrase + salt via PBKDF2. */
export async function deriveKek(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(passphrase);
  const baseKey = await crypto.subtle.importKey("raw", raw, "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// --- Identity Key (ECDH P-256) ---

/** Generate a fresh ECDH P-256 key pair. */
export async function generateIdentityKey(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true, // extractable so we can wrap it
    ["deriveKey", "deriveBits"]
  );
}

/** Export the public key as raw bytes (65 bytes, uncompressed SEC1). */
export async function exportPublicKey(key: CryptoKey): Promise<Uint8Array> {
  const buf = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(buf);
}

/**
 * Encrypt the private key with the KEK for PDS storage.
 * Returns iv (12 bytes) + ciphertext concatenated.
 * Uses AES-GCM instead of AES-KW to avoid the multiple-of-8-bytes
 * requirement that breaks with some PKCS8 export lengths.
 */
export async function wrapPrivateKey(
  privateKey: CryptoKey,
  kek: CryptoKey
): Promise<Uint8Array> {
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", privateKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    kek,
    pkcs8
  );
  // Concatenate: 12-byte IV + ciphertext
  const result = new Uint8Array(12 + ct.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ct), 12);
  return result;
}

/**
 * Decrypt the private key from PDS storage using the KEK.
 * Input is iv (12 bytes) + ciphertext concatenated.
 */
export async function unwrapPrivateKey(
  wrappedKey: Uint8Array,
  kek: CryptoKey
): Promise<CryptoKey> {
  const iv = wrappedKey.slice(0, 12);
  const ct = wrappedKey.slice(12);
  const pkcs8 = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    kek,
    ct.buffer as ArrayBuffer
  );
  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "ECDH", namedCurve: "P-256" },
    false, // non-extractable after import
    ["deriveKey", "deriveBits"]
  );
}

/** Import a raw public key (from PDS encryptionKey record). */
export async function importPublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw.buffer as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

// --- DEK Derivation ---

/**
 * Derive the workspace DEK from an ECDH key agreement.
 * For v0.1 (single user): self-agreement (own private + own public).
 * For groups: agreement with each member's public key.
 */
export async function deriveDek(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<CryptoKey> {
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256
  );
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    bits,
    "HKDF",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32).buffer as ArrayBuffer, info: HKDF_INFO.buffer as ArrayBuffer },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"]
  );
}

// --- Seal / Unseal ---

/** Encrypt a JSON-serialized inner record with AES-256-GCM. */
export async function encrypt(
  plaintext: Uint8Array,
  dek: CryptoKey
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    dek,
    plaintext.buffer as ArrayBuffer
  );
  return { iv, ciphertext: new Uint8Array(ct) };
}

/** Decrypt an AES-256-GCM ciphertext back to plaintext bytes. */
export async function decrypt(
  ciphertext: Uint8Array,
  iv: Uint8Array,
  dek: CryptoKey
): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    dek,
    ciphertext.buffer as ArrayBuffer
  );
  return new Uint8Array(pt);
}

// --- Encode / Decode helpers ---

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- Org Tier Key Management ---

const MEMBER_WRAP_INFO = new TextEncoder().encode("vault-member-wrap-v1");

/** Generate a random AES-256-GCM key for an org tier. Extractable so it can be wrapped for members. */
export async function generateTierDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable — we need to wrap it for each member
    ["encrypt", "decrypt"]
  );
}

/** Export a tier DEK as raw bytes (for wrapping). */
export async function exportDekRaw(dek: CryptoKey): Promise<Uint8Array> {
  const buf = await crypto.subtle.exportKey("raw", dek);
  return new Uint8Array(buf);
}

/** Import raw bytes back into a non-extractable DEK for use. */
export async function importDekRaw(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw.buffer as ArrayBuffer,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable after import
    ["encrypt", "decrypt"]
  );
}

/**
 * Derive a wrapping key from ECDH agreement between two members.
 * Used to wrap/unwrap a tier DEK for a specific member.
 */
async function deriveWrappingKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<CryptoKey> {
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256
  );
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    bits,
    "HKDF",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32).buffer as ArrayBuffer, info: MEMBER_WRAP_INFO.buffer as ArrayBuffer },
    hkdfKey,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

/**
 * Wrap a tier DEK for a specific member using ECDH key agreement.
 * The sender uses their private key + the recipient's public key.
 */
export async function wrapDekForMember(
  tierDek: CryptoKey,
  senderPrivateKey: CryptoKey,
  recipientPublicKey: CryptoKey
): Promise<Uint8Array> {
  const wrappingKey = await deriveWrappingKey(senderPrivateKey, recipientPublicKey);
  const buf = await crypto.subtle.wrapKey("raw", tierDek, wrappingKey, "AES-KW");
  return new Uint8Array(buf);
}

/**
 * Unwrap a tier DEK received from another member.
 * The recipient uses their private key + the sender's public key.
 */
export async function unwrapDekFromMember(
  wrappedDek: Uint8Array,
  recipientPrivateKey: CryptoKey,
  senderPublicKey: CryptoKey
): Promise<CryptoKey> {
  const wrappingKey = await deriveWrappingKey(recipientPrivateKey, senderPublicKey);
  return crypto.subtle.unwrapKey(
    "raw",
    wrappedDek.buffer as ArrayBuffer,
    wrappingKey,
    "AES-KW",
    { name: "AES-GCM", length: 256 },
    false, // non-extractable after unwrap
    ["encrypt", "decrypt"]
  );
}

// --- High-level seal/unseal ---

/** Seal an inner record into a vault.sealed envelope. */
export async function sealRecord(
  innerType: string,
  record: object,
  keyringRkey: string,
  dek: CryptoKey
): Promise<object> {
  const json = JSON.stringify(record);
  const plaintext = new TextEncoder().encode(json);
  const { iv, ciphertext } = await encrypt(plaintext, dek);

  return {
    $type: "com.minomobi.vault.sealed",
    innerType,
    keyringRkey,
    iv: { $bytes: toBase64(iv) },
    ciphertext: { $bytes: toBase64(ciphertext) },
    createdAt: new Date().toISOString(),
  };
}

/** Unseal a vault.sealed record back to the inner record object. */
export async function unsealRecord<T = unknown>(
  envelope: Record<string, unknown>,
  dek: CryptoKey
): Promise<{ innerType: string; record: T }> {
  const ivField = envelope.iv as { $bytes: string } | undefined;
  const ctField = envelope.ciphertext as { $bytes: string } | undefined;
  if (!ivField?.$bytes || !ctField?.$bytes) {
    throw new Error("Invalid sealed envelope: missing iv or ciphertext bytes");
  }

  const iv = fromBase64(ivField.$bytes);
  const ciphertext = fromBase64(ctField.$bytes);
  const plaintext = await decrypt(ciphertext, iv, dek);
  const json = new TextDecoder().decode(plaintext);
  const record = JSON.parse(json) as T;
  return { innerType: envelope.innerType as string, record };
}
