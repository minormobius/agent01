/**
 * Bounty Board Worker — Chaumian Ecash Reputation
 *
 * Anonymous bounty marketplace where reputation is denomination-based
 * blind-signed tokens (1, 5, 10, 25 rep). Like coins — fungible,
 * stakeable, anonymous. You earn rep by fulfilling bounties. You stake
 * rep to claim bounties (skin in the game). Nobody knows your balance
 * or which jobs earned which coins.
 *
 * Crypto: RFC 9474 RSA blind signatures via @cloudflare/blindrsa-ts
 * Same scheme as poll/ but applied to ecash denominations.
 *
 * Routes:
 *   GET  /api/bounties              — list bounties
 *   POST /api/bounties              — create bounty
 *   GET  /api/bounties/:id          — get bounty + fulfillments
 *   POST /api/bounties/:id/fulfill  — submit fulfillment evidence
 *   POST /api/bounties/:id/accept/:fid — accept fulfillment → enables minting
 *   POST /api/bounties/:id/stake    — stake rep to claim a bounty
 *   POST /api/rep/mint              — blind-sign a rep token (after accepted fulfillment)
 *   GET  /api/rep/keys              — get mint public keys per denomination
 *   POST /api/rep/verify            — verify a rep token signature
 *   POST /api/rep/spend             — spend a rep token (registers nullifier)
 *   *    /                          — static assets
 */

import { RSABSSA } from '@cloudflare/blindrsa-ts';

// ─── Constants ───────────────────────────────────────────

const DENOMINATIONS = [1, 5, 10, 25];

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

async function getMintKeys(env) {
  if (_cachedKeys) return _cachedKeys;

  if (env.MINT_KEYS_JSON) {
    _cachedKeys = JSON.parse(env.MINT_KEYS_JSON);
    return _cachedKeys;
  }

  const rows = await env.DB.prepare('SELECT denomination, private_key_jwk, public_key_jwk FROM mint_keys').all();
  if (rows.results.length === 0) throw new Error('No mint keys configured');
  _cachedKeys = {};
  for (const row of rows.results) {
    _cachedKeys[row.denomination] = {
      privateJWK: JSON.parse(row.private_key_jwk),
      publicJWK: JSON.parse(row.public_key_jwk),
    };
  }
  return _cachedKeys;
}

// ─── HTTP helpers ────────────────────────────────────────

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

// ─── Bounty CRUD ─────────────────────────────────────────

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
  return json({ bounties: rows.results });
}

async function getBounty(env, id) {
  const bounty = await env.DB.prepare('SELECT * FROM bounties WHERE id = ?').bind(id).first();
  if (!bounty) return err('Bounty not found', 404);

  const fulfillments = await env.DB.prepare(
    'SELECT * FROM fulfillments WHERE bounty_id = ? ORDER BY created_at DESC'
  ).bind(id).all();

  const stakes = await env.DB.prepare(
    "SELECT id, total_rep, status, created_at FROM stakes WHERE bounty_id = ? AND status = 'active'"
  ).bind(id).all();

  return json({ bounty, fulfillments: fulfillments.results, stakes: stakes.results });
}

async function createBounty(env, body) {
  const { title, kind, description, tags, rewardRep, stakeReq } = body;
  if (!title || !kind || !description) return err('title, kind, description required');

  const reward = Math.max(1, parseInt(rewardRep) || 10);
  const stake = Math.max(0, parseInt(stakeReq) || 0);
  const id = randomId();

  await env.DB.prepare(
    `INSERT INTO bounties (id, title, kind, description, tags, reward_rep, stake_req, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`
  ).bind(id, title, kind, description, tags ? JSON.stringify(tags) : null, reward, stake).run();

  return json({ id, status: 'open', rewardRep: reward, stakeReq: stake }, 201);
}

