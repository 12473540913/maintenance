import express from "express";
import { MongoClient, ObjectId, type Document } from "mongodb";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../src/db/mongo.js";
import { crudRouter } from "../src/routes/crud.js";
import { machinesRouter } from "../src/routes/machines.js";
import { ledgersRouter } from "../src/routes/ledgers.js";
import { dashboardRouter } from "../src/routes/dashboard.js";
import { validationRouter } from "../src/routes/validation.js";
import { shopsRouter } from "../src/routes/shops.js";
import { claimOwnership, planOwnership } from "../src/migrate-ownership.js";

vi.mock("../src/db/mongo.js", () => ({ getDb: vi.fn() }));

const owner = new ObjectId().toHexString();
const other = new ObjectId().toHexString();
const machineId = new ObjectId();
const ruleId = new ObjectId();
const taskId = new ObjectId();
const completionId = new ObjectId();
const customId = new ObjectId();
const coreId = new ObjectId();
let data: Record<string, Document[]>;
let server: Server;
let baseUrl: string;

function matches(row: Document, filter: Document): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some((branch: Document) => matches(row, branch));
    if (value instanceof ObjectId) return row[key]?.toString() === value.toHexString();
    if (value && typeof value === "object") {
      if ("$in" in value) return value.$in.includes(row[key]);
      if ("$ne" in value) return row[key] !== value.$ne;
      if ("$exists" in value) return value.$exists ? key in row : !(key in row);
      throw new Error(`Unsupported test filter: ${key}`);
    }
    return value === null ? row[key] == null : row[key] === value;
  });
}

