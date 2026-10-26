import { useEffect, useRef, useState } from "react";
import { IMAGE_TYPES } from "@maintenance/shared";
import { moveGalleryImage, readGalleryImage, type GalleryEntry } from "../lib/gallery";
import { DEFAULT_IMAGE_CROP, imageCropStyle } from "../lib/imageCrop";
import { ImageViewDialog } from "./ImageViewDialog";
import { ImageCropDialog } from "./ImageCropDialog";

export function GalleryDialog({ images, onCancel, onSubmit }: {
  images: GalleryEntry[];
  onCancel: () => void;
  onSubmit: (images: GalleryEntry[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(images);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<number | null>(null);
  const [cropImage, setCropImage] = useState<GalleryEntry | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const active = useRef(true);
  const pointer = useRef<{ id: string; pointerId: number; x: number; y: number } | null>(null);
  const target = useRef<string | null>(null);

  useEffect(() => {
    active.current = true;
    const element = dialog.current;
    element?.showModal();
    return () => { active.current = false; element?.close(); };
  }, []);

  const move = (id: string, targetId: string) => {
    setDraft((current) => moveGalleryImage(current, current.findIndex((image) => image.id === id), current.findIndex((image) => image.id === targetId)));
    setAnnouncement("Image moved. The first image is the cover photo.");
  };
  const cancelDrag = () => {
    pointer.current = null;
    target.current = null;
    setDragging(null);
    setDropTarget(null);
  };

  return <dialog ref={dialog} className="item-dialog gallery-dialog" aria-labelledby="gallery-title" onCancel={(event) => {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    event.stopPropagation();
    if (pointer.current) cancelDrag();
    else onCancel();
  }} onKeyDown={(event) => {
    if (event.key === "Escape" && pointer.current) {
      event.preventDefault();
      event.stopPropagation();
      cancelDrag();
    }
  }}>
    <div className="gallery-header">
      <h3 id="gallery-title">Edit gallery</h3>
      <button type="button" className="icon-button" aria-label="Close gallery" onClick={onCancel}>×</button>
    </div>
    {error && <div className="alert" role="alert">{error}</div>}
    <p className="sr-only" aria-live="polite">{announcement}</p>
    <div className="gallery-grid">
      {draft.map((image, index) => <div key={image.id} data-gallery-image={image.id} className={`gallery-card${dragging === image.id ? " is-dragging" : ""}${dropTarget === image.id ? " is-drop-target" : ""}`}>
        <div className="gallery-card-header">
          <span>{index === 0 ? "Cover photo" : `Image ${index + 1}`}</span>
          <button type="button" className="gallery-drag-handle" aria-label={`Reorder image ${index + 1}. Use arrow keys to move.`}
            onKeyDown={(event) => {
              const offset = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : 0;
              if (!offset) return;
              event.preventDefault();
              if (draft[index + offset]) move(image.id, draft[index + offset].id);
            }}
            onPointerDown={(event) => {
              if (event.button !== 0 || !event.isPrimary) return;
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              pointer.current = { id: image.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
            }}
            onPointerMove={(event) => {
              const start = pointer.current;
              if (!start || start.pointerId !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) return;
              setDragging(start.id);
              const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-gallery-image]");
              target.current = element?.dataset.galleryImage ?? null;
              setDropTarget(target.current);
              const bounds = dialog.current!.getBoundingClientRect();
              if (event.clientY < bounds.top + 70) dialog.current!.scrollBy(0, -20);
              if (event.clientY > bounds.bottom - 70) dialog.current!.scrollBy(0, 20);
            }}
            onPointerUp={(event) => {
              if (pointer.current?.pointerId !== event.pointerId) return;
              if (target.current) move(pointer.current.id, target.current);
              cancelDrag();
            }}
            onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}>&#9776;</button>
        </div>
        <button type="button" className="gallery-thumbnail" aria-label={`Preview image ${index + 1}`} onClick={() => setPreview(index)}>
          <div className="item-image-frame"><img src={image.source} alt={image.caption || `Image ${index + 1}`} style={imageCropStyle(image.crop)} draggable={false} onError={() => setFailedImages((current) => current.includes(image.id) ? current : [...current, image.id])} /></div>
        </button>
        {failedImages.includes(image.id) && <p role="alert">Could not load this image. Try previewing it or upload it again.</p>}
        <label>Caption (optional)<textarea rows={2} maxLength={2000} value={image.caption ?? ""} onChange={(event) => {
          const caption = event.currentTarget.value;
          setDraft((current) => current.map((entry) => entry.id === image.id ? { ...entry, caption } : entry));
        }} /></label>
        <div className="gallery-card-actions">
          <button type="button" className="text-button" onClick={() => setCropImage(image)}>Edit crop</button>
          <button type="button" className="text-button" aria-label={`Remove image ${index + 1}`} onClick={() => setDraft((current) => current.filter((entry) => entry.id !== image.id))}>Remove</button>
        </div>
      </div>)}
      <label className="gallery-card gallery-upload" aria-busy={reading}>
        <span aria-hidden="true">+</span>
        <input type="file" multiple aria-label="Add gallery images" accept={IMAGE_TYPES.join(",")} disabled={reading} onChange={async (event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (!files.length) return;
          setReading(true);
          setError("");
          const added: GalleryEntry[] = [];
          const errors: string[] = [];
          for (const file of files) {
            try { added.push(await readGalleryImage(file)); }
            catch (reason) { errors.push(reason instanceof Error ? reason.message : `Could not read ${file.name}.`); }
            if (!active.current) return;
          }
          setDraft((current) => [...current, ...added]);
          setError(errors.join(" "));
          setReading(false);
        }} />
        {reading && <span className="gallery-upload-status" role="status">Reading images...</span>}
      </label>
    </div>
    <div className="form-actions">
      <button type="button" className="button subtle" onClick={onCancel}>Cancel</button>
      <button type="button" className="button primary" disabled={reading} onClick={() => onSubmit(draft)}>Done</button>
    </div>
    {preview !== null && <ImageViewDialog images={draft} initialIndex={preview} onClose={() => setPreview(null)} />}
    {cropImage && <ImageCropDialog source={cropImage.source} crop={cropImage.crop ?? DEFAULT_IMAGE_CROP} onCancel={() => setCropImage(null)} onSubmit={(crop) => {
      setDraft((current) => current.map((entry) => entry.id === cropImage.id ? { ...entry, crop } : entry));
      setCropImage(null);
    }} />}
  </dialog>;
}
