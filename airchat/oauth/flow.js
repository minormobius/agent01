// airchat oauth/flow.js — start, callback, refresh.
// Port of poll's flow.ts adapted for airchat's session schema.

import { discoverAuthServer } from './discovery.js';
import {
  generateDPoPKeyPair, serializeDPoPKeyPair, deserializeDPoPKeyPair,
  createDPoPProof, createClientAssertion,
  generateCodeVerifier, computeCodeChallenge, generateState,
  jwtExp,
} from './jwt.js';
import { getClientSigningKey, getClientPublicJWK } from './keypair.js';

const BSKY_PUBLIC_API = 'https://api.bsky.app';
const PLC_DIR = 'https://plc.directory';
const STATE_TTL_SEC = 300;
// Minimum-privilege OAuth scope. ATProto's granular scopes let us ask for
// exactly what airchat does and nothing more:
//   atproto                          — required base identity scope
//   repo:com.minomobi.airchat.voice — write our voice records (create/update/delete)
//   blob:audio/*                     — upload audio blobs to the user's repo
// The token CANNOT post to app.bsky.feed.post, follow accounts, send chat
// messages, upload images, or write any other record collection. Compare to
// the older `transition:generic` scope which grants everything a bsky
// client does.
const SCOPE = 'atproto repo:com.minomobi.airchat.voice blob:audio/*';
export const OAUTH_CLIENT_ID = 'https://airchat.mino.mobi/client-metadata.json';
export const OAUTH_REDIRECT_URI = 'https://airchat.mino.mobi/api/airchat/auth/oauth/callback';

async function resolveHandle(handle) {
  const res = await fetch(`${BSKY_PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.did || null;
}

async function resolvePds(did) {
  try {
    if (did.startsWith('did:plc:')) {
      const res = await fetch(`${PLC_DIR}/${did}`);
      if (res.ok) {
        const doc = await res.json();
        const pds = (doc.service || []).find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
        if (pds?.serviceEndpoint) return pds.serviceEndpoint;
      }
    } else if (did.startsWith('did:web:')) {
      const domain = did.replace('did:web:', '').replace(/:/g, '/');
      const res = await fetch(`https://${domain}/.well-known/did.json`);
      if (res.ok) {
        const doc = await res.json();
        const pds = (doc.service || []).find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
        if (pds?.serviceEndpoint) return pds.serviceEndpoint;
      }
    }
  } catch {}
  return null;
}

// --- Start ---

export async function startOAuth(env, handleOrDid, returnTo) {
  const did = handleOrDid.startsWith('did:') ? handleOrDid : await resolveHandle(handleOrDid);
  if (!did) throw new Error('could not resolve handle');
  const pdsUrl = await resolvePds(did);
  if (!pdsUrl) throw new Error('could not resolve PDS');

  const { authServerUrl, metadata } = await discoverAuthServer(pdsUrl);

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await computeCodeChallenge(codeVerifier);
  const state = generateState();

  const dpop = await generateDPoPKeyPair();
  const dpopSerialized = await serializeDPoPKeyPair(dpop);

  const clientPrivateKey = await getClientSigningKey(env.DB);
  const clientPublicJWK = await getClientPublicJWK(env.DB);

  // aud for client_assertion = authorization server's issuer.
  let clientAssertion = await createClientAssertion(
    clientPrivateKey, clientPublicJWK, OAUTH_CLIENT_ID, metadata.issuer,
  );

  let dpopProof = await createDPoPProof(dpop, 'POST', metadata.pushed_authorization_request_endpoint);

  const parBody = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: OAUTH_REDIRECT_URI,
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    scope: SCOPE,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
    login_hint: handleOrDid,
  });

  let parRes = await fetch(metadata.pushed_authorization_request_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', DPoP: dpopProof },
    body: parBody.toString(),
  });
  if (parRes.status === 400) {
    const nonce = parRes.headers.get('DPoP-Nonce');
    if (nonce) {
      dpopProof = await createDPoPProof(dpop, 'POST', metadata.pushed_authorization_request_endpoint, nonce);
      clientAssertion = await createClientAssertion(
        clientPrivateKey, clientPublicJWK, OAUTH_CLIENT_ID, metadata.issuer,
      );
      parBody.set('client_assertion', clientAssertion);
      parRes = await fetch(metadata.pushed_authorization_request_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', DPoP: dpopProof },
        body: parBody.toString(),
      });
    }
  }
  if (!parRes.ok) {
    const err = await parRes.text().catch(() => '');
    throw new Error(`PAR failed (${parRes.status}): ${err.slice(0, 300)}`);
  }
  const parData = await parRes.json();
  const dpopNonce = parRes.headers.get('DPoP-Nonce');

  await env.DB.prepare(
    `INSERT INTO airchat_oauth_states
       (state, code_verifier, dpop_key_jwk, did, pds_url, auth_server_url, token_endpoint, dpop_nonce, return_to, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch() + ?)`
  ).bind(
    state, codeVerifier, JSON.stringify(dpopSerialized),
    did, pdsUrl, authServerUrl, metadata.token_endpoint,
    dpopNonce || null, returnTo || null, STATE_TTL_SEC,
  ).run();

  const authUrl = `${metadata.authorization_endpoint}?` + new URLSearchParams({
    request_uri: parData.request_uri,
    client_id: OAUTH_CLIENT_ID,
  }).toString();

  return { authUrl, state };
}

