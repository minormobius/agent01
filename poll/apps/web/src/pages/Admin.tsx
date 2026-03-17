import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useBasePath } from '../hooks/useSiteMode';
import { getPoll, openPoll, closePoll, finalizePoll, deletePoll, getTally, publishPoll, publishTally, publishBallots, syncEligibleDids, getEligibleDids, postToBluesky, syncLikes, authOAuthStart } from '../lib/api';

export function AdminPage() {
  const { id } = useParams<{ id: string }>();
  const { did } = useAuth();
  const navigate = useNavigate();
  const basePath = useBasePath();
  const [poll, setPoll] = useState<any>(null);
  const [tally, setTally] = useState<any>(null);
  const [eligible, setEligible] = useState<any>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const reload = () => {
    if (!id) return;
    getPoll(id).then(setPoll).catch(e => setError(e.message));
    getTally(id).then(setTally).catch(() => {});
    getEligibleDids(id).then(setEligible).catch(() => {});
  };

  useEffect(reload, [id]);

  const action = async (fn: () => Promise<any>, msg: string) => {
    setError('');
    setMessage('');
    try {
      await fn();
      setMessage(msg);
      reload();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!did) return <div className="card"><p className="muted">Please log in.</p></div>;
  if (!poll) return <div className="card"><p className="muted">Loading...</p></div>;

  const isHost = poll.host_did === did;

  return (
    <div>
      <div className="card">
        <h2>Admin: {poll.question}</h2>
        <span className={`status-badge status-${poll.status}`}>{poll.status}</span>
        {' '}
        <span className="status-badge" style={{ background: poll.mode === 'public_like' ? 'var(--success, #0a0)' : 'var(--accent, #900)' }}>
          {poll.mode === 'public_like' ? 'public' : 'anonymous'}
        </span>
        {!isHost && <p className="error mt-12">You are not the host of this poll.</p>}
      </div>

      {isHost && (
        <>
          <div className="card">
            <h3>Poll Controls</h3>
            <div className="poll-lifecycle mb-12">
              {['draft', 'open', 'closed', 'finalized'].map((s, i) => (
                <span key={s}>
                  <span className={`lifecycle-step${poll.status === s ? ' active' : ''}`}>{s}</span>
                  {i < 3 && <span className="lifecycle-arrow">&rarr;</span>}
                </span>
              ))}
            </div>
            <div className="flex gap-8">
              {poll.status === 'draft' && (
                <button className="btn btn-success" onClick={() => action(() => openPoll(id!), 'Poll opened')}>
                  Open Poll
                </button>
              )}
              {poll.status === 'open' && (
                <button className="btn btn-danger" onClick={() => action(() => closePoll(id!), 'Poll closed')}>
                  Close Poll
                </button>
              )}
              {poll.status === 'closed' && (
                <button className="btn btn-danger" onClick={() => action(() => finalizePoll(id!), 'Poll finalized — this is permanent')}>
                  Finalize (irreversible)
                </button>
              )}
              {poll.status === 'finalized' && (
                <p className="muted">This poll is finalized. No further changes possible.</p>
              )}
            </div>
          </div>

          {poll.eligibility_mode && poll.eligibility_mode !== 'open' && (
            <div className="card">
              <h3>Voter Eligibility</h3>
              <p style={{ fontSize: '14px', marginBottom: 8 }}>
                Mode: <strong>{poll.eligibility_mode}</strong>
                {eligible?.count != null && <> — {eligible.count} eligible DIDs</>}
              </p>
              {poll.status === 'draft' && (poll.eligibility_mode === 'followers' || poll.eligibility_mode === 'mutuals' || poll.eligibility_mode === 'at_list') && (
                <button
                  className="btn btn-secondary"
                  onClick={() => action(() => syncEligibleDids(id!), 'Eligible DIDs re-synced')}
                >
                  Re-sync from Bluesky
                </button>
              )}
            </div>
          )}

          <div className="card">
            <h3>ATProto Publishing</h3>
            <div className="flex gap-8">
              <button className="btn btn-primary" onClick={() => action(() => publishPoll(id!), 'Poll published to ATProto')}>
                Publish Poll Definition
              </button>
              <button className="btn btn-primary" onClick={() => action(() => publishBallots(id!), 'Ballots published to ATProto (shuffled)')}>
                Publish Ballots
              </button>
              <button className="btn btn-primary" onClick={() => action(() => publishTally(id!), 'Tally published to ATProto')}>
                Publish Tally
              </button>
            </div>
            {poll.atproto_record_uri && (
              <p className="muted mt-12">Published: {poll.atproto_record_uri}</p>
            )}
          </div>

          {tally && (
            <div className="card">
              <h3>Current Tally</h3>
              <p className="muted mb-12">
                {tally.ballotCount} ballot{tally.ballotCount !== 1 ? 's' : ''}
                {tally.final && ' (final)'}
              </p>
              {Object.entries(tally.countsByOption || {}).map(([key, count]) => (
                <div key={key} style={{ fontSize: '14px', marginBottom: '4px' }}>
                  <strong>{poll.options?.[parseInt(key)] || key}:</strong> {count as number}
                </div>
              ))}
            </div>
          )}

          {poll.mode === 'public_like' && (
            <div className="card">
              <h3>Sync Likes from Bluesky</h3>
              <p className="muted mb-12">
                Fetch like counts from the Bluesky option posts and update the tally.
                {!poll.bluesky_option_posts && ' Post to Bluesky first to create option posts.'}
              </p>
              <button
                className="btn btn-primary"
                disabled={!poll.bluesky_option_posts}
                onClick={() => action(() => syncLikes(id!), 'Likes synced from Bluesky')}
              >
                Sync Likes
              </button>
            </div>
          )}

          <ShareToBluesky poll={poll} pollId={id!} />

          <div className="card">
            <h3>Navigate</h3>
            <div className="flex gap-8">
              <Link to={`${basePath}/poll/${id}/vote`} className="btn btn-primary">Vote Page</Link>
              <Link to={`${basePath}/poll/${id}`} className="btn btn-secondary">Results Page</Link>
              <Link to={`${basePath}/poll/${id}/audit`} className="btn btn-secondary">Audit Log</Link>
            </div>
          </div>

          <div className="card" style={{ borderTop: '2px solid var(--danger, #c00)' }}>
            <h3>Danger Zone</h3>
            <p className="muted mb-12">Permanently delete this poll and all its data (ballots, audit log, eligibility records).</p>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (window.confirm('Delete this poll permanently? This cannot be undone.')) {
                  action(async () => { await deletePoll(id!); navigate(basePath || '/'); }, 'Poll deleted');
                }
              }}
            >
              Delete Poll
            </button>
          </div>
        </>
      )}

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function ShareToBluesky({ poll, pollId }: { poll: any; pollId: string }) {
  const basePath = useBasePath();
  const { handle, did, canPost } = useAuth();
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<{ uri?: string; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const options = (poll.options || []) as string[];

  const timeLeft = poll.closes_at ? formatTimeLeft(poll.closes_at) : '';

  const isPublicLike = poll.mode === 'public_like';

  // Preview text (what it looks like on Bluesky)
  const optionLine = options.join('\n');
  const footerParts = isPublicLike
    ? ['View results', 'Public poll']
    : ['View poll', 'Verifiable & anonymous'];
  if (timeLeft) footerParts.push(timeLeft);
  const previewText = isPublicLike
    ? `${poll.question}\n\nLike a reply to vote:\n\n${footerParts.join(' · ')}`
    : `${poll.question}\n\n${optionLine}\n\n${footerParts.join(' · ')}`;

  // Fallback plain text (for copy/intent) — no raw URLs, just clean text
  // The intent/compose path can't carry facets, so keep it readable.
  // "Post to Bluesky" button uses the API with proper link facets.
  const fallbackFooter = isPublicLike
    ? `View results: ${baseUrl}${basePath}/poll/${pollId}`
    : `View poll: ${baseUrl}${basePath}/poll/${pollId}`;
  const fallbackText = `${poll.question}\n\n${optionLine}\n\n${fallbackFooter}${timeLeft ? ` · ${timeLeft}` : ''}`;

  const handleReauth = async () => {
    const identifier = handle || did;
    if (!identifier) return;
    setPosting(true);
    try {
      const authResult = await authOAuthStart(
        identifier,
        `${basePath}/poll/${pollId}/admin`,
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
      const result = await postToBluesky(pollId);
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
        {isPublicLike
          ? 'Post your poll with option replies — voters like the reply for their choice.'
          : 'Post your poll with embedded links — option names become clickable vote buttons.'}
      </p>
      <div className="share-preview">
        <pre className="share-post-text">{previewText}</pre>
        <p className="muted" style={{ fontSize: '12px', marginTop: '4px' }}>
          Underlined text becomes clickable links on Bluesky.
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
  // at://did:plc:xxx/app.bsky.feed.post/yyy → https://bsky.app/profile/did:plc:xxx/post/yyy
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
