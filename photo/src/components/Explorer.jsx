import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { fetchProfile, resolveHandle } from '../lib/resolve.js';
import { downloadRepo, parseCar } from '../lib/repo.js';
import { initDuckDB, ingestNdjson, extractImages, extractVideos, filterPostsToBytes } from '../lib/duckdb.js';
import { fetchEngagement, getEngagement } from '../lib/engagement.js';
import {
  extractColorsForImages, imageColorRegions, computeEigenpalette, colorToHex, clearEigenCache,
} from '../lib/colors.js';
import { init as authInit } from '../lib/auth.js';
import { loadAlbums } from '../lib/pds.js';
import { addToAlbum } from '../lib/arena.js';
import { blobUrl, fullUrl, postUrl, proxied, shopUrl, thumbUrl } from '../lib/urls.js';
import {
  DEFAULT_FILTERS, applyFilters, dateRangeOf, mergeMedia, sortMedia,
} from '../lib/filters.js';
import { decodeState, encodeState, replaceQuery } from '../lib/urlstate.js';
import Grid from './Grid.jsx';
import FilterBar from './FilterBar.jsx';
import HandleTypeahead from './HandleTypeahead.jsx';

// Explorer.jsx — the masonry gallery, formerly App.jsx's `GalleryView`.
//
// Moved into its own module so `React.lazy` can hold it (and DuckDB, and the CAR
// parser) out of the landing page's bundle, and so the filter/sort rules could
// move to lib/filters.js where a selftest can reach them.
//
// It reads public archives and nothing else. Uploading and curating moved to
// `/albums` (`Arena.jsx`) — this page was quietly two programs sharing a
// header. What is left of the connection is one line in the lightbox: any
// picture on screen can be copied into an album of yours.

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'most-liked', label: 'Most liked' },
];

const STATUS_MESSAGES = {
  resolving: 'Resolving handle…',
  downloading: 'Downloading repo…',
  parsing: 'Parsing CAR…',
  loading: 'Loading into DuckDB…',
  extracting: 'Extracting images…',
};

