/**
 * Vault crypto layer — all client-side, all WebCrypto.
 *
 * Key hierarchy:
 *   passphrase → PBKDF2 → KEK (AES-256, wrapping only)
 *     KEK wraps/unwraps identity ECDH private key
 *     ECDH(identity, identity) → HKDF → DEK (AES-256-GCM)
 *       DEK encrypts/decrypts vault.sealed records
 *
 * For v0.1: single user, so DEK is derived from own identity key
 * via self-ECDH. Group key exchange comes later.
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
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
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

/** Wrap (encrypt) the private key with the KEK for PDS storage. */
export async function wrapPrivateKey(
  privateKey: CryptoKey,
  kek: CryptoKey
): Promise<Uint8Array> {
  const buf = await crypto.subtle.wrapKey("pkcs8", privateKey, kek, "AES-KW");
  return new Uint8Array(buf);
}

/** Unwrap (decrypt) the private key from PDS storage using the KEK. */
export async function unwrapPrivateKey(
  wrappedKey: Uint8Array,
  kek: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "pkcs8",
    wrappedKey,
    kek,
    "AES-KW",
    { name: "ECDH", namedCurve: "P-256" },
    false, // non-extractable after unwrap
    ["deriveKey", "deriveBits"]
  );
}

/** Import a raw public key (from PDS encryptionKey record). */
export async function importPublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw,
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
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: HKDF_INFO },
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
    { name: "AES-GCM", iv },
    dek,
    plaintext
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
    { name: "AES-GCM", iv },
    dek,
    ciphertext
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
