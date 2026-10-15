import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { MongoClient, ObjectId } from "mongodb";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireAuth } from "../src/auth.js";
import { getDb } from "../src/db/mongo.js";

vi.mock("../src/db/mongo.js", () => ({ getDb: vi.fn() }));

describe("API authentication", () => {
  const userId = new ObjectId();
  const findOne = vi.fn();
  const database = new MongoClient("mongodb://localhost:27017/maintenance-dev").db();
  const users = database.collection("users");
  vi.spyOn(database, "collection").mockReturnValue(users);
  vi.spyOn(users, "findOne").mockImplementation(findOne);
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.stubEnv("JWT_SECRET", "maintenance-test-secret");
    vi.stubEnv("AUTH_COOKIE_NAME", "auth_session");
    vi.mocked(getDb).mockResolvedValue(database);
    findOne.mockReset();
    findOne.mockResolvedValue({ _id: userId, email: "dev@example.test", authVersion: 2 });
    const app = express();
    app.use(cookieParser());
    app.get("/api/machines", requireAuth, (_req, res) => res.json([]));
    app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: error.message });
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  function request(audience = "maintenance", secret = "maintenance-test-secret") {
    const token = jwt.sign({ email: "dev@example.test", tokenVersion: 2 }, secret, {
      subject: userId.toHexString(),
      audience,
      issuer: "auth-service",
      expiresIn: "5m"
    });
    return fetch(`${baseUrl}/api/machines`, { headers: { Cookie: `auth_session=${token}` } });
  }

  it("allows a valid maintenance session whose user and authVersion match", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(findOne).toHaveBeenCalledWith({ _id: userId, authVersion: 2 });
  });

  it("rejects a session with no matching local user or authVersion", async () => {
    findOne.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
  });

  it("rejects missing cookies", async () => {
    expect((await fetch(`${baseUrl}/api/machines`)).status).toBe(401);
    expect(findOne).not.toHaveBeenCalled();
  });

  it.each([
    ["another-app", "maintenance-test-secret"],
    ["maintenance", "incorrect-secret"]
  ])("rejects invalid audience/signature without querying users (%s)", async (audience, secret) => {
    expect((await request(audience, secret)).status).toBe(401);
    expect(findOne).not.toHaveBeenCalled();
  });

  it("reports database failures as server errors rather than unauthorized", async () => {
    findOne.mockRejectedValue(new Error("Database unavailable"));
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Database unavailable" });
  });

  it("reports a missing signing secret as a server configuration error", async () => {
    vi.stubEnv("JWT_SECRET", "");
    const response = await request();
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain("Missing JWT_SECRET");
  });
});
