/**
 * Mega Bounty Board — Cloudflare Worker
 *
 * Handles ATProto OAuth (PKCE + DPoP + PAR + confidential client)
 * and serves static assets. Routes:
 *
 *   GET  /client-metadata.json     — OAuth client metadata
 *   POST /api/auth/oauth/start     — Begin OAuth flow
 *   GET  /api/auth/oauth/callback  — OAuth callback
 *   GET  /api/me                   — Current user
 *   POST /api/auth/logout          — Destroy session
 *
 * All crypto uses Web Crypto API (ES256 / P-256).
 */

// ─── Base64url ───────────────────────────────────────────

function base64url(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// ─── ES256 Key Management ────────────────────────────────

async function generateES256KeyPair() {
  return crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
}

async function exportKeyJWK(key) {
  return crypto.subtle.exportKey('jwk', key);
}

async function importPrivateKeyJWK(jwk) {
  return crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );
}

// ─── JWT Signing (ES256) ─────────────────────────────────

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

async function signJWT(header, payload, privateKey) {
  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  const sigBytes = new Uint8Array(sig);
  const rs = derToRS(sigBytes);
  return `${signingInput}.${base64url(rs.buffer)}`;
}

async function computeJWKThumbprint(jwk) {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return base64url(hash);
}

// ─── PKCE ────────────────────────────────────────────────

function generateCodeVerifier() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes.buffer);
}

async function computeCodeChallenge(verifier) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(hash);
}

// ─── DPoP Proofs (RFC 9449) ──────────────────────────────

async function generateDPoPKeyPair() {
  const pair = await generateES256KeyPair();
  const publicJWK = await exportKeyJWK(pair.publicKey);
  const privateKeyJWK = await exportKeyJWK(pair.privateKey);
  return { privateKey: pair.privateKey, publicJWK, privateKeyJWK };
}

async function createDPoPProof(dpopPrivateKey, dpopPublicJWK, method, url, nonce, accessToken) {
  const header = { typ: 'dpop+jwt', alg: 'ES256', jwk: dpopPublicJWK };
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
  return signJWT(header, payload, dpopPrivateKey);
}

// ─── Client Assertion (private_key_jwt) ──────────────────

async function createClientAssertion(clientPrivateKey, clientPublicJWK, clientId, audience) {
  const now = Math.floor(Date.now() / 1000);
  const kid = clientPublicJWK.kid || await computeJWKThumbprint(clientPublicJWK);
  const header = { typ: 'jwt', alg: 'ES256', kid };
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

// ─── ATProto Discovery ───────────────────────────────────

async function resolveHandle(handle) {
  const res = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
  if (!res.ok) throw new Error(`Could not resolve handle: ${handle}`);
  const { did } = await res.json();
  return did;
}

async function resolvePDS(did) {
  let doc;
  if (did.startsWith('did:plc:')) {
    const res = await fetch(`https://plc.directory/${did}`);
    if (!res.ok) throw new Error(`Could not resolve DID: ${did}`);
    doc = await res.json();
  } else if (did.startsWith('did:web:')) {
    const host = did.slice('did:web:'.length).replaceAll(':', '/');
    const res = await fetch(`https://${host}/.well-known/did.json`);
    if (!res.ok) throw new Error(`Could not resolve DID: ${did}`);
    doc = await res.json();
  } else {
    throw new Error(`Unsupported DID method: ${did}`);
  }
  const svc = doc.service?.find(s => s.type === 'AtprotoPersonalDataServer');
  if (!svc) throw new Error('No PDS endpoint found');
  return svc.serviceEndpoint;
}

async function discoverAuthServer(pdsUrl) {
  const prRes = await fetch(`${pdsUrl}/.well-known/oauth-protected-resource`);
  if (!prRes.ok) throw new Error('Could not discover auth server from PDS');
  const pr = await prRes.json();
  const authServerUrl = pr.authorization_servers?.[0];
  if (!authServerUrl) throw new Error('No authorization server in protected resource metadata');

  const asRes = await fetch(`${authServerUrl}/.well-known/oauth-authorization-server`);
  if (!asRes.ok) throw new Error('Could not fetch auth server metadata');
  const metadata = await asRes.json();
  return { authServerUrl, metadata };
}

// ─── Client Keypair Management (D1) ─────────────────────

async function getOrCreateClientKeypair(db) {
  const row = await db.prepare('SELECT * FROM oauth_client_keypair WHERE id = 1').first();
  if (row) {
    const privateKey = await importPrivateKeyJWK(JSON.parse(row.private_key_jwk));
    const publicJWK = JSON.parse(row.public_key_jwk);
    publicJWK.kid = row.kid;
    return { privateKey, publicJWK };
  }

  const pair = await generateES256KeyPair();
  const privateKeyJWK = await exportKeyJWK(pair.privateKey);
  const publicJWK = await exportKeyJWK(pair.publicKey);
  const kid = await computeJWKThumbprint(publicJWK);
  publicJWK.kid = kid;

  await db.prepare(
    'INSERT INTO oauth_client_keypair (id, private_key_jwk, public_key_jwk, kid) VALUES (1, ?, ?, ?)'
  ).bind(JSON.stringify(privateKeyJWK), JSON.stringify(publicJWK), kid).run();

  const privateKey = await importPrivateKeyJWK(privateKeyJWK);
  return { privateKey, publicJWK };
}

// ─── Session Management ──────────────────────────────────

function getSessionId(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/mega_session=([^;]+)/);
  return match ? match[1] : null;
}

