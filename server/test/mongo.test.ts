import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoClient } from "mongodb";
import dns from "node:dns";
import { closeDb, getDb } from "../src/db/mongo.js";

const { client, collection } = vi.hoisted(() => {
  const collection = {
    createIndex: vi.fn().mockResolvedValue("index"),
    updateMany: vi.fn().mockResolvedValue({})
  };
  const database = { collection: vi.fn(() => collection) };
  return { collection, client: {
    connect: vi.fn().mockResolvedValue(undefined),
    db: vi.fn(() => database),
    close: vi.fn().mockResolvedValue(undefined)
  } };
});

vi.mock("mongodb", () => ({ MongoClient: vi.fn(function () { return client; }) }));
vi.mock("node:dns", () => ({ default: { setServers: vi.fn() } }));

describe("database selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017/maintenance-dev");
    vi.stubEnv("MONGODB_DB", undefined);
    vi.stubEnv("MONGODB_DNS_SERVERS", undefined);
  });

  afterEach(async () => {
    await closeDb();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
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

  it("keeps system DNS when no override is configured", async () => {
    await getDb();
    expect(dns.setServers).not.toHaveBeenCalled();
  });

  it("configures explicit DNS servers before connecting", async () => {
    vi.stubEnv("MONGODB_DNS_SERVERS", " 1.1.1.1, 8.8.8.8 ");
    await getDb();
    expect(dns.setServers).toHaveBeenCalledWith(["1.1.1.1", "8.8.8.8"]);
    expect(vi.mocked(dns.setServers).mock.invocationCallOrder[0])
      .toBeLessThan(client.connect.mock.invocationCallOrder[0]);
  });

  it("keeps system DNS when the override is blank", async () => {
    vi.stubEnv("MONGODB_DNS_SERVERS", "  ");
    await getDb();
    expect(dns.setServers).not.toHaveBeenCalled();
  });

  it("rejects empty DNS entries without starting a connection", async () => {
    vi.stubEnv("MONGODB_DNS_SERVERS", "1.1.1.1,");
    await expect(getDb()).rejects.toThrow("MONGODB_DNS_SERVERS");
    expect(MongoClient).not.toHaveBeenCalled();
  });

  it("surfaces invalid DNS addresses rather than silently ignoring them", async () => {
    vi.stubEnv("MONGODB_DNS_SERVERS", "invalid");
    const error = new Error("Invalid IP address");
    vi.mocked(dns.setServers).mockImplementationOnce(() => { throw error; });
    await expect(getDb()).rejects.toBe(error);
    expect(MongoClient).not.toHaveBeenCalled();
  });

  it("closes a failed connection and allows the next request to retry", async () => {
    const error = new Error("querySrv ECONNREFUSED");
    client.connect.mockRejectedValueOnce(error);
    await expect(getDb()).rejects.toBe(error);
    expect(client.close).toHaveBeenCalledTimes(1);
    await getDb();
    expect(client.connect).toHaveBeenCalledTimes(2);
  });

  it("does not cache a database whose initialization failed", async () => {
    const error = new Error("Index creation failed");
    collection.createIndex.mockRejectedValueOnce(error);
    await expect(getDb()).rejects.toBe(error);
    expect(client.close).toHaveBeenCalledTimes(1);
    await getDb();
    expect(client.connect).toHaveBeenCalledTimes(2);
  });

  it("shares initialization and only caches the fully initialized database", async () => {
    let finishInitialization: (value: string) => void = () => { throw new Error("Initialization not started"); };
    collection.createIndex.mockImplementationOnce(() => new Promise<string>((resolve) => {
      finishInitialization = resolve;
    }));
    const first = getDb();
    await vi.waitFor(() => expect(collection.createIndex).toHaveBeenCalled());
    let secondFinished = false;
    const second = getDb().then((database) => { secondFinished = true; return database; });
    await Promise.resolve();
    expect(secondFinished).toBe(false);
    finishInitialization("index");
    expect(await second).toBe(await first);
    expect(client.connect).toHaveBeenCalledTimes(1);
    await getDb();
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it("reports cleanup failures while preserving the original connection error", async () => {
    const error = new Error("Connection failed");
    const closeError = new Error("Close failed");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    client.connect.mockRejectedValueOnce(error);
    client.close.mockRejectedValueOnce(closeError);
    await expect(getDb()).rejects.toBe(error);
    expect(log).toHaveBeenCalledWith("Failed to close MongoDB client after initialization failure", closeError);
    await getDb();
    expect(client.connect).toHaveBeenCalledTimes(2);
  });
});
