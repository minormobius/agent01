/**
 * Poll management routes.
 *
 * POST /api/polls          — create poll
 * GET  /api/polls/:id      — get poll
 * POST /api/polls/:id/open — open poll for voting
 * POST /api/polls/:id/close — close poll
 * POST /api/polls/:id/finalize — finalize poll (irreversible)
 * DELETE /api/polls/:id   — delete poll (host only)
 * GET  /api/polls/:id/tally — get tally
 * GET  /api/polls/:id/audit — get audit log
 * POST /api/polls/:id/eligibility/request — request ballot credential
 * POST /api/polls/:id/publish — publish poll to ATProto
 * POST /api/polls/:id/tally/publish — publish tally to ATProto
 */

import { CreatePollSchema } from '@atpolls/shared';
import { MockPublisher, PdsPublisher } from '@atpolls/shared';
import type { Env } from '../index.js';
import { jsonResponse, getPollDO } from '../index.js';
import { getSession, getPdsAccessToken } from './auth.js';
import { createDPoPProof } from '../oauth/jwt.js';
// @ts-ignore — WASM import handled by wrangler bundler
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
// @ts-ignore — binary import handled by wrangler bundler
import fontRegular from '../fonts/roboto-mono-400.ttf';
// @ts-ignore — binary import handled by wrangler bundler
import fontBold from '../fonts/roboto-mono-700.ttf';

let resvgInitialized = false;

export async function handlePollRoutes(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  // GET /api/polls — list polls (default: active only; ?status=all for everything)
  if (url.pathname === '/api/polls' && request.method === 'GET') {
    return listPolls(env, url);
  }

  // POST /api/polls
  if (url.pathname === '/api/polls' && request.method === 'POST') {
    return createPoll(request, env);
  }

  // Match /api/polls/:id patterns
  const pollMatch = url.pathname.match(/^\/api\/polls\/([^/]+)$/);
  if (pollMatch && request.method === 'GET') {
    return getPoll(env, pollMatch[1]);
  }
  if (pollMatch && request.method === 'DELETE') {
    return deletePoll(request, env, pollMatch[1]);
  }

  const openMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/open$/);
  if (openMatch && request.method === 'POST') {
    return openPoll(request, env, openMatch[1]);
  }

  const closeMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/close$/);
  if (closeMatch && request.method === 'POST') {
    return closePoll(request, env, closeMatch[1]);
  }

  const finalizeMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/finalize$/);
  if (finalizeMatch && request.method === 'POST') {
    return finalizePoll(request, env, finalizeMatch[1]);
  }

  const tallyMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/tally$/);
  if (tallyMatch && request.method === 'GET') {
    return getTally(env, tallyMatch[1]);
  }

  const auditMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/audit$/);
  if (auditMatch && request.method === 'GET') {
    return getAudit(env, auditMatch[1]);
  }

  const eligMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/eligibility\/request$/);
  if (eligMatch && request.method === 'POST') {
    return requestEligibility(request, env, eligMatch[1]);
  }

  const publishMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/publish$/);
  if (publishMatch && request.method === 'POST') {
    return publishPoll(request, env, publishMatch[1]);
  }

  const tallyPublishMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/tally\/publish$/);
  if (tallyPublishMatch && request.method === 'POST') {
    return publishTally(request, env, tallyPublishMatch[1]);
  }

  const ballotsPublishMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/ballots\/publish$/);
  if (ballotsPublishMatch && request.method === 'POST') {
    return publishBallots(request, env, ballotsPublishMatch[1]);
  }

  const postBskyMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/post-to-bluesky$/);
  if (postBskyMatch && request.method === 'POST') {
    return postToBluesky(request, env, postBskyMatch[1]);
  }

  const syncEligibleMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/eligible\/sync$/);
  if (syncEligibleMatch && request.method === 'POST') {
    return syncEligibleDids(request, env, syncEligibleMatch[1]);
  }

  const getEligibleMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/eligible$/);
  if (getEligibleMatch && request.method === 'GET') {
    return getEligibleDids(env, getEligibleMatch[1]);
  }

  const syncLikesMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/likes\/sync$/);
  if (syncLikesMatch && request.method === 'POST') {
    return syncLikes(request, env, syncLikesMatch[1]);
  }

  // OG image for link card previews (PNG)
  const ogMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/og\.png$/);
  if (ogMatch && request.method === 'GET') {
    return generateOgImage(env, ogMatch[1]);
  }

  return null;
}