function sessionCookie(sessionId, request, maxAge = 86400) {
  const secure = new URL(request.url).protocol === 'https:';
  return `mega_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

// ─── CORS helpers ────────────────────────────────────────

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

// ─── Route Handlers ──────────────────────────────────────

async function handleClientMetadata(request, env) {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const clientId = `${baseUrl}/client-metadata.json`;

  const { publicJWK } = await getOrCreateClientKeypair(env.DB);

  return json({
    client_id: clientId,
    client_name: 'Megaproject Bounty Board',
    client_uri: baseUrl,
    redirect_uris: [`${baseUrl}/api/auth/oauth/callback`],
    scope: 'atproto transition:generic',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'private_key_jwt',
    token_endpoint_auth_signing_alg: 'ES256',
    dpop_bound_access_tokens: true,
    application_type: 'web',
    jwks: { keys: [{ ...publicJWK, use: 'sig', alg: 'ES256' }] },
  });
}

async function handleOAuthStart(request, env) {
  const body = await request.json();
  const handle = body.handle?.trim();
  if (!handle) return json({ error: 'Handle required' }, 400);

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const clientId = `${baseUrl}/client-metadata.json`;
  const redirectUri = `${baseUrl}/api/auth/oauth/callback`;

  // Resolve identity
  const did = await resolveHandle(handle);
  const pdsUrl = await resolvePDS(did);
  const { authServerUrl, metadata } = await discoverAuthServer(pdsUrl);

  // Generate PKCE + DPoP + state
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await computeCodeChallenge(codeVerifier);
  const dpop = await generateDPoPKeyPair();
  const state = crypto.randomUUID();

  // Get client keypair for assertion
  const { privateKey: clientPrivateKey, publicJWK: clientPublicJWK } = await getOrCreateClientKeypair(env.DB);

  // PAR (Pushed Authorization Request)
  const parEndpoint = metadata.pushed_authorization_request_endpoint;
  if (!parEndpoint) throw new Error('PAR endpoint not found');

  const clientAssertion = await createClientAssertion(
    clientPrivateKey, clientPublicJWK, clientId,
    metadata.issuer || authServerUrl
  );

  const dpopProof = await createDPoPProof(
    dpop.privateKey, dpop.publicJWK, 'POST', parEndpoint
  );

  const parBody = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'atproto transition:generic',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    login_hint: handle,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
  });

  let parRes = await fetch(parEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'DPoP': dpopProof },
    body: parBody.toString(),
  });

  // Handle DPoP nonce requirement
  let dpopNonce = null;
  if (parRes.status === 400) {
    const newNonce = parRes.headers.get('DPoP-Nonce');
    if (newNonce) {
      dpopNonce = newNonce;
      const dpopProof2 = await createDPoPProof(
        dpop.privateKey, dpop.publicJWK, 'POST', parEndpoint, newNonce
      );
      const clientAssertion2 = await createClientAssertion(
        clientPrivateKey, clientPublicJWK, clientId,
        metadata.issuer || authServerUrl
      );
      parBody.set('client_assertion', clientAssertion2);
      parRes = await fetch(parEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'DPoP': dpopProof2 },
        body: parBody.toString(),
      });
    }
  }

  if (!parRes.ok) {
    const err = await parRes.json().catch(() => ({}));
    throw new Error(`PAR failed: ${err.error_description || err.error || parRes.status}`);
  }

  const parData = await parRes.json();

  // Store state in D1
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO oauth_states (state, code_verifier, dpop_key_jwk, did, pds_url, auth_server_url, token_endpoint, dpop_nonce, return_to, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    state, codeVerifier,
    JSON.stringify({ privateKeyJWK: dpop.privateKeyJWK, publicKeyJWK: dpop.publicJWK, nonce: dpopNonce }),
    did, pdsUrl, authServerUrl,
    metadata.token_endpoint,
    dpopNonce,
    body.returnTo || '/bounty/',
    expiresAt
  ).run();

  // Build authorization URL
  const authUrl = `${metadata.authorization_endpoint}?client_id=${encodeURIComponent(clientId)}&request_uri=${encodeURIComponent(parData.request_uri)}`;

  return json({ authUrl });
}

async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const clientId = `${baseUrl}/client-metadata.json`;
  const redirectUri = `${baseUrl}/api/auth/oauth/callback`;

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    const desc = url.searchParams.get('error_description') || error;
    return Response.redirect(`${baseUrl}/bounty/?error=${encodeURIComponent(desc)}`, 302);
  }

  if (!code || !state) {
    return Response.redirect(`${baseUrl}/bounty/?error=Missing+code+or+state`, 302);
  }

  // Lookup state
  const row = await env.DB.prepare(
    `SELECT * FROM oauth_states WHERE state = ? AND expires_at > datetime('now')`
  ).bind(state).first();

  await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();

  if (!row) {
    return Response.redirect(`${baseUrl}/bounty/?error=Invalid+or+expired+state`, 302);
  }

  // Restore DPoP keypair
  const dpopData = JSON.parse(row.dpop_key_jwk);
  const dpopPrivateKey = await importPrivateKeyJWK(dpopData.privateKeyJWK);
  const dpopPublicJWK = dpopData.publicKeyJWK;
  let dpopNonce = dpopData.nonce || undefined;

  // Get client keypair
  const { privateKey: clientPrivateKey, publicJWK: clientPublicJWK } = await getOrCreateClientKeypair(env.DB);

  // Token exchange
  const tokenEndpoint = row.token_endpoint;

  const clientAssertion = await createClientAssertion(
    clientPrivateKey, clientPublicJWK, clientId,
    row.auth_server_url
  );

  const dpopProof = await createDPoPProof(
    dpopPrivateKey, dpopPublicJWK, 'POST', tokenEndpoint, dpopNonce
  );

  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: row.code_verifier,
    client_id: clientId,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
  });

  let tokenRes = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'DPoP': dpopProof },
    body: tokenBody.toString(),
  });

  // Handle DPoP nonce on token exchange
  if (tokenRes.status === 400 || tokenRes.status === 401) {
    const newNonce = tokenRes.headers.get('DPoP-Nonce');
    if (newNonce) {
      dpopNonce = newNonce;
      const dpopProof2 = await createDPoPProof(
        dpopPrivateKey, dpopPublicJWK, 'POST', tokenEndpoint, newNonce
      );
      const clientAssertion2 = await createClientAssertion(
        clientPrivateKey, clientPublicJWK, clientId,
        row.auth_server_url
      );
      tokenBody.set('client_assertion', clientAssertion2);
      tokenRes = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'DPoP': dpopProof2 },
        body: tokenBody.toString(),
      });
    }
  }

  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}));
    return Response.redirect(`${baseUrl}/bounty/?error=${encodeURIComponent(err.error_description || 'Token exchange failed')}`, 302);
  }

  const tokens = await tokenRes.json();
  const finalNonce = tokenRes.headers.get('DPoP-Nonce') || dpopNonce;

  // Verify DID matches
  if (tokens.sub !== row.did) {
    return Response.redirect(`${baseUrl}/bounty/?error=DID+mismatch`, 302);
  }

  // Create session
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Resolve handle for display
  let handle = row.did;
  try {
    const profileRes = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(row.did)}`);
    if (profileRes.ok) {
      const profile = await profileRes.json();
      handle = profile.handle || row.did;
    }
  } catch {}

  await env.DB.prepare(
    `INSERT INTO sessions (session_id, did, handle, pds_url, refresh_token, dpop_key_jwk, auth_method, oauth_scope, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'oauth', ?, ?)`
  ).bind(
    sessionId, row.did, handle, row.pds_url,
    tokens.refresh_token || null,
    JSON.stringify({ privateKeyJWK: dpopData.privateKeyJWK, publicKeyJWK: dpopPublicJWK, nonce: finalNonce }),
    tokens.scope || null,
    expiresAt
  ).run();

  const returnTo = row.return_to || '/bounty/';
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${baseUrl}${returnTo}`,
      'Set-Cookie': sessionCookie(sessionId, request),
    },
  });
}

async function handleMe(request, env) {
  const sessionId = getSessionId(request);
  if (!sessionId) return json({ error: 'Not authenticated' }, 401);

  const row = await env.DB.prepare(
    `SELECT did, handle FROM sessions WHERE session_id = ? AND expires_at > datetime('now')`
  ).bind(sessionId).first();

  if (!row) return json({ error: 'Session expired' }, 401);
  return json({ did: row.did, handle: row.handle });
}

async function handleLogout(request, env) {
  const sessionId = getSessionId(request);
  if (sessionId) {
    await env.DB.prepare('DELETE FROM sessions WHERE session_id = ?').bind(sessionId).run();
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie('', request, 0),
    },
  });
}

// ─── Main Router ─────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    try {
      // API routes
      if (path === '/client-metadata.json') {
        return handleClientMetadata(request, env);
      }
      if (path === '/api/auth/oauth/start' && request.method === 'POST') {
        const res = await handleOAuthStart(request, env);
        return new Response(res.body, {
          status: res.status,
          headers: { ...Object.fromEntries(res.headers), ...corsHeaders(request) },
        });
      }
      if (path === '/api/auth/oauth/callback') {
        return handleOAuthCallback(request, env);
      }
      if (path === '/api/me') {
        const res = await handleMe(request, env);
        return new Response(res.body, {
          status: res.status,
          headers: { ...Object.fromEntries(res.headers), ...corsHeaders(request) },
        });
      }
      if (path === '/api/auth/logout' && request.method === 'POST') {
        const res = await handleLogout(request, env);
        return new Response(res.body, {
          status: res.status,
          headers: { ...Object.fromEntries(res.headers), ...corsHeaders(request) },
        });
      }

      // Fall through to static assets
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error('Worker error:', err);
      return json({ error: err.message || 'Internal error' }, 500);
    }
  },
};
