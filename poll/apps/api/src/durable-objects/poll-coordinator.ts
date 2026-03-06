/**
 * PollCoordinator — Durable Object for serialized poll state management.
 *
 * One instance per poll. All write operations are serialized through this DO.
 * It is the authoritative write path for eligibility, ballots, tally, and audit.
 *
 * D1 is used for durable persistence and queryability.
 * The DO is the live coordinator ensuring atomicity and ordering.
 */

import {
  issueCredential,
  verifyCredential,
  deriveTokenMessage,
  deriveNullifier,
  generateSecret,
  makeReceipt,
  computeAuditHash,
  recomputeTally,
  blindSign,
  verifyRSACredential,
  importRSAPrivateKey,
  importRSAPublicKey,
} from '@anon-polls/shared';

import type {
  Poll,
  Ballot,
  PublicBallot,
  TallySnapshot,
  AuditEvent,
  EligibilityResponse,
  BallotSubmission,
  BallotResponse,
} from '@anon-polls/shared';

interface PollState {
  poll: Poll | null;
  signingKey: string;
  ballotCount: number;
  lastAuditHash: string;
  tally: Record<string, number>;
  nullifiers: Set<string>;
  consumedDids: Set<string>;
}

export class PollCoordinator implements DurableObject {
  private state: DurableObjectState;
  private env: any;
  private pollState: PollState | null = null;
  private rsaPrivateKey: CryptoKey | null = null;
  private rsaPublicKey: CryptoKey | null = null;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  /** Lazily import and cache the RSA key pair from env secrets */
  private async getRSAPrivateKey(): Promise<CryptoKey> {
    if (this.rsaPrivateKey) return this.rsaPrivateKey;
    const jwkStr = this.env.RSA_PRIVATE_KEY_JWK;
    if (!jwkStr) throw new Error('RSA_PRIVATE_KEY_JWK not configured');
    this.rsaPrivateKey = await importRSAPrivateKey(JSON.parse(jwkStr));
    return this.rsaPrivateKey;
  }

  private async getRSAPublicKey(): Promise<CryptoKey> {
    if (this.rsaPublicKey) return this.rsaPublicKey;
    const jwkStr = this.env.RSA_PUBLIC_KEY_JWK;
    if (!jwkStr) throw new Error('RSA_PUBLIC_KEY_JWK not configured');
    this.rsaPublicKey = await importRSAPublicKey(JSON.parse(jwkStr));
    return this.rsaPublicKey;
  }

  private async loadState(): Promise<PollState> {
    if (this.pollState) return this.pollState;

    const stored = await this.state.storage.get<PollState>('pollState');
    if (stored) {
      // Restore Set objects (they get serialized as arrays)
      stored.nullifiers = new Set(stored.nullifiers);
      stored.consumedDids = new Set(stored.consumedDids);
      this.pollState = stored;
      return stored;
    }

    this.pollState = {
      poll: null,
      signingKey: '',
      ballotCount: 0,
      lastAuditHash: '0'.repeat(64),
      tally: {},
      nullifiers: new Set(),
      consumedDids: new Set(),
    };
    return this.pollState;
  }

  private async saveState(): Promise<void> {
    if (!this.pollState) return;
    // Convert Sets to arrays for serialization
    const toStore = {
      ...this.pollState,
      nullifiers: new Set(this.pollState.nullifiers),
      consumedDids: new Set(this.pollState.consumedDids),
    };
    await this.state.storage.put('pollState', toStore);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === 'POST' && path === '/initialize') {
        return this.handleInitialize(request);
      }
      if (request.method === 'POST' && path === '/open') {
        return this.handleOpen();
      }
      if (request.method === 'POST' && path === '/close') {
        return this.handleClose();
      }
      if (request.method === 'POST' && path === '/finalize') {
        return this.handleFinalize();
      }
      if (request.method === 'POST' && path === '/eligibility') {
        return this.handleEligibility(request);
      }
      if (request.method === 'POST' && path === '/ballot') {
        return this.handleBallot(request);
      }
      if (request.method === 'GET' && path === '/poll') {
        return this.handleGetPoll();
      }
      if (request.method === 'GET' && path === '/tally') {
        return this.handleGetTally();
      }
      if (request.method === 'GET' && path === '/ballots') {
        return this.handleGetBallots();
      }
      if (request.method === 'GET' && path === '/audit') {
        return this.handleGetAudit();
      }
      return new Response('Not found', { status: 404 });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async handleInitialize(request: Request): Promise<Response> {
    const poll = await request.json() as Poll & { signingKey: string };
    const signingKey = poll.signingKey;

    const state = await this.loadState();
    if (state.poll) {
      return jsonResponse({ error: 'Poll already initialized' }, 409);
    }

    const { signingKey: _, ...pollData } = poll;
    state.poll = pollData;
    state.signingKey = signingKey;
    state.tally = {};
    for (let i = 0; i < pollData.options.length; i++) {
      state.tally[String(i)] = 0;
    }

    await this.appendAudit('poll_initialized', JSON.stringify({ pollId: pollData.id }));
    await this.saveState();

    return jsonResponse({ success: true });
  }

