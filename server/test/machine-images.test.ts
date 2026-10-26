import express from "express";
import { GallerySchema, MachineImageSchema, MAX_IMAGE_BYTES } from "@maintenance/shared";
import { MongoClient, ObjectId } from "mongodb";
import type { Server } from "node:http";
import { ZodError } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../src/db/mongo.js";
import { crudRouter } from "../src/routes/crud.js";
import { imagesRouter } from "../src/routes/images.js";

vi.mock("../src/db/mongo.js", () => ({ getDb: vi.fn() }));

const image = `data:image/png;base64,${Buffer.from("test image").toString("base64")}`;

describe("machine image validation", () => {
  it.each(["jpeg", "png", "gif", "webp"])("accepts %s images", (type) => {
    const value = image.replace("image/png", `image/${type}`);
    expect(MachineImageSchema.parse(value)).toBe(value);
  });

  it.each([
    "https://example.test/image.png",
    "data:image/svg+xml;base64,PHN2Zy8+",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/png;base64,",
    "data:image/png;base64,not base64!",
    "data:image/png;base64,YQ="
  ])("rejects invalid image data: %s", (value) => {
    expect(MachineImageSchema.safeParse(value).success).toBe(false);
  });

  it("enforces the exact 5 MB decoded size boundary", () => {
    const atLimit = `data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES).toString("base64")}`;
    const overLimit = `data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES + 1).toString("base64")}`;
    expect(MachineImageSchema.safeParse(atLimit).success).toBe(true);
    expect(MachineImageSchema.safeParse(overLimit).success).toBe(false);
  });
});

