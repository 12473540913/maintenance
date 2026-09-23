import { Router } from "express";
import { MachineSchema } from "@maintenance/shared";
import { getDb } from "../db/mongo.js";
import { oid, serialize } from "../db/helpers.js";

export const crudRouter = Router();

for (const collectionName of ["machines", "rules", "taskDefinitions", "completions"] as const) {
  crudRouter.get(`/${collectionName}`, async (_req, res, next) => {
    try { const rows = await (await getDb()).collection(collectionName).find().toArray(); res.json(rows.map((row) => serialize(row))); } catch (error) { next(error); }
  });
  crudRouter.post(`/${collectionName}`, async (req, res, next) => {
    try { const body = collectionName === "machines" ? MachineSchema.parse(req.body) : req.body; const result = await (await getDb()).collection(collectionName).insertOne(body); res.status(201).json({ ...body, id: result.insertedId.toString() }); } catch (error) { next(error); }
  });
  crudRouter.put(`/${collectionName}/:id`, async (req, res, next) => {
    try { const body = collectionName === "machines" ? MachineSchema.omit({ id: true }).parse(req.body) : req.body; await (await getDb()).collection(collectionName).updateOne({ _id: oid(req.params.id) }, { $set: body }); res.json({ ...body, id: req.params.id }); } catch (error) { next(error); }
  });
  crudRouter.delete(`/${collectionName}/:id`, async (req, res, next) => {
    try { await (await getDb()).collection(collectionName).deleteOne({ _id: oid(req.params.id) }); res.status(204).end(); } catch (error) { next(error); }
  });
}