beforeEach(async () => {
  data = {
    users: [{ _id: new ObjectId(owner), email: "owner@example.test" }, { _id: new ObjectId(other), email: "other@example.test" }],
    machines: [{ _id: machineId, userId: owner, code: "CAR", type: "Car", status: "Active" }],
    rules: [{ _id: ruleId, userId: owner, name: "Oil", kind: "mileage", mileageInterval: 5000 }],
    taskDefinitions: [{ _id: taskId, userId: owner, machineId: machineId.toHexString(), ruleId: ruleId.toHexString(), name: "Oil", category: "Engine" }],
    completions: [{ _id: completionId, userId: owner, taskDefinitionId: taskId.toHexString(), completedAt: "2026-01-01" }],
    taskLedgers: [{ _id: new ObjectId(), userId: owner, machineId: machineId.toHexString(), sections: [] }],
    validationValues: [
      { _id: customId, userId: owner, category: "make", value: "Custom", core: false },
      { _id: coreId, category: "type", value: "Car", core: true }
    ],
    userappsettings: []
  };
  const db = new MongoClient("mongodb://localhost:27017/ownership-test").db();
  const collections = new Map(Object.keys(data).map((name) => [name, db.collection(name)]));
  for (const [name, collection] of collections) {
    const find = collection.find.bind(collection);
    vi.spyOn(collection, "find").mockImplementation((filter = {}, options) => {
      const cursor = find(filter, options);
      vi.spyOn(cursor, "toArray").mockImplementation(async () => data[name].filter((row) => matches(row, filter)));
      const sort = cursor.sort.bind(cursor);
      vi.spyOn(cursor, "sort").mockImplementation((...args) => { sort(...args); return cursor; });
      return cursor;
    });
    vi.spyOn(collection, "findOne").mockImplementation(async (filter) => data[name].find((row) => matches(row, filter)) ?? null);
    vi.spyOn(collection, "countDocuments").mockImplementation(async (filter = {}) => data[name].filter((row) => matches(row, filter)).length);
    vi.spyOn(collection, "distinct").mockImplementation(async (key, filter = {}) => data[name].filter((row) => matches(row, filter)).map((row) => row[key]));
    vi.spyOn(collection, "insertOne").mockImplementation(async (row) => {
      const _id = new ObjectId();
      data[name].push({ ...row, _id });
      return { acknowledged: true, insertedId: _id };
    });
    vi.spyOn(collection, "updateOne").mockImplementation(async (filter, update, options) => {
      let row = data[name].find((row) => matches(row, filter));
      const matchedCount = row ? 1 : 0;
      if (!row && options?.upsert) {
        row = { ...filter, _id: new ObjectId() };
        data[name].push(row);
      }
      if (row && "$set" in update) Object.assign(row, update.$set);
      return { acknowledged: true, matchedCount, modifiedCount: matchedCount, upsertedCount: matchedCount ? 0 : row ? 1 : 0, upsertedId: null };
    });
    vi.spyOn(collection, "updateMany").mockImplementation(async (filter, update) => {
      const rows = data[name].filter((row) => matches(row, filter));
      if ("$set" in update) rows.forEach((row) => Object.assign(row, update.$set));
      return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length, upsertedCount: 0, upsertedId: null };
    });
    vi.spyOn(collection, "bulkWrite").mockImplementation(async (operations) => {
      let matchedCount = 0;
      for (const operation of operations) {
        if ("updateOne" in operation) {
          const row = data[name].find((row) => matches(row, operation.updateOne.filter));
          if (row && "$set" in operation.updateOne.update) {
            Object.assign(row, operation.updateOne.update.$set);
            matchedCount += 1;
          }
        }
      }
      return {
        acknowledged: true, insertedCount: 0, matchedCount, modifiedCount: matchedCount,
        deletedCount: 0, upsertedCount: 0, insertedIds: {}, upsertedIds: {}
      } as Awaited<ReturnType<typeof collection.bulkWrite>>;
    });
    vi.spyOn(collection, "deleteOne").mockImplementation(async (filter) => {
      const index = data[name].findIndex((row) => matches(row, filter));
      if (index !== -1) data[name].splice(index, 1);
      return { acknowledged: true, deletedCount: index === -1 ? 0 : 1 };
    });
    vi.spyOn(collection, "deleteMany").mockImplementation(async (filter) => {
      const deleted = data[name].filter((row) => matches(row, filter));
      data[name] = data[name].filter((row) => !matches(row, filter));
      return { acknowledged: true, deletedCount: deleted.length };
    });
    vi.spyOn(collection, "findOneAndUpdate").mockImplementation(async (filter, update) => {
      const row = data[name].find((row) => matches(row, filter));
      if (row && "$set" in update) Object.assign(row, update.$set);
      return row ?? null;
    });
  }
  vi.spyOn(db, "collection").mockImplementation((name) => {
    const collection = collections.get(name);
    if (!collection) throw new Error(`Unexpected collection: ${name}`);
    return collection;
  });
  vi.mocked(getDb).mockResolvedValue(db);
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { res.locals.user = { id: req.headers["x-user"] === owner ? owner : other }; next(); });
  app.use("/api/task-ledgers", ledgersRouter);
  app.use("/api/validation-values", validationRouter);
  app.use("/api/shops", shopsRouter);
  app.use("/api", crudRouter);
  app.use("/api/machines", machinesRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: error.message }));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address");
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  vi.restoreAllMocks();
});

