import { Router } from "express";
import { MachineImageSchema } from "@maintenance/shared";
import { z } from "zod";
import { getDb } from "../db/mongo.js";
import { oid } from "../db/helpers.js";

export const imagesRouter = Router();
const imageIdSchema = z.string().regex(/^[\da-f]{24}$/i);

imagesRouter.post("/", async (req, res, next) => {
  try {
    const { data } = z.object({ data: MachineImageSchema }).parse(req.body);
    const images = (await getDb()).collection("images");
    await images.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    const result = await images.insertOne({
      userId: res.locals.user.id,
      data,
      // Unsaved uploads expire; saving an item makes its images permanent.
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    res.status(201).json({ id: result.insertedId.toString() });
  } catch (error) { next(error); }
});

imagesRouter.get("/:id", async (req, res, next) => {
  try {
    const id = imageIdSchema.parse(req.params.id);
    const image = await (await getDb()).collection("images").findOne({ _id: oid(id), userId: res.locals.user.id });
    if (!image) { res.status(404).json({ error: "Image not found." }); return; }
    const data = MachineImageSchema.parse(image.data);
    const separator = data.indexOf(",");
    res.set("Cache-Control", "private, max-age=3600");
    res.set("X-Content-Type-Options", "nosniff");
    res.type(data.slice(5, data.indexOf(";"))).send(Buffer.from(data.slice(separator + 1), "base64"));
  } catch (error) { next(error); }
});
