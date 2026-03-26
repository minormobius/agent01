import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getSurvey, requestSurveyEligibility, submitSurveyBallot } from '../lib/api';
import { AuthCard } from '../components/Layout';
import {
  generateSecret,
  deriveTokenMessage,
  deriveNullifier,
  blindMessage,
  finalizeBlindSignature,
  importRSAPublicKey,
} from '@atpolls/shared';

interface Credential {
  tokenMessage: string;
  issuerSignature: string;
  nullifier: string;
}

type Step = 'loading' | 'auth_required' | 'request_credential' | 'answer' | 'submitting' | 'done' | 'error';

export function SurveyVotePage() {
  const { id } = useParams<{ id: string }>();
  const { did } = useAuth();
  const navigate = useNavigate();

  const [survey, setSurvey] = useState<any>(null);
  const [step, setStep] = useState<Step>('loading');
  const [credential, setCredential] = useState<Credential | null>(null);
  const [choices, setChoices] = useState<(number | null)[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    getSurvey(id)
      .then(s => {
        setSurvey(s);
        setChoices(new Array(s.questions.length).fill(null));
        if (s.status !== 'open') {
          setStep('error');
          setError('This survey is not currently open for responses.');
        } else if (!did) {
          setStep('auth_required');
        } else {
          const stored = sessionStorage.getItem(`survey-credential:${id}`);
          if (stored) {
            setCredential(JSON.parse(stored));
            setStep('answer');
          } else {
            setStep('request_credential');
          }
        }
      })
      .catch(e => { setError(e.message); setStep('error'); });
  }, [id, did]);

  const handleRequestCredential = async () => {
    if (!id || !survey) return;
    setError('');
    try {
      const secret = generateSecret();
      const tokenMessage = await deriveTokenMessage(id, secret, survey.closes_at);
      const hostPublicKeyJWK = JSON.parse(survey.host_public_key);
      const publicKey = await importRSAPublicKey(hostPublicKeyJWK);
      const { blindedMsg, inv } = await blindMessage(tokenMessage, publicKey);
      const resp = await requestSurveyEligibility(id, blindedMsg);
      if (!resp.eligible) throw new Error(resp.error || 'Not eligible');
      const issuerSignature = await finalizeBlindSignature(tokenMessage, resp.blindedSignature, inv, publicKey);
      const nullifier = await deriveNullifier(tokenMessage);
      const cred = { tokenMessage, issuerSignature, nullifier };
      sessionStorage.setItem(`survey-credential:${id}`, JSON.stringify(cred));
      setCredential(cred);
      setStep('answer');
    } catch (err: any) {
      setError(err.message);
      setStep('error');
    }
  };

  const setChoice = (qi: number, choice: number) => {
    const copy = [...choices];
    copy[qi] = copy[qi] === choice ? null : choice;
    setChoices(copy);
  };

  const canSubmit = () => {
    if (!survey) return false;
    for (let i = 0; i < survey.questions.length; i++) {
      if (survey.questions[i].required && choices[i] === null) return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!id || !credential || !canSubmit()) return;
    setStep('submitting');
    setError('');
    try {
      const finalChoices = choices.map((c, i) => {
        if (c === null && !survey.questions[i].required) return -1;
        return c as number;
      });
      const resp = await submitSurveyBallot(id, {
        choices: finalChoices,
        tokenMessage: credential.tokenMessage,
        issuerSignature: credential.issuerSignature,
        nullifier: credential.nullifier,
        ballotVersion: 2,
      });
      if (!resp.accepted) {
        setError(resp.rejectionReason || 'Ballot rejected');
        setStep('error');
        return;
      }
      sessionStorage.removeItem(`survey-credential:${id}`);
      setResult(resp);
      setStep('done');
    } catch (err: any) {
      setError(err.message);
      setStep('error');
    }
  };

  if (!survey && step === 'loading') {
    return <div className="card"><p className="muted">Loading survey...</p></div>;
  }

  const q = survey?.questions?.[currentQ];

  return (
    <div>
      {survey && (
        <div className="card">
          <h2>{survey.title}</h2>
          {survey.description && <p className="muted">{survey.description}</p>}
          <p className="muted">{survey.questions?.length} questions &middot; Anonymous &middot; Cryptographic ballot secrecy</p>
        </div>
      )}

      {step === 'auth_required' && (
        <div>
          <div className="card">
            <p style={{ fontSize: 14, marginBottom: 12 }}>
              Sign in with your Bluesky account to complete this survey.
            </p>
            <p className="muted">Your identity verifies eligibility only — it is never linked to your responses.</p>
          </div>
          <AuthCard />
        </div>
      )}

      {step === 'request_credential' && (
        <div className="card">
          <h3>Step 1: Request Survey Credential</h3>
          <p className="muted mb-12">
            Your browser generates a secret and blinds it. The server signs without seeing your token — cryptographic anonymity.
          </p>
          <button className="btn btn-primary" onClick={handleRequestCredential}>
            Request Credential
          </button>
        </div>
      )}

      {step === 'answer' && survey && q && (
        <div className="card">
          <div className="flex gap-8" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Question {currentQ + 1} of {survey.questions.length}</h3>
            {!q.required && <span className="muted" style={{ fontSize: 12 }}>Optional</span>}
          </div>

          <p style={{ fontSize: 15, marginBottom: 12 }}>{q.question}</p>

          <ul className="option-list">
            {(q.options as string[]).map((opt: string, oi: number) => (
              <li
                key={oi}
                className={choices[currentQ] === oi ? 'selected' : ''}
                onClick={() => setChoice(currentQ, oi)}
                style={{ cursor: 'pointer' }}
              >
                <span>{opt}</span>
                {choices[currentQ] === oi && <span style={{ color: 'var(--accent)' }}>Selected</span>}
              </li>
            ))}
          </ul>

          {/* Progress indicator */}
          <div style={{ margin: '12px 0', fontSize: 12 }} className="muted">
            {choices.filter((c, i) => c !== null || !survey.questions[i].required).length} / {survey.questions.length} answered
          </div>

          {/* Navigation */}
          <div className="flex gap-8">
            {currentQ > 0 && (
              <button className="btn btn-secondary" onClick={() => setCurrentQ(currentQ - 1)}>
                Previous
              </button>
            )}
            {currentQ < survey.questions.length - 1 && (
              <button className="btn btn-secondary" onClick={() => setCurrentQ(currentQ + 1)}>
                Next
              </button>
            )}
            {currentQ === survey.questions.length - 1 && (
              <button
                className="btn btn-primary"
                disabled={!canSubmit()}
                onClick={handleSubmit}
              >
                Submit Survey
              </button>
            )}
          </div>

          {/* Question dots */}
          <div className="flex gap-8 mt-12" style={{ flexWrap: 'wrap' }}>
            {survey.questions.map((_: any, i: number) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrentQ(i)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: i === currentQ ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: choices[i] !== null ? 'var(--accent)' : 'transparent',
                  color: choices[i] !== null ? '#fff' : 'inherit',
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'submitting' && (
        <div className="card"><p className="muted">Submitting survey responses...</p></div>
      )}

      {step === 'done' && result && (
        <div className="card">
          <h3>Survey Submitted</h3>
          <p className="success mb-12">Your anonymous responses have been recorded.</p>
          <p className="muted">Ballot #{result.publicSerial}</p>
          <button className="btn btn-primary mt-12" onClick={() => navigate(`/survey/${id}`)}>
            View Results
          </button>
        </div>
      )}

      {step === 'error' && (
        <div className="card">
          <p className="error">{error}</p>
          <button className="btn btn-secondary mt-12" onClick={() => navigate(`/survey/${id}`)}>
            Back to Survey
          </button>
        </div>
      )}
    </div>
  );
}