async function createPoll(request: Request, env: Env): Promise<Response> {
  let step = 'getSession';
  try {
    const session = await getSession(request, env);
    if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

    step = 'parseBody';
    const body = await request.json();
    const parsed = CreatePollSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse({ error: 'Validation error', details: parsed.error.issues }, 400);
    }

    const data = parsed.data;

    step = 'validateKeys';
    const pollId = crypto.randomUUID();
    const encoder = new TextEncoder();

    let hostPublicKey: string | null = null;
    let hostKeyFingerprint = '';

    if (data.mode === 'public_like') {
      // Public like-based polls don't need RSA keys
      hostKeyFingerprint = 'public_like';
    } else {
      // RSA key pair is required for blind signatures
      if (!env.RSA_PUBLIC_KEY_JWK) {
        return jsonResponse({
          error: 'RSA key pair not configured. Set RSA_PRIVATE_KEY_JWK and RSA_PUBLIC_KEY_JWK secrets.',
        }, 500);
      }

      let hostPublicKeyParsed: any;
      try {
        hostPublicKeyParsed = JSON.parse(env.RSA_PUBLIC_KEY_JWK);
      } catch {
        return jsonResponse({
          error: 'RSA_PUBLIC_KEY_JWK is not valid JSON. Re-set the secret with a complete JWK string.',
        }, 500);
      }
      if (!hostPublicKeyParsed?.kty || !hostPublicKeyParsed?.n || !hostPublicKeyParsed?.e) {
        return jsonResponse({
          error: 'RSA_PUBLIC_KEY_JWK is missing required JWK fields (kty, n, e).',
        }, 500);
      }

      hostPublicKey = env.RSA_PUBLIC_KEY_JWK!;
      const keyHash = await crypto.subtle.digest('SHA-256', encoder.encode(hostPublicKey));
      hostKeyFingerprint = Array.from(new Uint8Array(keyHash))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    }

    step = 'computeKeys';

    const now = new Date().toISOString();
    const eligibilityMode = data.eligibilityMode || 'open';
    const eligibilitySource = data.eligibilitySource || null;

    const poll = {
      id: pollId,
      hostDid: session.did,
      askerDid: null,
      question: data.question,
      options: data.options,
      opensAt: data.opensAt,
      closesAt: data.closesAt,
      status: 'draft' as const,
      mode: data.mode,
      eligibilityMode,
      eligibilitySource,
      hostKeyFingerprint,
      hostPublicKey,
      atprotoRecordUri: null,
      blueskyOptionPosts: null,
      createdAt: now,
    };

    // Insert into D1
    step = 'D1 insert';
    await env.DB.prepare(
      `INSERT INTO polls (id, host_did, asker_did, question, options, opens_at, closes_at,
        status, mode, eligibility_mode, eligibility_source, host_key_fingerprint, host_public_key, bluesky_option_posts, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      poll.id, poll.hostDid, poll.askerDid, poll.question,
      JSON.stringify(poll.options), poll.opensAt, poll.closesAt,
      poll.status, poll.mode, poll.eligibilityMode, poll.eligibilitySource,
      poll.hostKeyFingerprint, poll.hostPublicKey, null, poll.createdAt
    ).run();

    // Populate eligible DIDs based on eligibility mode
    step = 'eligibility';
    let eligibleCount = 0;
    if (eligibilityMode === 'did_list' && data.whitelistedDids?.length) {
      eligibleCount = await insertEligibleDids(env, pollId, data.whitelistedDids);
    } else if (eligibilityMode === 'followers' || eligibilityMode === 'mutuals') {
      const dids = await fetchAtprotoGraph(session.did, eligibilityMode);
      eligibleCount = await insertEligibleDids(env, pollId, dids);
    } else if (eligibilityMode === 'at_list' && eligibilitySource) {
      const dids = await fetchAtprotoList(eligibilitySource);
      eligibleCount = await insertEligibleDids(env, pollId, dids);
    }

    // Initialize the Durable Object
    step = 'DO initialize';
    const doStub = getPollDO(env, pollId);
    const doRes = await doStub.fetch(new Request('https://do/initialize', {
      method: 'POST',
      body: JSON.stringify(poll),
    }));
    if (!doRes.ok) {
      const doErr = await doRes.text();
      console.error('DO init failed:', doErr);
      return jsonResponse({ error: `DO initialization failed`, step, detail: doErr }, 500);
    }

    return jsonResponse({ ...poll, eligibleCount }, 201);
  } catch (err: any) {
    console.error(`createPoll failed at step "${step}":`, err);
    return jsonResponse({ error: 'Poll creation failed' }, 500);
  }
}

async function listPolls(env: Env, url: URL): Promise<Response> {
  const statusParam = url.searchParams.get('status');
  const VALID_STATUSES = ['draft', 'open', 'closed', 'finalized'];

  let query: string;
  let binds: string[] = [];

  if (statusParam === 'all') {
    query = 'SELECT id, question, status, mode, eligibility_mode, opens_at, closes_at, created_at FROM polls ORDER BY created_at DESC LIMIT 50';
  } else {
    // Parse comma-separated statuses, default to active polls
    const requested = statusParam
      ? statusParam.split(',').map(s => s.trim()).filter(s => VALID_STATUSES.includes(s))
      : ['draft', 'open'];
    if (requested.length === 0) requested.push('draft', 'open');
    const placeholders = requested.map(() => '?').join(',');
    query = `SELECT id, question, status, mode, eligibility_mode, opens_at, closes_at, created_at FROM polls WHERE status IN (${placeholders}) ORDER BY created_at DESC LIMIT 50`;
    binds = requested;
  }

  const stmt = env.DB.prepare(query);
  const result = binds.length > 0 ? await stmt.bind(...binds).all() : await stmt.all();

  return jsonResponse({
    polls: (result.results || []).map((r: any) => ({ ...r, options: undefined })),
  });
}

async function getPoll(env: Env, pollId: string): Promise<Response> {
  const result = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(pollId).first();
  if (!result) return jsonResponse({ error: 'Poll not found' }, 404);

  return jsonResponse({
    ...result,
    options: JSON.parse(result.options as string),
    bluesky_option_posts: result.bluesky_option_posts
      ? JSON.parse(result.bluesky_option_posts as string)
      : null,
  });
}

async function deletePoll(request: Request, env: Env, pollId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const poll = await env.DB.prepare('SELECT host_did, status FROM polls WHERE id = ?').bind(pollId).first();
  if (!poll) return jsonResponse({ error: 'Poll not found' }, 404);
  if (poll.host_did !== session.did) return jsonResponse({ error: 'Forbidden' }, 403);

  // Delete all associated data
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ballots WHERE poll_id = ?').bind(pollId),
    env.DB.prepare('DELETE FROM eligibility WHERE poll_id = ?').bind(pollId),
    env.DB.prepare('DELETE FROM audit_events WHERE poll_id = ?').bind(pollId),
    env.DB.prepare('DELETE FROM tally_snapshots WHERE poll_id = ?').bind(pollId),
    env.DB.prepare('DELETE FROM poll_eligible_dids WHERE poll_id = ?').bind(pollId),
    env.DB.prepare('DELETE FROM polls WHERE id = ?').bind(pollId),
  ]);

  return jsonResponse({ deleted: true, pollId });
}

async function openPoll(request: Request, env: Env, pollId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  // Verify host ownership
  const poll = await env.DB.prepare('SELECT host_did FROM polls WHERE id = ?').bind(pollId).first();
  if (!poll) return jsonResponse({ error: 'Poll not found' }, 404);
  if (poll.host_did !== session.did) return jsonResponse({ error: 'Forbidden' }, 403);

  const doStub = getPollDO(env, pollId);
  const res = await doStub.fetch(new Request('https://do/open', { method: 'POST' }));
  return new Response(res.body, { status: res.status, headers: res.headers });
}

async function closePoll(request: Request, env: Env, pollId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const poll = await env.DB.prepare('SELECT host_did FROM polls WHERE id = ?').bind(pollId).first();
  if (!poll) return jsonResponse({ error: 'Poll not found' }, 404);
  if (poll.host_did !== session.did) return jsonResponse({ error: 'Forbidden' }, 403);

  const doStub = getPollDO(env, pollId);
  const res = await doStub.fetch(new Request('https://do/close', { method: 'POST' }));
  return new Response(res.body, { status: res.status, headers: res.headers });
}

async function finalizePoll(request: Request, env: Env, pollId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const poll = await env.DB.prepare('SELECT host_did FROM polls WHERE id = ?').bind(pollId).first();
  if (!poll) return jsonResponse({ error: 'Poll not found' }, 404);
  if (poll.host_did !== session.did) return jsonResponse({ error: 'Forbidden' }, 403);

  const doStub = getPollDO(env, pollId);
  const res = await doStub.fetch(new Request('https://do/finalize', { method: 'POST' }));
  return new Response(res.body, { status: res.status, headers: res.headers });
}

async function getTally(env: Env, pollId: string): Promise<Response> {
  const doStub = getPollDO(env, pollId);
  const res = await doStub.fetch(new Request('https://do/tally'));
  return new Response(res.body, { status: res.status, headers: res.headers });
}

async function getAudit(env: Env, pollId: string): Promise<Response> {
  const doStub = getPollDO(env, pollId);
  const res = await doStub.fetch(new Request('https://do/audit'));
  return new Response(res.body, { status: res.status, headers: res.headers });
}

async function requestEligibility(request: Request, env: Env, pollId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));

  const doStub = getPollDO(env, pollId);
  const res = await doStub.fetch(new Request('https://do/eligibility', {
    method: 'POST',
    body: JSON.stringify({
      responderDid: session.did,
      blindedMessage: (body as any)?.blindedMessage,
    }),
  }));
  return new Response(res.body, { status: res.status, headers: res.headers });
}

async function publishPoll(request: Request, env: Env, pollId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(pollId).first();
  if (!poll) return jsonResponse({ error: 'Poll not found' }, 404);
  if (poll.host_did !== session.did) return jsonResponse({ error: 'Forbidden' }, 403);

  const publisher = getPublisher(env);
  const record = {
    $type: 'com.minomobi.poll.def' as const,
    pollId: poll.id as string,
    question: poll.question as string,
    options: JSON.parse(poll.options as string),
    opensAt: poll.opens_at as string,
    closesAt: poll.closes_at as string,
    mode: poll.mode as 'anon_credential_v2' | 'public_like',
    hostKeyFingerprint: poll.host_key_fingerprint as string,
    hostPublicKey: (poll.host_public_key as string) || null,
    createdAt: poll.created_at as string,
  };

  const result = await publisher.createRecord(
    'com.minomobi.poll.def',
    pollId.replace(/-/g, ''),
    record
  );

  await env.DB.prepare('UPDATE polls SET atproto_record_uri = ? WHERE id = ?')
    .bind(result.uri, pollId).run();

  return jsonResponse({ uri: result.uri, cid: result.cid });
}

async function publishTally(request: Request, env: Env, pollId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(pollId).first();
  if (!poll) return jsonResponse({ error: 'Poll not found' }, 404);
  if (poll.host_did !== session.did) return jsonResponse({ error: 'Forbidden' }, 403);

  // Get tally from DO
  const doStub = getPollDO(env, pollId);
  const tallyRes = await doStub.fetch(new Request('https://do/tally'));
  const tally = await tallyRes.json() as any;

  const publisher = getPublisher(env);
  const record = {
    $type: 'com.minomobi.poll.tally' as const,
    pollId: pollId,
    countsByOption: tally.countsByOption,
    ballotCount: tally.ballotCount,
    computedAt: tally.computedAt,
    final: tally.final,
  };

  const result = await publisher.createRecord(
    'com.minomobi.poll.tally',
    `tally-${pollId.replace(/-/g, '')}`,
    record
  );

  return jsonResponse({ uri: result.uri, cid: result.cid });
}

async function publishBallots(request: Request, env: Env, pollId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(pollId).first();
  if (!poll) return jsonResponse({ error: 'Poll not found' }, 404);
  if (poll.host_did !== session.did) return jsonResponse({ error: 'Forbidden' }, 403);
  if (poll.status !== 'closed') return jsonResponse({ error: 'Poll must be closed before publishing ballots' }, 400);

  const rows = await env.DB.prepare(
    'SELECT ballot_id, choice, token_message, issuer_signature, nullifier, ballot_version, public_ballot_serial FROM ballots WHERE poll_id = ? AND published_record_uri IS NULL'
  ).bind(pollId).all();

  const ballots = rows.results as any[];
  if (ballots.length === 0) return jsonResponse({ published: 0, message: 'No unpublished ballots' });

  // Fisher-Yates shuffle to break submission ordering
  for (let i = ballots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ballots[i], ballots[j]] = [ballots[j], ballots[i]];
  }

  const publisher = getPublisher(env);
  let published = 0;

  for (const b of ballots) {
    try {
      const record = {
        $type: 'com.minomobi.poll.ballot' as const,
        pollId,
        option: b.choice,
        tokenMessage: b.token_message,
        issuerSignature: b.issuer_signature,
        nullifier: b.nullifier,
        ballotVersion: b.ballot_version || 1,
        publicSerial: b.public_ballot_serial,
      };

      const result = await publisher.createRecord(
        'com.minomobi.poll.ballot',
        `ballot-${b.ballot_id.replace(/-/g, '')}`,
        record
      );

      await env.DB.prepare(
        'UPDATE ballots SET published_record_uri = ? WHERE ballot_id = ?'
      ).bind(result.uri, b.ballot_id).run();

      published++;
    } catch (err: any) {
      console.error(`Failed to publish ballot ${b.ballot_id}:`, err.message);
    }
  }

  return jsonResponse({ published, total: ballots.length });
}

async function syncEligibleDids(request: Request, env: Env, pollId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(pollId).first();
  if (!poll) return jsonResponse({ error: 'Poll not found' }, 404);
  if (poll.host_did !== session.did) return jsonResponse({ error: 'Forbidden' }, 403);
  if (poll.status !== 'draft') return jsonResponse({ error: 'Can only sync eligible DIDs while poll is in draft' }, 400);

  const eligibilityMode = poll.eligibility_mode as string;
  if (eligibilityMode === 'open') return jsonResponse({ error: 'Poll is open to everyone' }, 400);

  let dids: string[] = [];
  if (eligibilityMode === 'followers' || eligibilityMode === 'mutuals') {
    dids = await fetchAtprotoGraph(session.did, eligibilityMode as 'followers' | 'mutuals');
  } else if (eligibilityMode === 'at_list' && poll.eligibility_source) {
    dids = await fetchAtprotoList(poll.eligibility_source as string);
  } else if (eligibilityMode === 'did_list') {
    return jsonResponse({ error: 'Manual DID lists are set at creation, not synced' }, 400);
  }

  // Clear existing and re-populate
  await env.DB.prepare('DELETE FROM poll_eligible_dids WHERE poll_id = ?').bind(pollId).run();
  const count = await insertEligibleDids(env, pollId, dids);

  return jsonResponse({ synced: count });
}

async function getEligibleDids(env: Env, pollId: string): Promise<Response> {
  const poll = await env.DB.prepare('SELECT eligibility_mode FROM polls WHERE id = ?').bind(pollId).first();
  if (!poll) return jsonResponse({ error: 'Poll not found' }, 404);
  if (poll.eligibility_mode === 'open') return jsonResponse({ eligibilityMode: 'open', count: null });

  const result = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM poll_eligible_dids WHERE poll_id = ?'
  ).bind(pollId).first();

  return jsonResponse({
    eligibilityMode: poll.eligibility_mode,
    count: (result as any)?.count || 0,
  });
}

async function insertEligibleDids(env: Env, pollId: string, dids: string[]): Promise<number> {
  if (dids.length === 0) return 0;
  const unique = [...new Set(dids)];
  const batch = unique.map(did =>
    env.DB.prepare('INSERT OR IGNORE INTO poll_eligible_dids (poll_id, did) VALUES (?, ?)')
      .bind(pollId, did)
  );
  for (let i = 0; i < batch.length; i += 100) {
    await env.DB.batch(batch.slice(i, i + 100));
  }
  return unique.length;
}

const BSKY_PUBLIC_API = 'https://public.api.bsky.app';

async function fetchAtprotoGraph(did: string, mode: 'followers' | 'mutuals'): Promise<string[]> {
  const followers = await fetchAllFollows(did, 'followers');
  if (mode === 'followers') return followers;

  const following = await fetchAllFollows(did, 'follows');
  const followingSet = new Set(following);
  return followers.filter(f => followingSet.has(f));
}

async function fetchAllFollows(did: string, direction: 'followers' | 'follows'): Promise<string[]> {
  const endpoint = direction === 'followers'
    ? 'app.bsky.graph.getFollowers'
    : 'app.bsky.graph.getFollows';
  const actorParam = direction === 'followers' ? 'actor' : 'actor';

  const dids: string[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({ [actorParam]: did, limit: '100' });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`${BSKY_PUBLIC_API}/xrpc/${endpoint}?${params}`);
    if (!res.ok) break;

    const data = await res.json() as any;
    const items = data.followers || data.follows || [];
    for (const item of items) {
      if (item.did) dids.push(item.did);
    }

    cursor = data.cursor;
    if (!cursor || items.length === 0) break;
  }

  return dids;
}

async function fetchAtprotoList(listUri: string): Promise<string[]> {
  const dids: string[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({ list: listUri, limit: '100' });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`${BSKY_PUBLIC_API}/xrpc/app.bsky.graph.getList?${params}`);
    if (!res.ok) break;

    const data = await res.json() as any;
    const items = data.items || [];
    for (const item of items) {
      if (item.subject?.did) dids.push(item.subject.did);
    }

    cursor = data.cursor;
    if (!cursor || items.length === 0) break;
  }

  return dids;
}

async function postToBluesky(request: Request, env: Env, pollId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(pollId).first();
  if (!poll) return jsonResponse({ error: 'Poll not found' }, 404);
  if (poll.host_did !== session.did) return jsonResponse({ error: 'Forbidden' }, 403);

  // Check OAuth scope — posting requires transition:generic
  if (session.oauthScope && !session.oauthScope.includes('transition:generic')) {
    return jsonResponse({
      error: 'insufficient_scope',
      message: 'Posting to Bluesky requires write permission. Please re-authorize.',
    }, 403);
  }

  // Use stored PDS refresh token from login session
  const pdsAuth = await getPdsAccessToken(request, env);
  if (!pdsAuth) {
    return jsonResponse({ error: 'PDS session expired. Please log out and log back in.' }, 401);
  }

  // Build the post text and facets
  const options = JSON.parse(poll.options as string) as string[];
  const origin = new URL(request.url).origin;
  const encoder = new TextEncoder();

  const timeLeft = formatTimeLeftServer(poll.closes_at as string);
  const question = poll.question as string;
  const isPublicLike = poll.mode === 'public_like';

  let postText: string;
  const facets: any[] = [];

  if (isPublicLike) {
    // Public like mode: main post is the question + instructions
    const footerParts = ['View results', 'Public poll'];
    if (timeLeft) footerParts.push(timeLeft);
    const footer = footerParts.join(' · ');
    postText = `${question}\n\nLike a reply to vote:\n\n${footer}`;

    // "View results" facet in footer
    const footerStart = encoder.encode(`${question}\n\nLike a reply to vote:\n\n`).byteLength;
    const viewResultsBytes = encoder.encode('View results');
    facets.push({
      index: { byteStart: footerStart, byteEnd: footerStart + viewResultsBytes.byteLength },
      features: [{
        $type: 'app.bsky.richtext.facet#link',
        uri: `${origin}/poll/${pollId}`,
      }],
    });
  } else {
    // Anonymous mode: option names are link facets to QuickVote
    const optionLine = options.join('\n');
    const footerParts = ['View poll', 'Verifiable & anonymous'];
    if (timeLeft) footerParts.push(timeLeft);
    const footer = footerParts.join(' · ');
    postText = `${question}\n\n${optionLine}\n\n${footer}`;

    // Option facets — each option name on its own line
    let searchStart = encoder.encode(`${question}\n\n`).byteLength;
    for (let i = 0; i < options.length; i++) {
      const optBytes = encoder.encode(options[i]);
      const byteStart = searchStart;
      const byteEnd = byteStart + optBytes.byteLength;
      facets.push({
        index: { byteStart, byteEnd },
        features: [{
          $type: 'app.bsky.richtext.facet#link',
          uri: `${origin}/v/${pollId}?c=${i}`,
        }],
      });
      searchStart = byteEnd;
      if (i < options.length - 1) {
        searchStart += encoder.encode('\n').byteLength;
      }
    }

    // "View poll" facet in footer
    const footerStart = encoder.encode(`${question}\n\n${optionLine}\n\n`).byteLength;
    const viewPollBytes = encoder.encode('View poll');
    facets.push({
      index: { byteStart: footerStart, byteEnd: footerStart + viewPollBytes.byteLength },
      features: [{
        $type: 'app.bsky.richtext.facet#link',
        uri: `${origin}/poll/${pollId}`,
      }],
    });
  }

  // Build external embed for link card preview
  const pollUrl = `${origin}${isPublicLike ? '/public' : ''}/poll/${pollId}`;
  const cardDescription = options.slice(0, 6).join(' · ') + (options.length > 6 ? ' · ...' : '');

  // Try to upload OG image as thumb for the card
  let thumbBlob: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number } | undefined;
  try {
    // Generate the OG image internally
    const ogResponse = await generateOgImage(env, pollId);
    if (ogResponse.ok) {
      const pngBytes = await ogResponse.arrayBuffer();
      const uploadUrl = `${pdsAuth.pdsUrl}/xrpc/com.atproto.repo.uploadBlob`;
      let uploadRes: Response;
      if (pdsAuth.authMethod === 'oauth' && pdsAuth.dpopKeyPair) {
        let proof = await createDPoPProof(pdsAuth.dpopKeyPair, 'POST', uploadUrl, undefined, pdsAuth.accessJwt);
        uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'image/png', 'Authorization': `DPoP ${pdsAuth.accessJwt}`, 'DPoP': proof },
          body: pngBytes,
        });
        if ((uploadRes.status === 401 || uploadRes.status === 400) && uploadRes.headers.get('DPoP-Nonce')) {
          proof = await createDPoPProof(pdsAuth.dpopKeyPair, 'POST', uploadUrl, uploadRes.headers.get('DPoP-Nonce')!, pdsAuth.accessJwt);
          uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'image/png', 'Authorization': `DPoP ${pdsAuth.accessJwt}`, 'DPoP': proof },
            body: pngBytes,
          });
        }
      } else {
        uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'image/png', 'Authorization': `Bearer ${pdsAuth.accessJwt}` },
          body: pngBytes,
        });
      }
      if (uploadRes.ok) {
        const blobResult = await uploadRes.json() as { blob: { ref: { $link: string }; mimeType: string; size: number } };
        thumbBlob = { $type: 'blob', ref: blobResult.blob.ref, mimeType: blobResult.blob.mimeType, size: blobResult.blob.size };
      }
    }
  } catch (e) {
    console.error('Failed to upload OG thumb:', e);
  }

  // Create the post with external embed (link card)
  const record: Record<string, unknown> = {
    $type: 'app.bsky.feed.post',
    text: postText,
    facets,
    embed: {
      $type: 'app.bsky.embed.external',
      external: {
        uri: pollUrl,
        title: question,
        description: cardDescription,
        ...(thumbBlob ? { thumb: thumbBlob } : {}),
      },
    },
    createdAt: new Date().toISOString(),
  };

  // Build auth headers — OAuth tokens are DPoP-bound, app-password tokens use Bearer
  const createRecordUrl = `${pdsAuth.pdsUrl}/xrpc/com.atproto.repo.createRecord`;
  const requestBody = JSON.stringify({
    repo: pdsAuth.did,
    collection: 'app.bsky.feed.post',
    record,
  });

  let createRes: Response;

  if (pdsAuth.authMethod === 'oauth' && pdsAuth.dpopKeyPair) {
    // First attempt without nonce
    let dpopProof = await createDPoPProof(
      pdsAuth.dpopKeyPair, 'POST', createRecordUrl, undefined, pdsAuth.accessJwt
    );
    createRes = await fetch(createRecordUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `DPoP ${pdsAuth.accessJwt}`,
        'DPoP': dpopProof,
      },
      body: requestBody,
    });

    // Retry with nonce if required
    if (createRes.status === 401 || createRes.status === 400) {
      const nonce = createRes.headers.get('DPoP-Nonce');
      if (nonce) {
        dpopProof = await createDPoPProof(
          pdsAuth.dpopKeyPair, 'POST', createRecordUrl, nonce, pdsAuth.accessJwt
        );
        createRes = await fetch(createRecordUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `DPoP ${pdsAuth.accessJwt}`,
            'DPoP': dpopProof,
          },
          body: requestBody,
        });
      }
    }
  } else {
    createRes = await fetch(createRecordUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pdsAuth.accessJwt}`,
      },
      body: requestBody,
    });
  }

  if (!createRes.ok) {
    const err = await createRes.text();
    return jsonResponse({ error: `Failed to post: ${err}` }, 500);
  }

  const result = await createRes.json() as { uri: string; cid: string };

  // For public_like mode: create hidden option posts via bridge-delete trick.
  // Option posts are replies to a bridge reply that gets deleted — they become
  // orphaned (hidden from thread view) but still accessible by direct URI.
  // The main post links to bsky.app URLs for each option post — user clicks,
  // sees the post in Bluesky, likes it. Zero auth on our side.
  if (isPublicLike) {
    // Helper: create a record on the host's PDS
    const pdsCreate = async (rec: any): Promise<{ uri: string; cid: string } | null> => {
      const body = JSON.stringify({ repo: pdsAuth.did, collection: 'app.bsky.feed.post', record: rec });
      let res: Response;
      if (pdsAuth.authMethod === 'oauth' && pdsAuth.dpopKeyPair) {
        let proof = await createDPoPProof(pdsAuth.dpopKeyPair, 'POST', createRecordUrl, undefined, pdsAuth.accessJwt);
        res = await fetch(createRecordUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `DPoP ${pdsAuth.accessJwt}`, 'DPoP': proof }, body });
        if ((res.status === 401 || res.status === 400) && res.headers.get('DPoP-Nonce')) {
          proof = await createDPoPProof(pdsAuth.dpopKeyPair, 'POST', createRecordUrl, res.headers.get('DPoP-Nonce')!, pdsAuth.accessJwt);
          res = await fetch(createRecordUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `DPoP ${pdsAuth.accessJwt}`, 'DPoP': proof }, body });
        }
      } else {
        res = await fetch(createRecordUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pdsAuth.accessJwt}` }, body });
      }
      if (!res.ok) { console.error('PDS createRecord failed:', await res.text()); return null; }
      return await res.json() as { uri: string; cid: string };
    };

    // Helper: delete a record on the host's PDS
    const pdsDelete = async (uri: string): Promise<boolean> => {
      const rkey = uri.split('/').pop()!;
      const deleteUrl = `${pdsAuth.pdsUrl}/xrpc/com.atproto.repo.deleteRecord`;
      const body = JSON.stringify({ repo: pdsAuth.did, collection: 'app.bsky.feed.post', rkey });
      let res: Response;
      if (pdsAuth.authMethod === 'oauth' && pdsAuth.dpopKeyPair) {
        let proof = await createDPoPProof(pdsAuth.dpopKeyPair, 'POST', deleteUrl, undefined, pdsAuth.accessJwt);
        res = await fetch(deleteUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `DPoP ${pdsAuth.accessJwt}`, 'DPoP': proof }, body });
        if ((res.status === 401 || res.status === 400) && res.headers.get('DPoP-Nonce')) {
          proof = await createDPoPProof(pdsAuth.dpopKeyPair, 'POST', deleteUrl, res.headers.get('DPoP-Nonce')!, pdsAuth.accessJwt);
          res = await fetch(deleteUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `DPoP ${pdsAuth.accessJwt}`, 'DPoP': proof }, body });
        }
      } else {
        res = await fetch(deleteUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pdsAuth.accessJwt}` }, body });
      }
      return res.ok;
    };

    // at:// URI → bsky.app URL
    const atUriToBskyUrl = (uri: string): string => {
      const m = uri.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/(.+)$/);
      return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : uri;
    };

    // Step 1: Post bridge reply (will be deleted to orphan the option posts)
    const bridge = await pdsCreate({
      $type: 'app.bsky.feed.post',
      text: '.',
      reply: { root: { uri: result.uri, cid: result.cid }, parent: { uri: result.uri, cid: result.cid } },
      createdAt: new Date().toISOString(),
    });
    if (!bridge) return jsonResponse({ error: 'Failed to create bridge post' }, 500);

    // Step 2: Post each option as a reply to the bridge, with poll context + links
    const optionPosts: { uri: string; cid: string }[] = [];
    for (let i = 0; i < options.length; i++) {
      const resultsUrl = `${origin}/poll/${pollId}`;
      const optText = `📊 ${question}\n\n→ ${options[i]}\n\nLike this post to vote.\n\nView results`;
      const optEncoder = new TextEncoder();
      const optFacets: any[] = [];

      // Link "View results" to the poll page
      const viewResultsStart = optEncoder.encode(`📊 ${question}\n\n→ ${options[i]}\n\nLike this post to vote.\n\n`).byteLength;
      const viewResultsBytes = optEncoder.encode('View results');
      optFacets.push({
        index: { byteStart: viewResultsStart, byteEnd: viewResultsStart + viewResultsBytes.byteLength },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: resultsUrl }],
      });

      // Link the poll question back to the results page too
      const questionStart = optEncoder.encode('📊 ').byteLength;
      const questionBytes = optEncoder.encode(question);
      optFacets.push({
        index: { byteStart: questionStart, byteEnd: questionStart + questionBytes.byteLength },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: resultsUrl }],
      });

      const optRecord = {
        $type: 'app.bsky.feed.post',
        text: optText,
        facets: optFacets,
        reply: { root: { uri: result.uri, cid: result.cid }, parent: { uri: bridge.uri, cid: bridge.cid } },
        createdAt: new Date().toISOString(),
      };
      const optResult = await pdsCreate(optRecord);
      optionPosts.push(optResult || { uri: '', cid: '' });
    }

    // Step 3: Delete the bridge → option posts become orphaned/hidden from thread
    await pdsDelete(bridge.uri);

    // Step 4: Now update the main post's facets to link to bsky.app URLs of hidden posts
    // (We can't update a post on ATProto, so we store the mapping for the results page.
    //  The main post already has option names — they link to QuickVote as fallback.
    //  But the REAL action is: users find the hidden posts via the main post's links.)

    // Actually, we need to re-create the main post with the correct bsky.app links.
    // ATProto doesn't support post editing. So we delete and re-post with correct facets.
    await pdsDelete(result.uri);

    // Re-create main post with bsky.app option links
    const newFacets: any[] = [];
    let mainSearchStart = encoder.encode(`${question}\n\nLike a reply to vote:\n\n`).byteLength;
    // We already know postText for public_like starts with question + "\n\nLike a reply to vote:\n\n"
    // But we need to rebuild with option names listed + linked to bsky.app
    const optNames = options.join('\n');
    const footerParts2 = ['View results', 'Public poll'];
    if (timeLeft) footerParts2.push(timeLeft);
    const footer2 = footerParts2.join(' · ');
    const newPostText = `${question}\n\n${optNames}\n\n${footer2}`;

    let optSearchStart = encoder.encode(`${question}\n\n`).byteLength;
    for (let i = 0; i < options.length; i++) {
      if (optionPosts[i]?.uri) {
        const optBytes = encoder.encode(options[i]);
        newFacets.push({
          index: { byteStart: optSearchStart, byteEnd: optSearchStart + optBytes.byteLength },
          features: [{ $type: 'app.bsky.richtext.facet#link', uri: atUriToBskyUrl(optionPosts[i].uri) }],
        });
        optSearchStart += optBytes.byteLength;
      }
      if (i < options.length - 1) optSearchStart += encoder.encode('\n').byteLength;
    }

    // "View results" link in footer
    const footerStart2 = encoder.encode(`${question}\n\n${optNames}\n\n`).byteLength;
    const viewResultsBytes2 = encoder.encode('View results');
    newFacets.push({
      index: { byteStart: footerStart2, byteEnd: footerStart2 + viewResultsBytes2.byteLength },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: `${origin}/poll/${pollId}` }],
    });

    const mainResult = await pdsCreate({
      $type: 'app.bsky.feed.post',
      text: newPostText,
      facets: newFacets,
      embed: {
        $type: 'app.bsky.embed.external',
        external: {
          uri: pollUrl,
          title: question,
          description: cardDescription,
          ...(thumbBlob ? { thumb: thumbBlob } : {}),
        },
      },
      createdAt: new Date().toISOString(),
    });

    // Store option post URIs in D1 for like-syncing + main post ref for results reply
    const finalUri = mainResult?.uri || result.uri;
    const finalCid = mainResult?.cid || result.cid;
    await env.DB.prepare('UPDATE polls SET bluesky_option_posts = ?, bluesky_post_uri = ?, bluesky_post_cid = ? WHERE id = ?')
      .bind(JSON.stringify(optionPosts), finalUri, finalCid, pollId).run();

    return jsonResponse({
      uri: finalUri,
      cid: finalCid,
      optionPosts,
    });
  }

  // Store the Bluesky post ref so we can reply with results on close
  await env.DB.prepare('UPDATE polls SET bluesky_post_uri = ?, bluesky_post_cid = ? WHERE id = ?')
    .bind(result.uri, result.cid, pollId).run();

  return jsonResponse({ uri: result.uri, cid: result.cid });
}


