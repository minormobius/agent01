/**
 * Poll management routes.
 *
 * POST /api/polls          — create poll
 * GET  /api/polls/:id      — get poll
 * POST /api/polls/:id/open — open poll for voting
 * POST /api/polls/:id/close — close poll
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
  // POST /api/polls
  if (url.pathname === '/api/polls' && request.method === 'POST') {
    return createPoll(request, env);
  }

  // Match /api/polls/:id patterns
  const pollMatch = url.pathname.match(/^\/api\/polls\/([^/]+)$/);
  if (pollMatch && request.method === 'GET') {
    return getPoll(env, pollMatch[1]);
  }

  const openMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/open$/);
  if (openMatch && request.method === 'POST') {
    return openPoll(request, env, openMatch[1]);
  }

  const closeMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/close$/);
  if (closeMatch && request.method === 'POST') {
    return closePoll(request, env, closeMatch[1]);
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

  return null;
}

async function createPoll(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = await request.json();
  const parsed = CreatePollSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: 'Validation error', details: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const pollId = crypto.randomUUID();
  const signingKey = env.CREDENTIAL_SIGNING_KEY || crypto.randomUUID();

  // Compute a public verification "key" (in v1, this is just a tag; in v2, it would be a public key)
  const encoder = new TextEncoder();
  const keyHash = await crypto.subtle.digest('SHA-256', encoder.encode(signingKey));
  const publicVerificationKey = Array.from(new Uint8Array(keyHash))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  const now = new Date().toISOString();
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
    publicVerificationKey,
    atprotoRecordUri: null,
    createdAt: now,
  };

  // Insert into D1
  await env.DB.prepare(
    `INSERT INTO polls (id, host_did, asker_did, question, options, opens_at, closes_at,
      status, mode, public_verification_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    poll.id, poll.hostDid, poll.askerDid, poll.question,
    JSON.stringify(poll.options), poll.opensAt, poll.closesAt,
    poll.status, poll.mode, poll.publicVerificationKey, poll.createdAt
  ).run();

  // Initialize the Durable Object
  const doStub = getPollDO(env, pollId);
  await doStub.fetch(new Request('https://do/initialize', {
    method: 'POST',
    body: JSON.stringify({ ...poll, signingKey }),
  }));

  return jsonResponse(poll, 201);
}

async function getPoll(env: Env, pollId: string): Promise<Response> {
  const result = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(pollId).first();
  if (!result) return jsonResponse({ error: 'Poll not found' }, 404);

  return jsonResponse({
    ...result,
    options: JSON.parse(result.options as string),
  });
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
    mode: poll.mode as 'trusted_host_v1' | 'anon_credential_v2',
    publicVerificationKey: poll.public_verification_key as string,
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
