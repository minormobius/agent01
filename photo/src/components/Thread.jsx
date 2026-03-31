import { useState, useCallback, useMemo, useEffect } from 'react';
import { parsePostInput, resolvePostUri, fetchThread, flattenThread, extractMedia } from '../lib/thread.js';

export default function Thread() {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | loading:N | ready | error
  const [error, setError] = useState(null);
  const [posts, setPosts] = useState([]);
  const [threadUri, setThreadUri] = useState('');
  const [expandedMedia, setExpandedMedia] = useState(null); // { media }
  const [view, setView] = useState('timeline'); // timeline | gallery

  const loadThread = useCallback(async (rawInput) => {
    const val = rawInput || input;
    if (!val.trim()) return;

    setError(null);
    setStatus('loading');
    setPosts([]);
    setExpandedMedia(null);

    try {
      const parsed = parsePostInput(val);
      if (!parsed) throw new Error('Could not parse URL. Paste a bsky.app post URL or AT-URI.');

      const uri = await resolvePostUri(parsed);
      setThreadUri(uri);

      const thread = await fetchThread(uri, {
        onProgress: ({ fetched }) => setStatus(`loading:${fetched}`),
      });
      setStatus('loading');
      const flat = flattenThread(thread);
      setPosts(flat);
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [input]);

  const handleSubmit = (e) => {
    e.preventDefault();
    loadThread();
  };

  // Check URL hash for a thread link on mount
  useEffect(() => {
    const hash = window.location.hash;
    // #/thread/https://bsky.app/... or #/thread/at://...
    const m = hash.match(/^#\/thread\/(.+)$/);
    if (m) {
      const url = decodeURIComponent(m[1]);
      setInput(url);
      loadThread(url);
    }
  }, []);

  // Extract all quoted posts from OP's posts for gallery view
  const quotes = useMemo(() => {
    return posts
      .filter(p => p.isOp && p.embed)
      .flatMap(p => {
        const media = extractMedia(p.embed);
        return media
          .filter(m => m.type === 'quote')
          .map(q => ({ ...q, opPostUri: p.uri, opCreatedAt: p.createdAt }));
      });
  }, [posts]);

  return (
    <div className={`thread-view${view === 'gallery' ? ' thread-view-wide' : ''}`}>
      <header className="photo-header">
        <div className="photo-title">
          <h1>
            <a href="#/" className="thread-back-link">ATPhoto</a>
          </h1>
          <span className="photo-subtitle">Thread</span>
        </div>
        <form className="photo-search" onSubmit={handleSubmit}>
          <div className="bsky-ta-wrap">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Paste a bsky.app post URL..."
              disabled={status.startsWith('loading')}
            />
          </div>
          <button type="submit" disabled={status.startsWith('loading') || !input.trim()}>
            {status.startsWith('loading') ? 'Loading...' : 'Load'}
          </button>
        </form>
      </header>

      {status.startsWith('loading') && (
        <div className="photo-status">
          <div className="photo-status-text">
            Fetching thread...
            {status.includes(':') && ` (${status.split(':')[1]} fetches)`}
          </div>
          <div className="photo-status-bar">
            <div className="photo-status-fill" style={{ width: '100%', animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
        </div>
      )}

      {error && <div className="photo-error">{error}</div>}

      {posts.length > 0 && (
        <div className="thread-controls">
          <div className="thread-stats">
            {posts.length} posts &middot; {countMedia(posts)} media items &middot; {countAuthors(posts)} authors
            {view === 'gallery' && ` &middot; ${quotes.length} quoted posts`}
          </div>
          <div className="thread-view-toggle">
            <button
              className={`photo-sort-btn${view === 'timeline' ? ' active' : ''}`}
              onClick={() => setView('timeline')}
            >
              Timeline
            </button>
            <button
              className={`photo-sort-btn${view === 'gallery' ? ' active' : ''}`}
              onClick={() => setView('gallery')}
            >
              Gallery
            </button>
          </div>
        </div>
      )}

      {view === 'timeline' && (
        <div className="thread-timeline">
          {posts.map((post, i) => (
            <ThreadPost
              key={post.uri}
              post={post}
              isFirst={i === 0}
              isLast={i === posts.length - 1}
              expandedMedia={expandedMedia}
              onExpandMedia={setExpandedMedia}
            />
          ))}
        </div>
      )}

      {view === 'gallery' && quotes.length > 0 && (
        <QuoteGallery quotes={quotes} onExpandMedia={setExpandedMedia} />
      )}

      {view === 'gallery' && posts.length > 0 && quotes.length === 0 && (
        <div className="photo-empty">
          <p>No quoted posts found in this thread.</p>
          <p className="photo-empty-sub">
            Switch to Timeline view to see the full thread.
          </p>
        </div>
      )}

      {status === 'idle' && posts.length === 0 && (
        <div className="photo-empty">
          <p>Paste a Bluesky post URL to view the full thread.</p>
          <p className="photo-empty-sub">
            Images, videos, link cards, and quote posts are rendered inline.
          </p>
        </div>
      )}

      {/* Media lightbox */}
      {expandedMedia && (
        <MediaLightbox
          media={expandedMedia.media}
          onClose={() => setExpandedMedia(null)}
        />
      )}
    </div>
  );
}

function QuoteGallery({ quotes, onExpandMedia }) {
  // Distribute cards across columns (same round-robin as main Grid)
  const cols = typeof window !== 'undefined' && window.innerWidth <= 500 ? 1
    : window.innerWidth <= 800 ? 2
    : window.innerWidth <= 1200 ? 3 : 4;

  const columns = Array.from({ length: cols }, () => []);
  quotes.forEach((q, i) => columns[i % cols].push(q));

  return (
    <div className="quote-gallery">
      <div className="quote-gallery-grid">
        {columns.map((col, ci) => (
          <div key={ci} className="quote-gallery-col">
            {col.map((q, qi) => (
              <QuoteCard key={q.uri || `${ci}-${qi}`} quote={q} onExpandMedia={onExpandMedia} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function QuoteCard({ quote, onExpandMedia }) {
  const postUrl = `https://bsky.app/profile/${quote.author?.did}/post/${quote.uri.split('/').pop()}`;
  const hasMedia = quote.embeds && quote.embeds.length > 0;

  return (
    <div className="quote-card">
      <a href={postUrl} target="_blank" rel="noopener noreferrer" className="quote-card-link">
        <div className="quote-card-author">
          {quote.author?.avatar && (
            <img className="quote-card-avatar" src={quote.author.avatar} alt="" />
          )}
          <div className="quote-card-author-info">
            <span className="quote-card-name">{quote.author?.displayName}</span>
            <span className="quote-card-handle">@{quote.author?.handle}</span>
          </div>
        </div>
      </a>

      {quote.text && (
        <div className="quote-card-text">{quote.text}</div>
      )}

      {hasMedia && (
        <div className="quote-card-media">
          {quote.embeds.map((m, i) => (
            <QuoteMediaItem
              key={i}
              media={m}
              onExpand={() => {
                if (m.type === 'image') onExpandMedia({ media: m });
              }}
            />
          ))}
        </div>
      )}

      {quote.createdAt && (
        <div className="quote-card-date">
          {new Date(quote.createdAt).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
          })}
        </div>
      )}
    </div>
  );
}

function QuoteMediaItem({ media, onExpand }) {
  if (media.type === 'image') {
    return (
      <div className="quote-card-image" onClick={onExpand}>
        <img src={media.thumb} alt={media.alt} loading="lazy" />
      </div>
    );
  }

  if (media.type === 'video') {
    return (
      <div className="quote-card-video">
        {media.playlist ? (
          <video src={media.playlist} poster={media.thumbnail} controls preload="metadata" playsInline />
        ) : media.thumbnail ? (
          <img src={media.thumbnail} alt={media.alt || 'Video'} loading="lazy" />
        ) : null}
      </div>
    );
  }

  if (media.type === 'external') {
    return (
      <a href={media.uri} target="_blank" rel="noopener noreferrer" className="quote-card-external">
        {media.thumb && <img src={media.thumb} alt="" loading="lazy" />}
        <div className="quote-card-ext-body">
          <div className="quote-card-ext-title">{media.title}</div>
          <div className="quote-card-ext-url">{new URL(media.uri).hostname}</div>
        </div>
      </a>
    );
  }

  return null;
}

function ThreadPost({ post, isFirst, isLast, expandedMedia, onExpandMedia }) {
  const media = extractMedia(post.embed);
  const date = new Date(post.createdAt);
  const postUrl = `https://bsky.app/profile/${post.author.did}/post/${post.uri.split('/').pop()}`;

  const cls = ['thread-post'];
  if (isFirst) cls.push('thread-post-first');
  if (post.isOp) cls.push('thread-post-op');
  else cls.push('thread-post-other');

  return (
    <div className={cls.join(' ')}>
      <div className="thread-gutter">
        <img
          className="thread-avatar"
          src={post.author.avatar || ''}
          alt=""
          onError={e => { e.target.style.display = 'none'; }}
        />
        {!isLast && <div className="thread-line" />}
      </div>

      <div className="thread-content">
        <div className="thread-author">
          <span className="thread-name">{post.author.displayName}</span>
          {post.isOp && <span className="thread-op-badge">OP</span>}
          <span className="thread-handle">@{post.author.handle}</span>
          <a href={postUrl} target="_blank" rel="noopener noreferrer" className="thread-time">
            {formatTime(date)}
          </a>
        </div>

        {post.text && (
          <div className="thread-text">{renderText(post.text, post.facets)}</div>
        )}

        {media.length > 0 && (
          <div className="thread-media">
            {media.map((m, mi) => (
              <MediaItem
                key={mi}
                media={m}
                onClick={() => {
                  if (m.type === 'image') onExpandMedia({ media: m });
                }}
              />
            ))}
          </div>
        )}

        <div className="thread-engagement">
          <span title="Replies">{post.replyCount}</span>
          <span title="Reposts">{post.repostCount}</span>
          <span title="Likes">{post.likeCount}</span>
        </div>
      </div>
    </div>
  );
}

function MediaItem({ media, onClick }) {
  if (media.type === 'image') {
    return (
      <div className="thread-media-image" onClick={onClick}>
        <img src={media.thumb} alt={media.alt} loading="lazy" />
        {media.alt && <span className="thread-media-alt" title={media.alt}>ALT</span>}
      </div>
    );
  }

  if (media.type === 'video') {
    return (
      <div className="thread-media-video">
        {media.playlist ? (
          <video
            src={media.playlist}
            poster={media.thumbnail}
            controls
            preload="metadata"
            playsInline
          />
        ) : media.thumbnail ? (
          <img src={media.thumbnail} alt={media.alt || 'Video thumbnail'} />
        ) : (
          <div className="thread-media-placeholder">Video</div>
        )}
      </div>
    );
  }

  if (media.type === 'external') {
    return (
      <a
        href={media.uri}
        target="_blank"
        rel="noopener noreferrer"
        className="thread-media-card"
      >
        {media.thumb && (
          <img className="thread-card-thumb" src={media.thumb} alt="" loading="lazy" />
        )}
        <div className="thread-card-body">
          <div className="thread-card-title">{media.title}</div>
          {media.description && (
            <div className="thread-card-desc">{media.description}</div>
          )}
          <div className="thread-card-url">{new URL(media.uri).hostname}</div>
        </div>
      </a>
    );
  }

  if (media.type === 'quote') {
    const quoteUrl = `https://bsky.app/profile/${media.author?.did}/post/${media.uri.split('/').pop()}`;
    return (
      <a href={quoteUrl} target="_blank" rel="noopener noreferrer" className="thread-media-quote">
        <div className="thread-quote-author">
          {media.author?.avatar && (
            <img className="thread-quote-avatar" src={media.author.avatar} alt="" />
          )}
          <span className="thread-name">{media.author?.displayName}</span>
          <span className="thread-handle">@{media.author?.handle}</span>
        </div>
        {media.text && <div className="thread-quote-text">{media.text}</div>}
        {media.embeds?.length > 0 && (
          <div className="thread-quote-media">
            {media.embeds.map((e, i) => (
              <MediaItem key={i} media={e} onClick={() => {}} />
            ))}
          </div>
        )}
      </a>
    );
  }

  return null;
}

function MediaLightbox({ media, onClose }) {
  return (
    <div className="photo-lightbox" onClick={onClose}>
      <div className="photo-lightbox-inner" onClick={e => e.stopPropagation()}>
        <img src={media.fullsize || media.thumb} alt={media.alt || ''} />
        {media.alt && (
          <div className="photo-lightbox-meta">
            <p className="photo-lightbox-alt">{media.alt}</p>
          </div>
        )}
        <button className="photo-lightbox-close" onClick={onClose}>&times;</button>
      </div>
    </div>
  );
}

/**
 * Render post text with facet links.
 * ATProto facets use byte offsets; we convert to character-level for rendering.
 */
function renderText(text, facets) {
  if (!facets || facets.length === 0) return text;

  // Convert text to byte array for offset mapping
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);

  // Sort facets by byteStart
  const sorted = [...facets].sort((a, b) =>
    (a.index?.byteStart || 0) - (b.index?.byteStart || 0)
  );

  const parts = [];
  let lastByte = 0;
  const decoder = new TextDecoder();

  for (const facet of sorted) {
    const start = facet.index?.byteStart ?? 0;
    const end = facet.index?.byteEnd ?? 0;
    if (start < lastByte || end <= start) continue;

    // Text before this facet
    if (start > lastByte) {
      parts.push(decoder.decode(bytes.slice(lastByte, start)));
    }

    const facetText = decoder.decode(bytes.slice(start, end));
    const feature = facet.features?.[0];

    if (feature?.$type === 'app.bsky.richtext.facet#link') {
      parts.push(
        <a key={start} href={feature.uri} target="_blank" rel="noopener noreferrer" className="thread-link">
          {facetText}
        </a>
      );
    } else if (feature?.$type === 'app.bsky.richtext.facet#mention') {
      parts.push(
        <a key={start} href={`https://bsky.app/profile/${feature.did}`} target="_blank" rel="noopener noreferrer" className="thread-mention">
          {facetText}
        </a>
      );
    } else if (feature?.$type === 'app.bsky.richtext.facet#tag') {
      parts.push(
        <a key={start} href={`https://bsky.app/hashtag/${encodeURIComponent(feature.tag)}`} target="_blank" rel="noopener noreferrer" className="thread-tag">
          {facetText}
        </a>
      );
    } else {
      parts.push(facetText);
    }

    lastByte = end;
  }

  // Remaining text
  if (lastByte < bytes.length) {
    parts.push(decoder.decode(bytes.slice(lastByte)));
  }

  return parts;
}

function formatTime(date) {
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function countMedia(posts) {
  return posts.reduce((n, p) => n + extractMedia(p.embed).length, 0);
}

function countAuthors(posts) {
  return new Set(posts.map(p => p.author.did)).size;
}