// --- Callback ---

export async function handleOAuthCallback(env, code, state) {
  const row = await env.DB.prepare(
    `SELECT * FROM airchat_oauth_states WHERE state = ? AND expires_at > unixepoch()`
  ).bind(state).first();
  if (!row) {
    // Maybe expired vs missing — surface a clearer error.
    const expired = await env.DB.prepare(`SELECT state FROM airchat_oauth_states WHERE state = ?`).bind(state).first();
    if (expired) throw new Error('oauth state expired');
    throw new Error('oauth state not found (already consumed or never created)');
  }
  await env.DB.prepare(`DELETE FROM airchat_oauth_states WHERE state = ?`).bind(state).run();

  const codeVerifier = row.code_verifier;
  const dpopSerialized = JSON.parse(row.dpop_key_jwk);
  const tokenEndpoint = row.token_endpoint;
  const expectedDid = row.did;
  const pdsUrl = row.pds_url;
  const dpopNonce = row.dpop_nonce || null;
  const issuerUrl = row.auth_server_url;
  const returnTo = row.return_to || null;

  const dpop = await deserializeDPoPKeyPair(dpopSerialized);

  const clientPrivateKey = await getClientSigningKey(env.DB);
  const clientPublicJWK = await getClientPublicJWK(env.DB);

  let clientAssertion = await createClientAssertion(
    clientPrivateKey, clientPublicJWK, OAUTH_CLIENT_ID, issuerUrl,
  );
  let dpopProof = await createDPoPProof(dpop, 'POST', tokenEndpoint, dpopNonce || undefined);

  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: OAUTH_REDIRECT_URI,
    code_verifier: codeVerifier,
    client_id: OAUTH_CLIENT_ID,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
  });

  let tokenRes = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', DPoP: dpopProof },
    body: tokenBody.toString(),
  });
  if (tokenRes.status === 400) {
    const newNonce = tokenRes.headers.get('DPoP-Nonce');
    if (newNonce) {
      dpopProof = await createDPoPProof(dpop, 'POST', tokenEndpoint, newNonce);
      clientAssertion = await createClientAssertion(
        clientPrivateKey, clientPublicJWK, OAUTH_CLIENT_ID, issuerUrl,
      );
      tokenBody.set('client_assertion', clientAssertion);
      tokenRes = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', DPoP: dpopProof },
        body: tokenBody.toString(),
      });
    }
  }
  if (!tokenRes.ok) {
    const err = await tokenRes.text().catch(() => '');
    throw new Error(`token exchange failed (${tokenRes.status}): ${err.slice(0, 300)}`);
  }
  const tokens = await tokenRes.json();
  if (tokens.sub !== expectedDid) throw new Error(`DID mismatch: expected ${expectedDid}, got ${tokens.sub}`);
  if (!String(tokens.scope || '').includes('atproto')) throw new Error('atproto scope not granted');

  const finalNonce = tokenRes.headers.get('DPoP-Nonce');
  const dpopKeyForStorage = JSON.stringify({ ...dpopSerialized, nonce: finalNonce || null });

  // Resolve handle from DID for display.
  let handle = tokens.sub;
  try {
    const r = await fetch(`${BSKY_PUBLIC_API}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(tokens.sub)}`);
    if (r.ok) {
      const d = await r.json();
      if (d.handle) handle = d.handle;
    }
  } catch {}

  return {
    did: tokens.sub,
    handle,
    pdsUrl,
    accessJwt: tokens.access_token,
    refreshJwt: tokens.refresh_token,
    accessExpiresAt: jwtExp(tokens.access_token) || (Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600)),
    dpopKeyJwk: dpopKeyForStorage,
    scope: tokens.scope || 'atproto',
    returnTo,
  };
}

