/**
 * Survey management routes — multi-question polling.
 *
 * POST /api/surveys           — create survey
 * GET  /api/surveys            — list surveys
 * GET  /api/surveys/:id        — get survey with questions
 * DELETE /api/surveys/:id      — delete survey (host only)
 * POST /api/surveys/:id/open   — open survey
 * POST /api/surveys/:id/close  — close survey
 * POST /api/surveys/:id/finalize — finalize survey (irreversible)
 * GET  /api/surveys/:id/tally  — get per-question tally
 * GET  /api/surveys/:id/audit  — get audit log
 * POST /api/surveys/:id/eligibility/request — request credential
 * POST /api/surveys/:id/eligible/sync — re-sync eligible DIDs
 * GET  /api/surveys/:id/eligible — get eligible count
 */

import { CreateSurveySchema } from '@atpolls/shared';
import type { Env } from '../index.js';
import { jsonResponse, getSurveyDO } from '../index.js';
import { getSession, getPdsAccessToken } from './auth.js';
import { createDPoPProof } from '../oauth/jwt.js';
// @ts-ignore — WASM import handled by wrangler bundler
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import fontRegular from '../fonts/roboto-mono-400.js';
import fontBold from '../fonts/roboto-mono-700.js';

let resvgInitialized = false;

export async function handleSurveyRoutes(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  // GET /api/surveys
  if (url.pathname === '/api/surveys' && request.method === 'GET') {
    return listSurveys(env, url);
  }

  // POST /api/surveys
  if (url.pathname === '/api/surveys' && request.method === 'POST') {
    return createSurvey(request, env);
  }

  const surveyMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)$/);
  if (surveyMatch && request.method === 'GET') {
    return getSurvey(env, surveyMatch[1]);
  }
  if (surveyMatch && request.method === 'DELETE') {
    return deleteSurvey(request, env, surveyMatch[1]);
  }

  const openMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)\/open$/);
  if (openMatch && request.method === 'POST') {
    return openSurvey(request, env, openMatch[1]);
  }

  const closeMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)\/close$/);
  if (closeMatch && request.method === 'POST') {
    return closeSurvey(request, env, closeMatch[1]);
  }

  const finalizeMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)\/finalize$/);
  if (finalizeMatch && request.method === 'POST') {
    return finalizeSurvey(request, env, finalizeMatch[1]);
  }

  const tallyMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)\/tally$/);
  if (tallyMatch && request.method === 'GET') {
    return getTally(env, tallyMatch[1]);
  }

  const auditMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)\/audit$/);
  if (auditMatch && request.method === 'GET') {
    return getAudit(env, auditMatch[1]);
  }

  const eligMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)\/eligibility\/request$/);
  if (eligMatch && request.method === 'POST') {
    return requestEligibility(request, env, eligMatch[1]);
  }

  const syncEligibleMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)\/eligible\/sync$/);
  if (syncEligibleMatch && request.method === 'POST') {
    return syncEligibleDids(request, env, syncEligibleMatch[1]);
  }

  const getEligibleMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)\/eligible$/);
  if (getEligibleMatch && request.method === 'GET') {
    return getEligibleDids(env, getEligibleMatch[1]);
  }

  const postBskyMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)\/post-to-bluesky$/);
  if (postBskyMatch && request.method === 'POST') {
    return postSurveyToBluesky(request, env, postBskyMatch[1]);
  }

  const ogMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)\/og\.png$/);
  if (ogMatch && request.method === 'GET') {
    return generateSurveyOgImage(env, ogMatch[1]);
  }

  return null;
}

