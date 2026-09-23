import { MongoClient, type Db } from "mongodb";
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
  connection = (async () => {
    client = new MongoClient(uri);
    await client.connect();
    database = client.db(process.env.MONGODB_DB ?? "maintenance");
    const machines = database.collection("machines");
    await Promise.all([
      machines.updateMany({ spec: { $exists: true }, spec1: { $exists: false } }, { $rename: { spec: "spec1" } }),
      machines.updateMany({ status: "active" }, { $set: { status: "Active" } }),
      machines.updateMany({ status: "pending" }, { $set: { status: "Pending" } }),
      machines.updateMany({ status: "sold" }, { $set: { status: "Sold" } }),
      machines.updateMany({}, { $unset: { startingOdometer: "", legacyCode: "" } })
    ]);
    return database;
  })();
  try { return await connection; } catch (error) { connection = undefined; throw error; }
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = undefined;
  database = undefined;
  connection = undefined;
}