function request(route: string, user = other, method = "GET", body?: unknown) {
  return fetch(`${baseUrl}/${route}`, {
    method, headers: { "Content-Type": "application/json", "x-user": user },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

describe("user-owned API data", () => {
  it.each(["machines", "rules", "taskDefinitions", "completions", "task-ledgers", "dashboard"])("isolates %s lists", async (route) => {
    expect(await (await request(route)).json()).toEqual([]);
    expect((await (await request(route, owner)).json()).length).toBe(1);
  });

  it.each([
    ["machines", machineId, { code: "CAR", type: "Car" }],
    ["rules", ruleId, { name: "Changed", kind: "special" }],
    ["taskDefinitions", taskId, { machineId: machineId.toHexString(), ruleId: ruleId.toHexString(), name: "Changed" }],
    ["completions", completionId, { taskDefinitionId: taskId.toHexString(), completedAt: "2026-01-01" }]
  ])("rejects another user's updates and deletes to %s", async (route, id, body) => {
    const original = JSON.stringify(data[route]);
    expect((await request(`${route}/${id}`, other, "PUT", body)).status).toBe(404);
    expect((await request(`${route}/${id}`, other, "DELETE")).status).toBe(404);
    expect(JSON.stringify(data[route])).toBe(original);
    expect((await request(`${route}/${id}`, owner, "PUT", body)).status).toBe(200);
    expect((await request(`${route}/${id}`, owner, "DELETE")).status).toBe(204);
  });

  it("assigns ownership server-side and strips submitted database fields", async () => {
    const response = await request("machines", other, "POST", { code: "NEW", type: "Car", userId: owner, _id: machineId });
    expect(response.status).toBe(201);
    const created = data.machines[1];
    expect(created.userId).toBe(other);
    expect(created._id).not.toEqual(machineId);
    expect((await (await request("machines")).json()).length).toBe(1);
  });

  it("does not let an update transfer ownership", async () => {
    expect((await request(`machines/${machineId}`, owner, "PUT", { code: "CAR", type: "Car", userId: other })).status).toBe(200);
    expect(data.machines[0].userId).toBe(owner);
  });

  it.each([
    ["rules", { name: "New rule", kind: "special" }],
    ["taskDefinitions", { machineId: machineId.toHexString(), ruleId: ruleId.toHexString(), name: "New task" }],
    ["completions", { taskDefinitionId: taskId.toHexString(), completedAt: "2026-01-02" }]
  ])("supports owned %s creation without trusting submitted userId", async (route, body) => {
    expect((await request(route, owner, "POST", { ...body, userId: other })).status).toBe(201);
    expect(data[route][1].userId).toBe(owner);
    expect(await (await request(route)).json()).toEqual([]);
  });

  it("rejects task and completion references to another user's records", async () => {
    expect((await request("taskDefinitions", other, "POST", { machineId: machineId.toHexString(), ruleId: ruleId.toHexString(), name: "Foreign" })).status).toBe(404);
    expect((await request("completions", other, "POST", { taskDefinitionId: taskId.toHexString(), completedAt: "2026-01-01" })).status).toBe(404);
    data.machines[0].userId = other;
    expect((await request("taskDefinitions", other, "POST", { machineId: machineId.toHexString(), ruleId: ruleId.toHexString(), name: "Foreign rule" })).status).toBe(404);
  });

  it("scopes odometer and ledger writes to the machine owner", async () => {
    expect((await request(`machines/${machineId}/odometer`, other, "PATCH", { currentOdometer: 10 })).status).toBe(404);
    expect(data.machines[0].currentOdometer).toBeUndefined();
    expect((await request(`machines/${machineId}/odometer`, owner, "PATCH", { currentOdometer: 10 })).status).toBe(200);
    expect(data.machines[0].currentOdometer).toBe(10);
    expect((await request(`task-ledgers/${machineId}`, other, "PUT", { sections: [] })).status).toBe(404);
    expect((await request(`task-ledgers/${machineId}`, owner, "PUT", { sections: [] })).status).toBe(200);
  });

  it("archives only owned machines and hides archived items from lists and dashboard", async () => {
    expect((await request(`machines/${machineId}/archive`, other, "PATCH")).status).toBe(404);
    expect(data.machines[0].archived).toBeUndefined();
    expect((await request(`machines/${machineId}/archive`, owner, "PATCH")).status).toBe(204);
    expect(data.machines[0].archived).toBe(true);
    expect(await (await request("machines", owner)).json()).toEqual([]);
    expect(await (await request("dashboard", owner)).json()).toEqual([]);
    expect(data.machines).toHaveLength(1);
    expect(await (await request("machines/archived", other)).json()).toEqual([]);
    expect(await (await request("machines/archived", owner)).json()).toEqual([{ id: machineId.toHexString(), code: "CAR", shopId: "shop-1" }]);
  });

  it.each([undefined, "shop-2"])("reinstates archived items in their original shop (%s) with all their data preserved", async (shopId) => {
    Object.assign(data.machines[0], {
      ...(shopId ? { shopId } : {}), extra: true, shopOrder: 3,
      gallery: [{ imageId: "0123456789abcdef01234567" }], currentOdometer: "1234"
    });
    const original = JSON.stringify(data);
    expect((await request(`machines/${machineId}/archive`, owner, "PATCH")).status).toBe(204);
    const archived = JSON.stringify(data);
    expect((await request(`machines/${machineId}/reinstate`, other, "PATCH")).status).toBe(404);
    expect(JSON.stringify(data)).toBe(archived);
    expect((await request(`machines/${machineId}/reinstate`, owner, "PATCH")).status).toBe(204);
    expect(data.machines[0].archived).toBe(false);
    const { archived: _archived, ...restored } = data.machines[0];
    expect(JSON.stringify({ ...data, machines: [restored] })).toBe(original);
    expect(await (await request("machines/archived", owner)).json()).toEqual([]);
    expect(await (await request("machines", owner)).json()).toMatchObject([{ id: machineId.toHexString(), extra: true, shopOrder: 3 }]);
    expect(await (await request("dashboard", owner)).json()).not.toEqual([]);
    expect((await request(`machines/${machineId}/reinstate`, owner, "PATCH")).status).toBe(404);
  });

  it("permanently deletes archived items only for their owner and cannot reinstate deleted items", async () => {
    expect((await request(`machines/${machineId}/archive`, owner, "PATCH")).status).toBe(204);
    expect((await request(`machines/${machineId}`, other, "DELETE")).status).toBe(404);
    expect(data.machines).toHaveLength(1);
    expect((await request(`machines/${machineId}`, owner, "DELETE")).status).toBe(204);
    expect(data.machines).toEqual([]);
    expect(await (await request("machines/archived", owner)).json()).toEqual([]);
    expect((await request(`machines/${machineId}/reinstate`, owner, "PATCH")).status).toBe(404);
  });

  it("persists a complete, unique order for only the requesting user's machines", async () => {
    const secondMachineId = new ObjectId();
    data.machines.push({ _id: secondMachineId, userId: owner, code: "BIKE", type: "Motorcycle" });
    data.machines.push({ _id: new ObjectId(), userId: owner, code: "ARCHIVED", type: "Car", archived: true });
    const machineIds = [secondMachineId.toHexString(), machineId.toHexString()];

    expect((await request("machines/reorder", other, "POST", { machineIds })).status).toBe(400);
    expect((await request("machines/reorder", owner, "POST", { machineIds: [machineIds[0], machineIds[0]] })).status).toBe(400);
    expect((await request("machines/reorder", owner, "POST", { machineIds: [machineIds[0]] })).status).toBe(400);
    expect((await request("machines/reorder", owner, "POST", { machineIds })).status).toBe(200);
    expect(data.machines.find((row) => row._id === secondMachineId)?.shopOrder).toBe(0);
    expect(data.machines.find((row) => row._id === machineId)?.shopOrder).toBe(1);
  });

  it("reorders items independently within each shop", async () => {
    const secondMachineId = new ObjectId();
    data.machines.push({ _id: secondMachineId, userId: owner, code: "BIKE", type: "Motorcycle", shopId: "shop-2" });
    expect((await request("machines/reorder", owner, "POST", {
      machineIds: [secondMachineId.toHexString()],
      shopId: "shop-2"
    })).status).toBe(200);
    expect(data.machines.find((row) => row._id === secondMachineId)?.shopOrder).toBe(0);
    expect(data.machines.find((row) => row._id === machineId)?.shopOrder).toBeUndefined();
  });

  it("persists shop settings per user and supplies the default primary shop", async () => {
    expect(await (await request("shops", owner)).json()).toEqual([{ id: "shop-1", enabled: true }]);
    const shops = [{ id: "shop-1", name: "Main garage", enabled: true }, { id: "shop-2", name: "Workshop", enabled: false }];
    expect((await request("shops", owner, "PUT", shops)).status).toBe(200);
    expect(await (await request("shops", owner)).json()).toEqual(shops);
    expect(await (await request("shops", other)).json()).toEqual([{ id: "shop-1", enabled: true }]);
    expect((await request("shops", owner, "PUT", [{ id: "invalid", enabled: true }])).status).not.toBe(200);
    expect((await request("shops", owner, "PUT", [{ id: "shop-1", name: " ", enabled: true }])).status).not.toBe(200);
    expect((await request("shops", owner, "PUT", shops.map((shop) => ({ ...shop, enabled: false })))).status).not.toBe(200);
  });

  it("deletes a removed shop's machines, tasks, ledgers, and completion history", async () => {
    const secondMachineId = new ObjectId();
    const secondTaskId = new ObjectId();
    data.machines.push({ _id: secondMachineId, userId: owner, shopId: "shop-2", code: "BIKE", type: "Motorcycle" });
    data.taskDefinitions.push({ _id: secondTaskId, userId: owner, machineId: secondMachineId.toHexString(), ruleId: ruleId.toHexString(), name: "Tune-up" });
    data.completions.push({ _id: new ObjectId(), userId: owner, taskDefinitionId: secondTaskId.toHexString(), completedAt: "2026-01-01" });
    data.taskLedgers.push({ _id: new ObjectId(), userId: owner, machineId: secondMachineId.toHexString(), sections: [] });
    const shops = [{ id: "shop-1", enabled: true }, { id: "shop-2", enabled: true }];
    expect((await request("shops", owner, "PUT", shops)).status).toBe(200);

    expect((await request("shops", owner, "PUT", [{ id: "shop-1", enabled: true }])).status).toBe(200);
    expect(data.machines.some((row) => row._id === secondMachineId)).toBe(false);
    expect(data.taskDefinitions.some((row) => row._id === secondTaskId)).toBe(false);
    expect(data.completions.some((row) => row.taskDefinitionId === secondTaskId.toHexString())).toBe(false);
    expect(data.taskLedgers.some((row) => row.machineId === secondMachineId.toHexString())).toBe(false);
  });

  it("persists extras per shop and preserves extra items when the section is disabled", async () => {
    const shops = [
      { id: "shop-1", enabled: true, extras: true },
      { id: "shop-2", enabled: true, extras: false }
    ];
    expect((await request("shops", owner, "PUT", shops)).status).toBe(200);
    expect(await (await request("shops", owner)).json()).toEqual(shops);
    const created = await request("machines", owner, "POST", { code: "TOOLS", type: "Tool", shopId: "shop-1", extra: true });
    expect(created.status).toBe(201);
    const item = await created.json();
    expect(item.extra).toBe(true);
    expect((await request(`machines/${item.id}`, owner, "PUT", { code: "TOOLS", type: "Tool", extra: true, name: "Extras" })).status).toBe(200);
    expect((await request("shops", owner, "PUT", shops.map((shop) => ({ ...shop, extras: false })))).status).toBe(200);
    const rows = await (await request("machines", owner)).json();
    expect(rows.find((row: { id: string }) => row.id === item.id)).toMatchObject({ extra: true, name: "Extras" });
    expect((await request("machines/reorder", owner, "POST", { machineIds: [item.id, machineId.toHexString()] })).status).toBe(200);
    expect((await request(`machines/${item.id}`, owner, "PUT", { code: "TOOLS", type: "Tool", extra: false })).status).toBe(200);
    expect(data.machines.find((row) => row._id.toString() === item.id)?.extra).toBe(false);
  });

  it("hides old foreign-machine ledgers and unowned legacy data", async () => {
    data.taskLedgers.push({ _id: new ObjectId(), userId: other, machineId: machineId.toHexString(), sections: [] });
    data.machines.push({ _id: new ObjectId(), code: "LEGACY", type: "Car" });
    expect(await (await request("task-ledgers")).json()).toEqual([]);
    expect(await (await request("machines")).json()).toEqual([]);
    expect((await (await request("machines", owner)).json()).length).toBe(1);
  });

  it("shares core values but isolates custom values and duplicate checks", async () => {
    expect((await (await request("validation-values")).json()).map((row: Document) => row.value)).toEqual(["Car"]);
    expect((await request(`validation-values/${customId}`, other, "DELETE")).status).toBe(404);
    expect((await request(`validation-values/${coreId}`, other, "DELETE")).status).toBe(403);
    expect((await request("validation-values", other, "POST", { category: "type", value: "Car" })).status).toBe(409);
    expect((await request("validation-values", other, "POST", { category: "make", value: "Custom", userId: owner, core: true })).status).toBe(201);
    expect(data.validationValues[2].userId).toBe(other);
    expect(data.validationValues[2].core).toBe(false);
    expect((await request("validation-values", other, "POST", { category: "make", value: "Custom" })).status).toBe(409);
    expect((await request(`validation-values/${customId}`, owner, "DELETE")).status).toBe(204);
  });
});

describe("legacy ownership migration preflight", () => {
  it("claims legacy records with string user IDs and can be safely rerun", async () => {
    for (const name of ["machines", "rules", "taskDefinitions", "completions", "taskLedgers", "validationValues"]) {
      delete data[name][0].userId;
    }
    data.machines.push({ _id: new ObjectId(), userId: other, code: "OTHER", type: "Car" });
    const originalUsers = JSON.stringify(data.users);
    const client = new MongoClient("mongodb://localhost:27017/ownership-test");
    const session = client.startSession();
    try {
      await claimOwnership(await getDb(), owner, "owner@example.test", session);
      for (const name of ["machines", "rules", "taskDefinitions", "completions", "taskLedgers", "validationValues"]) {
        expect(data[name][0].userId).toBe(owner);
      }
      expect(data.machines[1].userId).toBe(other);
      expect(data.validationValues[1].userId).toBeUndefined();
      expect(JSON.stringify(data.users)).toBe(originalUsers);
      const migrated = JSON.stringify(data);
      await claimOwnership(await getDb(), owner, "owner@example.test", session);
      expect(JSON.stringify(data)).toBe(migrated);
      expect(await (await request("machines")).json()).toHaveLength(1);
      expect(await (await request("machines", owner)).json()).toHaveLength(1);
      expect((await planOwnership(await getDb(), owner, "owner@example.test")).every(({ count }) => count === 0)).toBe(true);
    } finally {
      await session.endSession();
      await client.close();
    }
  });

  it("only plans unowned records, leaving existing owners and core values alone", async () => {
    for (const name of ["machines", "rules", "taskDefinitions", "completions", "taskLedgers", "validationValues"]) {
      delete data[name][0].userId;
    }
    data.machines.push({ _id: new ObjectId(), userId: other });
    const before = JSON.stringify(data);
    const plan = await planOwnership(await getDb(), owner, "owner@example.test");
    expect(plan.map(({ count }) => count)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(JSON.stringify(data)).toBe(before);
  });

  it("is a no-op when all non-core data is already owned", async () => {
    expect((await planOwnership(await getDb(), owner, "owner@example.test")).every(({ count }) => count === 0)).toBe(true);
  });

  it("requires the exact owner ID/email pair in the selected database", async () => {
    await expect(planOwnership(await getDb(), owner, "other@example.test")).rejects.toThrow("do not match");
    await expect(planOwnership(await getDb(), "invalid", "owner@example.test")).rejects.toThrow("ObjectId");
  });

  it("stops for foreign-owned, duplicate or orphan ledgers without changing data", async () => {
    data.taskLedgers[0].userId = other;
    await expect(planOwnership(await getDb(), owner, "owner@example.test")).rejects.toThrow("different user");
    data.taskLedgers[0].userId = owner;
    data.taskLedgers.push({ ...data.taskLedgers[0], _id: new ObjectId(), userId: null });
    await expect(planOwnership(await getDb(), owner, "owner@example.test")).rejects.toThrow("Multiple ledgers");
    data.taskLedgers.pop();
    data.taskLedgers[0].machineId = new ObjectId().toHexString();
    await expect(planOwnership(await getDb(), owner, "owner@example.test")).rejects.toThrow("no matching machine");
  });

  it("does not start ownership writes if preflight finds conflicting ledgers", async () => {
    delete data.machines[0].userId;
    data.taskLedgers[0].userId = other;
    const before = JSON.stringify(data);
    const db = await getDb();
    const client = new MongoClient("mongodb://localhost:27017/ownership-test");
    const session = client.startSession();
    try {
      await expect(claimOwnership(db, owner, "owner@example.test", session)).rejects.toThrow("different user");
      expect(JSON.stringify(data)).toBe(before);
      for (const name of Object.keys(data)) expect(db.collection(name).updateMany).not.toHaveBeenCalled();
    } finally {
      await session.endSession();
      await client.close();
    }
  });
});