// --- Refresh (OAuth path) ---

export async function refreshOAuthSession(env, sess) {
  const pdsUrl = sess.pds_url;
  const refreshToken = sess.refresh_jwt;
  const dpopKeyData = sess.dpop_key_jwk;
  if (!refreshToken || !dpopKeyData) return null;

  const parsed = JSON.parse(dpopKeyData);
  const dpop = await deserializeDPoPKeyPair(parsed);
  const dpopNonce = parsed.nonce || undefined;

  const { metadata } = await discoverAuthServer(pdsUrl);

  const clientPrivateKey = await getClientSigningKey(env.DB);
  const clientPublicJWK = await getClientPublicJWK(env.DB);

  let clientAssertion = await createClientAssertion(
    clientPrivateKey, clientPublicJWK, OAUTH_CLIENT_ID, metadata.issuer,
  );
  let dpopProof = await createDPoPProof(dpop, 'POST', metadata.token_endpoint, dpopNonce);

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: OAUTH_CLIENT_ID,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
  });

  let res = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', DPoP: dpopProof },
    body: body.toString(),
  });
  if (res.status === 400) {
    const newNonce = res.headers.get('DPoP-Nonce');
    if (newNonce) {
      dpopProof = await createDPoPProof(dpop, 'POST', metadata.token_endpoint, newNonce);
      clientAssertion = await createClientAssertion(
        clientPrivateKey, clientPublicJWK, OAUTH_CLIENT_ID, metadata.issuer,
      );
      body.set('client_assertion', clientAssertion);
      res = await fetch(metadata.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', DPoP: dpopProof },
        body: body.toString(),
      });
    }
  }
  if (!res.ok) return null;
  const tokens = await res.json();
  const newNonce = res.headers.get('DPoP-Nonce');
  const updatedDpopKey = JSON.stringify({ ...parsed, nonce: newNonce || parsed.nonce || null });

  return {
    accessJwt: tokens.access_token,
    refreshJwt: tokens.refresh_token || refreshToken,
    accessExpiresAt: jwtExp(tokens.access_token) || (Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600)),
    dpopKeyJwk: updatedDpopKey,
  };
}

// --- DPoP-bound PDS request helper ---
//
// Mirrors the pattern poll's polls.ts uses on every uploadBlob /
// createRecord call: first attempt with whatever nonce we have stored;
// if PDS returns 401/400 with a fresh DPoP-Nonce, retry with that.
// Returns the final Response (whether OK or final-failure).
export async function dpopFetch(sess, method, url, headers, body) {
  const parsed = JSON.parse(sess.dpop_key_jwk);
  const dpop = await deserializeDPoPKeyPair(parsed);
  let nonce = parsed.nonce || undefined;

  let proof = await createDPoPProof(dpop, method, url, nonce, sess.access_jwt);
  let res = await fetch(url, {
    method,
    headers: { ...headers, 'Authorization': `DPoP ${sess.access_jwt}`, 'DPoP': proof },
    body,
  });
  if (res.status === 401 || res.status === 400) {
    const newNonce = res.headers.get('DPoP-Nonce');
    if (newNonce) {
      proof = await createDPoPProof(dpop, method, url, newNonce, sess.access_jwt);
      res = await fetch(url, {
        method,
        headers: { ...headers, 'Authorization': `DPoP ${sess.access_jwt}`, 'DPoP': proof },
        body,
      });
    }
  }
  return res;
}
