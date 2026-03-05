/**
 * Ballot routes — anonymous ballot submission and public ballot queries.
 *
 * POST /api/polls/:id/ballots/submit — submit anonymous ballot
 * GET  /api/polls/:id/ballots        — list accepted public ballots
 *
 * IMPORTANT: ballot submission does NOT require an authenticated session.
 * The credential (tokenMessage + issuerSignature + nullifier) IS the auth.
 * This is a critical design choice: the ballot endpoint accepts credential-based
 * auth, not identity-based auth, preserving responder anonymity.
 */

import { BallotSubmissionSchema } from '@anon-polls/shared';
import { MockPublisher, PdsPublisher } from '@anon-polls/shared';
import type { Env } from '../index.js';
import { jsonResponse, getPollDO } from '../index.js';

export async function handleBallotRoutes(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  const submitMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/ballots\/submit$/);
  if (submitMatch && request.method === 'POST') {
    return submitBallot(request, env, submitMatch[1]);
  }

  const listMatch = url.pathname.match(/^\/api\/polls\/([^/]+)\/ballots$/);
  if (listMatch && request.method === 'GET') {
    return listBallots(env, listMatch[1]);
  }

  return null;
}

async function submitBallot(request: Request, env: Env, pollId: string): Promise<Response> {
  const body = await request.json();
  const parsed = BallotSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: 'Validation error', details: parsed.error.issues }, 400);
  }

  // Forward to Durable Object for atomic processing
  // NOTE: no session check here — the credential IS the auth
  const doStub = getPollDO(env, pollId);
  const doRes = await doStub.fetch(new Request('https://do/ballot', {
    method: 'POST',
    body: JSON.stringify(parsed.data),
  }));

  const result = await doRes.json() as any;

  // If ballot was accepted, publish to ATProto
  if (result.accepted && result.ballotId) {
    try {
      const publisher = getPublisher(env);
      const record = {
        $type: 'com.minomobi.poll.ballot' as const,
        pollId,
        option: parsed.data.choice,
        tokenMessage: parsed.data.tokenMessage,
        issuerSignature: parsed.data.issuerSignature,
        nullifier: parsed.data.nullifier,
        submittedAt: new Date().toISOString(),
        ballotVersion: parsed.data.ballotVersion || 1,
        publicSerial: result.publicSerial,
      };

      const pubResult = await publisher.createRecord(
        'com.minomobi.poll.ballot',
        `ballot-${result.ballotId.replace(/-/g, '')}`,
        record
      );

      // Update D1 with published URI
      await env.DB.prepare(
        'UPDATE ballots SET published_record_uri = ? WHERE ballot_id = ?'
      ).bind(pubResult.uri, result.ballotId).run();

      result.publishedUri = pubResult.uri;
    } catch (err: any) {
      // Publishing failure shouldn't reject the ballot — it's already accepted
      console.error('Failed to publish ballot to ATProto:', err.message);
      result.publishWarning = 'Ballot accepted but ATProto publish deferred';
    }
  }

  return jsonResponse(result, doRes.status);
}

async function listBallots(env: Env, pollId: string): Promise<Response> {
  // Public endpoint — returns only anonymized ballots
  const doStub = getPollDO(env, pollId);
  const res = await doStub.fetch(new Request('https://do/ballots'));
  return new Response(res.body, { status: res.status, headers: res.headers });
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
