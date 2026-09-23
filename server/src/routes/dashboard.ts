import { Router } from "express";
import type { Completion, Machine, Rule, TaskDefinition } from "@maintenance/shared";
import { getDb } from "../db/mongo.js";
import { serialize } from "../db/helpers.js";
import { calculateDueInstance } from "../services/due.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (_req, res, next) => {
  try {
    const db = await getDb();
    const [machines, rules, tasks, completions] = await Promise.all([
      db.collection("machines").find({ status: "Active" }).toArray(), db.collection("rules").find().toArray(),
      db.collection("taskDefinitions").find().toArray(), db.collection("completions").find().toArray()
    ]);
    const output = tasks.map((rawTask) => {
      const task = serialize(rawTask) as unknown as TaskDefinition;
      const machine = serialize(machines.find((row) => row._id.toString() === task.machineId) ?? {}) as unknown as Machine;
      const rule = serialize(rules.find((row) => row._id.toString() === task.ruleId) ?? {}) as unknown as Rule;
      const completion = completions.filter((row) => row.taskDefinitionId === task.id).sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))[0];
      return calculateDueInstance(task, machine, rule, completion ? serialize(completion) as unknown as Completion : undefined);
    }).filter((item) => item.machine.id && item.rule.id);
    res.json(output);
  } catch (error) { next(error); }
});