  private async handleOpen(): Promise<Response> {
    const state = await this.loadState();
    if (!state.poll) return jsonResponse({ error: 'Poll not found' }, 404);
    if (state.poll.status !== 'draft') {
      return jsonResponse({ error: `Cannot open poll in status: ${state.poll.status}` }, 400);
    }

    state.poll.status = 'open';
    await this.appendAudit('poll_opened', JSON.stringify({ pollId: state.poll.id }));
    await this.saveState();

    // Sync to D1
    await this.env.DB.prepare('UPDATE polls SET status = ? WHERE id = ?')
      .bind('open', state.poll.id).run();

    return jsonResponse({ success: true, status: 'open' });
  }

  private async handleClose(): Promise<Response> {
    const state = await this.loadState();
    if (!state.poll) return jsonResponse({ error: 'Poll not found' }, 404);
    if (state.poll.status !== 'open') {
      return jsonResponse({ error: `Cannot close poll in status: ${state.poll.status}` }, 400);
    }

    state.poll.status = 'closed';
    await this.appendAudit('poll_closed', JSON.stringify({ pollId: state.poll.id }));
    await this.saveState();

    await this.env.DB.prepare('UPDATE polls SET status = ? WHERE id = ?')
      .bind('closed', state.poll.id).run();

    return jsonResponse({ success: true, status: 'closed' });
  }

  private async handleFinalize(): Promise<Response> {
    const state = await this.loadState();
    if (!state.poll) return jsonResponse({ error: 'Poll not found' }, 404);
    if (state.poll.status !== 'closed') {
      return jsonResponse({ error: `Cannot finalize poll in status: ${state.poll.status}. Must be closed first.` }, 400);
    }

    state.poll.status = 'finalized';
    await this.appendAudit('poll_finalized', JSON.stringify({ pollId: state.poll.id }));
    await this.saveState();

    await this.env.DB.prepare('UPDATE polls SET status = ? WHERE id = ?')
      .bind('finalized', state.poll.id).run();

    return jsonResponse({ success: true, status: 'finalized' });
  }