export default function Explorer({ themeToggle }) {
  const initial = useRef(decodeState(window.location.search)).current;

  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [images, setImages] = useState([]);
  const [syncedUsers, setSyncedUsers] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [sortBy, setSortBy] = useState(initial.sortBy);
  const [engagementLoaded, setEngagementLoaded] = useState(false);
  const [engagementProgress, setEngagementProgress] = useState(null);
  const [filters, setFilters] = useState(initial.filters);
  const [videos, setVideos] = useState([]);
  const pdsUrlMap = useRef({});

  // Colour sampling is now opt-in — see `startColorSampling`.
  const [colorState, setColorState] = useState('idle'); // idle | running | ready | failed
  const [colorProgress, setColorProgress] = useState(null);

  // The only thing left of the arena here: if you happen to be signed in, any
  // picture on screen can be copied into one of your albums. The sign-in
  // itself, the uploads and the curating all live at /albums now.
  const [session, setSession] = useState(null);
  const [albums, setAlbums] = useState([]);

  useEffect(() => {
    authInit().then(async (user) => {
      if (!user) return;
      setSession(user);
      try {
        setAlbums(await loadAlbums());
      } catch { /* the gallery works fine without them */ }
    });
  }, []);

  const syncUser = useCallback(async (handle) => {
    setError(null);
    setProgress(null);

    try {
      setStatus('resolving');
      const identity = await resolveHandle(handle);

      if (syncedUsers.some(u => u.did === identity.did)) {
        setError(`Already synced: @${identity.handle}`);
        setStatus(images.length > 0 ? 'ready' : 'idle');
        return;
      }

      pdsUrlMap.current[identity.did] = identity.pdsUrl;

      setStatus('downloading');
      let carBytes = await downloadRepo(identity.pdsUrl, identity.did, {
        onProgress: ({ received, total }) => setProgress({ received, total }),
      });
      setProgress(null);

      // Free each stage as soon as the next one has what it needs — the CAR and
      // the NDJSON string are the two biggest objects this app ever holds.
      setStatus('parsing');
      let ndjson = await parseCar(carBytes, identity.did);
      carBytes = null;

      const { bytes, totalLines } = filterPostsToBytes(ndjson);
      ndjson = null;

      setStatus('loading');
      await initDuckDB();
      const recordCount = await ingestNdjson(bytes, identity.did, totalLines);

      setStatus('extracting');
      const allImages = await extractImages();
      const allVideos = await extractVideos();

      // A face reads faster than a handle, and the chip has to fit on a phone.
      // Fetched after the heavy work, never awaited for correctness.
      const profile = await fetchProfile(identity.did);

      setSyncedUsers(prev => [...prev, {
        did: identity.did,
        handle: profile?.handle || identity.handle,
        displayName: profile?.displayName || '',
        avatar: profile?.avatar || '',
        pdsUrl: identity.pdsUrl,
        recordCount,
        imageCount: allImages.filter(img => img.did === identity.did).length,
        videoCount: allVideos.filter(v => v.did === identity.did).length,
      }]);
      setImages(allImages);
      setVideos(allVideos);
      // New pictures invalidate whatever was sampled; the user can re-sample.
      setColorState('idle');
      clearEigenCache();
      setStatus('ready');
      setInput('');
    } catch (err) {
      setError(err.message);
      setStatus(images.length > 0 ? 'ready' : 'idle');
    }
  }, [syncedUsers, images.length]);

  // Handles named in the URL are synced on arrival — that is what makes a
  // shared link a shared *view*. Guarded by a ref because StrictMode runs
  // effects twice in development and each run would start a repo download.
  const autoSynced = useRef(false);
  useEffect(() => {
    if (autoSynced.current || !initial.handles.length) return;
    autoSynced.current = true;
    (async () => {
      for (const handle of initial.handles) await syncUser(handle);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // …and every change writes itself back, so the address bar is always the
  // state. `replaceState`, not `pushState`: toggling a filter pill is not
  // navigation, and one back-press should leave the gallery.
  useEffect(() => {
    replaceQuery(encodeState({
      handles: syncedUsers.map(u => u.handle),
      filters,
      sortBy,
    }));
  }, [syncedUsers, filters, sortBy]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const handle = input.trim();
    if (handle) syncUser(handle);
  };

  const handleSortChange = useCallback(async (newSort) => {
    setSortBy(newSort);
    const all = [...images, ...videos];
    if (newSort === 'most-liked' && !engagementLoaded && all.length > 0) {
      setEngagementProgress({ fetched: 0, total: 0 });
      await fetchEngagement(all, (fetched, total) => setEngagementProgress({ fetched, total }));
      setEngagementLoaded(true);
      setEngagementProgress(null);
    }
  }, [images, videos, engagementLoaded]);

  const allMedia = useMemo(
    () => mergeMedia({ images, videos }),
    [images, videos],
  );

  /** did → handle, for anything that wants to name a picture's author. */
  const handleOf = useCallback(
    (did) => syncedUsers.find((u) => u.did === did)?.handle || '',
    [syncedUsers],
  );

  const dateRange = useMemo(() => dateRangeOf(allMedia), [allMedia]);

  const colorRegions = useMemo(() => (
    colorState === 'ready'
      ? (item) => imageColorRegions(item.did, item.rkey, item.cid)
      : null
  ), [colorState]);

  const filteredMedia = useMemo(
    () => applyFilters(allMedia, filters, colorRegions),
    [allMedia, filters, colorRegions],
  );

  const sortedMedia = useMemo(
    () => sortMedia(filteredMedia, sortBy, engagementLoaded ? (i) => getEngagement(i.did, i.rkey) : null),
    [filteredMedia, sortBy, engagementLoaded],
  );

  /**
   * Sample every image's palette. This downloads each thumbnail, so it runs only
   * when the user asks for the colour filter — it used to fire automatically on
   * every sync, which was thousands of fetches for a feature most people never
   * open. The URLs go through `proxied()` because the sampler reads pixels back
   * out of a canvas and cdn.bsky.app sends no CORS header; without the proxy
   * every single load fails, which is exactly how this shipped.
   */
  const startColorSampling = useCallback(async () => {
    const targets = allMedia.filter(m => m.type === 'image');
    if (!targets.length) return;
    setColorState('running');
    setColorProgress({ done: 0, total: targets.length });
    const { sampled } = await extractColorsForImages(
      targets,
      (img) => proxied(thumbUrl(img, pdsUrlMap.current)),
      (done, total) => setColorProgress({ done, total }),
    );
    setColorProgress(null);
    // "Finished" is not "worked". Offering a filter with an empty cache behind
    // it is what made the old colour filter look functional while matching
    // nothing at all.
    setColorState(sampled > 0 ? 'ready' : 'failed');
  }, [allMedia]);

  const busy = !['idle', 'ready', 'error'].includes(status);
  const hasContent = allMedia.length > 0;

  return (
    <div className="photo">
      <header className="photo-header">
        <div className="photo-title">
          <a href="/" className="photo-home" title="All tools">◉</a>
          <h1>explore</h1>
        </div>

        <div className="photo-header-right">
          <a href="/albums" className="photo-nav-link">Albums</a>
          {themeToggle}
        </div>
      </header>

      {/* The handle box gets its own line. Sharing the header row with the
          title and the theme toggle put 502px of content in a 390px viewport,
          which is why the page looked half-used on a phone. */}
      <form className="photo-search photo-search-row" onSubmit={handleSubmit}>
        <HandleTypeahead value={input} onChange={setInput} disabled={busy} autoFocus />
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? 'Syncing…' : 'Sync'}
        </button>
      </form>

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
                width: progress?.total ? `${Math.round(progress.received / progress.total * 100)}%` : '100%',
                animation: progress?.total ? 'none' : 'pulse 1.5s ease-in-out infinite',
              }}
            />
          </div>
        </div>
      )}

      {error && <div className="photo-error">{error}</div>}

      {syncedUsers.length > 0 && (
        <div className="photo-users">
          {syncedUsers.map(u => {
            const eigen = colorState === 'ready' ? computeEigenpalette(u.did) : null;
            return (
              <div key={u.did} className="photo-user-chip">
                {u.avatar
                  ? <img className="photo-user-av" src={u.avatar} alt="" loading="lazy" />
                  : <span className="photo-user-av photo-user-av-ph" aria-hidden="true" />}
                <span className="photo-user-who">
                  <a
                    className="photo-user-handle"
                    href={`https://bsky.app/profile/${u.handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    @{u.handle}
                  </a>
                  <span className="photo-user-stats">
                    {u.imageCount.toLocaleString()} images
                    {u.videoCount > 0 && ` · ${u.videoCount} videos`}
                    {' · '}{u.recordCount.toLocaleString()} records
                  </span>
                </span>
                {eigen && (
                  <div className="photo-eigen">
                    {eigen.slice(0, 6).map((c, i) => (
                      <span
                        key={i}
                        className="photo-eigen-dot"
                        style={{ background: colorToHex(c) }}
                        title={`${Math.round(c.pct * 100)}%`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasContent && (
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
                Fetching likes… {engagementProgress.fetched}/{engagementProgress.total}
              </span>
            )}
          </div>
          <FilterBar
            filters={filters}
            onChange={setFilters}
            syncedUsers={syncedUsers}
            colorState={colorState}
            colorProgress={colorProgress}
            onSampleColors={startColorSampling}
            hasVideos={videos.length > 0}
            dateRange={dateRange}
          />
        </>
      )}

      {sortedMedia.length > 0 && (
        <Grid images={sortedMedia} pdsUrlMap={pdsUrlMap.current} onSelect={setSelectedImage} />
      )}

      {hasContent && sortedMedia.length === 0 && (
        <div className="photo-empty">
          <p>No media matches the current filters.</p>
          <p className="photo-empty-sub">
            <button className="photo-filter-clear" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Clear all filters
            </button>
          </p>
        </div>
      )}

      {status === 'idle' && !hasContent && (
        <div className="photo-empty">
          <p>Enter a Bluesky handle to explore every image that account has posted.</p>
          <p className="photo-empty-sub">
            {session
              ? 'Or upload images directly to your PDS.'
              : 'Sign in to upload images and build albums on your own PDS.'}
          </p>
        </div>
      )}

      {selectedImage && (
        <Lightbox
          image={selectedImage}
          pdsUrlMap={pdsUrlMap.current}
          session={session}
          albums={albums}
          handleOf={handleOf}
          onClose={() => setSelectedImage(null)}
        />
      )}
    </div>
  );
}

/**
 * The lightbox, extracted so it can own its own keyboard and focus behaviour.
 *
 * Three things it now does that it didn't: closes on Escape, takes focus when
 * it opens and gives it back when it closes, and asks the CDN for a
 * display-resolution rendition before falling back to the author's PDS. That
 * last one is worth ~1.2 MB per image opened, on someone else's bandwidth.
 */
function Lightbox({ image, pdsUrlMap, session, albums, handleOf, onClose }) {
  const [useBlob, setUseBlob] = useState(false);
  const [adding, setAdding] = useState(null);   // null | 'working' | 'done' | error string
  const closeRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => { setUseBlob(false); }, [image]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (returnFocusRef.current instanceof HTMLElement) returnFocusRef.current.focus();
    };
  }, [onClose]);

  const src = useBlob ? blobUrl(image, pdsUrlMap) : fullUrl(image, pdsUrlMap);
  const engagement = getEngagement(image.did, image.rkey);

  return (
    <div className="photo-lightbox" onClick={onClose} role="presentation">
      <div
        className="photo-lightbox-inner"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={image.alt || 'Image'}
      >
        {image.type === 'video' ? (
          <video src={blobUrl(image, pdsUrlMap)} controls autoPlay style={{ maxWidth: '100%', maxHeight: '70vh' }} />
        ) : (
          <img
            src={src}
            alt={image.alt}
            // The CDN has no rendition for some blobs (uploads, very old posts);
            // fall back to the original rather than showing a broken frame.
            onError={() => setUseBlob(true)}
          />
        )}
        <div className="photo-lightbox-meta">
          {image.alt && <p className="photo-lightbox-alt">{image.alt}</p>}
          {image.text && <p className="photo-lightbox-text">{image.text}</p>}
          <p className="photo-lightbox-date">
            {image.createdAt && new Date(image.createdAt).toLocaleDateString(undefined, {
              year: 'numeric', month: 'short', day: 'numeric',
            })}
            {engagement && (
              <span className="photo-lightbox-engagement">
                {engagement.likeCount} likes &middot; {engagement.repostCount} reposts
              </span>
            )}
            {image.source === 'post' && (
              <a href={postUrl(image)} target="_blank" rel="noopener noreferrer" className="photo-lightbox-link">
                View post
              </a>
            )}
            {image.source === 'arena' && <span className="photo-lightbox-source">Uploaded</span>}
          </p>

          {/* The archive's whole point is that these pictures are reachable.
              `src` rather than `fullUrl` deliberately: if the CDN had no
              rendition and we fell back to the original, that is the picture
              on screen and it is the one that should open in the editor. */}
          {image.type !== 'video' && src && (
            <p className="photo-lightbox-actions">
              <a className="photo-lightbox-shop" href={shopUrl(src, { alt: image.alt })}>
                Open in shop <span aria-hidden="true">→</span>
              </a>
              <span className="photo-lightbox-actions-note">
                edit it, then post it back from there
              </span>
            </p>
          )}

          {/* Add it to an album of your own. This copies the picture into
              your repo — a record pointing at someone else's blob resolves for
              nobody, and it is *your* album. lib/arena.js keeps the source did
              and rkey on the entry, so the album can always say where a
              picture came from. */}
          {image.type !== 'video' && (
            session && albums.length > 0 ? (
              <div className="photo-lightbox-albums">
                <span className="photo-lightbox-albums-label">
                  {adding === 'working' ? 'Copying into your repo…'
                    : adding === 'done' ? 'Added.'
                      : typeof adding === 'string' ? adding
                        : 'Add to album:'}
                </span>
                {adding !== 'working' && albums.map((album) => (
                  <button
                    key={album.rkey}
                    className="arena-btn-small"
                    onClick={async () => {
                      setAdding('working');
                      try {
                        await addToAlbum(album, image, pdsUrlMap, handleOf(image.did));
                        setAdding('done');
                      } catch (err) {
                        setAdding(err.message);
                      }
                    }}
                  >
                    {album.value.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="photo-lightbox-actions-note">
                <a href="/albums" className="photo-lightbox-link">
                  {session ? 'Make an album' : 'Sign in'}
                </a>{' '}to keep this one.
              </p>
            )
          )}
        </div>
        <button className="photo-lightbox-close" onClick={onClose} ref={closeRef} aria-label="Close">
          &times;
        </button>
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