describe("machine image persistence", () => {
  const id = new ObjectId();
  const userId = new ObjectId().toHexString();
  const database = new MongoClient("mongodb://localhost:27017/maintenance-test").db();
  const collection = database.collection("machines");
  vi.spyOn(database, "collection").mockReturnValue(collection);
  const insertOne = vi.spyOn(collection, "insertOne");
  const updateOne = vi.spyOn(collection, "updateOne");
  const find = vi.spyOn(collection, "find");
  const findOne = vi.spyOn(collection, "findOne");
  const countDocuments = vi.spyOn(collection, "countDocuments");
  const updateMany = vi.spyOn(collection, "updateMany");
  const createIndex = vi.spyOn(collection, "createIndex");
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.mocked(getDb).mockResolvedValue(database);
    insertOne.mockResolvedValue({ acknowledged: true, insertedId: id });
    updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null });
    countDocuments.mockResolvedValue(1);
    updateMany.mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null });
    createIndex.mockResolvedValue("expiresAt_1");
    const app = express();
    app.use(express.json({ limit: "8mb" }));
    app.use((_req, res, next) => { res.locals.user = { id: userId }; next(); });
    app.use("/api/images", imagesRouter);
    app.use("/api", crudRouter);
    app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(error instanceof ZodError ? 400 : 500).json({ error: error.message });
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    baseUrl = `http://127.0.0.1:${address.port}/api/machines`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    vi.clearAllMocks();
  });

  function save(method: "POST" | "PUT", data: Record<string, unknown>) {
    return fetch(method === "POST" ? baseUrl : `${baseUrl}/${id}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "CAR", type: "Car", status: "", ...data })
    });
  }

  it("uploads each image separately with owner scoping and an unsaved-upload TTL", async () => {
    const response = await fetch(baseUrl.replace("/machines", "/images"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: image })
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: id.toHexString() });
    expect(insertOne).toHaveBeenCalledWith(expect.objectContaining({ userId, data: image, expiresAt: expect.any(Date) }));
    expect(createIndex).toHaveBeenCalledWith({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  });

  it("serves original image bytes only for the authenticated owner", async () => {
    findOne.mockResolvedValue({ _id: id, userId, data: image });
    const response = await fetch(baseUrl.replace("/machines", `/images/${id}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(await response.text()).toBe("test image");
    expect(findOne).toHaveBeenCalledWith({ _id: id, userId });
    findOne.mockResolvedValue(null);
    expect((await fetch(baseUrl.replace("/machines", `/images/${id}`))).status).toBe(404);
  });

  it("rejects invalid image uploads and IDs", async () => {
    const response = await fetch(baseUrl.replace("/machines", "/images"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: "data:text/html;base64,YQ==" })
    });
    expect(response.status).toBe(400);
    expect((await fetch(baseUrl.replace("/machines", "/images/not-an-id"))).status).toBe(400);
    expect(insertOne).not.toHaveBeenCalled();
  });

  it("persists ordered gallery references, captions, and crops without embedding image content", async () => {
    const otherId = new ObjectId().toHexString();
    const gallery = [
      { imageId: otherId, caption: "New cover", crop: { x: 0.1, y: 0.9, zoom: 2 } },
      { imageId: id.toHexString(), caption: "" }
    ];
    countDocuments.mockResolvedValue(2);
    const response = await save("PUT", { gallery });
    expect(response.status).toBe(200);
    expect((await response.json()).gallery).toEqual(gallery);
    expect(updateOne).toHaveBeenCalledWith({ _id: id, userId }, { $set: expect.objectContaining({ gallery, imageData: "", imageUrl: "" }) });
    expect(countDocuments).toHaveBeenCalledWith({ _id: { $in: [new ObjectId(otherId), id] }, userId });
    expect(updateMany).toHaveBeenCalledWith({ _id: { $in: [new ObjectId(otherId), id] }, userId }, { $unset: { expiresAt: "" } });
    find.mockReturnValue({ toArray: async () => [{ _id: id, code: "CAR", type: "Car", gallery }] } as ReturnType<typeof collection.find>);
    expect((await (await fetch(baseUrl)).json())[0].gallery).toEqual(gallery);
  });

  it("uploads and saves a gallery with 20 MB of original images without exceeding the item document limit", async () => {
    const largeImage = `data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES).toString("base64")}`;
    const gallery: { imageId: string }[] = [];
    for (let index = 0; index < 4; index++) {
      const imageId = new ObjectId();
      insertOne.mockResolvedValueOnce({ acknowledged: true, insertedId: imageId });
      const response = await fetch(baseUrl.replace("/machines", "/images"), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: largeImage })
      });
      expect(response.status).toBe(201);
      gallery.push({ imageId: (await response.json()).id });
    }
    countDocuments.mockResolvedValue(gallery.length);
    expect((await save("POST", { gallery })).status).toBe(201);
    expect(database.collection).toHaveBeenCalledWith("images");
    expect(database.collection).toHaveBeenCalledWith("machines");
    expect(insertOne).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(insertOne.mock.calls[4][0]).length).toBeLessThan(2000);
  });

  it("clears the gallery and legacy image fields without resurrecting the old image", async () => {
    expect((await save("PUT", { gallery: [] })).status).toBe(200);
    expect(updateOne).toHaveBeenCalledWith({ _id: id, userId }, { $set: expect.objectContaining({ gallery: [], imageData: "", imageUrl: "" }) });
  });

  it("rejects missing or another user's image references before saving", async () => {
    countDocuments.mockResolvedValue(0);
    expect((await save("POST", { gallery: [{ imageId: id.toHexString() }] })).status).toBe(400);
    expect(insertOne).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("validates gallery references, caption length, crop, and duplicates", () => {
    expect(GallerySchema.safeParse([{ url: "https://example.test/old.png", caption: "Legacy" }]).success).toBe(true);
    for (const gallery of [
      [{}], [{ url: "javascript:alert(1)" }], [{ imageId: "bad" }],
      [{ imageId: id.toHexString(), url: "https://example.test/image.png" }],
      [{ imageId: id.toHexString(), caption: "x".repeat(2001) }],
      [{ imageId: id.toHexString(), crop: { x: 0.5, y: 0.5, zoom: 4 } }],
      [{ imageId: id.toHexString() }, { imageId: id.toHexString() }]
    ]) expect(GallerySchema.safeParse(gallery).success).toBe(false);
  });

  it("inserts image content into MongoDB and returns it on reload", async () => {
    const largeImage = `data:image/png;base64,${Buffer.alloc(150_000).toString("base64")}`;
    const response = await save("POST", { imageData: largeImage });
    expect(response.status).toBe(201);
    expect(insertOne).toHaveBeenCalledWith(expect.objectContaining({ imageData: largeImage, userId }));
    expect((await response.json()).imageData).toBe(largeImage);
    find.mockReturnValue({ toArray: async () => [{ _id: id, code: "CAR", type: "Car", imageData: largeImage }] } as ReturnType<typeof collection.find>);
    expect((await (await fetch(baseUrl)).json())[0].imageData).toBe(largeImage);
    expect(find).toHaveBeenCalledWith({ userId, archived: { $ne: true } });
  });

  it("replaces an image and clears the legacy URL", async () => {
    expect((await save("PUT", { imageData: image, imageUrl: "" })).status).toBe(200);
    expect(updateOne).toHaveBeenCalledWith({ _id: id, userId }, { $set: expect.objectContaining({ imageData: image, imageUrl: "" }) });
  });

  it("streams image lists larger than Cloud Run's 32 MiB buffered response limit", async () => {
    const largeImage = `data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES).toString("base64")}`;
    const rows = Array.from({ length: 5 }, (_, index) => ({
      _id: new ObjectId(), userId, code: `CAR-${index}`, type: "Car", imageData: largeImage,
      imageCrop: { x: 0.15, y: 0.85, zoom: 2.25 }
    }));
    find.mockReturnValue({ toArray: async () => rows } as ReturnType<typeof collection.find>);
    const response = await fetch(baseUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("transfer-encoding")).toBe("chunked");
    expect(response.headers.get("content-length")).toBeNull();
    const body = await response.text();
    expect(Buffer.byteLength(body)).toBeGreaterThan(32 * 1024 * 1024);
    expect(JSON.parse(body)).toEqual(rows.map(({ _id, ...row }) => ({ ...row, id: _id.toHexString() })));
    expect(find).toHaveBeenCalledWith({ userId, archived: { $ne: true } });
  });

  it("returns an empty JSON array when there are no items", async () => {
    find.mockReturnValue({ toArray: async () => [] } as ReturnType<typeof collection.find>);
    const response = await fetch(baseUrl);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("returns database failures before starting the stream", async () => {
    find.mockReturnValue({ toArray: async () => { throw new Error("Database unavailable"); } } as ReturnType<typeof collection.find>);
    const response = await fetch(baseUrl);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Database unavailable" });
  });

  it("persists crop and zoom alongside the original image and returns them on reload", async () => {
    const imageCrop = { x: 0.15, y: 0.85, zoom: 2.25 };
    const response = await save("POST", { imageData: image, imageCrop });
    expect(response.status).toBe(201);
    expect(insertOne).toHaveBeenCalledWith(expect.objectContaining({ imageData: image, imageCrop, userId }));
    expect((await response.json()).imageCrop).toEqual(imageCrop);
    find.mockReturnValue({ toArray: async () => [{ _id: id, code: "CAR", type: "Car", imageData: image, imageCrop }] } as ReturnType<typeof collection.find>);
    const reloaded = (await (await fetch(baseUrl)).json())[0];
    expect(reloaded.imageCrop).toEqual(imageCrop);
    expect(reloaded.imageData).toBe(image);
  });

  it("updates framing without replacing the uploaded image or legacy URL", async () => {
    const imageCrop = { x: 1, y: 0, zoom: 3 };
    expect((await save("PUT", { imageCrop })).status).toBe(200);
    expect(updateOne).toHaveBeenCalledWith({ _id: id, userId }, {
      $set: { code: "CAR", type: "Car", status: "", imageCrop }
    });
  });

  it.each(["POST", "PUT"] as const)("rejects invalid crop settings on %s before writing", async (method) => {
    expect((await save(method, { imageCrop: { x: 0.5, y: 0.5, zoom: 4 } })).status).toBe(400);
    expect(insertOne).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("keeps the stored image unchanged when no image fields are submitted", async () => {
    expect((await save("PUT", { name: "Updated" })).status).toBe(200);
    expect(updateOne).toHaveBeenCalledWith({ _id: id, userId }, { $set: { code: "CAR", type: "Car", name: "Updated", status: "" } });
  });

  it("removes both uploaded and legacy images explicitly", async () => {
    expect((await save("PUT", { imageData: "", imageUrl: "" })).status).toBe(200);
    expect(updateOne).toHaveBeenCalledWith({ _id: id, userId }, { $set: expect.objectContaining({ imageData: "", imageUrl: "" }) });
  });

  it("rejects invalid images before writing to MongoDB", async () => {
    expect((await save("POST", { imageData: "data:text/html;base64,PHNjcmlwdD4=" })).status).toBe(400);
    expect(insertOne).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });
});
