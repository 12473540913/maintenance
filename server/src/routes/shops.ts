import { Router } from "express";
import { ShopSettingsSchema, type ShopSetting } from "@maintenance/shared";
import { getDb } from "../db/mongo.js";

export const shopsRouter = Router();

const defaultShops: ShopSetting[] = [{ id: "shop-1", enabled: true }];

shopsRouter.get("/", async (_req, res, next) => {
  try {
    const settings = await (await getDb()).collection("userappsettings").findOne({
      userId: res.locals.user.id,
      appId: "maintenance"
    });
    res.json(settings?.shops ?? defaultShops);
  } catch (error) { next(error); }
});

shopsRouter.put("/", async (req, res, next) => {
  try {
    const shops = ShopSettingsSchema.parse(req.body);
    const userId: string = res.locals.user.id;
    const db = await getDb();
    const settingsCollection = db.collection("userappsettings");
    const settings = await settingsCollection.findOne({ userId, appId: "maintenance" });
    const currentShops = (settings?.shops ?? defaultShops) as ShopSetting[];
    const retainedShopIds = new Set(shops.map(({ id }) => id));
    const removedShopIds = currentShops.filter(({ id }) => !retainedShopIds.has(id)).map(({ id }) => id);

    for (const shopId of removedShopIds) {
      const machineFilter = shopId === "shop-1"
        ? { userId, $or: [{ shopId }, { shopId: { $exists: false } }] }
        : { userId, shopId };
      const machineRows = await db.collection("machines").find(machineFilter).toArray();
      const machineIds = machineRows.map((machine) => machine._id.toString());
      if (!machineIds.length) continue;

      const taskRows = await db.collection("taskDefinitions").find({
        userId,
        machineId: { $in: machineIds }
      }).toArray();
      const taskIds = taskRows.map((task) => task._id.toString());
      if (taskIds.length) {
        await db.collection("completions").deleteMany({
          userId,
          taskDefinitionId: { $in: taskIds }
        });
        await db.collection("taskDefinitions").deleteMany({
          userId,
          _id: { $in: taskRows.map((task) => task._id) }
        });
      }
      await db.collection("taskLedgers").deleteMany({ userId, machineId: { $in: machineIds } });
      await db.collection("machines").deleteMany({ userId, _id: { $in: machineRows.map((machine) => machine._id) } });
    }

    await settingsCollection.updateOne(
      { userId, appId: "maintenance" },
      { $set: { shops } },
      { upsert: true }
    );
    res.json(shops);
  } catch (error) { next(error); }
});