  /**
   * Eligibility check and credential issuance.
   *
   * Mode A (trusted_host_v1):
   * - Host generates secret, tokenMessage, signature, and nullifier
   * - Host knows the link between DID and credential (privacy tradeoff)
   *
   * Mode B (anon_credential_v2):
   * - Responder would send a blinded message
   * - Host signs it blindly (stubbed)
   * - Host never learns the token message
   */
  private async handleEligibility(request: Request): Promise<Response> {
    const { responderDid, blindedMessage } = await request.json() as {
      responderDid: string;
      blindedMessage?: string;
    };

    const state = await this.loadState();
    if (!state.poll) return jsonResponse({ error: 'Poll not found' }, 404);
    if (state.poll.status !== 'open') {
      return jsonResponse({ error: 'Poll is not open' }, 403);
    }

    // Check eligibility whitelist (if not open mode)
    if (state.poll.eligibilityMode && state.poll.eligibilityMode !== 'open') {
      const eligible = await this.env.DB.prepare(
        'SELECT 1 FROM poll_eligible_dids WHERE poll_id = ? AND did = ?'
      ).bind(state.poll.id, responderDid).first();
      if (!eligible) {
        return jsonResponse({ eligible: false, error: 'Not in eligible voter list' }, 403);
      }
    }

    // Check if DID has already consumed eligibility
    if (state.consumedDids.has(responderDid)) {
      return jsonResponse({ eligible: false, error: 'Already voted' }, 403);
    }

    const now = new Date().toISOString();
    if (now < state.poll.opensAt || now > state.poll.closesAt) {
      return jsonResponse({ eligible: false, error: 'Outside voting window' }, 403);
    }

    // Mark DID as consumed BEFORE issuing credential (atomic within DO)
    state.consumedDids.add(responderDid);

    let response: EligibilityResponse;

    if (state.poll.mode === 'anon_credential_v2') {
      // v2: RSA Blind Signature — host signs blinded message without seeing the original
      if (!blindedMessage) {
        state.consumedDids.delete(responderDid);
        return jsonResponse({ eligible: false, error: 'Blinded message required for v2 mode' }, 400);
      }
      try {
        const privateKey = await this.getRSAPrivateKey();
        // CF Workers support supportsRSARAW for optimized blind signing
        const blindedSig = await blindSign(blindedMessage, privateKey, true);
        response = {
          eligible: true,
          blindedSignature: blindedSig,
        };
      } catch (err: any) {
        state.consumedDids.delete(responderDid);
        return jsonResponse({ eligible: false, error: `Blind signing failed: ${err.message}` }, 500);
      }
    } else {
      // v1: trusted host issues full credential (host sees everything)
      const secret = generateSecret();
      const tokenMessage = await deriveTokenMessage(state.poll.id, secret, state.poll.closesAt);
      const sig = await issueCredential(state.signingKey, tokenMessage);
      const nullifier = await deriveNullifier(secret, state.poll.id);
      const receiptHash = await makeReceipt(state.poll.id, tokenMessage, nullifier);

      response = {
        eligible: true,
        credential: { tokenMessage, issuerSignature: sig, secret, nullifier },
        receiptHash,
      };
    }

    // Persist eligibility to D1
    await this.env.DB.prepare(
      `INSERT INTO eligibility (poll_id, responder_did, eligibility_status, consumed_at, issuance_mode, receipt_hash)
       VALUES (?, ?, 'consumed', ?, ?, NULL)`
    ).bind(
      state.poll.id,
      responderDid,
      now,
      state.poll.mode
    ).run();

    await this.appendAudit('eligibility_consumed', JSON.stringify({
      pollId: state.poll.id,
      receiptHash: response.receiptHash || null,
    }));
    await this.saveState();

    return jsonResponse(response);
  }

