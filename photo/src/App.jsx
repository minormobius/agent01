import { useState, useCallback, useRef } from 'react';
import { resolveHandle } from './lib/resolve.js';
import { downloadRepo, parseCar } from './lib/repo.js';
import { initDuckDB, ingestNdjson, extractImages, filterPostsNdjson } from './lib/duckdb.js';
import Grid from './components/Grid.jsx';
import HandleTypeahead from './components/HandleTypeahead.jsx';
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
      let carBytes = await downloadRepo(identity.pdsUrl, identity.did, {
        onProgress: ({ received, total }) => {
          setProgress({ received, total });
        },
      });
      setProgress(null);

      // Parse CAR → NDJSON, then free CAR bytes immediately
      setStatus('parsing');
      let ndjson = await parseCar(carBytes, identity.did);
      carBytes = null; // free ~100MB

      // Filter to only post records before DuckDB ingest.
      // For large repos (225K records), this drops ~95% of data,
      // keeping only app.bsky.feed.post lines for image extraction.
      const { filtered, totalLines } = filterPostsNdjson(ndjson);
      ndjson = null; // free full NDJSON

      // Load into DuckDB
      setStatus('loading');
      await initDuckDB();
      const recordCount = await ingestNdjson(filtered, identity.did, totalLines);

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
    <div className="photo">
      <header className="photo-header">
        <div className="photo-title">
          <h1>ATPhoto</h1>
          <span className="photo-subtitle">Image Explorer</span>
        </div>

        <form className="photo-search" onSubmit={handleSubmit}>
          <HandleTypeahead
            value={input}
            onChange={setInput}
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
        <div className="photo-status">
          <div className="photo-status-text">
            {STATUS_MESSAGES[status] || status}
            {progress && progress.total ? (
              <span className="photo-progress">
                {' '}{formatBytes(progress.received)} / {formatBytes(progress.total)}
                {' '}({Math.round(progress.received / progress.total * 100)}%)
              </span>
            ) : progress ? (
              <span className="photo-progress"> {formatBytes(progress.received)}</span>
            ) : null}
          </div>
          <div className="photo-status-bar">
            <div
              className="photo-status-fill"
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
        <div className="photo-error">{error}</div>
      )}

      {/* Synced users */}
      {syncedUsers.length > 0 && (
        <div className="photo-users">
          {syncedUsers.map(u => (
            <div key={u.did} className="photo-user-chip">
              <span className="photo-user-handle">@{u.handle}</span>
              <span className="photo-user-stats">
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
        <div className="photo-empty">
          <p>Enter a Bluesky handle to explore their image posts.</p>
          <p className="photo-empty-sub">
            Downloads their repo, parses the CAR file with Rust/WASM,
            loads into DuckDB, and renders every image embed.
          </p>
        </div>
      )}

      {/* Lightbox */}
      {selectedImage && (
        <div className="photo-lightbox" onClick={() => setSelectedImage(null)}>
          <div className="photo-lightbox-inner" onClick={e => e.stopPropagation()}>
            <img
              src={imageUrl(selectedImage, pdsUrlMap.current)}
              alt={selectedImage.alt}
            />
            <div className="photo-lightbox-meta">
              {selectedImage.alt && <p className="photo-lightbox-alt">{selectedImage.alt}</p>}
              {selectedImage.text && <p className="photo-lightbox-text">{selectedImage.text}</p>}
              <p className="photo-lightbox-date">
                {new Date(selectedImage.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'short', day: 'numeric',
                })}
                <a
                  href={`https://bsky.app/profile/${selectedImage.did}/post/${selectedImage.rkey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="photo-lightbox-link"
                >
                  View post
                </a>
              </p>
            </div>
            <button className="photo-lightbox-close" onClick={() => setSelectedImage(null)}>
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
  const cid = ensureCid(img.cid);
  return `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(img.did)}&cid=${encodeURIComponent(cid)}`;
}

function thumbUrl(img) {
  const cid = ensureCid(img.cid);
  return `https://cdn.bsky.app/img/feed_thumbnail/plain/${img.did}/${cid}@jpeg`;
}

// Expose thumbUrl for Grid
export { imageUrl, thumbUrl };

// Convert raw SHA-256 hex hash to CIDv1 string (base32lower, raw codec)
// The WASM CAR parser outputs raw hex hashes from DAG-CBOR $link fields,
// but CDN and getBlob expect proper CID strings like "bafkrei..."
function ensureCid(raw) {
  // Already a proper CID string (starts with 'b' for base32lower or 'Q' for base58)
  if (/^[bQ]/.test(raw) && raw.length > 40) return raw;

  // Raw hex SHA-256 hash (64 hex chars = 32 bytes)
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    return hexToCidV1Raw(raw);
  }

  // Unknown format — return as-is and hope for the best
  return raw;
}

// base32lower alphabet (RFC 4648, lowercase, no padding)
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    out += B32[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

function hexToCidV1Raw(hex) {
  const hashBytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    hashBytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  // CIDv1: version(0x01) + codec(raw=0x55) + multihash(sha256=0x12, len=0x20) + digest
  const cidBytes = new Uint8Array(4 + hashBytes.length);
  cidBytes[0] = 0x01; // CID version 1
  cidBytes[1] = 0x55; // raw codec
  cidBytes[2] = 0x12; // SHA-256
  cidBytes[3] = 0x20; // 32 bytes digest length
  cidBytes.set(hashBytes, 4);
  return 'b' + base32Encode(cidBytes);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
