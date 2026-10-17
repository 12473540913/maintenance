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
    await (await getDb()).collection("userappsettings").updateOne(
      { userId: res.locals.user.id, appId: "maintenance" },
      { $set: { shops } },
      { upsert: true }
    );
    res.json(shops);
  } catch (error) { next(error); }
});
