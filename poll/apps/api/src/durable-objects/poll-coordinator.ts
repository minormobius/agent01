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
  Poll,
  PublicBallot,
  TallySnapshot,
  EligibilityResponse,
  BallotSubmission,
  BallotResponse,
} from '@atpolls/shared';

interface PollState {
  poll: Poll | null;
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
    let jwk: JsonWebKey;
    try {
      jwk = JSON.parse(jwkStr);
    } catch {
      throw new Error('RSA_PRIVATE_KEY_JWK is not valid JSON — re-set the secret with a complete JWK');
    }
    this.rsaPrivateKey = await importRSAPrivateKey(jwk);
    return this.rsaPrivateKey;
  }

  private async getRSAPublicKey(): Promise<CryptoKey> {
    if (this.rsaPublicKey) return this.rsaPublicKey;
    const jwkStr = this.env.RSA_PUBLIC_KEY_JWK;
    if (!jwkStr) throw new Error('RSA_PUBLIC_KEY_JWK not configured');
    let jwk: JsonWebKey;
    try {
      jwk = JSON.parse(jwkStr);
    } catch {
      throw new Error('RSA_PUBLIC_KEY_JWK is not valid JSON — re-set the secret with a complete JWK');
    }
    this.rsaPublicKey = await importRSAPublicKey(jwk);
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
      ballotCount: 0,
      lastAuditHash: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
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

  /** Cloudflare DO alarm — fires at closes_at to auto-close the poll */
  async alarm(): Promise<void> {
    const state = await this.loadState();
    if (!state.poll) return;
    if (state.poll.status !== 'open') return; // Already closed/finalized

    console.log(`Alarm fired: auto-closing poll ${state.poll.id}`);
    await this.closePoll(state);
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
      if (request.method === 'POST' && path === '/sync-likes') {
        return this.handleSyncLikes(request);
      }
      return new Response('Not found', { status: 404 });
    } catch (err: any) {
      // SECURITY: Never leak internal error details to clients
      console.error('PollCoordinator error:', err);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async handleInitialize(request: Request): Promise<Response> {
    const pollData = await request.json() as Poll;

    const state = await this.loadState();
    if (state.poll) {
      return jsonResponse({ error: 'Poll already initialized' }, 409);
    }

    state.poll = pollData;
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

    // Schedule alarm to auto-close at closes_at
    if (state.poll.closesAt) {
      const closeTime = new Date(state.poll.closesAt).getTime();
      if (closeTime > Date.now()) {
        await this.state.storage.setAlarm(closeTime);
      }
    }

    return jsonResponse({ success: true, status: 'open' });
  }

  private async handleClose(): Promise<Response> {
    const state = await this.loadState();
    if (!state.poll) return jsonResponse({ error: 'Poll not found' }, 404);
    if (state.poll.status !== 'open') {
      return jsonResponse({ error: `Cannot close poll in status: ${state.poll.status}` }, 400);
    }

    await this.closePoll(state);

    return jsonResponse({ success: true, status: 'closed' });
  }

  /** Core close logic — shared between manual close and alarm auto-close */
  private async closePoll(state: PollState): Promise<void> {
    if (!state.poll) return;

    state.poll.status = 'closed';
    await this.appendAudit('poll_closed', JSON.stringify({ pollId: state.poll.id }));
    await this.saveState();

    await this.env.DB.prepare('UPDATE polls SET status = ? WHERE id = ?')
      .bind('closed', state.poll.id).run();

    // Cancel any pending alarm (manual close before timer)
    await this.state.storage.deleteAlarm();

    // Run post-close hooks (best-effort — don't fail the close if publishing fails)
    try {
      await this.runPostCloseHooks(state);
    } catch (err) {
      console.error('Post-close hooks failed for poll:', state.poll.id, err);
      await this.appendAudit('post_close_hooks_failed', JSON.stringify({
        pollId: state.poll.id,
        error: String(err),
      }));
      await this.saveState();
    }
  }

  /**
   * Post-close hooks — publish results after a poll closes.
   *
   * Public polls: sync likes from Bluesky, publish final tally.
   * Anonymous polls: publish shuffled ballots, publish final tally.
   * Both: finalize the poll (irreversible).
   */
  private async runPostCloseHooks(state: PollState): Promise<void> {
    if (!state.poll) return;
    const pollId = state.poll.id;
    const publisher = this.getPublisher();

    // Load poll row for Bluesky post ref and options
    const pollRow = await this.env.DB.prepare(
      'SELECT bluesky_option_posts, bluesky_post_uri, bluesky_post_cid, question, options FROM polls WHERE id = ?'
    ).bind(pollId).first();

    if (state.poll.mode === 'public_like') {
      // Sync likes from Bluesky public API
      const poll = pollRow;
      const optionPosts = poll?.bluesky_option_posts
        ? JSON.parse(poll.bluesky_option_posts as string) as { uri: string; cid: string }[]
        : null;

      if (optionPosts && optionPosts.length > 0) {
        const countsByOption: Record<string, number> = {};
        let totalVotes = 0;

        for (let i = 0; i < optionPosts.length; i++) {
          const post = optionPosts[i];
          if (!post.uri) { countsByOption[String(i)] = 0; continue; }

          let count = 0;
          let cursor: string | undefined;
          for (let page = 0; page < 100; page++) {
            const params = new URLSearchParams({ uri: post.uri, limit: '100' });
            if (cursor) params.set('cursor', cursor);
            const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getLikes?${params}`);
            if (!res.ok) break;
            const data = await res.json() as any;
            const likes = data.likes || [];
            count += likes.length;
            cursor = data.cursor;
            if (!cursor || likes.length === 0) break;
          }
          countsByOption[String(i)] = count;
          totalVotes += count;
        }

        state.tally = countsByOption;
        state.ballotCount = totalVotes;
        await this.appendAudit('likes_synced_on_close', JSON.stringify({ pollId, totalVotes }));
        await this.saveState();

        // Update D1 tally
        await this.env.DB.prepare(
          `INSERT OR REPLACE INTO tally_snapshots (poll_id, counts_by_option, ballot_count, computed_at, final)
           VALUES (?, ?, ?, ?, 1)`
        ).bind(pollId, JSON.stringify(countsByOption), totalVotes, new Date().toISOString()).run();
      }
    } else {
      // Anonymous: publish shuffled ballots to ATProto
      const rows = await this.env.DB.prepare(
        'SELECT ballot_id, choice, token_message, issuer_signature, nullifier, ballot_version, public_ballot_serial FROM ballots WHERE poll_id = ? AND published_record_uri IS NULL'
      ).bind(pollId).all();
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
              `ballot-${(b.ballot_id as string).replace(/-/g, '')}`,
              record
            );
            await this.env.DB.prepare(
              'UPDATE ballots SET published_record_uri = ? WHERE ballot_id = ?'
            ).bind(result.uri, b.ballot_id).run();
            published++;
          } catch (err) {
            console.error(`Failed to publish ballot ${b.ballot_id}:`, err);
          }
        }

        await this.appendAudit('ballots_published_on_close', JSON.stringify({ pollId, published, total: ballots.length }));
        await this.saveState();
      }

      // Update D1 tally as final
      await this.env.DB.prepare(
        `INSERT OR REPLACE INTO tally_snapshots (poll_id, counts_by_option, ballot_count, computed_at, final)
         VALUES (?, ?, ?, ?, 1)`
      ).bind(pollId, JSON.stringify(state.tally), state.ballotCount, new Date().toISOString()).run();
    }

    // Publish final tally to ATProto
    const tallyRecord = {
      $type: 'com.minomobi.poll.tally' as const,
      pollId,
      countsByOption: state.tally,
      ballotCount: state.ballotCount,
      computedAt: new Date().toISOString(),
      final: true,
    };
    const tallyResult = await publisher.createRecord(
      'com.minomobi.poll.tally',
      `tally-${pollId.replace(/-/g, '')}`,
      tallyRecord
    );
    await this.appendAudit('tally_published_on_close', JSON.stringify({ pollId, uri: tallyResult.uri }));

    // Finalize the poll
    state.poll.status = 'finalized';
    await this.appendAudit('poll_finalized', JSON.stringify({ pollId, auto: true }));
    await this.saveState();

    await this.env.DB.prepare('UPDATE polls SET status = ? WHERE id = ?')
      .bind('finalized', pollId).run();

    // Reply to the host's Bluesky post with the final results
    await this.postResultsReply(state, pollRow, publisher);
  }

  /**
   * Post a results reply to the host's original Bluesky poll post.
   * Posted from the service account as a reply to the thread root.
   */
  private async postResultsReply(
    state: PollState,
    pollRow: Record<string, unknown> | null,
    publisher: PdsPublisher | MockPublisher
  ): Promise<void> {
    if (!state.poll || !pollRow) return;
    const postUri = pollRow.bluesky_post_uri as string | null;
    const postCid = pollRow.bluesky_post_cid as string | null;
    if (!postUri || !postCid) return; // Poll wasn't posted to Bluesky

    const options = JSON.parse(pollRow.options as string) as string[];
    const pollId = state.poll.id;
    const frontendUrl = this.env.FRONTEND_URL || 'https://poll.mino.mobi';

    // Build results text
    const lines: string[] = ['Results are in!\n'];
    let maxVotes = 0;
    for (const key of Object.keys(state.tally)) {
      if (state.tally[key] > maxVotes) maxVotes = state.tally[key];
    }
    for (let i = 0; i < options.length; i++) {
      const count = state.tally[String(i)] || 0;
      const bar = maxVotes > 0 ? '█'.repeat(Math.round((count / maxVotes) * 8)) : '';
      const winner = count === maxVotes && maxVotes > 0 ? ' ✓' : '';
      lines.push(`${options[i]}: ${count}${winner} ${bar}`);
    }
    lines.push(`\n${state.ballotCount} votes · View full results`);

    const text = lines.join('\n');
    const encoder = new TextEncoder();

    // Facet for "View full results" link
    const linkText = 'View full results';
    const linkStart = encoder.encode(text.slice(0, text.indexOf(linkText))).byteLength;
    const linkBytes = encoder.encode(linkText);

    const replyRecord = {
      $type: 'app.bsky.feed.post',
      text,
      facets: [{
        index: { byteStart: linkStart, byteEnd: linkStart + linkBytes.byteLength },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: `${frontendUrl}/poll/${pollId}` }],
      }],
      reply: {
        root: { uri: postUri, cid: postCid },
        parent: { uri: postUri, cid: postCid },
      },
      createdAt: new Date().toISOString(),
    };

    try {
      const rkey = `results-${pollId.replace(/-/g, '').slice(0, 15)}`;
      const result = await publisher.createRecord('app.bsky.feed.post', rkey, replyRecord);
      await this.appendAudit('results_reply_posted', JSON.stringify({ pollId, uri: result.uri }));
      await this.saveState();
    } catch (err) {
      console.error('Failed to post results reply:', err);
      // Non-fatal — results are still published to ATProto
    }
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
   * Eligibility check and credential issuance via RSA Blind Signatures.
   *
   * Responder sends a blinded message. Host signs it blindly — never sees the
   * original token message. Host cannot link voter identity to ballot.
   */
  private async handleEligibility(request: Request): Promise<Response> {
    const { responderDid, blindedMessage } = await request.json() as {
      responderDid: string;
      blindedMessage?: string;
    };

    const state = await this.loadState();
    if (!state.poll) return jsonResponse({ error: 'Poll not found' }, 404);
    if (state.poll.mode === 'public_like') {
      return jsonResponse({ error: 'Public polls use Bluesky likes — no credential needed' }, 400);
    }
    if (state.poll.status !== 'open') {
      return jsonResponse({ error: 'Poll is not open' }, 403);
    }

    if (state.poll.eligibilityMode && state.poll.eligibilityMode !== 'open') {
      const eligible = await this.env.DB.prepare(
        'SELECT 1 FROM poll_eligible_dids WHERE poll_id = ? AND did = ?'
      ).bind(state.poll.id, responderDid).first();
      if (!eligible) {
        return jsonResponse({ eligible: false, error: 'Not in eligible voter list' }, 403);
      }
    }

    if (state.consumedDids.has(responderDid)) {
      return jsonResponse({ eligible: false, error: 'Already voted' }, 403);
    }

    const now = new Date().toISOString();
    if (now < state.poll.opensAt || now > state.poll.closesAt) {
      return jsonResponse({ eligible: false, error: 'Outside voting window' }, 403);
    }

    if (!blindedMessage) {
      return jsonResponse({ eligible: false, error: 'Blinded message required' }, 400);
    }

    // SECURITY: Persist consumedDid BEFORE attempting blind signing to prevent
    // TOCTOU race condition. If a crash occurs between add and saveState, the DID
    // stays consumed (correct — fail-safe, prevents double credential issuance).
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
      // Don't roll back consumedDid — fail-safe. The voter can retry with a
      // fresh session if blind signing had a transient failure, but we never
      // risk issuing two credentials for the same DID.
      console.error('Blind signing failed for poll:', state.poll?.id, err);
      return jsonResponse({ eligible: false, error: 'Credential issuance failed' }, 500);
    }

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
    if (state.poll.mode === 'public_like') {
      return jsonResponse({ accepted: false, rejectionReason: 'Public polls use Bluesky likes — vote by liking the option post' }, 400);
    }
    if (state.poll.status !== 'open') {
      return jsonResponse({ accepted: false, rejectionReason: 'Poll is not open' }, 403);
    }

    // Validate choice
    if (submission.choice < 0 || submission.choice >= state.poll.options.length) {
      return jsonResponse({ accepted: false, rejectionReason: 'Invalid choice' }, 400);
    }

    // SHIP BLOCKER 1: Verify tokenMessage is bound to this poll.
    // The structured token format includes the pollId in cleartext,
    // preventing cross-poll credential replay.
    let parsedToken;
    try {
      parsedToken = parseTokenMessage(submission.tokenMessage);
    } catch {
      return jsonResponse({ accepted: false, rejectionReason: 'Malformed token message' }, 400);
    }
    if (parsedToken.pollId !== state.poll.id) {
      return jsonResponse({ accepted: false, rejectionReason: 'Token not issued for this poll' }, 403);
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

    // SHIP BLOCKER 2: Verify nullifier is cryptographically bound to tokenMessage.
    // The server recomputes the expected nullifier from the submitted tokenMessage.
    // This prevents an attacker from choosing arbitrary nullifiers for the same credential.
    const expectedNullifier = await deriveNullifier(submission.tokenMessage);
    if (submission.nullifier !== expectedNullifier) {
      return jsonResponse({ accepted: false, rejectionReason: 'Invalid nullifier — must be derived from token' }, 403);
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

    // SECURITY: Audit log stores a ballot commitment instead of raw choice/nullifier/tokenMessage.
    // This prevents the operator from reading individual votes via audit logs while still
    // allowing integrity verification via the rolling hash chain.
    const ballotCommitment = await computeBallotCommitment(
      submission.tokenMessage, submission.choice, submission.nullifier
    );
    const auditPayload = JSON.stringify({
      ballotId,
      pollId: state.poll.id,
      ballotCommitment,
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

  /**
   * Sync likes from Bluesky — receives pre-computed tally from the API route.
   * Only valid for public_like mode polls.
   */
  private async handleSyncLikes(request: Request): Promise<Response> {
    const { countsByOption, ballotCount } = await request.json() as {
      countsByOption: Record<string, number>;
      ballotCount: number;
    };

    const state = await this.loadState();
    if (!state.poll) return jsonResponse({ error: 'Poll not found' }, 404);
    if (state.poll.mode !== 'public_like') {
      return jsonResponse({ error: 'Not a public_like poll' }, 400);
    }

    state.tally = countsByOption;
    state.ballotCount = ballotCount;

    const now = new Date().toISOString();
    await this.appendAudit('likes_synced', JSON.stringify({
      pollId: state.poll.id,
      ballotCount,
    }));
    await this.saveState();

    // Update tally snapshot in D1
    await this.env.DB.prepare(
      `INSERT OR REPLACE INTO tally_snapshots (poll_id, counts_by_option, ballot_count, computed_at, final)
       VALUES (?, ?, ?, ?, 0)`
    ).bind(
      state.poll.id,
      JSON.stringify(countsByOption),
      ballotCount,
      now
    ).run();

    return jsonResponse({ success: true });
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

    // Privacy-minimal view for the DO API endpoint.
    // The canonical public bulletin board is the host PDS (ATProto records),
    // which publishes full (tokenMessage, issuerSignature, nullifier, choice)
    // for independent verification. This endpoint returns ballot_commitment
    // instead, so the DO API does not become an additional deanonymization surface.
    // Voters can verify their own ballot by opening the commitment with their secret.
    const result = await this.env.DB.prepare(
      `SELECT ballot_id, poll_id, public_ballot_serial, nullifier, choice,
              token_message, issuer_signature, accepted, submitted_at, rolling_audit_hash
       FROM ballots WHERE poll_id = ? AND accepted = 1 ORDER BY public_ballot_serial`
    ).bind(state.poll.id).all();

    const ballots: PublicBallot[] = await Promise.all(
      (result.results || []).map(async (row: any) => ({
        poll_id: row.poll_id,
        option: row.choice,
        ballot_commitment: await computeBallotCommitment(
          row.token_message, row.choice, row.nullifier
        ),
        issuer_signature: row.issuer_signature,
        submitted_at: row.submitted_at,
        ballot_version: 1,
        public_serial: row.public_ballot_serial,
      }))
    );

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
