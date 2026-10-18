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

  return <dialog ref={dialog} className="image-view-dialog" aria-label="Full-size image" onCancel={(event) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }} onKeyDown={(event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }}>
    <button type="button" className="image-view-close" aria-label="Close image" onClick={onClose}>×</button>
    {loading && <p className="image-view-status" role="status">Loading image...</p>}
    {error && <div className="alert" role="alert">Could not load image. Close this popup and try again.</div>}
    <div className="image-view-content" hidden={error}>
      <img src={source} alt="Attached item image" onLoad={() => setLoading(false)} onError={() => {
        setLoading(false);
        setError(true);
      }} />
    </div>
  </dialog>;
}
