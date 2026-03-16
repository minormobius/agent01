import { useState, useCallback, useRef } from 'react';
import { resolveHandle } from './lib/resolve.js';
import { downloadRepo, parseCar } from './lib/repo.js';
import { initDuckDB, ingestNdjson, extractImages } from './lib/duckdb.js';
import Grid from './components/Grid.jsx';
import './App.css';

const STATUS_MESSAGES = {
  resolving: 'Resolving handle...',
  downloading: 'Downloading repo...',
  parsing: 'Parsing CAR...',
  loading: 'Loading into DuckDB...',
  extracting: 'Extracting images...',
};

export default function App() {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle'); // idle | resolving | downloading | parsing | loading | extracting | ready | error
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [images, setImages] = useState([]);
  const [syncedUsers, setSyncedUsers] = useState([]); // [{ did, handle, pdsUrl, recordCount, imageCount }]
  const [selectedImage, setSelectedImage] = useState(null);
  const pdsUrlMap = useRef({}); // did → pdsUrl for image URLs

  const syncUser = useCallback(async (handle) => {
    setError(null);
    setProgress(null);

    try {
      // Resolve
      setStatus('resolving');
      const identity = await resolveHandle(handle);

      // Check if already synced
      if (syncedUsers.some(u => u.did === identity.did)) {
        setError(`Already synced: @${identity.handle}`);
        setStatus(images.length > 0 ? 'ready' : 'idle');
        return;
      }

      // Store PDS URL for image rendering
      pdsUrlMap.current[identity.did] = identity.pdsUrl;

      // Download
      setStatus('downloading');
      const carBytes = await downloadRepo(identity.pdsUrl, identity.did, {
        onProgress: ({ received, total }) => {
          setProgress({ received, total });
        },
      });
      setProgress(null);

      // Parse
      setStatus('parsing');
      const ndjson = await parseCar(carBytes, identity.did);

      // Load into DuckDB
      setStatus('loading');
      await initDuckDB();
      const recordCount = await ingestNdjson(ndjson, identity.did);

      // Extract images
      setStatus('extracting');
      const allImages = await extractImages();

      // Count images for this user
      const userImageCount = allImages.filter(img => img.did === identity.did).length;

      setSyncedUsers(prev => [...prev, {
        did: identity.did,
        handle: identity.handle,
        pdsUrl: identity.pdsUrl,
        recordCount,
        imageCount: userImageCount,
      }]);
      setImages(allImages);
      setStatus('ready');
      setInput('');
    } catch (err) {
      setError(err.message);
      setStatus(images.length > 0 ? 'ready' : 'idle');
    }
  }, [syncedUsers, images.length]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const handle = input.trim();
    if (!handle) return;
    syncUser(handle);
  };

  const busy = !['idle', 'ready', 'error'].includes(status);

  return (
    <div className="arena">
      <header className="arena-header">
        <div className="arena-title">
          <h1>Arena</h1>
          <span className="arena-subtitle">ATProto Image Explorer</span>
        </div>

        <form className="arena-search" onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Enter a handle (e.g. alice.bsky.social)"
            disabled={busy}
            autoFocus
          />
          <button type="submit" disabled={busy || !input.trim()}>
            {busy ? 'Syncing...' : 'Sync'}
          </button>
        </form>
      </header>

      {/* Status bar */}
      {busy && (
        <div className="arena-status">
          <div className="arena-status-text">
            {STATUS_MESSAGES[status] || status}
            {progress && progress.total ? (
              <span className="arena-progress">
                {' '}{formatBytes(progress.received)} / {formatBytes(progress.total)}
                {' '}({Math.round(progress.received / progress.total * 100)}%)
              </span>
            ) : progress ? (
              <span className="arena-progress"> {formatBytes(progress.received)}</span>
            ) : null}
          </div>
          <div className="arena-status-bar">
            <div
              className="arena-status-fill"
              style={{
                width: progress?.total
                  ? `${Math.round(progress.received / progress.total * 100)}%`
                  : '100%',
                animation: progress?.total ? 'none' : 'pulse 1.5s ease-in-out infinite',
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="arena-error">{error}</div>
      )}

      {/* Synced users */}
      {syncedUsers.length > 0 && (
        <div className="arena-users">
          {syncedUsers.map(u => (
            <div key={u.did} className="arena-user-chip">
              <span className="arena-user-handle">@{u.handle}</span>
              <span className="arena-user-stats">
                {u.imageCount} images / {u.recordCount.toLocaleString()} records
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Image grid */}
      {images.length > 0 && (
        <Grid
          images={images}
          pdsUrlMap={pdsUrlMap.current}
          onSelect={setSelectedImage}
        />
      )}

      {/* Empty state */}
      {status === 'idle' && images.length === 0 && (
        <div className="arena-empty">
          <p>Enter a Bluesky handle to explore their image posts.</p>
          <p className="arena-empty-sub">
            Downloads their repo, parses the CAR file with Rust/WASM,
            loads into DuckDB, and renders every image embed.
          </p>
        </div>
      )}

      {/* Lightbox */}
      {selectedImage && (
        <div className="arena-lightbox" onClick={() => setSelectedImage(null)}>
          <div className="arena-lightbox-inner" onClick={e => e.stopPropagation()}>
            <img
              src={imageUrl(selectedImage, pdsUrlMap.current)}
              alt={selectedImage.alt}
            />
            <div className="arena-lightbox-meta">
              {selectedImage.alt && <p className="arena-lightbox-alt">{selectedImage.alt}</p>}
              {selectedImage.text && <p className="arena-lightbox-text">{selectedImage.text}</p>}
              <p className="arena-lightbox-date">
                {new Date(selectedImage.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'short', day: 'numeric',
                })}
                <a
                  href={`https://bsky.app/profile/${selectedImage.did}/post/${selectedImage.rkey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="arena-lightbox-link"
                >
                  View post
                </a>
              </p>
            </div>
            <button className="arena-lightbox-close" onClick={() => setSelectedImage(null)}>
              &times;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function imageUrl(img, pdsUrlMap) {
  const pdsUrl = pdsUrlMap[img.did];
  if (!pdsUrl) return '';
  return `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(img.did)}&cid=${encodeURIComponent(img.cid)}`;
}

function thumbUrl(img) {
  return `https://cdn.bsky.app/img/feed_thumbnail/plain/${img.did}/${img.cid}@jpeg`;
}

// Expose thumbUrl for Grid
export { imageUrl, thumbUrl };

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
