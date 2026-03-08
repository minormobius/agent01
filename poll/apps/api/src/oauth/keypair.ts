/**
 * Auto-managed OAuth client keypair.
 *
 * Generates an ES256 keypair on first use and stores it in D1.
 * Eliminates the need for OAUTH_SIGNING_*_KEY_JWK secrets —
 * no more copy-paste corruption from chat windows.
 */

import {
  generateES256KeyPair,
  exportPublicKeyJWK,
  exportPrivateKeyJWK,
  importPrivateKeyJWK,
} from './jwt.js';

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface StoredKeypair {
  privateKeyJWK: JsonWebKey;
  publicKeyJWK: JsonWebKey;
  kid: string;
}

/** In-memory cache — survives for the life of the Worker isolate. */
let cached: StoredKeypair | null = null;

async function computeKid(publicJwk: JsonWebKey): Promise<string> {
  const canonical = JSON.stringify({
    crv: publicJwk.crv,
    kty: publicJwk.kty,
    x: publicJwk.x,
    y: publicJwk.y,
  });
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return base64url(hash);
}

/**
 * Get or create the OAuth client keypair.
 * First checks in-memory cache, then D1, then generates a new one.
 */
export async function getOAuthKeypair(db: D1Database): Promise<StoredKeypair> {
  // 1. In-memory cache
  if (cached) return cached;

  // 2. Try D1
  const row = await db.prepare(
    'SELECT private_key_jwk, public_key_jwk, kid FROM oauth_client_keypair WHERE id = 1'
  ).first();

  if (row) {
    cached = {
      privateKeyJWK: JSON.parse(row.private_key_jwk as string),
      publicKeyJWK: JSON.parse(row.public_key_jwk as string),
      kid: row.kid as string,
    };
    console.log('OAuth client keypair loaded from D1');
    return cached;
  }

  // 3. Generate new keypair
  console.log('Generating new OAuth client keypair...');
  const pair = await generateES256KeyPair();
  const privateKeyJWK = await exportPrivateKeyJWK(pair.privateKey);
  const publicKeyJWK = await exportPublicKeyJWK(pair.publicKey);

  const kid = await computeKid(publicKeyJWK);
  // Add standard JWK fields (kid/use/alg aren't in the TS type but are valid JWK)
  const pubWithMeta = { ...publicKeyJWK, kid, use: 'sig', alg: 'ES256' };
  const privWithMeta = { ...privateKeyJWK, kid, use: 'sig', alg: 'ES256' };

  // Store in D1
  await db.prepare(
    `INSERT OR REPLACE INTO oauth_client_keypair (id, private_key_jwk, public_key_jwk, kid)
     VALUES (1, ?, ?, ?)`
  ).bind(
    JSON.stringify(privWithMeta),
    JSON.stringify(pubWithMeta),
    kid,
  ).run();

  cached = { privateKeyJWK: privWithMeta, publicKeyJWK: pubWithMeta, kid };
  console.log('OAuth client keypair generated and stored in D1');
  return cached;
}

/**
 * Get the imported CryptoKey for signing client assertions.
 */
export async function getClientSigningKey(db: D1Database): Promise<CryptoKey> {
  const kp = await getOAuthKeypair(db);
  return importPrivateKeyJWK(kp.privateKeyJWK);
}

/**
 * Get the public JWK for client-metadata.json.
 */
export async function getClientPublicJWK(db: D1Database): Promise<JsonWebKey> {
  const kp = await getOAuthKeypair(db);
  return kp.publicKeyJWK;
}
