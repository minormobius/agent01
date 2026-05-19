// airchat oauth/keypair.js — auto-managed OAuth client keypair.
// Port of poll's keypair.ts. Generates ES256 keypair on first request and
// stores it in `airchat_oauth_keypair` (singleton row). No manual secret
// configuration needed — first /client-metadata.json request seeds the row.

import {
  generateES256KeyPair, exportPublicKeyJWK, exportPrivateKeyJWK, importPrivateKeyJWK,
} from './jwt.js';

function base64url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let cached = null;

async function computeKid(publicJwk) {
  const canonical = JSON.stringify({
    crv: publicJwk.crv, kty: publicJwk.kty, x: publicJwk.x, y: publicJwk.y,
  });
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return base64url(hash);
}

export async function getOAuthKeypair(db) {
  if (cached) return cached;
  const row = await db.prepare(
    'SELECT private_key_jwk, public_key_jwk, kid FROM airchat_oauth_keypair WHERE id = 1'
  ).first();
  if (row) {
    cached = {
      privateKeyJWK: JSON.parse(row.private_key_jwk),
      publicKeyJWK: JSON.parse(row.public_key_jwk),
      kid: row.kid,
    };
    return cached;
  }
  // Generate fresh.
  const pair = await generateES256KeyPair();
  const privateKeyJWK = await exportPrivateKeyJWK(pair.privateKey);
  const publicKeyJWK = await exportPublicKeyJWK(pair.publicKey);
  const kid = await computeKid(publicKeyJWK);
  const pubWithMeta = { ...publicKeyJWK, kid, use: 'sig', alg: 'ES256' };
  const privWithMeta = { ...privateKeyJWK, kid, use: 'sig', alg: 'ES256' };
  await db.prepare(
    `INSERT OR REPLACE INTO airchat_oauth_keypair (id, private_key_jwk, public_key_jwk, kid)
     VALUES (1, ?, ?, ?)`
  ).bind(JSON.stringify(privWithMeta), JSON.stringify(pubWithMeta), kid).run();
  cached = { privateKeyJWK: privWithMeta, publicKeyJWK: pubWithMeta, kid };
  return cached;
}

export async function getClientSigningKey(db) {
  const kp = await getOAuthKeypair(db);
  return importPrivateKeyJWK(kp.privateKeyJWK);
}
export async function getClientPublicJWK(db) {
  const kp = await getOAuthKeypair(db);
  return kp.publicKeyJWK;
}
