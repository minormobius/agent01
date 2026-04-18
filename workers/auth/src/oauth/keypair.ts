/**
 * Auto-managed OAuth client keypair.
 * Generates an ES256 keypair on first use and stores it in D1.
 * Extracted from poll/apps/api/src/oauth/keypair.ts.
 */

import {
  generateES256KeyPair,
  exportPublicKeyJWK,
  exportPrivateKeyJWK,
  importPrivateKeyJWK,
  base64url,
} from './jwt.js';

interface StoredKeypair {
  privateKeyJWK: JsonWebKey;
  publicKeyJWK: JsonWebKey;
  kid: string;
}

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

export async function getOAuthKeypair(db: D1Database): Promise<StoredKeypair> {
  if (cached) return cached;

  const row = await db.prepare(
    'SELECT private_key_jwk, public_key_jwk, kid FROM oauth_client_keypair WHERE id = 1'
  ).first();

  if (row) {
    cached = {
      privateKeyJWK: JSON.parse(row.private_key_jwk as string),
      publicKeyJWK: JSON.parse(row.public_key_jwk as string),
      kid: row.kid as string,
    };
    return cached;
  }

  // Generate new keypair on first use
  const pair = await generateES256KeyPair();
  const privateKeyJWK = await exportPrivateKeyJWK(pair.privateKey);
  const publicKeyJWK = await exportPublicKeyJWK(pair.publicKey);
  const kid = await computeKid(publicKeyJWK);

  const pubWithMeta = { ...publicKeyJWK, kid, use: 'sig', alg: 'ES256' };
  const privWithMeta = { ...privateKeyJWK, kid, use: 'sig', alg: 'ES256' };

  await db.prepare(
    `INSERT OR REPLACE INTO oauth_client_keypair (id, private_key_jwk, public_key_jwk, kid)
     VALUES (1, ?, ?, ?)`
  ).bind(
    JSON.stringify(privWithMeta),
    JSON.stringify(pubWithMeta),
    kid,
  ).run();

  cached = { privateKeyJWK: privWithMeta, publicKeyJWK: pubWithMeta, kid };
  return cached;
}

export async function getClientSigningKey(db: D1Database): Promise<CryptoKey> {
  const kp = await getOAuthKeypair(db);
  return importPrivateKeyJWK(kp.privateKeyJWK);
}

export async function getClientPublicJWK(db: D1Database): Promise<JsonWebKey> {
  const kp = await getOAuthKeypair(db);
  return kp.publicKeyJWK;
}
