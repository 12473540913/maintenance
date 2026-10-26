import { useEffect, useRef, useState } from "react";
import type { ImageCrop } from "@maintenance/shared";
import { ImageCropEditor } from "./ImageCropEditor";
import { api } from "../lib/api";

export function ImageCropDialog({ source, crop, onCancel, onSubmit }: {
  source: string;
  crop: ImageCrop;
  onCancel: () => void;
  onSubmit: (crop: ImageCrop) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(crop);
  const [ready, setReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const downloadImage = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      const response = await fetch(source, { credentials: source.startsWith(api.imageUrl("")) ? "include" : "same-origin" });
      if (!response.ok) throw new Error(`Server returned HTTP ${response.status}.`);
      const blob = await response.blob();
      if (!blob.size || !blob.type.startsWith("image/")) throw new Error("The download did not contain a valid image.");
      const extensions: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp" };
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `image${extensions[blob.type] ?? ""}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (reason) {
      setDownloadError(reason instanceof Error ? `Could not download image. ${reason.message}` : "Could not download image. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

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
      {downloadError && <div className="alert" role="alert">{downloadError}</div>}
      <div className="image-crop-dialog-actions">
        <button type="button" className="button subtle image-crop-download" onClick={downloadImage} disabled={!ready || downloading}>{downloading ? "Downloading..." : "Download image"}</button>
        <button type="button" className="button subtle" onClick={onCancel}>Cancel</button>
        <button type="submit" className="button primary" disabled={!ready}>Submit</button>
      </div>
    </form>
  </dialog>;
}
