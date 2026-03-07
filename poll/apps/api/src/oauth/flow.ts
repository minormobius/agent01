/**
 * ATProto OAuth flow — PAR, token exchange, refresh.
 *
 * Implements the complete server-side (BFF) OAuth flow:
 * 1. start() — resolve identity, discover auth server, PAR, return auth URL
 * 2. callback() — exchange code for tokens, verify DID, create session
 * 3. refresh() — refresh OAuth tokens with DPoP
 */

import type { Env } from '../index.js';
import type { AuthServerMetadata } from './discovery.js';
import { discoverAuthServer } from './discovery.js';
import {
  generateDPoPKeyPair,
  serializeDPoPKeyPair,
  deserializeDPoPKeyPair,
  createDPoPProof,
  createClientAssertion,
  generateCodeVerifier,
  computeCodeChallenge,
  generateState,
  type DPoPKeyPair,
} from './jwt.js';
import { getClientSigningKey, getClientPublicJWK as getClientPublicJWKFromD1 } from './keypair.js';

const BSKY_PUBLIC_API = 'https://public.api.bsky.app';
const STATE_TTL_SECONDS = 300; // 5 minutes

interface OAuthStartResult {
  authUrl: string;
  state: string;
}

interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  did: string;
  handle?: string;
  expiresIn: number;
  scope: string;
}

// --- Identity resolution (reuse from auth.ts patterns) ---

async function resolveHandle(handle: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${BSKY_PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
    );
    if (!res.ok) return null;
    const data = await res.json() as { did?: string };
    return data.did || null;
  } catch {
    return null;
  }
}

