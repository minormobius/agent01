// airchat oauth/jwt.js — DPoP proofs, client assertions, PKCE.
// Port of poll's apps/api/src/oauth/jwt.ts to vanilla JS for the airchat
// worker. Uses Web Crypto (available in Cloudflare Workers).

function base64url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64urlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generateES256KeyPair() {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
}
export async function exportPublicKeyJWK(key)  { return crypto.subtle.exportKey('jwk', key); }
export async function exportPrivateKeyJWK(key) { return crypto.subtle.exportKey('jwk', key); }
export async function importPrivateKeyJWK(jwk) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}
export async function importPublicKeyJWK(jwk) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
}

async function signJWT(header, payload, privateKey) {
  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  const sigBytes = new Uint8Array(sig);
  const r_s = derToRS(sigBytes);
  return `${signingInput}.${base64url(r_s.buffer)}`;
}

// Web Crypto returns DER; JWS needs raw r||s.
function derToRS(der) {
  if (der.length === 64) return der;
  let offset = 2;
  if (der[1] & 0x80) offset += (der[1] & 0x7f);
  offset++;
  const rLen = der[offset++];
  const rStart = offset;
  offset += rLen;
  offset++;
  const sLen = der[offset++];
  const sStart = offset;
  const result = new Uint8Array(64);
  const rBytes = der.slice(rStart, rStart + rLen);
  const sBytes = der.slice(sStart, sStart + sLen);
  result.set(rBytes.length > 32 ? rBytes.slice(rBytes.length - 32) : rBytes, 32 - Math.min(rBytes.length, 32));
  result.set(sBytes.length > 32 ? sBytes.slice(sBytes.length - 32) : sBytes, 64 - Math.min(sBytes.length, 32));
  return result;
}

// --- DPoP (RFC 9449) ---

export async function generateDPoPKeyPair() {
  const pair = await generateES256KeyPair();
  const publicJWK = await exportPublicKeyJWK(pair.publicKey);
  return { privateKey: pair.privateKey, publicJWK };
}

export async function serializeDPoPKeyPair(dpop) {
  return {
    privateKeyJWK: await exportPrivateKeyJWK(dpop.privateKey),
    publicKeyJWK: dpop.publicJWK,
  };
}

export async function deserializeDPoPKeyPair(data) {
  const privateKey = await importPrivateKeyJWK(data.privateKeyJWK);
  return { privateKey, publicJWK: data.publicKeyJWK };
}

export async function createDPoPProof(dpop, method, url, nonce, accessToken) {
  const header = { typ: 'dpop+jwt', alg: 'ES256', jwk: dpop.publicJWK };
  const payload = {
    jti: crypto.randomUUID(),
    htm: method,
    htu: url,
    iat: Math.floor(Date.now() / 1000),
  };
  if (nonce) payload.nonce = nonce;
  if (accessToken) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken));
    payload.ath = base64url(hash);
  }
  return signJWT(header, payload, dpop.privateKey);
}

// --- Client assertion (RFC 7523, private_key_jwt) ---

export async function createClientAssertion(clientPrivateKey, clientPublicJWK, clientId, audience) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    typ: 'jwt',
    alg: 'ES256',
    kid: clientPublicJWK.kid || await computeJWKThumbprint(clientPublicJWK),
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

async function computeJWKThumbprint(jwk) {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return base64url(hash);
}

// --- PKCE (RFC 7636, S256) ---

export function generateCodeVerifier() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes.buffer);
}
export async function computeCodeChallenge(verifier) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(hash);
}
export function generateState() { return crypto.randomUUID(); }

// Decode a JWT payload (unverified) for inspection. Used to read `exp`
// claims on opaque-to-us access tokens.
export function jwtExp(jwt) {
  try {
    const parts = String(jwt).split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch { return null; }
}
