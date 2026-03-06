import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getPoll, requestEligibility, submitBallot } from '../lib/api';
import {
  generateSecret,
  deriveTokenMessage,
  deriveNullifier,
  blindMessage,
  finalizeBlindSignature,
  importRSAPublicKey,
} from '@anon-polls/shared';

/**
 * Vote page — implements the full credential lifecycle:
 *
 * Client generates secret, blinds token, server blind-signs,
 * client unblinds. Server never learns the token message.
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

  const handleRequestCredentialV2 = async () => {
    if (!id || !poll) return;
    // 1. Generate secret locally
    const secret = generateSecret();
    // 2. Derive token message
    const tokenMessage = await deriveTokenMessage(id, secret, poll.closes_at);
    // 3. Import the host's RSA public key from the poll definition
    const hostPublicKeyJWK = JSON.parse(poll.host_public_key);
    const publicKey = await importRSAPublicKey(hostPublicKeyJWK);
    // 4. Blind the token message
    const { blindedMsg, inv } = await blindMessage(tokenMessage, publicKey);
    // 5. Send only the blinded message to the server
    const resp = await requestEligibility(id, blindedMsg);
    if (!resp.eligible) {
      throw new Error(resp.error || 'Not eligible');
    }
    // 6. Unblind the signature
    const issuerSignature = await finalizeBlindSignature(
      tokenMessage,
      resp.blindedSignature,
      inv,
      publicKey
    );
    // 7. Derive nullifier locally
    const nullifier = await deriveNullifier(secret, id);
    return { tokenMessage, issuerSignature, secret, nullifier } as Credential;
  };

  const handleRequestCredential = async () => {
    if (!id) return;
    setError('');
    try {
      const cred = await handleRequestCredentialV2();
      if (!cred) return;
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
          <p className="muted">
            Anonymous credential — cryptographic unlinkability
          </p>
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
            Your browser will generate a secret and blind it before sending to the server. The server signs it without seeing your ballot token — cryptographic anonymity.
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
