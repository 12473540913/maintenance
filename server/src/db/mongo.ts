import { MongoClient, type Db } from "mongodb";
import dns from "node:dns";
import path from "node:path";
import dotenv from "dotenv";

const envPath = path.resolve(process.cwd(), "../.env");
dotenv.config({
  path: [path.resolve(process.cwd(), "../.env.development"), envPath]
});

let client: MongoClient | undefined;
let database: Db | undefined;
let connection: Promise<Db> | undefined;

export async function getDb(): Promise<Db> {
  if (database) return database;
  if (connection) return connection;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  const dnsServers = process.env.MONGODB_DNS_SERVERS?.trim();
  if (dnsServers) {
    const servers = dnsServers.split(",").map((server) => server.trim());
    if (servers.some((server) => !server)) {
      throw new Error("MONGODB_DNS_SERVERS must be a comma-separated list of DNS server IP addresses");
    }
    dns.setServers(servers);
    console.info("MongoDB DNS override enabled:", servers.join(", "));
  }
  connection = (async () => {
    const pendingClient = new MongoClient(uri);
    try {
      await pendingClient.connect();
      const pendingDatabase = pendingClient.db(process.env.MONGODB_DB?.trim() || undefined);
      const machines = pendingDatabase.collection("machines");
      const users = pendingDatabase.collection("users");
      const userAppBlobs = pendingDatabase.collection("userappblobs");
      const userAppSettings = pendingDatabase.collection("userappsettings");
      await Promise.all([
        users.createIndex({ email: 1 }, { unique: true }),
        users.createIndex({ username: 1 }, { unique: true, sparse: true }),
        userAppBlobs.createIndex({ userId: 1, appId: 1 }, { unique: true }),
        userAppSettings.createIndex({ userId: 1, appId: 1 }, { unique: true }),
        pendingDatabase.collection("taskLedgers").createIndex({ userId: 1, machineId: 1 }, { unique: true }),
        machines.updateMany({ spec: { $exists: true }, spec1: { $exists: false } }, { $rename: { spec: "spec1" } }),
        machines.updateMany({ status: "active" }, { $set: { status: "Active" } }),
        machines.updateMany({ status: "pending" }, { $set: { status: "Pending" } }),
        machines.updateMany({ status: "sold" }, { $set: { status: "Sold" } }),
        machines.updateMany({}, { $unset: { startingOdometer: "", legacyCode: "" } })
      ]);
      client = pendingClient;
      database = pendingDatabase;
      return database;
    } catch (error) {
      try {
        await pendingClient.close();
      } catch (closeError) {
        console.error("Failed to close MongoDB client after initialization failure", closeError);
      }
      throw error;
    }
  })();
  try { return await connection; } catch (error) { connection = undefined; throw error; }
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = undefined;
  database = undefined;
  connection = undefined;
}