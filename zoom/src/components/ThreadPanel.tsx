import { useEffect, useState, useCallback } from 'react';
import { useSelectionStore } from '../stores/selection';
import { useDataStore } from '../stores/data';
import type { BlueskyThreadNode } from '../api/types';

function relativeTime(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function ThreadPost({ node, depth }: { node: BlueskyThreadNode; depth: number }) {
  if (
    !node ||
    node.$type === 'app.bsky.feed.defs#blockedPost' ||
    node.$type === 'app.bsky.feed.defs#notFoundPost'
  ) {
    return <div className="thread-reply" style={{ color: '#555', fontSize: '.8em' }}>[unavailable]</div>;
  }

  const post = node.post;
  if (!post) return null;

  const author = post.author || {};
  const handle = author.handle || author.did?.slice(0, 20) || '?';
  const displayName = author.displayName || handle;
  const text = post.record?.text || '';
  const isRoot = depth === 0;
  const cls = isRoot ? 'thread-post root' : 'thread-reply';

  const images: string[] = [];
  if (post.embed) {
    const imgs = post.embed.images || post.embed.media?.images || [];
    for (const img of imgs) {
      const thumb = img.thumb || img.fullsize;
      if (thumb) images.push(thumb);
    }
  }

  const likes = post.likeCount || 0;
  const replies = post.replyCount || 0;
  const reposts = post.repostCount || 0;
  const time = post.record?.createdAt ? relativeTime(post.record.createdAt) : '';
  const rkey = post.uri?.split('/').pop() || '';

  const sortedReplies = [...(node.replies || [])].sort(
    (a, b) => (b.post?.likeCount || 0) - (a.post?.likeCount || 0)
  );

  return (
    <div className={cls}>
      <div className="thread-author">
        <a href={`https://bsky.app/profile/${handle}`} target="_blank" rel="noopener noreferrer">
          {displayName}
        </a>{' '}
        <span className="thread-time">@{handle} &middot; {time}</span>
      </div>
      <div className="thread-text">{text}</div>
      {images.map((src, i) => (
        <img key={i} className="thread-img" src={src} loading="lazy" alt="" />
      ))}
      <div className="thread-stats">
        <span>{replies} replies</span>
        <span>{reposts} reposts</span>
        <span>{likes} likes</span>{' '}
        <a
          href={`https://bsky.app/profile/${author.did || handle}/post/${rkey}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#555', textDecoration: 'none' }}
        >
          open
        </a>
      </div>
      {sortedReplies.map((reply, i) => (
        <ThreadPost key={i} node={reply} depth={depth + 1} />
      ))}
    </div>
  );
}

export function ThreadPanel() {
  const selected = useSelectionStore((s) => s.selected);
  const postDots = useDataStore((s) => s.postDots);
  const fetchFullThread = useDataStore((s) => s.fetchFullThread);
  const [thread, setThread] = useState<BlueskyThreadNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => useSelectionStore.getState().setSelected(null);

  const currentIndex = selected
    ? postDots.findIndex((d) => d._post.uri === selected._post.uri)
    : -1;

  // Navigate to the nearest spatial neighbor in the given direction.
  // "next" = clockwise-ish neighbor, "prev" = counter-clockwise.
  // Falls back to spiral index +-1 if spatial search fails.
  const navigate = useCallback(
    (delta: number) => {
      if (postDots.length === 0 || currentIndex < 0) return;
      const cur = postDots[currentIndex];

      // Find nearest neighbor by Euclidean distance, preferring the
      // direction (positive delta = outward/clockwise, negative = inward)
      let bestIdx = -1;
      let bestDist = Infinity;
      const curAngle = Math.atan2(cur._y, cur._x);

      for (let i = 0; i < postDots.length; i++) {
        if (i === currentIndex) continue;
        const d = postDots[i];
        const dx = d._x - cur._x;
        const dy = d._y - cur._y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Angular direction relative to current post
        const angle = Math.atan2(dy, dx);
        let angleDiff = angle - curAngle;
        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        // For "next" (delta > 0): prefer clockwise neighbors (angleDiff > 0)
        // For "prev" (delta < 0): prefer counter-clockwise (angleDiff < 0)
        const directionMatch = delta > 0 ? angleDiff > -0.5 : angleDiff < 0.5;

        // Weight distance, with a mild preference for directionally-matching posts
        const weight = directionMatch ? dist : dist * 1.8;
        if (weight < bestDist) {
          bestDist = weight;
          bestIdx = i;
        }
      }

      if (bestIdx < 0) {
        // Fallback: just step by index
        bestIdx = (currentIndex + delta + postDots.length) % postDots.length;
      }

      useSelectionStore.getState().setSelected(postDots[bestIdx]);
      document.getElementById('info-inner')?.scrollTo(0, 0);
    },
    [currentIndex, postDots]
  );

  // Keyboard nav: left/up = prev, right/down = next
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigate(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        navigate(1);
      } else if (e.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, navigate]);

  useEffect(() => {
    setThread(null);
    setError(null);
    setLoading(false);

    if (!selected) return;

    setLoading(true);
    fetchFullThread(selected._post.uri)
      .then((t) => setThread(t))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [selected, fetchFullThread]);

  const isOpen = selected !== null;
  const position = currentIndex >= 0 ? `${currentIndex + 1}/${postDots.length}` : '';

  return (
    <div id="info-panel" className={isOpen ? 'open' : ''}>
      <div id="info-inner">
        <span className="info-close" onClick={close}>&times;</span>

        {/* Navigation bar */}
        {selected && (
          <div className="thread-nav">
            <button className="nav-btn" onClick={() => navigate(-1)} title="Previous thread (←)">
              &larr; prev
            </button>
            <span className="nav-position">{position}</span>
            <button className="nav-btn" onClick={() => navigate(1)} title="Next thread (→)">
              next &rarr;
            </button>
          </div>
        )}

        {selected && (
          <>
            <h2>
              @{selected._post.authorHandle}
              {selected._post.primaryCommunityLabel && (
                <span className="meta" style={{ marginLeft: 8 }}>
                  {selected._post.primaryCommunityLabel}
                </span>
              )}
            </h2>
            <div className="meta">
              {selected._post.replyCount} replies &middot;{' '}
              {selected._post.likeCount} likes &middot;{' '}
              depth {selected._post.threadDepth}
              {selected._post.authorShell === 0 ? ' \u2605 core' : ''}
            </div>
            {loading && <div className="thread-loading">loading thread&hellip;</div>}
            {error && (
              <div className="thread-error">
                failed to load: {error}
                <div style={{ marginTop: '.6em' }}>
                  <a
                    href={`https://bsky.app/profile/${selected._post.authorDid}/post/${selected._post.uri.split('/').pop()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#8bf', textDecoration: 'none' }}
                  >
                    view on Bluesky
                  </a>
                </div>
              </div>
            )}
            {thread && <ThreadPost node={thread} depth={0} />}
          </>
        )}
      </div>
    </div>
  );
}
