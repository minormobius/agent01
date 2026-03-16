import { useState, useCallback, useRef, useMemo } from 'react';
import { resolveHandle } from './lib/resolve.js';
import { downloadRepo, parseCar } from './lib/repo.js';
import { initDuckDB, ingestNdjson, extractImages, extractVideos, filterPostsNdjson } from './lib/duckdb.js';
import { fetchEngagement, getEngagement } from './lib/engagement.js';
import { extractColorsForImages, hasColorData, dominantColorRegion, computeEigenpalette, colorToHex, clearEigenCache } from './lib/colors.js';
import Grid from './components/Grid.jsx';
import FilterBar from './components/FilterBar.jsx';
import HandleTypeahead from './components/HandleTypeahead.jsx';
import './App.css';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'most-liked', label: 'Most liked' },
];

const DEFAULT_FILTERS = {
  aspect: 'all',
  altText: 'all',
  color: 'all',
  did: 'all',
  blobType: 'all',
  dateFrom: '',
  dateTo: '',
};

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
  const [sortBy, setSortBy] = useState('newest');
  const [engagementLoaded, setEngagementLoaded] = useState(false);
  const [engagementProgress, setEngagementProgress] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [videos, setVideos] = useState([]);
  const [colorsReady, setColorsReady] = useState(false);
  const [colorProgress, setColorProgress] = useState(null);
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

      // Extract images + videos
      setStatus('extracting');
      const allImages = await extractImages();
      const allVideos = await extractVideos();

      // Count images for this user
      const userImageCount = allImages.filter(img => img.did === identity.did).length;
      const userVideoCount = allVideos.filter(v => v.did === identity.did).length;

      setSyncedUsers(prev => [...prev, {
        did: identity.did,
        handle: identity.handle,
        pdsUrl: identity.pdsUrl,
        recordCount,
        imageCount: userImageCount,
        videoCount: userVideoCount,
      }]);
      setImages(allImages);
      setVideos(allVideos);
      setColorsReady(false); // reset colors for new data
      clearEigenCache();
      setStatus('ready');
      setInput('');

      // Start color extraction in background after render
      extractColorsInBackground(allImages);
    } catch (err) {
      setError(err.message);
      setStatus(images.length > 0 ? 'ready' : 'idle');
    }
  }, [syncedUsers, images.length]);

  const extractColorsInBackground = useCallback(async (imgs) => {
    setColorProgress({ done: 0, total: imgs.length });
    await extractColorsForImages(imgs, thumbUrl, (done, total) => {
      setColorProgress({ done, total });
    });
    setColorsReady(true);
    setColorProgress(null);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const handle = input.trim();
    if (!handle) return;
    syncUser(handle);
  };

  const handleSortChange = useCallback(async (newSort) => {
    setSortBy(newSort);
    const all = [...images, ...videos];
    if (newSort === 'most-liked' && !engagementLoaded && all.length > 0) {
      setEngagementProgress({ fetched: 0, total: 0 });
      await fetchEngagement(all, (fetched, total) => {
        setEngagementProgress({ fetched, total });
      });
      setEngagementLoaded(true);
      setEngagementProgress(null);
    }
  }, [images, videos, engagementLoaded]);

  // Merge images + videos into a single list for unified display
  const allMedia = useMemo(() => {
    const imgs = images.map(i => ({ ...i, type: 'image' }));
    const vids = videos.map(v => ({ ...v, type: 'video' }));
    return [...imgs, ...vids].sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
  }, [images, videos]);

  // Date range from data
  const dateRange = useMemo(() => {
    if (allMedia.length === 0) return null;
    let min = allMedia[allMedia.length - 1].createdAt || '';
    let max = allMedia[0].createdAt || '';
    return { min: min.slice(0, 10), max: max.slice(0, 10) };
  }, [allMedia]);

  // Apply filters
  const filteredMedia = useMemo(() => {
    return allMedia.filter(item => {
      // Blob type
      if (filters.blobType !== 'all' && item.type !== filters.blobType) return false;

      // Per-user
      if (filters.did !== 'all' && item.did !== filters.did) return false;

      // Alt text
      if (filters.altText === 'has' && !item.alt) return false;
      if (filters.altText === 'missing' && item.alt) return false;

      // Aspect ratio (only for images with ratio data)
      if (filters.aspect !== 'all' && item.aspectRatio) {
        const ratio = item.aspectRatio.width / item.aspectRatio.height;
        if (filters.aspect === 'landscape' && ratio <= 1.05) return false;
        if (filters.aspect === 'portrait' && ratio >= 0.95) return false;
        if (filters.aspect === 'square' && (ratio < 0.95 || ratio > 1.05)) return false;
      }

      // Color (only when color data is available)
      if (filters.color !== 'all' && colorsReady) {
        const region = dominantColorRegion(item.did, item.rkey, item.cid);
        if (region !== filters.color) return false;
      }

      // Date range
      if (filters.dateFrom && item.createdAt && item.createdAt.slice(0, 10) < filters.dateFrom) return false;
      if (filters.dateTo && item.createdAt && item.createdAt.slice(0, 10) > filters.dateTo) return false;

      return true;
    });
  }, [allMedia, filters, colorsReady]);

  // Apply sort to filtered results
  const sortedMedia = useMemo(() => {
    if (sortBy === 'oldest') {
      return [...filteredMedia].reverse();
    }
    if (sortBy === 'most-liked' && engagementLoaded) {
      return [...filteredMedia].sort((a, b) => {
        const ea = getEngagement(a.did, a.rkey);
        const eb = getEngagement(b.did, b.rkey);
        return (eb?.likeCount ?? 0) - (ea?.likeCount ?? 0);
      });
    }
    return filteredMedia; // newest (default)
  }, [filteredMedia, sortBy, engagementLoaded]);

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
          {syncedUsers.map(u => {
            const eigen = colorsReady ? computeEigenpalette(u.did) : null;
            return (
              <div key={u.did} className="photo-user-chip">
                {eigen && (
                  <div className="photo-eigen">
                    {eigen.slice(0, 6).map((c, i) => (
                      <span key={i} className="photo-eigen-dot" style={{ background: colorToHex(c) }} title={`${Math.round(c.pct * 100)}%`} />
                    ))}
                  </div>
                )}
                <span className="photo-user-handle">@{u.handle}</span>
                <span className="photo-user-stats">
                  {u.imageCount} images{u.videoCount > 0 && ` / ${u.videoCount} videos`} / {u.recordCount.toLocaleString()} records
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Sort + filter controls */}
      {allMedia.length > 0 && (
        <>
          <div className="photo-sort">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`photo-sort-btn${sortBy === opt.value ? ' active' : ''}`}
                onClick={() => handleSortChange(opt.value)}
                disabled={busy}
              >
                {opt.label}
              </button>
            ))}
            {engagementProgress && (
              <span className="photo-sort-loading">
                Fetching likes... {engagementProgress.fetched}/{engagementProgress.total}
              </span>
            )}
            {colorProgress && (
              <span className="photo-sort-loading">
                Extracting colors... {colorProgress.done}/{colorProgress.total}
              </span>
            )}
          </div>
          <FilterBar
            filters={filters}
            onChange={setFilters}
            syncedUsers={syncedUsers}
            hasColors={colorsReady}
            hasVideos={videos.length > 0}
            dateRange={dateRange}
          />
        </>
      )}

      {/* Media grid */}
      {sortedMedia.length > 0 && (
        <Grid
          images={sortedMedia}
          pdsUrlMap={pdsUrlMap.current}
          onSelect={setSelectedImage}
        />
      )}

      {/* No results after filtering */}
      {allMedia.length > 0 && sortedMedia.length === 0 && (
        <div className="photo-empty">
          <p>No media matches the current filters.</p>
          <p className="photo-empty-sub">
            <button className="photo-filter-clear" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Clear all filters
            </button>
          </p>
        </div>
      )}

      {/* Empty state */}
      {status === 'idle' && allMedia.length === 0 && (
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
            {selectedImage.type === 'video' ? (
              <video
                src={imageUrl(selectedImage, pdsUrlMap.current)}
                controls
                autoPlay
                style={{ maxWidth: '100%', maxHeight: '70vh' }}
              />
            ) : (
              <img
                src={imageUrl(selectedImage, pdsUrlMap.current)}
                alt={selectedImage.alt}
              />
            )}
            <div className="photo-lightbox-meta">
              {selectedImage.alt && <p className="photo-lightbox-alt">{selectedImage.alt}</p>}
              {selectedImage.text && <p className="photo-lightbox-text">{selectedImage.text}</p>}
              <p className="photo-lightbox-date">
                {new Date(selectedImage.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'short', day: 'numeric',
                })}
                {(() => {
                  const eng = getEngagement(selectedImage.did, selectedImage.rkey);
                  return eng ? (
                    <span className="photo-lightbox-engagement">
                      {eng.likeCount} likes &middot; {eng.repostCount} reposts
                    </span>
                  ) : null;
                })()}
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
