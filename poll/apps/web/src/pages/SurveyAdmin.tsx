import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  getSurvey,
  getSurveyTally,
  openSurvey,
  closeSurvey,
  deleteSurvey,
  syncSurveyEligibleDids,
  getSurveyEligibleDids,
} from '../lib/api';

export function SurveyAdminPage() {
  const { id } = useParams<{ id: string }>();
  const { did } = useAuth();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<any>(null);
  const [tally, setTally] = useState<any>(null);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  const reload = async () => {
    if (!id) return;
    try {
      const [s, t, e] = await Promise.all([
        getSurvey(id),
        getSurveyTally(id).catch(() => null),
        getSurveyEligibleDids(id).catch(() => null),
      ]);
      setSurvey(s);
      setTally(t);
      if (e?.count != null) setEligibleCount(e.count);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, [id]);

  if (loading) return <div className="card"><p className="muted">Loading...</p></div>;
  if (!survey) return <div className="card"><p className="error">Survey not found</p></div>;

  const isHost = did === survey.host_did;
  if (!isHost) {
    return <div className="card"><p className="error">Only the survey host can access this page.</p></div>;
  }

  const action = async (label: string, fn: () => Promise<void>) => {
    setError('');
    setActionLoading(label);
    try {
      await fn();
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm('Delete this survey? This cannot be undone.')) return;
    await action('delete', async () => {
      await deleteSurvey(id);
      navigate('/');
    });
  };

  return (
    <div>
      <div className="card">
        <h2>Survey Admin</h2>
        <h3>{survey.title}</h3>
        {survey.description && <p className="muted">{survey.description}</p>}
        <p className="muted">
          Status: <strong>{survey.status}</strong> &middot;
          {survey.questions?.length} questions &middot;
          {tally ? ` ${tally.ballotCount} responses` : ''}
        </p>
        {eligibleCount !== null && (
          <p className="muted">Eligible voters: {eligibleCount}</p>
        )}
      </div>

      {/* Lifecycle controls */}
      <div className="card">
        <h3>Lifecycle</h3>

        {survey.status === 'draft' && (
          <div>
            <p className="muted mb-12">Open the survey to start collecting responses.</p>
            <div className="flex gap-8">
              <button
                className="btn btn-primary"
                disabled={!!actionLoading}
                onClick={() => action('open', () => openSurvey(id!))}
              >
                {actionLoading === 'open' ? 'Opening...' : 'Open Survey'}
              </button>
              {(survey.eligibility_mode === 'followers' || survey.eligibility_mode === 'mutuals') && (
                <button
                  className="btn btn-secondary"
                  disabled={!!actionLoading}
                  onClick={() => action('sync', () => syncSurveyEligibleDids(id!))}
                >
                  {actionLoading === 'sync' ? 'Syncing...' : 'Re-sync Eligible DIDs'}
                </button>
              )}
            </div>
          </div>
        )}

        {survey.status === 'open' && (
          <div>
            <p className="muted mb-12">
              Survey is live. Share the link: <code>/survey/{id}/vote</code>
            </p>
            <button
              className="btn btn-primary"
              disabled={!!actionLoading}
              onClick={() => action('close', () => closeSurvey(id!))}
            >
              {actionLoading === 'close' ? 'Closing...' : 'Close Survey'}
            </button>
          </div>
        )}

        {survey.status === 'closed' && (
          <p className="muted">Survey is closed. Results have been published.</p>
        )}

        {survey.status === 'finalized' && (
          <p className="muted">Survey is finalized. No further changes possible.</p>
        )}
      </div>

      {/* Questions preview */}
      <div className="card">
        <h3>Questions</h3>
        {survey.questions?.map((q: any, qi: number) => (
          <div key={qi} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              Q{qi + 1}: {q.question} {!q.required && <span className="muted" style={{ fontSize: 11 }}>(optional)</span>}
            </p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {(q.options as string[]).map((opt: string, oi: number) => (
                <li key={oi} className="muted" style={{ fontSize: 13 }}>{opt}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Current tally */}
      {tally && tally.ballotCount > 0 && (
        <div className="card">
          <h3>Current Results</h3>
          <p className="muted mb-12">{tally.ballotCount} responses</p>
          {survey.questions?.map((q: any, qi: number) => {
            const qTally = tally.countsByQuestion?.[String(qi)] || {};
            const total = Object.values(qTally).reduce((a: number, b: any) => a + (b as number), 0) as number;
            return (
              <div key={qi} style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Q{qi + 1}: {q.question}</p>
                {(q.options as string[]).map((opt: string, oi: number) => {
                  const count = (qTally[String(oi)] as number) || 0;
                  const pct = total > 0 ? (count / total * 100).toFixed(1) : '0.0';
                  return (
                    <div key={oi} className="muted" style={{ fontSize: 12, marginLeft: 12 }}>
                      {opt}: {count} ({pct}%)
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Danger zone */}
      {(survey.status === 'draft' || survey.status === 'open') && (
        <div className="card" style={{ borderColor: 'var(--error-color, #c33)' }}>
          <h3 style={{ color: 'var(--error-color, #c33)' }}>Danger Zone</h3>
          <button
            className="btn btn-secondary"
            style={{ borderColor: 'var(--error-color, #c33)', color: 'var(--error-color, #c33)' }}
            disabled={!!actionLoading}
            onClick={handleDelete}
          >
            {actionLoading === 'delete' ? 'Deleting...' : 'Delete Survey'}
          </button>
        </div>
      )}

      {error && <div className="card"><p className="error">{error}</p></div>}

      <div className="card">
        <div className="flex gap-8">
          <button className="btn btn-secondary" onClick={() => navigate(`/survey/${id}`)}>
            View Results
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>
            Home
          </button>
        </div>
      </div>
    </div>
  );
}
