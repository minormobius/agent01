/**
 * ATProto OAuth flow — PAR, token exchange, refresh.
 * Adapted from poll/apps/api/src/oauth/flow.ts.
 * Generalized for multi-origin (any *.mino.mobi site).
 */

import type { Env } from '../index.js';
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
import { getClientSigningKey, getClientPublicJWK } from './keypair.js';

const BSKY_PUBLIC_API = 'https://public.api.bsky.app';
const STATE_TTL_SECONDS = 300; // 5 minutes

// --- Identity resolution ---

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
        const doc = await res.json() as Record<string, unknown>;
        const services = doc.service as Array<{ id: string; serviceEndpoint: string }> | undefined;
        const pds = services?.find((s) => s.id === '#atproto_pds');
        if (pds?.serviceEndpoint) return pds.serviceEndpoint;
      }
    }
    if (did.startsWith('did:web:')) {
      const domain = did.replace('did:web:', '');
      const res = await fetch(`https://${domain}/.well-known/did.json`);
      if (res.ok) {
        const doc = await res.json() as Record<string, unknown>;
        const services = doc.service as Array<{ id: string; serviceEndpoint: string }> | undefined;
        const pds = services?.find((s) => s.id === '#atproto_pds');
        if (pds?.serviceEndpoint) return pds.serviceEndpoint;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveHandleToDisplay(did: string): Promise<string> {
  try {
    const res = await fetch(
      `${BSKY_PUBLIC_API}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`
    );
    if (res.ok) {
      const data = await res.json() as { handle?: string };
      if (data.handle) return data.handle;
    }
  } catch { /* fall through */ }
  return did;
}

// --- Start OAuth flow ---

export async function startOAuth(
  env: Env,
  handle: string,
  origin: string,
  returnTo?: string,
  scope?: string,
): Promise<{ authUrl: string; state: string }> {
  // 1. Resolve identity
  let did: string | null;
  if (handle.startsWith('did:')) {
    did = handle;
  } else {
    did = await resolveHandle(handle.replace(/^@/, '').trim());
  }
  if (!did) throw new Error('Could not resolve handle');

  const pdsUrl = await resolvePds(did);
  if (!pdsUrl) throw new Error('Could not resolve PDS for this account');

  // 2. Discover auth server
  const { authServerUrl, metadata } = await discoverAuthServer(pdsUrl);

  // 3. Generate PKCE + state + DPoP
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await computeCodeChallenge(codeVerifier);
  const state = generateState();
  const dpop = await generateDPoPKeyPair();
  const dpopSerialized = await serializeDPoPKeyPair(dpop);

  // 4. Build PAR request
  const clientId = env.OAUTH_CLIENT_ID;
  const redirectUri = `https://auth.mino.mobi/oauth/callback`;

  const clientPrivateKey = await getClientSigningKey(env.DB);
  const clientPublicJWK = await getClientPublicJWK(env.DB);

  const clientAssertion = await createClientAssertion(
    clientPrivateKey, clientPublicJWK, clientId, metadata.issuer
  );

  const dpopProof = await createDPoPProof(dpop, 'POST', metadata.pushed_authorization_request_endpoint);

  const parBody = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    scope: scope || 'atproto transition:generic',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
    login_hint: handle,
  });

  // 5. POST PAR (with DPoP nonce retry)
  let parRes = await fetch(metadata.pushed_authorization_request_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      DPoP: dpopProof,
    },
    body: parBody.toString(),
  });

  if (parRes.status === 400) {
    const nonce = parRes.headers.get('DPoP-Nonce');
    if (nonce) {
      const retryProof = await createDPoPProof(dpop, 'POST', metadata.pushed_authorization_request_endpoint, nonce);
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

  const parData = await parRes.json() as { request_uri: string };
  const dpopNonce = parRes.headers.get('DPoP-Nonce') || undefined;

  // 6. Store state in D1
  const expiresAt = new Date(Date.now() + STATE_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO oauth_states (state, code_verifier, dpop_key_jwk, did, pds_url, auth_server_url, token_endpoint, dpop_nonce, origin, return_to, scope, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`
  ).bind(
    state, codeVerifier, JSON.stringify(dpopSerialized),
    did, pdsUrl, authServerUrl, metadata.token_endpoint,
    dpopNonce || null, origin, returnTo || null,
    scope || 'atproto transition:generic', expiresAt,
  ).run();

  // 7. Build authorization URL
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
): Promise<{
  did: string;
  handle: string;
  pdsUrl: string;
  oauthRefreshToken: string;
  dpopKeySerialized: string;
  origin: string;
  returnTo: string | null;
  scope: string;
}> {
  // 1. Look up state
  const row = await env.DB.prepare(
    `SELECT * FROM oauth_states WHERE state = ? AND expires_at > datetime('now')`
  ).bind(state).first();

  if (!row) {
    const expired = await env.DB.prepare(
      `SELECT state, expires_at FROM oauth_states WHERE state = ?`
    ).bind(state).first();
    if (expired) throw new Error(`OAuth state expired at ${expired.expires_at}`);
    throw new Error('OAuth state not found');
  }

  // Single-use: delete immediately
  await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();

  const codeVerifier = row.code_verifier as string;
  const dpopKeySerialized = JSON.parse(row.dpop_key_jwk as string);
  const tokenEndpoint = row.token_endpoint as string;
  const expectedDid = row.did as string;
  const pdsUrl = row.pds_url as string;
  const dpopNonce = row.dpop_nonce as string | null;
  const origin = row.origin as string;
  const returnTo = row.return_to as string | null;
  const requestedScope = row.scope as string || 'atproto';
  const issuerUrl = row.auth_server_url as string;

  // 2. Restore DPoP keypair
  const dpop = await deserializeDPoPKeyPair(dpopKeySerialized);

  // 3. Build token request
  const clientId = env.OAUTH_CLIENT_ID;
  const redirectUri = `https://auth.mino.mobi/oauth/callback`;

  const clientPrivateKey = await getClientSigningKey(env.DB);
  const clientPublicJWK = await getClientPublicJWK(env.DB);

  const clientAssertion = await createClientAssertion(
    clientPrivateKey, clientPublicJWK, clientId, issuerUrl
  );

  const dpopProof = await createDPoPProof(dpop, 'POST', tokenEndpoint, dpopNonce || undefined);

  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    client_id: clientId,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
  });

  // 4. Exchange code for tokens (with DPoP nonce retry)
  let tokenRes = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      DPoP: dpopProof,
    },
    body: tokenBody.toString(),
  });

  if (tokenRes.status === 400) {
    const newNonce = tokenRes.headers.get('DPoP-Nonce');
    if (newNonce) {
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
    }
  }

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    throw new Error(`Token exchange failed (${tokenRes.status}): ${errBody}`);
  }

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
    throw new Error(`DID mismatch: expected ${expectedDid}, got ${tokens.sub}`);
  }

  if (!tokens.scope?.includes('atproto')) {
    throw new Error('Authorization server did not grant atproto scope');
  }

  // Store final DPoP nonce
  const finalNonce = tokenRes.headers.get('DPoP-Nonce');
  const dpopKeyForStorage = JSON.stringify({
    ...dpopKeySerialized,
    nonce: finalNonce || null,
  });

  const handle = await resolveHandleToDisplay(tokens.sub);

  return {
    did: tokens.sub,
    handle,
    pdsUrl,
    oauthRefreshToken: tokens.refresh_token,
    dpopKeySerialized: dpopKeyForStorage,
    origin,
    returnTo,
    scope: tokens.scope || requestedScope,
  };
}

// --- Refresh OAuth token ---

export async function refreshOAuthToken(
  env: Env,
  sessionId: string,
): Promise<{ accessToken: string; did: string; pdsUrl: string; dpopKeyPair: DPoPKeyPair } | null> {
  const row = await env.DB.prepare(
    `SELECT did, pds_url, refresh_token, dpop_key_jwk, auth_method
     FROM sessions WHERE session_id = ? AND expires_at > datetime('now')`
  ).bind(sessionId).first();

  if (!row || row.auth_method !== 'oauth') return null;

  const pdsUrl = row.pds_url as string;
  const oauthRefreshToken = row.refresh_token as string;
  const dpopKeyData = row.dpop_key_jwk as string;

  if (!oauthRefreshToken || !dpopKeyData) return null;

  const parsed = JSON.parse(dpopKeyData);
  const dpop = await deserializeDPoPKeyPair(parsed);
  const dpopNonce = parsed.nonce || undefined;

  const { metadata } = await discoverAuthServer(pdsUrl);

  const clientId = env.OAUTH_CLIENT_ID;
  const clientPrivateKey = await getClientSigningKey(env.DB);
  const clientPublicJWK = await getClientPublicJWK(env.DB);

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

  // DPoP nonce rotation retry
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
