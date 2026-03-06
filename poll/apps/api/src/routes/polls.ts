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

import { CreatePollSchema } from '@anon-polls/shared';
import { MockPublisher, PdsPublisher } from '@anon-polls/shared';
import type { Env } from '../index.js';
import { jsonResponse, getPollDO } from '../index.js';
import { getSession } from './auth.js';

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

  const syncEligibleMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/eligible\/sync$/);
  if (syncEligibleMatch && request.method === 'POST') {
    return syncEligibleDids(request, env, syncEligibleMatch[1]);
  }

  const getEligibleMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/eligible$/);
  if (getEligibleMatch && request.method === 'GET') {
    return getEligibleDids(env, getEligibleMatch[1]);
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

    // RSA key pair is required for blind signatures
    if (!env.RSA_PUBLIC_KEY_JWK) {
      return jsonResponse({
        error: 'RSA key pair not configured. Set RSA_PRIVATE_KEY_JWK and RSA_PUBLIC_KEY_JWK secrets.',
      }, 500);
    }

    step = 'computeKeys';
    const pollId = crypto.randomUUID();

    const hostPublicKey = env.RSA_PUBLIC_KEY_JWK!;
    const encoder = new TextEncoder();
    const keyHash = await crypto.subtle.digest('SHA-256', encoder.encode(hostPublicKey));
    const hostKeyFingerprint = Array.from(new Uint8Array(keyHash))
      .map(b => b.toString(16).padStart(2, '0')).join('');

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
      createdAt: now,
    };

    // Insert into D1
    step = 'D1 insert';
    await env.DB.prepare(
      `INSERT INTO polls (id, host_did, asker_did, question, options, opens_at, closes_at,
        status, mode, eligibility_mode, eligibility_source, host_key_fingerprint, host_public_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      poll.id, poll.hostDid, poll.askerDid, poll.question,
      JSON.stringify(poll.options), poll.opensAt, poll.closesAt,
      poll.status, poll.mode, poll.eligibilityMode, poll.eligibilitySource,
      poll.hostKeyFingerprint, poll.hostPublicKey, poll.createdAt
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
    return jsonResponse({ error: `Poll creation failed at step: ${step}`, message: err.message }, 500);
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
    mode: poll.mode as 'anon_credential_v2',
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
