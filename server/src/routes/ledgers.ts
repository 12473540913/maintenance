import { Router } from "express";
import { numberLedgerRows, TaskLedgerSchema } from "@maintenance/shared";
import { getDb } from "../db/mongo.js";
import { oid } from "../db/helpers.js";

export const ledgersRouter = Router();

ledgersRouter.get("/", async (_req, res, next) => {
  try {
    const db = await getDb();
    const userId: string = res.locals.user.id;
    const machineIds = (await db.collection("machines").distinct("_id", { userId })).map((id) => id.toString());
    const rows = await db.collection("taskLedgers").find({ userId, machineId: { $in: machineIds } }).toArray();
    res.json(rows.map(({ machineId, sections, annualInspectionTasks, annualInspectionSections, annualInspectionInstance }) => ({ machineId, sections, annualInspectionTasks, annualInspectionSections, annualInspectionInstance })));
  } catch (error) { next(error); }
});

ledgersRouter.put("/:machineId", async (req, res, next) => {
  try {
    const ledger = numberLedgerRows(TaskLedgerSchema.parse({ ...req.body, machineId: req.params.machineId }));
    const db = await getDb();
    if (!await db.collection("machines").findOne({ _id: oid(ledger.machineId), userId: res.locals.user.id })) {
      res.status(404).json({ error: "Item not found." });
      return;
    }
    await db.collection("taskLedgers").updateOne(
      { userId: res.locals.user.id, machineId: ledger.machineId },
      { $set: ledger },
      { upsert: true }
    );
    res.json(ledger);
  } catch (error) { next(error); }
});
