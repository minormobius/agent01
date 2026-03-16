import { useState } from 'react';
import { thumbUrl } from '../App.jsx';

export default function Grid({ images, pdsUrlMap, onSelect }) {
  return (
    <div className="photo-grid">
      {images.map((img, i) => (
        <ImageCard key={`${img.did}-${img.rkey}-${img.cid}`} img={img} onSelect={onSelect} />
      ))}
    </div>
  );
}

function ImageCard({ img, onSelect }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (errored) return null;

  const ar = img.aspectRatio;
  // Use aspect ratio for placeholder sizing if available
  const paddingBottom = ar ? `${(ar.height / ar.width) * 100}%` : '100%';

  return (
    <div className="photo-card" onClick={() => onSelect(img)}>
      <div className="photo-card-img" style={{ paddingBottom }}>
        <img
          src={thumbUrl(img)}
          alt={img.alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          style={{ opacity: loaded ? 1 : 0 }}
        />
      </div>
      {img.alt && (
        <div className="photo-card-alt">{img.alt}</div>
      )}
    </div>
  );
}