async function submitFulfillment(env, bountyId, body) {
  const bounty = await env.DB.prepare('SELECT * FROM bounties WHERE id = ?').bind(bountyId).first();
  if (!bounty) return err('Bounty not found', 404);
  if (bounty.status !== 'open' && bounty.status !== 'claimed') return err('Bounty is not accepting fulfillments');

  const { evidence, notes } = body;
  if (!evidence || evidence.length === 0) return err('Evidence required');

  const id = randomId();
  await env.DB.prepare(
    `INSERT INTO fulfillments (id, bounty_id, evidence_json, notes, status)
     VALUES (?, ?, ?, ?, 'pending')`
  ).bind(id, bountyId, JSON.stringify(evidence), notes || null).run();

  return json({ id, status: 'pending' }, 201);
}

async function acceptFulfillment(env, bountyId, fulfillmentId) {
  const fulfillment = await env.DB.prepare(
    'SELECT * FROM fulfillments WHERE id = ? AND bounty_id = ?'
  ).bind(fulfillmentId, bountyId).first();
  if (!fulfillment) return err('Fulfillment not found', 404);
  if (fulfillment.status !== 'pending') return err('Fulfillment already processed');

  const bounty = await env.DB.prepare('SELECT * FROM bounties WHERE id = ?').bind(bountyId).first();
  if (!bounty) return err('Bounty not found', 404);

  // Accept fulfillment
  await env.DB.prepare(
    "UPDATE fulfillments SET status = 'accepted', accepted_at = datetime('now') WHERE id = ?"
  ).bind(fulfillmentId).run();

  // Mark bounty fulfilled
  await env.DB.prepare(
    "UPDATE bounties SET status = 'fulfilled', closed_at = datetime('now') WHERE id = ?"
  ).bind(bountyId).run();

  // Return any active stakes (the claimer gets their stake back)
  await env.DB.prepare(
    "UPDATE stakes SET status = 'returned', resolved_at = datetime('now') WHERE bounty_id = ? AND status = 'active'"
  ).bind(bountyId).run();

  return json({
    fulfillmentId,
    status: 'accepted',
    rewardRep: bounty.reward_rep,
    message: `Fulfillment accepted. ${bounty.reward_rep} rep available to mint.`,
  });
}

// ─── Staking ─────────────────────────────────────────────

async function stakeToClaim(env, bountyId, body) {
  const bounty = await env.DB.prepare('SELECT * FROM bounties WHERE id = ?').bind(bountyId).first();
  if (!bounty) return err('Bounty not found', 404);
  if (bounty.status !== 'open') return err('Bounty is not open for claims');
  if (bounty.stake_req <= 0) return err('This bounty requires no stake');

  const { tokens } = body;
  if (!tokens || !Array.isArray(tokens)) return err('tokens array required');

  // Verify each token and check total denomination >= stake requirement
  const keys = await getMintKeys(env);
  const suite = getBlindRSASuite();
  let totalStaked = 0;
  const nullifiers = [];

  for (const token of tokens) {
    const { tokenMessage, signature, nullifier, denomination } = token;
    if (!tokenMessage || !signature || !nullifier || !denomination) {
      return err('Each token needs tokenMessage, signature, nullifier, denomination');
    }

    if (!DENOMINATIONS.includes(denomination)) return err(`Invalid denomination: ${denomination}`);
    if (!keys[denomination]) return err(`No key for denomination ${denomination}`);

    // Verify signature
    const publicKey = await importRSAPublicKey(keys[denomination].publicJWK);
    const msgBytes = encoder.encode(tokenMessage);
    const sigBytes = fromBase64Url(signature);

    try {
      const valid = await suite.verify(publicKey, sigBytes, msgBytes);
      if (!valid) return err('Invalid rep token signature');
    } catch {
      return err('Invalid rep token signature');
    }

    // Verify nullifier derivation
    const expectedNullifier = await sha256(`nullifier\x00${tokenMessage}`);
    if (nullifier !== expectedNullifier) return err('Invalid nullifier');

    // Check not already spent
    const existing = await env.DB.prepare(
      'SELECT nullifier FROM spent_nullifiers WHERE nullifier = ?'
    ).bind(nullifier).first();
    if (existing) return err('Rep token already spent');

    totalStaked += denomination;
    nullifiers.push(nullifier);
  }

  if (totalStaked < bounty.stake_req) {
    return err(`Insufficient stake: need ${bounty.stake_req} rep, provided ${totalStaked}`);
  }

  // Spend the nullifiers (lock the tokens)
  const stakeId = randomId();
  for (const nullifier of nullifiers) {
    await env.DB.prepare(
      'INSERT INTO spent_nullifiers (nullifier, denomination, context) VALUES (?, ?, ?)'
    ).bind(nullifier, tokens.find(t => t.nullifier === nullifier).denomination, `stake:${stakeId}`).run();
  }

  // Record the stake
  await env.DB.prepare(
    `INSERT INTO stakes (id, bounty_id, nullifiers_json, total_rep, status)
     VALUES (?, ?, ?, ?, 'active')`
  ).bind(stakeId, bountyId, JSON.stringify(nullifiers), totalStaked).run();

  // Mark bounty as claimed
  await env.DB.prepare("UPDATE bounties SET status = 'claimed' WHERE id = ?").bind(bountyId).run();

  return json({
    stakeId,
    totalStaked,
    message: `Staked ${totalStaked} rep on bounty. Deliver to earn ${bounty.reward_rep} rep + get your stake back.`,
  });
}

