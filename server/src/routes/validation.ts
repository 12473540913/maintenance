import { Router } from "express";
import { ValidationValueSchema } from "@maintenance/shared";
import { getDb } from "../db/mongo.js";
import { oid, serialize } from "../db/helpers.js";

export const validationRouter = Router();

validationRouter.get("/", async (req, res, next) => {
  try {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const core = req.query.core === "false" ? false : req.query.core === "true" ? true : undefined;
    const filter: Record<string, unknown> = {};
    if (category) filter.category = category;
    if (core !== undefined) filter.core = core;
    if (query) filter.value = { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const db = await getDb();
    const rows = await db.collection("validationValues").find(filter).sort({ category: 1, value: 1 }).toArray();
    res.json(rows.map((row) => serialize(row)));
  } catch (error) { next(error); }
});

validationRouter.post("/", async (req, res, next) => {
  try {
    const value = ValidationValueSchema.parse({ ...req.body, core: false });
    const db = await getDb();
    const duplicate = await db.collection("validationValues").findOne({ category: value.category, value: value.value });
    if (duplicate) return res.status(409).json({ error: "That value already exists." });
    const result = await db.collection("validationValues").insertOne(value);
    res.status(201).json({ ...value, id: result.insertedId.toString() });
  } catch (error) { next(error); }
});

validationRouter.delete("/:id", async (req, res, next) => {
  try {
    const db = await getDb();
    const value = await db.collection("validationValues").findOne({ _id: oid(req.params.id) });
    if (!value) return res.status(404).json({ error: "Validation value not found." });
    if (value.core) return res.status(403).json({ error: "Core validation values cannot be removed." });
    await db.collection("validationValues").deleteOne({ _id: value._id });
    res.status(204).end();
  } catch (error) { next(error); }
});
