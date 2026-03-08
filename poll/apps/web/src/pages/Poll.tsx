import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPoll, getTally, getBallots } from '../lib/api';
import { recomputeTally } from '@atpolls/shared';

const BSKY_PUBLIC_API = 'https://public.api.bsky.app';

/** Fetch like counts for each option post directly from Bluesky public API */
async function fetchLikeCounts(
  optionPosts: { uri: string; cid: string }[]
): Promise<{ countsByOption: Record<string, number>; totalVotes: number }> {
  const allVoterDids = new Set<string>();
  const countsByOption: Record<string, number> = {};
  let totalVotes = 0;

  for (let i = 0; i < optionPosts.length; i++) {
    const post = optionPosts[i];
    if (!post.uri) { countsByOption[String(i)] = 0; continue; }

    const voters = new Set<string>();
    let cursor: string | undefined;

    for (let page = 0; page < 50; page++) {
      const params = new URLSearchParams({ uri: post.uri, limit: '100' });
      if (cursor) params.set('cursor', cursor);

      try {
        const res = await fetch(`${BSKY_PUBLIC_API}/xrpc/app.bsky.feed.getLikes?${params}`);
        if (!res.ok) break;
        const data = await res.json() as any;
        const likes = data.likes || [];
        for (const like of likes) {
          if (like.actor?.did) voters.add(like.actor.did);
        }
        cursor = data.cursor;
        if (!cursor || likes.length === 0) break;
      } catch { break; }
    }

    // Deduplicate across options: first like wins
    let count = 0;
    for (const did of voters) {
      if (!allVoterDids.has(did)) {
        allVoterDids.add(did);
        count++;
      }
    }
    countsByOption[String(i)] = count;
    totalVotes += count;
  }

  return { countsByOption, totalVotes };
}

export function PollPage() {
  const { id } = useParams<{ id: string }>();
  const [poll, setPoll] = useState<any>(null);
  const [tally, setTally] = useState<any>(null);
  const [ballots, setBallots] = useState<any[]>([]);
  const [recomputed, setRecomputed] = useState<Record<string, number> | null>(null);
  const [likesLoading, setLikesLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    getPoll(id).then(setPoll).catch(e => setError(e.message));
    getTally(id).then(setTally).catch(() => {});
    getBallots(id).then(d => setBallots(d.ballots || [])).catch(() => {});
  }, [id]);

  // Auto-sync likes from Bluesky for public_like polls on page load
  useEffect(() => {
    if (!poll || poll.mode !== 'public_like') return;
    const optionPosts = poll.bluesky_option_posts;
    if (!optionPosts || optionPosts.length === 0) return;
    setLikesLoading(true);
    fetchLikeCounts(optionPosts)
      .then(({ countsByOption, totalVotes }) => {
        setTally({
          pollId: poll.id,
          countsByOption,
          ballotCount: totalVotes,
          computedAt: new Date().toISOString(),
          final: false,
        });
      })
      .catch(() => {})
      .finally(() => setLikesLoading(false));
  }, [poll]);

  const handleRecompute = () => {
    if (!poll) return;
    const result = recomputeTally(
      ballots.map(b => ({ option: b.option, accepted: true })),
      poll.options.length
    );
    setRecomputed(result);
  };

  if (error) return <div className="card"><p className="error">{error}</p></div>;
  if (!poll) return <div className="card"><p className="muted">Loading...</p></div>;

  const totalVotes = tally ? tally.ballotCount : 0;

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <h2>{poll.question}</h2>
          <span className={`status-badge status-${poll.status}`}>{poll.status}</span>
        </div>

        <p className="muted mb-12">
          {poll.mode === 'public_like' ? 'Public (Bluesky likes)' : 'Anonymous (blind signatures)'}
          {' '}&middot; {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
          {poll.eligibility_mode && poll.eligibility_mode !== 'open' && (
            <> &middot; Restricted: {poll.eligibility_mode.replace('_', ' ')}</>
          )}
          {poll.atproto_record_uri && <> &middot; Published</>}
        </p>
        <div className="poll-id-row">
          <code className="poll-id-code">{id}</code>
          <button
            className="btn-copy"
            title="Copy poll ID"
            onClick={() => {
              const text = id || '';
              const onSuccess = () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              };
              if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
                  // Fallback for non-secure contexts
                  const ta = document.createElement('textarea');
                  ta.value = text;
                  ta.style.position = 'fixed';
                  ta.style.opacity = '0';
                  document.body.appendChild(ta);
                  ta.select();
                  document.execCommand('copy');
                  document.body.removeChild(ta);
                  onSuccess();
                });
              } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                onSuccess();
              }
            }}
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            )}
          </button>
        </div>

        {tally && (
          <div className="bar-chart">
            {(poll.options as string[]).map((opt: string, i: number) => {
              const count = tally.countsByOption?.[String(i)] || 0;
              const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
              return (
                <div className="bar-row" key={i}>
                  <div className="bar-label">{opt}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="bar-count">{count}</div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-8 mt-12">
          {poll.status === 'open' && poll.mode !== 'public_like' && (
            <Link to={`/poll/${id}/vote`} className="btn btn-primary">Vote</Link>
          )}
          {poll.mode === 'public_like' && (
            <span className="muted" style={{ fontSize: '13px', alignSelf: 'center' }}>
              {likesLoading ? 'Counting likes...' : 'Vote by liking on Bluesky'}
            </span>
          )}
          <Link to={`/poll/${id}/audit`} className="btn btn-secondary">Audit</Link>
          <Link to={`/poll/${id}/admin`} className="btn btn-secondary">Admin</Link>
        </div>
      </div>

      {ballots.length > 0 && poll.mode !== 'public_like' && (
        <div className="card">
          <h3>Public Ballots ({ballots.length})</h3>
          <button className="btn btn-secondary mb-12" onClick={handleRecompute}>
            Recompute Tally in Browser
          </button>
          {recomputed && (
            <div className="success mb-12">
              Recomputed: {JSON.stringify(recomputed)}
              {JSON.stringify(recomputed) === JSON.stringify(tally?.countsByOption)
                ? ' — matches server tally'
                : ' — MISMATCH with server tally'}
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="audit-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Option</th>
                  <th>Commitment</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {ballots.map((b: any) => (
                  <tr key={b.public_serial}>
                    <td>{b.public_serial}</td>
                    <td>{poll.options[b.option]}</td>
                    <td className="truncate" title={b.ballot_commitment}>{b.ballot_commitment?.slice(0, 16)}...</td>
                    <td>{new Date(b.submitted_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