async function createSurvey(request: Request, env: Env): Promise<Response> {
  let step = 'getSession';
  try {
    const session = await getSession(request, env);
    if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

    step = 'parseBody';
    const body = await request.json();
    const parsed = CreateSurveySchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse({ error: 'Validation error', details: parsed.error.issues }, 400);
    }

    const data = parsed.data;
    step = 'validateKeys';
    const surveyId = crypto.randomUUID();
    const encoder = new TextEncoder();

    // Surveys always use anonymous credentials
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
        error: 'RSA_PUBLIC_KEY_JWK is not valid JSON.',
      }, 500);
    }
    if (!hostPublicKeyParsed?.kty || !hostPublicKeyParsed?.n || !hostPublicKeyParsed?.e) {
      return jsonResponse({
        error: 'RSA_PUBLIC_KEY_JWK is missing required JWK fields.',
      }, 500);
    }

    const hostPublicKey = env.RSA_PUBLIC_KEY_JWK!;
    const keyHash = await crypto.subtle.digest('SHA-256', encoder.encode(hostPublicKey));
    const hostKeyFingerprint = Array.from(new Uint8Array(keyHash))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    const now = new Date().toISOString();
    const eligibilityMode = data.eligibilityMode || 'open';
    const eligibilitySource = data.eligibilitySource || null;

    // Build questions
    const questions = data.questions.map((q, i) => ({
      id: crypto.randomUUID(),
      surveyId,
      question: q.question,
      options: q.options,
      position: i,
      required: q.required !== false,
      questionType: q.questionType || 'single_choice',
    }));

    const survey = {
      id: surveyId,
      hostDid: session.did,
      title: data.title,
      description: data.description || null,
      questions,
      opensAt: data.opensAt,
      closesAt: data.closesAt,
      status: 'draft' as const,
      eligibilityMode,
      eligibilitySource,
      hostKeyFingerprint,
      hostPublicKey,
      atprotoRecordUri: null,
      createdAt: now,
    };

    // Insert survey
    step = 'D1 insert survey';
    await env.DB.prepare(
      `INSERT INTO surveys (id, host_did, title, description, status, eligibility_mode, eligibility_source,
        host_key_fingerprint, host_public_key, opens_at, closes_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      survey.id, survey.hostDid, survey.title, survey.description,
      survey.status, survey.eligibilityMode, survey.eligibilitySource,
      survey.hostKeyFingerprint, survey.hostPublicKey,
      survey.opensAt, survey.closesAt, survey.createdAt
    ).run();

    // Insert questions
    step = 'D1 insert questions';
    const qBatch = questions.map(q =>
      env.DB.prepare(
        `INSERT INTO survey_questions (id, survey_id, question, options, position, required, question_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(q.id, q.surveyId, q.question, JSON.stringify(q.options), q.position, q.required ? 1 : 0, q.questionType || 'single_choice')
    );
    for (let i = 0; i < qBatch.length; i += 100) {
      await env.DB.batch(qBatch.slice(i, i + 100));
    }

    // Populate eligible DIDs
    step = 'eligibility';
    let eligibleCount = 0;
    if (eligibilityMode === 'did_list' && data.whitelistedDids?.length) {
      eligibleCount = await insertSurveyEligibleDids(env, surveyId, data.whitelistedDids);
    } else if (eligibilityMode === 'followers' || eligibilityMode === 'mutuals') {
      const dids = await fetchAtprotoGraph(session.did, eligibilityMode);
      eligibleCount = await insertSurveyEligibleDids(env, surveyId, dids);
    } else if (eligibilityMode === 'at_list' && eligibilitySource) {
      const dids = await fetchAtprotoList(eligibilitySource);
      eligibleCount = await insertSurveyEligibleDids(env, surveyId, dids);
    }

    // Initialize DO
    step = 'DO initialize';
    const doStub = getSurveyDO(env, surveyId);
    const doRes = await doStub.fetch(new Request('https://do/initialize', {
      method: 'POST',
      body: JSON.stringify(survey),
    }));
    if (!doRes.ok) {
      const doErr = await doRes.text();
      console.error('DO init failed:', doErr);
      return jsonResponse({ error: 'DO initialization failed', step, detail: doErr }, 500);
    }

    return jsonResponse({ ...survey, eligibleCount }, 201);
  } catch (err: any) {
    console.error(`createSurvey failed at step "${step}":`, err);
    return jsonResponse({ error: 'Survey creation failed', step, detail: String(err?.message || err) }, 500);
  }
}

