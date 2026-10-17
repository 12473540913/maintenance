import { Router } from "express";
import { MachineSchema } from "@maintenance/shared";
import { getDb } from "../db/mongo.js";
import { oid, serialize } from "../db/helpers.js";

export const machinesRouter = Router();

machinesRouter.patch("/:id/odometer", async (req, res, next) => {
  try {
    const body = MachineSchema.pick({ currentOdometer: true, currentOdometerDate: true }).parse(req.body);
    const machines = (await getDb()).collection("machines");
    const machine = await machines.findOneAndUpdate(
      { _id: oid(req.params.id), userId: res.locals.user.id },
      { $set: body },
      { returnDocument: "after" }
    );
    if (!machine) { res.status(404).json({ error: "Item not found." }); return; }
    res.json(serialize(machine));
  } catch (error) { next(error); }
});
