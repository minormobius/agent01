/**
 * Bounty Board Worker
 *
 * Anonymous bounty marketplace with blind-signed trophies.
 * Blind signatures (RFC 9474) make trophies verifiable but unlinkable
 * to the specific job that earned them.
 *
 * Routes:
 *   GET  /api/bounties              — list bounties
 *   POST /api/bounties              — create bounty
 *   GET  /api/bounties/:id          — get bounty
 *   POST /api/bounties/:id/fulfill  — submit fulfillment
 *   POST /api/bounties/:id/accept/:fid — accept fulfillment (bounty creator)
 *   POST /api/trophy/blind-sign     — blind-sign a trophy token
 *   GET  /api/trophy/public-keys    — get trophy signing public keys
 *   POST /api/trophy/verify         — verify a trophy
 *   POST /api/trophy/present        — present a trophy (registers nullifier)
 *   *    /                           — static assets
 */

import { RSABSSA } from '@cloudflare/blindrsa-ts';

// ─── Crypto helpers ──────────────────────────────────────

const encoder = new TextEncoder();
let _suite = null;

function getBlindRSASuite() {
  if (!_suite) _suite = RSABSSA.SHA384.PSS.Randomized({ supportsRSARAW: true });
  return _suite;
}

async function sha256(data) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomId() {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str, maxDecodedBytes = 10000) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  if (binary.length > maxDecodedBytes) throw new Error('Payload too large');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importRSAPrivateKey(jwk) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSA-PSS', hash: 'SHA-384' }, true, ['sign']);
}

async function importRSAPublicKey(jwk) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSA-PSS', hash: 'SHA-384' }, true, ['verify']);
}

// ─── Key management ──────────────────────────────────────

let _cachedKeys = null;

async function getTrophyKeys(env) {
  if (_cachedKeys) return _cachedKeys;

  // Try Worker secret first
  if (env.TROPHY_KEYS_JSON) {
    _cachedKeys = JSON.parse(env.TROPHY_KEYS_JSON);
    return _cachedKeys;
  }

  // Fall back to D1
  const rows = await env.DB.prepare('SELECT tier, private_key_jwk, public_key_jwk FROM trophy_keys').all();
  if (rows.results.length === 0) throw new Error('No trophy keys configured');
  _cachedKeys = {};
  for (const row of rows.results) {
    _cachedKeys[row.tier] = {
      privateJWK: JSON.parse(row.private_key_jwk),
      publicJWK: JSON.parse(row.public_key_jwk),
    };
  }
  return _cachedKeys;
}

// ─── CORS ────────────────────────────────────────────────

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

// ─── Route handlers ──────────────────────────────────────