async function listSurveys(env: Env, url: URL): Promise<Response> {
  const statusParam = url.searchParams.get('status');
  const VALID_STATUSES = ['draft', 'open', 'closed', 'finalized'];

  let query: string;
  let binds: string[] = [];

  if (statusParam === 'all') {
    query = 'SELECT id, title, description, status, eligibility_mode, opens_at, closes_at, created_at FROM surveys ORDER BY created_at DESC LIMIT 50';
  } else {
    const requested = statusParam
      ? statusParam.split(',').map(s => s.trim()).filter(s => VALID_STATUSES.includes(s))
      : ['draft', 'open'];
    if (requested.length === 0) requested.push('draft', 'open');
    const placeholders = requested.map(() => '?').join(',');
    query = `SELECT id, title, description, status, eligibility_mode, opens_at, closes_at, created_at FROM surveys WHERE status IN (${placeholders}) ORDER BY created_at DESC LIMIT 50`;
    binds = requested;
  }

  const stmt = env.DB.prepare(query);
  const result = binds.length > 0 ? await stmt.bind(...binds).all() : await stmt.all();

  return jsonResponse({ surveys: result.results || [] });
}

async function getSurvey(env: Env, surveyId: string): Promise<Response> {
  const result = await env.DB.prepare('SELECT * FROM surveys WHERE id = ?').bind(surveyId).first();
  if (!result) return jsonResponse({ error: 'Survey not found' }, 404);

  // Fetch questions
  const qResult = await env.DB.prepare(
    'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY position'
  ).bind(surveyId).all();

  const questions = (qResult.results || []).map((q: any) => ({
    id: q.id,
    surveyId: q.survey_id,
    question: q.question,
    options: JSON.parse(q.options),
    position: q.position,
    required: !!q.required,
    questionType: q.question_type || 'single_choice',
  }));

  return jsonResponse({
    ...result,
    questions,
  });
}

async function deleteSurvey(request: Request, env: Env, surveyId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const survey = await env.DB.prepare('SELECT host_did, status FROM surveys WHERE id = ?').bind(surveyId).first();
  if (!survey) return jsonResponse({ error: 'Survey not found' }, 404);
  if (survey.host_did !== session.did) return jsonResponse({ error: 'Forbidden' }, 403);

  await env.DB.batch([
    env.DB.prepare('DELETE FROM survey_ballots WHERE survey_id = ?').bind(surveyId),
    env.DB.prepare('DELETE FROM survey_eligibility WHERE survey_id = ?').bind(surveyId),
    env.DB.prepare('DELETE FROM survey_audit_events WHERE survey_id = ?').bind(surveyId),
    env.DB.prepare('DELETE FROM survey_tally_snapshots WHERE survey_id = ?').bind(surveyId),
    env.DB.prepare('DELETE FROM survey_eligible_dids WHERE survey_id = ?').bind(surveyId),
    env.DB.prepare('DELETE FROM survey_questions WHERE survey_id = ?').bind(surveyId),
    env.DB.prepare('DELETE FROM surveys WHERE id = ?').bind(surveyId),
  ]);

  return jsonResponse({ deleted: true, surveyId });
}

async function openSurvey(request: Request, env: Env, surveyId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const survey = await env.DB.prepare('SELECT host_did FROM surveys WHERE id = ?').bind(surveyId).first();
  if (!survey) return jsonResponse({ error: 'Survey not found' }, 404);
  if (survey.host_did !== session.did) return jsonResponse({ error: 'Forbidden' }, 403);

  const doStub = getSurveyDO(env, surveyId);
  const res = await doStub.fetch(new Request('https://do/open', { method: 'POST' }));
  return new Response(res.body, { status: res.status, headers: res.headers });
}

async function closeSurvey(request: Request, env: Env, surveyId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const survey = await env.DB.prepare('SELECT host_did FROM surveys WHERE id = ?').bind(surveyId).first();
  if (!survey) return jsonResponse({ error: 'Survey not found' }, 404);
  if (survey.host_did !== session.did) return jsonResponse({ error: 'Forbidden' }, 403);

  const doStub = getSurveyDO(env, surveyId);
  const res = await doStub.fetch(new Request('https://do/close', { method: 'POST' }));
  return new Response(res.body, { status: res.status, headers: res.headers });
}

