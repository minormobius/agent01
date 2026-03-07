/**
 * OAuth JWT utilities — DPoP proofs and client assertions.
 *
 * Uses Web Crypto API (available in Cloudflare Workers) for ES256 signing.
 * No external dependencies.
 */

// --- Base64url encoding ---

function base64url(buf: ArrayBuffer): string {
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
    true, // extractable — needed to export JWK
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

export async function importPublicKeyJWK(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true, ['verify']
  );
}

// --- JWT signing ---

async function signJWT(
  header: Record<string, any>,
  payload: Record<string, any>,
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

  // Convert DER signature to fixed-length r||s format for JWS
  const sigBytes = new Uint8Array(sig);
  const r_s = derToRS(sigBytes);

  return `${signingInput}.${base64url(r_s.buffer as ArrayBuffer)}`;
}

/**
 * Web Crypto ECDSA P-256 produces DER-encoded signatures.
 * JWS requires raw r||s (64 bytes for P-256).
 */
function derToRS(der: Uint8Array): Uint8Array {
  // Some engines return raw r||s already (64 bytes)
  if (der.length === 64) return der;

  // DER: 0x30 <len> 0x02 <rLen> <r> 0x02 <sLen> <s>
  let offset = 2; // skip 0x30 <totalLen>
  if (der[1] & 0x80) offset += (der[1] & 0x7f); // long form length

  // Read r
  offset++; // 0x02
  const rLen = der[offset++];
  const rStart = offset;
  offset += rLen;

  // Read s
  offset++; // 0x02
  const sLen = der[offset++];
  const sStart = offset;

  const result = new Uint8Array(64);
  // Right-align r and s into 32-byte slots
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

/**
 * Create a DPoP proof JWT per RFC 9449.
 */
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

  const payload: Record<string, any> = {
    jti: crypto.randomUUID(),
    htm: method,
    htu: url,
    iat: Math.floor(Date.now() / 1000),
  };

  if (nonce) {
    payload.nonce = nonce;
  }

  // If binding to an access token, include ath (access token hash)
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

/**
 * Create a client_assertion JWT for token endpoint authentication.
 */
export async function createClientAssertion(
  clientPrivateKey: CryptoKey,
  clientPublicJWK: JsonWebKey,
  clientId: string,
  tokenEndpoint: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    typ: 'jwt',
    alg: 'ES256',
    kid: (clientPublicJWK as any).kid || await computeJWKThumbprint(clientPublicJWK),
  };

  const payload = {
    iss: clientId,
    sub: clientId,
    aud: tokenEndpoint,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + 60, // 1 minute validity
  };

  return signJWT(header, payload, clientPrivateKey);
}

/**
 * Compute JWK thumbprint (RFC 7638) for key identification.
 */
async function computeJWKThumbprint(jwk: JsonWebKey): Promise<string> {
  // For EC keys, canonical form is {crv, kty, x, y}
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

// --- State parameter ---

export function generateState(): string {
  return crypto.randomUUID();
}
