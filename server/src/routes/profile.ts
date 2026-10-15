import { Router } from "express";
import { ProfileSchema } from "@maintenance/shared";
import { getDb } from "../db/mongo.js";
import { oid } from "../db/helpers.js";

export const profileRouter = Router();

profileRouter.get("/", async (_req, res, next) => {
  try {
    const db = await getDb();
    const settings = await db.collection("userappsettings").findOne({ userId: res.locals.user.id, appId: "maintenance" });
    const user = await db.collection("users").findOne({ _id: oid(res.locals.user.id) });
    res.json({ username: settings?.profile?.username ?? user?.username ?? "" });
  } catch (error) { next(error); }
});

profileRouter.put("/", async (req, res, next) => {
  try {
    const profile = ProfileSchema.parse(req.body);
    await (await getDb()).collection("userappsettings").updateOne(
      { userId: res.locals.user.id, appId: "maintenance" },
      { $set: { profile } },
      { upsert: true }
    );
    res.json(profile);
  } catch (error) { next(error); }
});
