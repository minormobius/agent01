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
  postSurveyToBluesky,
  authOAuthStart,
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

      <SurveyShareToBluesky survey={survey} surveyId={id!} />

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

function SurveyShareToBluesky({ survey, surveyId }: { survey: any; surveyId: string }) {
  const { handle, did, canPost } = useAuth();
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<{ uri?: string; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const title = survey.title || '';
  const description = survey.description || '';
  const timeLeft = survey.closes_at ? formatTimeLeft(survey.closes_at) : '';
  const surveyUrl = `${baseUrl}/survey/${surveyId}/vote`;

  const footerParts = ['Take this survey', 'Verifiable & anonymous'];
  if (timeLeft) footerParts.push(timeLeft);
  const footer = footerParts.join(' · ');

  const previewText = description
    ? `${title}\n\n${description}\n\n${footer}`
    : `${title}\n\n${footer}`;

  const fallbackText = description
    ? `${title}\n\n${description}\n\nTake the survey: ${surveyUrl}`
    : `${title}\n\nTake the survey: ${surveyUrl}`;

  const handleReauth = async () => {
    const identifier = handle || did;
    if (!identifier) return;
    setPosting(true);
    try {
      const authResult = await authOAuthStart(
        identifier,
        `/survey/${surveyId}/admin`,
        'atproto transition:generic'
      );
      window.location.href = authResult.authUrl;
    } catch (err: any) {
      setPostResult({ error: err.message });
      setPosting(false);
    }
  };

  const handlePost = async () => {
    setPosting(true);
    setPostResult(null);
    try {
      const result = await postSurveyToBluesky(surveyId);
      setPostResult({ uri: result.uri });
    } catch (err: any) {
      setPostResult({ error: err.message });
    } finally {
      setPosting(false);
    }
  };

  const copyFallback = () => {
    navigator.clipboard.writeText(fallbackText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="card">
      <h3>Share to Bluesky</h3>
      <p className="muted mb-12">
        Post your survey with a link card — title links to the vote page.
      </p>
      <div className="share-preview">
        <pre className="share-post-text">{previewText}</pre>
        <p className="muted" style={{ fontSize: '12px', marginTop: '4px' }}>
          Title and "Take this survey" become clickable links on Bluesky.
        </p>
      </div>

      <div style={{ marginTop: '12px' }}>
        {canPost ? (
          <button
            className="btn btn-primary"
            disabled={posting}
            onClick={handlePost}
          >
            {posting ? 'Posting...' : 'Post to Bluesky'}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            disabled={posting}
            onClick={handleReauth}
          >
            {posting ? 'Redirecting...' : 'Authorize & Post to Bluesky'}
          </button>
        )}
      </div>

      {postResult?.uri && (
        <p className="success mt-12">
          Posted! <a href={atUriToBskyUrl(postResult.uri)} target="_blank" rel="noopener noreferrer">View on Bluesky</a>
        </p>
      )}
      {postResult?.error && <p className="error mt-12">{postResult.error}</p>}

      <details style={{ marginTop: '12px' }}>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: '13px' }}>
          Or copy plain text / open in compose
        </summary>
        <div className="flex gap-8 mt-12">
          <button className="btn btn-secondary" onClick={copyFallback}>
            {copied ? 'Copied!' : 'Copy Text'}
          </button>
          <a
            href={`https://bsky.app/intent/compose?text=${encodeURIComponent(fallbackText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            Open in Bluesky
          </a>
        </div>
      </details>
    </div>
  );
}

function atUriToBskyUrl(uri: string): string {
  const match = uri.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/(.+)$/);
  if (match) return `https://bsky.app/profile/${match[1]}/post/${match[2]}`;
  return uri;
}

function formatTimeLeft(closesAt: string): string {
  const now = Date.now();
  const close = new Date(closesAt).getTime();
  const diff = close - now;
  if (diff <= 0) return 'Closed';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}
