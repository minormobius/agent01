import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getPoll, requestEligibility, submitBallot } from '../lib/api';

/**
 * Vote page — implements the full credential lifecycle:
 * 1. Fetch poll
 * 2. Request eligibility (get credential)
 * 3. Select option
 * 4. Submit anonymous ballot using credential
 *
 * The credential (tokenMessage, issuerSignature, nullifier) is held
 * in component state — it never goes to the responder's ATProto repo.
 */

interface Credential {
  tokenMessage: string;
  issuerSignature: string;
  secret: string;
  nullifier: string;
}

type Step = 'loading' | 'auth_required' | 'request_credential' | 'choose' | 'submitting' | 'done' | 'error';

export function VotePage() {
  const { id } = useParams<{ id: string }>();
  const { did } = useAuth();
  const navigate = useNavigate();

  const [poll, setPoll] = useState<any>(null);
  const [step, setStep] = useState<Step>('loading');
  const [credential, setCredential] = useState<Credential | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    getPoll(id)
      .then(p => {
        setPoll(p);
        if (p.status !== 'open') {
          setStep('error');
          setError('This poll is not currently open for voting.');
        } else if (!did) {
          setStep('auth_required');
        } else {
          // Check localStorage for existing credential
          const stored = localStorage.getItem(`credential:${id}`);
          if (stored) {
            const cred = JSON.parse(stored);
            setCredential(cred);
            setStep('choose');
          } else {
            setStep('request_credential');
          }
        }
      })
      .catch(e => { setError(e.message); setStep('error'); });
  }, [id, did]);

  const handleRequestCredential = async () => {
    if (!id) return;
    setError('');
    try {
      const resp = await requestEligibility(id);
      if (!resp.eligible) {
        setError(resp.error || 'Not eligible');
        setStep('error');
        return;
      }
      const cred: Credential = resp.credential;
      // Store credential locally — this is the responder's ballot right
      localStorage.setItem(`credential:${id}`, JSON.stringify(cred));
      setCredential(cred);
      setStep('choose');
    } catch (err: any) {
      setError(err.message);
      setStep('error');
    }
  };

  const handleSubmit = async () => {
    if (!id || selected === null || !credential) return;
    setStep('submitting');
    setError('');
    try {
      const resp = await submitBallot(id, {
        choice: selected,
        tokenMessage: credential.tokenMessage,
        issuerSignature: credential.issuerSignature,
        nullifier: credential.nullifier,
        ballotVersion: 1,
      });
      if (!resp.accepted) {
        setError(resp.rejectionReason || 'Ballot rejected');
        setStep('error');
        return;
      }
      // Clear credential — it's spent
      localStorage.removeItem(`credential:${id}`);
      setResult(resp);
      setStep('done');
    } catch (err: any) {
      setError(err.message);
      setStep('error');
    }
  };

  if (!poll && step === 'loading') {
    return <div className="card"><p className="muted">Loading poll...</p></div>;
  }

  return (
    <div>
      {poll && (
        <div className="card">
          <h2>{poll.question}</h2>
          <p className="muted">Mode: {poll.mode}</p>
        </div>
      )}

      {step === 'auth_required' && (
        <div className="card">
          <p>Please log in with your ATProto handle to vote.</p>
        </div>
      )}

      {step === 'request_credential' && (
        <div className="card">
          <h3>Step 1: Request Ballot Credential</h3>
          <p className="muted mb-12">
            This will privately verify your eligibility and issue a one-time ballot credential.
            {' '}Your vote choice is separated from your identity in persistent storage.
          </p>
          <button className="btn btn-primary" onClick={handleRequestCredential}>
            Request Credential
          </button>
        </div>
      )}

      {step === 'choose' && poll && (
        <div className="card">
          <h3>Step 2: Cast Your Vote</h3>
          <p className="muted mb-12">
            Select an option. Your ballot will be submitted anonymously using your credential.
          </p>
          <ul className="option-list">
            {(poll.options as string[]).map((opt: string, i: number) => (
              <li
                key={i}
                className={selected === i ? 'selected' : ''}
                onClick={() => setSelected(i)}
                style={{ cursor: 'pointer' }}
              >
                <span>{opt}</span>
                {selected === i && <span style={{ color: 'var(--accent)' }}>Selected</span>}
              </li>
            ))}
          </ul>
          <button
            className="btn btn-primary mt-12"
            disabled={selected === null}
            onClick={handleSubmit}
          >
            Submit Anonymous Ballot
          </button>
        </div>
      )}

      {step === 'submitting' && (
        <div className="card"><p className="muted">Submitting ballot...</p></div>
      )}

      {step === 'done' && result && (
        <div className="card">
          <h3>Vote Recorded</h3>
          <p className="success mb-12">Your anonymous ballot has been accepted.</p>
          <p className="muted">
            Ballot #{result.publicSerial}
            {result.publishedUri && <> &middot; Published to ATProto</>}
          </p>
          <button className="btn btn-primary mt-12" onClick={() => navigate(`/poll/${id}`)}>
            View Results
          </button>
        </div>
      )}

      {step === 'error' && (
        <div className="card">
          <p className="error">{error}</p>
          <button className="btn btn-secondary mt-12" onClick={() => navigate(`/poll/${id}`)}>
            Back to Poll
          </button>
        </div>
      )}
    </div>
  );
}
