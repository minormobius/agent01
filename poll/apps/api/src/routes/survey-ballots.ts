/**
 * Survey ballot routes — anonymous multi-question ballot submission and listing.
 *
 * POST /api/surveys/:id/ballots/submit — submit anonymous survey ballot
 * GET  /api/surveys/:id/ballots        — list accepted public ballots
 *
 * Like poll ballots, submission does NOT require session auth.
 * The credential (tokenMessage + issuerSignature + nullifier) IS the auth.
 */

import { SurveyBallotSubmissionSchema } from '@atpolls/shared';
import type { Env } from '../index.js';
import { jsonResponse, getSurveyDO } from '../index.js';

export async function handleSurveyBallotRoutes(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  const submitMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)\/ballots\/submit$/);
  if (submitMatch && request.method === 'POST') {
    return submitBallot(request, env, submitMatch[1]);
  }

  const listMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)\/ballots$/);
  if (listMatch && request.method === 'GET') {
    return listBallots(env, listMatch[1]);
  }

  return null;
}

async function submitBallot(request: Request, env: Env, surveyId: string): Promise<Response> {
  const body = await request.json();
  const parsed = SurveyBallotSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: 'Validation error', details: parsed.error.issues }, 400);
  }

  const doStub = getSurveyDO(env, surveyId);
  const doRes = await doStub.fetch(new Request('https://do/ballot', {
    method: 'POST',
    body: JSON.stringify(parsed.data),
  }));

  const result = await doRes.json() as any;
  return jsonResponse(result, doRes.status);
}

async function listBallots(env: Env, surveyId: string): Promise<Response> {
  const doStub = getSurveyDO(env, surveyId);
  const res = await doStub.fetch(new Request('https://do/ballots'));
  return new Response(res.body, { status: res.status, headers: res.headers });
}