// ─── Rep minting (blind signatures) ─────────────────────

async function mintRep(env, body) {
  const { fulfillmentId, denomination, blindedMessage } = body;
  if (!fulfillmentId || !denomination || !blindedMessage) {
    return err('fulfillmentId, denomination, blindedMessage required');
  }

  if (!DENOMINATIONS.includes(denomination)) return err(`Invalid denomination: ${denomination}`);

  // Verify fulfillment is accepted
  const fulfillment = await env.DB.prepare(
    "SELECT f.*, b.reward_rep FROM fulfillments f JOIN bounties b ON f.bounty_id = b.id WHERE f.id = ? AND f.status = 'accepted'"
  ).bind(fulfillmentId).first();
  if (!fulfillment) return err('No accepted fulfillment found', 404);

  // Check how much rep has already been minted for this fulfillment
  const minted = await env.DB.prepare(
    'SELECT SUM(denomination) as total FROM mint_issuances WHERE fulfillment_id = ?'
  ).bind(fulfillmentId).first();
  const alreadyMinted = minted?.total || 0;

  if (alreadyMinted + denomination > fulfillment.reward_rep) {
    return err(`Cannot mint: ${alreadyMinted} of ${fulfillment.reward_rep} rep already minted. Requesting ${denomination} more would exceed reward.`);
  }

  // Blind-sign the rep token
  const keys = await getMintKeys(env);
  if (!keys[denomination]) return err(`No key for denomination ${denomination}`, 500);

  const suite = getBlindRSASuite();
  const privateKey = await importRSAPrivateKey(keys[denomination].privateJWK);
  const blindedMsg = fromBase64Url(blindedMessage);
  const blindSig = await suite.blindSign(privateKey, blindedMsg);

  // Record the issuance
  const issuanceId = randomId();
  const blindedMsgHash = await sha256(blindedMessage);
  await env.DB.prepare(
    'INSERT INTO mint_issuances (id, fulfillment_id, denomination, blinded_msg_hash) VALUES (?, ?, ?, ?)'
  ).bind(issuanceId, fulfillmentId, denomination, blindedMsgHash).run();

  return json({
    blindedSignature: toBase64Url(blindSig),
    denomination,
    mintedSoFar: alreadyMinted + denomination,
    rewardTotal: fulfillment.reward_rep,
  });
}

async function getPublicKeys(env) {
  const keys = await getMintKeys(env);
  const publicKeys = {};
  for (const [denom, keyPair] of Object.entries(keys)) {
    publicKeys[denom] = keyPair.publicJWK;
  }
  return json({ keys: publicKeys, denominations: DENOMINATIONS, algorithm: 'RSABSSA-SHA384-PSS-Randomized' });
}

