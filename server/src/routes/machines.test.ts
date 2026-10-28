import express, { type ErrorRequestHandler } from "express";
import type { Server } from "node:http";
import { ObjectId } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { machinesRouter } from "./machines.js";

const db = vi.hoisted(() => ({
  settings: { findOne: vi.fn() },
  machines: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() }
}));
vi.mock("../db/mongo.js", () => ({
  getDb: async () => ({
    collection: (name: string) => {
      if (name === "userappsettings") return db.settings;
      if (name === "machines") return db.machines;
      throw new Error(`Unexpected collection: ${name}`);
    }
  })
}));

const id = "0123456789abcdef01234567";
const machine = {
  _id: new ObjectId(id), userId: "owner", code: "Car", type: "Car",
  shopOrder: 3, gallery: [{ imageId: "abcdef0123456789abcdef01" }], currentOdometer: "1234"
};
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json(), (_req, res, next) => { res.locals.user = { id: "owner" }; next(); });
  app.use("/machines", machinesRouter);
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(400).json({ error: error.message });
  };
  app.use(handleError);
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

beforeEach(() => {
  vi.resetAllMocks();
  db.settings.findOne.mockResolvedValue({ shops: [
    { id: "shop-1", enabled: true }, { id: "shop-2", enabled: true, extras: true },
    { id: "shop-3", enabled: true }, { id: "shop-4", enabled: false }
  ] });
  db.machines.findOne.mockResolvedValue(machine);
  db.machines.findOneAndUpdate.mockResolvedValue({ ...machine, shopId: "shop-2", shopOrder: undefined });
});

describe("reinstating archived machines", () => {
  const reinstate = (machineId = id) => fetch(`${baseUrl}/machines/${machineId}/reinstate`, { method: "PATCH" });

  it("only clears the archive flag on an owned archived item", async () => {
    db.machines.updateOne.mockResolvedValue({ matchedCount: 1 });
    const response = await reinstate();
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(db.machines.updateOne).toHaveBeenCalledWith(
      { _id: new ObjectId(id), userId: "owner", archived: true },
      { $set: { archived: false } }
    );
  });

  it("reports missing, active, or other users' items instead of claiming success", async () => {
    db.machines.updateOne.mockResolvedValue({ matchedCount: 0 });
    const response = await reinstate();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Archived item not found." });
  });

  it("rejects malformed IDs before writing", async () => {
    expect((await reinstate("invalid")).status).toBe(400);
    expect(db.machines.updateOne).not.toHaveBeenCalled();
  });

  it("surfaces database failures", async () => {
    db.machines.updateOne.mockRejectedValue(new Error("Database unavailable"));
    const response = await reinstate();
    expect(response.ok).toBe(false);
    expect(await response.json()).toEqual({ error: "Database unavailable" });
  });
});

const move = (shopId: string) => fetch(`${baseUrl}/machines/${id}/move`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId })
});

describe("moving machines between shops", () => {
  it("moves a legacy shop-1 item with an owner-scoped partial update, preserving its ID and details", async () => {
    const response = await move("shop-2");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id, code: machine.code, shopId: "shop-2", gallery: machine.gallery,
      currentOdometer: "1234"
    });
    expect(db.settings.findOne).toHaveBeenCalledWith({ userId: "owner", appId: "maintenance" });
    expect(db.machines.findOne).toHaveBeenCalledWith({
      _id: new ObjectId(id), userId: "owner", archived: { $ne: true }
    });
    expect(db.machines.findOneAndUpdate).toHaveBeenCalledWith({
      _id: new ObjectId(id), userId: "owner", archived: { $ne: true },
      shopId: { $exists: false }, extra: { $exists: false }
    }, { $set: { shopId: "shop-2" }, $unset: { shopOrder: "" } }, { returnDocument: "after" });
  });

  it("preserves Extras status when moving to a shop with Extras enabled", async () => {
    db.machines.findOne.mockResolvedValue({ ...machine, shopId: "shop-1", extra: true });
    db.machines.findOneAndUpdate.mockResolvedValue({ ...machine, shopId: "shop-2", extra: true });
    expect(await (await move("shop-2")).json()).toMatchObject({ id, shopId: "shop-2", extra: true });
    expect(db.machines.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ shopId: "shop-1", extra: true });
  });

  it("rejects Extras moves to shops without Extras enabled", async () => {
    db.machines.findOne.mockResolvedValue({ ...machine, extra: true });
    const response = await move("shop-3");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Enable Extras in the destination shop before moving this item." });
    expect(db.machines.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each(["shop-4", "shop-99", "invalid"])("rejects disabled, missing, or invalid destinations: %s", async (destination) => {
    expect((await move(destination)).status).toBe(400);
    expect(db.machines.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects dropping back into the source shop, including legacy items", async () => {
    expect((await move("shop-1")).status).toBe(400);
    expect(db.machines.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects missing, archived, or other users' items", async () => {
    db.machines.findOne.mockResolvedValue(null);
    expect((await move("shop-2")).status).toBe(404);
    expect(db.machines.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("reports concurrent changes instead of claiming success", async () => {
    db.machines.findOneAndUpdate.mockResolvedValue(null);
    expect((await move("shop-2")).status).toBe(409);
  });

  it("surfaces database failures", async () => {
    db.machines.findOneAndUpdate.mockRejectedValue(new Error("Database unavailable"));
    const response = await move("shop-2");
    expect(response.ok).toBe(false);
    expect(await response.json()).toEqual({ error: "Database unavailable" });
  });
});
