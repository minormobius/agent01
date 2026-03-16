import { useState, useRef, useCallback, useEffect } from 'react';
import { thumbUrl, imageUrl } from '../App.jsx';

const PAGE_SIZE = 48;

export default function Grid({ images, pdsUrlMap, onSelect }) {
  const [page, setPage] = useState(1);
  const visible = images.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < images.length;
  const sentinelRef = useRef(null);

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

  return (
    <>
      <div className="photo-grid-info">
        Showing {visible.length} of {images.length} images
      </div>
      <div className="photo-grid">
        {visible.map((img) => (
          <ImageCard
            key={`${img.did}-${img.rkey}-${img.cid}`}
            img={img}
            pdsUrlMap={pdsUrlMap}
            onSelect={onSelect}
          />
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
      // CDN thumbnail failed — try direct PDS getBlob
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