async function verifyRep(env, body) {
  const { tokenMessage, signature, denomination } = body;
  if (!tokenMessage || !signature || !denomination) return err('tokenMessage, signature, denomination required');
  if (!DENOMINATIONS.includes(denomination)) return err(`Invalid denomination: ${denomination}`);

  const keys = await getMintKeys(env);
  if (!keys[denomination]) return err(`No key for denomination ${denomination}`);

  const suite = getBlindRSASuite();
  const publicKey = await importRSAPublicKey(keys[denomination].publicJWK);
  const msgBytes = encoder.encode(tokenMessage);
  const sigBytes = fromBase64Url(signature);

  try {
    const valid = await suite.verify(publicKey, sigBytes, msgBytes);
    // Check if already spent
    const nullifier = await sha256(`nullifier\x00${tokenMessage}`);
    const spent = await env.DB.prepare('SELECT nullifier FROM spent_nullifiers WHERE nullifier = ?').bind(nullifier).first();
    return json({ valid, denomination, spent: !!spent });
  } catch {
    return json({ valid: false, denomination, spent: false });
  }
}

async function spendRep(env, body) {
  const { tokenMessage, signature, nullifier, denomination, context } = body;
  if (!tokenMessage || !signature || !nullifier || !denomination) {
    return err('tokenMessage, signature, nullifier, denomination required');
  }
  if (!DENOMINATIONS.includes(denomination)) return err(`Invalid denomination: ${denomination}`);

  const keys = await getMintKeys(env);
  if (!keys[denomination]) return err(`No key for denomination ${denomination}`);

  // Verify signature
  const suite = getBlindRSASuite();
  const publicKey = await importRSAPublicKey(keys[denomination].publicJWK);
  const msgBytes = encoder.encode(tokenMessage);
  const sigBytes = fromBase64Url(signature);

  try {
    const valid = await suite.verify(publicKey, sigBytes, msgBytes);
    if (!valid) return err('Invalid signature', 403);
  } catch {
    return err('Invalid signature', 403);
  }

  // Verify nullifier
  const expectedNullifier = await sha256(`nullifier\x00${tokenMessage}`);
  if (nullifier !== expectedNullifier) return err('Invalid nullifier', 403);

  // Check not already spent
  const existing = await env.DB.prepare('SELECT nullifier FROM spent_nullifiers WHERE nullifier = ?').bind(nullifier).first();
  if (existing) return json({ accepted: false, reason: 'Already spent' });

  // Spend it
  await env.DB.prepare(
    'INSERT INTO spent_nullifiers (nullifier, denomination, context) VALUES (?, ?, ?)'
  ).bind(nullifier, denomination, context || null).run();

  return json({ accepted: true, denomination });
}

// ─── Router ──────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      // Bounty routes
      if (path === '/api/bounties' && method === 'GET') return listBounties(env, url);
      if (path === '/api/bounties' && method === 'POST') return createBounty(env, await request.json());

      const bountyMatch = path.match(/^\/api\/bounties\/([^/]+)$/);
      if (bountyMatch && method === 'GET') return getBounty(env, bountyMatch[1]);

      const fulfillMatch = path.match(/^\/api\/bounties\/([^/]+)\/fulfill$/);
      if (fulfillMatch && method === 'POST') return submitFulfillment(env, fulfillMatch[1], await request.json());

      const acceptMatch = path.match(/^\/api\/bounties\/([^/]+)\/accept\/([^/]+)$/);
      if (acceptMatch && method === 'POST') return acceptFulfillment(env, acceptMatch[1], acceptMatch[2]);

      const stakeMatch = path.match(/^\/api\/bounties\/([^/]+)\/stake$/);
      if (stakeMatch && method === 'POST') return stakeToClaim(env, stakeMatch[1], await request.json());

      // Rep routes
      if (path === '/api/rep/mint' && method === 'POST') return mintRep(env, await request.json());
      if (path === '/api/rep/keys' && method === 'GET') return getPublicKeys(env);
      if (path === '/api/rep/verify' && method === 'POST') return verifyRep(env, await request.json());
      if (path === '/api/rep/spend' && method === 'POST') return spendRep(env, await request.json());

      // Static assets
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error('Worker error:', e);
      return err(e.message || 'Internal error', 500);
    }
  },
};
