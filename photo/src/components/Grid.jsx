import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { thumbUrl, imageUrl } from '../App.jsx';

const PAGE_SIZE = 48;

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
  const visible = images.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < images.length;
  const sentinelRef = useRef(null);
  const colCount = useColumnCount();

  // Reset page when images change (new sync)
  useEffect(() => setPage(1), [images]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setPage(p => p + 1); },
      { rootMargin: '600px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, page]);

  // Distribute images into columns by round-robin — stable across page loads.
  // Unlike CSS columns which reflow everything when items are added,
  // this assigns each image a fixed column index.
  const columns = useMemo(() => {
    const cols = Array.from({ length: colCount }, () => []);
    for (let i = 0; i < visible.length; i++) {
      cols[i % colCount].push(visible[i]);
    }
    return cols;
  }, [visible, colCount]);

  return (
    <>
      <div className="photo-grid-info">
        Showing {visible.length} of {images.length} images
      </div>
      <div className="photo-grid">
        {columns.map((col, ci) => (
          <div key={ci} className="photo-grid-col">
            {col.map((img) => (
              <ImageCard
                key={`${img.did}-${img.rkey}-${img.cid}`}
                img={img}
                pdsUrlMap={pdsUrlMap}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
      </div>
      {hasMore && (
        <div ref={sentinelRef} className="photo-grid-load-more">
          <button onClick={() => setPage(p => p + 1)}>
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
function ImageCard({ img, pdsUrlMap, onSelect }) {
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

  const src = fallback
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

  return (
    <div className="photo-card" onClick={() => onSelect(img)} ref={cardRef}>
      <div className="photo-card-img" style={{ paddingBottom }}>
        {nearViewport ? (
          <img
            src={src}
            alt={img.alt}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={handleError}
            style={{ opacity: loaded ? 1 : 0 }}
          />
        ) : null}
      </div>
      {img.alt && (
        <div className="photo-card-alt">{img.alt}</div>
      )}
    </div>
  );
}
