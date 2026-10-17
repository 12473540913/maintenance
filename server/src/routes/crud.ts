import { Router } from "express";
import { pipeline } from "node:stream/promises";
import { CompletionSchema, MachineSchema, RuleSchema, TaskDefinitionSchema } from "@maintenance/shared";
import { getDb } from "../db/mongo.js";
import { oid, serialize } from "../db/helpers.js";

export const crudRouter = Router();

const schemas = {
  machines: MachineSchema.omit({ id: true }),
  rules: RuleSchema.omit({ id: true }),
  taskDefinitions: TaskDefinitionSchema.omit({ id: true }),
  completions: CompletionSchema.omit({ id: true })
};

for (const collectionName of ["machines", "rules", "taskDefinitions", "completions"] as const) {
  crudRouter.get(`/${collectionName}`, async (_req, res, next) => {
    try {
      const filter = collectionName === "machines"
        ? { userId: res.locals.user.id, archived: { $ne: true } }
        : { userId: res.locals.user.id };
      const rows = await (await getDb()).collection(collectionName).find(filter).toArray();
      if (collectionName === "machines") {
        // Chunked responses avoid Cloud Run's 32 MiB non-streaming response limit.
        res.type("json");
        await pipeline((async function* () {
          yield "[";
          for (let index = 0; index < rows.length; index++) {
            yield `${index ? "," : ""}${JSON.stringify(serialize(rows[index]))}`;
          }
          yield "]";
        })(), res);
      } else {
        res.json(rows.map((row) => serialize(row)));
      }
    } catch (error) {
      if (res.headersSent || res.destroyed) {
        console.error(`Failed to stream ${collectionName} response`, error);
        res.destroy();
      } else {
        next(error);
      }
    }
  });
  for (const method of ["post", "put"] as const) {
    crudRouter[method](method === "post" ? `/${collectionName}` : `/${collectionName}/:id`, async (req, res, next) => {
      try {
        const body = schemas[collectionName].parse(req.body);
        const userId: string = res.locals.user.id;
        const db = await getDb();
        const references = "machineId" in body
          ? [["machines", body.machineId], ["rules", body.ruleId]]
          : "taskDefinitionId" in body ? [["taskDefinitions", body.taskDefinitionId]] : [];
        for (const [collection, id] of references) {
          if (!await db.collection(collection).findOne({ _id: oid(id), userId })) {
            res.status(404).json({ error: "Related item not found." });
            return;
          }
        }
        if (method === "post") {
          const result = await db.collection(collectionName).insertOne({ ...body, userId });
          res.status(201).json({ ...body, id: result.insertedId.toString() });
        } else {
          if (!("id" in req.params)) throw new Error("Missing item id.");
          const result = await db.collection(collectionName).updateOne({ _id: oid(req.params.id), userId }, { $set: body });
          if (!result.matchedCount) { res.status(404).json({ error: "Item not found." }); return; }
          res.json({ ...body, id: req.params.id });
        }
      } catch (error) { next(error); }
    });
  }
  crudRouter.delete(`/${collectionName}/:id`, async (req, res, next) => {
    try {
      const result = await (await getDb()).collection(collectionName).deleteOne({ _id: oid(req.params.id), userId: res.locals.user.id });
      if (!result.deletedCount) { res.status(404).json({ error: "Item not found." }); return; }
      res.status(204).end();
    } catch (error) { next(error); }
  });
}
