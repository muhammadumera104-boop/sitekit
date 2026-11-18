'use client';
import { useEffect, useState } from 'react';

export default function Gallery({ images, alt }) {
  const [i, setI] = useState(null);
  useEffect(() => {
    if (i === null) return undefined;
    const h = (e) => {
      if (e.key === 'Escape') setI(null);
      if (e.key === 'ArrowRight') setI((x) => (x + 1) % images.length);
      if (e.key === 'ArrowLeft') setI((x) => (x - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [i, images.length]);
  return (
    <>
      <div className="gal">
        {images.map((g, n) => (
          <button key={g.id} className="gal-item" onClick={() => setI(n)} aria-label={`Open photo ${n + 1}`}>
            <img src={g.url} alt={g.caption || alt} loading="lazy" />
          </button>
        ))}
      </div>
      {i !== null && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setI(null)}>
          <button className="lb-btn lb-close" aria-label="Close">✕</button>
          <button className="lb-btn lb-prev" aria-label="Previous" onClick={(e) => { e.stopPropagation(); setI((i - 1 + images.length) % images.length); }}>‹</button>
          <img src={images[i].url} alt={images[i].caption || alt} onClick={(e) => e.stopPropagation()} />
          <button className="lb-btn lb-next" aria-label="Next" onClick={(e) => { e.stopPropagation(); setI((i + 1) % images.length); }}>›</button>
        </div>
      )}
    </>
  );
}
