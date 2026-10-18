import { Router } from "express";
import { z } from "zod";
import { MachineSchema } from "@maintenance/shared";
import { getDb } from "../db/mongo.js";
import { oid, serialize } from "../db/helpers.js";

export const machinesRouter = Router();

const ReorderMachinesSchema = z.object({
  machineIds: z.array(z.string().regex(/^[\da-f]{24}$/i)),
  shopId: z.string().regex(/^shop-\d+$/).default("shop-1")
});

machinesRouter.post("/reorder", async (req, res, next) => {
  try {
    const { machineIds, shopId } = ReorderMachinesSchema.parse(req.body);
    if (new Set(machineIds).size !== machineIds.length) {
      res.status(400).json({ error: "Machine order cannot contain duplicates." });
      return;
    }

    const userId: string = res.locals.user.id;
    const machines = (await getDb()).collection("machines");
    const ownedMachines = await machines.find({ userId, archived: { $ne: true } }).project<{ _id: { toString(): string }; shopId?: string }>({ _id: 1, shopId: 1 }).toArray();
    const shopMachines = ownedMachines.filter((machine) => (machine.shopId ?? "shop-1") === shopId);
    const ownedIds = new Set(shopMachines.map(({ _id }) => _id.toString()));
    if (machineIds.length !== ownedIds.size || machineIds.some((id) => !ownedIds.has(id))) {
      res.status(400).json({ error: "Machine order must include all items in this shop." });
      return;
    }
    if (machineIds.length === 0) {
      res.json({ updated: 0 });
      return;
    }

    const result = await machines.bulkWrite(machineIds.map((id, shopOrder) => ({
      updateOne: {
        filter: { _id: oid(id), userId },
        update: { $set: { shopOrder } }
      }
    })));
    if (result.matchedCount !== machineIds.length) {
      res.status(409).json({ error: "Your machines changed while saving their order. Reload and try again." });
      return;
    }
    res.json({ updated: result.matchedCount });
  } catch (error) { next(error); }
});

machinesRouter.get("/archived", async (_req, res, next) => {
  try {
    const rows = await (await getDb()).collection("machines")
      .find({ userId: res.locals.user.id, archived: true })
      .project<{ _id: { toString(): string }; code?: string; name?: string; shopId?: string }>({ _id: 1, code: 1, name: 1, shopId: 1 })
      .toArray();
    res.json(rows.map(({ _id, code, name, shopId }) => ({ id: _id.toString(), code: code ?? "", name, shopId: shopId ?? "shop-1" })));
  } catch (error) { next(error); }
});

machinesRouter.patch("/:id/archive", async (req, res, next) => {
  try {
    const machines = (await getDb()).collection("machines");
    const result = await machines.updateOne(
      { _id: oid(req.params.id), userId: res.locals.user.id },
      { $set: { archived: true } }
    );
    if (!result.matchedCount) { res.status(404).json({ error: "Item not found." }); return; }
    res.status(204).end();
  } catch (error) { next(error); }
});

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