async function syncLikes(request: Request, env: Env, pollId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(pollId).first();
  if (!poll) return jsonResponse({ error: 'Poll not found' }, 404);
  if (poll.host_did !== session.did) return jsonResponse({ error: 'Forbidden' }, 403);
  if (poll.mode !== 'public_like') return jsonResponse({ error: 'Only public_like polls support like syncing' }, 400);

  const optionPosts = poll.bluesky_option_posts
    ? JSON.parse(poll.bluesky_option_posts as string) as { uri: string; cid: string }[]
    : null;
  if (!optionPosts || optionPosts.length === 0) {
    return jsonResponse({ error: 'No Bluesky option posts found. Post to Bluesky first.' }, 400);
  }

  // Fetch likes for each option post from Bluesky public API
  const countsByOption: Record<string, number> = {};
  let totalVotes = 0;

  for (let i = 0; i < optionPosts.length; i++) {
    const post = optionPosts[i];
    if (!post.uri) {
      countsByOption[String(i)] = 0;
      continue;
    }

    const voters = new Set<string>();
    let cursor: string | undefined;

    for (let page = 0; page < 100; page++) {
      const params = new URLSearchParams({ uri: post.uri, limit: '100' });
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(`${BSKY_PUBLIC_API}/xrpc/app.bsky.feed.getLikes?${params}`);
      if (!res.ok) break;

      const data = await res.json() as any;
      const likes = data.likes || [];
      for (const like of likes) {
        if (like.actor?.did) {
          voters.add(like.actor.did);
        }
      }

      cursor = data.cursor;
      if (!cursor || likes.length === 0) break;
    }

    // Count all likes per option — multi-vote is allowed in public polls
    const count = voters.size;
    countsByOption[String(i)] = count;
    totalVotes += count;
  }

  // Update tally via DO
  const doStub = getPollDO(env, pollId);
  const doRes = await doStub.fetch(new Request('https://do/sync-likes', {
    method: 'POST',
    body: JSON.stringify({ countsByOption, ballotCount: totalVotes }),
  }));

  if (!doRes.ok) {
    const errText = await doRes.text();
    return jsonResponse({ error: `Failed to update tally: ${errText}` }, 500);
  }

  return jsonResponse({
    synced: true,
    totalVotes,
    countsByOption,
    uniqueVoters: totalVotes,
  });
}