async function resolvePds(did: string): Promise<string | null> {
  try {
    if (did.startsWith('did:plc:')) {
      const res = await fetch(`https://plc.directory/${did}`);
      if (res.ok) {
        const doc = await res.json() as any;
        const pds = doc.service?.find((s: any) => s.id === '#atproto_pds');
        if (pds?.serviceEndpoint) return pds.serviceEndpoint;
      }
    }
    if (did.startsWith('did:web:')) {
      const domain = did.replace('did:web:', '');
      const res = await fetch(`https://${domain}/.well-known/did.json`);
      if (res.ok) {
        const doc = await res.json() as any;
        const pds = doc.service?.find((s: any) => s.id === '#atproto_pds');
        if (pds?.serviceEndpoint) return pds.serviceEndpoint;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// --- Get client identity from env ---

function getClientId(env: Env): string {
  return env.OAUTH_CLIENT_ID || '';
}

function getRedirectUri(env: Env): string {
  const frontendUrl = env.FRONTEND_URL || '';
  return `${frontendUrl}/api/auth/oauth/callback`;
}

async function getClientPrivateKey(env: Env): Promise<CryptoKey> {
  return getClientSigningKey(env.DB);
}

async function getClientPublicJWK(env: Env): Promise<JsonWebKey> {
  return getClientPublicJWKFromD1(env.DB);
}

// --- Start flow ---

export async function startOAuth(
  env: Env,
  handle: string,
  returnTo?: string,
  scope?: string,
): Promise<OAuthStartResult> {
  // 1. Resolve identity (accept handle or DID)
  let did: string | null;
  if (handle.startsWith('did:')) {
    did = handle;
  } else {
    did = await resolveHandle(handle);
  }
  if (!did) throw new Error('Could not resolve handle');

  const pdsUrl = await resolvePds(did);
  if (!pdsUrl) throw new Error('Could not resolve PDS for this account');

  // 2. Discover auth server
  const { authServerUrl, metadata } = await discoverAuthServer(pdsUrl);

  // 3. Generate PKCE
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await computeCodeChallenge(codeVerifier);

  // 4. Generate state
  const state = generateState();

  // 5. Generate DPoP keypair (ephemeral, per-flow)
  const dpop = await generateDPoPKeyPair();
  const dpopSerialized = await serializeDPoPKeyPair(dpop);

  // 6. Build PAR request
  const clientId = getClientId(env);
  const redirectUri = getRedirectUri(env);
  const clientPrivateKey = await getClientPrivateKey(env);
  const clientPublicJWK = await getClientPublicJWK(env);

  // aud for client_assertion must be the authorization server's issuer (not the endpoint URL)
  const clientAssertion = await createClientAssertion(
    clientPrivateKey, clientPublicJWK, clientId, metadata.issuer
  );

  // DPoP proof for PAR endpoint
  const dpopProof = await createDPoPProof(dpop, 'POST', metadata.pushed_authorization_request_endpoint);

  const parBody = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    scope: scope || 'atproto',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
    login_hint: handle,
  });

  // 7. POST PAR
  let parRes = await fetch(metadata.pushed_authorization_request_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      DPoP: dpopProof,
    },
    body: parBody.toString(),
  });

  // Handle DPoP nonce requirement (server returns 400 with DPoP-Nonce header)
  if (parRes.status === 400) {
    const nonce = parRes.headers.get('DPoP-Nonce');
    if (nonce) {
      const retryProof = await createDPoPProof(dpop, 'POST', metadata.pushed_authorization_request_endpoint, nonce);
      // Need fresh client assertion too (jti must be unique)
      const retryAssertion = await createClientAssertion(
        clientPrivateKey, clientPublicJWK, clientId, metadata.issuer
      );
      parBody.set('client_assertion', retryAssertion);
      parRes = await fetch(metadata.pushed_authorization_request_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          DPoP: retryProof,
        },
        body: parBody.toString(),
      });
    }
  }

  if (!parRes.ok) {
    const errBody = await parRes.text();
    throw new Error(`PAR request failed (${parRes.status}): ${errBody}`);
  }

  const parData = await parRes.json() as { request_uri: string; expires_in?: number };
  const dpopNonce = parRes.headers.get('DPoP-Nonce') || undefined;

  // 8. Store state in D1
  const expiresAt = new Date(Date.now() + STATE_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO oauth_states (state, code_verifier, dpop_key_jwk, did, pds_url, auth_server_url, token_endpoint, dpop_nonce, return_to, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`
  ).bind(
    state,
    codeVerifier,
    JSON.stringify(dpopSerialized),
    did,
    pdsUrl,
    authServerUrl,
    metadata.token_endpoint,
    dpopNonce || null,
    returnTo || null,
    expiresAt,
  ).run();

  // 9. Build authorization URL
  const authUrl = `${metadata.authorization_endpoint}?` + new URLSearchParams({
    request_uri: parData.request_uri,
    client_id: clientId,
  }).toString();

  return { authUrl, state };
}

// --- Callback flow ---

export async function handleOAuthCallback(
  env: Env,
  code: string,
  state: string,
  iss: string | null,
  request: Request,
): Promise<{
  did: string;
  handle: string;
  pdsUrl: string;
  oauthRefreshToken: string;
  dpopKeySerialized: string;
  returnTo: string | null;
}> {
  // 1. Look up state
  console.log('[oauth:callback] Looking up state...');
  const row = await env.DB.prepare(
    `SELECT * FROM oauth_states WHERE state = ? AND expires_at > datetime('now')`
  ).bind(state).first();

  if (!row) {
    // Check if it exists but expired
    const expired = await env.DB.prepare(
      `SELECT state, expires_at FROM oauth_states WHERE state = ?`
    ).bind(state).first();
    if (expired) {
      throw new Error(`OAuth state expired at ${expired.expires_at}`);
    }
    throw new Error('OAuth state not found (already consumed or never created)');
  }

  // Delete state (single-use)
  await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
  console.log('[oauth:callback] State found and consumed');

  const codeVerifier = row.code_verifier as string;
  const dpopKeySerialized = JSON.parse(row.dpop_key_jwk as string);
  const tokenEndpoint = row.token_endpoint as string;
  const expectedDid = row.did as string;
  const pdsUrl = row.pds_url as string;
  const dpopNonce = row.dpop_nonce as string | null;
  const returnTo = row.return_to as string | null;
  // Per OAuth spec, issuer === auth_server_url (stored during PAR)
  const issuerUrl = row.auth_server_url as string;

  console.log('[oauth:callback] tokenEndpoint:', tokenEndpoint);
  console.log('[oauth:callback] issuerUrl (aud):', issuerUrl);
  console.log('[oauth:callback] expectedDid:', expectedDid);

  // 2. Restore DPoP keypair
  const dpop = await deserializeDPoPKeyPair(dpopKeySerialized);
  console.log('[oauth:callback] DPoP keypair restored');

  // 3. Build token request
  const clientId = getClientId(env);
  const redirectUri = getRedirectUri(env);
  console.log('[oauth:callback] clientId:', clientId);
  console.log('[oauth:callback] redirectUri:', redirectUri);

  const clientPrivateKey = await getClientPrivateKey(env);
  const clientPublicJWK = await getClientPublicJWK(env);
  console.log('[oauth:callback] Signing key loaded, kid:', (clientPublicJWK as any).kid);

  const clientAssertion = await createClientAssertion(
    clientPrivateKey, clientPublicJWK, clientId, issuerUrl
  );

  const dpopProof = await createDPoPProof(dpop, 'POST', tokenEndpoint, dpopNonce || undefined);
  console.log('[oauth:callback] Assertion + DPoP proof built, sending token request to:', tokenEndpoint);

  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    client_id: clientId,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
  });

  // 4. Exchange code for tokens
  let tokenRes = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      DPoP: dpopProof,
    },
    body: tokenBody.toString(),
  });
  console.log('[oauth:callback] Token response:', tokenRes.status);

  // Handle DPoP nonce rotation
  if (tokenRes.status === 400) {
    const errPreview = await tokenRes.clone().text();
    const newNonce = tokenRes.headers.get('DPoP-Nonce');
    console.log('[oauth:callback] 400 body:', errPreview);
    console.log('[oauth:callback] DPoP-Nonce header:', newNonce || '(none)');

    if (newNonce) {
      console.log('[oauth:callback] Retrying with DPoP nonce...');
      const retryProof = await createDPoPProof(dpop, 'POST', tokenEndpoint, newNonce);
      const retryAssertion = await createClientAssertion(
        clientPrivateKey, clientPublicJWK, clientId, issuerUrl
      );
      tokenBody.set('client_assertion', retryAssertion);
      tokenRes = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          DPoP: retryProof,
        },
        body: tokenBody.toString(),
      });
      console.log('[oauth:callback] Retry response:', tokenRes.status);
    }
  }

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    console.error('[oauth:callback] TOKEN EXCHANGE FAILED:', tokenRes.status, errBody);
    throw new Error(`Token exchange failed (${tokenRes.status}): ${errBody}`);
  }

  console.log('[oauth:callback] Token exchange succeeded');
  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    sub: string;
    scope: string;
  };

  // 5. Verify sub matches expected DID
  if (tokens.sub !== expectedDid) {
    console.error('[oauth:callback] DID mismatch:', tokens.sub, '!==', expectedDid);
    throw new Error(`DID mismatch: expected ${expectedDid}, got ${tokens.sub}`);
  }

  // 6. Verify atproto scope was granted
  if (!tokens.scope?.includes('atproto')) {
    console.error('[oauth:callback] Missing atproto scope. Got:', tokens.scope);
    throw new Error('Authorization server did not grant atproto scope');
  }
  console.log('[oauth:callback] Verified: sub matches, atproto scope present');

  // Get the final DPoP nonce for future requests
  const finalNonce = tokenRes.headers.get('DPoP-Nonce');
  const dpopKeyForStorage = JSON.stringify({
    ...dpopKeySerialized,
    nonce: finalNonce || null,
  });

  // Resolve handle from DID for display
  let handle = tokens.sub; // fallback to DID
  try {
    const res = await fetch(`${BSKY_PUBLIC_API}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(tokens.sub)}`);
    if (res.ok) {
      const data = await res.json() as { handle?: string };
      if (data.handle) handle = data.handle;
    }
  } catch {
    // keep DID as handle
  }

  return {
    did: tokens.sub,
    handle,
    pdsUrl,
    oauthRefreshToken: tokens.refresh_token,
    dpopKeySerialized: dpopKeyForStorage,
    returnTo,
    scope: tokens.scope || 'atproto',
  };
}

// --- Refresh OAuth token ---

export async function refreshOAuthToken(
  env: Env,
  sessionId: string,
): Promise<{ accessToken: string; did: string; pdsUrl: string; dpopKeyPair: DPoPKeyPair } | null> {
  const row = await env.DB.prepare(
    `SELECT did, pds_url, refresh_token, dpop_key_jwk, auth_method
     FROM sessions WHERE session_id = ? AND expires_at > datetime('now') AND did != 'pending'`
  ).bind(sessionId).first();

  if (!row) return null;

  const authMethod = row.auth_method as string | null;

  // App-password sessions: use existing PDS refresh logic
  if (authMethod !== 'oauth') return null;

  const pdsUrl = row.pds_url as string;
  const oauthRefreshToken = row.refresh_token as string;
  const dpopKeyData = row.dpop_key_jwk as string;

  if (!oauthRefreshToken || !dpopKeyData) return null;

  const parsed = JSON.parse(dpopKeyData);
  const dpop = await deserializeDPoPKeyPair(parsed);
  const dpopNonce = parsed.nonce || undefined;

  // We need the token endpoint — discover it again from PDS
  const { metadata } = await discoverAuthServer(pdsUrl);

  const clientId = getClientId(env);
  const clientPrivateKey = await getClientPrivateKey(env);
  const clientPublicJWK = await getClientPublicJWK(env);

  const clientAssertion = await createClientAssertion(
    clientPrivateKey, clientPublicJWK, clientId, metadata.issuer
  );

  const dpopProof = await createDPoPProof(dpop, 'POST', metadata.token_endpoint, dpopNonce);

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: oauthRefreshToken,
    client_id: clientId,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
  });

  let res = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      DPoP: dpopProof,
    },
    body: body.toString(),
  });

  // Handle DPoP nonce rotation
  if (res.status === 400) {
    const newNonce = res.headers.get('DPoP-Nonce');
    if (newNonce) {
      const retryProof = await createDPoPProof(dpop, 'POST', metadata.token_endpoint, newNonce);
      const retryAssertion = await createClientAssertion(
        clientPrivateKey, clientPublicJWK, clientId, metadata.issuer
      );
      body.set('client_assertion', retryAssertion);
      res = await fetch(metadata.token_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          DPoP: retryProof,
        },
        body: body.toString(),
      });
    }
  }

  if (!res.ok) return null;

  const tokens = await res.json() as {
    access_token: string;
    refresh_token?: string;
    token_type: string;
    expires_in: number;
    sub: string;
  };

  // Store rotated refresh token + updated nonce
  const newNonce = res.headers.get('DPoP-Nonce');
  const updatedDpopKey = JSON.stringify({
    ...parsed,
    nonce: newNonce || parsed.nonce || null,
  });

  await env.DB.prepare(
    `UPDATE sessions SET refresh_token = ?, dpop_key_jwk = ? WHERE session_id = ?`
  ).bind(
    tokens.refresh_token || oauthRefreshToken,
    updatedDpopKey,
    sessionId,
  ).run();

  return {
    accessToken: tokens.access_token,
    did: tokens.sub,
    pdsUrl,
    dpopKeyPair: dpop,
  };
}
