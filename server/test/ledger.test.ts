import { describe, expect, it } from "vitest";
import { MachineSchema, ProfileSchema, TaskLedgerSchema, type TaskDefinition, type TaskLedger } from "@maintenance/shared";
import { initialLedger } from "../../frontend/src/lib/ledger.js";

const tasks: TaskDefinition[] = [
  { id: "t1", machineId: "m1", name: "Change oil", category: "Engine", ruleId: "r1", notes: "Use specified oil" },
  { id: "t2", machineId: "m1", name: "Inspect leaks", category: "Engine", ruleId: "r1" },
  { id: "t3", machineId: "m1", name: "Rotate tires", category: "Wheels", ruleId: "r1" },
  { id: "t4", machineId: "m2", name: "Other item", category: "Engine", ruleId: "r1" }
];

describe("manual task ledgers", () => {
  it("groups existing tasks by item and section without changing their source", () => {
    const ledger = initialLedger("m1", [], tasks);
    expect(ledger.sections.map((section) => section.name)).toEqual(["Engine", "Wheels"]);
    expect(ledger.sections[0].rows.map((row) => row.description)).toEqual(["Change oil — Use specified oil", "Inspect leaks"]);
    expect(tasks[0].name).toBe("Change oil");
  });
  it("includes existing completion history, including zero mileage", () => {
    const ledger = initialLedger("m1", [], tasks, [{ id: "c1", taskDefinitionId: "t1", completedAt: "2026-01-01", odometer: 0, note: "Done" }]);
    expect(ledger.sections[0].rows[0].timeline).toEqual([{ id: "c1", label: "0 mi / 2026-01-01", value: "Done" }]);
  });
  it("keeps deliberately empty saved ledgers empty", () => {
    const saved: TaskLedger = { machineId: "m1", sections: [] };
    expect(initialLedger("m1", [saved], tasks)).toBe(saved);
  });
  it("accepts freely entered labels and timeline values with exact round-trip shape", () => {
    const ledger: TaskLedger = { machineId: "m1", sections: [{ id: "s1", name: "Any section", rows: [{ id: "t1", code: "ENG-1", action: "Inspect", description: "Check everything", timeline: [{ id: "e1", label: "5k / Jul 07", value: "NA" }, { id: "e2", label: "Whenever", value: "Not yet" }] }] }] };
    expect(TaskLedgerSchema.parse(JSON.parse(JSON.stringify(ledger)))).toEqual(ledger);
    expect(TaskLedgerSchema.safeParse({ machineId: "", sections: [] }).success).toBe(false);
  });
});

describe("manual item and profile fields", () => {
  it("accepts free text without dropping numeric legacy data", () => {
    expect(MachineSchema.parse({ code: "CAR", type: "Car", year: "circa 2007", currentOdometer: "unknown", acquiredDate: "Last summer", name: "Rav4", imageUrl: "https://example.com/car.jpg" }).year).toBe("circa 2007");
    expect(MachineSchema.parse({ code: "CAR", type: "Car", year: 2007, currentOdometer: 0 }).currentOdometer).toBe(0);
  });
  it("validates and trims app-specific profile usernames", () => {
    expect(ProfileSchema.parse({ username: "  testuser  " })).toEqual({ username: "testuser" });
    expect(ProfileSchema.safeParse({ username: "  " }).success).toBe(false);
    expect(ProfileSchema.safeParse({ username: "x".repeat(101) }).success).toBe(false);
  });
});
