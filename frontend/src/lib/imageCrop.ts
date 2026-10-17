import type { CSSProperties } from "react";
import type { ImageCrop } from "@maintenance/shared";

export const DEFAULT_IMAGE_CROP: ImageCrop = { x: 0.5, y: 0.5, zoom: 1 };

export function imageCropStyle(crop: ImageCrop = DEFAULT_IMAGE_CROP): CSSProperties {
  const position = `${crop.x * 100}% ${crop.y * 100}%`;
  return { objectPosition: position, transformOrigin: position, transform: `scale(${crop.zoom})` };
}

export function moveImageCrop(crop: ImageCrop, dx: number, dy: number, width: number, height: number, imageWidth: number, imageHeight: number): ImageCrop {
  const scale = Math.max(width / imageWidth, height / imageHeight) * crop.zoom;
  const overflowX = Math.max(0, imageWidth * scale - width);
  const overflowY = Math.max(0, imageHeight * scale - height);
  return {
    ...crop,
    x: overflowX > 0.01 ? Math.min(1, Math.max(0, crop.x - dx / overflowX)) : crop.x,
    y: overflowY > 0.01 ? Math.min(1, Math.max(0, crop.y - dy / overflowY)) : crop.y
  };
}