/**
 * Generate an OG image (SVG) for link card previews.
 * Shows the poll question and options with vote counts if available.
 */
async function generateOgImage(env: Env, pollId: string): Promise<Response> {
  const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(pollId).first();
  if (!poll) {
    return new Response('Not found', { status: 404 });
  }

  const question = poll.question as string;
  const options = JSON.parse(poll.options as string) as string[];
  const status = poll.status as string;
  const mode = poll.mode as string;

  // Try to get tally
  const tallyRow = await env.DB.prepare(
    'SELECT counts_by_option, ballot_count FROM tally_snapshots WHERE poll_id = ? ORDER BY computed_at DESC LIMIT 1'
  ).bind(pollId).first();

  const tally = tallyRow?.counts_by_option
    ? JSON.parse(tallyRow.counts_by_option as string) as Record<string, number>
    : null;
  const totalVotes = (tallyRow?.ballot_count as number) || 0;
  const maxVotes = tally ? Math.max(...Object.values(tally), 1) : 1;

  // SVG dimensions
  const W = 1200;
  const H = 630;
  const PAD = 60;
  const optionStartY = 180;
  const optionH = 52;
  const barMaxW = W - PAD * 2 - 300;

  // Escape XML
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Truncate question if too long
  const q = question.length > 80 ? question.slice(0, 77) + '...' : question;

  // Build option rows
  const optionRows = options.slice(0, 8).map((opt, i) => {
    const count = tally?.[String(i)] || 0;
    const pct = totalVotes > 0 ? count / maxVotes : 0;
    const barW = Math.max(pct * barMaxW, 2);
    const y = optionStartY + i * optionH;
    const label = opt.length > 30 ? opt.slice(0, 27) + '...' : opt;
    const countStr = tally ? `${count}` : '';

    return `
      <rect x="${PAD}" y="${y}" width="${barW}" height="32" rx="4" fill="#c41230" opacity="0.85"/>
      <text x="${PAD + 8}" y="${y + 22}" fill="#fff" font-size="18" font-family="Roboto Mono, monospace" font-weight="bold">${esc(label)}</text>
      ${countStr ? `<text x="${W - PAD}" y="${y + 22}" fill="#999" font-size="16" font-family="Roboto Mono, monospace" text-anchor="end">${countStr}</text>` : ''}
    `;
  }).join('');

  const modeLabel = mode === 'public_like' ? 'PUBLIC POLL' : 'ANONYMOUS POLL';
  const statusLabel = status === 'open' ? 'OPEN' : status.toUpperCase();
  const footerY = H - 40;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#1a1a1a"/>
  <rect x="0" y="0" width="${W}" height="4" fill="#c41230"/>

  <!-- Question -->
  <text x="${PAD}" y="80" fill="#f0f0f0" font-size="32" font-family="Roboto Mono, monospace" font-weight="bold">${esc(q)}</text>

  <!-- Mode + status badges -->
  <text x="${PAD}" y="130" fill="#888" font-size="16" font-family="Roboto Mono, monospace">${modeLabel} · ${statusLabel}${totalVotes > 0 ? ` · ${totalVotes} votes` : ''}</text>

  <!-- Options with bars -->
  ${optionRows}

  <!-- Footer -->
  <text x="${PAD}" y="${footerY}" fill="#555" font-size="14" font-family="Roboto Mono, monospace">poll.mino.mobi</text>
</svg>`;

  // Convert SVG to PNG via resvg-wasm (scrapers don't support SVG og:image)
  try {
    if (!resvgInitialized) {
      await initWasm(resvgWasm);
      resvgInitialized = true;
    }
    const resvg = new Resvg(svg, {
      font: {
        fontBuffers: [new Uint8Array(fontRegular), new Uint8Array(fontBold)],
        loadSystemFonts: false,
        defaultFontFamily: 'Roboto Mono',
        monospaceFamily: 'Roboto Mono',
      },
      fitTo: { mode: 'width', value: W },
    });
    const rendered = resvg.render();
    const pngBuffer = rendered.asPng();

    return new Response(pngBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (e) {
    // Fallback: serve SVG if resvg fails (better than nothing)
    console.error('resvg PNG conversion failed, serving SVG fallback:', e);
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=60',
      },
    });
  }
}

function formatTimeLeftServer(closesAt: string): string {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return 'Closed';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}

function getPublisher(env: Env) {
  if (env.ATPROTO_MOCK_MODE === 'true' || !env.ATPROTO_SERVICE_HANDLE) {
    return new MockPublisher();
  }
  return new PdsPublisher({
    serviceUrl: env.ATPROTO_SERVICE_PDS || 'https://bsky.social',
    handle: env.ATPROTO_SERVICE_HANDLE,
    password: env.ATPROTO_SERVICE_PASSWORD || '',
    did: env.ATPROTO_SERVICE_DID || '',
  });
}
