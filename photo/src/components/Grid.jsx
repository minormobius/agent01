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

function ImageCard({ img, pdsUrlMap, onSelect }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [fallback, setFallback] = useState(false);

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

  return (
    <div className={`photo-card ${errored ? 'photo-card-errored' : ''}`} onClick={() => onSelect(img)}>
      <div className="photo-card-img" style={{ paddingBottom }}>
        {!errored ? (
          <img
            src={src}
            alt={img.alt}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={handleError}
            style={{ opacity: loaded ? 1 : 0 }}
          />
        ) : (
          <div className="photo-card-broken">
            <span>Failed to load</span>
          </div>
        )}
      </div>
      {img.alt && (
        <div className="photo-card-alt">{img.alt}</div>
      )}
    </div>
  );
}
