import { useLayoutEffect, useRef, useState } from "react";

export function ImageViewDialog({ images, initialIndex = 0, onClose }: {
  images: { source: string; caption?: string }[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const image = images[index];
  const navigate = (offset: number) => {
    setIndex((current) => (current + offset + images.length) % images.length);
    setLoading(true);
    setError(false);
  };

  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return <dialog ref={dialog} className="image-view-dialog" aria-label="Gallery preview" onCancel={(event) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }} onKeyDown={(event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (images.length > 1 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      event.stopPropagation();
      navigate(event.key === "ArrowLeft" ? -1 : 1);
    }
  }}>
    <button type="button" className="image-view-close" aria-label="Close image" onClick={onClose}>×</button>
    <div className="image-view-heading" aria-live="polite">
      {image.caption && <p className="image-view-caption">{image.caption}</p>}
    </div>
    {images.length > 1 && <>
      <button type="button" className="image-view-arrow previous" aria-label="Previous image" onClick={() => navigate(-1)}>‹</button>
      <button type="button" className="image-view-arrow next" aria-label="Next image" onClick={() => navigate(1)}>›</button>
    </>}
    {loading && <p className="image-view-status" role="status">Loading image...</p>}
    {error && <div className="alert" role="alert">Could not load image. Try another image or close this preview and try again.</div>}
    <div className="image-view-content" hidden={error}>
      <img key={index} src={image.source} alt={image.caption || `Gallery image ${index + 1}`} onLoad={() => setLoading(false)} onError={() => {
        setLoading(false);
        setError(true);
      }} />
    </div>
  </dialog>;
}
