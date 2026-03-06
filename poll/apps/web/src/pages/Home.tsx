import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AuthCard } from '../components/Layout';
import { listPolls } from '../lib/api';

export function HomePage() {
  const { did } = useAuth();
  const navigate = useNavigate();
  const [polls, setPolls] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    listPolls().then(d => setPolls(d.polls || [])).catch(() => {});
  }, []);

  const filtered = search.trim()
    ? polls.filter(p =>
        p.question?.toLowerCase().includes(search.toLowerCase()) ||
        p.id?.includes(search.trim())
      )
    : polls;

  return (
    <div>
      <AuthCard />

      <div className="card">
        <h2>Privacy-Preserving Polls on ATProto</h2>
        <p className="muted mb-12">
          Authenticated voting with anonymous ballot publication. Responders prove eligibility
          via ATProto, receive a one-time ballot credential, and submit votes anonymously.
        </p>
        {did && <Link to="/create" className="btn btn-primary">Create a Poll</Link>}
      </div>

      <div className="card">
        <div className="search-row">
          <input
            type="text"
            placeholder="Search polls or paste a poll ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && search.trim()) {
                if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search.trim())) {
                  navigate(`/poll/${search.trim()}`);
                }
              }
            }}
            style={{ marginBottom: 0 }}
          />
        </div>
      </div>

      <div className="card">
        <h3>Polls ({filtered.length})</h3>
        {filtered.length === 0 ? (
          <p className="muted">{search ? 'No matching polls.' : 'No polls yet.'}</p>
        ) : (
          <div className="poll-list">
            {filtered.map((p: any) => (
              <Link to={`/poll/${p.id}`} key={p.id} className="poll-list-item">
                <div className="poll-list-question">{p.question}</div>
                <div className="poll-list-meta">
                  {p.eligibility_mode && p.eligibility_mode !== 'open' && (
                    <span className="eligibility-badge">{p.eligibility_mode.replace('_', ' ')}</span>
                  )}
                  <span className={`status-badge status-${p.status}`}>{p.status}</span>
                  <span className="muted">{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
