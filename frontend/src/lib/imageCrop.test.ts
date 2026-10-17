import { describe, expect, it } from "vitest";
import { ImageCropSchema, MachineSchema } from "@maintenance/shared";
import { DEFAULT_IMAGE_CROP, imageCropStyle, moveImageCrop } from "./imageCrop";

describe("image crop", () => {
  it("keeps legacy images centered at their original zoom", () => {
    expect(imageCropStyle()).toEqual({ objectPosition: "50% 50%", transformOrigin: "50% 50%", transform: "scale(1)" });
    expect(MachineSchema.parse({ code: "CAR", type: "Auto" }).imageCrop).toBeUndefined();
  });

  it("uses the same position as the zoom origin so framing stays inside the image", () => {
    expect(imageCropStyle({ x: 0, y: 1, zoom: 3 })).toEqual({
      objectPosition: "0% 100%", transformOrigin: "0% 100%", transform: "scale(3)"
    });
  });

  it("pans a landscape image without moving its non-overflowing axis", () => {
    expect(moveImageCrop(DEFAULT_IMAGE_CROP, 50, 50, 400, 300, 800, 300)).toEqual({ x: 0.375, y: 0.5, zoom: 1 });
  });

  it("pans a portrait image without moving its non-overflowing axis", () => {
    const crop = moveImageCrop(DEFAULT_IMAGE_CROP, 50, 100, 400, 300, 400, 900);
    expect(crop).toMatchObject({ x: 0.5, zoom: 1 });
    expect(crop.y).toBeCloseTo(1 / 3);
  });

  it("allows movement in both directions after zooming, at any preview size", () => {
    const crop = { ...DEFAULT_IMAGE_CROP, zoom: 2 };
    expect(moveImageCrop(crop, 40, 30, 400, 300, 800, 600)).toEqual({ x: 0.4, y: 0.4, zoom: 2 });
    expect(moveImageCrop(crop, 20, 15, 200, 150, 800, 600)).toEqual({ x: 0.4, y: 0.4, zoom: 2 });
  });

  it("clamps movement at every image edge", () => {
    const crop = { ...DEFAULT_IMAGE_CROP, zoom: 2 };
    expect(moveImageCrop(crop, 10000, -10000, 400, 300, 800, 600)).toEqual({ x: 0, y: 1, zoom: 2 });
    expect(moveImageCrop(crop, -10000, 10000, 400, 300, 800, 600)).toEqual({ x: 1, y: 0, zoom: 2 });
  });

  it("does not move an exactly fitting image or divide by floating-point noise", () => {
    expect(moveImageCrop(DEFAULT_IMAGE_CROP, 100, -100, 400, 300, 800, 600)).toEqual(DEFAULT_IMAGE_CROP);
    expect(moveImageCrop(DEFAULT_IMAGE_CROP, 100, -100, 399.999999, 300, 800, 600)).toEqual(DEFAULT_IMAGE_CROP);
  });

  it("retains crop settings in the machine payload", () => {
    const imageCrop = { x: 0.2, y: 0.9, zoom: 1.75 };
    expect(MachineSchema.parse({ code: "CAR", type: "Auto", imageCrop }).imageCrop).toEqual(imageCrop);
  });

  it.each([
    { x: -0.1, y: 0.5, zoom: 1 }, { x: 1.1, y: 0.5, zoom: 1 },
    { x: 0.5, y: -0.1, zoom: 1 }, { x: 0.5, y: 1.1, zoom: 1 },
    { x: 0.5, y: 0.5, zoom: 0.9 }, { x: 0.5, y: 0.5, zoom: 3.1 },
    { x: NaN, y: 0.5, zoom: 1 }, { x: 0.5, y: 0.5, zoom: Infinity }
  ])("rejects invalid framing: %j", (crop) => {
    expect(ImageCropSchema.safeParse(crop).success).toBe(false);
  });
});
