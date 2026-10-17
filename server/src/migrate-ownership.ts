import { MongoClient, ObjectId, type ClientSession, type Db, type Document } from "mongodb";
import { parseArgs } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";

const legacyCollections = ["machines", "rules", "taskDefinitions", "completions", "validationValues", "taskLedgers"] as const;

export async function planOwnership(db: Db, ownerId: string, ownerEmail: string, session?: ClientSession) {
  if (!/^[a-f\d]{24}$/i.test(ownerId)) throw new Error("Owner ID must be a 24-character ObjectId.");
  const owner = await db.collection("users").findOne({ _id: new ObjectId(ownerId), email: ownerEmail }, { session });
  if (!owner) throw new Error("Owner ID and email do not match an existing user in the selected database.");

  const machines = await db.collection("machines").find({}, { session }).toArray();
  const owners = new Map(machines.map((machine) => [machine._id.toString(), machine.userId ?? ownerId]));
  const ledgers = await db.collection("taskLedgers").find({}, { session }).toArray();
  const ledgerKeys = new Set<string>();
  for (const ledger of ledgers) {
    const machineOwner = owners.get(ledger.machineId);
    if (!machineOwner) throw new Error(`Ledger ${ledger._id} has no matching machine. Resolve it before migrating.`);
    const ledgerOwner = ledger.userId ?? ownerId;
    if (ledgerOwner !== machineOwner) {
      throw new Error(`Ledger ${ledger._id} belongs to a different user than machine ${ledger.machineId}. Export and reconcile it before migrating; no data was changed.`);
    }
    const key = `${ledgerOwner}:${ledger.machineId}`;
    if (ledgerKeys.has(key)) throw new Error(`Multiple ledgers would belong to ${key}. Reconcile them before migrating.`);
    ledgerKeys.add(key);
  }

  const plan: { collection: string; filter: Document; count: number }[] = [];
  for (const collection of legacyCollections) {
    const filter: Document = collection === "validationValues"
      ? { userId: null, core: { $ne: true } }
      : { userId: null };
    plan.push({ collection, filter, count: await db.collection(collection).countDocuments(filter, { session }) });
  }
  return plan;
}

export async function claimOwnership(db: Db, ownerId: string, ownerEmail: string, session: ClientSession) {
  const plan = await planOwnership(db, ownerId, ownerEmail, session);
  for (const { collection, filter } of plan) {
    await db.collection(collection).updateMany(filter, { $set: { userId: ownerId } }, { session });
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      db: { type: "string" },
      "owner-id": { type: "string" },
      "owner-email": { type: "string" },
      apply: { type: "boolean", default: false }
    }
  });
  const uri = process.env.MONGODB_URI;
  if (!uri || !values.db || !values["owner-id"] || !values["owner-email"]) {
    throw new Error("Set MONGODB_URI explicitly and pass --db, --owner-id and --owner-email. Default mode is dry-run; --apply writes data.");
  }
  const ownerId = values["owner-id"].toLowerCase();
  const ownerEmail = values["owner-email"];
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(values.db);
    const plan = await planOwnership(db, ownerId, ownerEmail);
    console.log(`${values.apply ? "APPLY" : "DRY RUN"}: database=${db.databaseName}, owner=${ownerId}`);
    console.table(plan.map(({ collection, count }) => ({ collection, unownedRecords: count })));
    if (!values.apply) {
      console.log("No data changed. Review the counts and take a backup before running with --apply.");
      return;
    }
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await claimOwnership(db, ownerId, ownerEmail, session);
      });
    } finally {
      await session.endSession();
    }
    const remaining = await planOwnership(db, ownerId, ownerEmail);
    if (remaining.some(({ count }) => count !== 0)) throw new Error("Unowned data remains after migration. Keep writes paused and investigate.");
    console.log("Ownership migration committed and verified. Existing owners, users, core values and profiles were preserved.");
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