  /**
   * Ballot submission — anonymous.
   *
   * The ballot contains: choice, tokenMessage, issuerSignature, nullifier.
   * No responder DID. The host verifies the signature and nullifier uniqueness.
   */
  private async handleBallot(request: Request): Promise<Response> {
    const submission = await request.json() as BallotSubmission;

    const state = await this.loadState();
    if (!state.poll) return jsonResponse({ error: 'Poll not found' }, 404);
    if (state.poll.status !== 'open') {
      return jsonResponse({ accepted: false, rejectionReason: 'Poll is not open' }, 403);
    }

    // Validate choice
    if (submission.choice < 0 || submission.choice >= state.poll.options.length) {
      return jsonResponse({ accepted: false, rejectionReason: 'Invalid choice' }, 400);
    }

    // Verify credential signature (v1: HMAC, v2: RSA-PSS)
    let sigValid: boolean;
    if (state.poll.mode === 'anon_credential_v2') {
      const publicKey = await this.getRSAPublicKey();
      sigValid = await verifyRSACredential(
        submission.tokenMessage,
        submission.issuerSignature,
        publicKey,
        true // supportsRSARAW on CF Workers
      );
    } else {
      sigValid = await verifyCredential(
        state.signingKey,
        submission.tokenMessage,
        submission.issuerSignature
      );
    }
    if (!sigValid) {
      return jsonResponse({ accepted: false, rejectionReason: 'Invalid credential signature' }, 403);
    }

    // Check nullifier uniqueness (replay prevention)
    if (state.nullifiers.has(submission.nullifier)) {
      return jsonResponse({ accepted: false, rejectionReason: 'Nullifier already used' }, 403);
    }

    // Accept ballot atomically
    state.nullifiers.add(submission.nullifier);
    state.ballotCount++;
    state.tally[String(submission.choice)] = (state.tally[String(submission.choice)] || 0) + 1;

    const ballotId = crypto.randomUUID();
    const now = new Date().toISOString();

    const auditPayload = JSON.stringify({
      ballotId,
      pollId: state.poll.id,
      choice: submission.choice,
      nullifier: submission.nullifier,
      tokenMessage: submission.tokenMessage,
    });
    const rollingHash = await this.appendAudit('ballot_accepted', auditPayload);

    // Persist ballot to D1
    await this.env.DB.prepare(
      `INSERT INTO ballots (ballot_id, poll_id, public_ballot_serial, nullifier, choice,
        token_message, issuer_signature, credential_proof, accepted, submitted_at, rolling_audit_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).bind(
      ballotId,
      state.poll.id,
      state.ballotCount,
      submission.nullifier,
      submission.choice,
      submission.tokenMessage,
      submission.issuerSignature,
      submission.credentialProof || null,
      now,
      rollingHash
    ).run();

    // Update tally snapshot in D1
    await this.env.DB.prepare(
      `INSERT OR REPLACE INTO tally_snapshots (poll_id, counts_by_option, ballot_count, computed_at, final)
       VALUES (?, ?, ?, ?, 0)`
    ).bind(
      state.poll.id,
      JSON.stringify(state.tally),
      state.ballotCount,
      now
    ).run();

    await this.saveState();

    const response: BallotResponse = {
      accepted: true,
      ballotId,
      publicSerial: state.ballotCount,
    };
    return jsonResponse(response);
  }

  private async handleGetPoll(): Promise<Response> {
    const state = await this.loadState();
    if (!state.poll) return jsonResponse({ error: 'Poll not found' }, 404);
    return jsonResponse(state.poll);
  }

  private async handleGetTally(): Promise<Response> {
    const state = await this.loadState();
    if (!state.poll) return jsonResponse({ error: 'Poll not found' }, 404);

    const tally: TallySnapshot = {
      pollId: state.poll.id,
      countsByOption: { ...state.tally },
      ballotCount: state.ballotCount,
      computedAt: new Date().toISOString(),
      final: state.poll.status === 'closed' || state.poll.status === 'finalized',
    };
    return jsonResponse(tally);
  }

  private async handleGetBallots(): Promise<Response> {
    const state = await this.loadState();
    if (!state.poll) return jsonResponse({ error: 'Poll not found' }, 404);

    // Fetch from D1 — only public-safe fields
    const result = await this.env.DB.prepare(
      `SELECT ballot_id, poll_id, public_ballot_serial, nullifier, choice,
              token_message, issuer_signature, accepted, submitted_at, rolling_audit_hash
       FROM ballots WHERE poll_id = ? AND accepted = 1 ORDER BY public_ballot_serial`
    ).bind(state.poll.id).all();

    const ballots: PublicBallot[] = (result.results || []).map((row: any) => ({
      poll_id: row.poll_id,
      option: row.choice,
      token_message: row.token_message,
      issuer_signature: row.issuer_signature,
      nullifier: row.nullifier,
      submitted_at: row.submitted_at,
      ballot_version: 1,
      public_serial: row.public_ballot_serial,
    }));

    return jsonResponse({ ballots });
  }

  private async handleGetAudit(): Promise<Response> {
    const state = await this.loadState();
    if (!state.poll) return jsonResponse({ error: 'Poll not found' }, 404);

    const result = await this.env.DB.prepare(
      'SELECT * FROM audit_events WHERE poll_id = ? ORDER BY created_at'
    ).bind(state.poll.id).all();

    return jsonResponse({ events: result.results || [] });
  }

  private async appendAudit(eventType: string, payload: string): Promise<string> {
    const state = await this.loadState();
    const rollingHash = await computeAuditHash(state.lastAuditHash, eventType, payload);
    state.lastAuditHash = rollingHash;

    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.env.DB.prepare(
      `INSERT INTO audit_events (id, poll_id, event_type, event_payload, rolling_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      eventId,
      state.poll?.id || 'system',
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
