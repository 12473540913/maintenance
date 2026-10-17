import { useRef, useState } from "react";
import type { ImageCrop } from "@maintenance/shared";
import { DEFAULT_IMAGE_CROP, imageCropStyle, moveImageCrop } from "../lib/imageCrop";

export function ImageCropEditor({ source, crop, onChange, disabled, onReady }: {
  source: string;
  crop: ImageCrop;
  onChange: (crop: ImageCrop) => void;
  disabled: boolean;
  onReady: (ready: boolean) => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; crop: ImageCrop } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const changeZoom = (zoom: number) => onChange({ ...crop, zoom: Math.max(1, Math.min(3, zoom)) });

  return <div className="image-crop-editor">
    <p id="image-crop-help" className="image-crop-help">Drag the image to position the crop, or use the arrow keys. Adjust zoom below.</p>
    {failed && <div className="alert" role="alert">Could not load the image preview. Choose another image to adjust its crop.</div>}
    {!loaded && !failed && <p role="status">Loading image preview...</p>}
    <div className="item-image-frame image-crop-preview" tabIndex={loaded && !disabled ? 0 : -1} role="group" aria-label="Image crop position" aria-describedby="image-crop-help" aria-disabled={disabled || !loaded}
      onPointerDown={(event) => {
        if (disabled || !loaded || !event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, crop };
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        const img = image.current;
        if (disabled || !start || start.id !== event.pointerId || !img) return;
        onChange(moveImageCrop(start.crop, event.clientX - start.x, event.clientY - start.y,
          event.currentTarget.clientWidth, event.currentTarget.clientHeight, img.naturalWidth, img.naturalHeight));
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={(event) => {
        if (disabled || !loaded || !image.current) return;
        const step = event.shiftKey ? 30 : 10;
        const directions: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        const direction = directions[event.key];
        if (!direction) return;
        event.preventDefault();
        onChange(moveImageCrop(crop, ...direction, event.currentTarget.clientWidth, event.currentTarget.clientHeight,
          image.current.naturalWidth, image.current.naturalHeight));
      }}>
      <img ref={image} src={source} alt="Crop preview" draggable={false} style={imageCropStyle(crop)}
        onLoad={() => { setLoaded(true); onReady(true); }} onError={() => { setFailed(true); setLoaded(false); onReady(false); }} />
      <span className="image-crop-grid" aria-hidden="true" />
    </div>
    <div className="image-crop-controls">
      <button type="button" className="button subtle" disabled={disabled || !loaded || crop.zoom <= 1} onClick={() => changeZoom(crop.zoom - 0.1)} aria-label="Zoom out">-</button>
      <label className="image-crop-zoom">Zoom {Math.round(crop.zoom * 100)}%
        <input type="range" min="1" max="3" step="0.01" value={crop.zoom} disabled={disabled || !loaded} aria-label="Image zoom" onChange={(event) => changeZoom(Number(event.target.value))} />
      </label>
      <button type="button" className="button subtle" disabled={disabled || !loaded || crop.zoom >= 3} onClick={() => changeZoom(crop.zoom + 0.1)} aria-label="Zoom in">+</button>
      <button type="button" className="text-button" disabled={disabled || !loaded} onClick={() => onChange({ ...DEFAULT_IMAGE_CROP })}>Reset crop</button>
    </div>
  </div>;
}
