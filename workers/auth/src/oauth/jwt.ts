/**
 * OAuth JWT utilities — DPoP proofs, client assertions, PKCE.
 * Uses Web Crypto API (Cloudflare Workers). No dependencies.
 * Extracted from poll/apps/api/src/oauth/jwt.ts.
 */

// --- Base64url encoding ---

export function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// --- Key management ---

export async function generateES256KeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  ) as Promise<CryptoKeyPair>;
}

export async function exportPublicKeyJWK(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key) as Promise<JsonWebKey>;
}

export async function exportPrivateKeyJWK(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key) as Promise<JsonWebKey>;
}

export async function importPrivateKeyJWK(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );
}

// --- JWT signing ---

async function signJWT(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: CryptoKey
): Promise<string> {
  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  const sigBytes = new Uint8Array(sig);
  const r_s = derToRS(sigBytes);

  return `${signingInput}.${base64url(r_s.buffer as ArrayBuffer)}`;
}

/**
 * Web Crypto ECDSA P-256 produces DER-encoded signatures.
 * JWS requires raw r||s (64 bytes for P-256).
 */
function derToRS(der: Uint8Array): Uint8Array {
  if (der.length === 64) return der;

  let offset = 2;
  if (der[1] & 0x80) offset += (der[1] & 0x7f);

  offset++; // 0x02
  const rLen = der[offset++];
  const rStart = offset;
  offset += rLen;

  offset++; // 0x02
  const sLen = der[offset++];
  const sStart = offset;

  const result = new Uint8Array(64);
  const rBytes = der.slice(rStart, rStart + rLen);
  const sBytes = der.slice(sStart, sStart + sLen);
  result.set(rBytes.length > 32 ? rBytes.slice(rBytes.length - 32) : rBytes, 32 - Math.min(rBytes.length, 32));
  result.set(sBytes.length > 32 ? sBytes.slice(sBytes.length - 32) : sBytes, 64 - Math.min(sBytes.length, 32));

  return result;
}

// --- DPoP Proofs (RFC 9449) ---

export interface DPoPKeyPair {
  privateKey: CryptoKey;
  publicJWK: JsonWebKey;
}

export async function generateDPoPKeyPair(): Promise<DPoPKeyPair> {
  const pair = await generateES256KeyPair();
  const publicJWK = await exportPublicKeyJWK(pair.publicKey);
  return { privateKey: pair.privateKey, publicJWK };
}

export async function serializeDPoPKeyPair(dpop: DPoPKeyPair): Promise<{ privateKeyJWK: JsonWebKey; publicKeyJWK: JsonWebKey }> {
  const privateKeyJWK = await exportPrivateKeyJWK(dpop.privateKey);
  return { privateKeyJWK, publicKeyJWK: dpop.publicJWK };
}

export async function deserializeDPoPKeyPair(data: { privateKeyJWK: JsonWebKey; publicKeyJWK: JsonWebKey }): Promise<DPoPKeyPair> {
  const privateKey = await importPrivateKeyJWK(data.privateKeyJWK);
  return { privateKey, publicJWK: data.publicKeyJWK };
}

export async function createDPoPProof(
  dpop: DPoPKeyPair,
  method: string,
  url: string,
  nonce?: string,
  accessToken?: string,
): Promise<string> {
  const header = {
    typ: 'dpop+jwt',
    alg: 'ES256',
    jwk: dpop.publicJWK,
  };

  const payload: Record<string, unknown> = {
    jti: crypto.randomUUID(),
    htm: method,
    htu: url,
    iat: Math.floor(Date.now() / 1000),
  };

  if (nonce) payload.nonce = nonce;

  if (accessToken) {
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(accessToken)
    );
    payload.ath = base64url(hash);
  }

  return signJWT(header, payload, dpop.privateKey);
}

// --- Client Assertions (RFC 7523, private_key_jwt) ---

export async function createClientAssertion(
  clientPrivateKey: CryptoKey,
  clientPublicJWK: JsonWebKey,
  clientId: string,
  audience: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    typ: 'jwt',
    alg: 'ES256',
    kid: (clientPublicJWK as unknown as Record<string, unknown>).kid || await computeJWKThumbprint(clientPublicJWK),
  };

  const payload = {
    iss: clientId,
    sub: clientId,
    aud: audience,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + 60,
  };

  return signJWT(header, payload, clientPrivateKey);
}

export async function computeJWKThumbprint(jwk: JsonWebKey): Promise<string> {
  const canonical = JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y,
  });
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return base64url(hash);
}

// --- PKCE (RFC 7636, S256) ---

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes.buffer);
}

export async function computeCodeChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  );
  return base64url(hash);
}

export function generateState(): string {
  return crypto.randomUUID();
}
