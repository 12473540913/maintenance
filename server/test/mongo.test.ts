import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoClient } from "mongodb";
import { closeDb, getDb } from "../src/db/mongo.js";

const { client } = vi.hoisted(() => {
  const collection = {
    createIndex: vi.fn().mockResolvedValue("index"),
    updateMany: vi.fn().mockResolvedValue({})
  };
  const database = { collection: vi.fn(() => collection) };
  return { client: {
    connect: vi.fn().mockResolvedValue(undefined),
    db: vi.fn(() => database),
    close: vi.fn().mockResolvedValue(undefined)
  } };
});

vi.mock("mongodb", () => ({ MongoClient: vi.fn(function () { return client; }) }));

describe("database selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017/maintenance-dev");
    vi.stubEnv("MONGODB_DB", undefined);
  });

  afterEach(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });

  it("uses the URI database instead of hard-coding the production database", async () => {
    await getDb();
    expect(MongoClient).toHaveBeenCalledWith("mongodb://localhost:27017/maintenance-dev");
    expect(client.db).toHaveBeenCalledWith(undefined);
  });

  it("honors an explicit database override", async () => {
    vi.stubEnv("MONGODB_DB", " maintenance-custom ");
    await getDb();
    expect(client.db).toHaveBeenCalledWith("maintenance-custom");
  });

  it("uses the URI database when the override is blank", async () => {
    vi.stubEnv("MONGODB_DB", "  ");
    await getDb();
    expect(client.db).toHaveBeenCalledWith(undefined);
  });
});