async function finalizeSurvey(request: Request, env: Env, surveyId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const survey = await env.DB.prepare('SELECT host_did FROM surveys WHERE id = ?').bind(surveyId).first();
  if (!survey) return jsonResponse({ error: 'Survey not found' }, 404);
  if (survey.host_did !== session.did) return jsonResponse({ error: 'Forbidden' }, 403);

  const doStub = getSurveyDO(env, surveyId);
  const res = await doStub.fetch(new Request('https://do/finalize', { method: 'POST' }));
  return new Response(res.body, { status: res.status, headers: res.headers });
}

async function getTally(env: Env, surveyId: string): Promise<Response> {
  const doStub = getSurveyDO(env, surveyId);
  const res = await doStub.fetch(new Request('https://do/tally'));
  return new Response(res.body, { status: res.status, headers: res.headers });
}

async function getAudit(env: Env, surveyId: string): Promise<Response> {
  const doStub = getSurveyDO(env, surveyId);
  const res = await doStub.fetch(new Request('https://do/audit'));
  return new Response(res.body, { status: res.status, headers: res.headers });
}

async function requestEligibility(request: Request, env: Env, surveyId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));

  const doStub = getSurveyDO(env, surveyId);
  const res = await doStub.fetch(new Request('https://do/eligibility', {
    method: 'POST',
    body: JSON.stringify({
      responderDid: session.did,
      blindedMessage: (body as any)?.blindedMessage,
    }),
  }));
  return new Response(res.body, { status: res.status, headers: res.headers });
}

async function syncEligibleDids(request: Request, env: Env, surveyId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const survey = await env.DB.prepare('SELECT * FROM surveys WHERE id = ?').bind(surveyId).first();
  if (!survey) return jsonResponse({ error: 'Survey not found' }, 404);
  if (survey.host_did !== session.did) return jsonResponse({ error: 'Forbidden' }, 403);
  if (survey.status !== 'draft') return jsonResponse({ error: 'Can only sync while survey is in draft' }, 400);

  const eligibilityMode = survey.eligibility_mode as string;
  if (eligibilityMode === 'open') return jsonResponse({ error: 'Survey is open to everyone' }, 400);

  let dids: string[] = [];
  if (eligibilityMode === 'followers' || eligibilityMode === 'mutuals') {
    dids = await fetchAtprotoGraph(session.did, eligibilityMode as 'followers' | 'mutuals');
  } else if (eligibilityMode === 'at_list' && survey.eligibility_source) {
    dids = await fetchAtprotoList(survey.eligibility_source as string);
  } else if (eligibilityMode === 'did_list') {
    return jsonResponse({ error: 'Manual DID lists are set at creation, not synced' }, 400);
  }

  await env.DB.prepare('DELETE FROM survey_eligible_dids WHERE survey_id = ?').bind(surveyId).run();
  const count = await insertSurveyEligibleDids(env, surveyId, dids);

  return jsonResponse({ synced: count });
}

async function getEligibleDids(env: Env, surveyId: string): Promise<Response> {
  const survey = await env.DB.prepare('SELECT eligibility_mode FROM surveys WHERE id = ?').bind(surveyId).first();
  if (!survey) return jsonResponse({ error: 'Survey not found' }, 404);
  if (survey.eligibility_mode === 'open') return jsonResponse({ eligibilityMode: 'open', count: null });

  const result = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM survey_eligible_dids WHERE survey_id = ?'
  ).bind(surveyId).first();

  return jsonResponse({
    eligibilityMode: survey.eligibility_mode,
    count: (result as any)?.count || 0,
  });
}