async function listBounties(env, url) {
  const status = url.searchParams.get('status') || 'open';
  const kind = url.searchParams.get('kind');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  let query = 'SELECT * FROM bounties WHERE status = ?';
  const params = [status];

  if (kind) {
    query += ' AND kind = ?';
    params.push(kind);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = await env.DB.prepare(query).bind(...params).all();
  return json({ bounties: rows.results, count: rows.results.length });
}

async function getBounty(env, id) {
  const bounty = await env.DB.prepare('SELECT * FROM bounties WHERE id = ?').bind(id).first();
  if (!bounty) return err('Bounty not found', 404);

  const fulfillments = await env.DB.prepare(
    'SELECT * FROM fulfillments WHERE bounty_id = ? ORDER BY created_at DESC'
  ).bind(id).all();

  return json({ bounty, fulfillments: fulfillments.results });
}

async function createBounty(env, body) {
  const { title, kind, description, tags, reward, trophyTier } = body;
  if (!title || !kind || !description) return err('title, kind, description required');

  const id = randomId();
  await env.DB.prepare(
    `INSERT INTO bounties (id, title, kind, description, tags, reward_amount, reward_currency, reward_method, trophy_tier, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`
  ).bind(
    id, title, kind, description,
    tags ? JSON.stringify(tags) : null,
    reward?.amount || null,
    reward?.currency || 'REPUTATION',
    reward?.paymentMethod || 'reputation',
    trophyTier || 'bronze'
  ).run();

  return json({ id, status: 'open' }, 201);
}

async function submitFulfillment(env, bountyId, body) {
  const bounty = await env.DB.prepare('SELECT * FROM bounties WHERE id = ?').bind(bountyId).first();
  if (!bounty) return err('Bounty not found', 404);
  if (bounty.status !== 'open') return err('Bounty is not open');

  const { evidence, notes, geoTag, capturedAt } = body;
  if (!evidence || evidence.length === 0) return err('Evidence required');

  const id = randomId();
  await env.DB.prepare(
    `INSERT INTO fulfillments (id, bounty_id, evidence_json, notes, geo_lat, geo_lon, captured_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).bind(
    id, bountyId,
    JSON.stringify(evidence),
    notes || null,
    geoTag?.latitude || null,
    geoTag?.longitude || null,
    capturedAt || null
  ).run();

  return json({ id, status: 'pending' }, 201);
}

async function acceptFulfillment(env, bountyId, fulfillmentId) {
  const fulfillment = await env.DB.prepare(
    'SELECT * FROM fulfillments WHERE id = ? AND bounty_id = ?'
  ).bind(fulfillmentId, bountyId).first();
  if (!fulfillment) return err('Fulfillment not found', 404);
  if (fulfillment.status !== 'pending') return err('Fulfillment already processed');

  // Mark fulfillment as accepted
  await env.DB.prepare(
    "UPDATE fulfillments SET status = 'accepted', accepted_at = datetime('now') WHERE id = ?"
  ).bind(fulfillmentId).run();

  // Mark bounty as fulfilled
  await env.DB.prepare(
    "UPDATE bounties SET status = 'fulfilled', closed_at = datetime('now') WHERE id = ?"
  ).bind(bountyId).run();

  return json({ fulfillmentId, status: 'accepted', message: 'Fulfillment accepted. Fulfiller can now claim their trophy via blind signing.' });
}

// ─── Trophy blind signing ────────────────────────────────

async function blindSignTrophy(env, body) {
  const { fulfillmentId, blindedMessage } = body;
  if (!fulfillmentId || !blindedMessage) return err('fulfillmentId and blindedMessage required');

  // Verify fulfillment is accepted
  const fulfillment = await env.DB.prepare(
    "SELECT f.*, b.trophy_tier FROM fulfillments f JOIN bounties b ON f.bounty_id = b.id WHERE f.id = ? AND f.status = 'accepted'"
  ).bind(fulfillmentId).first();
  if (!fulfillment) return err('No accepted fulfillment found with this ID', 404);

  // Check if trophy already issued for this fulfillment
  const existing = await env.DB.prepare(
    'SELECT * FROM trophy_issuances WHERE fulfillment_id = ?'
  ).bind(fulfillmentId).first();
  if (existing) return err('Trophy already issued for this fulfillment', 409);

  const tier = fulfillment.trophy_tier || 'bronze';
  const keys = await getTrophyKeys(env);
  if (!keys[tier]) return err(`No key configured for tier: ${tier}`, 500);

  // Blind-sign the message
  const suite = getBlindRSASuite();
  const privateKey = await importRSAPrivateKey(keys[tier].privateJWK);
  const blindedMsg = fromBase64Url(blindedMessage);
  const blindSig = await suite.blindSign(privateKey, blindedMsg);

  // Record the issuance (hash of blinded message for audit, not the token itself)
  const blindedMsgHash = await sha256(blindedMessage);
  await env.DB.prepare(
    'INSERT INTO trophy_issuances (fulfillment_id, tier, blinded_msg_hash) VALUES (?, ?, ?)'
  ).bind(fulfillmentId, tier, blindedMsgHash).run();

  return json({
    blindedSignature: toBase64Url(blindSig),
    tier,
    issuerPublicKey: keys[tier].publicJWK,
  });
}

async function getPublicKeys(env) {
  const keys = await getTrophyKeys(env);
  const publicKeys = {};
  for (const [tier, keyPair] of Object.entries(keys)) {
    publicKeys[tier] = keyPair.publicJWK;
  }
  return json({ keys: publicKeys, algorithm: 'RSABSSA-SHA384-PSS-Randomized' });
}

async function verifyTrophy(env, body) {
  const { tokenMessage, signature, tier } = body;
  if (!tokenMessage || !signature || !tier) return err('tokenMessage, signature, tier required');

  const keys = await getTrophyKeys(env);
  if (!keys[tier]) return err(`Unknown tier: ${tier}`, 400);

  const suite = getBlindRSASuite();
  const publicKey = await importRSAPublicKey(keys[tier].publicJWK);
  const msgBytes = encoder.encode(tokenMessage);
  const sigBytes = fromBase64Url(signature);

  try {
    const valid = await suite.verify(publicKey, sigBytes, msgBytes);
    return json({ valid, tier });
  } catch {
    return json({ valid: false, tier });
  }
}

async function presentTrophy(env, body) {
  const { tokenMessage, signature, nullifier, tier } = body;
  if (!tokenMessage || !signature || !nullifier || !tier) {
    return err('tokenMessage, signature, nullifier, tier required');
  }

  // Verify signature
  const keys = await getTrophyKeys(env);
  if (!keys[tier]) return err(`Unknown tier: ${tier}`, 400);

  const suite = getBlindRSASuite();
  const publicKey = await importRSAPublicKey(keys[tier].publicJWK);
  const msgBytes = encoder.encode(tokenMessage);
  const sigBytes = fromBase64Url(signature);

  try {
    const valid = await suite.verify(publicKey, sigBytes, msgBytes);
    if (!valid) return err('Invalid trophy signature', 403);
  } catch {
    return err('Invalid trophy signature', 403);
  }

  // Verify nullifier derivation
  const expectedNullifier = await sha256(`nullifier\x00${tokenMessage}`);
  if (nullifier !== expectedNullifier) return err('Invalid nullifier', 403);

  // Check if already presented
  const existing = await env.DB.prepare(
    'SELECT * FROM trophy_nullifiers WHERE nullifier = ?'
  ).bind(nullifier).first();
  if (existing) return json({ accepted: false, reason: 'Trophy already presented (nullifier spent)' });

  // Register nullifier
  await env.DB.prepare(
    'INSERT INTO trophy_nullifiers (nullifier) VALUES (?)'
  ).bind(nullifier).run();

  return json({ accepted: true, tier, message: 'Trophy verified and registered.' });
}

// ─── Router ──────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      // API routes
      if (path === '/api/bounties' && method === 'GET') {
        return listBounties(env, url);
      }
      if (path === '/api/bounties' && method === 'POST') {
        return createBounty(env, await request.json());
      }

      const bountyMatch = path.match(/^\/api\/bounties\/([^/]+)$/);
      if (bountyMatch && method === 'GET') {
        return getBounty(env, bountyMatch[1]);
      }

      const fulfillMatch = path.match(/^\/api\/bounties\/([^/]+)\/fulfill$/);
      if (fulfillMatch && method === 'POST') {
        return submitFulfillment(env, fulfillMatch[1], await request.json());
      }

      const acceptMatch = path.match(/^\/api\/bounties\/([^/]+)\/accept\/([^/]+)$/);
      if (acceptMatch && method === 'POST') {
        return acceptFulfillment(env, acceptMatch[1], acceptMatch[2]);
      }

      if (path === '/api/trophy/blind-sign' && method === 'POST') {
        return blindSignTrophy(env, await request.json());
      }
      if (path === '/api/trophy/public-keys' && method === 'GET') {
        return getPublicKeys(env);
      }
      if (path === '/api/trophy/verify' && method === 'POST') {
        return verifyTrophy(env, await request.json());
      }
      if (path === '/api/trophy/present' && method === 'POST') {
        return presentTrophy(env, await request.json());
      }

      // Static assets fallthrough
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error('Worker error:', e);
      return err(e.message || 'Internal error', 500);
    }
  },
};
