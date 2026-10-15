import express from "express";
import { MachineImageSchema, MAX_IMAGE_BYTES } from "@maintenance/shared";
import { MongoClient, ObjectId } from "mongodb";
import type { Server } from "node:http";
import { ZodError } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../src/db/mongo.js";
import { crudRouter } from "../src/routes/crud.js";

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
  const database = new MongoClient("mongodb://localhost:27017/maintenance-test").db();
  const collection = database.collection("machines");
  vi.spyOn(database, "collection").mockReturnValue(collection);
  const insertOne = vi.spyOn(collection, "insertOne");
  const updateOne = vi.spyOn(collection, "updateOne");
  const find = vi.spyOn(collection, "find");
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.mocked(getDb).mockResolvedValue(database);
    insertOne.mockResolvedValue({ acknowledged: true, insertedId: id });
    updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null });
    const app = express();
    app.use(express.json({ limit: "8mb" }));
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

  it("inserts image content into MongoDB and returns it on reload", async () => {
    const largeImage = `data:image/png;base64,${Buffer.alloc(150_000).toString("base64")}`;
    const response = await save("POST", { imageData: largeImage });
    expect(response.status).toBe(201);
    expect(insertOne).toHaveBeenCalledWith(expect.objectContaining({ imageData: largeImage }));
    expect((await response.json()).imageData).toBe(largeImage);
    find.mockReturnValue({ toArray: async () => [{ _id: id, code: "CAR", type: "Car", imageData: largeImage }] } as ReturnType<typeof collection.find>);
    expect((await (await fetch(baseUrl)).json())[0].imageData).toBe(largeImage);
  });

  it("replaces an image and clears the legacy URL", async () => {
    expect((await save("PUT", { imageData: image, imageUrl: "" })).status).toBe(200);
    expect(updateOne).toHaveBeenCalledWith({ _id: id }, { $set: expect.objectContaining({ imageData: image, imageUrl: "" }) });
  });

  it("keeps the stored image unchanged when no image fields are submitted", async () => {
    expect((await save("PUT", { name: "Updated" })).status).toBe(200);
    expect(updateOne).toHaveBeenCalledWith({ _id: id }, { $set: { code: "CAR", type: "Car", name: "Updated", status: "" } });
  });

  it("removes both uploaded and legacy images explicitly", async () => {
    expect((await save("PUT", { imageData: "", imageUrl: "" })).status).toBe(200);
    expect(updateOne).toHaveBeenCalledWith({ _id: id }, { $set: expect.objectContaining({ imageData: "", imageUrl: "" }) });
  });

  it("rejects invalid images before writing to MongoDB", async () => {
    expect((await save("POST", { imageData: "data:text/html;base64,PHNjcmlwdD4=" })).status).toBe(400);
    expect(insertOne).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });
});
