import { useState, useRef, useCallback, useEffect, useMemo, useLayoutEffect } from 'react';
import { thumbUrl, imageUrl } from '../App.jsx';

const PAGE_SIZE = 48;
// Reveal-sweep tuning.
const REVEAL_STEP_MS     = 30;
const REVEAL_COL_BIAS_MS = 12;
const REVEAL_MAX_MS      = 1400;
// Vertical gap between cards as a fraction of column width — kept in sync
// with the .photo-card margin so the masonry math matches the CSS.
const GAP_NORMALIZED = 0.06;

// Column-width slider bounds (pixels of target width per column).
const GRID_GAP_PX     = 16;
const COL_WIDTH_MIN   = 120;
const COL_WIDTH_MAX   = 560;
const COL_WIDTH_STEP  = 20;
const COL_WIDTH_KEY   = 'photo:colWidth';
const COL_WIDTH_DEFAULT = 280;

function readColWidth() {
  try {
    const v = parseInt(localStorage.getItem(COL_WIDTH_KEY) || '', 10);
    if (Number.isFinite(v) && v >= COL_WIDTH_MIN && v <= COL_WIDTH_MAX) return v;
  } catch {}
  return COL_WIDTH_DEFAULT;
}

function colCountFor(containerWidth, targetWidth) {
  if (!containerWidth) return 1;
  return Math.max(
    1,
    Math.floor((containerWidth + GRID_GAP_PX) / (targetWidth + GRID_GAP_PX)),
  );
}

export default function Grid({ images, pdsUrlMap, onSelect }) {
  const [page, setPage] = useState(1);
  // The boundary of the current reveal "wave". Cards with sequence < waveStart
  // skipped their animation (they were already on screen); cards >= waveStart
  // get a delay that lets them sweep in. setWaveStart(visible.length) right
  // before bumping the page is what keeps the sweep per-batch.
  const [waveStart, setWaveStart] = useState(0);

  // Container width via ResizeObserver; column count derives from it + the
  // user's target-width slider, so the grid fills any viewport and the user
  // controls how many columns by choosing how wide each one is.
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(() => (
    typeof window !== 'undefined' ? Math.max(0, window.innerWidth - 32) : 0
  ));
  const [targetColWidth, setTargetColWidth] = useState(readColWidth);

  useLayoutEffect(() => {
    if (containerRef.current) setContainerWidth(containerRef.current.clientWidth);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setContainerWidth(Math.floor(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const colCount = useMemo(
    () => colCountFor(containerWidth, targetColWidth),
    [containerWidth, targetColWidth],
  );

  const visible = images.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < images.length;
  const sentinelRef = useRef(null);

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

  const onWidthChange = useCallback((e) => {
    const v = parseInt(e.target.value, 10);
    if (!Number.isFinite(v)) return;
    setTargetColWidth(v);
    try { localStorage.setItem(COL_WIDTH_KEY, String(v)); } catch {}
  }, []);

  // True masonry: place each image into the shortest column at its turn,
  // weighted by the image's aspect ratio. Result is balanced columns
  // regardless of the mix of portraits, squares, and panoramas. delayMs
  // encodes a left-to-right top-to-bottom sweep so the load reads as a path.
  const columns = useMemo(() => {
    const cols = Array.from({ length: colCount }, () => ({ items: [], height: 0 }));
    for (let i = 0; i < visible.length; i++) {
      const ar = visible[i].aspectRatio;
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
      <div className="photo-grid-controls">
        <div className="photo-grid-info">
          Showing {visible.length} of {images.length} · {colCount} {colCount === 1 ? 'column' : 'columns'}
        </div>
        <label className="photo-grid-width-slider" title="Target column width">
          <span aria-hidden="true" className="photo-grid-width-icon">▤</span>
          <input
            type="range"
            min={COL_WIDTH_MIN}
            max={COL_WIDTH_MAX}
            step={COL_WIDTH_STEP}
            value={targetColWidth}
            onChange={onWidthChange}
            aria-label="Column width"
          />
          <span className="photo-grid-width-value">{targetColWidth}px</span>
        </label>
      </div>
      <div className="photo-grid" ref={containerRef}>
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
