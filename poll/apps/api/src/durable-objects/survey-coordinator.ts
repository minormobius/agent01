/**
 * SurveyCoordinator — Durable Object for serialized survey state management.
 *
 * One instance per survey. All write operations are serialized through this DO.
 * Mirrors PollCoordinator but handles multi-question ballots (choices: number[]).
 *
 * Credential system is identical to polls — one blind-signed credential per voter
 * per survey. The token message uses the survey ID for poll binding.
 */

import {
  computeAuditHash,
  computeBallotCommitment,
  blindSign,
  verifyRSACredential,
  importRSAPrivateKey,
  importRSAPublicKey,
  parseTokenMessage,
  deriveNullifier,
  PdsPublisher,
  MockPublisher,
} from '@atpolls/shared';

import type {
  Survey,
  SurveyQuestion,
  SurveyBallotSubmission,
  SurveyBallotResponse,
  SurveyTallySnapshot,
  EligibilityResponse,
} from '@atpolls/shared';

interface SurveyState {
  survey: Survey | null;
  ballotCount: number;
  lastAuditHash: string;
  // tally[questionIndex][optionIndex] = count
  tally: Record<string, Record<string, number>>;
  nullifiers: Set<string>;
  consumedDids: Set<string>;
}

export class SurveyCoordinator implements DurableObject {
  private state: DurableObjectState;
  private env: any;
  private surveyState: SurveyState | null = null;
  private rsaPrivateKey: CryptoKey | null = null;
  private rsaPublicKey: CryptoKey | null = null;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  private async getRSAPrivateKey(): Promise<CryptoKey> {
    if (this.rsaPrivateKey) return this.rsaPrivateKey;
    const jwkStr = this.env.RSA_PRIVATE_KEY_JWK;
    if (!jwkStr) throw new Error('RSA_PRIVATE_KEY_JWK not configured');
    let jwk: JsonWebKey;
    try { jwk = JSON.parse(jwkStr); } catch {
      throw new Error('RSA_PRIVATE_KEY_JWK is not valid JSON');
    }
    this.rsaPrivateKey = await importRSAPrivateKey(jwk);
    return this.rsaPrivateKey;
  }

  private async getRSAPublicKey(): Promise<CryptoKey> {
    if (this.rsaPublicKey) return this.rsaPublicKey;
    const jwkStr = this.env.RSA_PUBLIC_KEY_JWK;
    if (!jwkStr) throw new Error('RSA_PUBLIC_KEY_JWK not configured');
    let jwk: JsonWebKey;
    try { jwk = JSON.parse(jwkStr); } catch {
      throw new Error('RSA_PUBLIC_KEY_JWK is not valid JSON');
    }
    this.rsaPublicKey = await importRSAPublicKey(jwk);
    return this.rsaPublicKey;
  }

  private async loadState(): Promise<SurveyState> {
    if (this.surveyState) return this.surveyState;

    const stored = await this.state.storage.get<SurveyState>('surveyState');
    if (stored) {
      stored.nullifiers = new Set(stored.nullifiers);
      stored.consumedDids = new Set(stored.consumedDids);
      this.surveyState = stored;
      return stored;
    }

    this.surveyState = {
      survey: null,
      ballotCount: 0,
      lastAuditHash: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
      tally: {},
      nullifiers: new Set(),
      consumedDids: new Set(),
    };
    return this.surveyState;
  }

  private async saveState(): Promise<void> {
    if (!this.surveyState) return;
    const toStore = {
      ...this.surveyState,
      nullifiers: new Set(this.surveyState.nullifiers),
      consumedDids: new Set(this.surveyState.consumedDids),
    };
    await this.state.storage.put('surveyState', toStore);
  }

