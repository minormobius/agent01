import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { listPolls } from '../lib/api';

export function HomePage() {
  const { did } = useAuth();
  const [polls, setPolls] = useState<any[]>([]);

  useEffect(() => {
    listPolls().then(d => setPolls(d.polls || [])).catch(() => {});
  }, []);

  return (
    <div>
      <div className="card">
        <h2>Privacy-Preserving Polls on ATProto</h2>
        <p className="muted mb-12">
          Authenticated voting with anonymous ballot publication. Responders prove eligibility
          via ATProto, receive a one-time ballot credential, and submit votes anonymously.
        </p>
        {did ? (
          <Link to="/create" className="btn btn-primary">Create a Poll</Link>
        ) : (
          <p className="muted">Log in with your ATProto handle to create or vote in polls.</p>
        )}
      </div>

      <div className="card">
        <h3>Polls ({polls.length})</h3>
        {polls.length === 0 ? (
          <p className="muted">No polls yet.</p>
        ) : (
          <div className="poll-list">
            {polls.map((p: any) => (
              <Link to={`/poll/${p.id}`} key={p.id} className="poll-list-item">
                <div className="poll-list-question">{p.question}</div>
                <div className="poll-list-meta">
                  <span className={`status-badge status-${p.status}`}>{p.status}</span>
                  <span className="muted">{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Enter a Poll ID</h3>
        <form
          onSubmit={e => {
            e.preventDefault();
            const input = (e.target as HTMLFormElement).elements.namedItem('pollId') as HTMLInputElement;
            if (input.value) window.location.href = `/poll/${input.value}`;
          }}
        >
          <div className="flex gap-8">
            <input name="pollId" type="text" placeholder="Paste poll UUID" style={{ marginBottom: 0 }} />
            <button type="submit" className="btn btn-primary">Go</button>
          </div>
        </form>
      </div>
    </div>
  );
}