async function insertSurveyEligibleDids(env: Env, surveyId: string, dids: string[]): Promise<number> {
  if (dids.length === 0) return 0;
  const unique = [...new Set(dids)];
  const batch = unique.map(did =>
    env.DB.prepare('INSERT OR IGNORE INTO survey_eligible_dids (survey_id, did) VALUES (?, ?)')
      .bind(surveyId, did)
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
  const method = direction === 'followers'
    ? 'app.bsky.graph.getFollowers'
    : 'app.bsky.graph.getFollows';
  const dids: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({ actor: did, limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(`${BSKY_PUBLIC_API}/xrpc/${method}?${params}`);
    if (!res.ok) break;
    const data = await res.json() as any;
    const items = data[direction] || [];
    for (const item of items) {
      if (item.did) dids.push(item.did);
    }
    cursor = data.cursor;
    if (!cursor || items.length === 0) break;
  }
  return dids;
}

async function postSurveyToBluesky(request: Request, env: Env, surveyId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const survey = await env.DB.prepare('SELECT * FROM surveys WHERE id = ?').bind(surveyId).first();
  if (!survey) return jsonResponse({ error: 'Survey not found' }, 404);
  if (survey.host_did !== session.did) return jsonResponse({ error: 'Forbidden' }, 403);

  if (session.oauthScope && !session.oauthScope.includes('transition:generic')) {
    return jsonResponse({
      error: 'insufficient_scope',
      message: 'Posting to Bluesky requires write permission. Please re-authorize.',
    }, 403);
  }

  const pdsAuth = await getPdsAccessToken(request, env);
  if (!pdsAuth) {
    return jsonResponse({ error: 'PDS session expired. Please log out and log back in.' }, 401);
  }

  const title = survey.title as string;
  const description = (survey.description as string) || '';
  const origin = new URL(request.url).origin;
  const encoder = new TextEncoder();
  const surveyUrl = `${origin}/survey/${surveyId}/vote`;
  const timeLeft = formatTimeLeftServer(survey.closes_at as string);

  // Post text: title (hyperlinked), description, tagline
  // Format:
  //   Survey Title
  //   Description text here
  //
  //   Take this survey · Verifiable & anonymous · 24h left
  const footerParts = ['Take this survey', 'Verifiable & anonymous'];
  if (timeLeft) footerParts.push(timeLeft);
  const footer = footerParts.join(' · ');

  let postText: string;
  if (description) {
    postText = `${title}\n\n${description}\n\n${footer}`;
  } else {
    postText = `${title}\n\n${footer}`;
  }

  const facets: any[] = [];

  // Title is a link to the survey
  const titleBytes = encoder.encode(title);
  facets.push({
    index: { byteStart: 0, byteEnd: titleBytes.byteLength },
    features: [{ $type: 'app.bsky.richtext.facet#link', uri: surveyUrl }],
  });

  // "Take this survey" link in footer
  const beforeFooter = description
    ? `${title}\n\n${description}\n\n`
    : `${title}\n\n`;
  const footerStart = encoder.encode(beforeFooter).byteLength;
  const takeSurveyBytes = encoder.encode('Take this survey');
  facets.push({
    index: { byteStart: footerStart, byteEnd: footerStart + takeSurveyBytes.byteLength },
    features: [{ $type: 'app.bsky.richtext.facet#link', uri: surveyUrl }],
  });

  // Build link card
  const qCount = (survey as any).questions?.length;
  const cardDescription = description
    || (qCount ? `${qCount} question${qCount !== 1 ? 's' : ''} · Anonymous & verifiable` : 'Anonymous & verifiable survey');

  // Try to upload OG image as thumb
  let thumbBlob: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number } | undefined;
  try {
    const ogResponse = await generateSurveyOgImage(env, surveyId);
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
    console.error('Failed to upload survey OG thumb:', e);
  }

  // Need question count from DB since the survey row doesn't include it
  let questionCount = qCount;
  if (!questionCount) {
    const qResult = await env.DB.prepare('SELECT COUNT(*) as c FROM survey_questions WHERE survey_id = ?').bind(surveyId).first();
    questionCount = (qResult as any)?.c || 0;
  }
  const finalCardDesc = description
    || `${questionCount} question${questionCount !== 1 ? 's' : ''} · Anonymous & verifiable`;

  const record: Record<string, unknown> = {
    $type: 'app.bsky.feed.post',
    text: postText,
    facets,
    embed: {
      $type: 'app.bsky.embed.external',
      external: {
        uri: surveyUrl,
        title,
        description: finalCardDesc,
        ...(thumbBlob ? { thumb: thumbBlob } : {}),
      },
    },
    createdAt: new Date().toISOString(),
  };

  const createRecordUrl = `${pdsAuth.pdsUrl}/xrpc/com.atproto.repo.createRecord`;
  const requestBody = JSON.stringify({
    repo: pdsAuth.did,
    collection: 'app.bsky.feed.post',
    record,
  });

  let createRes: Response;
  if (pdsAuth.authMethod === 'oauth' && pdsAuth.dpopKeyPair) {
    let dpopProof = await createDPoPProof(pdsAuth.dpopKeyPair, 'POST', createRecordUrl, undefined, pdsAuth.accessJwt);
    createRes = await fetch(createRecordUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `DPoP ${pdsAuth.accessJwt}`, 'DPoP': dpopProof },
      body: requestBody,
    });
    if (createRes.status === 401 || createRes.status === 400) {
      const nonce = createRes.headers.get('DPoP-Nonce');
      if (nonce) {
        dpopProof = await createDPoPProof(pdsAuth.dpopKeyPair, 'POST', createRecordUrl, nonce, pdsAuth.accessJwt);
        createRes = await fetch(createRecordUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `DPoP ${pdsAuth.accessJwt}`, 'DPoP': dpopProof },
          body: requestBody,
        });
      }
    }
  } else {
    createRes = await fetch(createRecordUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pdsAuth.accessJwt}` },
      body: requestBody,
    });
  }

  if (!createRes.ok) {
    const err = await createRes.text();
    return jsonResponse({ error: `Failed to post: ${err}` }, 500);
  }

  const result = await createRes.json() as { uri: string; cid: string };

  // Store the Bluesky post reference
  await env.DB.prepare('UPDATE surveys SET bluesky_post_uri = ?, bluesky_post_cid = ? WHERE id = ?')
    .bind(result.uri, result.cid, surveyId).run();

  return jsonResponse({ uri: result.uri, cid: result.cid });
}

/**
 * Generate an OG image for survey link cards.
 * Big block letters of the survey title — branding-first, not data-centric.
 */
async function generateSurveyOgImage(env: Env, surveyId: string): Promise<Response> {
  const survey = await env.DB.prepare('SELECT title, description, status FROM surveys WHERE id = ?').bind(surveyId).first();
  if (!survey) return new Response('Not found', { status: 404 });

  const title = survey.title as string;
  const status = survey.status as string;

  const W = 1200;
  const H = 630;
  const PAD = 80;

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Word-wrap title into lines that fit the card width
  // At ~48px font, roughly 25 chars per line at 1200px with 80px padding each side
  const maxCharsPerLine = 28;
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && (current.length + 1 + word.length) > maxCharsPerLine) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  // Cap at 5 lines
  if (lines.length > 5) {
    lines.length = 5;
    lines[4] = lines[4].slice(0, maxCharsPerLine - 3) + '...';
  }

  const fontSize = lines.length <= 2 ? 64 : lines.length <= 3 ? 52 : 44;
  const lineHeight = fontSize * 1.25;
  const totalTextHeight = lines.length * lineHeight;
  const textStartY = Math.max(PAD + 60, (H - totalTextHeight) / 2 + fontSize * 0.35);

  const titleLines = lines.map((line, i) =>
    `<text x="${PAD}" y="${textStartY + i * lineHeight}" fill="#f0f0f0" font-size="${fontSize}" font-family="Roboto Mono, monospace" font-weight="bold">${esc(line)}</text>`
  ).join('\n  ');

  const statusLabel = status === 'open' ? 'OPEN' : status === 'closed' ? 'CLOSED' : status.toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#1a1a1a"/>
  <rect x="0" y="0" width="${W}" height="6" fill="#c41230"/>
  <rect x="0" y="${H - 6}" width="${W}" height="6" fill="#c41230"/>

  <!-- Branding top-left -->
  <text x="${PAD}" y="44" fill="#c41230" font-size="18" font-family="Roboto Mono, monospace" font-weight="bold">ATPOLLS</text>
  <text x="${PAD + 130}" y="44" fill="#555" font-size="18" font-family="Roboto Mono, monospace">SURVEY · ${statusLabel}</text>

  <!-- Title in big block letters -->
  ${titleLines}

  <!-- Footer -->
  <text x="${PAD}" y="${H - 30}" fill="#555" font-size="16" font-family="Roboto Mono, monospace">poll.mino.mobi · anonymous & verifiable</text>
</svg>`;

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
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' },
    });
  } catch (e) {
    console.error('resvg PNG conversion failed for survey, serving SVG fallback:', e);
    return new Response(svg, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60' },
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

async function fetchAtprotoList(listUri: string): Promise<string[]> {
  const dids: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
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