  async alarm(): Promise<void> {
    const state = await this.loadState();
    if (!state.survey) return;
    if (state.survey.status !== 'open') return;

    console.log(`Alarm fired: auto-closing survey ${state.survey.id}`);
    await this.closeSurvey(state);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === 'POST' && path === '/initialize') return this.handleInitialize(request);
      if (request.method === 'POST' && path === '/open') return this.handleOpen();
      if (request.method === 'POST' && path === '/close') return this.handleClose();
      if (request.method === 'POST' && path === '/finalize') return this.handleFinalize();
      if (request.method === 'POST' && path === '/eligibility') return this.handleEligibility(request);
      if (request.method === 'POST' && path === '/ballot') return this.handleBallot(request);
      if (request.method === 'GET' && path === '/survey') return this.handleGetSurvey();
      if (request.method === 'GET' && path === '/tally') return this.handleGetTally();
      if (request.method === 'GET' && path === '/ballots') return this.handleGetBallots();
      if (request.method === 'GET' && path === '/audit') return this.handleGetAudit();
      return new Response('Not found', { status: 404 });
    } catch (err: any) {
      console.error('SurveyCoordinator error:', err);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async handleInitialize(request: Request): Promise<Response> {
    const surveyData = await request.json() as Survey;

    const state = await this.loadState();
    if (state.survey) {
      return jsonResponse({ error: 'Survey already initialized' }, 409);
    }

    state.survey = surveyData;
    state.tally = {};
    for (let q = 0; q < surveyData.questions.length; q++) {
      state.tally[String(q)] = {};
      for (let o = 0; o < surveyData.questions[q].options.length; o++) {
        state.tally[String(q)][String(o)] = 0;
      }
    }

    await this.appendAudit('survey_initialized', JSON.stringify({ surveyId: surveyData.id }));
    await this.saveState();

    return jsonResponse({ success: true });
  }

  private async handleOpen(): Promise<Response> {
    const state = await this.loadState();
    if (!state.survey) return jsonResponse({ error: 'Survey not found' }, 404);
    if (state.survey.status !== 'draft') {
      return jsonResponse({ error: `Cannot open survey in status: ${state.survey.status}` }, 400);
    }

    state.survey.status = 'open';
    await this.appendAudit('survey_opened', JSON.stringify({ surveyId: state.survey.id }));
    await this.saveState();

    await this.env.DB.prepare('UPDATE surveys SET status = ? WHERE id = ?')
      .bind('open', state.survey.id).run();

    if (state.survey.closesAt) {
      const closeTime = new Date(state.survey.closesAt).getTime();
      if (closeTime > Date.now()) {
        await this.state.storage.setAlarm(closeTime);
      }
    }

    return jsonResponse({ success: true, status: 'open' });
  }

  private async handleClose(): Promise<Response> {
    const state = await this.loadState();
    if (!state.survey) return jsonResponse({ error: 'Survey not found' }, 404);
    if (state.survey.status !== 'open') {
      return jsonResponse({ error: `Cannot close survey in status: ${state.survey.status}` }, 400);
    }

    await this.closeSurvey(state);
    return jsonResponse({ success: true, status: 'closed' });
  }

  private async closeSurvey(state: SurveyState): Promise<void> {
    if (!state.survey) return;

    state.survey.status = 'closed';
    await this.appendAudit('survey_closed', JSON.stringify({ surveyId: state.survey.id }));
    await this.saveState();

    await this.env.DB.prepare('UPDATE surveys SET status = ? WHERE id = ?')
      .bind('closed', state.survey.id).run();

    await this.state.storage.deleteAlarm();

    try {
      await this.runPostCloseHooks(state);
    } catch (err) {
      console.error('Post-close hooks failed for survey:', state.survey.id, err);
      await this.appendAudit('post_close_hooks_failed', JSON.stringify({
        surveyId: state.survey.id,
        error: String(err),
      }));
      await this.saveState();
    }
  }

  private async runPostCloseHooks(state: SurveyState): Promise<void> {
    if (!state.survey) return;
    const surveyId = state.survey.id;
    const publisher = this.getPublisher();

    // Publish shuffled ballots to ATProto
    const rows = await this.env.DB.prepare(
      'SELECT ballot_id, choices, token_message, issuer_signature, nullifier, public_ballot_serial FROM survey_ballots WHERE survey_id = ? AND published_record_uri IS NULL'
    ).bind(surveyId).all();
    const ballots = rows.results as any[];

    if (ballots.length > 0) {
      // Fisher-Yates shuffle
      for (let i = ballots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ballots[i], ballots[j]] = [ballots[j], ballots[i]];
      }

      let published = 0;
      for (const b of ballots) {
        try {
          const record = {
            $type: 'com.minomobi.poll.ballot' as const,
            pollId: surveyId,
            option: -1,  // Multi-question — see choices field
            tokenMessage: b.token_message,
            issuerSignature: b.issuer_signature,
            nullifier: b.nullifier,
            ballotVersion: 2,
            publicSerial: b.public_ballot_serial,
            choices: JSON.parse(b.choices),
          };
          const result = await publisher.createRecord(
            'com.minomobi.poll.ballot',
            `ballot-${(b.ballot_id as string).replace(/-/g, '')}`,
            record
          );
          await this.env.DB.prepare(
            'UPDATE survey_ballots SET published_record_uri = ? WHERE ballot_id = ?'
          ).bind(result.uri, b.ballot_id).run();
          published++;
        } catch (err) {
          console.error(`Failed to publish survey ballot ${b.ballot_id}:`, err);
        }
      }

      await this.appendAudit('ballots_published_on_close', JSON.stringify({
        surveyId, published, total: ballots.length,
      }));
      await this.saveState();
    }

    // Update D1 tally as final
    await this.env.DB.prepare(
      `INSERT OR REPLACE INTO survey_tally_snapshots (survey_id, counts_by_question, ballot_count, computed_at, final)
       VALUES (?, ?, ?, ?, 1)`
    ).bind(surveyId, JSON.stringify(state.tally), state.ballotCount, new Date().toISOString()).run();

    // Publish final tally to ATProto
    const tallyRecord = {
      $type: 'com.minomobi.poll.tally' as const,
      pollId: surveyId,
      countsByOption: state.tally,
      ballotCount: state.ballotCount,
      computedAt: new Date().toISOString(),
      final: true,
    };
    const tallyResult = await publisher.createRecord(
      'com.minomobi.poll.tally',
      `tally-${surveyId.replace(/-/g, '')}`,
      tallyRecord
    );
    await this.appendAudit('tally_published_on_close', JSON.stringify({ surveyId, uri: tallyResult.uri }));

    // Finalize
    state.survey.status = 'finalized';
    await this.appendAudit('survey_finalized', JSON.stringify({ surveyId, auto: true }));
    await this.saveState();

    await this.env.DB.prepare('UPDATE surveys SET status = ? WHERE id = ?')
      .bind('finalized', surveyId).run();
  }

  private getPublisher() {
    if (this.env.ATPROTO_MOCK_MODE === 'true' || !this.env.ATPROTO_SERVICE_HANDLE) {
      return new MockPublisher();
    }
    return new PdsPublisher({
      serviceUrl: this.env.ATPROTO_SERVICE_PDS || 'https://bsky.social',
      handle: this.env.ATPROTO_SERVICE_HANDLE,
      password: this.env.ATPROTO_SERVICE_PASSWORD || '',
      did: this.env.ATPROTO_SERVICE_DID || '',
    });
  }

  private async handleFinalize(): Promise<Response> {
    const state = await this.loadState();
    if (!state.survey) return jsonResponse({ error: 'Survey not found' }, 404);
    if (state.survey.status !== 'closed') {
      return jsonResponse({ error: `Cannot finalize survey in status: ${state.survey.status}. Must be closed first.` }, 400);
    }

    state.survey.status = 'finalized';
    await this.appendAudit('survey_finalized', JSON.stringify({ surveyId: state.survey.id }));
    await this.saveState();

    await this.env.DB.prepare('UPDATE surveys SET status = ? WHERE id = ?')
      .bind('finalized', state.survey.id).run();

    return jsonResponse({ success: true, status: 'finalized' });
  }

  private async handleEligibility(request: Request): Promise<Response> {
    const { responderDid, blindedMessage } = await request.json() as {
      responderDid: string;
      blindedMessage?: string;
    };

    const state = await this.loadState();
    if (!state.survey) return jsonResponse({ error: 'Survey not found' }, 404);
    if (state.survey.status !== 'open') {
      return jsonResponse({ error: 'Survey is not open' }, 403);
    }

    if (state.survey.eligibilityMode && state.survey.eligibilityMode !== 'open') {
      const eligible = await this.env.DB.prepare(
        'SELECT 1 FROM survey_eligible_dids WHERE survey_id = ? AND did = ?'
      ).bind(state.survey.id, responderDid).first();
      if (!eligible) {
        return jsonResponse({ eligible: false, error: 'Not in eligible voter list' }, 403);
      }
    }

    if (state.consumedDids.has(responderDid)) {
      return jsonResponse({ eligible: false, error: 'Already voted' }, 403);
    }

    const now = new Date().toISOString();
    if (now < state.survey.opensAt || now > state.survey.closesAt) {
      return jsonResponse({ eligible: false, error: 'Outside voting window' }, 403);
    }

    if (!blindedMessage) {
      return jsonResponse({ eligible: false, error: 'Blinded message required' }, 400);
    }

    // SECURITY: Persist consumedDid BEFORE blind signing (TOCTOU prevention)
    state.consumedDids.add(responderDid);
    await this.saveState();

    let response: EligibilityResponse;
    try {
      const privateKey = await this.getRSAPrivateKey();
      const blindedSig = await blindSign(blindedMessage, privateKey, true);
      response = {
        eligible: true,
        blindedSignature: blindedSig,
      };
    } catch (err: any) {
      console.error('Blind signing failed for survey:', state.survey?.id, err);
      return jsonResponse({ eligible: false, error: 'Credential issuance failed' }, 500);
    }

    await this.env.DB.prepare(
      `INSERT INTO survey_eligibility (survey_id, responder_did, eligibility_status, consumed_at)
       VALUES (?, ?, 'consumed', ?)`
    ).bind(state.survey.id, responderDid, now).run();

    await this.appendAudit('eligibility_consumed', JSON.stringify({
      surveyId: state.survey.id,
    }));
    await this.saveState();

    return jsonResponse(response);
  }

  /**
   * Ballot submission — anonymous, multi-question.
   *
   * choices: number[] — one per question, in order.
   * -1 means skipped (only allowed for non-required questions).
   */
  private async handleBallot(request: Request): Promise<Response> {
    const submission = await request.json() as SurveyBallotSubmission;

    const state = await this.loadState();
    if (!state.survey) return jsonResponse({ error: 'Survey not found' }, 404);
    if (state.survey.status !== 'open') {
      return jsonResponse({ accepted: false, rejectionReason: 'Survey is not open' }, 403);
    }

    // Validate choices array length
    if (submission.choices.length !== state.survey.questions.length) {
      return jsonResponse({
        accepted: false,
        rejectionReason: `Expected ${state.survey.questions.length} choices, got ${submission.choices.length}`,
      }, 400);
    }

    // Validate each choice based on question type
    for (let i = 0; i < submission.choices.length; i++) {
      const q = state.survey.questions[i];
      const choice = submission.choices[i];
      const qType = (q as any).questionType || 'single_choice';

      if (qType === 'ranking') {
        // Ranking: choice must be an array that is a permutation of [0..N-1]
        if (!Array.isArray(choice)) {
          if (choice === -1 && !q.required) continue; // skipped optional
          return jsonResponse({
            accepted: false,
            rejectionReason: `Question ${i + 1} (ranking) requires an array of indices`,
          }, 400);
        }
        const arr = choice as number[];
        if (arr.length !== q.options.length) {
          return jsonResponse({
            accepted: false,
            rejectionReason: `Question ${i + 1} (ranking) must rank all ${q.options.length} options`,
          }, 400);
        }
        const sorted = [...arr].sort((a, b) => a - b);
        for (let j = 0; j < sorted.length; j++) {
          if (sorted[j] !== j) {
            return jsonResponse({
              accepted: false,
              rejectionReason: `Question ${i + 1} (ranking) must be a permutation of [0..${q.options.length - 1}]`,
            }, 400);
          }
        }
      } else {
        // Single choice
        if (choice === -1) {
          if (q.required) {
            return jsonResponse({
              accepted: false,
              rejectionReason: `Question ${i + 1} is required`,
            }, 400);
          }
          continue;
        }
        if (typeof choice !== 'number' || choice < 0 || choice >= q.options.length) {
          return jsonResponse({
            accepted: false,
            rejectionReason: `Invalid choice ${choice} for question ${i + 1} (${q.options.length} options)`,
          }, 400);
        }
      }
    }

    // Verify tokenMessage is bound to this survey
    let parsedToken;
    try {
      parsedToken = parseTokenMessage(submission.tokenMessage);
    } catch {
      return jsonResponse({ accepted: false, rejectionReason: 'Malformed token message' }, 400);
    }
    if (parsedToken.pollId !== state.survey.id) {
      return jsonResponse({ accepted: false, rejectionReason: 'Token not issued for this survey' }, 403);
    }

    // Verify RSA-PSS credential signature
    const publicKey = await this.getRSAPublicKey();
    const sigValid = await verifyRSACredential(
      submission.tokenMessage,
      submission.issuerSignature,
      publicKey,
      true
    );
    if (!sigValid) {
      return jsonResponse({ accepted: false, rejectionReason: 'Invalid credential signature' }, 403);
    }

    // Verify nullifier binding
    const expectedNullifier = await deriveNullifier(submission.tokenMessage);
    if (submission.nullifier !== expectedNullifier) {
      return jsonResponse({ accepted: false, rejectionReason: 'Invalid nullifier — must be derived from token' }, 403);
    }

    // Check nullifier uniqueness
    if (state.nullifiers.has(submission.nullifier)) {
      return jsonResponse({ accepted: false, rejectionReason: 'Nullifier already used' }, 403);
    }

    // Accept ballot atomically
    state.nullifiers.add(submission.nullifier);
    state.ballotCount++;

    // Update per-question tally
    for (let i = 0; i < submission.choices.length; i++) {
      const choice = submission.choices[i];
      const qType = ((state.survey.questions[i] as any).questionType) || 'single_choice';
      if (!state.tally[String(i)]) state.tally[String(i)] = {};

      if (qType === 'ranking' && Array.isArray(choice)) {
        // Borda count: position 0 (first place) gets N-1 points, last gets 0
        const n = (choice as number[]).length;
        for (let rank = 0; rank < n; rank++) {
          const optionIdx = (choice as number[])[rank];
          const bordaScore = n - 1 - rank;
          state.tally[String(i)][String(optionIdx)] = (state.tally[String(i)][String(optionIdx)] || 0) + bordaScore;
        }
      } else {
        // Single choice — count votes
        if (choice === -1) continue;
        state.tally[String(i)][String(choice)] = (state.tally[String(i)][String(choice)] || 0) + 1;
      }
    }

    const ballotId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Compute ballot commitment for audit (hides individual choices)
    const choicesStr = JSON.stringify(submission.choices);
    const ballotCommitment = await computeBallotCommitment(
      submission.tokenMessage, 0, submission.nullifier  // Use 0 as placeholder for multi-choice
    );
    const auditPayload = JSON.stringify({
      ballotId,
      surveyId: state.survey.id,
      ballotCommitment,
    });
    const rollingHash = await this.appendAudit('ballot_accepted', auditPayload);

    // Persist ballot to D1
    await this.env.DB.prepare(
      `INSERT INTO survey_ballots (ballot_id, survey_id, public_ballot_serial, nullifier, choices,
        token_message, issuer_signature, credential_proof, accepted, submitted_at, rolling_audit_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).bind(
      ballotId,
      state.survey.id,
      state.ballotCount,
      submission.nullifier,
      choicesStr,
      submission.tokenMessage,
      submission.issuerSignature,
      submission.credentialProof || null,
      now,
      rollingHash
    ).run();

    // Update tally snapshot
    await this.env.DB.prepare(
      `INSERT OR REPLACE INTO survey_tally_snapshots (survey_id, counts_by_question, ballot_count, computed_at, final)
       VALUES (?, ?, ?, ?, 0)`
    ).bind(
      state.survey.id,
      JSON.stringify(state.tally),
      state.ballotCount,
      now
    ).run();

    await this.saveState();

    const response: SurveyBallotResponse = {
      accepted: true,
      ballotId,
      publicSerial: state.ballotCount,
    };
    return jsonResponse(response);
  }

  private async handleGetSurvey(): Promise<Response> {
    const state = await this.loadState();
    if (!state.survey) return jsonResponse({ error: 'Survey not found' }, 404);
    return jsonResponse(state.survey);
  }

  private async handleGetTally(): Promise<Response> {
    const state = await this.loadState();
    if (!state.survey) return jsonResponse({ error: 'Survey not found' }, 404);

    const tally: SurveyTallySnapshot = {
      surveyId: state.survey.id,
      countsByQuestion: { ...state.tally },
      ballotCount: state.ballotCount,
      computedAt: new Date().toISOString(),
      final: state.survey.status === 'closed' || state.survey.status === 'finalized',
    };
    return jsonResponse(tally);
  }

  private async handleGetBallots(): Promise<Response> {
    const state = await this.loadState();
    if (!state.survey) return jsonResponse({ error: 'Survey not found' }, 404);

    const result = await this.env.DB.prepare(
      `SELECT ballot_id, survey_id, public_ballot_serial, nullifier, choices,
              token_message, issuer_signature, accepted, submitted_at, rolling_audit_hash
       FROM survey_ballots WHERE survey_id = ? AND accepted = 1 ORDER BY public_ballot_serial`
    ).bind(state.survey.id).all();

    const ballots = await Promise.all(
      (result.results || []).map(async (row: any) => ({
        survey_id: row.survey_id,
        choices: JSON.parse(row.choices),
        ballot_commitment: await computeBallotCommitment(
          row.token_message, 0, row.nullifier
        ),
        issuer_signature: row.issuer_signature,
        submitted_at: row.submitted_at,
        ballot_version: 2,
        public_serial: row.public_ballot_serial,
      }))
    );

    return jsonResponse({ ballots });
  }

  private async handleGetAudit(): Promise<Response> {
    const state = await this.loadState();
    if (!state.survey) return jsonResponse({ error: 'Survey not found' }, 404);

    const result = await this.env.DB.prepare(
      'SELECT * FROM survey_audit_events WHERE survey_id = ? ORDER BY created_at'
    ).bind(state.survey.id).all();

    return jsonResponse({ events: result.results || [] });
  }

  private async appendAudit(eventType: string, payload: string): Promise<string> {
    const state = await this.loadState();
    const rollingHash = await computeAuditHash(state.lastAuditHash, eventType, payload);
    state.lastAuditHash = rollingHash;

    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.env.DB.prepare(
      `INSERT INTO survey_audit_events (id, survey_id, event_type, event_payload, rolling_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      eventId,
      state.survey?.id || 'system',
      eventType,
      payload,
      rollingHash,
      now
    ).run();

    return rollingHash;
  }
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
