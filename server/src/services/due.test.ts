import { describe, expect, it } from "vitest";
import { calculateDueInstance } from "./due.js";
import type { Machine, Rule, TaskDefinition } from "@maintenance/shared";

const machine: Machine = { id: "m1", code: "CAR-1", type: "Auto", make: "Test", currentOdometer: 1000, status: "Active", inServiceDate: "2025-01-01" };
const task: TaskDefinition = { id: "t1", machineId: "m1", name: "Oil change", category: "Engine", ruleId: "r1" };

describe("calculateDueInstance", () => {
  it("marks mileage work overdue after the interval", () => {
    const rule: Rule = { id: "r1", name: "Every 500 miles", kind: "mileage", mileageInterval: 500 };
    expect(calculateDueInstance(task, machine, rule).status).toBe("overdue");
  });
  it("still schedules numeric free-text mileage", () => {
    const rule: Rule = { id: "r1", name: "Every 500 miles", kind: "mileage", mileageInterval: 500 };
    expect(calculateDueInstance(task, { ...machine, currentOdometer: "1000" }, rule).status).toBe("overdue");
  });
  it("does not treat unknown or blank readings as zero", () => {
    const rule: Rule = { id: "r1", name: "Every 1000 miles", kind: "mileage", mileageInterval: 1000 };
    for (const currentOdometer of ["", "unknown", " "]) {
      expect(calculateDueInstance(task, { ...machine, currentOdometer }, rule).milesUntil).toBeUndefined();
    }
  });
  it("does not throw for free-text service dates", () => {
    const rule: Rule = { id: "r1", name: "Annual", kind: "age", yearsInterval: 1 };
    const result = calculateDueInstance(task, { ...machine, inServiceDate: "Last summer" }, rule);
    expect(result.dueDate).toBeUndefined();
    expect(result.status).toBe("unscheduled");
  });
});
