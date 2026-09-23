import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { oid, serialize } from "../db/helpers.js";

export const machinesRouter = Router();

machinesRouter.patch("/:id/odometer", async (req, res, next) => {
  try {
    const { currentOdometer, currentOdometerDate } = req.body;
    await (await getDb()).collection("machines").updateOne({ _id: oid(req.params.id) }, { $set: { currentOdometer, currentOdometerDate } });
    const machine = await (await getDb()).collection("machines").findOne({ _id: oid(req.params.id) });
    res.json(machine ? serialize(machine) : null);
  } catch (error) { next(error); }
});
