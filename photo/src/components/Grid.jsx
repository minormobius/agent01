import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { thumbUrl, imageUrl } from '../App.jsx';

const PAGE_SIZE = 48;
// Reveal-sweep tuning.
const REVEAL_STEP_MS    = 30;    // delay between successive cards in a wave
const REVEAL_COL_BIAS_MS = 12;   // small per-column offset for a diagonal feel
const REVEAL_MAX_MS     = 1400;  // cap so late items don't linger dark
// Vertical gap between cards as a fraction of column width — kept in sync
// with the .photo-card margin so the masonry math matches the CSS.
const GAP_NORMALIZED = 0.06;

function useColumnCount() {
  const [cols, setCols] = useState(() => getColumnCount());
  useEffect(() => {
    const onResize = () => setCols(getColumnCount());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return cols;
}

function getColumnCount() {
  const w = window.innerWidth;
  if (w <= 500) return 1;
  if (w <= 800) return 2;
  if (w <= 1200) return 3;
  return 4;
}

export default function Grid({ images, pdsUrlMap, onSelect }) {
  const [page, setPage] = useState(1);
  // The boundary of the current reveal "wave". Cards with sequence < waveStart
  // skipped their animation (they were already on screen); cards >= waveStart
  // get a delay that lets them sweep in. setWaveStart(visible.length) right
  // before bumping the page is what keeps the sweep per-batch.
  const [waveStart, setWaveStart] = useState(0);
  const visible = images.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < images.length;
  const sentinelRef = useRef(null);
  const colCount = useColumnCount();

  // Reset page + wave when the underlying list changes (new sync target).
  useEffect(() => { setPage(1); setWaveStart(0); }, [images]);

  const advancePage = useCallback(() => {
    setWaveStart(visible.length);
    setPage(p => p + 1);
  }, [visible.length]);

  // Infinite-scroll sentinel.
  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) advancePage(); },
      { rootMargin: '600px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, advancePage]);

  // True masonry: place each image into the shortest column at its turn,
  // weighted by aspect ratio. Result is balanced columns regardless of the
  // mix of portraits, squares, and panoramas. delayMs encodes a left-to-right
  // top-to-bottom sweep so the loading reads as a path, not chaos.
  const columns = useMemo(() => {
    const cols = Array.from({ length: colCount }, () => ({ items: [], height: 0 }));
    for (let i = 0; i < visible.length; i++) {
      const ar = visible[i].aspectRatio;
      // Clamp to defend against absurd metadata (very tall panoramas, etc.).
      const aspect = ar
        ? Math.max(0.25, Math.min(3, ar.height / ar.width))
        : 0.75;
      let target = 0;
      for (let c = 1; c < cols.length; c++) {
        if (cols[c].height < cols[target].height) target = c;
      }
      const seqInWave = Math.max(0, i - waveStart);
      const delayMs = Math.min(
        seqInWave * REVEAL_STEP_MS + target * REVEAL_COL_BIAS_MS,
        REVEAL_MAX_MS,
      );
      cols[target].items.push({ img: visible[i], delayMs });
      cols[target].height += aspect + GAP_NORMALIZED;
    }
    return cols;
  }, [visible, colCount, waveStart]);

  return (
    <>
      <div className="photo-grid-info">
        Showing {visible.length} of {images.length} items
      </div>
      <div className="photo-grid">
        {columns.map((col, ci) => (
          <div key={ci} className="photo-grid-col">
            {col.items.map(({ img, delayMs }) => (
              <ImageCard
                key={`${img.did}-${img.rkey}-${img.cid}`}
                img={img}
                delayMs={delayMs}
                pdsUrlMap={pdsUrlMap}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
      </div>
      {hasMore && (
        <div ref={sentinelRef} className="photo-grid-load-more">
          <button onClick={advancePage}>
            Load more ({images.length - visible.length} remaining)
          </button>
        </div>
      )}
    </>
  );
}

// ImageCard with viewport-aware unloading.
// When a card scrolls far off-screen (>2000px), the <img> is replaced
// with an empty placeholder div. This lets the browser release the
// decoded bitmap (~4MB per image) while keeping layout stable via
// the aspect-ratio padding. Re-entering the margin re-mounts the <img>.
function ImageCard({ img, delayMs, pdsUrlMap, onSelect }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [nearViewport, setNearViewport] = useState(false);
  const cardRef = useRef(null);

  // Observe whether this card is within 2000px of the viewport.
  // When it leaves that margin, we unmount the <img> to free memory.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setNearViewport(entry.isIntersecting);
      },
      { rootMargin: '2000px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ar = img.aspectRatio;
  const paddingBottom = ar ? `${(ar.height / ar.width) * 100}%` : '75%';

  // Arena uploads don't have CDN thumbnails — use getBlob directly
  const isArena = img.source === 'arena' || img.source === 'album';
  const src = (fallback || isArena)
    ? imageUrl(img, pdsUrlMap)
    : thumbUrl(img);

  const handleError = useCallback(() => {
    if (!fallback) {
      setFallback(true);
    } else {
      setErrored(true);
    }
  }, [fallback]);

  // Hide completely failed images — they're likely deleted/migrated blobs
  if (errored) return null;

  const isVideo = img.type === 'video';

  return (
    <div
      className="photo-card"
      onClick={() => onSelect(img)}
      ref={cardRef}
      style={{ '--reveal-delay': `${delayMs}ms` }}
    >
      <div className="photo-card-img" style={{ paddingBottom }}>
        {nearViewport ? (
          isVideo ? (
            <video
              src={imageUrl(img, pdsUrlMap)}
              preload="metadata"
              muted
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              onLoadedData={() => setLoaded(true)}
              onError={handleError}
            />
          ) : (
            <img
              src={src}
              alt={img.alt}
              loading="lazy"
              decoding="async"
              onLoad={() => setLoaded(true)}
              onError={handleError}
              style={{ opacity: loaded ? 1 : 0 }}
            />
          )
        ) : null}
        {isVideo && (
          <div className="photo-card-play">&#9654;</div>
        )}
      </div>
      {img.alt && (
        <div className="photo-card-alt">{img.alt}</div>
      )}
    </div>
  );
}
