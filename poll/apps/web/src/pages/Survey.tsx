import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getSurvey, getSurveyTally } from '../lib/api';

export function SurveyPage() {
  const { id } = useParams<{ id: string }>();
  const { did } = useAuth();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<any>(null);
  const [tally, setTally] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      getSurvey(id),
      getSurveyTally(id).catch(() => null),
    ])
      .then(([s, t]) => {
        setSurvey(s);
        setTally(t);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="card"><p className="muted">Loading survey...</p></div>;
  if (error) return <div className="card"><p className="error">{error}</p></div>;
  if (!survey) return <div className="card"><p className="error">Survey not found</p></div>;

  const isHost = did === survey.host_did;
  const statusLabel = survey.status === 'draft' ? 'Draft' :
    survey.status === 'open' ? 'Open' :
    survey.status === 'closed' ? 'Closed' : 'Finalized';

  return (
    <div>
      <div className="card">
        <h2>{survey.title}</h2>
        {survey.description && <p className="muted">{survey.description}</p>}
        <p className="muted">
          {survey.questions?.length} questions &middot; {statusLabel} &middot; Anonymous
        </p>
        {tally && <p className="muted">{tally.ballotCount} responses</p>}

        <div className="flex gap-8 mt-12">
          {survey.status === 'open' && (
            <button className="btn btn-primary" onClick={() => navigate(`/survey/${id}/vote`)}>
              Take Survey
            </button>
          )}
          {isHost && (
            <button className="btn btn-secondary" onClick={() => navigate(`/survey/${id}/admin`)}>
              Admin
            </button>
          )}
        </div>
      </div>

      {/* Per-question results */}
      {survey.questions?.map((q: any, qi: number) => {
        const qTally = tally?.countsByQuestion?.[String(qi)] || {};
        const qType = q.questionType || 'single_choice';
        const total = Object.values(qTally).reduce((a: number, b: any) => a + (b as number), 0) as number;

        if (qType === 'ranking') {
          // Ranking results: sort by Borda score descending
          const scored = (q.options as string[]).map((opt: string, oi: number) => ({
            opt,
            oi,
            score: (qTally[String(oi)] as number) || 0,
          })).sort((a, b) => b.score - a.score);
          const maxScore = scored[0]?.score || 1;

          return (
            <div className="card" key={qi}>
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>
                Q{qi + 1}: {q.question}
                <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>(ranking — Borda count)</span>
              </h3>

              {scored.map((item, rank) => {
                const pct = maxScore > 0 ? (item.score / maxScore * 100) : 0;
                return (
                  <div key={item.oi} style={{ marginBottom: 8 }}>
                    <div className="flex gap-8" style={{ justifyContent: 'space-between', fontSize: 14 }}>
                      <span style={{ fontWeight: rank === 0 ? 600 : 400 }}>
                        #{rank + 1} {item.opt} {rank === 0 && item.score > 0 ? ' ✓' : ''}
                      </span>
                      <span className="muted">{item.score} pts</span>
                    </div>
                    <div style={{
                      height: 6,
                      borderRadius: 3,
                      background: 'var(--border)',
                      marginTop: 4,
                    }}>
                      <div style={{
                        height: '100%',
                        borderRadius: 3,
                        width: `${pct}%`,
                        background: rank === 0 ? 'var(--accent)' : 'var(--text-muted)',
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }

        // Single choice results (existing)
        return (
          <div className="card" key={qi}>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>
              Q{qi + 1}: {q.question}
              {!q.required && <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>(optional)</span>}
            </h3>

            {(q.options as string[]).map((opt: string, oi: number) => {
              const count = (qTally[String(oi)] as number) || 0;
              const pct = total > 0 ? (count / total * 100) : 0;
              const maxCount = Math.max(...Object.values(qTally).map(Number), 0);
              const isMax = count === maxCount && maxCount > 0;

              return (
                <div key={oi} style={{ marginBottom: 8 }}>
                  <div className="flex gap-8" style={{ justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ fontWeight: isMax ? 600 : 400 }}>
                      {opt} {isMax && total > 0 ? ' ✓' : ''}
                    </span>
                    <span className="muted">{count} ({pct.toFixed(1)}%)</span>
                  </div>
                  <div style={{
                    height: 6,
                    borderRadius: 3,
                    background: 'var(--border)',
                    marginTop: 4,
                  }}>
                    <div style={{
                      height: '100%',
                      borderRadius: 3,
                      width: `${pct}%`,
                      background: isMax ? 'var(--accent)' : 'var(--text-muted)',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
