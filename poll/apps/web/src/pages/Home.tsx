import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSiteMode, useBasePath } from '../hooks/useSiteMode';
import { AuthCard } from '../components/Layout';
import { listPolls } from '../lib/api';

export function HomePage() {
  const { did } = useAuth();
  const navigate = useNavigate();
  const siteMode = useSiteMode();
  const basePath = useBasePath();
  const [polls, setPolls] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    listPolls(showAll ? 'all' : undefined).then(d => setPolls(d.polls || [])).catch(() => {});
  }, [showAll]);

  // Filter by site mode
  const modeFiltered = siteMode === 'all'
    ? polls
    : polls.filter(p => p.mode === siteMode);

  const filtered = search.trim()
    ? modeFiltered.filter(p =>
        p.question?.toLowerCase().includes(search.toLowerCase()) ||
        p.id?.includes(search.trim())
      )
    : modeFiltered;

  return (
    <div>
      <AuthCard />

      <div className="card">
        {siteMode === 'public_like' ? (
          <>
            <h2>Public Polls on Bluesky</h2>
            <p className="muted mb-12">
              Zero-friction polls — vote by liking a reply on Bluesky. No sign-up, no auth. Votes are public.
            </p>
          </>
        ) : (
          <>
            <h2>Privacy-Preserving Polls on ATProto</h2>
            <p className="muted mb-12">
              Authenticated voting with anonymous ballot publication. Responders prove eligibility
              via ATProto, receive a one-time ballot credential, and submit votes anonymously.
            </p>
          </>
        )}
        {did && <Link to={`${basePath}/create`} className="btn btn-primary">Create a Poll</Link>}
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
                  navigate(`${basePath}/poll/${search.trim()}`);
                }
              }
            }}
            style={{ marginBottom: 0 }}
          />
        </div>
      </div>

      <div className="card">
        <div className="flex gap-8" style={{ alignItems: 'center', marginBottom: '8px' }}>
          <h3 style={{ margin: 0 }}>Polls ({filtered.length})</h3>
          <label style={{ fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
            Show closed/finalized
          </label>
        </div>
        {filtered.length === 0 ? (
          <p className="muted">{search ? 'No matching polls.' : 'No polls yet.'}</p>
        ) : (
          <div className="poll-list">
            {filtered.map((p: any) => (
              <Link to={`${basePath}/poll/${p.id}`} key={p.id} className="poll-list-item">
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
