import { IMAGE_TYPES, MAX_IMAGE_BYTES, MachineImageSchema, type GalleryImage, type ImageCrop, type Machine } from "@maintenance/shared";
import { api } from "./api";

export type GalleryEntry = {
  id: string;
  source: string;
  imageId?: string;
  caption?: string;
  crop?: ImageCrop;
};

export function machineGallery(machine?: Machine): GalleryEntry[] {
  if (machine?.gallery !== undefined) return machine.gallery.map((image) => ({
    id: image.imageId ?? image.url!,
    source: image.imageId ? api.imageUrl(image.imageId) : image.url!,
    imageId: image.imageId,
    caption: image.caption,
    crop: image.crop
  }));
  const source = machine?.imageData || (machine?.imageUrl && /^https?:\/\//i.test(machine.imageUrl) ? machine.imageUrl : undefined);
  return source ? [{ id: "legacy", source, crop: machine?.imageCrop }] : [];
}

export function moveGalleryImage(images: GalleryEntry[], from: number, to: number): GalleryEntry[] {
  if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) return images;
  const next = [...images];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

export async function readGalleryImage(file: File): Promise<GalleryEntry> {
  if (!IMAGE_TYPES.some((type) => type === file.type)) throw new Error(`${file.name}: choose a JPEG, PNG, GIF, or WebP image.`);
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name}: image must be nonempty and 5 MB or smaller.`);
  const source = MachineImageSchema.parse(await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read image."));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}. Please select the file again.`));
    reader.onabort = () => reject(new Error("Image reading was cancelled."));
    reader.readAsDataURL(file);
  }));
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Could not load ${file.name}. Please choose another file.`));
    image.src = source;
  });
  return { id: crypto.randomUUID(), source };
}

export async function saveGallery(images: GalleryEntry[], uploads: Map<string, string>): Promise<GalleryImage[]> {
  const gallery: GalleryImage[] = [];
  for (const image of images) {
    let imageId = image.imageId ?? uploads.get(image.id);
    if (!imageId && image.source.startsWith("data:")) {
      imageId = (await api.uploadImage(image.source)).id;
      uploads.set(image.id, imageId);
    }
    gallery.push({
      ...(imageId ? { imageId } : { url: image.source }),
      caption: image.caption,
      crop: image.crop
    });
  }
  return gallery;
}
