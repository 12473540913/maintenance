import { useLayoutEffect, useRef, useState } from "react";

export function ImageViewDialog({ source, onClose }: {
  source: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return <dialog ref={dialog} className="item-dialog image-view-dialog" aria-labelledby="image-view-title" onCancel={(event) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }} onKeyDown={(event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }}>
    <div className="image-view-header">
      <h3 id="image-view-title">Full-size image</h3>
      <button type="button" className="icon-button" aria-label="Close image" onClick={onClose}>×</button>
    </div>
    <p className="muted">Original image at full resolution. Scroll to see the entire image.</p>
    {loading && <p role="status">Loading image...</p>}
    {error && <div className="alert" role="alert">Could not load image. Close this popup and try again.</div>}
    <div className="image-view-content" tabIndex={0} role="region" aria-label="Full-size image, scroll to explore" hidden={error}>
      <img src={source} alt="Attached item image" onLoad={() => setLoading(false)} onError={() => {
        setLoading(false);
        setError(true);
      }} />
    </div>
  </dialog>;
}
