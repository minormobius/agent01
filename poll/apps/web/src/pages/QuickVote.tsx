import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useBasePath } from '../hooks/useSiteMode';
import { getPoll, requestEligibility, submitBallot } from '../lib/api';
import {
  generateSecret,
  deriveTokenMessage,
  deriveNullifier,
  blindMessage,
  finalizeBlindSignature,
  importRSAPublicKey,
} from '@atpolls/shared';

/**
 * QuickVote — streamlined vote-from-Bluesky flow.
 *
 * URL: /v/:pollId?c=N
 *
 * Design principle: the vote is the DESTINATION, not the starting point.
 * The page should feel like a single action ("vote") that requires sign-in
 * as a prerequisite, not like sign-in is a separate task.
 *
 * Flow:
 * 1. Show poll question + selected option + "Sign in to vote" (handle input inline)
 * 2. Auto-fill handle from localStorage if available → one-tap OAuth start
 * 3. After OAuth callback, auto-run credential issuance + ballot submission
 * 4. Show confirmation only after vote is actually cast
 */

const HANDLE_STORAGE_KEY = 'atpolls:last-handle';

type Phase =
  | 'loading'
  | 'need_auth'
  | 'starting_oauth'
  | 'issuing_credential'
  | 'submitting_ballot'
  | 'done'
  | 'error';

export function QuickVotePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { did, handle: authedHandle, loading: authLoading, loginOAuth } = useAuth();
  const navigate = useNavigate();
  const basePath = useBasePath();

  const choiceParam = searchParams.get('c');
  const choice = choiceParam !== null ? parseInt(choiceParam, 10) : null;

  const [poll, setPoll] = useState<any>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [handleInput, setHandleInput] = useState('');

  // Prevent double-execution of the auto-vote flow
  const votingRef = useRef(false);

  // Load saved handle from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(HANDLE_STORAGE_KEY);
    if (saved) setHandleInput(saved);
  }, []);

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

  const startOAuth = async () => {
    if (!handleInput.trim()) return;
    const h = handleInput.trim();
    localStorage.setItem(HANDLE_STORAGE_KEY, h);
    setPhase('starting_oauth');
    try {
      await loginOAuth(h, `/v/${id}?c=${choice}`);
    } catch {
      setPhase('need_auth');
    }
  };

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

  // Step indicator: shows where you are in the flow
  const steps = [
    { key: 'auth', label: 'Sign in' },
    { key: 'credential', label: 'Issue credential' },
    { key: 'ballot', label: 'Cast vote' },
  ];

  const activeStep =
    phase === 'need_auth' || phase === 'starting_oauth' ? 0
    : phase === 'issuing_credential' ? 1
    : phase === 'submitting_ballot' || phase === 'done' ? 2
    : -1;

  return (
    <div>
      {/* Poll header — always visible */}
      {poll && (
        <div className="card">
          <h2>{poll.question}</h2>
          {poll.mode !== 'public_like' && choiceLabel && phase !== 'done' && (
            <p style={{ fontSize: '14px', marginTop: 8, color: 'var(--muted)' }}>
              Voting for: <strong style={{ color: 'var(--fg)' }}>{choiceLabel}</strong>
            </p>
          )}
          {choice === null && phase !== 'error' && poll.mode !== 'public_like' && (
            <p className="error" style={{ marginTop: 8 }}>
              No option selected. Use a link from the Bluesky post to vote.
            </p>
          )}
        </div>
      )}

      {/* Step indicator — shows progress through the flow */}
      {poll && poll.mode !== 'public_like' && choice !== null && phase !== 'error' && phase !== 'loading' && phase !== 'done' && (
        <div className="card" style={{ padding: '12px 16px' }}>
          <div className="quick-vote-steps">
            {steps.map((step, i) => (
              <div
                key={step.key}
                className={`qv-step ${i < activeStep ? 'done' : ''} ${i === activeStep ? 'active' : ''}`}
              >
                <div className="qv-step-dot">
                  {i < activeStep ? '✓' : i === activeStep && (phase === 'issuing_credential' || phase === 'submitting_ballot' || phase === 'starting_oauth') ? (
                    <div className="progress-spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span className="qv-step-label">{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Auth required — inline handle input, action-oriented */}
      {phase === 'need_auth' && (
        <div className="card">
          <p style={{ fontSize: '14px', marginBottom: 12, fontWeight: 500 }}>
            Sign in to cast your vote
          </p>
          <div className="auth-form">
            <input
              type="text"
              placeholder="your-handle.bsky.social"
              value={handleInput}
              onChange={e => setHandleInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && startOAuth()}
              autoFocus
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary"
              onClick={startOAuth}
              disabled={!handleInput.trim()}
            >
              {choiceLabel ? `Vote for ${choiceLabel.length > 20 ? choiceLabel.slice(0, 18) + '…' : choiceLabel}` : 'Sign in to vote'}
            </button>
          </div>
          <p className="muted" style={{ marginTop: 8, fontSize: '12px' }}>
            Your identity verifies eligibility only — it is never linked to your ballot.
          </p>
        </div>
      )}

      {/* OAuth redirect in progress */}
      {phase === 'starting_oauth' && (
        <div className="card">
          <p className="muted">Redirecting to Bluesky...</p>
        </div>
      )}

      {/* Credential issuance */}
      {phase === 'issuing_credential' && (
        <div className="card">
          <p style={{ fontSize: '14px' }}>
            <span style={{ marginRight: 8 }}>Issuing anonymous credential...</span>
          </p>
          <p className="muted" style={{ fontSize: '12px', marginTop: 4 }}>
            Your browser is generating a blinded token. The server signs it without seeing your ballot.
          </p>
        </div>
      )}

      {/* Ballot submission */}
      {phase === 'submitting_ballot' && (
        <div className="card">
          <p style={{ fontSize: '14px' }}>
            <span style={{ marginRight: 8 }}>Submitting anonymous ballot...</span>
          </p>
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
            <button className="btn btn-primary" onClick={() => navigate(`${basePath}/poll/${id}`)}>
              View Results
            </button>
          </div>
        </div>
      )}

      {/* Done — vote actually cast */}
      {phase === 'done' && result && poll?.mode !== 'public_like' && (
        <div className="card">
          <h3 style={{ color: 'var(--success)' }}>Vote Cast</h3>
          <p style={{ fontSize: '14px', marginTop: 8 }}>
            You voted for <strong style={{ color: 'var(--accent)' }}>{choiceLabel}</strong>
          </p>
          <p className="muted" style={{ marginTop: 4 }}>
            Anonymous ballot #{result.publicSerial}
          </p>
          <div className="flex gap-8 mt-12">
            <button className="btn btn-primary" onClick={() => navigate(`${basePath}/poll/${id}`)}>
              View Results
            </button>
            <button className="btn btn-secondary" onClick={() => navigate(`${basePath}/poll/${id}/audit`)}>
              Audit Log
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div className="card">
          <p className="error">{error}</p>
          <button className="btn btn-secondary mt-12" onClick={() => navigate(`${basePath}/poll/${id}`)}>
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
