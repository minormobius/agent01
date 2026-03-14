import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getPoll, requestEligibility, submitBallot } from '../lib/api';
import {
  generateSecret,
  deriveTokenMessage,
  deriveNullifier,
  blindMessage,
  finalizeBlindSignature,
  importRSAPublicKey,
} from '@atpolls/shared';
import { AuthCard } from '../components/Layout';

/**
 * QuickVote — streamlined one-click vote from Bluesky links.
 *
 * URL: /v/:pollId?c=N
 *
 * Flow:
 * 1. Reads choice from ?c= query param
 * 2. If not auth'd → shows inline login (AuthCard)
 * 3. Once auth'd → auto-runs credential issuance + ballot submission
 * 4. Shows confirmation
 *
 * No manual "request credential" or "select option" steps.
 */

type Phase =
  | 'loading'
  | 'need_auth'
  | 'issuing_credential'
  | 'submitting_ballot'
  | 'done'
  | 'error';

export function QuickVotePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { did, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const choiceParam = searchParams.get('c');
  const choice = choiceParam !== null ? parseInt(choiceParam, 10) : null;

  const [poll, setPoll] = useState<any>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  // Prevent double-execution of the auto-vote flow
  const votingRef = useRef(false);

  // Load poll
  useEffect(() => {
    if (!id) return;
    getPoll(id)
      .then((p) => {
        setPoll(p);
        if (p.status !== 'open') {
          setError('This poll is not currently open for voting.');
          setPhase('error');
        }
      })
      .catch((e) => {
        setError(e.message);
        setPhase('error');
      });
  }, [id]);

  // Determine phase based on auth state + poll loaded
  useEffect(() => {
    if (!poll || phase === 'error' || phase === 'done') return;
    if (authLoading) return;

    if (!did && poll.mode !== 'public_like') {
      setPhase('need_auth');
    }
    // Auto-vote triggers in the next effect
  }, [poll, did, authLoading, phase]);

  // For public_like polls, redirect to results (voting happens on Bluesky)
  useEffect(() => {
    if (poll?.mode === 'public_like') {
      setPhase('done');
    }
  }, [poll]);

  // Auto-vote: once auth'd and poll loaded, run the full flow
  useEffect(() => {
    if (!poll || poll.mode === 'public_like') return;
    if (!did || !id || choice === null || phase === 'error' || phase === 'done') return;
    if (votingRef.current) return;
    if (isNaN(choice) || choice < 0 || choice >= (poll.options?.length || 0)) {
      setError(`Invalid option index: ${choiceParam}`);
      setPhase('error');
      return;
    }

    votingRef.current = true;
    autoVote(id, poll, choice).catch(() => {});
  }, [poll, did, id, choice, phase]);

  const autoVote = async (pollId: string, pollData: any, choiceIdx: number) => {
    try {
      // Phase 1: Issue credential
      setPhase('issuing_credential');

      const secret = generateSecret();
      const tokenMessage = await deriveTokenMessage(pollId, secret, pollData.closes_at);

      let hostPublicKeyJWK: JsonWebKey;
      try {
        hostPublicKeyJWK = JSON.parse(pollData.host_public_key);
      } catch {
        throw new Error('Poll has an invalid RSA public key.');
      }
      const publicKey = await importRSAPublicKey(hostPublicKeyJWK);
      const { blindedMsg, inv } = await blindMessage(tokenMessage, publicKey);
      const resp = await requestEligibility(pollId, blindedMsg);

      if (!resp.eligible) {
        throw new Error(resp.error || 'Not eligible to vote in this poll.');
      }

      const issuerSignature = await finalizeBlindSignature(
        tokenMessage,
        resp.blindedSignature,
        inv,
        publicKey
      );
      const nullifier = await deriveNullifier(tokenMessage);

      // Phase 2: Submit ballot
      setPhase('submitting_ballot');

      const ballotResp = await submitBallot(pollId, {
        choice: choiceIdx,
        tokenMessage,
        issuerSignature,
        nullifier,
        ballotVersion: 1,
      });

      if (!ballotResp.accepted) {
        throw new Error(ballotResp.rejectionReason || 'Ballot rejected.');
      }

      setResult(ballotResp);
      setPhase('done');
    } catch (err: any) {
      setError(err.message);
      setPhase('error');
      votingRef.current = false;
    }
  };

  // --- Render ---

  const choiceLabel =
    poll && choice !== null && poll.options?.[choice]
      ? poll.options[choice]
      : null;

  return (
    <div>
      {/* Poll header */}
      {poll && (
        <div className="card">
          <h2>{poll.question}</h2>
          {choiceLabel && (
            <p style={{ fontSize: '15px', marginTop: 8 }}>
              Your vote: <strong style={{ color: 'var(--accent)' }}>{choiceLabel}</strong>
            </p>
          )}
          {choice === null && phase !== 'error' && (
            <p className="error" style={{ marginTop: 8 }}>
              No option selected. Use a link from the Bluesky post to vote.
            </p>
          )}
        </div>
      )}

      {/* Auth required */}
      {phase === 'need_auth' && (
        <div>
          <div className="card">
            <p style={{ fontSize: '14px', marginBottom: 12 }}>
              Sign in with your Bluesky account to cast your anonymous vote.
            </p>
            <p className="muted">
              Your identity verifies eligibility only — it is never linked to your ballot.
            </p>
          </div>
          <AuthCard returnTo={`/v/${id}?c=${choice}`} />
        </div>
      )}

      {/* Credential issuance */}
      {phase === 'issuing_credential' && (
        <div className="card">
          <div className="quick-vote-progress">
            <div className="progress-step active">
              <div className="progress-spinner" />
              <span>Issuing anonymous credential...</span>
            </div>
            <div className="progress-step">
              <span className="muted">Submit ballot</span>
            </div>
          </div>
        </div>
      )}

      {/* Ballot submission */}
      {phase === 'submitting_ballot' && (
        <div className="card">
          <div className="quick-vote-progress">
            <div className="progress-step done">
              <span>Credential issued</span>
            </div>
            <div className="progress-step active">
              <div className="progress-spinner" />
              <span>Submitting anonymous ballot...</span>
            </div>
          </div>
        </div>
      )}

      {/* Public like poll — redirect to results */}
      {phase === 'done' && poll?.mode === 'public_like' && (
        <div className="card">
          <h3>Public Poll</h3>
          <p style={{ fontSize: '14px', marginTop: 8 }}>
            Vote by liking the option reply on Bluesky.
          </p>
          <div className="flex gap-8 mt-12">
            <button className="btn btn-primary" onClick={() => navigate(`/poll/${id}`)}>
              View Results
            </button>
          </div>
        </div>
      )}

      {/* Done */}
      {phase === 'done' && result && poll?.mode !== 'public_like' && (
        <div className="card">
          <h3 style={{ color: 'var(--success)' }}>Vote Recorded</h3>
          <p style={{ fontSize: '14px', marginTop: 8 }}>
            Your anonymous ballot has been accepted.
          </p>
          <p className="muted" style={{ marginTop: 4 }}>
            Ballot #{result.publicSerial}
          </p>
          <div className="flex gap-8 mt-12">
            <button className="btn btn-primary" onClick={() => navigate(`/poll/${id}`)}>
              View Results
            </button>
            <button className="btn btn-secondary" onClick={() => navigate(`/poll/${id}/audit`)}>
              Audit Log
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div className="card">
          <p className="error">{error}</p>
          <button className="btn btn-secondary mt-12" onClick={() => navigate(`/poll/${id}`)}>
            Back to Poll
          </button>
        </div>
      )}

      {/* Loading */}
      {phase === 'loading' && (
        <div className="card">
          <p className="muted">Loading poll...</p>
        </div>
      )}
    </div>
  );
}
