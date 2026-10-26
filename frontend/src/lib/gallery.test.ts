import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { machineGallery, moveGalleryImage, saveGallery } from "./gallery";

vi.mock("./api", () => ({ api: { imageUrl: (id: string) => `/api/images/${id}`, uploadImage: vi.fn() } }));
const id = "0123456789abcdef01234567";
const source = "data:image/png;base64,YQ==";

describe("item galleries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps legacy embedded images, URLs, and crop settings visible", () => {
    const crop = { x: 0.1, y: 0.9, zoom: 2 };
    expect(machineGallery({ code: "CAR", type: "Car", imageData: source, imageCrop: crop }))
      .toEqual([{ id: "legacy", source, crop }]);
    expect(machineGallery({ code: "CAR", type: "Car", imageUrl: "https://example.test/car.png" })[0].source).toBe("https://example.test/car.png");
    expect(machineGallery({ code: "CAR", type: "Car", imageUrl: "javascript:alert(1)" })).toEqual([]);
  });

  it("uses explicit galleries, including an empty gallery, instead of legacy fields", () => {
    expect(machineGallery({ code: "CAR", type: "Car", imageData: source, gallery: [] })).toEqual([]);
    const images = machineGallery({ code: "CAR", type: "Car", gallery: [{ imageId: id, caption: "Cover" }, { url: "https://example.test/car.png" }] });
    expect(images[0]).toMatchObject({ imageId: id, source: `/api/images/${id}`, caption: "Cover" });
    expect(images[1].source).toBe("https://example.test/car.png");
  });

  it("moves images and their captions and crops together, making the first the cover", () => {
    const images = [{ id: "a", source: "a", caption: "A" }, { id: "b", source: "b", caption: "B", crop: { x: 0, y: 1, zoom: 3 } }, { id: "c", source: "c" }];
    expect(moveGalleryImage(images, 1, 0)).toEqual([images[1], images[0], images[2]]);
    expect(moveGalleryImage(images, 0, 2)).toEqual([images[1], images[2], images[0]]);
    expect(images.map((image) => image.id)).toEqual(["a", "b", "c"]);
    expect(moveGalleryImage(images, -1, 2)).toBe(images);
    expect(moveGalleryImage(images, 0, 3)).toBe(images);
  });

  it("uploads only new embedded images and reuses successful uploads on retry", async () => {
    vi.mocked(api.uploadImage).mockResolvedValue({ id });
    const uploads = new Map<string, string>();
    const images = [{ id: "new", source, caption: "New" }, { id: "url", source: "https://example.test/car.png" }];
    const expected = [{ imageId: id, caption: "New" }, { url: "https://example.test/car.png" }];
    expect(await saveGallery(images, uploads)).toEqual(expected);
    expect(await saveGallery(images, uploads)).toEqual(expected);
    expect(api.uploadImage).toHaveBeenCalledExactlyOnceWith(source);
  });

  it("retains saved image references without reuploading and propagates upload errors", async () => {
    expect(await saveGallery([{ id, source: `/api/images/${id}`, imageId: id }], new Map())).toEqual([{ imageId: id }]);
    expect(api.uploadImage).not.toHaveBeenCalled();
    vi.mocked(api.uploadImage).mockRejectedValue(new Error("Upload failed"));
    await expect(saveGallery([{ id: "new", source }], new Map())).rejects.toThrow("Upload failed");
  });
});
