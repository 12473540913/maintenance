import { useEffect, useRef, useState } from "react";
import type { ImageCrop } from "@maintenance/shared";
import { ImageCropEditor } from "./ImageCropEditor";

export function ImageCropDialog({ source, crop, onCancel, onSubmit }: {
  source: string;
  crop: ImageCrop;
  onCancel: () => void;
  onSubmit: (crop: ImageCrop) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(crop);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return <dialog ref={dialog} className="item-dialog image-crop-dialog" aria-labelledby="image-crop-title" onCancel={(event) => {
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  }} onKeyDown={(event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  }}>
    <form onSubmit={(event) => {
      event.preventDefault();
      event.stopPropagation();
      if (ready) onSubmit(draft);
    }}>
      <h3 id="image-crop-title">Edit image</h3>
      <ImageCropEditor source={source} crop={draft} onChange={setDraft} disabled={false} onReady={setReady} />
      <div className="image-crop-dialog-actions">
        <button type="button" className="button subtle" onClick={onCancel}>Cancel</button>
        <button type="submit" className="button primary" disabled={!ready}>Submit</button>
      </div>
    </form>
  </dialog>;
}
